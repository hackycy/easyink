# EasyInk.Render 实施方案

## 方案摘要

`EasyInk.Render` 交付一个 Go 编写的跨平台可执行文件 `easyink-render-host`，配套固定版本 Chrome for Testing 和内置 EasyInk Runtime Bundle。Host 把 HTML、PDF、EasyInk schema + data 三类输入统一归一为可打印 PDF。

`EasyInk.Render` 的交付边界到可执行文件、Browser Bundle、manifest、协议、诊断和发布包为止。调用方集成不写入本方案。

Node.js 不进入 Runtime 交付架构。Playwright 只存在于测试工具中，用于生成输出质量 fixture。

## 技术栈

```text
Host language: Go
CDP client: chromedp + cdproto
Browser runtime: Chrome for Testing
Host protocol: loopback HTTP
Request format: JSON
PDF success response: application/pdf binary
Error response: JSON
PDF operation: CDP Page.printToPDF
```

技术选型结论：

- Render Host 使用 Go。
- 浏览器控制使用 chromedp/cdproto。
- 浏览器运行时使用 Chrome for Testing。
- PDF 输出使用 CDP `Page.printToPDF`。
- PDF 输入走校验、诊断和透传归一流程。
- EasyInk schema + data 通过内置 EasyInk Runtime Bundle 合成为 HTML 后再调用 `Page.printToPDF`。
- Host 作为单独进程运行。
- Host 首期只监听 `127.0.0.1` loopback HTTP。
- Node.js + Playwright 不作为首期交付、不作为正式 Host、不作为 Runtime 依赖。

## 目录规划

```text
lib/EasyInk.Render/
  README.md
  architecture.md
  proposal.md
  host/
    go.mod
    cmd/
      easyink-render-host/
    internal/
      browser/
      config/
      diagnostics/
      easyink/
      protocol/
      render/
      security/
      server/
  protocol/
    openapi/
    fixtures/
  manifests/
  samples/
    html/
    pdf/
    easyink/
  tools/
    playwright-fixtures/
  releases/
```

`tools/playwright-fixtures` 只存放测试对照脚本，不进入 Runtime 产物。

## Manifest 设计

```json
{
  "schemaVersion": 1,
  "protocolVersion": "1.0",
  "host": {
    "version": "1.0.0",
    "platform": "win-x64",
    "executable": "easyink-render-host.exe",
    "url": "https://download.easyink.dev/render/host/1.0.0/win-x64.zip",
    "sha256": "...",
    "size": 12345678
  },
  "browser": {
    "name": "chrome-for-testing",
    "version": "126.0.0.0",
    "platform": "win-x64",
    "executable": "chrome.exe",
    "url": "https://download.easyink.dev/render/browser/chrome-126-win-x64.zip",
    "sha256": "...",
    "size": 234567890
  },
  "easyinkRuntime": {
    "version": "1.0.0",
    "bundled": true,
    "entry": "runtime/easyink-viewer/index.html"
  },
  "compatibility": {
    "minOs": "windows-10",
    "protocol": "1.0"
  }
}
```

非 Windows 平台：

```json
{
  "host": {
    "version": "1.0.0",
    "platform": "linux-x64",
    "executable": "easyink-render-host",
    "url": "https://download.easyink.dev/render/host/1.0.0/linux-x64.tar.gz",
    "sha256": "...",
    "size": 12345678
  }
}
```

## Host 模块

```text
host/internal/config
  CLI 参数解析、默认值、环境约束。

host/internal/server
  net/http server、路由、认证、请求大小限制、响应写入。

host/internal/protocol
  v1 请求/响应模型、错误码、版本协商。

host/internal/browser
  Chrome for Testing 启动、进程复用、context 管理。

host/internal/render
  HTML/PDF/EasyInk source pipeline、等待策略、PDF 输出。

host/internal/easyink
  EasyInk schema 校验、data binding、Runtime Bundle 路由、easyinkReady 等待协议、请求内离线资源和字体资源挂载。

host/internal/security
  allowlist、本地地址拦截、协议拦截、代理控制、文件访问控制。

host/internal/diagnostics
  requestId 日志聚合、console/network 采集、截图和 HTML 快照。
```

## Host CLI

```text
easyink-render-host
  --host 127.0.0.1
  --port 18181
  --browser-path "<chrome-for-testing-executable>"
  --profile-root "<cache-dir>"
  --temp-dir "<temp-dir>"
  --log-dir "<log-dir>"
  --max-concurrency 2
  --request-timeout-ms 30000
  --auth-token "local-random-token"
```

启动失败条件：

- `--browser-path` 不存在。
- Browser 版本无法读取。
- `--host` 不是 `127.0.0.1`。
- `--port` 被占用。
- `--auth-token` 为空。
- `--log-dir` 或 `--temp-dir` 不可写。

## HTTP API

### `GET /v1/info`

返回：

```json
{
  "hostVersion": "1.0.0",
  "protocolVersion": "1.0",
  "browserName": "chrome-for-testing",
  "browserVersion": "126.0.0.0",
  "capabilities": ["print-pdf", "source-html", "source-pdf", "source-easyink", "diagnostics"]
}
```

### `GET /v1/health`

返回：

```json
{
  "status": "ok",
  "browser": "ready",
  "queue": {
    "running": 0,
    "pending": 0,
    "maxConcurrency": 2
  }
}
```

### `POST /v1/render/print-pdf`

请求使用 Render Protocol v1 Print PDF 请求。`source.type` 取值固定为 `html`、`pdf` 或 `easyink`。成功返回 `application/pdf` 二进制流。失败返回 JSON 错误。

## Render Protocol v1

### Print PDF 请求：HTML

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
    "type": "binary"
  },
  "security": {
    "allowFileAccess": false,
    "allowedOrigins": ["https://cdn.example.com"]
  }
}
```

### Print PDF 请求：PDF

```json
{
  "requestId": "req-002",
  "source": {
    "type": "pdf",
    "pdfBase64": "JVBERi0xLjQK...",
    "fileName": "input.pdf"
  },
  "output": {
    "type": "binary"
  },
  "security": {
    "maxInputBytes": 52428800
  }
}
```

### Print PDF 请求：EasyInk Schema + Data

```json
{
  "requestId": "req-003",
  "source": {
    "type": "easyink",
    "schema": {
      "version": "1.0",
      "page": {
        "width": 80,
        "height": 120,
        "unit": "mm"
      },
      "elements": []
    },
    "data": {
      "receipt": {
        "no": "R-001",
        "items": []
      }
    }
  },
  "pdf": {
    "printBackground": true,
    "marginMm": {
      "top": 0,
      "right": 0,
      "bottom": 0,
      "left": 0
    }
  },
  "wait": {
    "until": "easyinkReady",
    "timeoutMs": 30000
  },
  "output": {
    "type": "binary"
  }
}
```

### PDF 成功响应

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
X-EasyInk-Request-Id: req-001
X-EasyInk-Diagnostics-Id: diag-001

<PDF bytes>
```

### JSON 错误响应

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

## 分阶段落地

### 阶段 1：Host 骨架

- 创建 Go module。
- 实现 CLI 参数解析。
- 实现日志初始化。
- 实现 token 认证。
- 实现 `/v1/info`。
- 实现 `/v1/health`。
- 实现优雅退出。

验收：命令行启动 Host 后，curl 能访问 `/v1/info` 和 `/v1/health`。

### 阶段 2：浏览器生命周期

- 接入 chromedp/cdproto。
- 使用 `--browser-path` 启动 Chrome for Testing。
- 实现 Browser 版本读取。
- 实现 context/page 创建和释放。
- 实现进程退出清理。

验收：Host 能启动浏览器、创建页面、关闭页面，并在 `/v1/health` 中返回 browser ready。

### 阶段 3：Print PDF 渲染

- 实现 `/v1/render/print-pdf`。
- 实现 HTML 到 PDF。
- 实现 PDF 到 PDF 校验、诊断和透传归一。
- 实现等待策略：load、networkIdle、selector、timeout。
- 实现 PDF 选项映射：纸张、边距、横向、背景。
- 调用 CDP `Page.printToPDF`。
- 返回 `application/pdf` 二进制流。
- 返回 JSON 错误响应。

验收：curl 使用 `source.type=html` 和 `source.type=pdf` 调用 `/v1/render/print-pdf` 均能得到有效 PDF 文件。

### 阶段 4：安全和隔离

- 实现 URL allowlist。
- 拦截 localhost、内网 IP、link-local、IPv6 private。
- 拦截重定向到内网。
- 禁用非 http/https 协议。
- 禁用默认文件访问。
- 控制代理环境变量。
- 每个请求使用独立 browser context。

验收：SSRF、本地文件访问和私网重定向用例全部被阻断。

### 阶段 5：Diagnostics

- 采集请求耗时。
- 采集 console error。
- 采集网络失败请求。
- 记录最终 URL。
- 记录 PDF 页数。
- 支持失败截图。
- 支持 HTML 快照。
- 返回 diagnostics ID。

验收：失败渲染能通过 diagnostics ID 定位日志、截图和网络错误。

### 阶段 6：EasyInk Schema + Data

- 内置 EasyInk Runtime Bundle。
- 实现 EasyInk schema 校验。
- 实现 data binding。
- 实现 schema + data 到 HTML。
- 支持 `easyinkReady` 等待策略。
- 支持字体包和资源包，资源 URL 固定在 `https://easyink.local/resources/...` 或 `https://easyink.local/fonts/...`。
- 支持离线资源包加载，资源由 Host 请求级拦截直接返回，不访问外部网络。

验收：`source.type=easyink` 的 schema + data 能生成有效 PDF 文件。

### 阶段 7：发布包

- 生成 win-x64 Host zip。
- 生成 linux-x64 Host tar.gz。
- 生成 linux-arm64 Host tar.gz。
- 生成 darwin-x64 Host tar.gz。
- 生成 darwin-arm64 Host tar.gz。
- 生成 Chrome for Testing Browser Bundle 包。
- 生成 manifest。
- 生成 SHA256。

验收：每个平台包解压后均能通过 manifest 校验并启动 Host。

## 测试计划

- 单页 HTML 到 PDF。
- 多页 HTML 到 PDF。
- PDF 输入归一。
- EasyInk schema + data 到 PDF。
- 自定义纸张和零边距。
- 外部字体加载。
- 图片资源加载。
- HTML 外链 allowlist 拦截。
- localhost、内网 IP、link-local、IPv6 private 拦截。
- 重定向到内网拦截。
- 非 http/https 协议拦截。
- 超时和取消。
- 并发渲染。
- 大 PDF 输入和输出。
- Browser Bundle 缺失。
- Browser 进程异常退出。
- Host 优雅退出。
- Windows 10/11 兼容性。
- Linux x64 / arm64 兼容性。
- macOS x64 / arm64 兼容性。

## 风险和处理

### Windows 7 兼容性

现代 Chrome for Testing 不提供 Windows 7/8.1 能力承诺。Render Host 不承诺 Windows 7/8.1。

### SSRF 和本地文件访问

服务端渲染存在访问内网和本地文件的风险。Host 默认关闭本地文件访问，URL 和 HTML 外链资源默认经过 allowlist。

### 浏览器体积

Chrome for Testing 作为独立 Browser Bundle 发布。Host 二进制不包含浏览器。

### 协议演进

协议版本化。Host 升级不得破坏 v1 请求和响应结构。

### CDP 封装成本

Go Host 直接封装浏览器启动、页面生命周期、等待策略、PDF 参数映射和 diagnostics。该成本进入 Host 阶段，不通过 Node.js Host 过渡。

## 执行清单

1. 创建 Go Host 工程。
2. 实现 CLI/HTTP Host。
3. 接入 chromedp/cdproto。
4. 实现 Chrome for Testing 生命周期。
5. 固化 Render Protocol v1。
6. 实现 HTML/PDF Print PDF 渲染。
7. 实现安全拦截。
8. 实现 diagnostics。
9. 实现 EasyInk schema + data 渲染。
10. 生成跨平台发布包和 manifest。
