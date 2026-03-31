# 5. Schema DSL 设计

Schema 是整个系统的中枢。它是一个纯 JSON 结构，描述模板的完整信息，包括页面设置、元素树、数据绑定和样式。

## 5.1 顶层结构

```typescript
interface TemplateSchema {
  /** Schema 版本号，遵循 SemVer */
  version: string
  /** 模板元信息 */
  meta: TemplateMeta
  /** 页面设置 */
  page: PageSettings
  /** 物料树 */
  materials: MaterialNode[]
  /** 扩展字段，供插件使用 */
  extensions?: Record<string, unknown>
}
```

## 5.2 页面设置

```typescript
interface PageSettings {
  /** 纸张尺寸，预设名或自定义 */
  paper: PaperPreset | CustomPaper
  /** 页面方向 */
  orientation: 'portrait' | 'landscape'
  /** 页边距 */
  margins: Spacing
  /** 单位（用户选择的单位，内部存储即使用该单位） */
  unit: 'mm' | 'inch' | 'pt'
  /** 背景（多层复合模型） */
  background?: PageBackground
  /**
   * 内容溢出策略（默认 'clip'）
   * - 'clip'：固定纸张尺寸，超出部分裁切隐藏
   * - 'auto-extend'：纸张高度随内容自动延长（适用于热敏纸连续打印）
   *
   * Schema 中的纸张声明（paper.height）始终不变，
   * auto-extend 仅在渲染层按实际内容高度输出。
   * 设计器画布始终显示声明高度。
   *
   * auto-extend 模式下，所有绝对定位元素的 y 坐标
   * 会在渲染时加上流式内容实际高度与声明高度的 delta 值。
   */
  overflow?: 'clip' | 'auto-extend'
}

interface CustomPaper {
  type: 'custom'
  width: number
  height: number
}

type PaperPreset =
  | 'A3' | 'A4' | 'A5' | 'A6'
  | 'B5' | 'Letter' | 'Legal'
  | { type: 'label', width: number, height: number }
```

### 5.2.1 纸张背景（多层复合模型）

纸张背景采用多层复合模型（类似 CSS 多背景 / Figma Fill 列表），支持多层叠加。每层可以是纯色或图片填充，通过联合类型判别：

```typescript
/**
 * 纸张背景 -- 多层复合模型
 * layers 数组索引 0 = 最底层，末尾 = 最上层（上层覆盖下层）。
 * 不限制层数，v1 支持 color + image 两种层类型。
 */
interface PageBackground {
  /** 背景层列表（索引 0 最底，末尾最顶） */
  layers: BackgroundLayer[]
}

/**
 * 背景层（联合类型判别）
 * 每层包含通用属性（opacity/enabled）+ 类型特有属性。
 */
type BackgroundLayer = ColorLayer | ImageLayer

/** 通用层属性 -- 所有层类型共享 */
interface BackgroundLayerBase {
  /** 层透明度（0-1，默认 1） */
  opacity?: number
  /** 是否启用（默认 true）。禁用时不渲染但保留在 Schema 中。 */
  enabled?: boolean
}

/** 纯色填充层 */
interface ColorLayer extends BackgroundLayerBase {
  type: 'color'
  /** CSS 颜色值（hex/rgb/rgba/hsl 等） */
  color: string
}

/** 图片填充层 */
interface ImageLayer extends BackgroundLayerBase {
  type: 'image'
  /** 图片 URL 或 base64 data URI */
  url: string
  /**
   * 图片缩放模式
   * - 'cover'：铺满纸张（可能裁切）
   * - 'contain'：完整显示（可能留白）
   * - 'auto'：原始尺寸
   */
  size?: 'cover' | 'contain' | 'auto'
  /** 图片重复模式（默认 'no-repeat'） */
  repeat?: 'repeat' | 'no-repeat' | 'repeat-x' | 'repeat-y'
  /**
   * 图片定位（9 宫格预设）
   * 默认 'center'。
   */
  position?: BackgroundPosition
}

/** 背景图片定位 -- 9 宫格预设值 */
type BackgroundPosition =
  | 'center'
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right'
  | 'bottom-left' | 'bottom-right'
```

#### 纸张背景关键设计决策

| 要点 | 决策 |
|------|------|
| **扩展机制** | 联合类型判别（`type` 字段区分层类型），v2 可新增 `'gradient'` / `'pattern'` 等类型 |
| **数据结构** | 多层复合 `{ layers: BackgroundLayer[] }`，不限层数 |
| **v1 层类型** | `color` + `image` |
| **通用层属性** | `opacity`（0-1）+ `enabled`（可见性开关），支持快速切换而不删除 |
| **层级顺序** | 数组索引 0 = 最底层，末尾 = 最上层（上层覆盖下层） |
| **图片来源** | 仅 URL / base64 data URI（同 image 物料的 src 属性） |
| **图片定位** | 9 宫格预设值（center / top / bottom / left / right / 四角） |
| **渲染范围** | 全纸张（含 margin 区域），背景绘制在整个页面节点上 |
| **auto-extend** | 颜色层自动延伸填充整个延长后的纸张；图片层也随纸张高度拉伸延长 |
| **输出一致性** | 所有输出目标（屏幕预览 / iframe 打印 / PDF / 图片导出）行为完全一致 |
| **图片加载失败** | 穿透到下层（自然降级），设计器中额外显示断裂图标提示用户 |
| **物料级背景** | v1 不统一，MaterialStyle.backgroundColor 保持 `string` 类型不变。新 BackgroundLayer 仅用于 PageSettings |
| **Undo 粒度** | 每个层操作（增/删/改属性/调序）独立 Command |

#### 渲染层实现

背景层按索引顺序从底到上渲染。实现方式：

1. **颜色层**：映射为 CSS `background-color`（最底层颜色）+ 上层颜色用伪元素叠加，或统一使用 CSS 多背景 `linear-gradient(color, color)` 语法。
2. **图片层**：映射为 CSS `background-image: url(...)` + `background-size` / `background-repeat` / `background-position`。
3. **多层叠加**：利用 CSS 多背景特性，按层级逆序组装 `background` 简写属性（CSS 多背景第一个在最上层，与 layers 数组方向相反）。
4. **opacity**：每层单独设 opacity 时用伪元素或多 div 叠加实现。简单场景（全色不透明 + 一层图片）可直接用 `background` 合并。
5. **enabled: false**：渲染时跳过该层。
6. **auto-extend 拉伸**：颜色层天然跟随容器尺寸；图片层在 auto-extend 时需将 `background-size` 的高度设为 `100%`（跟随容器拉伸）。
7. **position 映射**：`'top-left'` -> CSS `left top`，`'center'` -> CSS `center center`，以此类推。

#### 设计器 UI

纸张背景设置入口位于 **SidebarPanel 新增的「页面」标签页**（与图层/数据源并列），内部为单一页面设置面板，包含纸张尺寸、方向、边距、单位、背景、溢出策略等所有 PageSettings 字段。

背景部分采用 **Figma 风格垂直列表**：
- 每层一行：颜色预览方块 / 缩略图 + 类型标签 + 眼睛（enabled）开关 + 拖拽排序手柄
- 点击某层展开详细编辑面板（颜色选择器 / 图片 URL 输入 + size/repeat/position 选择）
- 底部「+」按钮添加新层（选择 color 或 image 类型）
- 拖拽排序改变层级
- 删除按钮移除层

## 5.3 物料节点

```typescript
interface MaterialNode {
  /** 全局唯一 ID */
  id: string
  /** 物料类型标识（可被插件扩展） */
  type: string
  /** 显示名称（图层面板显示） */
  name?: string
  /** 定位与尺寸 */
  layout: MaterialLayout
  /** 物料类型特有属性（由物料类型定义声明） */
  props: Record<string, unknown>
  /** 样式属性 */
  style: MaterialStyle
  /** 数据绑定配置 */
  binding?: DataBinding
  /** 条件渲染（由表达式插件提供） */
  condition?: ConditionConfig
  /** 子物料（仅容器类型） */
  children?: MaterialNode[]
  /** 锁定/隐藏状态 */
  locked?: boolean
  hidden?: boolean
  /** 扩展字段 */
  extensions?: Record<string, unknown>
}

interface MaterialLayout {
  /** 定位模式 */
  position: 'absolute' | 'flow'
  /** absolute 模式下的坐标（使用页面单位） */
  x?: number
  y?: number
  /** 尺寸 */
  width: number | 'auto'
  height: number | 'auto'
  /** 旋转角度（度） */
  rotation?: number
  /** 层级 */
  zIndex?: number
}

interface MaterialStyle {
  /** 字体 */
  fontFamily?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  /** 文本 */
  color?: string
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  lineHeight?: number
  letterSpacing?: number
  textDecoration?: 'none' | 'underline' | 'line-through'
  /** 背景 */
  backgroundColor?: string
  /** 边框 */
  border?: BorderStyle
  /** 内边距 */
  padding?: Spacing
  /** 透明度 */
  opacity?: number
}
```

## 5.4 数据绑定

```typescript
interface DataBinding {
  /**
   * 数据字段路径
   * 支持两种形式：
   *   - 标量/直接 key："customerName"、"companyAddress"（扁平取值 data[key]）
   *   - 对象数组点路径："orderItems.itemName"（从数组 map 出属性列）
   *
   * 解析策略：扁平优先（先查 key in data），fallback 到点路径拆解
   * 仅支持一层嵌套（arrayKey.field），不支持更深路径
   *
   * 绑定统一：文本物料和 data-table 列都使用 binding.path，
   * 运行时由数据类型决定行为（标量 vs 数组）。
   * data-table 列绑定的路径 resolve 后必须为数组，否则抛出错误。
   * 文本物料 resolve 到数组时，由渲染器定义降级展示策略。
   */
  path?: string
  /** 表达式（由表达式引擎插件解析） */
  expression?: string
  /** 格式化器 */
  formatter?: FormatterConfig
}
```

### 绑定模式与静态值的关系

绑定（`binding`）是物料级别的**可选**单一绑定。具体覆盖哪个 prop 由物料类型决定：

| 物料类型 | 绑定覆盖的 prop | 静态 prop |
|----------|----------------|----------|
| text | `content` | `props.content` |
| image | `src` | `props.src` |
| barcode | `value` | `props.value` |
| data-table | 各列独立 `binding` | 列标题等静态配置 |

**fallback 机制**：
- 物料无 `binding` 时，使用 `props` 中的静态值
- 物料有 `binding` 时，运行时优先使用数据源值；若数据源未填充（resolve 返回 `undefined`），降级显示 `props` 中的静态值
- 设计器中有 `binding` 的物料显示**绑定标签图层**覆盖在物料上方，需先删除绑定才能双击进入编辑
- 删除绑定后，恢复显示 `props` 中的静态值（静态值始终保留不丢失）
- 多次拖入不同数据源字段时，仅替换 `binding.path`，`props` 中的静态值不变

```typescript
  /** 格式化器类型（内置或插件注册） */
  type: string
  /** 格式化参数 */
  options?: Record<string, unknown>
}
```
