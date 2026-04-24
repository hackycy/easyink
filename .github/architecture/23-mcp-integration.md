# 23. MCP 集成架构

本文档描述 EasyInk 如何通过 MCP (Model Context Protocol) 实现 AI 驱动的模板生成。架构分 Client 和 Server 两侧：`@easyink/mcp` 作为浏览器端 MCP Client，`@easyink/mcp-server` 作为 Node.js 端 MCP Server（可 Docker 部署）。

## 23.1 目标与场景

### 核心目标

- 用户在设计师中通过自然语言描述需求，AI 自动生成文档模板（schema + datasource）
- 支持多 LLM Provider（Claude / OpenAI），通过环境变量切换
- MCP Server 支持 Docker 单命令部署，也支持 npx 本地运行
- Designer 通过 `enableMCP` prop 动态启用 MCP 面板，无需全量加载

### 使用场景

1. **对话生成**：用户在 MCPPanel 输入"生成一个销售发票模板"，AI 返回完整 schema 和 datasource
2. **迭代优化**：用户传入 currentSchema，AI 在已有模板基础上修改
3. **服务部署**：MCP Server 可独立部署为 HTTP 服务，供多个 designer 实例或外部 MCP Host 使用

## 23.2 架构概览

```
┌──────────────────────────────────────────────────────┐
│ Browser (Designer)                                   │
│  ┌───────────────────────────────────────────────┐   │
│  │ MCPPanel (defineAsyncComponent 按需加载)       │   │
│  │  用户输入 prompt → 展示结果                    │   │
│  └──────────────┬────────────────────────────────┘   │
│                 │                                     │
│  ┌──────────────▼────────────────────────────────┐   │
│  │ @easyink/mcp (Client)                         │   │
│  │  - MCPClient (StreamableHTTPClientTransport)  │   │
│  │  - ServerRegistry (localStorage 持久化)        │   │
│  │  - SchemaValidator / DataSourceAligner         │   │
│  └──────────────┬────────────────────────────────┘   │
│                 │ MCP Protocol (HTTP+SSE)             │
└─────────────────┼────────────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────────────┐
│ Docker / npx / PM2                                   │
│  ┌───────────────────────────────────────────────┐   │
│  │ @easyink/mcp-server                           │   │
│  │  - McpServer (stdio + StreamableHTTP)         │   │
│  │  - LLM Provider (Claude / OpenAI, env 切换)   │   │
│  │  - SchemaValidator + AutoFix                  │   │
│  │  - System Prompt Builder (物料配置注入)        │   │
│  │  - config/materials.json                      │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

**核心流程**：

1. 用户在 MCPPanel 输入自然语言描述
2. MCPClient 通过 HTTP/SSE 向 MCP Server 发送 `generateSchema` tool call
3. MCP Server 加载物料配置，构建 system prompt，调用 LLM 生成 schema + expectedDataSource
4. Server 侧执行 SchemaValidator 校验 + autoFix
5. 结果返回 designer，通过 `store.setSchema()` 应用到画布，通过 `DataSourceRegistry.registerProviderFactory()` 注册数据源
6. `extensions.mcp` 持久化 dataSources、templateHistory、currentVersionId

## 23.3 核心组件

### 23.3.1 MCPClient (`@easyink/mcp`)

浏览器端 MCP 客户端，使用 `@modelcontextprotocol/sdk` 的 `Client` + `StreamableHTTPClientTransport` 连接远程 MCP Server。

```typescript
class MCPClient {
  // 连接管理
  connect(config: MCPServerConfig): Promise<void>
  disconnect(serverId: string): Promise<void>
  getServerStatus(id: string): ServerStatus | undefined

  // 会话历史（客户端本地维护）
  getSession(serverId: string): SessionMessage[]
  addSessionMessage(serverId: string, message: ...): SessionMessage
  clearSession(serverId: string): void

  // MCP 协议调用
  generate(options: GenerateOptions): Promise<GenerateResult>
  callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>
  listTools(serverId: string): Promise<MCPTool[]>
}
```

**关键设计**：
- MCPClient 不持有 server 列表。Server 管理由 ServerRegistry 单一负责
- 仅支持 HTTP transport（stdio 在浏览器不可用）
- `connect()` 时创建 SDK Client + StreamableHTTPClientTransport，`disconnect()` 时关闭
- `generate()` 内部调用 `client.callTool({ name: 'generateSchema', arguments: { prompt, currentSchema } })`，解析返回的 JSON 文本

### 23.3.2 ServerRegistry (`@easyink/mcp`)

服务器配置管理，localStorage 持久化。是服务器信息的唯一数据源。

```typescript
class ServerRegistry {
  addServer(config: MCPServerConfig): void
  updateServer(id: string, updates: Partial<MCPServerConfig>): boolean
  removeServer(id: string): boolean
  getServer(id: string): MCPServerConfig | undefined
  getServers(): MCPServerConfig[]
  getEnabledServers(): MCPServerConfig[]
  setEnabled(id: string, enabled: boolean): boolean
  importServers(configs: MCPServerConfig[]): void
  exportServers(): MCPServerConfig[]
}
```

### 23.3.3 SchemaValidator (`@easyink/mcp`)

Schema 三层校验器。**`validate()` 为纯读操作，不修改入参**。Auto-fix 仅在 `autoFix()` 方法中执行（操作 deep clone）。

```typescript
class SchemaValidator {
  constructor(options?: SchemaValidatorOptions)

  // 完整校验（只读）
  validate(schema: unknown): ValidationResult

  // 分层校验（只读）
  validateStructure(schema: unknown): ValidationResult
  validateSemantics(schema: DocumentSchema): ValidationResult
  validateBindings(schema: DocumentSchema): ValidationResult

  // 自动修复（操作 deep clone）
  autoFix(schema: DocumentSchema): { fixed: DocumentSchema, issues: AutoFixedIssue[] }
}
```

### 23.3.4 DataSourceAligner (`@easyink/mcp`)

数据源字段对齐工具。检查 schema binding 的 fieldPath 与 datasource fields 是否匹配，支持模糊匹配和自动修正。

```typescript
class DataSourceAligner {
  align(schema: DocumentSchema, dataSource: DataSourceDescriptor): AlignmentResult
  extractFieldPaths(fields: DataFieldNode[]): Set<string>
  extractBindings(schema: DocumentSchema): Array<{ binding: BindingRef, elementId: string }>
  findFuzzyMatch(path: string, availablePaths: Set<string>): MatchResult | undefined
  applyAlignment(schema: DocumentSchema, alignment: AlignmentResult): DocumentSchema
}
```

### 23.3.5 McpServer + LLM Provider (`@easyink/mcp-server`)

Server 端核心。使用 `@modelcontextprotocol/sdk` 的 `McpServer` 创建 MCP Server 实例，注册两个 Tool。

**LLM Provider 架构**：

```typescript
interface LLMProvider {
  readonly name: string
  generateSchema: (input: SchemaGenerationInput) => Promise<SchemaGenerationOutput>
  generateDataSource: (input: DataSourceGenerationInput) => Promise<DataSourceGenerationOutput>
}
```

- `ClaudeProvider` — 使用 Anthropic tool_use 约束 JSON 输出
- `OpenAIProvider` — 使用 `response_format: json_object` 约束输出
- 两者均通过 async static factory (`ClaudeProvider.create(config)`) 创建，动态 `import()` LLM SDK，避免 `require()`
- LLM SDK（`@anthropic-ai/sdk`、`openai`）为 optionalDependencies

**MCP Tools**：

| Tool | 参数 | 返回 |
|------|------|------|
| `generateSchema` | `prompt: string`, `currentSchema?: object` | `{ schema, expectedDataSource, validation }` |
| `generateDataSource` | `expectedDataSource: ExpectedDataSource` | `{ dataSource }` |

`generateSchema` 一次调用同时返回 schema 和 expectedDataSource，减少 round-trip。

### 23.3.6 物料配置注入 (`config/materials.json`)

MCP Server 启动时加载 `config/materials.json`，包含所有物料类型描述、属性列表和绑定规则。这些信息通过 `system-builder.ts` 拼入 LLM system prompt，使 AI 了解 EasyInk 的能力边界。

```json
{
  "materialTypes": {
    "text": { "description": "...", "properties": ["fontSize", "color", ...] },
    "table": { "description": "...", "properties": ["columns", ...] }
  },
  "bindingRules": { ... }
}
```

### 23.3.7 传输层

**Server 端**支持两种 transport，通过 `MCP_TRANSPORT` 环境变量切换：

| Transport | 用途 | 实现 |
|-----------|------|------|
| stdio | npx 本地运行、Claude Desktop 集成 | `StdioServerTransport` |
| HTTP | Docker 部署、远程访问 | `StreamableHTTPServerTransport` + Node.js 内置 `http` 模块 |

**Client 端**仅支持 HTTP transport（浏览器限制），使用 `StreamableHTTPClientTransport`。

## 23.4 数据流

### 23.4.1 生成流程

```
用户输入 prompt
  → MCPPanel.handleGenerate()
    → MCPClient.connect(config)        // 按需建连
    → MCPClient.generate({ prompt, currentSchema })
      → client.callTool({ name: 'generateSchema', arguments: { prompt, currentSchema } })
        → [MCP Protocol: HTTP POST /mcp]
          → McpServer Tool Handler
            → loadMaterialsConfig()     // 加载物料知识
            → buildSystemPrompt()       // 构建 system prompt
            → llmProvider.generateSchema()  // 调用 LLM
            → SchemaValidator.validate()    // 校验
            → SchemaValidator.autoFix()     // 修复
            → 返回 { schema, expectedDataSource, validation }
        ← [MCP Protocol: JSON response]
      ← GenerateResult { schema, dataSource }
    → MCPClient 解析结果，转换 expectedDataSource → DataSourceDescriptor
  → emit('schemaApply', schema, versionId)
  → emit('datasourceRegister', dataSource, namespace)
    → EasyInkDesigner: store.setSchema(enriched)
    → EasyInkDesigner: store.dataSourceRegistry.registerProviderFactory(factory)
    → EasyInkDesigner: extensions.mcp 持久化
```

### 23.4.2 Server 内部流程

```
generateSchema Tool Handler
  1. loadMaterialsConfig()           // 从 config/materials.json 加载
  2. buildSystemPrompt(materialCtx)  // 拼 system prompt
  3. llmProvider.generateSchema({    // 调用 LLM
       prompt, currentSchema, systemPrompt
     })
  4. SchemaValidator.validate()      // 结构+语义+绑定 三层校验
  5. if (!valid) → return isError
  6. SchemaValidator.autoFix()       // 修复缺 version/id/elements 等问题
  7. return { schema, expectedDataSource, validation }
```

## 23.5 Schema 持久化

### 23.5.1 MCP 扩展字段

`DocumentSchema.extensions.mcp` 在 designer 端写入：

```typescript
interface MCPExtensions {
  dataSources?: DataSourceSnapshot[]
  providerFactories?: ProviderFactorySnapshot[]
  templateHistory?: TemplateVersion[]
  currentVersionId?: string
}
```

- `handleSchemaApply` 写入 `currentVersionId` 和 `templateHistory`
- `handleDatasourceRegister` 写入 `dataSources` 和 `providerFactories`

### 23.5.2 TemplateHistoryManager

模板版本历史管理器（`@easyink/designer`），通过 `easyink_template_history` localStorage key 持久化。支持按 `source` 过滤：`'mcp' | 'user' | 'template'`。

## 23.6 部署

### 23.6.1 Docker

```bash
cd packages/mcp-server
MCP_API_KEY=your-key docker compose up
```

`docker-compose.yml` 通过多阶段构建 + `pnpm deploy` 生成独立部署目录。默认 HTTP 模式，端口 3000。

### 23.6.2 npx

```bash
MCP_PROVIDER=claude MCP_API_KEY=your-key npx easyink-mcp-server
```

默认 stdio 模式。设置 `MCP_TRANSPORT=http` 切换为 HTTP 模式。

### 23.6.3 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MCP_PROVIDER` | LLM provider：`claude` / `openai` | `claude` |
| `MCP_API_KEY` | LLM API Key | 必填 |
| `MCP_MODEL` | 模型名称 | provider 默认 |
| `MCP_BASE_URL` | API Base URL | provider 默认 |
| `MCP_TRANSPORT` | 传输模式：`stdio` / `http` | `stdio` |
| `MCP_HTTP_PORT` | HTTP 模式端口 | `3000` |

## 23.7 Designer 集成

### 23.7.1 动态注册

Designer 通过 `enableMCP` prop（默认 `false`）控制 MCP 功能：

```typescript
interface EasyInkDesignerProps {
  enableMCP?: boolean  // 默认 false
}
```

MCPPanel 通过 `defineAsyncComponent` 按需从 `@easyink/mcp` 加载：

```typescript
const MCPPanel = defineAsyncComponent(
  () => import('@easyink/mcp').then(m => m.MCPPanel)
)
```

### 23.7.2 TopBar 集成

工具栏右侧 MCP 按钮始终渲染，通过 `toggleMCPPanel` 事件切换面板显隐。面板实际挂载由 `v-if="enableMCP && showMCPPanel"` 控制。

## 23.8 包结构

```
packages/mcp/                         # @easyink/mcp — Client
├── src/
│   ├── index.ts                      # 桶导出（含 MCPPanel）
│   ├── client/mcp-client.ts          # MCPClient（真实 SDK transport）
│   ├── config/server-registry.ts     # ServerRegistry（localStorage）
│   ├── validation/schema-validator.ts # SchemaValidator（无副作用）
│   ├── types/mcp-types.ts            # MCP 类型定义
│   ├── utils/datasource-aligner.ts   # DataSourceAligner
│   └── components/MCPPanel.vue       # AI 模板生成面板
└── package.json

packages/mcp-server/                  # @easyink/mcp-server — Server
├── src/
│   ├── index.ts                      # 桶导出
│   ├── server.ts                     # McpServer 创建 + transport
│   ├── bin/server.ts                 # CLI 入口
│   ├── tools/                        # MCP Tool 注册
│   │   ├── generate-schema.ts
│   │   └── generate-datasource.ts
│   ├── llm/                          # LLM Provider 抽象
│   │   ├── types.ts
│   │   ├── claude-provider.ts
│   │   └── openai-provider.ts
│   ├── config/material-loader.ts     # 物料配置加载
│   └── prompts/system-builder.ts     # System prompt 构建
├── config/materials.json             # 物料知识配置
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 23.9 依赖关系

```
@easyink/mcp
  ├── @easyink/datasource   (DataSourceDescriptor, DataFieldNode)
  ├── @easyink/schema       (DocumentSchema, BindingRef)
  ├── @easyink/shared       (generateId, BLOCKED_PATH_KEYS)
  ├── @modelcontextprotocol/sdk  (Client, StreamableHTTPClientTransport)
  └── vue                   (MCPPanel 组件)

@easyink/mcp-server
  ├── @easyink/datasource   (data source types)
  ├── @easyink/mcp          (SchemaValidator, DataSourceAligner, types)
  ├── @easyink/schema       (DocumentSchema, ExpectedDataSource)
  ├── @easyink/shared       (generateId)
  ├── @modelcontextprotocol/sdk  (McpServer, transports)
  ├── zod                   (Tool 参数校验)
  ├── @anthropic-ai/sdk     (optional — Claude provider)
  └── openai                (optional — OpenAI provider)

@easyink/designer
  ├── @easyink/mcp          (MCPPanel 组件)
  └── ...
```

## 23.10 安全考虑

1. **命名空间隔离**：MCP 数据源使用 `__mcp__` 命名空间
2. **路径安全**：`BLOCKED_PATH_KEYS` 阻止原型链污染
3. **Server 无状态**：不持有 schema 文件，无文件 IO，单次调用即完成
4. **单机部署**：无需认证，通过内网或 localhost 访问
5. **LLM API Key**：通过环境变量注入，不写入代码或配置
