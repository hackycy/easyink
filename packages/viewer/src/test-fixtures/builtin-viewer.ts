import type { ViewerOptions } from '../types'
import { registerAllBuiltinViewerMaterials } from '@easyink/builtin'
import { createViewer } from '../index'

/** Test host with the same explicit material assembly as application hosts. */
export function createBuiltinViewer(options?: ViewerOptions) {
  const viewer = createViewer(options)
  registerAllBuiltinViewerMaterials((...args) => viewer.registerMaterial(...args))
  return viewer
}
