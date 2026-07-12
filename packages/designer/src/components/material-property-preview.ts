import type { PropertyAccessor, PropertyDescriptor } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { resolvePropertyAccessor } from '@easyink/core'
import { deepClone } from '@easyink/shared'

interface PathSnapshot {
  path: PropertyAccessor['paths'][number]
  exists: boolean
  value?: unknown
  arrayLength?: number
  missingAncestors: readonly PropertyAccessor['paths'][number][]
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
  return [...new Set(paths)].map(path => capturePath(node, path))
}

function restorePaths(node: MaterialNode, snapshots: readonly PathSnapshot[]): void {
  const ordered = [...snapshots].sort(compareRestoreOrder)
  for (const snapshot of ordered) {
    const leaf = tryResolveParent(node, snapshot.path)
    if (leaf) {
      const exists = Object.hasOwn(leaf.parent, leaf.token)
      if (snapshot.exists) {
        if (Array.isArray(leaf.parent)) {
          const index = arrayIndex(leaf.token, leaf.parent.length, true)
          leaf.parent[index] = deepClone(snapshot.value)
        }
        else {
          leaf.parent[leaf.token] = deepClone(snapshot.value)
        }
      }
      else if (exists) {
        const current = leaf.parent[leaf.token as keyof typeof leaf.parent]
        const retainConcurrentContainer = hasDeclaredDescendant(snapshot.path, ordered) && !isEmptyContainer(current)
        if (!retainConcurrentContainer)
          removeOwnValue(leaf.parent, leaf.token, snapshot.arrayLength)
      }
    }

    for (const ancestorPath of [...snapshot.missingAncestors].reverse()) {
      const ancestor = tryResolveParent(node, ancestorPath)
      if (!ancestor || !Object.hasOwn(ancestor.parent, ancestor.token))
        continue
      const value = ancestor.parent[ancestor.token as keyof typeof ancestor.parent]
      if (isEmptyContainer(value))
        removeOwnValue(ancestor.parent, ancestor.token)
    }
  }
}

function hasDeclaredDescendant(path: PropertyAccessor['paths'][number], snapshots: readonly PathSnapshot[]): boolean {
  const prefix = `${path}/`
  return snapshots.some(snapshot => snapshot.path.startsWith(prefix))
}

function compareRestoreOrder(left: PathSnapshot, right: PathSnapshot): number {
  const leftTokens = decodePointer(left.path)
  const rightTokens = decodePointer(right.path)
  const leftParent = encodePointer(leftTokens.slice(0, -1))
  const rightParent = encodePointer(rightTokens.slice(0, -1))
  if (leftParent === rightParent) {
    const leftIndex = numericToken(leftTokens.at(-1))
    const rightIndex = numericToken(rightTokens.at(-1))
    if (leftIndex !== undefined && rightIndex !== undefined)
      return rightIndex - leftIndex
  }
  // Children must be restored before a declared parent path can remove its container.
  return rightTokens.length - leftTokens.length
}

function numericToken(token: string | undefined): number | undefined {
  if (token === undefined || !/^(?:0|[1-9]\d*)$/.test(token))
    return undefined
  const index = Number(token)
  return Number.isSafeInteger(index) ? index : undefined
}

function capturePath(root: unknown, path: PropertyAccessor['paths'][number]): PathSnapshot {
  const tokens = decodePointer(path)
  let current = root
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, token)) {
      const missingAncestors = tokens
        .slice(index, -1)
        .map((_, offset) => encodePointer(tokens.slice(0, index + offset + 1)))
      return {
        path,
        exists: false,
        missingAncestors,
        ...(index === tokens.length - 1 && Array.isArray(current) ? { arrayLength: current.length } : {}),
      }
    }
    current = (current as Record<string, unknown>)[token]
  }
  return { path, exists: true, value: deepClone(current), missingAncestors: [] }
}

function tryResolveParent(root: unknown, path: PropertyAccessor['paths'][number]): { parent: Record<string, unknown> | unknown[], token: string } | undefined {
  const tokens = decodePointer(path)
  let current = root
  for (const token of tokens.slice(0, -1)) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, token))
      return undefined
    current = (current as Record<string, unknown>)[token]
  }
  if (!current || typeof current !== 'object')
    return undefined
  return { parent: current as Record<string, unknown> | unknown[], token: tokens.at(-1)! }
}

function decodePointer(path: PropertyAccessor['paths'][number]): string[] {
  return path.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function encodePointer(tokens: readonly string[]): PropertyAccessor['paths'][number] {
  return `/${tokens.map(token => token.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`
}

function removeOwnValue(parent: Record<string, unknown> | unknown[], token: string, originalArrayLength?: number): void {
  if (Array.isArray(parent)) {
    const index = arrayIndex(token, parent.length, false)
    if (originalArrayLength !== undefined && index < originalArrayLength)
      delete parent[index]
    else
      parent.splice(index, 1)
  }
  else {
    delete parent[token]
  }
}

function isEmptyContainer(value: unknown): boolean {
  if (Array.isArray(value))
    return value.length === 0
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0
}

function arrayIndex(token: string, length: number, allowAppend: boolean): number {
  const index = Number(token)
  const upperBound = allowAppend ? length : length - 1
  if (!Number.isSafeInteger(index) || index < 0 || index > upperBound)
    throw new Error(`PROPERTY_PREVIEW_ARRAY_INDEX_INVALID: ${token}`)
  return index
}
