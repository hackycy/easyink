import type { MaterialNode } from '@easyink/schema'
import type { JsonObject, JsonValue } from '@easyink/shared'
import type { MaterialConditionCapability } from './condition'
import type { CanonicalMaterialBindingMap, MaterialBindingDefinition } from './material-binding'
import type { MaterialDesignerFacet, MaterialExtensionContext, MaterialExtensionFactory } from './material-extension'
import type { MaterialLayoutFacet, MaterialStructureFacet } from './material-manifest'
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
  modelSchema?: JsonObject
  requiredModelPaths?: readonly `/${string}`[]
}

export function defineStandardMaterialManifest(input: StandardMaterialManifestInput) {
  const defaultModel = input.defaultNode.model as JsonObject
  const requiredModelPaths = input.requiredModelPaths ?? Object.keys(defaultModel).map(key => `/${escapePointer(key)}` as const)
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
      designer: context => ({
        extension: input.designerFactory(context.services as MaterialExtensionContext),
        catalog: { group: input.category, order: input.catalogOrder },
        localeMessages: input.localeMessages,
      }),
      viewer: () => ({ extension: input.viewerExtension, capabilities: input.viewerCapabilities ?? {} }),
      ai: {
        generation: {
          enabled: true,
          modelSchema: input.modelSchema ?? schemaFor(defaultModel),
          bindingShape: bindingSchema(input.binding),
          requiredModelPaths,
          examples: [defaultModel],
        },
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
    const expression = {
      type: 'object',
      required: ['sourceId', 'fieldPath'],
      properties: { sourceId: { type: 'string' }, fieldPath: { type: 'string' } },
      additionalProperties: true,
    } satisfies JsonObject
    if (port.key.kind === 'exact')
      properties[port.key.value] = expression
    else
      patternProperties[`^${escapeRegex(port.key.value)}`] = expression
  }
  return {
    type: 'object',
    properties,
    ...(Object.keys(patternProperties).length ? { patternProperties } : {}),
    additionalProperties: false,
  }
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
