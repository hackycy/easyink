# 23. AI 集成与 Contribution 机制

本文档描述 EasyInk 如何通过 AI（LLM）+ MCP（Model Context Protocol）实现模板对话生成，并说明 designer 如何通过 **Contribution API** 与 AI 包解耦。

> 历史背景：旧 `@easyink/mcp` 客户端职责被认为偏“AI 对话工具”而非纯 MCP 协议层；同时 designer 直接耦合该包不利于后续引入更多扩展能力。本次重构：
> - `@easyink/mcp` → `@easyink/ai`（AI 对话 + MCP 传输的客户端集成）
> - 校验/对齐工具下沉到独立、可被 server 端复用的 `@easyink/schema-tools`
> - designer 仅暴露 **Contribution 注册协议**，对 AI 零编译期依赖

## 23.1 包职责

| Package | 角色 | 浏览器 | 关键导出 |
|---------|------|--------|----------|
| `@easyink/schema-tools` | 纯函数工具：schema 校验、数据源对齐 | ✓ | `SchemaValidator`、`DataSourceAligner`、`normalizeAllFieldPaths` |
| `@easyink/ai` | AI 对话面板 + MCP 传输客户端 + Designer Contribution | ✓ | `createAIContribution()`、`AIPanel`、`MCPClient`、`ServerRegistry` |
| `@easyink/mcp-server` | Node 端 MCP Server（stdio + HTTP），LLM Provider 适配 | × | `start()` |
| `@easyink/designer` | 渲染编辑器、提供 Contribution 宿主 | ✓ | `EasyInkDesigner`、`Contribution` 类型、`ContributionRegistry` |

依赖方向：

```
designer        <-  ai  <-  schema-tools
                     |
                     v
               mcp-server  ->  schema-tools
```

> Designer 不依赖 ai 或 schema-tools；ai 依赖 designer **仅用于** `Contribution` 类型与 `DesignerStore` 类型，由 ai 单向注入到 designer 的 contribution 数组中。

## 23.2 Contribution API

Designer 提供 VS Code 风格的 Contribution Point。任意外部包都可以以**只读注册 + 命令调用**方式扩展工具栏与覆盖层面板，不需要 designer 内部代码改动。

### 23.2.1 类型

```ts
interface Contribution {
  id: string
  activate: (ctx: ContributionContext) => void
  deactivate?: () => void
}

interface ContributionContext {
  store: DesignerStore
  registerPanel: (panel: PanelDescriptor) => void
  registerToolbarAction: (action: ToolbarActionDescriptor) => void
  registerCommand: <A, R>(command: Command<A, R>) => void
  executeCommand: <A, R>(id: string, args?: A) => Promise<R>
  onDispose: (fn: () => void) => void
}

interface PanelDescriptor {
  id: string
  component: Component
  teleportTarget?: string  // 默认 '#ei-overlay-root'
  props?: Record<string, unknown>  // 支持响应式 getter
}

interface ToolbarActionDescriptor {
  id: string
  icon: Component
  label: string
  onClick: (ctx: ContributionContext) => void
}
```

### 23.2.2 设计要点

- **Designer 单向消费**：`EasyInkDesigner` 接收 `contributions: Contribution[]` prop，挂载时调用 `ContributionRegistry.activate()`，卸载时统一 `dispose()`
- **响应式 props**：`PanelDescriptor.props` 可使用 getter 在 `v-bind` 取值时触发 Vue 依赖追踪，从而把 ai 包内部的 ref 状态（如 panel open）暴露给面板组件
- **命令通道**：toolbar action 通过 `executeCommand` 与 panel 状态解耦，避免在面板未挂载前的 ref 访问
- **Schema 扩展存储**：designer `store.setExtension(key, value)` / `store.getExtension(key)` 把 contribution 私有状态写入 `schema.extensions[key]`，key 命名由 contribution 自治（例如 ai 用 `'ai'`），designer 不再硬编码 `extensions.mcp`

### 23.2.3 注入

`EasyInkDesigner` 通过 `provide(CONTRIBUTION_REGISTRY_KEY, ...)` 暴露给内部子组件（如 `TopBarB`）；toolbar 组件 `inject` 后渲染所有已注册的 toolbar action。AI 包的 `AIPanel` 不依赖 inject —— 它由 contribution 在注册时通过 `props` getter 把 store 与 open 状态显式传入。

## 23.3 AI 包

### 23.3.1 公共 API

```ts
import { createAIContribution } from '@easyink/ai'

const designerProps = {
  contributions: [createAIContribution({
    knownMaterialTypes: new Set(['text', 'table-data']),
  })],
}
```

`createAIContribution()` 内部完成：

1. 注册命令 `ai.togglePanel`（切换内部 `ref<boolean> open`）
2. 注册 toolbar action `ai.toggle`（调用上述命令，渲染 Sparkles 图标）
3. 注册 panel `ai.panel`，使用 `defineAsyncComponent` 按需加载 `AIPanel.vue`，`props` 用 getter 暴露 `open` 状态
4. 在 `deactivate` 中重置内部状态

### 23.3.2 内部模块

```
packages/ai/src/
  index.ts                # createAIContribution / AIPanel / MCPClient / ServerRegistry / types
  contribution.ts         # Contribution 工厂 + Sparkles 图标
  components/AIPanel.vue  # 对话面板
  mcp-client.ts           # 浏览器 MCP Client（StreamableHTTP）
  server-registry.ts      # Server 配置 + localStorage 持久化
  types.ts                # MCPServerConfig / GenerateOptions / SessionMessage 等
```

### 23.3.3 数据流

```
用户输入 prompt
  -> AIPanel.handleGenerate()
    -> MCPClient.connect(config) / generate({ prompt, currentSchema })
      -> MCP Tool call (HTTP+SSE) -> mcp-server -> LLM Provider
    <- { schema, expectedDataSource, validation }
    -> SchemaValidator.validate() / DataSourceAligner.align()
    -> store.dataSourceRegistry.registerProviderFactory(factory)
    -> store.setSchema(alignment.schema)
    -> store.setExtension('ai', { dataSources, providerFactories, currentVersionId })
```

> AIPanel 直接调用 `props.store` 上的 API，**不再通过 designer 事件转发**。这是 contribution 解耦的核心：所有副作用由 ai 包自行驱动。

## 23.4 Schema-tools

```
packages/schema-tools/src/
  index.ts
  schema-validator.ts     # 三层校验（结构/语义/绑定）+ autoFix（操作 deep clone）
  datasource-aligner.ts   # 字段路径对齐与模糊匹配
```

被 `@easyink/ai`（生成结果二次校验）与 `@easyink/mcp-server`（LLM 输出兜底校验）共同消费。无 Vue 依赖，可以在 Node 与浏览器双端运行。

## 23.5 MCP-Server

服务端 MCP 实现保持不变，仅切换内部依赖：原 `@easyink/mcp` -> `@easyink/schema-tools`。

`McpServer` 注册两个 Tool：`generateSchema`（LLM -> schema + expectedDataSource -> autoFix）和 `generateDataSource`。Transport 通过 `MCP_TRANSPORT` 环境变量在 stdio / HTTP 间切换；LLM Provider 通过 `MCP_PROVIDER` 在 Claude / OpenAI 间切换。详见 `packages/mcp-server/README.md`。

## 23.6 命名空间

- `AI_NAMESPACE = '__ai__'`（原 `__mcp__`）：AI 生成的数据源放入该命名空间，与用户手工注册的 `default` 命名空间隔离
- `BLOCKED_PATH_KEYS`：所有路径处理共享的原型链污染防护

## 23.7 集成示例（playground）

```vue
<script setup lang="ts">
import { createAIContribution } from '@easyink/ai'
import { EasyInkDesigner } from '@easyink/designer'

const contributions = [createAIContribution()]
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :data-sources="dataSources"
    :contributions="contributions"
  />
</template>
```

## 23.8 后续扩展

Contribution API 不绑定 AI；后续若引入“审计面板”“素材市场”“云协作”等能力，统一通过新增 `createXxxContribution()` 工厂注入。Designer 自身不需要为新能力新增 prop 或 event。
