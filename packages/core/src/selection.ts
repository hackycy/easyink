import type { MaterialNode } from '@easyink/schema'

/**
 * Single source of truth for "can this node participate in interactive
 * selection / drag / nudge / resize". Used by marquee, element-drag, keyboard
 * shortcuts, select-all, etc. so locked/hidden filtering stays consistent
 * across every entry point — divergence here was a real audit finding.
 */
export function isInteractable(node: MaterialNode): boolean {
  return !node.locked && !node.hidden
}

/**
 * SelectionModel tracks which elements are currently selected in the designer.
 */
export class SelectionModel {
  private _ids: Set<string> = new Set()
  private _listeners: Array<() => void> = []

  get ids(): string[] {
    return [...this._ids]
  }

  get count(): number {
    return this._ids.size
  }

  get isEmpty(): boolean {
    return this._ids.size === 0
  }

  select(id: string): void {
    if (this._ids.size === 1 && this._ids.has(id))
      return
    this._ids.clear()
    this._ids.add(id)
    this.notify()
  }

  selectMultiple(ids: string[]): void {
    if (sameSet(this._ids, ids))
      return
    this._ids.clear()
    for (const id of ids) {
      this._ids.add(id)
    }
    this.notify()
  }

  toggle(id: string): void {
    if (this._ids.has(id)) {
      this._ids.delete(id)
    }
    else {
      this._ids.add(id)
    }
    this.notify()
  }

  add(id: string): void {
    if (this._ids.has(id))
      return
    this._ids.add(id)
    this.notify()
  }

  remove(id: string): void {
    if (!this._ids.has(id))
      return
    this._ids.delete(id)
    this.notify()
  }

  has(id: string): boolean {
    return this._ids.has(id)
  }

  clear(): void {
    if (this._ids.size === 0)
      return
    this._ids.clear()
    this.notify()
  }

  /**
   * Filter selection to only include IDs that match existing nodes.
   */
  reconcile(nodes: MaterialNode[]): void {
    const existing = new Set(nodes.map(n => n.id))
    const stale: string[] = []
    for (const id of this._ids) {
      if (!existing.has(id))
        stale.push(id)
    }
    if (stale.length === 0)
      return
    for (const id of stale)
      this._ids.delete(id)
    this.notify()
  }

  onChange(listener: () => void): () => void {
    this._listeners.push(listener)
    let disposed = false
    return () => {
      // Idempotent: callers may dispose defensively in multiple lifecycle
      // hooks (e.g. onUnmounted + watcher cleanup); a second call must not
      // remove a coincidentally-matching listener registered later.
      if (disposed)
        return
      disposed = true
      const idx = this._listeners.indexOf(listener)
      if (idx >= 0)
        this._listeners.splice(idx, 1)
    }
  }

  private notify(): void {
    for (const listener of this._listeners) {
      listener()
    }
  }
}

function sameSet(set: Set<string>, ids: readonly string[]): boolean {
  if (set.size !== ids.length)
    return false
  for (const id of ids) {
    if (!set.has(id))
      return false
  }
  // Guard against duplicates in `ids` masking a real change (e.g. set has [a]
  // and ids is [a, a] — same length & every element present, but the resulting
  // set after replacement would still be {a}, so equality holds anyway).
  return true
}
