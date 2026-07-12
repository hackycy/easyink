import type { AIMaterialDescriptor, JsonObject, JsonValue, MaterialKnowledgeDescriptor } from '@easyink/shared'
import type { FieldType, MaterialBindingSpec, MaterialKnowledge, MaterialPropertySpec } from './types'
import { MaterialKnowledgeRegistry } from './registry'

export interface ManifestEntry {
  type: string
  modelVersion: number
  common: {
    nameKey: string
    category: string
    defaultNode: { width: number, height: number }
    binding: ManifestMaterialBindingDefinition
    properties: ManifestMaterialProp[]
  }
  generation: { bindingShape: JsonObject, modelSchema: JsonObject, examples: JsonValue[] }
  descriptor?: JsonObject
}

export interface ManifestLike {
  version: 1
  profileId: string
  engineVersion: string
  materials: ManifestEntry[]
}

export type ManifestMaterialBindingDefinition
  = | { kind: 'none' }
    | { kind: 'ports', ports: Array<{ role: 'semantic' | 'display', valueShape: 'scalar' | 'record' | 'record-array' | 'json' }>, dataContract?: ManifestMaterialDataContract }

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

    const ai = entry.descriptor as AIMaterialDescriptor | undefined
    const descriptor = ai?.knowledge as MaterialKnowledgeDescriptor | undefined
    if (descriptor) {
      registry.register({
        type: entry.type,
        description: ai?.description ?? entry.common.nameKey,
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
        requiredProps: ai?.requiredProps ?? [],
      })
    }
    else if (ai) {
      registry.register(synthesizeFromDescriptor(entry, ai))
    }
    else {
      registry.register(synthesizeFromManifest(entry))
    }
  }
  return registry
}

function synthesizeFromDescriptor(entry: ManifestEntry, ai: AIMaterialDescriptor): MaterialKnowledge {
  return {
    type: entry.type,
    description: ai.description,
    category: normalizeCategory(entry.common.category, entry.type),
    constraints: [],
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: [],
    },
    bindingSpec: {
      mode: ai.bindings === 'data-contract' || ai.bindings === 'multi'
        ? 'collection'
        : ai.bindings === 'single'
          ? 'scalar'
          : 'none',
      accepts: {
        types: ai.bindings === 'data-contract' || ai.bindings === 'multi'
          ? ['array']
          : ai.bindings === 'single'
            ? ['string']
            : [],
        isArray: ai.bindings === 'data-contract' || ai.bindings === 'multi',
      },
      produces: {
        kind: ai.bindings === 'data-contract'
          ? 'multi-field'
          : ai.bindings === 'multi'
            ? 'collection-repeat'
            : ai.bindings === 'single'
              ? 'scalar-field'
              : 'none',
      },
      examples: [],
    },
    sizing: defaultSizing(entry),
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
    description: entry.common.nameKey,
    category: normalizeCategory(entry.common.category, entry.type),
    constraints: [],
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: [],
    },
    bindingSpec: synthesizeBindingSpec(entry.common.binding),
    sizing: defaultSizing(entry),
    fitness: [],
    properties: entry.common.properties.map(synthesizePropertySpec),
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

  const semantic = binding.ports.filter(port => port.role === 'semantic')
  const display = binding.ports.filter(port => port.role === 'display')
  if (!binding.dataContract && semantic.length === 0 && display.every(port => port.valueShape === 'scalar')) {
    return {
      mode: display.length > 1 ? 'multi-scalar' : 'scalar',
      accepts: { types: ['string', 'number', 'boolean', 'date', 'image-url'] },
      produces: {
        kind: display.length > 1 ? 'multi-field' : 'scalar-field',
        fieldCount: display.length > 1 ? 'multiple' : 'single',
      },
      examples: [],
    }
  }

  if (binding.dataContract) {
    const fields = Object.entries(binding.dataContract.model.fields)
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

function normalizeCategory(category: string, type: string): MaterialKnowledge['category'] {
  return ['data', 'layout', 'decoration', 'typography', 'visualization'].includes(category)
    ? category as MaterialKnowledge['category']
    : inferCategory(type)
}

function defaultSizing(entry: ManifestEntry): MaterialKnowledge['sizing'] {
  return {
    minWidth: 1,
    minHeight: 1,
    defaultSize: {
      width: entry.common.defaultNode.width,
      height: entry.common.defaultNode.height,
    },
  }
}
