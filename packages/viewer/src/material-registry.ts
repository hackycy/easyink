import type { MaterialNode } from '@easyink/schema'
import type { FragmentPaginator, MaterialViewerExtension, ViewerMeasureContext, ViewerMeasureResult, ViewerRenderContext, ViewerRenderOutput, ViewerRenderSize } from './types'
import { trustedViewerHtml } from '@easyink/core'
import { escapeHtml } from '@easyink/shared'

/**
 * Registry mapping material type strings to their viewer render extensions.
 * When a type is not found, renders a diagnostic placeholder.
 */
export class MaterialRendererRegistry {
  private _renderers = new Map<string, MaterialViewerExtension>()
  private _pageAwareTypes = new Set<string>()

  register(type: string, extension: MaterialViewerExtension): void {
    this._renderers.set(type, extension)
    if (extension.pageAware) {
      this._pageAwareTypes.add(type)
    }
  }

  unregister(type: string): void {
    this._renderers.delete(type)
    this._pageAwareTypes.delete(type)
  }

  has(type: string): boolean {
    return this._renderers.has(type)
  }

  render(node: MaterialNode, context: ViewerRenderContext): ViewerRenderOutput {
    const ext = this._renderers.get(node.type)
    if (!ext) {
      return renderUnknownMaterial(node)
    }
    return ext.render(node, context)
  }

  measure(node: MaterialNode, context: ViewerMeasureContext): ViewerMeasureResult | null {
    const ext = this._renderers.get(node.type)
    if (!ext?.measure)
      return null
    return ext.measure(node, context)
  }

  getRenderSize(node: MaterialNode, context: ViewerRenderContext): ViewerRenderSize {
    const ext = this._renderers.get(node.type)
    const size = ext?.getRenderSize?.(node, context)
    return {
      width: size?.width ?? node.width,
      height: size?.height ?? node.height,
    }
  }

  getFragmentPaginator(node: MaterialNode): FragmentPaginator | undefined {
    const ext = this._renderers.get(node.type)
    if (!ext?.fragmentPaginator?.canPaginate(node))
      return undefined
    return ext.fragmentPaginator
  }

  isPageAware(type: string): boolean {
    return this._pageAwareTypes.has(type)
  }

  get registeredTypes(): string[] {
    return [...this._renderers.keys()]
  }

  clear(): void {
    this._renderers.clear()
    this._pageAwareTypes.clear()
  }
}

function renderUnknownMaterial(node: MaterialNode): ViewerRenderOutput {
  const typeText = escapeHtml(node.type)
  return {
    html: trustedViewerHtml(`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff3f3;border:1px dashed #ff4d4f;color:#ff4d4f;font-size:12px;box-sizing:border-box;">[Unknown: ${typeText}]</div>`),
  }
}
