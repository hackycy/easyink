import type { MaterialNode } from '@easyink/schema'
import type { MaterialViewerExtension, ViewerRenderContext, ViewerRenderOutput } from './types'

/**
 * Registry mapping material type strings to their viewer render extensions.
 * When a type is not found, renders a diagnostic placeholder.
 */
export class MaterialRendererRegistry {
  private _renderers = new Map<string, MaterialViewerExtension>()

  register(type: string, extension: MaterialViewerExtension): void {
    this._renderers.set(type, extension)
  }

  unregister(type: string): void {
    this._renderers.delete(type)
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

  get registeredTypes(): string[] {
    return [...this._renderers.keys()]
  }

  clear(): void {
    this._renderers.clear()
  }
}

function renderUnknownMaterial(node: MaterialNode): ViewerRenderOutput {
  const typeText = escapeHtml(node.type)
  return {
    html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff3f3;border:1px dashed #ff4d4f;color:#ff4d4f;font-size:12px;box-sizing:border-box;">[Unknown: ${typeText}]</div>`,
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
