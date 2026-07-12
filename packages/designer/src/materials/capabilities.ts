import type { MaterialManifest } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'

interface MaterialLookup {
  getMaterialManifest: (type: string) => MaterialManifest | undefined
}

export function isMaterialRotatable(material: MaterialManifest | undefined): boolean {
  return material?.common.interaction.rotatable !== false
}

export function isElementRotatable(store: MaterialLookup, node: Pick<MaterialNode, 'type'> | null | undefined): boolean {
  if (!node)
    return false
  return isMaterialRotatable(store.getMaterialManifest(node.type))
}

export function filterRotatableElements<T extends Pick<MaterialNode, 'type'>>(store: MaterialLookup, nodes: readonly T[]): T[] {
  return nodes.filter(node => isElementRotatable(store, node))
}
