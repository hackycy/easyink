# 3. Monorepo 包结构

包结构以”文档模型、数据源、设计器、Viewer、物料系统”五条主轴组织。

```
easyink/
├── packages/
│   ├── shared/                 # @easyink/shared — 通用类型、工具、常量
│   ├── schema/                 # @easyink/schema — Schema 类型、默认值、迁移、序列化
│   ├── core/                   # @easyink/core — 命令、选择、几何、分页、辅助线、历史
│   ├── datasource/             # @easyink/datasource — 字段树、数据源引用、绑定规则、格式规则
│   ├── viewer/                 # @easyink/viewer — iframe Viewer、预览、打印、导出、缩略图
│   ├── export/
│   │   ├── runtime/            # @easyink/export-runtime — 导出任务状态机、插件注册（不绑定具体格式实现）
│   │   └── plugin/
│   │       └── dom-pdf/        # @easyink/export-plugin-dom-pdf — 浏览器 DOM 截图转 PDF 插件（html2canvas + jsPDF）
│   ├── print/
│   │   ├── core/                           # @easyink/print-core — 打印驱动共享纯工具
│   │   ├── integration-easyink-printer/   # @easyink/print-integration-easyink-printer — EasyInk.Printer 客户端与 Viewer 驱动
│   │   └── integration-hiprint/           # @easyink/print-integration-hiprint — HiPrint 客户端与 Viewer 驱动
│   ├── builtin/                # @easyink/builtin — 内置物料注册与清单汇总包（内部装配层）
│   ├── designer/               # @easyink/designer — 设计器工作台 Vue 组件
│   ├── ui/                     # @easyink/ui — 面板、表单、工作台基础组件
│   ├── icons/                  # @easyink/icons — 图标资产
│   ├── ai/                     # @easyink/ai — AI 对话面板、MCP Client、Server Registry、Designer Contribution
│   ├── schema-tools/           # @easyink/schema-tools — Schema 校验、DataSource 对齐（Node + 浏览器双端）
│   ├── mcp-server/             # @easyink/mcp-server — MCP Server、LLM Provider、Docker 部署
│   ├── samples/                # @easyink/samples — 示例 schema、data 与 datasource
│   └── materials/
│       ├── text/
│       ├── image/
│       ├── barcode/
│       ├── qrcode/
│       ├── line/
│       ├── rect/
│       ├── ellipse/
│       ├── table-static/
│       ├── table-data/
│       ├── table-kernel/           # @easyink/material-table-kernel — 表格共享纯计算库
│       ├── container/
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

- 汇总内置物料的 Designer 注册元数据、Viewer 渲染注册以及 MCP Server 物料描述符
- 作为内部装配层被 `designer`、`viewer`、`mcp-server` 消费，不作为宿主应用主入口推荐
- 统一维护默认物料清单，避免 Designer / Viewer / Server 三处漂移

### `@easyink/datasource`

- 通过插槽、`setupStore` 和 `useDesignerStore()` 暴露宿主集成点，不在包级直接依赖 `@easyink/viewer` 或具体物料包
- 数据源引用与适配器注册

### `@easyink/viewer`
- 包内同时提供 Schema 默认值、Designer 交互、Viewer 渲染器
- 独立 Viewer 运行时
- 负责预览、缩略图、打印、导出文档入口
- 负责数据加载、字体加载、页面计划与最终页面渲染
- 通过 `ViewerExporter` / `PrintDriver` 承接外部导出和打印运行时；打印驱动由 `driverId` 显式选择，未指定时回退浏览器打印
- 默认注册内置物料；宿主后续注册同类型物料时以后注册覆盖默认注册

### `@easyink/export-runtime`

- 框架无关的导出运行时内核
- 只提供 `createExportRuntime()`、plugin registry、`ExportDispatchState` 状态机、进度与诊断回调
- 不绑定任何具体导出格式；不依赖 `html2canvas` / `jspdf` 等第三方实现
- 不依赖 `viewer`；宿主或 playground 负责把 Viewer 的页面 DOM、渲染尺寸和诊断桥接进 runtime

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
- 暴露 **Contribution API**（`Contribution` / `ContributionRegistry`）作为唯一外部扩展协议；不直接依赖 `@easyink/ai` 或 `@easyink/schema-tools`
- 对外发布时保持 `vue` 为 peerDependencies，避免宿主拿到重复 Vue runtime；`codemirror` 属于 designer 自身运行时组成部分，必须作为 dependencies 随包安装，保证开箱即用

### `@easyink/material-*`

- 每种物料一个独立包
- 包内同时提供 Schema 默认值、属性描述、Designer 交互、Viewer 渲染器
- 先服务内置体系，第三方开放后再稳定契约

### `@easyink/schema-tools`

- Schema 三层校验器（structure / semantic / binding），`validate()` 无副作用，`autoFix()` 操作 deep clone
- DataSource 字段对齐工具，支持模糊匹配
- 无 Vue 依赖，被 `@easyink/ai`（生成结果二次校验）和 `@easyink/mcp-server`（LLM 输出兜底校验）共同消费
- 依赖 `datasource`、`schema`、`shared`

### `@easyink/ai`

- 浏览器端 AI 集成：MCP Client（`@modelcontextprotocol/sdk` + `StreamableHTTPClientTransport`）、Server Registry（localStorage 持久化）
- AIPanel：模板对话生成面板组件，按需挂载
- `createAIContribution()`：返回 designer Contribution，注册 toolbar 按钮、命令、面板
- 依赖 `datasource`、`schema`、`schema-tools`、`shared`、`designer`（仅类型）、`vue`、`@modelcontextprotocol/sdk`

### `@easyink/mcp-server`

- MCP Server 实现（基于 `@modelcontextprotocol/sdk` 的 `McpServer`），支持 stdio 和 HTTP/SSE 两种 transport
- LLM Provider 抽象层：通过 async factory pattern 动态加载 Claude / OpenAI SDK，避免 `require()`
- 物料知识通过 `config/materials.json` 注入 system prompt
- 暴露 `generateSchema` 和 `generateDataSource` 两个 MCP Tool
- 无状态设计：schema 进出，无文件 IO，单机无认证
- 依赖 `datasource`、`schema`、`schema-tools`、`shared`、`@modelcontextprotocol/sdk`、`zod`
- LLM SDK（`@anthropic-ai/sdk`、`openai`）为 optionalDependencies，用户按需安装
- Docker 部署：多阶段构建 + `pnpm deploy`，`docker-compose.yml` 一键启动
- CLI 入口：`npx easyink-mcp-server`，通过 `MCP_TRANSPORT` 环境变量选择传输模式

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
builtin ───── designer + viewer + mcp-server + material-*

designer ─── builtin + core + datasource + schema + shared + ui + icons + material-table-kernel
viewer ─── builtin + core + datasource + schema + shared
export-runtime ─── shared
export-plugin-dom-pdf ─── export-runtime + shared + html2canvas + jspdf
print-core ─── viewer + export-runtime
print-easyink ─── print-core + viewer + export-plugin-dom-pdf
print-hiprint ─── print-core + viewer + vue-plugin-hiprint
  ↑
ai ──────── designer (仅类型) + datasource + schema + schema-tools + shared + vue + @modelcontextprotocol/sdk

mcp-server ─── builtin + schema-tools + datasource + schema + shared + @modelcontextprotocol/sdk + zod

playground ── designer + ai + viewer + export-runtime + samples + schema
```

依赖原则：

- `designer` 依赖 `builtin`、`core`、`datasource`、`schema`、`shared`、`ui`、`icons` 与 `material-table-kernel`，默认启用内置物料；调用方可通过 `setupStore` 继续扩展或覆盖
- 已被 designer 内部直接使用且宿主不应手动补齐的第三方运行时依赖（如 `codemirror`）必须声明为 `dependencies`；只有需要与宿主单例对齐的框架依赖（当前为 `vue`）才保留为 `peerDependencies`
- `viewer` 依赖 `builtin`、`core`、`schema`、`shared`，默认启用内置物料；调用方可通过 `viewer.registerMaterial()` 继续扩展或覆盖。`viewer` 不依赖 `datasource`，不消费 Designer 的数据源描述符
- `export-runtime` 仅依赖 `shared`，不绑定任何导出格式实现，不依赖 `viewer`、`designer` 或 Vue
- `export-plugin-dom-pdf` 依赖 `export-runtime`、`shared` 与按需装载的 `html2canvas` / `jspdf`；任何具体导出链路一律走独立 plugin 包，不再回灌到 runtime
- `print-core` 只承接打印驱动共享逻辑；具体打印通道放在 `packages/print/*` 下独立包中
- `print-easyink` 依赖 `print-core`、`viewer` 与 `export-plugin-dom-pdf`；负责 EasyInk.Printer 通道的协议和 Viewer 驱动
- `print-hiprint` 依赖 `print-core`、`viewer` 与 `vue-plugin-hiprint`；负责 HiPrint 通道的协议和 Viewer 驱动
- `builtin` 依赖全部内置 `material-*` 包，集中维护 Designer / Viewer / MCP Server 三侧共享的默认物料清单
- `ui` 依赖 `icons` 和 `shared`，不依赖 `designer`；方向为 designer 依赖 ui
- `samples` 依赖 `datasource`、`schema`、`shared`，不依赖 `designer`
- `schema-tools` 仅依赖 `datasource`、`schema`、`shared`；无 Vue 依赖；可在 Node 与浏览器双端运行
- `ai` 依赖 `schema-tools`（校验/对齐）、`designer`（仅 `Contribution` 与 `DesignerStore` 类型）、`vue`、`@modelcontextprotocol/sdk`；通过 `createAIContribution()` 注入 designer，**designer 不反向依赖 ai**
- `mcp-server` 依赖 `builtin` 与 `schema-tools`（兜底校验）、`datasource`、`schema`、`shared`、`@modelcontextprotocol/sdk`、`zod`。LLM SDK 为 optionalDependencies（`@anthropic-ai/sdk`、`openai`），按运行时环境变量选择加载

## 3.4 对外消费方式

```typescript
import { EasyInkDesigner } from '@easyink/designer'
import { createDomPdfExportPlugin } from '@easyink/export-plugin-dom-pdf'
import { createExportRuntime } from '@easyink/export-runtime'
import { createViewer } from '@easyink/viewer'

// Vue template
// <EasyInkDesigner v-model:schema="schema" />

const viewer = createViewer({ mode: 'fixed' })
const exportRuntime = createExportRuntime()
exportRuntime.registerPlugin(createDomPdfExportPlugin())
await viewer.open({ schema, data })
```

公开入口的目标是两个：

- 宿主可单独使用 `viewer`
- 宿主可直接挂载 `designer`，再按需引入 `viewer` 组成预览/打印工作流
