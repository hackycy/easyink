import type { ComputedLayout, DataResolver, ElementNode, PluginHooks, TemplateSchema, Unit } from '@easyink/core'

// ─── 渲染器接口 ───

/**
 * 渲染器接口 — 所有输出适配器必须实现
 */
export interface Renderer {
  /** 渲染器唯一标识 */
  readonly name: string

  /**
   * 将 Schema 渲染到目标容器（单页输出）
   */
  render: (
    schema: TemplateSchema,
    data: Record<string, unknown>,
    container: HTMLElement,
  ) => RenderResult

  /** 销毁渲染器，清理资源 */
  destroy: () => void
}

/**
 * 渲染结果
 */
export interface RenderResult {
  /** 渲染产生的页面 DOM 节点 */
  page: HTMLElement
  /** 实际渲染高度（CSS 像素，auto-extend 模式下可能大于声明高度） */
  actualHeight: number
  /** 销毁函数，移除 DOM 节点并清理资源 */
  dispose: () => void
}

// ─── DOMRenderer 配置 ───

/**
 * DOMRenderer 配置项
 */
export interface DOMRendererOptions {
  /** 屏幕 DPI（默认 96） */
  dpi?: number
  /** 缩放倍率（默认 1） */
  zoom?: number
  /** 可选的插件钩子（支持 beforeRender/afterRender） */
  hooks?: PluginHooks
}

// ─── 元素渲染 ───

/**
 * 元素渲染函数
 *
 * 每种元素类型对应一个渲染函数，将 ElementNode 转为 HTMLElement。
 * 渲染函数不负责布局定位（由 DOMRenderer 统一处理），
 * 只负责元素内部内容的渲染。
 */
export type ElementRenderFunction = (
  node: ElementNode,
  context: ElementRenderContext,
) => HTMLElement

/**
 * 元素渲染上下文 — 传给每个元素渲染函数
 */
export interface ElementRenderContext {
  /** 运行时数据 */
  data: Record<string, unknown>
  /** 数据解析器 */
  resolver: DataResolver
  /** 页面单位 */
  unit: Unit
  /** DPI */
  dpi: number
  /** 缩放倍率 */
  zoom: number
  /** 预绑定的单位转换函数（模板单位 → CSS 像素） */
  toPixels: (value: number) => number
  /** 当前元素的计算后布局 */
  computedLayout: ComputedLayout
  /** 渲染子元素（容器类型使用） */
  renderChild: (child: ElementNode) => HTMLElement
}

// ─── ScreenRenderer 配置 ───

/**
 * ScreenRenderer 配置项
 */
export interface ScreenRendererOptions {
  /** 缩放倍率（默认 1） */
  zoom?: number
  /** 可选的插件钩子 */
  hooks?: PluginHooks
}
