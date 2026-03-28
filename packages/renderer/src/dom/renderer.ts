import type { ElementNode, PluginHooks, TemplateSchema } from '@easyink/core'
import type { DOMRendererOptions, ElementRenderContext, Renderer, RenderResult } from '../types'
import { toPixels as coreToPixels, DataResolver, LayoutEngine } from '@easyink/core'
import { registerBuiltinRenderers } from './builtins'
import { ElementRenderRegistry } from './element-registry'
import { buildPage } from './page-builder'
import { applyLayout, applyStyle } from './style-applier'

/**
 * DOMRenderer — Schema → DOM 节点树（单页输出）
 *
 * 所有渲染场景（预览、打印、PDF、图片导出）共享此渲染器。
 * 设计器在 DOM 渲染层之上叠加交互层。
 */
export class DOMRenderer implements Renderer {
  readonly name = 'dom'

  private _dpi: number
  private _zoom: number
  private _hooks?: PluginHooks
  private _registry: ElementRenderRegistry
  private _layoutEngine: LayoutEngine
  private _resolver: DataResolver
  private _lastResult: RenderResult | null = null

  constructor(options?: DOMRendererOptions) {
    this._dpi = options?.dpi ?? 96
    this._zoom = options?.zoom ?? 1
    this._hooks = options?.hooks
    this._registry = new ElementRenderRegistry()
    this._layoutEngine = new LayoutEngine()
    this._resolver = new DataResolver()

    // 注册内置元素渲染器
    registerBuiltinRenderers(this._registry)
  }

  /**
   * 元素渲染注册表（供外部注册自定义渲染器）
   */
  get registry(): ElementRenderRegistry {
    return this._registry
  }

  /**
   * 当前缩放倍率
   */
  get zoom(): number {
    return this._zoom
  }

  set zoom(value: number) {
    this._zoom = value
  }

  /**
   * 将 Schema 渲染到目标容器
   */
  render(
    schema: TemplateSchema,
    data: Record<string, unknown>,
    container: HTMLElement,
  ): RenderResult {
    // 清理上次渲染
    this._lastResult?.dispose()

    const unit = schema.page.unit
    const toPixels = (value: number): number => coreToPixels(value, unit, this._dpi, this._zoom)

    // 1. 布局计算
    const layoutResult = this._layoutEngine.calculate(schema, data)

    // 2. 构建页面容器
    const { page, contentArea } = buildPage(schema.page, this._dpi, this._zoom)

    // 3. 渲染所有元素
    for (const element of schema.elements) {
      if (element.hidden)
        continue
      const domNode = this._renderElement(element, data, unit, toPixels, layoutResult.elements)
      if (domNode)
        contentArea.appendChild(domNode)
    }

    // 4. auto-extend 处理
    let actualHeight = toPixels(this._layoutEngine.resolvePageDimensions(schema.page).height)
    const declaredContentH = this._layoutEngine.resolvePageDimensions(schema.page).height
      - schema.page.margins.top - schema.page.margins.bottom
    const delta = layoutResult.bodyContentHeight - declaredContentH

    if (schema.page.overflow === 'auto-extend' && delta > 0) {
      const extendedHeight = toPixels(this._layoutEngine.resolvePageDimensions(schema.page).height + delta)
      page.style.height = `${extendedHeight}px`
      contentArea.style.height = `${toPixels(declaredContentH + delta)}px`
      actualHeight = extendedHeight

      // 绝对定位元素 y 偏移
      this._applyAbsoluteDeltaOffset(contentArea, schema.elements, layoutResult.elements, delta, toPixels)
    }

    // 5. 挂载到容器
    container.appendChild(page)

    const result: RenderResult = {
      page,
      actualHeight,
      dispose: () => {
        if (page.parentNode)
          page.parentNode.removeChild(page)
      },
    }

    this._lastResult = result
    return result
  }

  /**
   * 销毁渲染器
   */
  destroy(): void {
    this._lastResult?.dispose()
    this._lastResult = null
    this._registry.clear()
  }

  /**
   * 渲染单个元素（递归处理 children）
   */
  private _renderElement(
    node: ElementNode,
    data: Record<string, unknown>,
    unit: string,
    toPixels: (value: number) => number,
    layouts: Map<string, import('@easyink/core').ComputedLayout>,
  ): HTMLElement | null {
    const computedLayout = layouts.get(node.id)
    if (!computedLayout)
      return null

    // 插件钩子: beforeRender
    let processedNode = node
    if (this._hooks?.beforeRender) {
      processedNode = this._hooks.beforeRender.call(node, { data })
    }

    // 查找渲染函数
    const renderFn = this._registry.get(processedNode.type)
    if (!renderFn) {
      // 未注册的元素类型：渲染为占位 div
      const placeholder = document.createElement('div')
      placeholder.className = 'easyink-element easyink-unknown'
      placeholder.dataset.elementId = processedNode.id
      placeholder.dataset.elementType = processedNode.type
      placeholder.textContent = `[${processedNode.type}]`
      applyLayout(placeholder, computedLayout, toPixels, processedNode.layout.rotation)
      return placeholder
    }

    // 创建渲染上下文
    const context: ElementRenderContext = {
      data,
      resolver: this._resolver,
      unit: unit as any,
      dpi: this._dpi,
      zoom: this._zoom,
      toPixels,
      computedLayout,
      renderChild: (child: ElementNode) => {
        return this._renderElement(child, data, unit, toPixels, layouts) ?? document.createElement('div')
      },
    }

    // 调用渲染函数
    const el = renderFn(processedNode, context)

    // 应用样式
    applyStyle(el, processedNode.style, toPixels)

    // 应用布局定位
    applyLayout(el, computedLayout, toPixels, processedNode.layout.rotation)

    // 渲染 children（容器元素）
    if (processedNode.children) {
      for (const child of processedNode.children) {
        if (child.hidden)
          continue
        const childEl = this._renderElement(child, data, unit, toPixels, layouts)
        if (childEl)
          el.appendChild(childEl)
      }
    }

    // 插件钩子: afterRender
    if (this._hooks?.afterRender) {
      this._hooks.afterRender.call(el, processedNode)
    }

    return el
  }

  /**
   * auto-extend 模式下，对绝对定位元素的 y 坐标加上 delta
   */
  private _applyAbsoluteDeltaOffset(
    contentArea: HTMLElement,
    elements: ElementNode[],
    layouts: Map<string, import('@easyink/core').ComputedLayout>,
    delta: number,
    toPixels: (value: number) => number,
  ): void {
    for (const element of elements) {
      if (element.layout.position !== 'absolute')
        continue
      const computed = layouts.get(element.id)
      if (!computed)
        continue

      // 在 DOM 中找到对应元素并调整 top
      const domEl = contentArea.querySelector(`[data-element-id="${element.id}"]`) as HTMLElement
      if (domEl) {
        domEl.style.top = `${toPixels(computed.y + delta)}px`
      }
    }
  }
}
