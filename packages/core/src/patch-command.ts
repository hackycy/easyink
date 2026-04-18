import type { MaterialNode } from '@easyink/schema'
import type { Patch } from 'mutative'
import type { Command } from './command'
import { generateId } from '@easyink/shared'

// ─── JSON Patch Application ────────────────────────────────────────

/**
 * Apply mutative patches in-place on a mutable target object.
 * Handles 'replace', 'add', and 'remove' operations.
 */
export function applyJsonPatches(target: unknown, patches: Patch[]): void {
  for (const patch of patches) {
    applyOnePatch(target, patch)
  }
}

function applyOnePatch(root: unknown, patch: Patch): void {
  const { path, op, value } = patch
  if (path.length === 0) {
    // Root replacement not supported for in-place mutation
    return
  }

  // Navigate to parent
  let current: unknown = root
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!
    current = (current as Record<string | number, unknown>)[key]
    if (current == null)
      return
  }

  const lastKey = path[path.length - 1]!
  const parent = current as Record<string | number, unknown>

  if (op === 'replace' || op === 'add') {
    if (Array.isArray(parent) && typeof lastKey === 'number') {
      if (op === 'add') {
        parent.splice(lastKey, 0, value)
      }
      else {
        parent[lastKey] = value
      }
    }
    else {
      parent[lastKey] = value
    }
  }
  else if (op === 'remove') {
    if (Array.isArray(parent) && typeof lastKey === 'number') {
      parent.splice(lastKey, 1)
    }
    else {
      delete parent[lastKey as string]
    }
  }
}

// ─── PatchCommand ──────────────────────────────────────────────────

export interface PatchCommandOptions {
  mergeKey?: string
  mergeWindowMs?: number
  label?: string
}

/**
 * Command that applies mutative patches to a MaterialNode.
 * Supports merge for continuous operations (drag resize, typing).
 */
export class PatchCommand implements Command {
  readonly id: string
  readonly type = 'patch'
  readonly description: string
  /** Timestamp for merge window calculation. Mutable for merged commands. */
  createdAt: number

  constructor(
    private getNode: () => MaterialNode,
    private patches: Patch[],
    private inversePatches: Patch[],
    private options: PatchCommandOptions = {},
  ) {
    this.id = generateId('cmd')
    this.description = options.label || 'Edit'
    this.createdAt = Date.now()
  }

  execute(): void {
    applyJsonPatches(this.getNode(), this.patches)
  }

  undo(): void {
    applyJsonPatches(this.getNode(), this.inversePatches)
  }

  merge(next: Command): Command | null {
    if (!(next instanceof PatchCommand))
      return null
    if (!this.options.mergeKey || this.options.mergeKey !== next.options.mergeKey)
      return null

    const windowMs = this.options.mergeWindowMs ?? 300
    if (next.createdAt - this.createdAt > windowMs)
      return null

    // Merge: concatenate patches for execute, reverse-concatenate inverses for undo
    const merged = new PatchCommand(
      this.getNode,
      [...this.patches, ...next.patches],
      [...next.inversePatches, ...this.inversePatches],
      { ...this.options, label: next.options.label || this.options.label },
    )
    // Keep original timestamp for subsequent merge window calculations
    merged.createdAt = this.createdAt
    return merged
  }
}
