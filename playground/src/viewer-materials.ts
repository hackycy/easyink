import type { MaterialViewerFacet } from '@easyink/core'
import type { ViewerRuntime } from '@easyink/viewer'
import { builtinMaterialPackage } from '@easyink/builtin/all'

export function setupPlaygroundViewerMaterials(viewer: ViewerRuntime): void {
  for (const manifest of builtinMaterialPackage.manifests) {
    const result = manifest.facets.viewer!({ profileId: 'playground', materialType: manifest.type, surface: 'viewer', services: {} })
    if (result instanceof Promise)
      throw new Error('PLAYGROUND_ASYNC_VIEWER_FACET_UNSUPPORTED')
    const facet = result as MaterialViewerFacet
    viewer.registerMaterial(manifest.type, manifest.common.binding, facet.extension, manifest.common.layout)
  }
}
