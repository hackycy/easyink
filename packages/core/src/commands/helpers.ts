import type { MaterialNode } from '@easyink/schema'

export function findNode(elements: MaterialNode[], id: string): MaterialNode | undefined {
  return findNodeLocation(elements, id)?.node
}

export interface NodeLocation {
  node: MaterialNode
  collection: MaterialNode[]
  index: number
  path: number[]
}

export function findNodeLocation(elements: MaterialNode[], id: string, basePath: number[] = []): NodeLocation | undefined {
  for (let index = 0; index < elements.length; index++) {
    const node = elements[index]!
    const path = [...basePath, index]
    if (node.id === id)
      return { node, collection: elements, index, path }
    if (node.children) {
      const child = findNodeLocation(node.children, id, path)
      if (child)
        return child
    }
  }
  return undefined
}

export function asRecord(obj: unknown): Record<string, unknown> {
  return obj as Record<string, unknown>
}

/** Read a value from a nested object using a dot-separated path. */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object')
      return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** Set a value on a nested object using a dot-separated path, creating intermediate objects as needed. */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (current[part] == null || typeof current[part] !== 'object')
      current[part] = {}
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]!] = value
}
