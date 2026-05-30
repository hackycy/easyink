import type { AssistantEventRecord } from './types'

export type AssistantEventListener = (record: AssistantEventRecord) => void

/**
 * In-memory fan-out of appended events to live subscribers, keyed by task id.
 * Used by stores to power the single SSE long-connection stream.
 */
export class EventSubscriptions {
  private readonly listeners = new Map<string, Set<AssistantEventListener>>()

  subscribe(taskId: string, listener: AssistantEventListener): () => void {
    let set = this.listeners.get(taskId)
    if (!set) {
      set = new Set()
      this.listeners.set(taskId, set)
    }
    set.add(listener)
    return () => {
      const current = this.listeners.get(taskId)
      if (!current)
        return
      current.delete(listener)
      if (current.size === 0)
        this.listeners.delete(taskId)
    }
  }

  emit(record: AssistantEventRecord): void {
    const set = this.listeners.get(record.taskId)
    if (!set)
      return
    for (const listener of [...set]) {
      try {
        listener(record)
      }
      catch {
        // a faulty subscriber must not break event persistence
      }
    }
  }
}
