import type { ViewerRuntime } from '@easyink/viewer'
import { registerBuiltinViewerMaterials } from '@easyink/builtin/all'

export function setupPlaygroundViewerMaterials(viewer: ViewerRuntime): void {
  registerBuiltinViewerMaterials((type, binding, extension) => {
    viewer.registerMaterial(type, binding, extension)
  })
}
