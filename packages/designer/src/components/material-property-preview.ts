import type { MaterialNode } from '@easyink/schema'
import { deepClone } from '@easyink/shared'

interface ActivePreview<TContext> {
  node: MaterialNode
  nodeId: string
  key: string
  snapshot: MaterialNode
  context: TContext | undefined
}

export interface MaterialPropertyPreviewHooks<TContext> {
  captureContext?: () => TContext
  restoreContext?: (context: TContext) => void
}

/** Owns the reversible, command-free mutation window used by PropertiesPanel. */
export class MaterialPropertyPreviewSession<TContext = never> {
  private active?: ActivePreview<TContext>

  constructor(private hooks: MaterialPropertyPreviewHooks<TContext> = {}) {}

  preview<TResult>(node: MaterialNode, key: string, apply: (node: MaterialNode) => TResult): TResult {
    if (this.active && (this.active.nodeId !== node.id || this.active.key !== key))
      this.cancel()
    if (!this.active) {
      this.active = {
        node,
        nodeId: node.id,
        key,
        snapshot: deepClone(node),
        context: this.hooks.captureContext?.(),
      }
    }
    else {
      this.restoreActive()
    }
    return apply(node)
  }

  restoreForCommit(node: MaterialNode, key: string): boolean {
    if (!this.active)
      return false
    if (this.active.nodeId !== node.id || this.active.key !== key) {
      this.cancel()
      return false
    }
    this.restoreActive()
    this.active = undefined
    return true
  }

  cancel(): void {
    if (!this.active)
      return
    this.restoreActive()
    this.active = undefined
  }

  isActive(nodeId: string, key: string): boolean {
    return this.active?.nodeId === nodeId && this.active.key === key
  }

  private restoreActive(): void {
    if (!this.active)
      return
    replaceMaterialNode(this.active.node, this.active.snapshot)
    if (this.active.context !== undefined)
      this.hooks.restoreContext?.(this.active.context)
  }
}

export function commitMaterialPropertyPreview<TContext, TResult>(
  preview: MaterialPropertyPreviewSession<TContext>,
  node: MaterialNode,
  key: string,
  commit: () => TResult,
): { before: MaterialNode, result: TResult } {
  preview.restoreForCommit(node, key)
  const before = deepClone(node)
  return { before, result: commit() }
}

function replaceMaterialNode(target: MaterialNode, snapshot: MaterialNode): void {
  const record = target as unknown as Record<string, unknown>
  for (const key of Object.keys(record))
    delete record[key]
  Object.assign(record, deepClone(snapshot))
}
