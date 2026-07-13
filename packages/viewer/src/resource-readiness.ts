import { safeSummarizeThrown } from './safe-thrown'

export type ViewerResourceKind = 'font' | 'asset'

export interface ViewerResource {
  readonly kind: ViewerResourceKind
  readonly value: string
}

export interface ResourcePreparationTerminal {
  readonly state: 'ready' | 'failed'
  readonly message?: string
}

export interface ResourcePreparationDiagnostic {
  readonly code: 'VIEWER_FONT_PREPARE_FAILED' | 'VIEWER_ASSET_PREPARE_FAILED'
  readonly resource: Readonly<ViewerResource>
  readonly message?: string
}

export interface ResourceReadinessResult {
  readonly resourceRevision: number
  readonly diagnostics: readonly Readonly<ResourcePreparationDiagnostic>[]
}

export interface ResourceReadinessCoordinator {
  readonly resourceRevision: number
  readonly prepare: (
    resources: readonly ViewerResource[],
    signal: AbortSignal,
  ) => Promise<ResourceReadinessResult>
}

export interface ResourceReadinessDependencies {
  readonly prepareFont: (
    value: string,
    signal: AbortSignal,
  ) => Promise<ResourcePreparationTerminal>
  readonly prepareAsset: (
    value: string,
    signal: AbortSignal,
  ) => Promise<ResourcePreparationTerminal>
}

interface PreparedOutcome {
  readonly key: string
  readonly resource: Readonly<ViewerResource>
  readonly result: Readonly<ResourcePreparationTerminal>
}

export function createResourceReadinessCoordinator(
  deps: ResourceReadinessDependencies,
): ResourceReadinessCoordinator {
  const terminal = new Map<string, Readonly<ResourcePreparationTerminal>>()
  let resourceRevision = 0

  return Object.freeze({
    get resourceRevision() {
      return resourceRevision
    },
    async prepare(resources: readonly ViewerResource[], signal: AbortSignal): Promise<ResourceReadinessResult> {
      throwIfAborted(signal)
      const unique = normalizeUniqueResources(resources)
      const pending = unique.filter(resource => !terminal.has(resource.key))
      const prepared = await Promise.all(pending.map(async (entry): Promise<PreparedOutcome> => {
        throwIfAborted(signal)
        let result: Readonly<ResourcePreparationTerminal>
        try {
          const candidate = await (entry.resource.kind === 'font'
            ? deps.prepareFont(entry.resource.value, signal)
            : deps.prepareAsset(entry.resource.value, signal))
          throwIfAborted(signal)
          result = normalizeTerminal(candidate)
        }
        catch (cause) {
          throwIfAborted(signal)
          result = Object.freeze({
            state: 'failed',
            message: safeSummarizeThrown(cause).message,
          })
        }
        return { ...entry, result }
      }))

      throwIfAborted(signal)
      for (const outcome of prepared) {
        if (terminal.has(outcome.key))
          continue
        terminal.set(outcome.key, outcome.result)
        resourceRevision++
      }

      const diagnostics: ResourcePreparationDiagnostic[] = []
      for (const entry of unique) {
        const result = terminal.get(entry.key)
        if (result?.state !== 'failed')
          continue
        diagnostics.push(Object.freeze({
          code: entry.resource.kind === 'font'
            ? 'VIEWER_FONT_PREPARE_FAILED'
            : 'VIEWER_ASSET_PREPARE_FAILED',
          resource: entry.resource,
          ...(result.message === undefined ? {} : { message: result.message }),
        }))
      }

      return Object.freeze({
        resourceRevision,
        diagnostics: Object.freeze(diagnostics),
      })
    },
  })
}

function normalizeUniqueResources(resources: unknown): Array<{
  readonly key: string
  readonly resource: Readonly<ViewerResource>
}> {
  if (!Array.isArray(resources))
    throw new Error('VIEWER_RESOURCE_PREPARE_INPUT_INVALID')

  const unique = new Map<string, Readonly<ViewerResource>>()
  try {
    for (const candidate of resources) {
      if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
        throw new Error('invalid resource')
      const kind = readOwnDataProperty(candidate, 'kind')
      const rawValue = readOwnDataProperty(candidate, 'value')
      if ((kind !== 'font' && kind !== 'asset') || typeof rawValue !== 'string')
        throw new Error('invalid resource')
      const value = rawValue.trim()
      if (value.length === 0)
        throw new Error('invalid resource')
      const resource = Object.freeze({ kind, value })
      const key = JSON.stringify([kind, value])
      if (!unique.has(key))
        unique.set(key, resource)
    }
  }
  catch {
    throw new Error('VIEWER_RESOURCE_PREPARE_INPUT_INVALID')
  }

  return [...unique].map(([key, resource]) => ({ key, resource }))
}

function readOwnDataProperty(value: object, key: 'kind' | 'value'): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor))
    throw new Error('invalid resource')
  return descriptor.value
}

function normalizeTerminal(value: unknown): Readonly<ResourcePreparationTerminal> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('VIEWER_RESOURCE_PREPARE_RESULT_INVALID')
  const state = readOwnTerminalProperty(value, 'state')
  const message = readOwnTerminalProperty(value, 'message')
  if ((state !== 'ready' && state !== 'failed')
    || (message !== undefined && typeof message !== 'string')) {
    throw new Error('VIEWER_RESOURCE_PREPARE_RESULT_INVALID')
  }
  return Object.freeze({ state, ...(message === undefined ? {} : { message }) })
}

function readOwnTerminalProperty(value: object, key: 'state' | 'message'): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor)
    return undefined
  if (!('value' in descriptor))
    throw new Error('VIEWER_RESOURCE_PREPARE_RESULT_INVALID')
  return descriptor.value
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted)
    return
  throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}
