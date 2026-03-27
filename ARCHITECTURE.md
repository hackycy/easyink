# EasyInk Architecture

> 前端打印模板设计器库 — 基于 Vue 3 + TypeScript + pnpm monorepo

---

## 目录

1. [项目概览](#1-项目概览)
2. [核心场景](#2-核心场景)
3. [Monorepo 包结构](#3-monorepo-包结构)
4. [分层架构](#4-分层架构)
5. [Schema DSL 设计](#5-schema-dsl-设计)
6. [渲染管线](#6-渲染管线)
7. [布局引擎](#7-布局引擎)
8. [分页引擎](#8-分页引擎)
9. [数据源系统](#9-数据源系统)
10. [表达式引擎](#10-表达式引擎)
11. [插件系统](#11-插件系统)
12. [设计器交互层](#12-设计器交互层)
13. [元素体系](#13-元素体系)
14. [Command 与撤销/重做](#14-command-与撤销重做)
15. [单位系统](#15-单位系统)
16. [字体管理](#16-字体管理)
17. [PDF 生成管线](#17-pdf-生成管线)
18. [国际化](#18-国际化)
19. [Schema 版本迁移](#19-schema-版本迁移)
20. [构建与产物](#20-构建与产物)
21. [测试策略](#21-测试策略)
22. [性能策略](#22-性能策略)
23. [安全模型](#23-安全模型)
24. [关键设计决策记录](#24-关键设计决策记录)

---

## 1. 项目概览

EasyInk 是一个面向开发者的打印模板设计器库，提供可视化设计器和 Schema 驱动的渲染引擎。其设计目标是让业务系统能够快速集成打印模板的设计、数据填充和多格式输出能力。

### 设计原则

- **Schema 驱动**: 所有模板以 JSON Schema 描述，是唯一的真相来源（Single Source of Truth）
- **分层解耦**: headless 核心层与 UI 层分离，核心可独立使用
- **插件优先**: 全生命周期插件体系，从元素类型到渲染管线均可扩展
- **类型安全**: 全量 TypeScript，完整的类型导出，为插件开发者提供一流的 DX

### 技术栈

| 层面     | 选型                           |
| -------- | ------------------------------ |
| 框架     | Vue 3（Composition API）       |
| 语言     | TypeScript（strict mode）      |
| 构建     | tsdown + rollup-plugin-vue     |
| 包管理   | pnpm workspace（monorepo）     |
| 状态管理 | Vue Reactivity（@vue/reactivity） |
| 测试     | Vitest（单元）+ Playwright（E2E）|
| 样式     | CSS Variables + Scoped CSS     |
| 代码规范 | ESLint（@antfu/eslint-config） |

---

## 2. 核心场景

EasyInk 的 Schema 和引擎设计需要覆盖以下四类典型打印场景，它们对分页、精度、性能的要求各不相同：

| 场景 | 典型案例 | 分页 | 精度要求 | 数据复杂度 |
|------|----------|------|----------|------------|
| **标签/小票** | 快递单、60x40mm 标签、超市价签 | 固定单页 | 极高（mm 级定位） | 低 |
| **商业单据** | 发票、合同、送货单 | 可能分页 | 高 | 中（动态表格） |
| **复杂报表** | 财务报表、统计报告 | 必定多页 | 中 | 高（大量表格+续表） |
| **证书/证件** | 毕业证、奖状、工作证 | 固定单页 | 高（视觉设计要求高） | 低 |

---

## 3. Monorepo 包结构

采用粗粒度拆分策略（3-5 个核心包），确保关注点分离的同时保持可管理性：

```
easyink/
├── packages/
│   ├── core/                  # @easyink/core — 框架无关的核心引擎
│   │   ├── src/
│   │   │   ├── schema/        # Schema 定义、校验、操作
│   │   │   ├── engine/        # 布局引擎、分页引擎
│   │   │   ├── expression/    # 表达式沙箱、可插拔引擎接口
│   │   │   ├── plugin/        # 插件系统、钩子体系
│   │   │   ├── command/       # Command 模式、撤销/重做栈
│   │   │   ├── datasource/    # 数据源注册、命名空间隔离、路径解析
│   │   │   ├── units/         # 单位系统、转换工具
│   │   │   ├── elements/      # 内置元素类型定义
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── renderer/              # @easyink/renderer — DOM 渲染器 + 输出适配
│   │   ├── src/
│   │   │   ├── dom/           # DOM 渲染核心
│   │   │   ├── print/         # iframe 隔离打印
│   │   │   ├── pdf/           # PDF 生成管线（可插拔）
│   │   │   ├── image/         # 图片导出
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── designer/              # @easyink/designer — 可视化设计器 Vue 组件
│   │   ├── src/
│   │   │   ├── components/    # 设计器 Vue 组件（画布、工具栏、属性面板...）
│   │   │   ├── composables/   # Vue Composable 封装
│   │   │   ├── interaction/   # 拖拽、对齐、选择、旋转等交互逻辑
│   │   │   ├── panels/        # 属性面板、图层面板、数据源面板
│   │   │   ├── locale/        # 默认中文语言包
│   │   │   ├── theme/         # CSS 变量主题
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── shared/                # @easyink/shared — 共享工具与类型
│       ├── src/
│       │   ├── types/         # 公共 TypeScript 类型
│       │   ├── utils/         # 通用工具函数
│       │   └── index.ts
│       └── package.json
│
├── playground/                # 开发 playground（Vite 应用）
├── examples/                  # 使用示例
├── docs/                      # 文档站点
└── e2e/                       # E2E 测试
```

### 包依赖关系

```
@easyink/shared       ← 无依赖，纯工具与类型
    ↑
@easyink/core         ← 依赖 shared；核心逻辑层
    ↑
@easyink/renderer     ← 依赖 core + shared；渲染输出层
    ↑
@easyink/designer     ← 依赖 core + renderer + shared；完整设计器 UI
```

**消费方式**：
- 只需渲染/打印：`npm install @easyink/renderer`（自动引入 core）
- 需要设计器：`npm install @easyink/designer`（自动引入全部）
- 需要操作 Schema：`npm install @easyink/core`

---

## 4. 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    Consumer Application                  │
├─────────────────────────────────────────────────────────┤
│  @easyink/designer  (Vue 组件 + Composables)            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  设计器 UI：画布、工具栏、属性面板、图层面板      │   │
│  │  交互层：拖拽、对齐、选择、缩放、旋转            │   │
│  │  数据源面板：开发方注册的字段树、数据绑定 UI        │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/renderer  (DOM 渲染 + 输出适配器)             │
│  ┌──────────────────────────────────────────────────┐   │
│  │  DOMRenderer：Schema → DOM 节点树                │   │
│  │  PrintAdapter：iframe 隔离打印                    │   │
│  │  PDFPipeline：可插拔 PDF 生成                    │   │
│  │  ImageExporter：Canvas 截图导出                   │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/core  (框架无关的核心引擎)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SchemaEngine：Schema CRUD、校验、遍历           │   │
│  │  LayoutEngine：混合布局计算                      │   │
│  │  PaginationEngine：混合分页 + 区域锁定           │   │
│  │  ExpressionEngine：沙箱化表达式求值              │   │
│  │  DataSourceManager：数据源注册、命名空间隔离、路径解析  │   │
│  │  PluginManager：钩子注册、生命周期管理            │   │
│  │  CommandManager：撤销/重做栈                     │   │
│  │  UnitManager：单位存储与转换                     │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  @easyink/shared  (类型 + 工具)                         │
└─────────────────────────────────────────────────────────┘
```

### API 暴露风格：混合模式

核心层使用 Class 实例管理状态和生命周期，Vue 层提供 Composable 封装：

```typescript
// --- Core 层：Class 实例 ---
import { EasyInkEngine } from '@easyink/core'

const engine = new EasyInkEngine({
  schema: loadedSchema,
  plugins: [barcodePlugin(), watermakrPlugin()],
})

engine.on('schema:change', (schema) => { /* ... */ })
engine.setData(orderData)
const pages = engine.paginate()

// --- Vue 层：Composable 封装 ---
import { useDesigner } from '@easyink/designer'

const {
  canvas,      // ref: 画布实例
  selected,    // ref: 当前选中元素
  schema,      // reactive: 当前 Schema
  undo,        // () => void
  redo,        // () => void
} = useDesigner({
  schema: initialSchema,
  plugins: [barcodePlugin()],
})
```

---

## 5. Schema DSL 设计

Schema 是整个系统的中枢。它是一个纯 JSON 结构，描述模板的完整信息，包括页面设置、元素树、数据绑定和样式。

### 5.1 顶层结构

```typescript
interface TemplateSchema {
  /** Schema 版本号，遵循 SemVer */
  version: string
  /** 模板元信息 */
  meta: TemplateMeta
  /** 页面设置 */
  page: PageSettings
  /** 页面区域定义 */
  regions: RegionDefinition[]
  /** 元素树 */
  elements: ElementNode[]
  /** 扩展字段，供插件使用 */
  extensions?: Record<string, unknown>
}
```

### 5.2 页面设置

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
  /** 背景 */
  background?: BackgroundStyle
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

### 5.3 区域模型

页面分为三个区域 slot，分页只对正文区域生效，页眉页脚每页重复：

```typescript
interface RegionDefinition {
  /** 区域类型 */
  type: 'header' | 'body' | 'footer'
  /** 区域高度（使用页面单位） */
  height: number | 'auto'
  /** 该区域内的元素 ID 列表 */
  elementIds: string[]
  /** 是否每页重复（header/footer 默认 true） */
  repeatOnPage?: boolean
}
```

### 5.4 元素节点

```typescript
interface ElementNode {
  /** 全局唯一 ID */
  id: string
  /** 元素类型标识（可被插件扩展） */
  type: string
  /** 显示名称（图层面板显示） */
  name?: string
  /** 定位与尺寸 */
  layout: ElementLayout
  /** 元素类型特有属性（由元素类型定义声明） */
  props: Record<string, unknown>
  /** 样式属性 */
  style: ElementStyle
  /** 数据绑定配置 */
  binding?: DataBinding
  /** 条件渲染（由表达式插件提供） */
  condition?: ConditionConfig
  /** 子元素（仅容器类型） */
  children?: ElementNode[]
  /** 分页行为 */
  pagination?: ElementPaginationConfig
  /** 锁定/隐藏状态 */
  locked?: boolean
  hidden?: boolean
  /** 扩展字段 */
  extensions?: Record<string, unknown>
}

interface ElementLayout {
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

interface ElementStyle {
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

### 5.5 数据绑定

```typescript
interface DataBinding {
  /**
   * 数据路径表达式，使用命名空间隔离
   * 普通元素：完整路径，如 "order.customer.name"、"company.address"
   * 表格列 dataPath：相对于循环变量的路径，如 "name"、"quantity"
   */
  path?: string
  /** 表达式（由表达式引擎插件解析） */
  expression?: string
  /** 格式化器 */
  formatter?: FormatterConfig
  /**
   * 循环绑定（用于表格，仅支持单层 repeat，不支持嵌套）
   */
  repeat?: {
    /** 数据源路径（必须指向数组，使用完整命名空间路径，如 "order.items"） */
    source: string
    /** 循环变量名，默认 "item" */
    itemAlias?: string
    /** 索引变量名，默认 "index" */
    indexAlias?: string
  }
}

interface FormatterConfig {
  /** 格式化器类型（内置或插件注册） */
  type: string
  /** 格式化参数 */
  options?: Record<string, unknown>
}
```

### 5.6 元素分页配置

```typescript
interface ElementPaginationConfig {
  /** 分页行为 */
  behavior: 'normal' | 'fixed' | 'locked-to-last-page' | 'locked-to-every-page'
  /** 跨页时是否保持可见（如表格的表头续打） */
  repeatOnBreak?: boolean
  /** 禁止在此元素内部分页（如签名区） */
  avoidBreakInside?: boolean
}
```

---

## 6. 渲染管线

### 6.1 统一 DOM 渲染策略

所有渲染场景（设计器画布、打印预览、PDF 生成、图片导出）共享同一套 DOM 渲染代码。设计器在 DOM 渲染层之上叠加交互层。

```
Schema JSON
    │
    ▼
┌─────────────┐     ┌──────────────┐
│ SchemaEngine │────▶│ DataResolver │── 数据填充
└─────────────┘     └──────────────┘
    │                       │
    ▼                       ▼
┌──────────────┐    ┌──────────────┐
│ LayoutEngine │    │ Expression   │── 表达式求值
│              │    │ Engine       │
└──────────────┘    └──────────────┘
    │
    ▼
┌───────────────────┐
│ PaginationEngine  │── 分页计算
└───────────────────┘
    │
    ▼
┌───────────────────┐
│   DOMRenderer     │── DOM 节点树生成
└───────────────────┘
    │
    ├──▶ 设计器画布（叠加交互层）
    ├──▶ 打印预览（iframe 隔离）
    ├──▶ PDF 生成（可插拔管线）
    └──▶ 图片导出（html-to-canvas）
```

### 6.2 渲染器接口

```typescript
/**
 * 渲染器接口 — 所有输出适配器必须实现
 */
interface Renderer {
  /** 渲染器唯一标识 */
  readonly name: string

  /**
   * 将 Schema 渲染到目标容器
   * @param schema - 模板 Schema（可能已分页）
   * @param data - 填充数据
   * @param container - 目标容器（DOM 元素或虚拟容器）
   */
  render(schema: TemplateSchema, data: Record<string, unknown>, container: HTMLElement): RenderResult

  /** 销毁渲染结果，清理资源 */
  destroy(): void
}

interface RenderResult {
  /** 渲染产生的页面 DOM 节点列表 */
  pages: HTMLElement[]
  /** 总页数 */
  pageCount: number
  /** 销毁函数 */
  dispose: () => void
}
```

### 6.3 多输出目标适配

```typescript
/** 屏幕预览渲染器 */
class ScreenRenderer implements Renderer { /* ... */ }

/** 打印适配器 — 默认 iframe 隔离 */
class PrintAdapter {
  print(renderResult: RenderResult, options?: PrintOptions): Promise<void>
}

/** PDF 生成器 — 可插拔 */
interface PDFGenerator {
  generate(renderResult: RenderResult, options?: PDFOptions): Promise<Blob | ArrayBuffer>
}

/** 图片导出器 */
class ImageExporter {
  export(renderResult: RenderResult, options?: ImageOptions): Promise<Blob>
}
```

---

## 7. 布局引擎

### 7.1 混合布局模型

支持绝对定位和流式布局共存，每个元素可独立选择定位模式：

```
┌─────────────────────────────────────┐
│  Page                               │
│  ┌────────────────────────────────┐ │
│  │ Header Region (absolute)       │ │
│  │   [Logo]          [Title]      │ │
│  │   [Date]                       │ │
│  └────────────────────────────────┘ │
│  ┌────────────────────────────────┐ │
│  │ Body Region (mixed)            │ │
│  │   [Absolute: 印章]             │ │
│  │   ┌──────────────────────┐     │ │
│  │   │ Flow: 动态表格       │     │ │
│  │   │   ...rows...         │     │ │
│  │   └──────────────────────┘     │ │
│  │   [Flow: 签名区]               │ │
│  └────────────────────────────────┘ │
│  ┌────────────────────────────────┐ │
│  │ Footer Region (absolute)       │ │
│  │   [Page Number]                │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 7.2 布局计算流程

```typescript
class LayoutEngine {
  /**
   * 计算所有元素的最终位置和尺寸
   *
   * 1. 解析区域定义，确定各区域的可用空间
   * 2. 对绝对定位元素，直接使用声明坐标
   * 3. 对流式元素，按文档流顺序依次布局
   * 4. 处理混合场景：流式元素排布时跳过绝对定位元素的占位区域
   * 5. 处理旋转元素的 bounding box 计算
   */
  calculate(schema: TemplateSchema, data?: Record<string, unknown>): LayoutResult
}

interface LayoutResult {
  /** 每个元素的计算后布局信息 */
  elements: Map<string, ComputedLayout>
  /** 正文区域的总内容高度（用于分页判断） */
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
}
```

---

## 8. 分页引擎

### 8.1 混合分页策略

分页引擎在元素级别支持不同的分页行为。核心逻辑：

1. **Header/Footer 区域**：每页重复渲染，占用固定空间
2. **Body 区域**：正文内容的可用高度 = 页面高度 - 页边距 - Header高度 - Footer高度
3. **流式元素**：当超出可用高度时自动分页，后续元素顺延
4. **绝对定位元素**：根据 `pagination` 配置处理
5. **区域锁定**：标记为 `locked-to-last-page` 的元素始终出现在最后一页
6. **续表**：标记为 `repeatOnBreak` 的表头在每页重复

### 8.2 分页算法

```typescript
class PaginationEngine {
  /**
   * 核心分页算法
   *
   * 输入：LayoutResult（单页完整布局） + Schema
   * 输出：PageBreakResult（分页后的多页布局）
   */
  paginate(layout: LayoutResult, schema: TemplateSchema): PageBreakResult

  /**
   * 分页流程：
   *
   * 1. 计算每页可用区域高度
   *    availableHeight = page.height - margins.top - margins.bottom
   *                      - header.height - footer.height
   *
   * 2. 遍历 body 区域的流式元素，累加高度
   *    - 当累计高度超出 availableHeight，触发分页
   *    - 特殊处理：表格行不允许被截断，在行边界处分页
   *    - 特殊处理：avoidBreakInside 的元素整体移到下一页
   *    - 特殊处理：单行高度超过整页可用高度时，强制截断（overflow: hidden）并打印 warning
   *
   * 3. 处理表格续打
   *    - 如果表格配置了 repeatOnBreak，在新页顶部重复表头行
   *    - 续打表头占用新页的可用空间
   *    - 汇总行（summary）仅出现在最后一页，聚合范围为完整数据集
   *
   * 4. 多表格排列
   *    - 多个流式 Table 元素按文档流顺序依次排列
   *    - 前一个表格分页后，后续表格从剩余空间开始
   *    - 剩余空间不足时新开一页
   *
   * 4. 处理区域锁定元素
   *    - locked-to-every-page：复制到每一页的指定位置
   *    - locked-to-last-page：只放在最后一页
   *    - 锁定元素的空间从该页可用区域中扣除
   *
   * 5. 处理绝对定位元素
   *    - behavior: 'normal'：只出现在元素坐标所在的页面
   *    - behavior: 'fixed'：不跟随分页变化，固定在每页相同位置
   *
   * 6. 生成页码信息供 {{ pageNumber }} / {{ totalPages }} 使用
   */
}

interface PageBreakResult {
  /** 分页后各页的元素列表 */
  pages: PageContent[]
  /** 总页数 */
  totalPages: number
}

interface PageContent {
  /** 页码（从 1 开始） */
  pageNumber: number
  /** 该页包含的元素及其计算位置 */
  elements: PageElement[]
  /** 该页的 header 元素 */
  headerElements: PageElement[]
  /** 该页的 footer 元素 */
  footerElements: PageElement[]
}
```

### 8.3 表格跨页示例

```
Page 1:                      Page 2:                      Page 3:
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ [Header Region]  │         │ [Header Region]  │         │ [Header Region]  │
├──────────────────┤         ├──────────────────┤         ├──────────────────┤
│ ┌──────────────┐ │         │ ┌──────────────┐ │         │ ┌──────────────┐ │
│ │ 表头（原始） │ │         │ │ 表头（续打） │ │         │ │ 表头（续打） │ │
│ ├──────────────┤ │         │ ├──────────────┤ │         │ ├──────────────┤ │
│ │ Row 1-15     │ │         │ │ Row 16-30    │ │         │ │ Row 31-42    │ │
│ │              │ │         │ │              │ │         │ └──────────────┘ │
│ └──────────────┘ │         │ └──────────────┘ │         │                  │
│                  │         │                  │         │ [签名区 ← locked │
│                  │         │                  │         │  to last page]   │
├──────────────────┤         ├──────────────────┤         ├──────────────────┤
│ [Footer Region]  │         │ [Footer Region]  │         │ [Footer Region]  │
│ Page 1/3         │         │ Page 2/3         │         │ Page 3/3         │
└──────────────────┘         └──────────────────┘         └──────────────────┘
```

---

## 9. 数据源系统

### 9.1 开发方注册驱动

数据源结构由集成方（开发者）在初始化时注册，而非模板设计用户定义。`TemplateSchema` 中不存储 `dataSource`，元素仅通过 `binding.path` 引用数据字段。

**核心流程：**

1. 开发方通过 `registerDataSource()` 注册一个或多个数据源（如"订单"、"公司信息"）
2. 设计器左侧展示字段树，按数据源分组
3. 用户从字段树拖拽字段到画布元素上完成绑定
4. 拖拽数组类型字段时，自动创建 Table 元素并根据子字段生成列定义
5. 运行时通过 `engine.setData()` 传入各命名空间的实际数据

### 9.2 数据源注册接口

```typescript
/**
 * 数据源注册项 — 由集成方（开发者）提供
 */
interface DataSourceRegistration {
  /** 数据源唯一标识（同时作为命名空间前缀） */
  name: string
  /** 显示名称（字段树分组标题） */
  displayName: string
  /** 图标（字段树分组图标） */
  icon?: string | Component
  /** 字段定义（描述该数据源的结构） */
  fields: DataFieldSchema
  /** 数据源分组（可选，用于字段树的二级分组） */
  group?: string
}

interface DataFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  title?: string           // 字段显示名称
  description?: string     // 字段说明
  format?: string          // 格式提示（date、currency、email 等）
  properties?: Record<string, DataFieldSchema>  // object 子字段
  items?: DataFieldSchema  // array 元素类型
}
```

### 9.3 注册 API

```typescript
// --- 初始化时注册 ---
const engine = new EasyInkEngine({
  dataSources: [
    {
      name: 'order',
      displayName: '订单数据',
      icon: 'order-icon',
      fields: {
        type: 'object',
        properties: {
          orderNo: { type: 'string', title: '订单号' },
          customer: {
            type: 'object', title: '客户信息',
            properties: {
              name: { type: 'string', title: '客户名称' },
              phone: { type: 'string', title: '联系电话' },
            },
          },
          items: {
            type: 'array', title: '订单明细',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', title: '商品名称' },
                quantity: { type: 'number', title: '数量' },
                price: { type: 'number', title: '单价' },
                amount: { type: 'number', title: '金额' },
              },
            },
          },
        },
      },
    },
    {
      name: 'company',
      displayName: '公司信息',
      icon: 'company-icon',
      fields: {
        type: 'object',
        properties: {
          name: { type: 'string', title: '公司名称' },
          address: { type: 'string', title: '公司地址' },
          logo: { type: 'string', title: '公司Logo', format: 'image' },
        },
      },
    },
  ],
})

// --- 运行时替换数据源（如业务模块切换） ---
engine.unregisterDataSource('order')
engine.registerDataSource({
  name: 'invoice',
  displayName: '发票数据',
  fields: { /* ... */ },
})
```

### 9.4 命名空间隔离与数据填充

多个数据源通过命名空间隔离，元素绑定路径使用 `数据源名.字段路径` 的完整路径：

```typescript
// 元素绑定示例
{
  binding: { path: 'order.customer.name' }      // 订单 → 客户名称
}
{
  binding: { path: 'company.logo' }              // 公司 → Logo
}
{
  binding: {
    repeat: { source: 'order.items' },           // 表格循环：完整命名空间路径
  }
}
// 表格列中的 dataPath 使用相对于 item 的路径
{
  dataPath: 'name'                                // 相对于 order.items[] 的 name
}

// --- 运行时数据填充 ---
engine.setData({
  order: {
    orderNo: 'ORD-2024-001',
    customer: { name: '张三', phone: '13800138000' },
    items: [
      { name: '商品A', quantity: 2, price: 100, amount: 200 },
      { name: '商品B', quantity: 1, price: 50, amount: 50 },
    ],
  },
  company: {
    name: 'ACME 公司',
    address: '北京市朝阳区xxx',
    logo: 'https://example.com/logo.png',
  },
})
```

### 9.5 数据解析器

```typescript
/**
 * 数据解析器 — 负责从数据对象中提取值
 */
class DataResolver {
  /**
   * 根据命名空间路径从数据中提取值
   * 支持命名空间：order.customer.name → data.order.customer.name
   * 支持数组索引：order.items[0].name
   * 支持循环上下文：在 repeat 内部，item.name 从当前行数据取值
   *
   * 安全性：禁止访问 __proto__、constructor、prototype（防原型链污染）
   */
  resolve(path: string, data: Record<string, unknown>, context?: RepeatContext): unknown

  /**
   * 格式化输出值
   */
  format(value: unknown, formatter: FormatterConfig): string

  /**
   * 容错策略：
   * - 路径指向 undefined：返回空字符串
   * - repeat.source 指向非数组值：视为空数组，按 emptyBehavior 配置处理
   * - 路径解析异常：返回空字符串，控制台打印 warning
   */
}
```

---

## 10. 表达式引擎

### 10.1 可插拔架构

核心只提供路径绑定（`order.name` 直接解析），表达式引擎作为插件扩展：

```typescript
/**
 * 表达式引擎接口 — 由插件实现
 */
interface ExpressionEngine {
  /** 引擎标识 */
  readonly name: string

  /**
   * 编译表达式为可执行函数
   * @param expression - 表达式字符串，如 "price * quantity"
   * @returns 编译后的执行函数
   */
  compile(expression: string): CompiledExpression

  /**
   * 执行已编译的表达式
   * @param compiled - 编译结果
   * @param context - 数据上下文（沙箱化）
   */
  execute(compiled: CompiledExpression, context: ExpressionContext): unknown

  /**
   * 校验表达式语法
   */
  validate(expression: string): ValidationResult
}

interface ExpressionContext {
  /** 数据源数据 */
  data: Record<string, unknown>
  /** 循环上下文 */
  repeat?: RepeatContext
  /** 页面信息 */
  page: { number: number, total: number }
  /** 白名单工具函数 */
  helpers: Record<string, Function>
}
```

### 10.2 沙箱化执行

默认的表达式引擎必须在受限沙箱中执行，安全策略：

```typescript
interface SandboxConfig {
  /** 允许访问的全局对象白名单 */
  allowedGlobals: string[]  // 默认: ['Math', 'Date', 'Number', 'String', 'Array', 'Object', 'JSON']

  /** 禁止的语法结构 */
  disallowedSyntax: string[]  // 默认: ['FunctionExpression', 'ArrowFunctionExpression', 'NewExpression', 'ImportExpression']

  /** 最大执行时间（ms） */
  timeout: number  // 默认: 100

  /** 最大递归深度 */
  maxDepth: number  // 默认: 10
}
```

实现策略：
- 使用 AST 解析表达式，拦截危险语法
- 在 `new Function()` 的受限作用域中执行，不暴露 `window`/`globalThis`
- 表达式只能访问数据上下文和白名单 helper 函数
- 对无限循环/深递归设置执行超时

### 10.3 内置格式化器

```typescript
// 内置格式化器类型
type BuiltinFormatters =
  | { type: 'currency', options: { locale?: string, currency?: string, decimals?: number } }
  | { type: 'date', options: { format: string } }  // e.g. 'YYYY-MM-DD'
  | { type: 'number', options: { decimals?: number, thousandsSeparator?: boolean } }
  | { type: 'uppercase' }
  | { type: 'lowercase' }
  | { type: 'pad', options: { length: number, char?: string, direction?: 'left' | 'right' } }
```

---

## 11. 插件系统

### 11.1 插件定义

```typescript
interface EasyInkPlugin {
  /** 插件唯一标识 */
  name: string
  /** 插件版本 */
  version?: string
  /** 依赖的其他插件 */
  dependencies?: string[]

  /**
   * 插件安装方法
   * @param context - 插件上下文，提供所有注册 API
   */
  install(context: PluginContext): void | (() => void)
}

/**
 * 工厂函数模式（推荐的插件编写方式）
 */
function barcodePlugin(options?: BarcodePluginOptions): EasyInkPlugin {
  return {
    name: 'barcode',
    install(ctx) {
      // 注册元素类型
      ctx.elements.register(barcodeElementType)
      // 注册属性编辑器
      ctx.editors.register('barcode-editor', BarcodeEditor)
      // 注册渲染钩子
      ctx.hooks.beforeRender.tap('barcode', (element) => { /* ... */ })
    },
  }
}
```

### 11.2 插件上下文 API

```typescript
interface PluginContext {
  // ─── 元素注册 ───
  elements: {
    /** 注册自定义元素类型 */
    register(definition: ElementTypeDefinition): void
    /** 获取已注册的元素类型 */
    get(type: string): ElementTypeDefinition | undefined
  }

  // ─── 属性编辑器注册 ───
  editors: {
    /** 注册自定义属性编辑器组件 */
    register(name: string, component: Component): void
  }

  // ─── 工具栏扩展 ───
  toolbar: {
    /** 添加工具栏按钮/分组 */
    addItem(item: ToolbarItem): void
    /** 添加右键菜单项 */
    addContextMenuItem(item: ContextMenuItem): void
  }

  // ─── 面板扩展 ───
  panels: {
    /** 添加自定义侧边面板 */
    addPanel(panel: PanelDefinition): void
  }

  // ─── 钩子系统 ───
  hooks: PluginHooks

  // ─── 数据处理 ───
  data: {
    /** 注册数据中间件（在数据填充前/后处理数据） */
    addMiddleware(middleware: DataMiddleware): void
    /** 注册自定义格式化器 */
    addFormatter(name: string, formatter: FormatterFunction): void
  }

  // ─── 导出管线 ───
  export: {
    /** 注册 PDF 生成器 */
    registerPDFGenerator(generator: PDFGenerator): void
    /** 注册导出后处理器（如添加水印） */
    addPostProcessor(processor: ExportPostProcessor): void
  }

  // ─── 表达式引擎 ───
  expression: {
    /** 替换默认表达式引擎 */
    setEngine(engine: ExpressionEngine): void
    /** 注册 helper 函数（在表达式中可用） */
    addHelper(name: string, fn: Function): void
  }

  // ─── Schema 操作 ───
  schema: {
    readonly current: TemplateSchema
    /** 监听 Schema 变化 */
    onChange(callback: (schema: TemplateSchema) => void): void
  }

  // ─── 命令系统 ───
  commands: {
    /** 注册自定义命令 */
    register(command: CommandDefinition): void
    /** 执行命令 */
    execute(commandName: string, ...args: unknown[]): void
  }
}
```

### 11.3 分类钩子体系

钩子分为两类：**同步钩子**（SyncHook）可拦截和修改核心流程；**异步事件**（AsyncEvent）只做通知，不阻塞流程：

```typescript
interface PluginHooks {
  // ─── 同步钩子（可拦截/修改） ───

  /** 渲染前 — 可修改待渲染元素的属性 */
  beforeRender: SyncWaterfallHook<[ElementNode, RenderContext]>
  /** 渲染后 — 可修改生成的 DOM 节点 */
  afterRender: SyncWaterfallHook<[HTMLElement, ElementNode]>
  /** 分页前 — 可修改分页参数 */
  beforePaginate: SyncWaterfallHook<[PaginateOptions]>
  /** 导出前 — 可修改导出配置或注入内容（如水印） */
  beforeExport: SyncWaterfallHook<[ExportContext]>
  /** 元素创建前 — 可修改默认属性 */
  beforeElementCreate: SyncWaterfallHook<[ElementNode]>
  /** 数据解析前 — 可修改数据上下文 */
  beforeDataResolve: SyncWaterfallHook<[Record<string, unknown>]>
  /** Schema 变更前 — 可拦截或修改变更 */
  beforeSchemaChange: SyncBailHook<[SchemaChangeEvent], boolean>

  // ─── 异步事件（仅通知） ───

  /** Schema 已变更 */
  schemaChanged: AsyncEvent<[TemplateSchema]>
  /** 选中元素变更 */
  selectionChanged: AsyncEvent<[string[]]>
  /** 导出完成 */
  exportCompleted: AsyncEvent<[ExportResult]>
  /** 分页完成 */
  paginateCompleted: AsyncEvent<[PageBreakResult]>
  /** 设计器初始化完成 */
  designerReady: AsyncEvent<[]>
}
```

### 11.4 钩子类型定义

```typescript
/**
 * SyncWaterfallHook — 同步瀑布钩子
 * 每个 tap 接收上一个 tap 的返回值，最终结果返回给调用方
 * 用于「修改」场景
 */
interface SyncWaterfallHook<Args extends unknown[]> {
  tap(name: string, fn: (...args: Args) => Args[0]): void
  call(...args: Args): Args[0]
}

/**
 * SyncBailHook — 同步熔断钩子
 * 任一 tap 返回非 undefined 值时停止后续执行
 * 用于「拦截/取消」场景
 */
interface SyncBailHook<Args extends unknown[], R> {
  tap(name: string, fn: (...args: Args) => R | undefined): void
  call(...args: Args): R | undefined
}

/**
 * AsyncEvent — 异步通知事件
 * 所有监听器并行执行，不影响核心流程
 * 用于「监听/响应」场景
 */
interface AsyncEvent<Args extends unknown[]> {
  on(name: string, fn: (...args: Args) => void | Promise<void>): void
  emit(...args: Args): void
}
```

---

## 12. 设计器交互层

### 12.1 设计器组件结构

```
┌──────────────────────────────────────────────────────────────────┐
│  EasyInkDesigner                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ToolbarPanel（工具栏：元素类型 + 操作按钮 + 插件按钮）  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────┬────────────────────────────┬──────────────────┐   │
│  │ DataSrc  │                            │  PropertyPanel   │   │
│  │ Panel    │                            │                  │   │
│  │          │                            │  ┌────────────┐  │   │
│  │ ┌──────┐ │       DesignCanvas         │  │ Schema 驱动│  │   │
│  │ │字段树│ │                            │  │ 属性编辑器 │  │   │
│  │ └──────┘ │  ┌─────────────────────┐   │  │            │  │   │
│  │          │  │  RulerH             │   │  │ [位置/尺寸]│  │   │
│  │          │  ├──┬──────────────────┤   │  │ [样式]     │  │   │
│  │          │  │R │                  │   │  │ [数据绑定] │  │   │
│  │ ┌──────┐ │  │u │   Page Canvas    │   │  │ [元素特有] │  │   │
│  │ │图层树│ │  │l │                  │   │  │            │  │   │
│  │ └──────┘ │  │e │                  │   │  └────────────┘  │   │
│  │          │  │r │                  │   │                  │   │
│  │          │  │V │                  │   │                  │   │
│  │          │  │  │                  │   │                  │   │
│  │          │  └──┴──────────────────┘   │                  │   │
│  └──────────┴────────────────────────────┴──────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  StatusBar（缩放、单位切换、页码、标尺刻度）             │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 12.2 交互特性

#### 智能对齐线 + 吸附

```typescript
interface AlignmentGuide {
  /** 对齐类型 */
  type: 'edge' | 'center' | 'grid' | 'margin' | 'custom'
  /** 方向 */
  axis: 'horizontal' | 'vertical'
  /** 位置（页面坐标） */
  position: number
  /** 吸附阈值（像素） */
  snapThreshold: number  // 默认 5px
}

/**
 * 对齐引擎
 * - 拖拽/缩放时实时计算与其他元素的对齐关系
 * - 显示对齐参考线（类似 Figma）
 * - 吸附到最近的对齐线
 * - 支持 Grid 网格吸附
 */
```

#### 多选 + 批量操作

- 框选（拖拽选择框）和 Shift+单击 追加选择
- 选中多个元素后显示统一的 bounding box
- 批量对齐：左对齐、右对齐、顶部对齐、底部对齐、水平居中、垂直居中
- 批量分布：水平等距、垂直等距
- 批量修改共有属性
- 组合/取消组合

#### 自由旋转

- 元素选中后显示旋转手柄
- CSS `transform: rotate()` 实现视觉旋转
- 旋转后自动计算 bounding box 用于碰撞检测和对齐
- 按住 Shift 旋转时以 15 度为步进
- 旋转后的拖拽/缩放需要考虑变换矩阵

#### 专业设计器特性

- **标尺**：顶部和左侧标尺，显示当前单位刻度，跟随缩放
- **辅助线**：从标尺拖出自定义参考线，可设置精确位置
- **出血线/安全线**：打印场景的裁切标记
- **缩放**：Ctrl+滚轮缩放，适应页面、适应宽度等预设
- **平移**：Space+拖拽 或中键拖拽平移画布
- **键盘快捷键**：方向键微调位置（1单位）、Shift+方向键大步调整（10单位）
- **右键菜单**：层级调整、对齐、锁定、复制粘贴等
- **页边距/出血线可视化**：虚线显示页边距和出血区域

### 12.3 属性面板 — Schema 驱动

属性面板由元素类型定义中的 `propDefinitions` 自动生成：

```typescript
interface PropDefinition {
  /** 属性键名 */
  key: string
  /** 显示标签 */
  label: string
  /** 编辑器类型 */
  editor: string  // 'text' | 'number' | 'color' | 'select' | 'font' | 'switch' | 插件注册的编辑器
  /** 编辑器配置 */
  editorOptions?: Record<string, unknown>
  /** 默认值 */
  defaultValue?: unknown
  /** 分组 */
  group?: string
  /** 显示条件 */
  visible?: (props: Record<string, unknown>) => boolean
}

// 示例：条形码元素类型定义
const barcodeElementType: ElementTypeDefinition = {
  type: 'barcode',
  name: '条形码',
  icon: 'barcode-icon',
  propDefinitions: [
    { key: 'format', label: '编码格式', editor: 'select', group: '条形码',
      editorOptions: { options: ['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39'] } },
    { key: 'value', label: '内容', editor: 'text', group: '条形码' },
    { key: 'displayValue', label: '显示文字', editor: 'switch', defaultValue: true, group: '条形码' },
    { key: 'barWidth', label: '线条宽度', editor: 'number', group: '条形码',
      editorOptions: { min: 1, max: 5, step: 0.5 } },
  ],
  // ...
}
```

---

## 13. 元素体系

### 13.1 元素类型定义

```typescript
interface ElementTypeDefinition {
  /** 元素类型标识 */
  type: string
  /** 显示名称 */
  name: string
  /** 工具栏图标 */
  icon: string | Component
  /** 属性定义（驱动属性面板） */
  propDefinitions: PropDefinition[]
  /** 默认属性值 */
  defaultProps: Record<string, unknown>
  /** 默认布局 */
  defaultLayout: Partial<ElementLayout>
  /** 默认样式 */
  defaultStyle?: Partial<ElementStyle>
  /** DOM 渲染函数 */
  render: ElementRenderFunction
  /** 设计器画布中的渲染（可选，默认复用 render） */
  designRender?: ElementRenderFunction
  /** 该元素类型是否支持子元素 */
  isContainer?: boolean
  /** 该元素类型是否支持数据循环 */
  supportsRepeat?: boolean
  /** 该元素类型是否支持内容溢出分页 */
  supportsPageBreak?: boolean
}

type ElementRenderFunction = (
  node: ElementNode,
  context: ElementRenderContext,
) => HTMLElement | string  // 返回 DOM 元素或 HTML 字符串
```

### 13.2 内置元素类型

#### 文本（text）

```typescript
interface TextProps {
  content: string          // 静态文本或包含 {{ }} 的模板文本
  verticalAlign?: 'top' | 'middle' | 'bottom'
  wordBreak?: 'normal' | 'break-all' | 'break-word'
  overflow?: 'visible' | 'hidden' | 'ellipsis'
}
```

#### 富文本（rich-text）

```typescript
interface RichTextProps {
  /** Delta 格式的富文本内容（类似 Quill Delta） */
  content: RichTextDelta[]
  /** 是否在设计器中启用行内编辑 */
  editableInDesigner?: boolean
}

interface RichTextDelta {
  insert: string
  attributes?: {
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
    fontSize?: number
    fontFamily?: string
    color?: string
    link?: string
    superscript?: boolean
    subscript?: boolean
  }
}
```

#### 图片（image）

```typescript
interface ImageProps {
  src: string              // URL 或 base64
  fit: 'contain' | 'cover' | 'fill' | 'none'
  alt?: string
}
```

#### 矩形（rect）

```typescript
interface RectProps {
  borderRadius?: number | [number, number, number, number]
  fill?: string
}
```

#### 线条（line）

```typescript
interface LineProps {
  direction: 'horizontal' | 'vertical' | 'custom'
  strokeWidth: number
  strokeColor: string
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  /** custom 方向时的终点坐标偏移 */
  endX?: number
  endY?: number
}
```

#### 条形码/二维码（barcode）

```typescript
interface BarcodeProps {
  /** 编码格式 */
  format: 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'QR'
  /** 编码内容（可绑定数据） */
  value: string
  /** 是否在条形码下方显示文字 */
  displayValue?: boolean
  /** 条形码线条宽度 */
  barWidth?: number
  /** QR 码纠错级别 */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
}
```

#### 动态表格（table）

```typescript
interface TableProps {
  /** 列定义（静态声明，不支持动态列） */
  columns: TableColumn[]
  /** 是否显示边框 */
  bordered?: boolean
  /** 表头行 */
  header?: TableHeaderConfig
  /** 表尾汇总行（全局聚合，仅出现在最后一页） */
  summary?: TableSummaryConfig
  /** 行高 */
  rowHeight?: number | 'auto'
  /** 斑马纹 */
  striped?: boolean
  /** 跨页时表头续打 */
  repeatHeaderOnBreak?: boolean
  /**
   * 空数据行为
   * - 'placeholder'：显示表头 + 一行空状态提示（如"暂无数据"）
   * - 'collapse'：完全折叠不占空间
   * - 'min-rows'：保持最小行数（配合 minRows 使用）
   */
  emptyBehavior?: 'placeholder' | 'collapse' | 'min-rows'
  /** emptyBehavior 为 'min-rows' 时的最小行数 */
  minRows?: number
  /** 空状态提示文本 */
  emptyText?: string
}

interface TableColumn {
  /** 列标识 */
  key: string
  /** 列标题 */
  title: string
  /**
   * 列宽（百分比，所有列宽之和 = 100%）
   * 设计器中拖拽列宽时联动调整相邻列
   */
  width: number
  /** 单元格对齐方式 */
  align?: 'left' | 'center' | 'right'
  /** 单元格渲染元素类型（默认 text） */
  cellType?: string
  /** 单元格渲染元素属性（静态配置，如 barcode 的 format） */
  cellProps?: Record<string, unknown>
  /** 数据绑定路径（相对于循环 item，如 "name"、"address.city"） */
  dataPath?: string
  /** 格式化器 */
  formatter?: FormatterConfig
}

interface TableHeaderConfig {
  /** 合并单元格定义（仅支持表头合并，不支持数据行合并） */
  merges?: CellMerge[]
  /** 行高 */
  height?: number
  /** 样式 */
  style?: Partial<ElementStyle>
}

interface CellMerge {
  /** 起始行（0-based） */
  row: number
  /** 起始列（0-based） */
  col: number
  /** 合并行数 */
  rowSpan: number
  /** 合并列数 */
  colSpan: number
}

/**
 * 汇总行配置
 * 支持两种模式：内置聚合类型（简单场景）和表达式（复杂场景）
 * 聚合范围始终基于完整数据集，汇总行仅出现在最后一页
 */
interface TableSummaryConfig {
  /** 汇总行高度 */
  height?: number
  /** 汇总行样式 */
  style?: Partial<ElementStyle>
  /** 各列的汇总定义 */
  cells: TableSummaryCell[]
}

interface TableSummaryCell {
  /** 对应的列 key */
  columnKey: string
  /**
   * 内置聚合类型（简单场景）
   * 与 expression 二选一，同时存在时 expression 优先
   */
  aggregate?: 'sum' | 'avg' | 'count' | 'max' | 'min'
  /**
   * 表达式（复杂场景，如加权平均、条件汇总）
   * 可使用内置 helper：SUM、AVG、COUNT、MAX、MIN
   * 示例："{{ SUM(order.items, 'amount') * 1.13 }}"
   */
  expression?: string
  /** 格式化器 */
  formatter?: FormatterConfig
  /** 静态文本（如"合计"标签列） */
  text?: string
}
```

---

## 14. Command 与撤销/重做

### 14.1 Command 模式

每个用户操作封装为 Command 对象，包含 execute 和 undo 两个方法：

```typescript
interface Command {
  /** 命令唯一标识 */
  readonly id: string
  /** 命令类型 */
  readonly type: string
  /** 命令描述（用于 UI 显示，如"移动文本元素"） */
  readonly description: string
  /** 执行命令 */
  execute(): void
  /** 撤销命令 */
  undo(): void
  /** 是否可与下一个相同类型的命令合并（如连续输入文字） */
  mergeable?: boolean
  /** 尝试合并命令，返回合并后的命令或 null */
  merge?(next: Command): Command | null
}
```

### 14.2 命令管理器

```typescript
class CommandManager {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private maxStackSize: number = 100

  /**
   * 执行命令并压入撤销栈
   * - 清空重做栈
   * - 尝试与栈顶命令合并（如连续拖拽）
   */
  execute(command: Command): void

  /** 撤销最近的命令 */
  undo(): void

  /** 重做最近撤销的命令 */
  redo(): void

  /** 是否可撤销 */
  get canUndo(): boolean

  /** 是否可重做 */
  get canRedo(): boolean

  /** 清空历史 */
  clear(): void

  /** 开始事务（多个操作合并为一个撤销步骤） */
  beginTransaction(description: string): void

  /** 提交事务 */
  commitTransaction(): void

  /** 回滚事务 */
  rollbackTransaction(): void
}
```

### 14.3 内置命令类型

| 命令 | 说明 | 合并策略 |
|------|------|----------|
| `MoveElementCommand` | 移动元素位置 | 连续拖拽合并 |
| `ResizeElementCommand` | 调整元素尺寸 | 连续缩放合并 |
| `RotateElementCommand` | 旋转元素 | 连续旋转合并 |
| `UpdatePropsCommand` | 修改元素属性 | 同属性连续修改合并 |
| `UpdateStyleCommand` | 修改元素样式 | 同样式连续修改合并 |
| `AddElementCommand` | 添加元素 | 不合并 |
| `RemoveElementCommand` | 删除元素 | 不合并 |
| `ReorderElementCommand` | 调整层级 | 不合并 |
| `GroupElementsCommand` | 组合元素 | 不合并 |
| `UpdateBindingCommand` | 修改数据绑定 | 不合并 |
| `UpdatePageSettingsCommand` | 修改页面设置 | 不合并 |
| `BatchCommand` | 批量操作（事务） | 不合并 |

---

## 15. 单位系统

### 15.1 设计决策

**Schema 存储用户选择的单位值**，不做归一化转换。`page.unit` 声明了整个模板使用的单位，所有元素的坐标和尺寸数值都基于该单位。

```typescript
// Schema 中的存储方式
{
  page: {
    unit: 'mm',            // 用户选择的单位
    paper: { type: 'custom', width: 210, height: 297 },  // 值的单位是 mm
    margins: { top: 10, right: 10, bottom: 10, left: 10 }, // 值的单位是 mm
  },
  elements: [{
    layout: { position: 'absolute', x: 15, y: 20, width: 50, height: 10 }, // 值的单位是 mm
  }]
}
```

### 15.2 单位管理器

```typescript
class UnitManager {
  /** 当前模板单位 */
  readonly unit: 'mm' | 'inch' | 'pt'

  /**
   * 将模板单位值转换为屏幕像素值
   * @param value - 模板单位值
   * @param dpi - 屏幕 DPI（默认 96）
   * @param zoom - 缩放倍率
   */
  toPixels(value: number, dpi?: number, zoom?: number): number

  /**
   * 将屏幕像素值转换回模板单位值
   */
  fromPixels(px: number, dpi?: number, zoom?: number): number

  /**
   * 单位间转换
   */
  convert(value: number, from: Unit, to: Unit): number

  /**
   * 获取显示用的格式化值（带单位后缀）
   */
  format(value: number, precision?: number): string
}

// 转换常量
const UNIT_CONVERSIONS = {
  mm: { toInch: 1 / 25.4, toPt: 72 / 25.4 },
  inch: { toMm: 25.4, toPt: 72 },
  pt: { toMm: 25.4 / 72, toInch: 1 / 72 },
} as const
```

### 15.3 渲染时转换

DOM 渲染时需要将模板单位转换为 CSS 像素：

```
模板值 (mm/inch/pt) → CSS 像素 (px)

公式:
  mm → px:   value * (DPI / 25.4) * zoom
  inch → px: value * DPI * zoom
  pt → px:   value * (DPI / 72) * zoom

设计器画布中 DPI 固定为 96（CSS 标准），zoom 由缩放控制。
打印/PDF 时 DPI 为目标精度（通常 300）。
```

---

## 16. 字体管理

### 16.1 FontProvider 接口

核心不关心字体的存储和加载细节，通过 FontProvider 接口解耦：

```typescript
interface FontProvider {
  /** 获取可用字体列表 */
  listFonts(): Promise<FontDescriptor[]>

  /**
   * 加载字体文件
   * @returns CSS @font-face 所需的 font source（URL 或 ArrayBuffer）
   */
  loadFont(fontFamily: string, weight?: string, style?: string): Promise<FontSource>

  /**
   * 获取字体文件的原始数据（用于 PDF 嵌入）
   */
  getFontData?(fontFamily: string): Promise<ArrayBuffer>
}

interface FontDescriptor {
  family: string
  displayName: string
  weights: string[]    // ['400', '700']
  styles: string[]     // ['normal', 'italic']
  category?: string    // '衬线体' | '无衬线体' | '等宽体' | '手写体'
  preview?: string     // 预览文本或图片 URL
}

type FontSource = string | ArrayBuffer  // URL 或字体文件二进制
```

### 16.2 使用方式

```typescript
// 消费者实现自己的 FontProvider
const myFontProvider: FontProvider = {
  async listFonts() {
    return [
      { family: 'SourceHanSans', displayName: '思源黑体', weights: ['400', '700'], styles: ['normal'] },
      { family: 'SourceHanSerif', displayName: '思源宋体', weights: ['400', '700'], styles: ['normal'] },
    ]
  },
  async loadFont(family) {
    return `https://my-cdn.com/fonts/${family}.woff2`
  },
  async getFontData(family) {
    const response = await fetch(`https://my-cdn.com/fonts/${family}.ttf`)
    return response.arrayBuffer()
  },
}

const engine = new EasyInkEngine({
  fontProvider: myFontProvider,
})
```

---

## 17. PDF 生成管线

### 17.1 可插拔 PDF 管线

核心定义 `PDFGenerator` 接口，内置提供客户端和服务端两种实现：

```typescript
interface PDFGenerator {
  /** 生成器标识 */
  readonly name: string

  /**
   * 从渲染结果生成 PDF
   * @param pages - DOM 渲染产生的页面列表
   * @param options - PDF 选项
   */
  generate(pages: HTMLElement[], options: PDFOptions): Promise<Blob | ArrayBuffer>
}

interface PDFOptions {
  /** 页面尺寸 */
  width: number
  height: number
  /** 单位 */
  unit: 'mm' | 'inch' | 'pt'
  /** DPI */
  dpi?: number
  /** 是否嵌入字体 */
  embedFonts?: boolean
  /** 文件元信息 */
  meta?: {
    title?: string
    author?: string
    subject?: string
  }
}
```

### 17.2 内置实现

**客户端 PDF 生成器**（基于 jsPDF + html2canvas 或 pdf-lib）：

```typescript
import { ClientPDFGenerator } from '@easyink/renderer/pdf'

const pdfGenerator = new ClientPDFGenerator({
  /** html-to-canvas 的质量配置 */
  scale: 2,
  /** 是否使用 pdf-lib 做矢量文本（精度更高但不支持复杂布局） */
  vectorText: false,
})
```

**服务端 PDF 生成器**（通过 API 调用后端 Puppeteer/Playwright）：

```typescript
import { ServerPDFGenerator } from '@easyink/renderer/pdf'

const pdfGenerator = new ServerPDFGenerator({
  /** 服务端渲染 API 地址 */
  endpoint: 'https://api.example.com/render/pdf',
  /** 请求超时 */
  timeout: 30000,
})
```

**自定义 PDF 生成器**：

```typescript
// 消费者可完全自定义 PDF 生成逻辑
const customGenerator: PDFGenerator = {
  name: 'my-pdf-generator',
  async generate(pages, options) {
    // 自定义实现...
    return pdfBlob
  },
}
```

---

## 18. 国际化

### 18.1 外部化 + 默认中文

设计器所有文案通过 locale key 引用，不硬编码。内置提供完整的中文语言包，消费者可替换或扩展：

```typescript
interface LocaleMessages {
  [key: string]: string | LocaleMessages
}

// 内置中文语言包结构示例
const zhCN: LocaleMessages = {
  designer: {
    toolbar: {
      text: '文本',
      image: '图片',
      table: '表格',
      barcode: '条形码',
      undo: '撤销',
      redo: '重做',
      // ...
    },
    property: {
      position: '位置',
      size: '尺寸',
      rotation: '旋转',
      style: '样式',
      dataBinding: '数据绑定',
      // ...
    },
    // ...
  },
}
```

### 18.2 使用方式

```typescript
import { createDesigner } from '@easyink/designer'
import zhCN from '@easyink/designer/locale/zh-CN'
// 或用户自己的语言包
import enUS from './locales/en-US'

const designer = createDesigner({
  locale: zhCN,  // 或 enUS
})

// 插件也可以注册自己的 locale key
const myPlugin: EasyInkPlugin = {
  name: 'my-plugin',
  install(ctx) {
    ctx.locale?.merge({
      plugins: {
        myPlugin: {
          label: '我的插件',
        },
      },
    })
  },
}
```

---

## 19. Schema 版本迁移

### 19.1 SemVer 语义

- **Patch**（0.0.x）：bug fix，Schema 完全兼容
- **Minor**（0.x.0）：新增功能，Schema 向后兼容（additive only）
- **Major**（x.0.0）：可能存在 breaking change，提供迁移函数

### 19.2 迁移注册表

```typescript
interface MigrationRegistry {
  /**
   * 注册版本迁移函数
   * @param from - 源版本范围（SemVer range，如 "1.x"）
   * @param to - 目标版本（如 "2.0.0"）
   * @param migrate - 迁移函数
   */
  register(from: string, to: string, migrate: MigrationFunction): void
}

type MigrationFunction = (schema: Record<string, unknown>) => TemplateSchema

/**
 * Schema 加载流程：
 *
 * 1. 读取 schema.version
 * 2. 如果 version === currentVersion，直接使用
 * 3. 如果 version < currentVersion：
 *    a. Minor 升级：直接使用（向后兼容）
 *    b. Major 升级：查找迁移路径，依次执行迁移函数
 * 4. 如果 version > currentVersion：拒绝加载，提示升级库版本
 * 5. 迁移后更新 schema.version 为当前版本
 */
```

### 19.3 迁移示例

```typescript
// 从 v1 迁移到 v2：元素布局结构变更
migrations.register('1.x', '2.0.0', (oldSchema) => {
  return {
    ...oldSchema,
    version: '2.0.0',
    elements: oldSchema.elements.map((el: any) => ({
      ...el,
      // v1 中 x/y/width/height 在元素顶层，v2 移入 layout 对象
      layout: {
        position: el.position ?? 'absolute',
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation ?? 0,
      },
    })),
  }
})
```

---

## 20. 构建与产物

### 20.1 构建工具链

| 工具 | 用途 |
|------|------|
| **tsdown** | 主构建工具，打包各 package 为 ESM 产物 |
| **rollup-plugin-vue** | Vue SFC 编译（设计器包） |
| **Vite** | playground/examples 的开发服务器 |
| **TypeScript** | 类型检查（noEmit，声明文件由 tsdown 生成） |

### 20.2 产物格式

仅输出 **ESM** 格式：

```
packages/core/dist/
  ├── index.mjs          # ESM bundle
  ├── index.d.mts        # TypeScript 声明
  └── chunks/            # 代码分割（如有）

packages/renderer/dist/
  ├── index.mjs
  ├── index.d.mts
  ├── pdf/index.mjs      # PDF 子路径导出
  └── pdf/index.d.mts

packages/designer/dist/
  ├── index.mjs
  ├── index.d.mts
  └── style.css          # 设计器样式
```

### 20.3 Package.json 导出配置

```jsonc
// packages/core/package.json
{
  "name": "@easyink/core",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    }
  },
  "files": ["dist"]
}

// packages/renderer/package.json
{
  "name": "@easyink/renderer",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    },
    "./pdf": {
      "import": "./dist/pdf/index.mjs",
      "types": "./dist/pdf/index.d.mts"
    }
  }
}
```

---

## 21. 测试策略

### 21.1 单元测试（Vitest）

覆盖核心引擎的所有纯逻辑模块：

| 模块 | 测试重点 |
|------|----------|
| SchemaEngine | Schema CRUD、校验、遍历、序列化 |
| LayoutEngine | 绝对定位计算、流式布局排列、混合布局冲突处理 |
| PaginationEngine | 各种分页场景（表格续打、区域锁定、元素不分割） |
| ExpressionEngine | 沙箱安全性、表达式求值正确性、超时处理 |
| DataResolver | 命名空间路径解析、嵌套访问、循环上下文、格式化器、容错策略 |
| CommandManager | 撤销/重做、命令合并、事务 |
| UnitManager | 单位转换精度 |
| MigrationRegistry | 版本迁移链路 |

### 21.2 E2E 测试（Playwright）

覆盖关键用户路径：

```
1. 加载模板 → 填充数据 → 渲染预览 → 验证输出
2. 设计器打开 → 添加元素 → 设置属性 → 导出 Schema
3. 设计器打开 → 多次操作 → 撤销/重做 → 验证状态
4. 加载包含动态表格的模板 → 填充大量数据 → 验证分页正确性
5. 加载模板 → 生成 PDF → 验证 PDF 产物
```

### 21.3 测试工具

```jsonc
// vitest.config.ts
{
  "test": {
    "workspace": [
      "packages/core",
      "packages/renderer",
      "packages/designer"
    ]
  }
}
```

---

## 22. 性能策略

### 22.1 架构层预留

v1 不做激进的性能优化，但在架构层面为以下优化预留口子：

| 优化方向 | 预留接口 | 触发时机 |
|----------|----------|----------|
| **渲染缓存** | 渲染管线的 beforeRender/afterRender 钩子可插入缓存层 | 大量静态元素 |
| **虚拟渲染** | Renderer 接口支持只渲染可视区域的页面 | 100+ 页文档 |
| **延迟分页** | PaginationEngine 支持增量分页 | 大数据表格 |
| **Web Worker** | 表达式引擎和分页引擎可移入 Worker | CPU 密集计算 |
| **DOM 复用** | DOMRenderer 支持 diff 更新而非全量替换 | 频繁数据变化 |

### 22.2 基本性能目标

| 场景 | 目标 |
|------|------|
| 设计器加载（空模板） | < 500ms |
| 中等模板渲染（50 元素，2 页） | < 200ms |
| 大型模板渲染（200 元素，10 页） | < 2s |
| 拖拽/缩放交互帧率 | ≥ 30fps |

---

## 23. 安全模型

### 23.1 表达式沙箱

- 表达式在受限作用域中执行，无法访问 `window`、`document`、`globalThis`
- 白名单全局对象：`Math`、`Date`、`Number`、`String`、`Array`、`Object`、`JSON`
- 禁止的语法：函数声明、箭头函数、new 表达式、import 表达式、赋值表达式
- 执行超时：100ms
- 递归深度限制：10 层

### 23.2 数据源安全

- 数据路径解析器防止原型链污染（禁止访问 `__proto__`、`constructor`、`prototype`）
- 格式化器只能是注册的白名单函数

### 23.3 渲染安全

- 动态数据插入 DOM 时使用 `textContent` 而非 `innerHTML`
- 富文本内容经过 sanitize 处理
- 图片 URL 支持白名单域名配置

---

## 24. 关键设计决策记录

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 渲染策略 | Canvas / DOM / 双渲染器 | **统一 DOM** | 中文排版精度优先，CSS 打印支持成熟 |
| 2 | 数据绑定 | 简单路径 / 完整表达式 / 可插拔 | **可插拔引擎** | 核心轻量，表达式能力按需扩展 |
| 3 | 分页策略 | 固定 / 自动 / 混合 | **混合模式** | 元素级配置兼顾所有场景 |
| 4 | 插件粒度 | 元素级 / 全生命周期 / 微内核 | **全生命周期** | 覆盖元素、渲染、工具栏、面板、导出等全部扩展点 |
| 5 | PDF 生成 | 纯客户端 / 服务端 / 可插拔 | **可插拔管线** | 由部署环境决定，内置双实现 |
| 6 | 布局模式 | 绝对 / 流式 / 混合 | **混合布局** | 自由设计与动态内容兼得 |
| 7 | 单位存储 | 统一 mm / 统一 pt / 用户单位 | **用户选择的单位** | Schema 可读性优先，渲染时转换 |
| 8 | 多渲染器 | 多输出 / 多框架 / 两者 | **暂只多输出** | v1 专注 Vue，降低复杂度 |
| 9 | 分页冲突 | 推开 / 锁定 / 带 slot | **流式推开 + 区域锁定** | 灵活处理页眉页脚 + 签名区等场景 |
| 10 | Undo/Redo | 快照 / Command / Immer | **Command 模式** | 细粒度控制、可合并、支持事务 |
| 11 | 元素类型 | 最小集 / 渐进 / 全内置 | **全内置**（条码+表格+富文本） | 打印场景硬需求 |
| 12 | 数据源 UX | 先定义/直接绑定/共存/开发方注册 | **开发方注册数据源** | 数据源结构由集成方注册，设计用户通过字段树拖拽绑定 |
| 13 | Schema 迁移 | 版本+迁移 / 向后兼容 / 结合 | **SemVer 式结合** | 小版本兼容、大版本迁移 |
| 14 | 目标用户 | 开发者 / 终端用户 / 分层 | **分层架构** | headless core + 完整 UI，类似 Tiptap |
| 15 | 表格复杂度 | 简单 / 中等 / 完全 | **中等** | 覆盖主流场景，避免过度复杂 |
| 16 | 包拆分 | 粗 / 细 / 渐进 | **粗粒度（4 个包）** | core / renderer / designer / shared |
| 17 | 字体管理 | 系统字体 / 内置管理 / Provider | **FontProvider 接口** | 核心不关心存储，实集方自由实现 |
| 18 | 数据预览 | 占位符 / 实时 / 智能模拟 | **占位符显示** | 简化设计器渲染流程，Table 显示表头+绑定路径文本 |
| 19 | 模板复用 | 不支持 / 引用 / 副本 | **不支持** | v1 保持简单 |
| 20 | 状态管理 | Vue Reactivity / 无关 / Pinia | **Vue Reactivity** | 与 Vue 生态深度融合 |
| 21 | 跨框架 | @vue/reactivity / Schema 统一 / 不考虑 | **暂不考虑** | v1 专注 Vue |
| 22 | 表达式安全 | 沙箱 / 信任 / 可配置 | **沙箱化执行** | 防止模板注入攻击 |
| 23 | API 风格 | Composable / Class / 混合 | **混合** | 核心 Class + Vue Composable 封装 |
| 24 | 事件架构 | EventEmitter / 可拦截 / 分类 | **分类钩子** | 同步可拦截 + 异步只通知 |
| 25 | 属性面板 | 可替换组件 / Schema 驱动 / 固定 | **Schema 驱动** | 元素类型定义声明属性，面板自动生成 |
| 26 | 数据源格式 | JSON Schema / 样例推断 / 自定义 | **DataSourceRegistration 接口** | 开发方注册，含 name/displayName/icon/fields 等 UI 信息 |
| 27 | 构建工具 | Vite / Rollup / tsdown | **tsdown + rollup-plugin-vue** | 零配置 + Vue SFC 支持 |
| 28 | 输出格式 | ESM+CJS+UMD / ESM+CJS / ESM | **ESM only** | 现代工具链标准 |
| 29 | 测试 | 核心单测 / 全面 / 单元+E2E | **单元 + E2E** | 核心逻辑单测 + 关键路径 E2E |
| 30 | 设计器样式 | Tailwind / CSS Modules / 变量+Scoped | **CSS 变量 + Scoped** | 样式隔离 + 可主题化 |
| 31 | i18n | 仅中文 / 中英 / 外部化 | **外部化 + 中文默认** | 文案全外部化，内置中文包 |
| 32 | 数据源命名空间 | 合并单一对象 / 命名空间隔离 / 单数据源 | **命名空间隔离** | 多数据源通过 name 前缀区分，如 order.x / company.x |
| 33 | 多数据源注册 | 仅初始化 / 动态注册 / 可替换 | **初始化 + 可替换** | 初始化传入 + 支持 unregister/re-register 替换 |
| 34 | 表格嵌套 repeat | 单层 / 嵌套 / 表达式拍平 | **仅单层 repeat** | 数据层扁平化由业务层负责 |
| 35 | 表格列宽 | 固定值/百分比混合 / 纯百分比 / flex | **强制百分比 + 联动调整** | 设计器拖拽列宽时联动相邻列，总和恒为 100% |
| 36 | 表格空数据 | 占位/折叠/可配置 | **可配置 emptyBehavior** | placeholder / collapse / min-rows 三种策略 |
| 37 | 表格汇总行 | 内置聚合/表达式/双轨 | **内置聚合 + 表达式双轨** | 简单场景用 sum/avg/count，复杂场景用表达式 |
| 38 | 汇总行跨页 | 每页小计/尾页总计/双层 | **全局聚合 + 尾页汇总** | 聚合范围为完整数据集，汇总行仅出现在最后一页 |
| 39 | 表格单元格合并 | 表头+数据行 / 仅表头 / 预留 | **仅表头合并** | v1 避免数据行合并与分页的复杂交互 |
| 40 | 表格设计器交互 | 属性面板 / 画布编辑 / 混合 | **画布拖拽 + 面板配置** | 列宽/行高画布拖拽，cellType/dataPath 等在面板配置 |
| 41 | 数组拖拽建表 | 不支持 / 只绑定source / 自动建表+列 | **拖入自动建表 + 自动生成列** | 拖拽数组字段自动创建 Table 并根据子字段生成列定义 |
| 42 | 多表格分页 | 顺序排列 / 强制新页 / 单表格限制 | **顺序排列 + 进余空间新开页** | 流式排列，空间不足时新开页 |
| 43 | 单行超高 | 截断/跨页/上限 | **截断 + 警告** | overflow: hidden 截断，控制台/设计器打印 warning |
| 44 | 跨元素数据引用 | 不支持 / 聚合helper / 跨作用域 | **不支持** | 各元素独立作用域，表达式只能读自身绑定的数据 |
| 45 | 动态列 | 条件显隐 / repeat列 / 不支持 | **不支持** | v1 只做静态列声明，动态列需求由业务层预生成 Schema |
