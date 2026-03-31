// ─── 纸张尺寸预设（单位: mm）───

/**
 * 标准纸张尺寸映射表
 *
 * 所有尺寸均为纵向（portrait）值，横向由 LayoutEngine 自动交换宽高。
 */
export const PAPER_SIZES: Record<string, { width: number, height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  A6: { width: 105, height: 148 },
  B5: { width: 176, height: 250 },
  Legal: { width: 215.9, height: 355.6 },
  Letter: { width: 215.9, height: 279.4 },
}

// ─── 布局计算结果 ───

/**
 * 轴对齐外接矩形
 */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 单个元素的计算后布局
 *
 * 坐标相对于页面原点（左上角），使用页面单位（mm/inch/pt）。
 */
export interface ComputedLayout {
  /** 绝对 X 坐标 */
  x: number
  /** 绝对 Y 坐标 */
  y: number
  /** 计算后宽度 */
  width: number
  /** 计算后高度 */
  height: number
  /** 考虑旋转后的轴对齐外接矩形 */
  boundingBox: BoundingBox
  /** 高度为估算值，渲染层需二次 DOM 测量 */
  needsMeasure: boolean
}

/**
 * 整体布局计算结果
 */
export interface LayoutResult {
  /** 每个物料的计算后布局，key 为物料 ID */
  materials: Map<string, ComputedLayout>
  /** 流式元素的总内容高度（供 auto-extend 溢出判断） */
  bodyContentHeight: number
}

/**
 * 内容区域 — 页面去除边距后的可用空间
 */
export interface ContentArea {
  x: number
  y: number
  width: number
  height: number
}

/**
 * LayoutEngine 配置项
 */
export interface LayoutEngineOptions {
  /** auto height 元素的默认估算高度（页面单位，默认 30） */
  defaultFlowHeight?: number
}
