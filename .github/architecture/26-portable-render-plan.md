# 26. 跨平台 RenderPlan 管线

本文档定义 EasyInk 的跨平台渲染方案：以 `schema + data` 作为业务输入，在当前应用进程内先编译成平台无关的 `RenderPlan`，再由小程序、App 原生、C#、Go、PDF 或浏览器各自实现轻量绘制适配器。

目标不是让所有端依赖 Node 包，也不是模拟 DOM，更不是把编译能力默认外置到服务端或 daemon。Node/TypeScript 运行时是官方参考编译器；Go、C#、Kotlin、Swift 等跨语言运行时若要直接接收 `schema + data`，必须提供本语言进程内 compiler，并产出同一份 RenderPlan 契约。

## 26.1 当前结论

- `schema + data` 是跨平台渲染的业务输入，但不是直接绘制协议。
- Viewer 现有前半段能力可以复用：schema normalize、binding projection、measure、layout、pagination、page overlay 解析。
- DOM 依赖集中在 Viewer 最后一段 `RenderSurface` 和物料 `MaterialViewerExtension.render()` 输出。
- 跨平台方案应新增 `RenderPlanCompiler`，把 Viewer 前半段产物编译为 JSON RenderPlan；每个需要在应用层直接处理 `schema + data` 的运行时都应具备进程内 compiler。
- `RenderPlanRenderer` 只负责绘制 page、layer、box、text、image、path 等稳定 primitive，不解释 schema、binding、pagination 或物料私有语义。
- 物料需要声明 portable 支持能力。未支持物料必须有诊断、降级或本地 snapshot 策略，不能静默丢失。
- 高保真打印、复杂 HTML、iframe、video、任意 JS 仍可走现有 DOM/browser/export-runtime 路线，不强行纳入 portable 子集。

## 26.2 架构总览

```text
DocumentSchema + runtime data + assets
  |
  v
SchemaCodec / Migration / Normalize
  |
  v
BindingProjector / FormatResolver
  |
  v
Measure / Reflow / Layout / Pagination
  |
  v
Portable Material Renderer
  |
  v
RenderPlan JSON
  |
  +--> DOM adapter
  +--> MiniProgram Canvas adapter
  +--> Native Skia / Canvas adapter
  +--> Go PDF / image adapter
  +--> C# SkiaSharp / GDI / PDF adapter
```

`RenderPlanCompiler` 默认作为当前应用进程内的 library 运行。Web/小程序可使用 TypeScript/npm compiler；Go、C#、Kotlin、Swift 等非 TS 端需要实现同一份 compiler spec。端侧 adapter 不需要知道 table-data 如何展开、data-contract 如何解析、页码如何复制；这些复杂语义在同进程编译阶段完成。

服务端编译或本地 daemon 只能作为业务允许时的可选部署形态，不能作为跨平台方案的默认依赖。

## 26.2.1 应用内工作方式

所有直接接收 `schema + data` 的应用层集成都应按以下流程工作：

```text
Application process
  |
  +--> RenderPlanCompiler.compile(schema, data, assets, options)
  |      |
  |      +--> LayoutPlan      # compiler internal only
  |      +--> RenderPlan JSON # stable in-process boundary
  |
  +--> RenderPlanRenderer.render(plan, targetSurface)
```

Go 示例：

```text
Go app
  -> easyink-go/compiler
  -> easyink-go/renderplan
  -> easyink-go/renderer/pdf
```

微信小程序示例：

```text
MiniProgram app
  -> @easyink/render-compiler
  -> @easyink/render-plan
  -> @easyink/render-adapter-mini-program
```

如果某个运行时只接收已经编译好的 RenderPlan，则它可以只实现 renderer；但只要运行时 API 暴露 `schema + data` 输入，就必须在同进程内包含 compiler，不能依赖外部服务来补齐语义。

## 26.3 输入边界

RenderPlan 编译输入：

```ts
interface RenderPlanCompileInput {
  schema: DocumentSchema
  data?: Record<string, unknown>
  assets?: RenderAssetManifest
  options?: RenderPlanCompileOptions
}
```

推荐编译选项：

```ts
interface RenderPlanCompileOptions {
  mode?: 'portable' | 'dom-compatible' | 'layout-only'
  consistency?: 'layout-strong' | 'best-effort'
  textLayout?: 'compiler-lines' | 'adapter-layout'
  unsupportedPolicy?: 'diagnostic' | 'placeholder' | 'snapshot' | 'error'
  snapshotProvider?: RenderSnapshotProvider
  target?: string
}

interface RenderSnapshotProvider {
  render: (input: RenderSnapshotInput) => Promise<RenderSnapshotResult> | RenderSnapshotResult
}
```

策略含义：

- `portable`：输出跨端 primitive 和显式 fallback，端侧 adapter 可直接消费。
- `dom-compatible`：允许保留 DOM 管线需要的信息，用于 Web 对照或过渡期。
- `layout-only`：只验证页、元素、分页和诊断，不保证物料视觉输出完整。
- `layout-strong`：编译期必须固化布局结果，尤其是文本行、表格单元格和分页切分。
- `best-effort`：允许 adapter 在缺少编译期布局信息时使用自身能力绘制。
- `unsupportedPolicy` 决定 DOM-only 或未支持物料如何进入 RenderPlan。
- `snapshotProvider` 默认必须是本地或同进程能力。只有业务显式允许外部依赖时，才可以接入服务端或 daemon snapshot provider。

除 `schema + data` 外，渲染还需要资产清单：

```ts
interface RenderAssetManifest {
  fonts?: RenderFontAsset[]
  images?: RenderImageAsset[]
}

interface RenderFontAsset {
  family: string
  source: string
  weight?: number | string
  style?: 'normal' | 'italic'
}

interface RenderImageAsset {
  id: string
  source: string
  width?: number
  height?: number
}
```

资产清单不是业务语义输入，而是资源解析输入。小程序、App、C# 端可以把 `source` 映射为本地文件、缓存 URL、base64 或应用内资源 id。

## 26.4 RenderPlan 契约

RenderPlan 是纯 JSON，不包含 DOM 节点、函数对象、CSS 字符串、闭包或平台句柄。

```ts
interface RenderPlan {
  version: string
  schemaVersion: string
  unit: 'mm' | 'pt' | 'px'
  pages: RenderPage[]
  assets?: RenderAssetManifest
  diagnostics: RenderDiagnostic[]
  metadata?: {
    source?: 'viewer' | 'designer' | 'in-process' | 'external'
    createdAt?: string
  }
}

interface RenderPage {
  index: number
  width: number
  height: number
  background?: RenderBackground
  layers: RenderLayer[]
}

interface RenderLayer {
  id: string
  placement: 'under-content' | 'content' | 'over-content' | 'top'
  zIndex: number
  nodes: RenderNode[]
}
```

基础节点：

```ts
type RenderNode =
  | RenderGroupNode
  | RenderBoxNode
  | RenderTextNode
  | RenderImageNode
  | RenderPathNode
  | RenderSvgNode

interface RenderNodeBase {
  id: string
  sourceNodeId?: string
  kind: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  opacity?: number
  clip?: boolean
  zIndex?: number
  diagnostics?: RenderDiagnostic[]
}

interface RenderGroupNode extends RenderNodeBase {
  kind: 'group'
  children: RenderNode[]
}

interface RenderBoxNode extends RenderNodeBase {
  kind: 'box'
  fill?: string
  stroke?: RenderStroke
  radius?: number
}

interface RenderTextNode extends RenderNodeBase {
  kind: 'text'
  runs: RenderTextRun[]
  layout: RenderTextLayout
}

interface RenderImageNode extends RenderNodeBase {
  kind: 'image'
  source: string
  fit?: 'fill' | 'contain' | 'cover' | 'none'
  repeat?: 'none' | 'repeat' | 'repeat-x' | 'repeat-y'
}

interface RenderPathNode extends RenderNodeBase {
  kind: 'path'
  viewBox?: { x: number, y: number, width: number, height: number }
  commands: RenderPathCommand[]
  fill?: string
  stroke?: RenderStroke
}

interface RenderSvgNode extends RenderNodeBase {
  kind: 'svg'
  content: string
  fallbackImage?: string
}
```

文本节点使用结构化字段，而不是 CSS：

```ts
interface RenderTextRun {
  text: string
  fontFamily?: string
  fontSize: number
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic'
  color?: string
  underline?: boolean
  strike?: boolean
}

interface RenderTextLayout {
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  lineHeight?: number
  wrap?: 'wrap' | 'nowrap'
  overflow?: 'hidden' | 'visible' | 'ellipsis'
  lines?: RenderTextLine[]
}

interface RenderTextLine {
  text: string
  x: number
  y: number
  width: number
}
```

`lines` 在普通 portable 模式下是可选字段。若编译器已经完成断行和测量，端侧必须按 `lines` 绘制；若缺失，端侧可用自身文字引擎布局，但输出一致性会降低。

在强布局一致模式下，`lines` 不应省略。若字体、文字测量或断行能力不足以生成稳定 `RenderTextLine[]`，编译器必须产生诊断，并按编译策略降级为 placeholder、snapshot 或直接失败。

## 26.4.1 布局一致性边界

portable 管线追求的是排版布局强一致，不要求所有平台像素完全一致。

必须强一致：

- 输出页数、页宽、页高和页序。
- 每个可渲染节点的 `x / y / width / height`、页归属和 `sourceNodeId`。
- `zIndex`、layer placement、clip、rotation、opacity。
- 页面背景、page layers、repeat.scope、page-aware 物料和页码上下文的展开结果。
- table-static/table-data 的行列尺寸、单元格矩形、分页切分和 header/footer 复制结果。
- 强布局一致模式下文本的行切分、每行位置和盒内对齐。

允许存在有限差异：

- 字形 raster、抗锯齿、hinting 和不同平台字体 fallback 造成的细微视觉差异。
- chart、复杂 SVG、signature 等 snapshot 物料内部的图形细节。
- DOM-only 物料在非 DOM 端不参与 portable 输出。

不允许的差异：

- 元素缺失、错页、错层、坐标漂移。
- adapter 自行重新解释 binding、pagination、table repeat 或物料私有语义。
- unsupported、fallback 或 DOM-only 物料静默丢失且没有诊断。

## 26.5 编译器职责

`RenderPlanCompiler` 负责所有与 EasyInk 语义相关的工作：

1. 校验、迁移并规范化 schema。
2. 加载或解析字体资产描述。
3. 解析普通 BindingRef 和显示格式。
4. 解析 data-contract，生成结构化物料运行态数据。
5. 预解析 table-data/table-static 单元格绑定。
6. 调用物料测量能力，生成 runtime measurements。
7. 执行 reflow、layout 和 pagination。
8. 解析 page layers、repeat.scope、page-aware 物料和页码上下文。
9. 调用物料 portable renderer 输出 RenderNode。
10. 收集诊断，并把 unsupported/fallback 行为写入 RenderPlan。

编译器不得把运行结果写回原始 schema。RenderPlan 是一次渲染任务的派生产物，可以缓存，但不能替代模板源。

## 26.5.1 LayoutPlan 与 RenderPlan 边界

编译器内部允许存在两层中间产物：

```text
schema + data
  -> LayoutPlan
  -> RenderPlan
```

`LayoutPlan` 是编译器内部结构，可保留 `MaterialNode`、fragment、测量结果、分页上下文和物料运行态缓存。它可以复用 Viewer 前半段能力，但不是跨平台协议。

`RenderPlan` 是端侧唯一可消费协议，只包含纯 JSON primitive、资产引用、fallback 和 diagnostics。端侧 adapter 不得读取 `schema`、`LayoutPlan` 或物料私有字段来补全绘制语义。

如果需要调试，可在 `metadata` 或独立 debug 输出中关联 `LayoutPlan`，但生产 adapter 只能依赖 RenderPlan。

## 26.5.2 跨语言 Compiler Spec

TypeScript compiler 是参考实现，但跨语言目标不能只依赖 TypeScript 代码作为事实标准。必须沉淀一份语言无关的 compiler spec，供 Go、C#、Kotlin、Swift 等实现对齐。

Compiler spec 至少包含：

- Schema codec、migration、normalize 的输入输出规则。
- BindingRef、显示格式、data-contract 的解析规则。
- 单位换算、坐标原点、浮点精度、排序稳定性和 zIndex 冲突处理规则。
- measure、reflow、layout、pagination、repeat.scope、page-aware 的确定性规则。
- portable material compiler 的输入、输出、能力声明和降级规则。
- diagnostics code、severity、nodeId/sourceNodeId、detail 的稳定结构。

确定性要求：

- 坐标、尺寸、线宽、字体尺寸等数值统一使用十进制 JSON number，snapshot 比对前按约定精度归一化。
- 同一层级内节点排序必须稳定，默认按 layer placement、zIndex、原始 schema 顺序、node id 派生顺序排序。
- compiler 不得依赖对象枚举顺序、运行时 locale、系统时区或平台默认字体来决定布局结果。
- portable fixture 必须声明所需字体和文本测量模式；缺失字体或测量能力时必须产生诊断或按策略降级。

每个非 TS compiler 必须声明 support profile：

```ts
interface CompilerSupportProfile {
  language: 'typescript' | 'go' | 'csharp' | 'kotlin' | 'swift' | string
  compilerVersion: string
  schemaVersion: string
  materials: Record<string, MaterialPortableSupport>
  textMeasurement: 'deterministic-estimate' | 'font-metrics' | 'unsupported'
  snapshot: Array<'svg' | 'raster'>
}
```

support profile 用于决定某个运行时能否接收 `schema + data`。如果 profile 不能覆盖模板所需 portable 子集，应用层必须在编译阶段给出诊断，不能把问题推迟到 renderer。

## 26.6 端侧 Adapter 职责

端侧 adapter 只负责绘制，不负责解释 EasyInk 物料语义。

```ts
interface RenderPlanRenderer<TSurface = unknown> {
  render(plan: RenderPlan, surface: TSurface, options?: RenderPlanRenderOptions): Promise<void> | void
}
```

Adapter 必须支持：

- 单位换算：`mm / pt / px` 到目标设备坐标。
- 页面背景、裁剪、透明度、旋转、zIndex 层级。
- box、path、image、text、svg fallback 的绘制。
- 字体解析和缺失字体诊断。
- 图片加载失败诊断。
- 可选分页输出，例如 C# PDF 每个 RenderPage 输出一页。

Adapter 不应该支持：

- 任意 HTML 解析。
- 任意 CSS 级联。
- 任意 JavaScript 执行。
- data binding、format resolver、table repeat、chart data-contract 等业务语义。

## 26.7 物料 Portable 支持策略

物料注册需要增加渲染目标能力声明：

```ts
type MaterialRenderTarget = 'dom' | 'portable'

type MaterialPortableSupport =
  | { kind: 'primitive' }
  | { kind: 'composite' }
  | { kind: 'snapshot', formats: Array<'svg' | 'raster'> }
  | { kind: 'dom-only', reason: string }
  | { kind: 'unsupported', reason: string }

interface MaterialRenderCapability {
  targets: MaterialRenderTarget[]
  portable: MaterialPortableSupport
}
```

物料 portable renderer 示例：

```ts
interface MaterialPortableRenderer {
  renderPortable: (
    node: MaterialNode,
    context: PortableRenderContext,
  ) => RenderNode[]
}
```

支持分层：

| 层级 | 含义 | 物料示例 |
| --- | --- | --- |
| `primitive` | 直接映射基础绘制节点 | line、rect、ellipse、image、qrcode、barcode、page-number |
| `composite` | 输出多个基础节点组合 | text、table-static、table-data、progress |
| `snapshot` | 编译期生成 SVG 或图片快照 | chart、复杂 svg、签名 |
| `dom-only` | 合法物料能力，但只承诺 DOM Viewer 输出 | 任意 html、rich-text、iframe、video |
| `unsupported` | 当前 portable 管线不支持，也没有可用降级 | 未注册物料、缺失必要 runtime 的自定义物料 |

`dom-only` 与 `unsupported` 必须区分。`dom-only` 表示产品上允许存在，但 portable 编译时应按 `unsupportedPolicy` 产出诊断、占位或 snapshot；`unsupported` 表示当前无法安全输出，默认不应静默通过。

不支持的物料必须生成 `RenderDiagnostic`：

```ts
interface RenderDiagnostic {
  category: 'schema' | 'datasource' | 'font' | 'material' | 'asset' | 'renderer'
  severity: 'info' | 'warning' | 'error'
  code: string
  message: string
  nodeId?: string
  detail?: unknown
}
```

## 26.8 降级策略

portable 管线允许以下降级：

1. `diagnostic-only`：端侧显示占位或忽略，适合 iframe/video。
2. `placeholder`：编译期输出明确占位节点，适合 layout-only 或编辑预览。
3. `svg-fallback`：编译期输出受信 SVG 字符串，端侧支持 SVG 的平台直接绘制或转图片。
4. `raster-fallback`：编译期生成图片快照，端侧只绘制 image。
5. `dom-only`：RenderPlan 保留诊断和布局占位，但声明该物料只由 DOM Viewer 承担视觉输出。

降级策略必须显式进入 RenderPlan，不允许 adapter 自行猜测。

```ts
interface RenderFallback {
  mode: 'diagnostic-only' | 'placeholder' | 'svg' | 'raster' | 'dom-only'
  source?: string
  reason: string
}
```

fallback 应挂到具体 `RenderNode` 或对应 `RenderDiagnostic.detail` 中，并至少包含 `nodeId/sourceNodeId`、`mode`、`reason`。adapter 只能执行 RenderPlan 中已经声明的 fallback，不能根据物料类型自行猜测。

若 `unsupportedPolicy` 为 `error`，编译器应在发现无法 portable 的物料时停止输出成功结果；若为 `diagnostic` 或 `placeholder`，仍可返回 RenderPlan，但必须保证诊断可追踪。

## 26.9 与现有 Viewer 的关系

现有 Viewer DOM 管线继续服务：

- 浏览器预览。
- iframe 设计器预览。
- DOM PDF 导出。
- 浏览器打印。
- 依赖 HTML/CSS/SVG 细节的高保真输出。

新增 portable 管线服务：

- 小程序 Canvas 预览或打印前页面生成。
- App 原生预览。
- C# 本地打印、PDF 或图片生成。
- Go 本地 PDF、图片或打印内容生成。
- 应用内批量渲染。
- 对 Node/browser 不可用环境的轻量渲染。

服务端批量渲染属于可选部署形态，不是 portable 管线成立的前提。

两条管线共享 schema、binding、layout、pagination 规则；差异只应存在于最终输出后端。若某个物料的 DOM 渲染与 portable 渲染不可避免存在差异，必须在物料文档中声明。

## 26.10 推荐包边界

RenderPlan 是一个渲染能力族，物理目录必须收敛到同一个根目录下，不能把系列包平铺到 `packages/` 根目录。

```text
packages/render/
  README.md

  plan/                         # @easyink/render-plan
    src/types.ts                # RenderPlan JSON 契约
    src/diagnostics.ts
    src/capabilities.ts
    src/json-schema.ts          # RenderPlan JSON schema 导出
    src/index.ts

  compiler/                     # @easyink/render-compiler
    src/compiler.ts             # compileRenderPlan(input)
    src/page-plan.ts            # Viewer 前半段编排 facade
    src/material-registry.ts    # portable renderer registry
    src/fallback.ts
    src/index.ts

  adapters/
    dom/                        # @easyink/render-adapter-dom
      src/index.ts              # RenderPlan -> DOM，用于对照测试

    canvas/                     # @easyink/render-adapter-canvas
      src/index.ts              # RenderPlan -> Canvas2D 通用适配

    mini-program/               # @easyink/render-adapter-mini-program
      src/index.ts              # RenderPlan -> 小程序 Canvas wrapper

  testing/                      # @easyink/render-testing
    src/fixtures.ts
    src/assert-render-plan.ts
    src/image-diff.ts

lib/EasyInk.Net/
  EasyInk.RenderPlan/           # C# RenderPlan DTO，镜像 protocol，不属于 pnpm 包
  EasyInk.Render.Compiler/      # C# 进程内 compiler，镜像 compiler spec
  EasyInk.Render.Renderer/      # C# renderer，输出 SkiaSharp / GDI / PDF

go/easyink/
  renderplan/                   # Go RenderPlan DTO，镜像 protocol
  compiler/                     # Go 进程内 compiler，镜像 compiler spec
  renderer/                     # Go renderer，输出 PDF / image / print surface
```

依赖方向：

```text
@easyink/render-plan
  <- @easyink/render-compiler
  <- @easyink/render-adapter-*
  <- @easyink/render-testing

@easyink/render-compiler
  -> @easyink/schema
  -> @easyink/core
  -> portable material renderers

@easyink/render-adapter-*
  -> @easyink/render-plan
```

约束：

- `plan` 只放纯类型、JSON schema、capability 和 diagnostic 定义，不依赖 `@easyink/core`、`@easyink/viewer` 或物料包。
- `compiler` 可以依赖 `@easyink/schema`、`@easyink/core` 和 portable 物料注册。
- `adapters/*` 只依赖 `@easyink/render-plan`，不得依赖 `@easyink/viewer` 的 DOM RenderSurface，也不得解释 binding、pagination 或物料私有语义。
- `testing` 提供跨 adapter fixture、snapshot、image diff 工具，不能被生产运行时反向依赖。
- Go、C#、Kotlin、Swift 等非 pnpm 实现必须至少镜像 `plan` 契约；若要接收 `schema + data`，还必须镜像 compiler spec 和 portable material compiler 行为。
- 非 TS compiler 不能成为独立方言，必须通过同一套 golden fixtures 验证与 TypeScript 参考编译器一致。

落地时需要同步补充 workspace glob：

```yaml
packages:
  - packages/render/*
  - packages/render/adapters/*
```

## 26.11 落地里程碑

### 阶段 1：契约和基础编译器

- 定义 RenderPlan TypeScript 类型和 JSON schema。
- 定义语言无关 compiler spec 初稿和 compiler support profile。
- 从 ViewerRuntime 中抽出可复用的 `buildPagePlan()` 或等价内部编排。
- 新增 `compileRenderPlan(input)`，先支持页面、背景、基础定位、诊断。
- DOM adapter 读取 RenderPlan 输出页面，用于和现有 Viewer 对照。

验收：

- text、line、rect、ellipse、image、qrcode 能生成 RenderPlan。
- DOM adapter 能渲染固定纸单页和连续纸单 sheet。
- golden fixture 包含 schema、data、assets、options、RenderPlan snapshot 和 diagnostics snapshot。
- fixture 不依赖外部服务、daemon、系统 locale 或平台默认字体。

### 阶段 2：文本和表格

- 文本 portable renderer 输出结构化 text node。
- 编译器在可用字体信息或确定性估算模式下输出 `RenderTextLine[]`。
- table-static/table-data 输出 group + box + text nodes。
- table-data 复用现有预解析、测量、fragmentPaginator 规则。

验收：

- 基础票据、标签、A4 报表可在 DOM adapter 和 Canvas adapter 中对齐。
- 表格分页和页码 repeat 在 RenderPlan 中已经展开。
- 文本和表格 fixture 可被 TypeScript compiler 与至少一个原生 compiler 原型复现。

### 阶段 3：应用内非 Web compiler 与 renderer

- 小程序：实现 npm 形态的 in-process compiler 调用路径，以及 Canvas adapter 的 box/text/image/path 绘制。
- Go/C#：实现 RenderPlan DTO、基础 compiler subset、单位换算、PDF/image/SkiaSharp/GDI 等 renderer。
- 统一资产加载回调，支持本地字体和图片缓存。
- 非 TS compiler 先覆盖 primitive + text + table + page-number，不要求一次覆盖全部 DOM 物料。

验收：

- 同一份 schema + data 可以在 Web、Go/C#、小程序进程内编译出一致 RenderPlan。
- Web、Go/C#、小程序 renderer 可以基于各自本地 RenderPlan 生成近似一致输出。
- adapter 对缺失字体、缺失图片、unsupported material 产生一致诊断。

### 阶段 4：复杂物料降级

- TypeScript 参考编译器中的 chart 可输出 SVG 或 raster fallback。
- 原生 compiler 中的 chart 只有在具备本地 chart compiler 或本地 snapshot provider 时才输出 fallback，否则标记为 `dom-only` 或 `unsupported`。
- svg-custom 可在具备本地 sanitize/render 能力时输出 sanitized SVG 或 raster fallback。
- signature 优先输出 path；缺少 path 能力时可使用本地 raster fallback。
- html/rich-text/iframe/video 标记 portable unsupported 或 raster fallback。

验收：

- 复杂物料不会导致整份 RenderPlan 编译失败。
- 每个降级都可追踪到 nodeId、fallback mode 和 reason。
- Go/C#/Kotlin/Swift 等原生 compiler 不允许为了生成复杂物料 fallback 而隐式依赖服务端或 daemon。

## 26.12 一致性测试

跨平台不能只靠人工截图，需要建立 fixture 契约：

```text
fixtures/render-plan/
  invoice-basic/
    schema.json
    data.json
    expected.render-plan.json
    expected.diagnostics.json
  table-pagination/
  qrcode-label/
  unsupported-html/
```

测试层级：

1. RenderPlan snapshot：验证编译语义稳定。
2. DOM adapter screenshot：验证参考渲染。
3. Canvas/Go/C# adapter image diff：验证端侧绘制近似一致。
4. Diagnostics snapshot：验证降级和错误可见。

RenderPlan snapshot 是最核心的契约。端侧渲染允许少量字体 raster 差异，但不允许元素缺失、坐标错页、层级错乱或诊断缺失。

强布局一致 fixture 必须额外断言：

- 每页尺寸、页数、页序完全一致。
- 每个 `sourceNodeId` 的页归属、坐标、尺寸和 layer placement 完全一致。
- table-data/table-static 的行高、列宽、单元格矩形和分页切分完全一致。
- 强一致文本节点必须包含 `layout.lines`，且各 adapter 不得重新断行。
- dom-only、snapshot、unsupported 物料必须有 diagnostics snapshot，且 fallback mode 与编译策略一致。

图片 diff 只用于验证视觉近似，不作为布局契约的唯一依据。布局契约以 RenderPlan JSON 和 diagnostics snapshot 为准。

## 26.12.1 Compiler 一致性测试

TypeScript compiler 是参考实现，但不是唯一实现。每个原生 compiler 都必须通过同一批输入 fixture：

```text
schema.json + data.json + assets.json + options.json
  -> expected.render-plan.json
  -> expected.diagnostics.json
```

测试规则：

- TypeScript、Go、C# 等 compiler 对同一 portable fixture 必须输出语义等价 RenderPlan。
- 浮点数允许按统一精度归一化，例如坐标和尺寸保留 4 位小数。
- diagnostics 的 `code`、`severity`、`nodeId`、fallback mode 必须一致。
- 非 TS compiler 对不支持的物料必须输出与能力声明一致的 `dom-only` 或 `unsupported` 诊断。
- 任何语言不得为了通过 fixture 而调用外部编译服务、外部 daemon 或隐藏网络 snapshot 服务。

## 26.13 风险与约束

### 字体与文本排版

文本是跨平台一致性的最大风险。不同平台的字形度量、CJK 换行、行高和 fallback 字体都会造成差异。

推荐策略：

- 强布局一致模式下，编译器必须输出 `RenderTextLine[]` 和每行位置。
- best-effort 模式下，编译器可以省略 `lines`，但必须接受 adapter 文字引擎造成的换行差异。
- 高保真 C# / App adapter 优先使用 Skia/HarfBuzz 类文字引擎。
- 小程序 adapter 接受有限差异，但必须保持盒子边界、对齐和溢出策略。

### 任意 HTML/CSS

portable 管线不支持任意 HTML/CSS。需要 HTML 能力的模板应继续走 DOM Viewer，或由编译期生成 raster fallback。

### 自定义 JS

schema 中的可信 JS format、chart-custom optionCode 等能力不能直接下放到非 JS 端。可选策略：

- TypeScript 参考编译器可在受控策略下执行并把结果固化到 RenderPlan。
- 非 TS 原生 compiler 默认不得执行 JS；需要等价能力时，应使用跨语言可实现的声明式格式 DSL，或要求业务侧在传入 data 前完成计算。
- 产品禁用 portable 输出中的自定义 JS 能力。

### 图表

内置图表在 TypeScript 参考编译器中可优先采用 snapshot 策略。Go/C# 等原生 compiler 不能默认依赖 ECharts 或外部 snapshot 服务；若要支持 chart，需要实现本语言 chart portable compiler、使用本地 snapshot provider，或标记为 `dom-only` / `unsupported`。后续如果要原生高保真图表，应把 chart-kernel 输出下沉为 chart drawing primitives，而不是让端侧理解 ECharts option。

## 26.14 部署形态

默认部署形态是应用内编译和应用内渲染。任何运行时只要对外提供 `schema + data` 输入，就必须在同一应用进程内完成 RenderPlan 编译。

默认流程：

```text
schema + data + assets
  -> in-process RenderPlanCompiler
  -> RenderPlan
  -> in-process RenderPlanRenderer
  -> target output
```

允许形态：

| 形态 | 是否默认 | 说明 | 适用场景 |
| --- | --- | --- | --- |
| Web/Node 参考编译器 | 是 | TypeScript 官方实现，作为 spec reference 和 Web 应用内 compiler | Designer、Web 预览、测试基准 |
| 小程序应用内编译 | 是 | 小程序通过 npm 包在应用内编译，再交给 Canvas adapter | 小程序预览、轻量打印前渲染 |
| Go/C#/Kotlin/Swift 原生编译 | 是 | 各语言实现同一份 compiler spec 和 RenderPlan DTO | 跨语言应用、离线、本地打印 |
| 服务端编译 | 否 | 后端返回 RenderPlan | 只适用于业务明确允许外部编译的批量任务 |
| 本地 daemon 编译 | 否 | 应用进程外的本机编译服务 | 只适用于业务明确允许进程外依赖的历史集成 |

禁止把服务端编译或本地 daemon 作为跨平台能力的前置条件。它们可以存在，但不能替代应用内 compiler，也不能成为 Go/C# 等语言接入 EasyInk 的唯一方式。

各端消费流程：

```text
compile RenderPlan in process
  -> load fonts/images through local asset resolver
  -> create target surface
  -> render pages in order
  -> report diagnostics to host UI/log
```

Go/C# 等语言如果暂时只实现 renderer，则其公开 API 只能声明接收 RenderPlan，不能声明接收 `schema + data`。一旦 API 声明接收 `schema + data`，就必须实现本语言 compiler subset，并通过 RenderPlan golden fixtures。

## 26.15 版本与兼容

RenderPlan 必须独立版本化，不能直接复用 `DocumentSchema.version`。

```ts
interface RenderPlan {
  version: string
  schemaVersion: string
  compilerVersion?: string
  minRendererVersion?: string
  capabilities?: RenderPlanCapabilities
  pages: RenderPage[]
}
```

兼容规则：

- Patch 版本只能修复诊断、元数据或不影响绘制的字段。
- Minor 版本可以新增可选 primitive 或可选字段。
- Major 版本可以改变 primitive 语义、坐标语义或必填字段。
- Adapter 遇到未知可选字段必须忽略。
- Adapter 遇到未知必需 primitive 必须输出 `UNSUPPORTED_RENDER_NODE` 诊断。
- Compiler 可以根据 `options.target` 和 renderer capability 选择降级策略。

Renderer capability 示例：

```ts
interface RenderPlanCapabilities {
  nodes: Array<'group' | 'box' | 'text' | 'image' | 'path' | 'svg'>
  text?: {
    positionedLines?: boolean
    richRuns?: boolean
  }
  image?: {
    repeat?: boolean
    fitModes?: Array<'fill' | 'contain' | 'cover' | 'none'>
  }
  fallback?: Array<'diagnostic-only' | 'placeholder' | 'svg' | 'raster' | 'dom-only'>
}
```

这允许小程序 adapter 声明不支持 SVG 时，编译器提前产出本地 raster fallback 或 placeholder；Go/C# adapter 声明支持 path 和 positioned text 时，编译器保留更高保真的矢量节点。编译器选择 fallback 时必须同时考虑 renderer capability、物料能力声明和当前运行时是否具备本地 snapshot provider。

## 26.16 设计原则

- RenderPlan 是输出计划，不是新模板格式。
- schema 仍是唯一可编辑、可保存的模板源。
- 复杂物料语义集中在编译器，不扩散到每个端侧 adapter。
- Adapter 只画 primitives，不解释 EasyInk 业务规则。
- 所有降级和失败都必须进入 diagnostics。
- portable 子集逐步扩大，不以一次性覆盖全部 DOM 能力为目标。
