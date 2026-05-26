# EasyInk.Printer

`EasyInk.Printer` 是完整的 Windows 桌面打印服务。它把 HTTP/WebSocket、桌面管理界面、审计和配置都包进了一个应用里。

## 应用定位

```text
前端请求
  -> EasyInk.Printer
  -> EasyInk.Engine
  -> Windows 打印机
```

如果你的浏览器项目只是想稳定调用本地打印机，大多数时候你真正面对的就是这个应用。

## 应用组成

当前实现里，它至少包含这些部分：

- HTTP 服务
- WebSocket 服务
- 命令分发
- EngineApi 引擎调用
- 审计服务
- 桌面管理窗口和托盘

这也是为什么它比单纯 DLL 更适合浏览器端直接接入。

## 管理界面

第一次启动后，先看这些：

- 服务状态是不是正常运行
- 监听端口是不是你预期的 `18080`
- 当前 WebSocket 连接数有没有变化
- 打印队列里有没有卡住的任务

如果用户说“前端连不上”，这几项通常比继续看前端代码更快定位问题。

## 常用配置字段

当前 `HostConfig` 里比较核心的配置主要是：

- `httpPort`
- `apiKey`
- `trustAllOrigins`
- `maxWebSocketConnections`
- `maxQueueSize`
- `printTimeoutSeconds`
- `rawPrinterNames`
- `sumatraPrinterNames`
- `renderEnabled`

如果你刚开始部署，先盯住端口、认证和队列限制就够了。Raw 打印、Sumatra fallback 和 Render 配置通常是第二阶段才会碰到。

## API Key 启用

当配置里写了 `apiKey` 后，前端请求就要带上 `X-API-Key`：

```bash
curl -H "X-API-Key: your-secret-key" http://localhost:18080/api/printers
```

如果你已经在前端集成包里配置了 `apiKey`，这层通常不用自己手动拼。

## HTTP 与 WebSocket

因为两类请求本来就不完全一样。

- 简单查询类请求，用 HTTP 最直接
- 大文件上传、实时连接状态和分块传输，更适合 WebSocket

这也是为什么你会在 API 里同时看到 REST 风格接口和 WebSocket 命令。

接下来最适合继续看的是 [API 参考](./api-reference)。
