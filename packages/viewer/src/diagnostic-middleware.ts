import type { ViewerRenderTree } from '@easyink/core'
import type { ViewerDiagnosticEvent } from './types'

export type DiagnosticScope = NonNullable<ViewerDiagnosticEvent['scope']>

export interface SafeRenderOptions {
  scope: DiagnosticScope
  code: string
  nodeId?: string
  placeholderTree: ViewerRenderTree
}

export interface SafeCallOptions {
  scope: DiagnosticScope
  code: string
  nodeId?: string
  onError?: (cause: unknown) => void
}

function serializeCause(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  return err
}

function buildDiagnostic(
  options: SafeRenderOptions | SafeCallOptions,
  err: unknown,
  severity: ViewerDiagnosticEvent['severity'],
  message: string,
): ViewerDiagnosticEvent {
  const event: ViewerDiagnosticEvent = {
    category: options.scope === 'schema' || options.scope === 'datasource' || options.scope === 'condition'
      ? options.scope
      : options.scope === 'print'
        ? 'print'
        : options.scope === 'exporter'
          ? 'exporter'
          : 'viewer',
    severity,
    code: options.code,
    message,
    nodeId: options.nodeId,
    scope: options.scope,
    cause: serializeCause(err),
  }
  return event
}

/**
 * Wraps a synchronous render function with unified error handling.
 * On exception: emits a diagnostic event and returns the fallback sentinel.
 */
export function safeRender<T>(
  fn: () => T,
  options: SafeRenderOptions,
  diagnostics: ViewerDiagnosticEvent[],
): T | ErrorSentinel {
  try {
    return fn()
  }
  catch (err) {
    const message = options.nodeId
      ? `${options.code} for node "${options.nodeId}": ${err instanceof Error ? err.message : String(err)}`
      : `${options.code}: ${err instanceof Error ? err.message : String(err)}`

    diagnostics.push(buildDiagnostic(options, err, 'error', message))

    if ('placeholderTree' in options && options.placeholderTree) {
      return buildErrorSentinel(options.placeholderTree)
    }
    throw err
  }
}

/**
 * Sentinel value used to signal a material render fallback.
 * The safeRender function uses this to communicate a fallback HTML response
 * when the actual render throws. Callers that use safeRender for
 * ViewerRenderOutput should detect this sentinel and return { html: fallbackHtml }.
 */
export interface ErrorSentinel {
  __errorSentinel: true
  tree: ViewerRenderTree
}

function buildErrorSentinel(tree: ViewerRenderTree): ErrorSentinel {
  return { __errorSentinel: true, tree }
}

/** Returns true if the value was produced by safeRender as an error fallback. */
export function isErrorSentinel(value: unknown): value is ErrorSentinel {
  return (
    typeof value === 'object'
    && value !== null
    && (value as ErrorSentinel).__errorSentinel === true
  )
}

/**
 * Wraps an async operation with unified error handling.
 * On exception: emits a diagnostic event and rethrows.
 */
export async function safeCall(
  fn: () => Promise<void>,
  options: SafeCallOptions,
  diagnostics: ViewerDiagnosticEvent[],
): Promise<void> {
  try {
    await fn()
  }
  catch (err) {
    const message = options.nodeId
      ? `${options.code} for node "${options.nodeId}": ${err instanceof Error ? err.message : String(err)}`
      : `${options.code}: ${err instanceof Error ? err.message : String(err)}`

    diagnostics.push(buildDiagnostic(options, err, 'error', message))
    options.onError?.(err)
    throw err
  }
}

/**
 * Emit a diagnostic event without throwing. Used by non-render pipeline stages.
 */
export function emitDiagnostic(
  diagnostics: ViewerDiagnosticEvent[],
  event: ViewerDiagnosticEvent,
): void {
  diagnostics.push(event)
}
