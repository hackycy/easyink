# MCP Server

`@easyink/mcp-server` 是独立的 MCP 服务，不是 Designer 运行时依赖。它主要服务于“让模型生成 EasyInk 模板和数据源描述”这条链路。

## 启动方式

包里当前提供的脚本是：

```bash
pnpm -F @easyink/mcp-server start:stdio
pnpm -F @easyink/mcp-server start:http
```

- `start:stdio` 适合本地 MCP 客户端直接拉起
- `start:http` 适合 HTTP transport 场景

## 环境文件加载

当前入口 `src/bin/server.ts` 会按顺序尝试读取当前工作目录下的：

- `.env`
- `.env.local`

但它不会覆盖已经存在的环境变量，所以 Shell 或 Docker 注入的值始终优先。

## Transport 分流

服务启动后会看 `MCP_TRANSPORT`：

- `http` -> 走 `startHTTPServer()`
- `stdio` -> 走 `startStdioServer()`

HTTP 模式下，每个请求都会创建新的 MCP server，这一点是实现里明确写死的。

## 工具分类

当前服务端会注册三组工具：

- `generateSchema`
- `generateDataSource`
- debug tools

如果你的目标是根据自然语言生成模板，重点看 `generateSchema`；如果你已经有期望数据结构，只需要构造 `DataSourceDescriptor`，重点看 `generateDataSource`。

## 物料配置构建与校验

包里还提供了两条很实用的命令：

```bash
pnpm -F @easyink/mcp-server build:materials
pnpm -F @easyink/mcp-server check:materials
```

如果你在改 MCP 侧的物料描述，这两条命令比直接猜结果可靠得多。