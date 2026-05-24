# EasyInk.Render 架构设计

## 架构边界

`EasyInk.Render` 只定义一个独立可执行文件 Runtime：`easyink-render-host`。

架构包含：

- Host 可执行文件。
- Chrome for Testing Browser Bundle。
- EasyInk Runtime Bundle。
- Runtime Manifest。
- Render Protocol。
- Diagnostics。
- 发布包结构。

架构不包含：

- 外部系统集成。
- 调用方库实现。
- Node.js Host。
- Playwright Runtime。

## 目标

- 交付跨平台可执行文件 `easyink-render-host`。
- 支持 HTML、PDF、EasyInk schema + data 三类输入。
- 统一产出可打印 PDF。
- 使用统一 HTTP 协议对外提供渲染能力。
- Browser Bundle 按 manifest 固定版本、固定校验值分发。
- EasyInk Runtime Bundle 随 Host 版本固定。
- Host 与 Browser Bundle 解耦发布。
- 诊断信息按 `requestId` 聚合。
- 协议不暴露 chromedp、cdproto 或 CDP 原始类型。

## 非目标

- 不实现物理打印。
- 不实现外部系统集成。
- 不实现调用方语言库。
- 不使用 Node.js 作为 Host。
- 不使用 Playwright 作为 Runtime。
- 不把浏览器运行时编译或打包进 Host 二进制。

## 交付形态

### Host 可执行文件

`easyink-render-host` 是 Go 编写的跨平台可执行文件。

固定技术栈：

```text
Language: Go
CDP client: chromedp + cdproto
Browser: Chrome for Testing
Protocol server: net/http
PDF operation: CDP Page.printToPDF
```

平台产物：

| 平台 | 文件名 |
| --- | --- |
| Windows | `easyink-render-host.exe` |
| Linux | `easyink-render-host` |
| macOS | `easyink-render-host` |

### Browser Bundle

Browser Bundle 使用 Chrome for Testing。

Bundle 内容：

```text
browsers/
  chrome-<version>-<platform>/
    chrome.exe
    ...
```

Host 通过 `--browser-path` 接收浏览器可执行文件路径。Host 不下载浏览器，不解压浏览器，不修改浏览器包内容。

### EasyInk Runtime Bundle

EasyInk Runtime Bundle 内置在 Host 发布包中，用于把 EasyInk schema + data 渲染成浏览器可加载的 HTML。

Bundle 内容：

```text
runtime/
  easyink-viewer/
    index.html
    assets/
      viewer.js
      viewer.css
      materials/
```

Host 使用本地受控资源路由加载 EasyInk Runtime Bundle，不通过外部网络加载 viewer、material 或样式资源。

### Runtime Manifest

Runtime Manifest 描述 Host 和 Browser Bundle 的版本、平台、下载地址、SHA256、大小和协议兼容性。Host 不解析远端 manifest；manifest 供发布、安装和校验流程使用。

## 进程模型

```text
easyink-render-host
  -> starts Chrome for Testing
  -> creates isolated browser context per render request
  -> dispatches source pipeline: html | pdf | easyink
  -> creates page
  -> loads HTML or EasyInk generated HTML
  -> waits for ready condition
  -> calls Page.printToPDF
  -> returns PDF bytes
  -> closes page/context
```

Host 生命周期：

- 进程启动后初始化配置和日志。
- `/v1/health` 返回 Host 和 Browser 状态。
- 渲染请求按并发限制进入队列。
- 每个请求使用独立 browser context。
- 请求完成后释放 page 和 context。
- Host 收到终止信号后停止接收新请求，等待正在执行的请求结束或超时退出。
- 进入终止态后，新的渲染请求直接返回 `503 Service Unavailable`，不会继续排队。

## Host 职责

- 解析 CLI 参数。
- 启动和复用 Chrome for Testing。
- 通过 chromedp/cdproto 创建 browser context 和 page。
- 接收 `127.0.0.1` loopback HTTP 请求。
- 执行 HTML 到 PDF。
- 执行 PDF 校验、归一和透传。
- 执行 EasyInk schema + data 到 PDF。
- 调用 CDP `Page.printToPDF` 产出 HTML/EasyInk 的 PDF。
- 控制并发、超时、临时文件、字体目录和资源访问策略。
- 提供 `/v1/info`、`/v1/health`、`/v1/render/print-pdf`。
- 将日志写入指定目录。
- 按 `requestId` 聚合 diagnostics。

Host 不负责：

- 下载 Runtime。
- 解压 Runtime。
- 升级 Runtime。
- 清理旧版本 Runtime。
- 物理打印。
- 调用方业务逻辑。
- Node.js/Playwright 生命周期。

## Host 启动参数

```text
easyink-render-host
  --host 127.0.0.1
  --port 18181
  --browser-path "<chrome-for-testing-executable>"
  --profile-root "<cache-dir>"
  --temp-dir "<temp-dir>"
  --log-dir "<log-dir>"
  --max-concurrency 2
  --max-queue-size 16
  --request-timeout-ms 30000
  --auth-token "local-random-token"
```

Windows 示例：

```text
easyink-render-host.exe --host 127.0.0.1 --port 18181 --browser-path "C:\Users\Alice\AppData\Local\EasyInk\Render\browsers\chrome-win-x64\chrome.exe"
```

## HTTP API

| 路径 | 说明 |
| --- | --- |
| `GET /v1/info` | 返回 Host 版本、协议版本、浏览器版本和能力列表。 |
| `GET /v1/health` | 返回进程、浏览器和队列健康状态。 |
| `POST /v1/render/print-pdf` | 把 HTML、PDF 或 EasyInk schema + data 统一归一为可打印 PDF。 |

首期只交付 loopback HTTP。WebSocket 和 stdio 不进入首期协议。

## Render Protocol

协议规则：

- 请求使用 JSON。
- PDF 成功响应使用 `application/pdf` 二进制流。
- JSON 错误响应包含稳定错误码、`requestId` 和 diagnostics。
- 协议版本和 Host 版本分离。
- 请求必须携带 `requestId`。
- 协议字段使用静态类型友好的结构。
- 协议不泄漏 chromedp、cdproto 或 CDP 原始类型。

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

### 调试响应

调用方显式传入 `output.type=base64Json` 时返回 JSON：

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

## 渲染链路

### HTML 到 PDF

```text
Caller
  -> POST /v1/render/print-pdf
  -> easyink-render-host
  -> chromedp new context
  -> load HTML with baseUrl
  -> wait for ready condition
  -> cdproto Page.printToPDF
  -> return PDF bytes
```

### PDF 到 PDF

```text
Caller
  -> POST /v1/render/print-pdf
  -> easyink-render-host
  -> decode input PDF
  -> validate PDF header and size limits
  -> normalize metadata and diagnostics
  -> return PDF bytes
```

### EasyInk Schema + Data 到 PDF

```text
Caller
  -> POST /v1/render/print-pdf
  -> easyink-render-host
  -> validate EasyInk schema
  -> bind data
  -> load EasyInk Runtime Bundle
  -> render schema + data to DOM
  -> wait for easyinkReady
  -> cdproto Page.printToPDF
  -> return PDF bytes
```

## 安全模型

- 默认禁用本地文件访问。
- 默认不保留 Cookie、localStorage、sessionStorage。
- 默认启用请求超时、导航超时和总任务超时。
- `source.type=url` 不属于 Print PDF v1 输入类型。
- `source.type=html` 的外链资源默认受 allowlist 约束。
- `source.type=easyink` 只加载 Host 内置 EasyInk Runtime Bundle 和请求内显式资源包。
- URL 资源加载必须拦截 localhost、内网 IP、link-local、IPv6 private、重定向到内网以及非 http/https 协议。
- PDF 输入必须经过大小限制、文件头校验和页数诊断。
- Host 默认只监听 `127.0.0.1`。
- 每个请求必须携带本机随机 token。
- Host 禁用或显式控制代理环境变量，避免绕过 allowlist。
- 诊断附件默认不包含完整 HTML、截图或请求头；调用方显式开启后才写入受控诊断目录。

## Diagnostics

每个请求生成 diagnostics 摘要：

- `requestId`
- Host 版本。
- Browser 版本。
- 协议版本。
- 渲染耗时。
- 页面 console error。
- 网络失败请求。
- 最终 URL。
- 输入类型：html、pdf 或 easyink。
- PDF 页数。
- 失败截图引用。
- HTML 快照引用。

诊断附件写入 `--log-dir` 下的受控子目录，响应只返回 diagnostics ID。

## Runtime 目录结构

```text
render-runtime/
  hosts/
    1.0.0/
      easyink-render-host.exe
  browsers/
    chrome-126.0.x-win-x64/
      chrome.exe
  cache/
  logs/
  temp/
```

## 兼容性

- Windows 10/11：Host 主支持平台。
- Linux x64 / arm64：Host 发布平台。
- macOS arm64 / x64：Host 发布平台。
- Windows 7/8.1：不提供 Chrome for Testing 运行承诺。
