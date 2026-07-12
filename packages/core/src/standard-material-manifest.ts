import type { MaterialNode } from '@easyink/schema'
import type { JsonObject, JsonValue } from '@easyink/shared'
import type { MaterialConditionCapability } from './condition'
import type { CanonicalMaterialBindingMap, MaterialBindingDefinition } from './material-binding'
import type { MaterialDesignerFacet, MaterialExtensionContext, MaterialExtensionFactory } from './material-extension'
import type { MaterialAIFacet, MaterialLayoutFacet, MaterialStructureFacet } from './material-manifest'
import type { PropertyDescriptor } from './material-properties'
import type { MaterialViewerExtension, MaterialViewerFacet, ViewerFacetCapabilities } from './material-viewer'
import type { SchemaAdapter } from './schema-adapter'
import { defineMaterialManifest } from './material-manifest'

export interface StandardMaterialManifestInput {
  type: string
  nameKey: string
  category: string
  iconKey: string
  catalogOrder: number
  defaultNode: MaterialNode<unknown>
  interaction: {
    rotatable: boolean
    resizable: boolean
    keepAspectRatio?: boolean
    supportsAnimation?: boolean
    supportsUnionDrop?: boolean
  }
  binding: MaterialBindingDefinition
  condition?: MaterialConditionCapability
  layout: MaterialLayoutFacet
  structure?: MaterialStructureFacet
  properties: readonly PropertyDescriptor[]
  schemaAdapter: SchemaAdapter
  designerFactory: MaterialExtensionFactory
  localeMessages?: MaterialDesignerFacet['localeMessages']
  viewerExtension: MaterialViewerExtension
  viewerCapabilities?: ViewerFacetCapabilities
  aiDescriptor: Record<string, unknown>
  generation: StandardMaterialGenerationDeclaration
}

export type StandardMaterialGenerationDeclaration
  = | { enabled: false }
    | {
      enabled: true
      modelSchema: JsonObject | 'infer-from-default'
      bindingShape: 'infer-from-binding'
      examples: 'default-model'
      requiredModelPaths: readonly `/${string}`[]
    }

export function defineStandardMaterialManifest(input: StandardMaterialManifestInput) {
  const defaultModel = input.defaultNode.model as JsonObject
  const generation: MaterialAIFacet['generation'] = input.generation.enabled
    ? {
        enabled: true,
        modelSchema: input.generation.modelSchema === 'infer-from-default'
          ? schemaFor(defaultModel)
          : input.generation.modelSchema,
        bindingShape: bindingSchema(input.binding),
        requiredModelPaths: input.generation.requiredModelPaths,
        examples: [defaultModel],
      }
    : { enabled: false, examples: [] }
  return defineMaterialManifest<MaterialDesignerFacet, MaterialViewerFacet>({
    manifestVersion: 1,
    apiVersion: 1,
    engineRange: { min: '0.0.30', maxExclusive: '0.1.0' },
    type: input.type,
    modelVersion: 1,
    common: {
      nameKey: input.nameKey,
      category: input.category,
      iconKey: input.iconKey,
      defaultNode: {
        width: input.defaultNode.width,
        height: input.defaultNode.height,
        unit: 'mm',
        model: defaultModel,
        ...(Object.keys(input.defaultNode.bindings).length ? { bindings: input.defaultNode.bindings as CanonicalMaterialBindingMap } : {}),
        ...(input.defaultNode.output ? { output: input.defaultNode.output } : {}),
      },
      interaction: input.interaction,
      binding: input.binding,
      condition: input.condition,
      layout: input.layout,
      structure: input.structure ?? { slots: [] },
      properties: input.properties,
    },
    schemaAdapter: input.schemaAdapter,
    facets: {
      designer: (context) => {
        const extension = input.designerFactory(context.services as MaterialExtensionContext)
        return {
          extension,
          catalog: { group: input.category, order: input.catalogOrder },
          localeMessages: input.localeMessages,
          ...(extension.dispose ? { dispose: () => extension.dispose!() } : {}),
        }
      },
      viewer: () => ({ extension: input.viewerExtension, capabilities: input.viewerCapabilities ?? {} }),
      ai: {
        generation,
        descriptor: input.aiDescriptor as JsonObject,
      },
    },
  })
}

function schemaFor(value: JsonValue): JsonObject {
  if (Array.isArray(value))
    return { type: 'array', items: value.length > 0 ? schemaFor(value[0]!) : {} }
  if (value !== null && typeof value === 'object') {
    const properties = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, schemaFor(item)]))
    return { type: 'object', required: Object.keys(value), properties, additionalProperties: false }
  }
  if (value === null)
    return { type: ['null', 'number'] }
  return { type: typeof value }
}

function bindingSchema(binding: MaterialBindingDefinition): JsonObject {
  if (binding.kind === 'none')
    return { type: 'object', properties: {}, additionalProperties: false }
  const properties: JsonObject = {}
  const patternProperties: JsonObject = {}
  for (const port of binding.ports) {
    const expression = binding.dataContract && port.role === 'semantic'
      ? dataContractBindingSchema()
      : bindingReferenceSchema()
    if (port.key.kind === 'exact')
      properties[port.key.value] = expression
    else if (port.key.kind === 'prefix')
      patternProperties[`^${escapeRegex(port.key.value)}`] = expression
  }
  return {
    type: 'object',
    properties,
    ...(Object.keys(patternProperties).length ? { patternProperties } : {}),
    additionalProperties: binding.ports.some(port => port.key.kind === 'model') ? bindingReferenceSchema() : false,
  }
}

function bindingReferenceSchema(): JsonObject {
  return {
    type: 'object',
    required: ['sourceId', 'fieldPath'],
    properties: { sourceId: { type: 'string' }, fieldPath: { type: 'string' } },
    additionalProperties: true,
  }
}

function dataContractBindingSchema(): JsonObject {
  return {
    type: 'object',
    required: ['kind', 'mappings'],
    properties: {
      kind: { const: 'data-contract' },
      mappings: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          required: ['sourceId', 'select'],
          properties: {
            sourceId: { type: 'string' },
            select: {
              type: 'object',
              required: ['path'],
              properties: { path: { type: 'string' } },
              additionalProperties: true,
            },
          },
          additionalProperties: true,
        },
      },
    },
    additionalProperties: true,
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
