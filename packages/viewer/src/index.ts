import type { ViewerOptions } from './types'
import { ViewerRuntime } from './runtime'

export function createViewer(options?: ViewerOptions): ViewerRuntime {
  return new ViewerRuntime(options)
}

export { applyBindingsToProps, projectBindings } from './binding-projector'
export { collectFontFamilies, loadAndInjectFonts } from './font-loader'
export { MaterialRendererRegistry } from './material-registry'
export { renderPages } from './render-surface'
export type { PageDOM, RenderSurfaceOptions } from './render-surface'
export { ViewerRuntime } from './runtime'
export type * from './types'
