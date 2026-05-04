import type { LLMProgressEvent, LLMProvider } from '../llm/types'

/**
 * Hard upper bound on a single tool invocation, regardless of progress.
 * 5 minutes matches the client's `maxTotalTimeout`. Beyond this we treat
 * the LLM call as runaway and abort.
 */
export const TOOL_HARD_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Heartbeat interval used as a fallback when the provider does not stream.
 * Must be < client static `timeout` (60s) so `resetTimeoutOnProgress` keeps
 * the request alive.
 */
const HEARTBEAT_INTERVAL_MS = 15 * 1000

export interface RelayContext {
  /** Progress token sent by the client in `_meta.progressToken`, if any. */
  progressToken: string | number | undefined
  /** Server-side abort signal (request cancelled, transport closed, etc). */
  clientSignal: AbortSignal
  /** Sends a JSON-RPC notification scoped to the current request. */
  sendNotification: (notification: {
    method: 'notifications/progress'
    params: {
      progressToken: string | number
      progress: number
      total?: number
      message?: string
    }
  }) => Promise<void>
  /** Provider, used to decide whether a heartbeat fallback is needed. */
  provider: LLMProvider
}

export interface RelayHandle {
  /** Pass to LLM provider — receives delta events and forwards as progress. */
  onProgress: (event: LLMProgressEvent) => void
  /** Combined signal: client cancel + 5-minute hard cap. */
  signal: AbortSignal
  /**
   * Send a phase notification (e.g. validation start). Does not increment
   * the progress counter beyond what providers report; safe to call freely.
   */
  notify: (message: string) => void
  /** Stop heartbeat & timeout timers. Call in `finally`. */
  dispose: () => void
}

/**
 * Build a relay that:
 * - merges the client AbortSignal with a 5-minute hard cap,
 * - forwards LLM provider progress events as MCP progress notifications,
 * - emits a periodic heartbeat when the provider does not stream, so the
 *   client's request timeout (60s, reset-on-progress) does not fire.
 */
export function createProgressRelay(ctx: RelayContext): RelayHandle {
  const { progressToken, clientSignal, sendNotification, provider } = ctx

  const hardTimeout = AbortSignal.timeout(TOOL_HARD_TIMEOUT_MS)
  const signal = anySignal([clientSignal, hardTimeout])

  let counter = 0
  const sendProgress = (message: string): void => {
    if (progressToken === undefined)
      return
    counter++
    // Errors from sendNotification should not crash the handler — the
    // transport may have already closed (client disconnected).
    sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress: counter, message },
    }).catch(() => {})
  }

  const onProgress = (event: LLMProgressEvent): void => {
    sendProgress(event.message ?? event.phase)
  }

  // Heartbeat: only when provider does not stream OR token absent.
  // Cheap insurance against silent providers blocking the SDK timeout.
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  if (!provider.supportsStreaming && progressToken !== undefined) {
    heartbeatTimer = setInterval(sendProgress, HEARTBEAT_INTERVAL_MS, 'still working...')
  }

  return {
    onProgress,
    signal,
    notify: sendProgress,
    dispose: () => {
      if (heartbeatTimer)
        clearInterval(heartbeatTimer)
    },
  }
}

/** Combine multiple AbortSignals into one that aborts when any input aborts. */
function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  // Prefer the standard helper when available (Node 20+).
  const anyFn = AbortSignal.any
  if (typeof anyFn === 'function') {
    return anyFn([...signals])
  }
  const controller = new AbortController()
  const onAbort = (s: AbortSignal): void => {
    controller.abort(s.reason)
  }
  for (const s of signals) {
    if (s.aborted) {
      onAbort(s)
      break
    }
    s.addEventListener('abort', () => onAbort(s), { once: true })
  }
  return controller.signal
}
