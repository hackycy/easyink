import type { MaterialNode } from '@easyink/schema'
import type { MaterialPresentation } from './presentation'

interface MaterialLookup {
  getMaterial: (type: string) => Pick<MaterialPresentation, 'capabilities'> | undefined
}

export function isMaterialRotatable(material: Pick<MaterialPresentation, 'capabilities'> | undefined): boolean {
  return material?.capabilities.rotatable !== false
}

export function isElementRotatable(store: MaterialLookup, node: Pick<MaterialNode, 'type'> | null | undefined): boolean {
  if (!node)
    return false
  return isMaterialRotatable(store.getMaterial(node.type))
}

export function filterRotatableElements<T extends Pick<MaterialNode, 'type'>>(store: MaterialLookup, nodes: readonly T[]): T[] {
  return nodes.filter(node => isElementRotatable(store, node))
}
