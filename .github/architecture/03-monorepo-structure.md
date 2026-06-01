# 3. Monorepo 包结构

包结构以“文档模型、数据源、核心能力、设计器、Viewer、物料系统、导出/打印、Assistant”几条主轴组织。

```
easyink/
├── packages/
│   ├── shared/                 # @easyink/shared — 通用类型、工具、常量
│   ├── schema/                 # @easyink/schema — Schema 类型、默认值、迁移、序列化、校验
│   ├── core/                   # @easyink/core — 命令、选择、几何、分页、字体、物料协议
│   ├── datasource/             # @easyink/datasource — 字段树、数据源引用、绑定格式模板
│   ├── viewer/                 # @easyink/viewer — ViewerRuntime、预览、打印、导出、缩略图
│   ├── export/
│   │   ├── runtime/            # @easyink/export-runtime — 导出任务状态机、插件注册（不绑定具体格式实现）
│   │   └── plugin/
│   │       └── dom-pdf/        # @easyink/export-plugin-dom-pdf — 浏览器 DOM 截图转 PDF 插件（html2canvas + jsPDF）
│   ├── print/
│   │   ├── core/              # @easyink/print-core — 打印驱动共享纯工具
│   │   ├── integration-easyink-printer/ # @easyink/print-integration-easyink-printer — EasyInk.Printer 客户端与 Viewer 驱动
│   │   └── integration-hiprint/         # @easyink/print-integration-hiprint — HiPrint 客户端与 Viewer 驱动
│   ├── builtin/                # @easyink/builtin — 内置物料注册、Designer/Viewer/Assistant 共享清单
│   ├── designer/               # @easyink/designer — 设计器工作台 Vue 组件
│   ├── locales/                # @easyink/locales — 设计器内置语言包
│   ├── prop-schemas/           # @easyink/prop-schemas — 内置物料基础属性 Schema
│   ├── ui/                     # @easyink/ui — 面板、表单、工作台基础组件
│   ├── icons/                  # @easyink/icons — 图标资产
│   ├── schema-tools/           # @easyink/schema-tools — Schema 校验、DataSource 对齐
│   ├── samples/                # @easyink/samples — 示例 schema、data 与 datasource
│   ├── assistant/              # @easyink/assistant-* — Assistant 平台包族
│   └── materials/
│       ├── text/
│       ├── image/
│       ├── barcode/
│       ├── qrcode/
│       ├── line/
│       ├── rect/
│       ├── ellipse/
│       ├── kernel/           # kernel为表格共享纯计算库
│       ├── chart/
│       └── svg/
├── playground/
```

## 3.1 包职责

### `@easyink/schema`

- 定义文档 Schema
- 提供默认值工厂、输入归一化、迁移器、兼容层
- 只关心模板模型，不关心运行时加载和 UI

### `@easyink/core`

- CommandManager、SelectionModel
- 历史（undo/redo）由 CommandManager 内部栈管理，无独立 HistoryModel
- 几何计算、辅助线、吸附、分页计划、区域模型

### `@easyink/builtin`

- 汇总内置物料的 Designer 注册元数据、Viewer 渲染注册以及 AI 物料知识描述符
- 作为内部装配层被 `designer`、`viewer` 和 Assistant 物料知识链路消费，不作为宿主应用主入口推荐
- 统一维护默认物料清单，避免 Designer / Viewer / Assistant 三处漂移

### `@easyink/datasource`

- 只处理数据源描述、字段树、命名空间、绑定格式模板和规范化
- 不依赖 `@easyink/viewer`

### `@easyink/viewer`
- 独立 Viewer 运行时
- 负责预览、缩略图、打印、导出文档入口
- 负责数据绑定投影、字体加载、页面计划与最终页面渲染
- 通过 `ViewerExporter` / `PrintDriver` 承接外部导出和打印运行时；打印驱动由 `driverId` 显式选择，未指定时回退浏览器打印
- 默认注册内置物料；宿主后续注册同类型物料时以后注册覆盖默认注册

### `@easyink/export-runtime`

- 框架无关的导出运行时内核
- 只提供 `createExportRuntime()`、plugin registry、`ExportDispatchState` 状态机、进度与诊断回调
- 不绑定任何具体导出格式；不依赖 `html2canvas` / `jspdf` 等第三方实现

### `@easyink/export-plugin-dom-pdf`

- 内置默认 PDF 导出插件：浏览器 DOM 截图（`html2canvas`） + `jsPDF` 组装
- 暴露 `createDomPdfExportPlugin()` 与 `renderPagesToPdfBlob()` 两个入口
- `html2canvas` / `jspdf` 通过动态 `import()` 按需装载，不进入 runtime / core / schema
- 资源加载失败默认产生 warning 诊断并继续导出，避免静默吞掉问题
- 后续其他 PDF 链路（服务端渲染、矢量导出等）应作为同级独立 plugin 包发布，不再回灌到 runtime

### `@easyink/print-core`

- 打印驱动共享纯工具层，不绑定具体打印服务或 UI 框架
- 提供 Viewer 页面提取、打印尺寸解析、单位转换、方向/偏移解析和诊断桥接
- 被官方打印驱动包消费，宿主通常不直接依赖

### `@easyink/print-integration-easyink-printer`

- EasyInk.Printer 官方前端客户端和 Viewer PrintDriver
- 封装 HTTP/WebSocket、PDF 分块上传、任务查询、默认打印机选择和 Viewer DOM 转 PDF
- 驱动默认 `pageSizeMode: 'fixed'`

### `@easyink/print-integration-hiprint`

- HiPrint 官方前端客户端和 Viewer PrintDriver
- 封装 electron-hiprint 连接、打印机发现、逐页 HTML 打印和按设备开启的 `pageSize` 策略
- 驱动默认 `pageSizeMode: 'driver'`

### `@easyink/designer`

- 顶部工具栏、画布、面板系统、概览图、历史记录
- 管理设计态工作台状态
- 通过插槽、`setupStore` 和 `useDesignerStore()` 暴露宿主集成点，不在包级直接依赖 `@easyink/viewer`
- 默认注册内置物料；宿主通过 `setupStore` 追加注册时以后注册覆盖默认注册
- 依赖 `@easyink/locales` 和 `@easyink/prop-schemas` 获取内置语言包与基础属性 Schema；对外仍通过 `@easyink/designer/locale` 透出语言包
- 暴露 **Contribution API**（`Contribution` / `ContributionRegistry`）作为唯一外部扩展协议；不直接依赖 Assistant 集成包或 `@easyink/schema-tools`
- 对外发布时保持 `vue` 为 peerDependencies，避免宿主拿到重复 Vue runtime；`codemirror` 属于 designer 自身运行时组成部分，必须作为 dependencies 随包安装，保证开箱即用

### `@easyink/locales`

- 维护设计器内置 `zhCN` / `enUS` 语言包与 `LocaleMessages` 类型
- 作为静态资源包被 `@easyink/designer` 消费；宿主应用推荐继续从 `@easyink/designer/locale` 引入，避免把资源包路径变成应用层长期合同
- 翻译新增、改文案、补 locale key 通常只影响该包，不应被误判为 Designer 工作台行为变更

### `@easyink/prop-schemas`

- 维护内置物料的基础属性面板 Schema，例如 text / image / barcode / qrcode / table / flow-row 等公共字段矩阵
- 只依赖 `@easyink/core` 的 `PropSchema` 类型，不反向依赖 `@easyink/designer`
- 物料包仍可通过自身 `propSchemas` 提供 material-owned 追加项；Designer 注册时先取基础 Schema，再合并物料包追加 Schema
- 属性字段、分组、枚举、显示条件等维护通常只影响该包；只有属性面板协议、Store、提交行为或画布交互变化才属于 Designer 核心层变化

### `@easyink/material-*`

- 每种物料一个独立包
- 包内同时提供 Schema 默认值、属性描述、Designer 交互、Viewer 渲染器
- 先服务内置体系，第三方开放后再稳定契约

### `@easyink/schema-tools`

- Schema 三层校验器（structure / semantic / binding），`validate()` 无副作用，`autoFix()` 操作 deep clone
- DataSource 字段对齐工具，支持模糊匹配
- 无 Vue 依赖，可被 Assistant capabilities、orchestrator 和批处理脚本消费
- 依赖 `datasource`、`schema`、`shared`

## 3.2 物料包内部结构

以 `@easyink/material-table-data` 为例：

```
packages/materials/table-data/
├── src/
│   ├── schema.ts              # 默认 props、迁移补丁、能力声明
│   ├── designer.ts            # 单元格选区、列宽拖拽、行列编辑、属性桥接
│   ├── viewer.ts              # 表格分页、重复头、合计区渲染
│   ├── datasource.ts          # 绑定提示、字段推荐、union 规则
│   └── index.ts
└── package.json
```

## 3.3 依赖关系

```
shared          icons
  ↑               ↑
schema            ui ─── icons + shared
  ↑
core        datasource
  ↑           ↑
  ├── viewer ─┘           samples ─── datasource + schema + shared
  │
material-* ── core + schema + shared (+ datasource 按需)
  ↑
builtin ───── designer + viewer + assistant-* + material-*

designer ─── builtin + core + datasource + schema + shared + ui + icons + locales + prop-schemas + material-table-kernel
locales ─── (no runtime deps)
prop-schemas ─── core
viewer ─── builtin + core + schema + shared
export-runtime ─── shared
export-plugin-dom-pdf ─── export-runtime + shared + html2canvas + jspdf
print-core ─── viewer + export-runtime
print-integration-easyink-printer ─── print-core + viewer + export-plugin-dom-pdf
print-integration-hiprint ─── print-core + viewer + vue-plugin-hiprint

assistant-* ── 多个 assistant 包彼此依赖，形成独立 Assistant 平台子图

playground ── designer + viewer + export-runtime + samples + schema
```

依赖原则：

- `designer` 依赖 `builtin`、`core`、`datasource`、`schema`、`shared`、`ui`、`icons`、`locales`、`prop-schemas` 与 `material-table-kernel`，默认启用内置物料；调用方可通过 `setupStore` 继续扩展或覆盖
- `locales` 与 `prop-schemas` 是 Designer 静态资源边界包：前者维护内置语言包，后者维护基础属性 Schema。它们可独立构建、测试和发布，但应用层稳定入口仍优先使用 `@easyink/designer` 及其 `./locale` facade
- 已被 designer 内部直接使用且宿主不应手动补齐的第三方运行时依赖（如 `codemirror`）必须声明为 `dependencies`；只有需要与宿主单例对齐的框架依赖（当前为 `vue`）才保留为 `peerDependencies`
- `viewer` 依赖 `builtin`、`core`、`schema`、`shared`，默认启用内置物料；调用方可通过 `viewer.registerMaterial()` 继续扩展或覆盖。`viewer` 不依赖 `datasource`
- `export-runtime` 仅依赖 `shared`，不绑定任何导出格式实现，不依赖 `viewer`、`designer` 或 Vue
- `export-plugin-dom-pdf` 依赖 `export-runtime`、`shared` 与按需装载的 `html2canvas` / `jspdf`；任何具体导出链路一律走独立 plugin 包，不再回灌到 runtime
- `print-core` 只承接打印驱动共享逻辑；具体打印通道放在 `packages/print/*` 下独立包中
- `print-integration-easyink-printer` 依赖 `print-core`、`viewer` 与 `export-plugin-dom-pdf`；负责 EasyInk.Printer 通道的协议和 Viewer 驱动
- `print-integration-hiprint` 依赖 `print-core`、`viewer` 与 `vue-plugin-hiprint`；负责 HiPrint 通道的协议和 Viewer 驱动
- `builtin` 依赖全部内置 `material-*` 包，集中维护 Designer / Viewer / Assistant 三侧共享的默认物料清单
- `ui` 依赖 `icons` 和 `shared`，不依赖 `designer`；方向为 designer 依赖 ui
- `samples` 依赖 `datasource`、`schema`、`shared`，不依赖 `designer`
- `schema-tools` 仅依赖 `datasource`、`schema`、`shared`；无 Vue 依赖；可在 Node 与浏览器双端运行
- `assistant-*` 形成独立平台子图，通过 Contribution 接入 Designer，核心 Designer / Viewer 不反向依赖 Assistant 包

## 3.4 对外消费方式

```typescript
import { EasyInkDesigner } from '@easyink/designer'
import { createViewer } from '@easyink/viewer'

// Vue template
// <EasyInkDesigner v-model:schema="schema" />

const viewer = createViewer({ mode: 'fixed' })
await viewer.open({ schema, data })
```

公开入口的目标是两个：

- 宿主可单独使用 `viewer`
- 宿主可直接挂载 `designer`，再按需引入 `viewer` 组成预览/打印工作流
