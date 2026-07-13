import type { MaterialNode } from '@easyink/schema'
import { generateId } from '@easyink/shared'

/**
 * Single source of truth for "can this node be modified through direct canvas
 * operations". Locked and hidden nodes may still be selected by direct click or
 * the structure tree so users can recover them, but they do not participate in
 * drag / nudge / resize / rotate / deep-edit operations.
 */
export function isInteractable(node: MaterialNode): boolean {
  return node.editorState?.locked !== true && node.editorState?.hidden !== true
}

export function isSelectable(node: MaterialNode): boolean {
  return Boolean(node.id)
}

/**
 * SelectionModel tracks which elements are currently selected in the designer.
 */
export class SelectionModel {
  private _ids: Set<string> = new Set()
  private _listeners: Array<() => void> = []
  private _lineageId = generateId('selection')

  get ids(): readonly string[] {
    return Object.freeze([...this._ids])
  }

  get lineageId(): string {
    return this._lineageId
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
    this.notify(true)
  }

  selectMultiple(ids: string[]): void {
    if (sameSet(this._ids, ids))
      return
    this._ids.clear()
    for (const id of ids) {
      this._ids.add(id)
    }
    this.notify(true)
  }

  toggle(id: string): void {
    if (this._ids.has(id)) {
      this._ids.delete(id)
    }
    else {
      this._ids.add(id)
    }
    this.notify(true)
  }

  add(id: string): void {
    if (this._ids.has(id))
      return
    this._ids.add(id)
    this.notify(true)
  }

  remove(id: string): void {
    if (!this._ids.has(id))
      return
    this._ids.delete(id)
    this.notify(true)
  }

  has(id: string): boolean {
    return this._ids.has(id)
  }

  clear(): void {
    if (this._ids.size === 0)
      return
    this._ids.clear()
    this.notify(true)
  }

  /**
   * Filter selection to only include IDs that match existing nodes.
   */
  reconcile(nodes: readonly string[]): void {
    const existing = new Set(nodes)
    const stale: string[] = []
    for (const id of this._ids) {
      if (!existing.has(id))
        stale.push(id)
    }
    if (stale.length === 0)
      return
    for (const id of stale)
      this._ids.delete(id)
    this.notify(this._ids.size === 0)
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

  private notify(changeLineage: boolean): void {
    if (changeLineage)
      this._lineageId = generateId('selection')
    for (const listener of this._listeners) {
      listener()
    }
  }
}

function sameSet(set: Set<string>, ids: readonly string[]): boolean {
  const candidate = new Set(ids)
  if (set.size !== candidate.size)
    return false
  for (const id of candidate) {
    if (!set.has(id))
      return false
  }
  return true
}
