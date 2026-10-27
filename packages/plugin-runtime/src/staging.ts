import type { CapabilityPoint, CleanupError, ContributionOwner, OwnedContribution } from './types'
import { Scope } from './scope'

export class AssemblyError extends Error {
  constructor(
    readonly code: 'duplicate-identity' | 'duplicate-contribution' | 'invalid-material' | 'invalid-declaration' | 'async-setup' | 'closed-registration',
    message: string,
    readonly point?: CapabilityPoint,
    readonly key?: string,
    readonly owners: readonly ContributionOwner[] = [],
  ) {
    super(message)
    this.name = 'AssemblyError'
  }
}

/** Only runtime collectors use this private transaction, not material authors. */
export class Staging {
  readonly scopes: Scope[] = []
  readonly entries: OwnedContribution[] = []
  private readonly identities = new Map<string, Scope>()
  private readonly keys = new Map<CapabilityPoint, Map<string, OwnedContribution>>()
  private readonly localIds = new Map<Scope, Map<string, OwnedContribution>>()
  private readonly localKeys = new Map<Scope, Map<string, OwnedContribution>>()
  private failure?: unknown
  private failed = false
  private closed = false

  constructor(private readonly lateErrors: CleanupError[]) {}

  open(pluginId: string): Scope {
    this.assertOpen()
    if (typeof pluginId !== 'string' || !pluginId)
      return this.reject(new AssemblyError('invalid-declaration', 'Identity must be a nonempty string'))
    const previous = this.identities.get(pluginId)
    const owner = Object.freeze({ pluginId, installationId: crypto.randomUUID(), contributionId: 'scope' })
    if (previous)
      return this.reject(new AssemblyError('duplicate-identity', `Duplicate identity: ${pluginId}`, undefined, pluginId, [previous.owner, owner]))
    const scope = new Scope(owner, 'scope', this.lateErrors)
    this.identities.set(pluginId, scope)
    this.localIds.set(scope, new Map())
    this.localKeys.set(scope, new Map())
    this.scopes.push(scope)
    return scope
  }

  add(scope: Scope, point: CapabilityPoint, key: string, contributionId: string, value: unknown, list = false) {
    this.assertOpen()
    const ids = this.localIds.get(scope)
    const localKeys = this.localKeys.get(scope)
    if (!ids || !localKeys)
      return this.reject(new AssemblyError('invalid-declaration', 'Scope does not belong to this transaction'))
    if (typeof key !== 'string' || !key || typeof contributionId !== 'string' || !contributionId)
      return this.reject(new AssemblyError('invalid-declaration', 'Contribution identity must be a nonempty string', point, key))
    const owner = Object.freeze({ ...scope.owner, contributionId })
    const entry = Object.freeze({ point, key, owner, value })
    const keys = this.keys.get(point) ?? new Map<string, OwnedContribution>()
    const localKey = JSON.stringify([point, key])
    const previous = ids.get(contributionId) ?? localKeys.get(localKey) ?? (list ? undefined : keys.get(key))
    if (previous) {
      return this.reject(new AssemblyError('duplicate-contribution', `Duplicate ${point}: ${key}`, point, key, [previous?.owner ?? owner, owner]))
    }
    ids.set(contributionId, entry)
    localKeys.set(localKey, entry)
    if (!list) {
      keys.set(key, entry)
      this.keys.set(point, keys)
    }
    this.entries.push(entry)
  }

  collect(scope: Scope, setup: () => unknown) {
    try {
      const result = setup()
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        // Async setup is rejected; observe its rejection without awaiting external work.
        void Promise.resolve(result).catch(() => {})
        this.reject(new AssemblyError('async-setup', `Async setup is unsupported: ${scope.owner.pluginId}`))
      }
    }
    catch (cause) {
      if (!this.failed) {
        this.failed = true
        this.failure = cause
      }
    }
  }

  seal() {
    this.closed = true
    this.identities.clear()
    this.keys.clear()
    this.localIds.clear()
    this.localKeys.clear()
    if (this.failed)
      throw this.failure
  }

  clear() {
    this.closed = true
    this.identities.clear()
    this.keys.clear()
    this.localIds.clear()
    this.localKeys.clear()
    this.entries.length = 0
    this.scopes.length = 0
  }

  reject(cause: unknown): never {
    if (!this.failed) {
      this.failed = true
      this.failure = cause
    }
    throw this.failure
  }

  private assertOpen() {
    if (this.closed)
      this.reject(new AssemblyError('closed-registration', 'Registration is closed'))
  }
}
