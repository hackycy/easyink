---
description: EasyInk MCP Server：独立 MCP 服务，用于 AI 模型生成 EasyInk 模板 Schema 和数据源描述。
---

# MCP Server {#mcp-server}

`@easyink/mcp-server` 是独立 MCP 服务，用来让模型生成 EasyInk 模板和数据源描述。它不是 Designer 的运行时依赖。

先启动一个 stdio 服务：

```bash
pnpm -F @easyink/mcp-server start:stdio
```

如果你的客户端使用 HTTP transport，启动 HTTP 服务：

```bash
pnpm -F @easyink/mcp-server start:http
```

`start:http` 会把服务挂到 `/mcp`，默认监听 `0.0.0.0:3000`。

## 配置 LLM Provider {#provider}

服务启动前至少要提供 API key：

```bash
MCP_PROVIDER=claude
MCP_API_KEY=sk-...
MCP_MODEL=your-model-name
pnpm -F @easyink/mcp-server start:stdio
```

当前支持的 provider 是：

- `claude`
- `openai`

如果没有设置 `MCP_PROVIDER`，服务默认使用 `claude`。`MCP_STRICT_OUTPUTS` 默认开启；设置为 `false` 时会关闭严格输出。

## 加载环境文件 {#env-files}

入口会按顺序尝试加载当前工作目录下的两个文件：

```text
.env
.env.local
```

当前实现使用 `override: false`。这意味着已经存在的环境变量不会被覆盖。

:::warning 注意
因为 `.env` 会先写入 `process.env`，后加载的 `.env.local` 也不会覆盖 `.env` 中已有的同名变量。Shell、Docker 或前一个 env 文件里的值都会优先保留。
:::

## 选择 Transport {#transport}

入口通过 `MCP_TRANSPORT` 分流：

```bash
MCP_TRANSPORT=stdio pnpm -F @easyink/mcp-server start:stdio
MCP_TRANSPORT=http pnpm -F @easyink/mcp-server start:http
```

代码里的分支等价于：

```ts
switch (process.env.MCP_TRANSPORT ?? 'stdio') {
  case 'http':
    await startHTTPServer(requestOptions => createMCPServer(requestOptions))
    break
  case 'stdio':
  default:
    await startStdioServer(await createMCPServer())
}
```

HTTP 模式是无状态实现。每个请求都会创建新的 MCP server 和 transport，请求结束后关闭。

## HTTP 请求级配置 {#http-headers}

HTTP 模式允许通过请求头覆盖 provider 配置：

```text
X-EasyInk-Provider: openai
X-EasyInk-Provider-Key: sk-...
X-EasyInk-Model: gpt-4.1
X-EasyInk-Base-URL: https://example.com/v1
```

`X-EasyInk-Provider` 只能是 `claude` 或 `openai`。`X-EasyInk-Base-URL` 必须是 `https` URL。

这适合多租户或调试场景：同一个 HTTP 服务可以按请求选择不同 provider、key 或模型。

## 工具列表 {#tools}

服务会注册三类工具：

```ts
registerGenerateSchemaTool(server, provider)
registerGenerateDataSourceTool(server, provider)
registerDebugTools(server, provider)
```

常用的是前两个：

- `generateSchema`：根据自然语言生成 `DocumentSchema` 和期望数据源结构。
- `generateDataSource`：根据期望字段结构生成 `DataSourceDescriptor`。

debug tools 用来拆开生成链路，适合开发和排错。

## 生成 Schema {#generate-schema}

调用 `generateSchema` 时传自然语言描述：

```json
{
  "prompt": "生成一张 80mm 小票，包含店名、商品列表、合计和二维码"
}
```

工具内部会做这些事：

```text
resolve generation plan
  -> build material context
  -> ask LLM for template intent
  -> build schema deterministically
  -> repair and validate generated schema
```

如果校验发现模型可以修复的问题，比如未知物料类型或旧表格结构，工具会把反馈交给模型重试一次。

## 生成数据源 {#generate-datasource}

`generateDataSource` 接收期望数据结构：

```json
{
  "expectedDataSource": {
    "name": "receipt",
    "fields": [
      { "name": "storeName", "type": "string", "path": "store/name" },
      {
        "name": "items",
        "type": "array",
        "path": "items",
        "children": [
          { "name": "name", "type": "string", "path": "items/name" },
          { "name": "price", "type": "number", "path": "items/price" }
        ]
      }
    ]
  }
}
```

这条工具主要走确定性构建。它会返回完整 `DataSourceDescriptor`，用于 Designer 的数据源面板或后续模板绑定。

## 维护物料上下文 {#materials-config}

MCP 侧会用物料配置约束模型输出。修改物料描述后，运行：

```bash
pnpm -F @easyink/mcp-server build:materials
pnpm -F @easyink/mcp-server check:materials
```

`build:materials` 会生成最新配置。`check:materials` 用来确认配置没有过期，适合放进 CI。

## 完成前检查 {#checklist}

本地改动后按这个顺序验证：

```bash
pnpm -F @easyink/mcp-server check:materials
pnpm -F @easyink/mcp-server start:stdio
```

如果你在调 HTTP，再跑：

```bash
MCP_TRANSPORT=http pnpm -F @easyink/mcp-server start:http
```

检查重点：

- 没有 API key 时是否给出明确错误。
- HTTP 请求头 provider 配置是否生效。
- `generateSchema` 是否只输出 canonical material type。
- `generateDataSource` 的字段路径是否使用 slash 分隔。
- 修改物料描述后 `check:materials` 是否通过。

关于 MCP Server，目前知道这些就够用了。生成结果进入运行时后，可以继续看 [Schema 参考](/advanced/schema)。
