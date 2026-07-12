import type { MaterialBindingDefinition } from '../material-binding'
import type { MaterialAIFacet, MaterialFacetFactory, MaterialManifest, MaterialStructureSlotPolicy } from '../material-manifest'
import type { PropertyDescriptor } from '../material-properties'
import type { SchemaAdapter } from '../schema-adapter'
import { defineMaterialFacetFactory, defineMaterialManifest } from '../material-manifest'
import { compileMaterialProfile } from '../material-profile'
import { recordSchemaAdapter } from '../schema-adapter'

export function createTestMaterialManifest(options: {
  type: string
  slots?: readonly MaterialStructureSlotPolicy[]
  schemaAdapter?: SchemaAdapter
  defaultModel?: Record<string, unknown>
  binding?: MaterialBindingDefinition
  properties?: readonly PropertyDescriptor[]
  designer?: boolean | MaterialFacetFactory<unknown>
  viewer?: boolean | MaterialFacetFactory<unknown>
  ai?: boolean | MaterialAIFacet
}): MaterialManifest {
  return defineMaterialManifest({
    manifestVersion: 1,
    apiVersion: 1,
    engineRange: { min: '0.0.30', maxExclusive: '0.1.0' },
    type: options.type,
    modelVersion: options.schemaAdapter?.currentModelVersion ?? 1,
    common: {
      nameKey: `materials.${options.type}.name`,
      category: 'test',
      iconKey: 'box',
      defaultNode: { width: 10, height: 10, unit: 'mm', model: options.defaultModel ?? {} },
      interaction: { rotatable: true, resizable: true },
      binding: options.binding ?? { kind: 'none' },
      layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
      structure: { slots: options.slots ?? [] },
      properties: options.properties ?? [],
    },
    schemaAdapter: options.schemaAdapter ?? recordSchemaAdapter(1),
    facets: {
      designer: typeof options.designer === 'function'
        ? markTestFactory(options.designer)
        : options.designer ? defineMaterialFacetFactory('sync', () => ({})) : undefined,
      viewer: typeof options.viewer === 'function'
        ? markTestFactory(options.viewer)
        : options.viewer === false ? undefined : defineMaterialFacetFactory('sync', () => ({})),
      ai: typeof options.ai === 'object'
        ? options.ai
        : options.ai
          ? { generation: { enabled: true, modelSchema: { type: 'object' }, bindingShape: { type: 'object' }, examples: [{ value: 'example' }] } }
          : undefined,
    },
  })
}

function markTestFactory<T>(factory: MaterialFacetFactory<T>): MaterialFacetFactory<T> {
  if (factory.activationMode)
    return factory
  const mode = factory.constructor.name === 'AsyncFunction' ? 'async-isolated' : 'sync'
  return defineMaterialFacetFactory(mode, factory)
}

export function createTestCompiledMaterialProfile(manifests: readonly MaterialManifest[] = []) {
  const defaults = manifests.length > 0
    ? manifests
    : [
        createTestMaterialManifest({ type: 'box' }),
        createTestMaterialManifest({
          type: 'container',
          slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
        }),
      ]
  return compileMaterialProfile({
    id: 'test',
    engineVersion: '0.0.30',
    packages: [{ packageId: '@easyink/test', kind: 'builtin', required: true, manifests: defaults }],
  })
}
