# MCP Server

`@easyink/mcp-server` 是 EasyInk 的 MCP 服务端，用于通过 LLM 生成 `DocumentSchema`、预期数据源结构和 `DataSourceDescriptor`。它不是 Designer 的运行时依赖，而是面向 AI 生成模板工作流的独立服务。

当前服务端只注册 MCP tools，不提供普通 REST API。

## 启动方式

包内脚本提供两种 transport：

```bash
pnpm -F @easyink/mcp-server start:stdio
pnpm -F @easyink/mcp-server start:http
```

`start:stdio` 使用 stdio transport，适合本地 MCP 客户端直接拉起。`start:http` 会设置 `MCP_TRANSPORT=http`，并启动 Streamable HTTP transport，默认监听 `http://0.0.0.0:3000/mcp`。

源码入口是 `packages/mcp-server/src/bin/server.ts`：启动时会按顺序读取当前工作目录下的 `.env` 和 `.env.local`，但不会覆盖 Shell 或 Docker 已经注入的环境变量。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MCP_TRANSPORT` | transport 类型：`stdio` 或 `http` | `stdio` |
| `MCP_HTTP_HOST` | HTTP transport 监听地址 | `0.0.0.0` |
| `MCP_HTTP_PORT` | HTTP transport 监听端口 | `3000` |
| `MCP_PROVIDER` | LLM provider：`claude` 或 `openai` | `claude` |
| `MCP_API_KEY` | provider API key | 无，必填 |
| `MCP_MODEL` | provider 模型名 | provider 默认值 |
| `MCP_BASE_URL` | provider base URL | provider 默认值 |
| `MCP_STRICT_OUTPUTS` | 是否启用严格输出；设为 `false` 可关闭 | 开启 |

服务端创建 provider 时要求有 API Key。可以通过 `MCP_API_KEY` 注入，也可以在 HTTP transport 下用请求头覆盖。

## HTTP Transport

HTTP transport 只接受 `/mcp` 路径，并且每个请求都会创建新的 MCP server 和 transport。这样做是为了匹配当前 MCP SDK 的 Streamable HTTP 使用方式，避免复用已连接 transport 导致后续 initialize 失败。

支持的 provider 覆盖请求头：

| Header | 说明 |
|--------|------|
| `X-EasyInk-Provider` | `claude` 或 `openai` |
| `X-EasyInk-Provider-Key` | 本次请求使用的 provider API key |
| `X-EasyInk-Model` | 本次请求使用的模型名 |
| `X-EasyInk-Base-URL` | 本次请求使用的 HTTPS base URL |

`X-EasyInk-Base-URL` 必须是 `https:` URL。HTTP transport 当前允许跨域，并暴露 `mcp-session-id` 和 `mcp-protocol-version` 响应头。

## Tools

当前 `createMCPServer()` 会注册三组工具：

| 工具 | 注册函数 | 说明 |
|------|----------|------|
| `generateSchema` | `registerGenerateSchemaTool()` | 根据自然语言生成 Schema、预期数据源、数据源描述符和校验信息 |
| `generateDataSource` | `registerGenerateDataSourceTool()` | 根据预期数据源结构生成 `DataSourceDescriptor` |
| debug tools | `registerDebugTools()` | 注册调试工具 |

`generateSchema` 的主要输入：

```ts
{
  prompt: string
  currentSchema?: Record<string, unknown>
  generationPlan?: Record<string, unknown>
}
```

工具内部流程按当前实现是：先解析生成计划，加载物料配置，构造 TemplateIntent，再用 `@easyink/schema-tools` 构建 Schema、执行修复、做准确性校验和 Schema 校验。返回内容包含 `schema`、`expectedDataSource`、`dataSource`、`assumptions`、`intent`、`attempts`、`needsClarification` 和 `validation`。

`generateDataSource` 的输入是：

```ts
{
  expectedDataSource: {
    name: string
    fields: Array<{
      name: string
      type: 'string' | 'number' | 'boolean' | 'array' | 'object'
      required?: boolean
      path: string
      children?: unknown[]
    }>
  }
}
```

这个工具当前是确定性构建：它调用 `buildDataSourceDescriptor()` 生成字段树。虽然工具注册时仍需要 provider 存在，但该工具本身不再向 LLM 请求字段补全。

## Docker

仓库提供 `packages/mcp-server/Dockerfile` 和 `packages/mcp-server/docker-compose.yml`。镜像默认使用 HTTP transport：

```yaml
environment:
  - MCP_PROVIDER=${MCP_PROVIDER:-claude}
  - MCP_API_KEY=${MCP_API_KEY:-}
  - MCP_MODEL=${MCP_MODEL:-}
  - MCP_BASE_URL=${MCP_BASE_URL:-}
  - MCP_TRANSPORT=http
  - MCP_HTTP_PORT=3000
```

本地启动 compose 前需要在环境变量或 `.env` 中提供 `MCP_API_KEY`。

## 校验

物料配置由脚本生成并校验：

```bash
pnpm -F @easyink/mcp-server build:materials
pnpm -F @easyink/mcp-server check:materials
```

根仓库的 `pnpm test` 前置步骤会运行 `pnpm -F @easyink/mcp-server check:materials`。