import type { AIMaterialDescriptor, MaterialKnowledgeDescriptor } from '@easyink/shared'
import type { FieldType, MaterialBindingSpec, MaterialKnowledge, MaterialPropertySpec } from './types'
import { MaterialKnowledgeRegistry } from './registry'

export interface ManifestEntry {
  type: string
  name?: string
  ai?: AIMaterialDescriptor
  knowledge?: MaterialKnowledgeDescriptor
  binding?: ManifestMaterialBindingDefinition
  props?: ManifestMaterialProp[]
}

export interface ManifestLike {
  materials: ManifestEntry[]
}

export type ManifestMaterialBindingDefinition
  = | { kind: 'none' }
    | { kind: 'ordinary', primaryProp: string, indexedProps?: Record<string | number, string>, formatEditor: ManifestBindingFormatEditorDefinition | false }
    | { kind: 'data-contract', contract: ManifestMaterialDataContract, formatEditor: ManifestBindingFormatEditorDefinition | false }
    | { kind: 'custom' }

export interface ManifestBindingFormatEditorDefinition {
  tabs: readonly string[]
  defaultTab?: string
  presetTypes?: readonly string[]
}

export interface ManifestMaterialDataContract {
  version: number
  model: {
    kind: string
    fields: Record<string, {
      type: FieldType | 'image-url'
      required?: boolean
    }>
  }
}

export interface ManifestMaterialProp {
  key: string
  type: string
  default?: unknown
  enum?: Array<{ value: unknown }>
}

const REMOVED_MATERIAL_TYPES = new Set(['container'])

export function createRegistryFromManifest(manifest: ManifestLike): MaterialKnowledgeRegistry {
  const registry = new MaterialKnowledgeRegistry()
  for (const entry of manifest.materials) {
    if (REMOVED_MATERIAL_TYPES.has(entry.type))
      continue

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
    else if (entry.binding) {
      registry.register(synthesizeFromManifest(entry))
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
      mode: ai.binding === 'data-contract' || ai.binding === 'multi'
        ? 'collection'
        : ai.binding === 'single'
          ? 'scalar'
          : 'none',
      accepts: {
        types: ai.binding === 'data-contract' || ai.binding === 'multi'
          ? ['array']
          : ai.binding === 'single'
            ? ['string']
            : [],
        isArray: ai.binding === 'data-contract' || ai.binding === 'multi',
      },
      produces: {
        kind: ai.binding === 'data-contract'
          ? 'multi-field'
          : ai.binding === 'multi'
            ? 'collection-repeat'
            : ai.binding === 'single'
              ? 'scalar-field'
              : 'none',
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

function synthesizeFromManifest(entry: ManifestEntry): MaterialKnowledge {
  return {
    type: entry.type,
    description: entry.name ?? entry.type,
    category: inferCategory(entry.type),
    constraints: [],
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: [],
    },
    bindingSpec: synthesizeBindingSpec(entry.binding),
    sizing: { minWidth: 10, minHeight: 10, defaultSize: { width: 50, height: 20 } },
    fitness: [],
    properties: (entry.props ?? []).map(synthesizePropertySpec),
    requiredProps: [],
  }
}

function synthesizeBindingSpec(binding: ManifestMaterialBindingDefinition | undefined): MaterialBindingSpec {
  if (!binding || binding.kind === 'none') {
    return {
      mode: 'none',
      accepts: { types: [] },
      produces: { kind: 'none' },
      examples: [],
    }
  }

  if (binding.kind === 'ordinary') {
    return {
      mode: binding.indexedProps ? 'multi-scalar' : 'scalar',
      accepts: { types: ['string', 'number', 'boolean', 'date', 'image-url'] },
      produces: {
        kind: binding.indexedProps ? 'multi-field' : 'scalar-field',
        fieldCount: binding.indexedProps ? 'multiple' : 'single',
      },
      examples: [],
    }
  }

  if (binding.kind === 'data-contract') {
    const fields = Object.entries(binding.contract.model.fields)
    return {
      mode: 'collection',
      accepts: {
        types: uniqueFields(fields.map(([, field]) => field.type)),
        isArray: true,
        minChildren: fields.length,
        requiredChildFields: fields.filter(([, field]) => field.required).map(([id]) => id),
      },
      produces: {
        kind: 'multi-field',
        fieldCount: fields.length > 1 ? 'multiple' : 'single',
      },
      examples: [],
    }
  }

  return {
    mode: 'collection',
    accepts: { types: ['array', 'object'], isArray: true },
    produces: { kind: 'collection-repeat', fieldCount: 'dynamic' },
    examples: [],
  }
}

function synthesizePropertySpec(prop: ManifestMaterialProp): MaterialPropertySpec {
  const type = normalizePropertyType(prop.type)
  return {
    key: prop.key,
    type,
    required: prop.default === undefined,
    defaultValue: prop.default,
    enumValues: type === 'enum'
      ? prop.enum?.map(option => String(option.value))
      : undefined,
  }
}

function normalizePropertyType(type: string): MaterialPropertySpec['type'] {
  if (type === 'number' || type === 'boolean' || type === 'enum' || type === 'color' || type === 'object' || type === 'array' || type === 'code')
    return type
  return 'string'
}

function uniqueFields(types: Array<FieldType | 'image-url'>): FieldType[] {
  const result = new Set<FieldType>()
  for (const type of types) {
    if (type === 'string' || type === 'number' || type === 'boolean' || type === 'date' || type === 'image-url' || type === 'array' || type === 'object')
      result.add(type)
  }
  return [...result]
}

function inferCategory(type: string): MaterialKnowledge['category'] {
  if (['table-data', 'table-static', 'flow-row', 'barcode', 'qrcode'].includes(type))
    return 'data'
  if (['line', 'rect', 'ellipse', 'image'].includes(type))
    return 'decoration'
  if (type === 'chart' || type.startsWith('chart-'))
    return 'visualization'
  return 'typography'
}
