import type { TemplateSchema } from '@easyink/core'
import type { Renderer, RenderResult, ScreenRendererOptions } from './types'
import { DOMRenderer } from './dom/renderer'

/**
 * ScreenRenderer — 屏幕预览渲染器
 *
 * 基于 DOMRenderer 的便捷封装，用于屏幕预览场景。
 * 支持缩放控制。
 */
export class ScreenRenderer implements Renderer {
  readonly name = 'screen'

  private _renderer: DOMRenderer
  private _zoom: number

  constructor(options?: ScreenRendererOptions) {
    this._zoom = options?.zoom ?? 1
    this._renderer = new DOMRenderer({
      dpi: 96,
      zoom: this._zoom,
      hooks: options?.hooks,
    })
  }

  /**
   * 当前缩放倍率
   */
  get zoom(): number {
    return this._zoom
  }

  set zoom(value: number) {
    this._zoom = value
    this._renderer.zoom = value
  }

  /**
   * 内部 DOMRenderer（用于访问 registry 等）
   */
  get domRenderer(): DOMRenderer {
    return this._renderer
  }

  /**
   * 渲染 Schema 到屏幕容器
   */
  render(
    schema: TemplateSchema,
    data: Record<string, unknown>,
    container: HTMLElement,
  ): RenderResult {
    return this._renderer.render(schema, data, container)
  }

  /**
   * 销毁渲染器
   */
  destroy(): void {
    this._renderer.destroy()
  }
}
