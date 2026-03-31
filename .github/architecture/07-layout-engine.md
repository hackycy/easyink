# 7. 布局引擎

## 7.1 混合布局模型

支持绝对定位和流式布局共存，每个元素可独立选择定位模式。
**绝对定位元素完全脱离文档流，不影响流式元素排布**（同 CSS absolute 行为）。

```
┌─────────────────────────────────────┐
│  Page                               │
│  ┌────────────────────────────────┐ │
│  │ Content Area (margins内)       │ │
│  │   [Absolute: Logo]  [Abs: 印章]│ │
│  │   ┌──────────────────────┐     │ │
│  │   │ Flow: 标题文本       │     │ │
│  │   ├──────────────────────┤     │ │
│  │   │ Flow: 动态表格       │     │ │
│  │   │   ...rows...         │     │ │
│  │   ├──────────────────────┤     │ │
│  │   │ Flow: 签名区         │     │ │
│  │   └──────────────────────┘     │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

LayoutEngine 纯粹做单页布局计算，不涉及分页和区域分配。
当 `page.overflow = 'auto-extend'` 时，渲染层根据 `bodyContentHeight` 判断是否需要延长纸张输出高度，
并对所有绝对定位元素的 y 坐标加上 delta（= bodyContentHeight - 声明内容区高度，若 > 0）。

## 7.2 布局计算流程

```typescript
class LayoutEngine {
  constructor(options?: LayoutEngineOptions)

  /**
   * 计算所有元素的最终位置和尺寸
   *
   * 1. 解析页面尺寸（PAPER_SIZES 查表 + orientation），计算内容区域
   * 2. 对绝对定位元素，直接使用声明坐标
   * 3. 对流式元素，按文档流顺序依次纵向布局（绝对元素不影响流式游标）
   * 4. 处理 auto 尺寸：width auto → 内容区宽度，height auto → 估算值 + needsMeasure
   * 5. 处理旋转元素的 bounding box（AABB）计算
   */
  calculate(schema: TemplateSchema, data?: Record<string, unknown>): LayoutResult

  /** 解析页面物理尺寸（考虑纸张预设 + 方向） */
  resolvePageDimensions(page: PageSettings): { width: number, height: number }

  /** 估算 auto height（data-table 按行数估算，其他用默认值） */
  resolveAutoHeight(material: MaterialNode, contentArea: ContentArea, data?: Record<string, unknown>): { height: number, needsMeasure: boolean }

  /** 计算旋转后的轴对齐外接矩形 */
  computeBoundingBox(x: number, y: number, w: number, h: number, rotation?: number): BoundingBox
}

/** 纸张尺寸预设映射（mm，portrait 值） */
const PAPER_SIZES: Record<string, { width: number, height: number }>

interface LayoutEngineOptions {
  /** auto height 元素的默认估算高度（页面单位，默认 30） */
  defaultFlowHeight?: number
}

interface LayoutResult {
  /** 每个元素的计算后布局信息 */
  elements: Map<string, ComputedLayout>
  /** 流式元素的总内容高度（用于 auto-extend 溢出判断） */
  bodyContentHeight: number
}

interface ComputedLayout {
  /** 计算后的绝对坐标（相对于页面原点，页面单位） */
  x: number
  y: number
  /** 计算后的实际尺寸 */
  width: number
  height: number
  /** bounding box（考虑旋转后的外接矩形） */
  boundingBox: { x: number, y: number, width: number, height: number }
  /** 高度为估算值，渲染层需二次 DOM 测量 */
  needsMeasure: boolean
}
```
