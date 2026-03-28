export { registerBuiltinRenderers } from './dom/builtins'

export { ElementRenderRegistry } from './dom/element-registry'
// ─── Element Renderers ───
export {
  renderBarcode,
  renderImage,
  renderLine,
  renderRect,
  renderTable,
  renderText,
} from './dom/elements/index'
export { buildPage } from './dom/page-builder'
export type { PageBuildResult } from './dom/page-builder'
// ─── DOM Renderer ───
export { DOMRenderer } from './dom/renderer'
export { applyLayout, applyStyle } from './dom/style-applier'

// ─── Screen Renderer ───
export { ScreenRenderer } from './screen'

// ─── Types ───
export type {
  DOMRendererOptions,
  ElementRenderContext,
  ElementRenderFunction,
  Renderer,
  RenderResult,
  ScreenRendererOptions,
} from './types'
