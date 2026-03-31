import type {
  MaterialNode,
  PageSettings,
  TemplateSchema,
} from '../schema'
import type {
  BoundingBox,
  ComputedLayout,
  ContentArea,
  LayoutEngineOptions,
  LayoutResult,
} from './types'
import { PAPER_SIZES } from './types'

const DEFAULT_FLOW_HEIGHT = 30

/**
 * LayoutEngine — 将 Schema 元素声明转换为具体的绝对坐标和尺寸
 *
 * 支持两种定位模式：
 * - absolute: 直接使用声明的 x/y 坐标
 * - flow: 按文档流顺序纵向堆叠
 *
 * 绝对定位元素完全脱离文档流，不影响流式元素排布。
 */
export class LayoutEngine {
  private _defaultFlowHeight: number

  constructor(options?: LayoutEngineOptions) {
    this._defaultFlowHeight = options?.defaultFlowHeight ?? DEFAULT_FLOW_HEIGHT
  }

  /**
   * 计算所有元素的最终位置和尺寸
   *
   * 1. 解析页面尺寸，确定内容区域
   * 2. 对绝对定位元素，直接使用声明坐标
   * 3. 对流式元素，按文档流顺序依次纵向布局
   * 4. 处理旋转元素的 bounding box
   */
  calculate(schema: TemplateSchema, data?: Record<string, unknown>): LayoutResult {
    const pageDimensions = this.resolvePageDimensions(schema.page)
    const { margins } = schema.page
    const contentArea: ContentArea = {
      x: margins.left,
      y: margins.top,
      width: pageDimensions.width - margins.left - margins.right,
      height: pageDimensions.height - margins.top - margins.bottom,
    }

    const materials = new Map<string, ComputedLayout>()
    let flowCursor = contentArea.y

    for (const element of schema.materials) {
      if (element.hidden)
        continue

      const result = this._layoutElement(element, contentArea, flowCursor, data)
      materials.set(element.id, result.computed)

      if (element.layout.position === 'flow')
        flowCursor = result.nextFlowY

      // 递归处理 children
      if (element.children) {
        for (const child of element.children) {
          if (child.hidden)
            continue

          const childResult = this._layoutChild(child, result.computed)
          materials.set(child.id, childResult)
        }
      }
    }

    return {
      materials,
      bodyContentHeight: flowCursor - contentArea.y,
    }
  }

  /**
   * 解析页面物理尺寸（返回页面单位值，考虑方向）
   */
  resolvePageDimensions(page: PageSettings): { width: number, height: number } {
    let width: number
    let height: number

    if (typeof page.paper === 'string') {
      const size = PAPER_SIZES[page.paper]
      if (!size)
        throw new TypeError(`Unknown paper preset: ${page.paper}`)

      width = size.width
      height = size.height
    }
    else if (page.paper.type === 'custom' || page.paper.type === 'label') {
      width = page.paper.width
      height = page.paper.height
    }
    else {
      throw new TypeError(`Invalid paper configuration`)
    }

    // landscape 交换宽高
    if (page.orientation === 'landscape')
      return { width: height, height: width }

    return { width, height }
  }

  /**
   * 估算 auto height 元素的高度
   */
  resolveAutoHeight(
    element: MaterialNode,
    _contentArea: ContentArea,
    data?: Record<string, unknown>,
  ): { height: number, needsMeasure: boolean } {
    // Table 有数据时按行数估算
    if (element.type === 'table' && data && element.binding?.path) {
      const path = element.binding.path
      const arrayKey = path.includes('.') ? path.split('.')[0] : path
      const source = data[arrayKey]

      if (Array.isArray(source)) {
        const rowHeight = typeof element.props.rowHeight === 'number'
          ? element.props.rowHeight
          : this._defaultFlowHeight
        const headerHeight = rowHeight
        return {
          height: headerHeight + source.length * rowHeight,
          needsMeasure: true,
        }
      }
    }

    return { height: this._defaultFlowHeight, needsMeasure: true }
  }

  /**
   * 计算旋转后的轴对齐外接矩形 (AABB)
   */
  computeBoundingBox(
    x: number,
    y: number,
    w: number,
    h: number,
    rotation?: number,
  ): BoundingBox {
    if (!rotation || rotation === 0)
      return { x, y, width: w, height: h }

    const rad = (rotation * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))

    const newWidth = w * cos + h * sin
    const newHeight = w * sin + h * cos

    const cx = x + w / 2
    const cy = y + h / 2

    return {
      x: cx - newWidth / 2,
      y: cy - newHeight / 2,
      width: newWidth,
      height: newHeight,
    }
  }

  // ── 内部方法 ──

  private _layoutElement(
    element: MaterialNode,
    contentArea: ContentArea,
    flowCursor: number,
    data?: Record<string, unknown>,
  ): { computed: ComputedLayout, nextFlowY: number } {
    const { layout } = element

    if (layout.position === 'absolute') {
      return this._layoutAbsolute(element, contentArea)
    }

    return this._layoutFlow(element, contentArea, flowCursor, data)
  }

  private _layoutAbsolute(
    element: MaterialNode,
    contentArea: ContentArea,
  ): { computed: ComputedLayout, nextFlowY: number } {
    const { layout } = element
    const x = layout.x ?? 0
    const y = layout.y ?? 0

    let width: number
    let height: number
    let needsMeasure = false

    if (layout.width === 'auto') {
      width = contentArea.width
      needsMeasure = true
    }
    else {
      width = layout.width
    }

    if (layout.height === 'auto') {
      height = this._defaultFlowHeight
      needsMeasure = true
    }
    else {
      height = layout.height
    }

    const boundingBox = this.computeBoundingBox(x, y, width, height, layout.rotation)

    return {
      computed: { x, y, width, height, boundingBox, needsMeasure },
      nextFlowY: 0, // absolute 不影响 flow cursor
    }
  }

  private _layoutFlow(
    element: MaterialNode,
    contentArea: ContentArea,
    flowCursor: number,
    data?: Record<string, unknown>,
  ): { computed: ComputedLayout, nextFlowY: number } {
    const { layout } = element
    const x = contentArea.x
    const y = flowCursor

    const width = layout.width === 'auto'
      ? contentArea.width
      : layout.width

    let height: number
    let needsMeasure: boolean

    if (layout.height === 'auto') {
      const resolved = this.resolveAutoHeight(element, contentArea, data)
      height = resolved.height
      needsMeasure = resolved.needsMeasure
    }
    else {
      height = layout.height
      needsMeasure = false
    }

    const boundingBox = this.computeBoundingBox(x, y, width, height, layout.rotation)

    return {
      computed: { x, y, width, height, boundingBox, needsMeasure },
      nextFlowY: y + height,
    }
  }

  /**
   * 子元素布局 — 相对于父元素定位
   *
   * children 的坐标系以父元素左上角为原点。
   */
  private _layoutChild(
    child: MaterialNode,
    parentLayout: ComputedLayout,
  ): ComputedLayout {
    const { layout } = child
    const x = parentLayout.x + (layout.x ?? 0)
    const y = parentLayout.y + (layout.y ?? 0)

    let width: number
    let height: number
    let needsMeasure = false

    if (layout.width === 'auto') {
      width = parentLayout.width
      needsMeasure = true
    }
    else {
      width = layout.width
    }

    if (layout.height === 'auto') {
      height = this._defaultFlowHeight
      needsMeasure = true
    }
    else {
      height = layout.height
    }

    const boundingBox = this.computeBoundingBox(x, y, width, height, layout.rotation)

    return { x, y, width, height, boundingBox, needsMeasure }
  }
}
