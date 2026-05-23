import type { ViewerOptions } from './types'
import { ViewerRuntime } from './runtime'

export function createViewer(options?: ViewerOptions): ViewerRuntime {
  return new ViewerRuntime(options)
}

export { applyBindingsToProps, projectBindings } from './binding-projector'
export { collectFontFamilies, loadAndInjectFonts } from './font-loader'
export { MaterialRendererRegistry } from './material-registry'
export { PrintPolicyError, resolvePrintPolicy } from './print-policy'
export { renderPages } from './render-surface'
export type { PageDOM, RenderSurfaceOptions } from './render-surface'
export { ViewerRuntime } from './runtime'
export { createThumbnails } from './thumbnail-pipeline'
export * from './types'
export { createBrowserViewerHost, createCustomViewerHost, createIframeViewerHost } from './viewer-host'
export type { ViewerHost } from './viewer-host'
export type { FontDescriptor, FontProvider } from '@easyink/core'
