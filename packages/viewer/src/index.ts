import type { ViewerOptions } from './types'
import { ViewerRuntime } from './runtime'

export function createViewer(options: ViewerOptions): ViewerRuntime {
  return new ViewerRuntime(options)
}

export { applyBindingsToProps, projectBindings, walkProfileMaterialNodes } from './binding-projector'
export { resolveConditionalSchema } from './conditional-schema'
export type { ConditionalSchemaResolution } from './conditional-schema'
export { collectFontFamilies, loadAndInjectFonts } from './font-loader'
export type { CommittedPagePlan, RuntimeMaterialInstancePlan } from './layout-runtime'
export { ProfileMaterialRuntime } from './material-runtime'
export type { ViewerFacetServices } from './material-runtime'
export { PageDomVirtualizer, selectRetainedPages } from './page-dom-virtualizer'
export type { PageDomVirtualizerOptions, PageIntersectionObserver, PageMaterializationMode, RetainedPageSelection, VirtualPageEntry } from './page-dom-virtualizer'
export type { PreparedCollectionHandle, PreparedCollectionProvider } from './prepared-collections'
export { PrintPolicyError, resolvePrintPolicy } from './print-policy'
export { mountCommittedMaterial, mountMaterialTree, renderPages, RenderSurface } from './render-surface'
export type {
  AtomicRenderSurfaceOptions,
  MountCommittedMaterialOptions,
  MountMaterialTreeOptions,
  PageDOM,
  RenderSurfaceBuild,
  RenderSurfaceBuildResult,
  RenderSurfaceDisposer,
  RenderSurfaceOptions,
  RenderSurfaceTransaction,
} from './render-surface'
export { ViewerRuntime } from './runtime'
export { createThumbnails } from './thumbnail-pipeline'
export * from './types'
export { createBrowserViewerHost, createCustomViewerHost, createIframeViewerHost } from './viewer-host'
export type { ViewerHost } from './viewer-host'
export type { FontDescriptor, FontProvider } from '@easyink/core'
