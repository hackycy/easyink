import type { PropertyAccessor, PropertyDescriptor } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { resolvePropertyAccessor } from '@easyink/core'
import { deepClone } from '@easyink/shared'

interface PathSnapshot {
  path: PropertyAccessor['paths'][number]
  exists: boolean
  value?: unknown
}

interface ActivePreview<TContext> {
  node: MaterialNode
  nodeId: string
  key: string
  paths: readonly PathSnapshot[]
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

  preview<TResult, TValue>(node: MaterialNode, descriptor: PropertyDescriptor<TValue>, apply: (node: MaterialNode) => TResult): TResult {
    if (this.active && (this.active.nodeId !== node.id || this.active.key !== descriptor.key))
      this.cancel()
    if (!this.active) {
      this.active = {
        node,
        nodeId: node.id,
        key: descriptor.key,
        paths: capturePaths(node, resolvePropertyAccessor(descriptor).paths),
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
    if (this.active.node !== node || this.active.nodeId !== node.id || this.active.key !== key) {
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
    restorePaths(this.active.node, this.active.paths)
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

function capturePaths(node: MaterialNode, paths: PropertyAccessor['paths']): readonly PathSnapshot[] {
  return paths.map((path) => {
    const current = readOwnPath(node, path)
    return current.exists
      ? { path, exists: true, value: deepClone(current.value) }
      : { path, exists: false }
  })
}

function restorePaths(node: MaterialNode, snapshots: readonly PathSnapshot[]): void {
  for (const snapshot of snapshots) {
    const { parent, token } = resolveParent(node, snapshot.path)
    const exists = Object.hasOwn(parent, token)
    if (snapshot.exists) {
      if (Array.isArray(parent)) {
        const index = arrayIndex(token, parent.length, true)
        parent[index] = deepClone(snapshot.value)
      }
      else {
        parent[token] = deepClone(snapshot.value)
      }
    }
    else if (exists) {
      if (Array.isArray(parent))
        parent.splice(arrayIndex(token, parent.length, false), 1)
      else
        delete parent[token]
    }
  }
}

function readOwnPath(root: unknown, path: PropertyAccessor['paths'][number]): { exists: boolean, value?: unknown } {
  const tokens = decodePointer(path)
  let current = root
  for (const token of tokens) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, token))
      return { exists: false }
    current = (current as Record<string, unknown>)[token]
  }
  return { exists: true, value: current }
}

function resolveParent(root: unknown, path: PropertyAccessor['paths'][number]): { parent: Record<string, unknown> | unknown[], token: string } {
  const tokens = decodePointer(path)
  let current = root
  for (const token of tokens.slice(0, -1)) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, token))
      throw new Error(`PROPERTY_PREVIEW_PATH_MISSING: ${path}`)
    current = (current as Record<string, unknown>)[token]
  }
  if (!current || typeof current !== 'object')
    throw new Error(`PROPERTY_PREVIEW_PATH_INVALID: ${path}`)
  return { parent: current as Record<string, unknown> | unknown[], token: tokens.at(-1)! }
}

function decodePointer(path: PropertyAccessor['paths'][number]): string[] {
  return path.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function arrayIndex(token: string, length: number, allowAppend: boolean): number {
  const index = Number(token)
  const upperBound = allowAppend ? length : length - 1
  if (!Number.isSafeInteger(index) || index < 0 || index > upperBound)
    throw new Error(`PROPERTY_PREVIEW_ARRAY_INDEX_INVALID: ${token}`)
  return index
}
