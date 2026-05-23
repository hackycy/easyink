# EasyInk.Render 架构设计

## 背景

当前 C# 打印端的能力边界集中在 PDF 打印：`PrintRequestParams` 支持 `pdfBase64`、`pdfUrl`、`pdfBytes`，进入 `EngineApi` 后由 `RoutingPrintService` 路由到 PDFium/GDI、SumatraPDF 或 ESC/POS Raw 链路。

如果直接在 C# 端引入 Chromium 打印，会把浏览器运行时、HTML 渲染、物理打印、设置下载、跨语言复用耦合到一个宿主里。更通用的做法是把 Chromium 相关能力沉淀为独立渲染服务，C# 端只是其中一个调用方。

## 目标

- 提供跨语言通用的服务端渲染能力。
- 支持 HTML、URL、Viewer payload、模板数据渲染为 PDF 或图片。
- 支持 C#、Node.js、Golang 等服务端通过同一协议调用。
- 支持浏览器运行时按版本下载、校验和启用，不随 C# 应用内置。
- 保持 C# 物理打印链路稳定，渲染完成后仍输出 PDF 给现有打印服务。
- 提供可诊断的渲染结果，包括控制台错误、网络失败、耗时和截图等信息。

## 非目标

- 第一阶段不承诺跨平台物理打印到指定打印机。
- 第一阶段不把 Chromium 作为 C# 默认打印后端。
- 不向上层暴露 Playwright、Puppeteer 或 Chrome DevTools Protocol 的原始 API。
- 不把浏览器运行时打包进 `EasyInk.Net` 安装包。

## 总体架构

```text
Business App / SDK
  -> C# Client / Node.js Client / Go Client
  -> Render Protocol
  -> easyink-render-host
  -> Browser Controller
  -> Browser Bundle
  -> PDF / Image / Diagnostics

EasyInk.Printer
  -> Render Client
  -> PDF bytes
  -> EasyInk.Engine
  -> RoutingPrintService
  -> PDFium/GDI | SumatraPDF | ESC/POS Raw
```

## 组件

### Render Host

独立进程，建议命名为 `easyink-render-host`。

职责：

- 启动和复用浏览器实例。
- 接收 HTTP、WebSocket 或 stdio 请求。
- 按协议执行 HTML、URL、Viewer、模板渲染。
- 输出 PDF、图片、元数据和诊断结果。
- 控制并发、超时、临时文件、字体目录和资源访问策略。
- 管理浏览器上下文隔离，避免不同租户或任务之间共享敏感状态。

### Render Protocol

稳定协议层，所有语言 SDK 都基于它实现。

协议原则：

- 请求和响应使用 JSON 元数据。
- 大文件支持二进制响应、文件路径响应或分片传输。
- 错误码稳定，错误消息可本地化。
- 协议版本和 Host 版本分离。
- 不泄漏底层浏览器控制库的类型和概念。

### Render Client

语言 SDK 只做薄封装。

职责：

- 请求类型定义。
- HTTP/WebSocket/stdio 调用。
- 错误码映射。
- 超时和取消。
- 大文件上传和下载。

不负责：

- 浏览器生命周期。
- 浏览器下载。
- HTML 渲染策略。
- 物理打印。

### Runtime Manager

宿主应用侧组件。C# 端可以在 `EasyInk.Printer` 中实现，Node.js 或 Go 服务端也可以各自实现。

职责：

- 拉取版本 manifest。
- 下载 Render Host 和 Browser Bundle。
- 校验 SHA256、大小、平台和协议兼容性。
- 解压到用户目录。
- 清理旧版本。
- 启停 Render Host。

推荐目录：

```text
%LOCALAPPDATA%\EasyInk\Render\
  hosts\
    1.0.0\
      easyink-render-host.exe
  browsers\
    chrome-126.0.x-win-x64\
      chrome.exe
  cache\
  logs\
  temp\
```

## 渲染链路

### HTML 到 PDF

```text
Render Client
  -> /v1/render/pdf
  -> Render Host
  -> create browser context
  -> load HTML with baseUrl
  -> wait for ready condition
  -> printToPDF
  -> return PDF bytes or output file
```

### URL 到 PDF

```text
Render Client
  -> /v1/render/pdf
  -> Render Host
  -> navigate to URL
  -> apply allowlist and timeout
  -> wait for network/selector/function
  -> printToPDF
  -> return result
```

### C# 打印前置渲染

```text
HTTP/WebSocket print request with html/viewer/url
  -> EasyInk.Printer
  -> Render Client
  -> PDF bytes
  -> EngineApi
  -> RoutingPrintService
  -> existing print backend
```

## 协议草案

### PDF 请求

```json
{
  "requestId": "req-001",
  "source": {
    "type": "html",
    "html": "<html>...</html>",
    "baseUrl": "https://example.com/"
  },
  "pdf": {
    "paperWidthMm": 80,
    "paperHeightMm": 120,
    "printBackground": true,
    "landscape": false,
    "marginMm": {
      "top": 0,
      "right": 0,
      "bottom": 0,
      "left": 0
    }
  },
  "wait": {
    "until": "networkIdle",
    "selector": ".easyink-ready",
    "timeoutMs": 30000
  },
  "output": {
    "type": "bytes"
  },
  "security": {
    "allowFileAccess": false,
    "allowedOrigins": ["https://cdn.example.com"]
  }
}
```

### PDF 响应

```json
{
  "success": true,
  "requestId": "req-001",
  "contentType": "application/pdf",
  "base64": "...",
  "pageCount": 1,
  "diagnostics": {
    "durationMs": 842,
    "consoleErrors": [],
    "failedRequests": []
  }
}
```

### 错误响应

```json
{
  "success": false,
  "requestId": "req-001",
  "error": {
    "code": "RENDER_TIMEOUT",
    "message": "Render timeout after 30000ms",
    "details": {
      "stage": "waitForReady"
    }
  },
  "diagnostics": {
    "durationMs": 30012,
    "consoleErrors": [],
    "failedRequests": []
  }
}
```

## 安全模型

- 默认禁用本地文件访问。
- 默认不保留 Cookie、localStorage、sessionStorage。
- 默认启用请求超时、导航超时和总任务超时。
- 支持 URL allowlist，避免被服务端渲染能力滥用为内网探测工具。
- 支持最大 HTML 大小、最大资源大小和最大输出文件大小限制。
- 每个请求使用独立 browser context。
- 可选离线模式，只允许访问内嵌资源和显式提供的资源包。

## 诊断模型

每次渲染可收集：

- 渲染耗时。
- 页面 console error。
- 网络失败请求。
- 最终 URL。
- PDF 页数或图片尺寸。
- 可选失败截图。
- 可选 HTML 快照。

诊断能力要默认受控，避免泄露页面敏感内容。

## 与 EasyInk.Net 的关系

`EasyInk.Net` 不直接依赖浏览器控制库。推荐新增一个渲染客户端适配层：

```text
EasyInk.Printer
  -> RenderRuntimeManager
  -> RenderClient
  -> EasyInk.Engine
```

`EasyInk.Engine` 可以保持以 PDF 打印为核心；如果后续需要让 Engine 直接支持 HTML/viewer 输入，应通过接口注入 `IRenderService`，而不是让 Engine 创建或管理浏览器运行时。

## 兼容性

- Windows 10/11：作为主要支持目标。
- Windows 7/8.1：不建议承诺 Chromium 新版本支持。基础 C# 打印链路可以继续支持，Render 能力应显示为不可用或仅支持经验证的旧 runtime。
- Linux/macOS：协议和 Host 设计应预留跨平台能力，但 C# 当前物理打印链路仍以 Windows 为主。
