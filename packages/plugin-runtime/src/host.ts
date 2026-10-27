import type { ResourceContext } from '@easyink/plugin-api'
import type { DesignerCommand } from '@easyink/plugin-api/designer'
import type { LocaleDeclaration } from '@easyink/plugin-api/material'
import type { CapabilityPoint, CleanupError, ContributionOwner, DisposeResult, Host, HostConfig, HostMaterial, HostRegistry, HostState, InitializeConsumer, LocaleSource, OwnedContribution, RuntimeMaterialUI } from './types'
import { LocaleIndex } from './locale'
import { Scope } from './scope'
import { AssemblyError, Staging } from './staging'

export class HostCreationError extends Error {
  constructor(readonly cause: unknown, readonly cleanup: DisposeResult) {
    super('Host creation failed', { cause })
    this.name = 'HostCreationError'
  }
}

export class TaskError extends Error {
  constructor(readonly cause: unknown, readonly cleanup: DisposeResult) {
    super('Managed task failed with cleanup errors', { cause })
    this.name = 'TaskError'
  }
}

function validateMaterial(kind: HostConfig<HostMaterial>['kind'], material: HostMaterial) {
  const model = material?.model
  const implementation = material?.renderer
  if (typeof model?.type !== 'string' || !model.type || typeof model.createDefaultNode !== 'function' || !model.binding
    || !['none', 'ordinary', 'custom', 'data-contract'].includes(model.binding.kind)
    || (implementation !== undefined) === (material.loadRenderer !== undefined)
    || (material.loadRenderer !== undefined && typeof material.loadRenderer !== 'function')) {
    throw new AssemblyError('invalid-material', 'A complete material requires its model and exactly one host renderer or loader', 'material', model?.type)
  }
  if ((model.binding.kind === 'ordinary' && !model.binding.primaryProp)
    || (model.binding.kind === 'data-contract' && !model.binding.contract)) {
    throw new AssemblyError('invalid-material', `Invalid binding: ${model.type}`, 'material', model.type)
  }
  if (implementation === undefined)
    return
  if (kind === 'designer'
    ? typeof implementation !== 'function'
    : !implementation || typeof implementation !== 'object'
      || (!('render' in implementation && typeof implementation.render === 'function') && !('createSession' in implementation && typeof implementation.createSession === 'function'))) {
    throw new AssemblyError('invalid-material', `Invalid ${kind} renderer: ${model.type}`, 'material', model.type)
  }
}

function buildRegistry<M extends HostMaterial>(staging: Staging): { registry: HostRegistry<M>, clear: () => void } {
  let entries = Object.freeze([...staging.entries])
  const materials = new Map(entries.filter(entry => entry.point === 'material').map(entry => [entry.key, entry as OwnedContribution<M>]))
  const commands = new Map(entries.filter(entry => entry.point === 'designer.command').map(entry => [entry.key, entry as OwnedContribution<DesignerCommand<never, unknown>>]))
  const registry: HostRegistry<M> = Object.freeze({
    get materials() { return Object.freeze([...materials.values()]) },
    getMaterial: (type: string) => materials.get(type),
    getCommand: (id: string) => commands.get(id),
    contributions: (point: CapabilityPoint) => Object.freeze(entries.filter(entry => entry.point === point)),
  })
  return {
    registry,
    clear: () => {
      entries = Object.freeze([])
      materials.clear()
      commands.clear()
    },
  }
}

/** Shared kernel: hosts provide consumers, while material authors provide declarations. */
export async function createHost<M extends HostMaterial>(config: HostConfig<M>, initialize?: InitializeConsumer<M>): Promise<Host<M>> {
  const lateErrors: CleanupError[] = []
  const staging = new Staging(lateErrors)
  const consumer = new Scope(Object.freeze({ pluginId: 'host', installationId: crypto.randomUUID(), contributionId: 'consumer' }), 'consumer', lateErrors)
  const locales: LocaleSource[] = []
  let state: HostState = 'initializing'
  let generation = 0
  let disposal: Promise<DisposeResult> | undefined
  let clearRegistry = () => {}
  let locale: LocaleIndex | undefined

  function destroy(): Promise<DisposeResult> {
    if (disposal)
      return disposal
    disposal = Promise.resolve().then(async () => {
      const errors = [...(await consumer.destroy()).errors]
      for (const scope of [...staging.scopes].reverse())
        errors.push(...(await scope.destroy()).errors)
      staging.clear()
      locales.length = 0
      state = 'disposed'
      return Object.freeze({ errors: Object.freeze(errors) })
    })
    state = 'disposing'
    generation++
    // Publish disposal before abort listeners can reenter, then invalidate synchronously.
    consumer.invalidate()
    for (const scope of staging.scopes)
      scope.invalidate()
    clearRegistry()
    locale?.clear()
    return disposal
  }

  function assertActive() {
    if (state !== 'active')
      throw new Error(`Host does not accept work while ${state}`)
  }

  function ownedScope(owner: string | ContributionOwner) {
    const pluginId = typeof owner === 'string' ? `material:${owner}` : owner.pluginId
    const scope = staging.scopes.find(scope => scope.owner.pluginId === pluginId && (typeof owner === 'string' || scope.owner.installationId === owner.installationId))
    if (!scope)
      throw new Error(`Owner is not installed: ${pluginId}`)
    return scope
  }

  function addLocale(scope: Scope, declaration?: LocaleDeclaration) {
    if (declaration)
      locales.push({ owner: Object.freeze({ ...scope.owner, contributionId: 'locale' }), declaration })
  }

  try {
    if (config.kind !== 'designer' && config.kind !== 'viewer')
      throw new AssemblyError('invalid-declaration', 'Unknown host kind')
    if (config.kind === 'viewer' && config.extensions !== undefined)
      throw new AssemblyError('invalid-declaration', 'Viewer cannot install Designer extensions')
    for (const material of config.materials) {
      const scope = staging.open(`material:${material?.model?.type ?? ''}`)
      staging.collect(scope, () => {
        validateMaterial(config.kind, material)
        staging.add(scope, 'material', material.model.type, 'material', material)
        addLocale(scope, material.locale)
        if (config.kind === 'designer' && 'ui' in material && material.ui) {
          const ui = material.ui as RuntimeMaterialUI
          for (const preset of ui.palette ?? [])
            staging.add(scope, 'designer.palette', preset.id, `palette:${preset.id}`, preset, true)
          if (ui.properties)
            staging.add(scope, 'designer.properties', material.model.type, 'properties', ui.properties)
        }
      })
    }
    if (config.kind === 'designer') {
      for (const extension of config.extensions ?? []) {
        const scope = staging.open(extension.id)
        staging.collect(scope, () => {
          if (!extension.id)
            throw new AssemblyError('invalid-declaration', 'Extension identity must be nonempty')
          for (const command of extension.commands ?? []) {
            if (typeof command.handler !== 'function')
              throw new AssemblyError('invalid-declaration', `Invalid command: ${command.id}`)
            staging.add(scope, 'designer.command', command.id, `command:${command.id}`, command)
          }
          for (const [slot, point] of [['toolbar', 'designer.toolbar'], ['contextMenu', 'designer.context-menu'], ['overlays', 'designer.overlay']] as const) {
            for (const item of extension.ui?.[slot] ?? [])
              staging.add(scope, point, item.id, `${slot}:${item.id}`, item, true)
          }
          addLocale(scope, extension.locale)
        })
      }
    }
    // No registry or initialization is available until the final composition passes.
    staging.seal()
    const built = buildRegistry<M>(staging)
    clearRegistry = built.clear
    locale = new LocaleIndex(locales)
    locale.select(config.locale?.code, config.locale?.messages)
    await initialize?.(built.registry, Object.freeze({
      ...consumer.context,
      resources: (owner: string | ContributionOwner) => ownedScope(owner).context,
      t: (key: string) => {
        consumer.context.signal.throwIfAborted()
        return locale!.t(key)
      },
    }))
    state = 'active'
    const host: Host<M> = Object.freeze({
      kind: config.kind,
      get state() { return state },
      get generation() { return generation },
      registry: built.registry,
      get localeDiagnostics() { return locale!.snapshot },
      get lateCleanupErrors() { return Object.freeze([...lateErrors]) },
      t: (key: string) => {
        assertActive()
        return locale!.t(key)
      },
      setLocale: (code?: string, messages?: import('@easyink/plugin-api/material').LocaleTree) => {
        assertActive()
        locale!.select(code, messages)
      },
      resources: (owner: string | ContributionOwner) => {
        assertActive()
        return ownedScope(owner).context
      },
      runTask: async <T>(type: string, acquire: (context: ResourceContext) => Promise<T>, release?: (value: T) => void | Promise<void>) => {
        assertActive()
        const scope = ownedScope(type)
        const task = scope.createTask()
        const hostGeneration = generation
        const scopeGeneration = scope.generation
        const taskGeneration = task.generation
        const current = () => state === 'active' && generation === hostGeneration && scope.active && scope.generation === scopeGeneration && task.active && task.generation === taskGeneration
        let value: T
        try {
          value = await acquire(task.context)
        }
        catch (cause) {
          if (!current())
            return undefined
          const cleanup = await task.destroy()
          if (state !== 'active' || generation !== hostGeneration)
            return undefined
          if (cleanup.errors.length)
            throw new TaskError(cause, cleanup)
          throw cause
        }
        if (!current()) {
          if (release)
            await task.releaseLate(() => release(value))
          return undefined
        }
        if (release)
          task.context.onDispose(() => release(value))
        return value
      },
      destroy,
    })
    return host
  }
  catch (cause) {
    throw new HostCreationError(cause, await destroy())
  }
}
