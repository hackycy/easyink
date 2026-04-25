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
- 提供默认值工厂、迁移器、兼容层
- 只关心模板模型，不关心运行时加载和 UI

### `@easyink/core`

- CommandManager、SelectionModel
- 历史（undo/redo）由 CommandManager 内部栈管理，无独立 HistoryModel
- 几何计算、辅助线、吸附、分页计划、区域模型
- 不直接渲染 DOM，不依赖 Vue

### `@easyink/datasource`

- 字段树协议
- 数据源引用与适配器注册
- 绑定格式规则、聚合规则、批量投放元数据
- 给 `designer` 和 `viewer` 共用，而不是只属于其中一边

### `@easyink/viewer`

- 独立 Viewer 运行时
- 负责预览、缩略图、打印、导出文档入口
- 负责数据加载、字体加载、页面计划与最终页面渲染

### `@easyink/designer`

- 顶部工具栏、画布、面板系统、概览图、历史记录
- 管理设计态工作台状态
- 通过插槽和 `useDesignerStore()` 暴露宿主集成点，不在包级直接依赖 `@easyink/viewer`
- 暴露 **Contribution API**（`Contribution` / `ContributionRegistry`）作为唯一外部扩展协议；不直接依赖 `@easyink/ai` 或 `@easyink/schema-tools`

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
designer ─── core + datasource + schema + shared + ui + icons + material-*
  ↑
ai ──────── designer (仅类型) + datasource + schema + schema-tools + shared + vue + @modelcontextprotocol/sdk

mcp-server ─── schema-tools + datasource + schema + shared + @modelcontextprotocol/sdk + zod

playground ── designer + ai + viewer + samples + schema
```

依赖原则：

- `designer` 依赖全部 `material-*` 包（设计态注册），不直接依赖 `viewer`（预览由宿主自行引入 `viewer`）
- `viewer` 依赖 `core`、`datasource`、`schema`、`shared`，不依赖 `material-*`（Viewer 物料渲染器由调用方注册）
- `ui` 依赖 `icons` 和 `shared`，不依赖 `designer`；方向为 designer 依赖 ui
- `samples` 依赖 `datasource`、`schema`、`shared`，不依赖 `designer`
- `schema-tools` 仅依赖 `datasource`、`schema`、`shared`；无 Vue 依赖；可在 Node 与浏览器双端运行
- `ai` 依赖 `schema-tools`（校验/对齐）、`designer`（仅 `Contribution` 与 `DesignerStore` 类型）、`vue`、`@modelcontextprotocol/sdk`；通过 `createAIContribution()` 注入 designer，**designer 不反向依赖 ai**
- `mcp-server` 依赖 `schema-tools`（兜底校验）、`datasource`、`schema`、`shared`、`@modelcontextprotocol/sdk`、`zod`。LLM SDK 为 optionalDependencies（`@anthropic-ai/sdk`、`openai`），按运行时环境变量选择加载

## 3.4 对外消费方式

```typescript
import { EasyInkDesigner } from '@easyink/designer'
import { createViewer } from '@easyink/viewer'

const viewer = createViewer({ mode: 'fixed' })
await viewer.open({ schema, data })
```

公开入口的目标是两个：

- 宿主可单独使用 `viewer`
- 宿主可直接挂载 `designer`，再按需引入 `viewer` 组成预览/打印工作流
