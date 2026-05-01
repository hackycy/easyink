/**
 * Designer-level diagnostics channel.
 *
 * Audit/202605011431.md item 4 called out that recoverable errors were
 * spread across `console.error` calls in SelectionStore, behavior dispatcher
 * and transaction service, with no single place where the workbench (and a
 * host application via Contribution) could surface them. This module is
 * that place.
 *
 * Design constraints
 * ------------------
 * - Always-on (production included). The architecture README forbids
 *   silent failures; gating diagnostics behind DEV would re-introduce that.
 * - Bounded buffer. We keep the most recent N entries reactively so the
 *   DebugPanel can render them without unbounded memory growth — older
 *   entries fall off silently.
 * - Push-only listener API. Hosts subscribe through the Contribution
 *   context (`ctx.onDiagnostic`) to forward into Sentry / toast etc.
 * - No throwing. Pushing a diagnostic must NEVER itself raise — that would
 *   re-create the half-failed UI state we are trying to avoid.
 */

import { shallowRef } from 'vue'

export type DiagnosticSeverity = 'info' | 'warn' | 'error'

export type DiagnosticSource
  = | 'selection-store'
    | 'behavior-dispatcher'
    | 'transaction'
    | 'gesture'
    | 'material-extension'

export interface Diagnostic {
  /** Monotonic id assigned at push time. Useful for v-for keys / dedup. */
  id: number
  /** Wall-clock timestamp at push (ms since epoch). */
  timestamp: number
  source: DiagnosticSource
  severity: DiagnosticSeverity
  message: string
  /** Optional structured context (gesture id, nodeId, selection type, …). */
  detail?: Record<string, unknown>
}

export type DiagnosticListener = (entry: Diagnostic) => void

const MAX_BUFFER = 200

export class DiagnosticsChannel {
  private _entriesRef = shallowRef<readonly Diagnostic[]>([])
  private _nextId = 1
  private _listeners = new Set<DiagnosticListener>()

  get entries(): readonly Diagnostic[] {
    return this._entriesRef.value
  }

  push(entry: Omit<Diagnostic, 'id' | 'timestamp'>): void {
    const full: Diagnostic = {
      id: this._nextId++,
      timestamp: Date.now(),
      ...entry,
    }
    // Reassign array reference so the shallowRef notifies subscribers
    // (DebugPanel computed, host listeners) on a single mutation.
    const prev = this._entriesRef.value
    this._entriesRef.value = prev.length >= MAX_BUFFER
      ? [...prev.slice(prev.length - MAX_BUFFER + 1), full]
      : [...prev, full]

    // Mirror to console at the right severity. Hosts can opt-out by
    // configuring browser console filters; we deliberately do NOT skip
    // console output when a listener is attached (hosts still benefit
    // from devtools traces during development).
    const consoleArgs = [`[EasyInk:${entry.source}] ${entry.message}`, entry.detail].filter(v => v !== undefined)
    if (entry.severity === 'error')
      console.error(...consoleArgs)
    else
      console.warn(...consoleArgs)

    // Listener errors are isolated so one bad host listener cannot break
    // diagnostics for other listeners or the producing call site.
    for (const fn of this._listeners) {
      try {
        fn(full)
      }
      catch (err) {
        // Do not recurse through `push` here — if a listener throws while
        // diagnosing, logging another diagnostic from the same channel
        // would risk an infinite loop.
        console.error('[EasyInk:diagnostics] listener threw', err)
      }
    }
  }

  subscribe(listener: DiagnosticListener): () => void {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  clear(): void {
    this._entriesRef.value = []
  }
}
