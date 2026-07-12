import type { MaterialDesignerExtension, MaterialManifest, SchemaAdapter } from '@easyink/core'
import { compileMaterialProfile } from '@easyink/core'
import { createTestMaterialManifest } from '@easyink/core/testing'

export interface DesignerTestManifestOptions {
  type: string
  extension?: MaterialDesignerExtension
  designerFactory?: () => Promise<MaterialDesignerExtension> | MaterialDesignerExtension
  schemaAdapter?: SchemaAdapter
  viewer?: boolean
  catalog?: { group: string, order: number }
}

export function createDesignerTestManifest(options: DesignerTestManifestOptions): MaterialManifest {
  const catalog = options.catalog ?? { group: 'test', order: 0 }
  return createTestMaterialManifest({
    type: options.type,
    schemaAdapter: options.schemaAdapter,
    viewer: options.viewer,
    designer: async () => {
      const extension = options.designerFactory
        ? await options.designerFactory()
        : options.extension ?? { renderContent: () => () => {} }
      return {
        extension,
        catalog,
        ...(extension.dispose ? { dispose: () => extension.dispose!() } : {}),
      }
    },
  })
}

export function createDesignerTestProfile(manifests: readonly MaterialManifest[]) {
  return compileMaterialProfile({
    id: 'designer-test',
    engineVersion: '0.0.30',
    packages: [{ packageId: '@easyink/designer-test', kind: 'builtin', required: true, manifests }],
  })
}
