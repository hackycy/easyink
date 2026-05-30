import type { AIMaterialDescriptor, MaterialKnowledgeDescriptor } from '@easyink/shared'
import type { MaterialKnowledge } from './types'
import { MaterialKnowledgeRegistry } from './registry'

export interface ManifestEntry {
  type: string
  name?: string
  ai?: AIMaterialDescriptor
  knowledge?: MaterialKnowledgeDescriptor
}

export interface ManifestLike {
  materials: ManifestEntry[]
}

export function createRegistryFromManifest(manifest: ManifestLike): MaterialKnowledgeRegistry {
  const registry = new MaterialKnowledgeRegistry()
  for (const entry of manifest.materials) {
    const descriptor = entry.knowledge ?? entry.ai?.knowledge
    if (descriptor) {
      registry.register({
        type: entry.type,
        description: entry.ai?.description ?? entry.name ?? entry.type,
        category: descriptor.category,
        constraints: [],
        composability: descriptor.composability,
        bindingSpec: {
          ...descriptor.bindingSpec,
          examples: descriptor.bindingSpec.examples ?? [],
        },
        sizing: descriptor.sizing,
        fitness: descriptor.fitness ?? [],
        properties: descriptor.properties ?? [],
        requiredProps: entry.ai?.requiredProps ?? [],
      })
    }
    else if (entry.ai) {
      registry.register(synthesizeFromDescriptor(entry.type, entry.ai))
    }
  }
  return registry
}

function synthesizeFromDescriptor(type: string, ai: AIMaterialDescriptor): MaterialKnowledge {
  return {
    type,
    description: ai.description,
    category: inferCategory(type),
    constraints: [],
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: [],
    },
    bindingSpec: {
      mode: ai.binding === 'multi' ? 'collection' : ai.binding === 'single' ? 'scalar' : 'none',
      accepts: {
        types: ai.binding === 'multi' ? ['array'] : ai.binding === 'single' ? ['string'] : [],
        isArray: ai.binding === 'multi',
      },
      produces: {
        kind: ai.binding === 'multi' ? 'collection-repeat' : ai.binding === 'single' ? 'scalar-field' : 'none',
      },
      examples: [],
    },
    sizing: { minWidth: 10, minHeight: 10, defaultSize: { width: 50, height: 20 } },
    fitness: [],
    properties: ai.properties.map(key => ({
      key,
      type: 'string' as const,
      required: ai.requiredProps?.includes(key) ?? false,
    })),
    requiredProps: ai.requiredProps ?? [],
  }
}

function inferCategory(type: string): MaterialKnowledge['category'] {
  if (['table-data', 'table-static', 'flow-row', 'barcode', 'qrcode'].includes(type))
    return 'data'
  if (['container'].includes(type))
    return 'layout'
  if (['line', 'rect', 'ellipse', 'image'].includes(type))
    return 'decoration'
  if (['chart'].includes(type))
    return 'visualization'
  return 'typography'
}
