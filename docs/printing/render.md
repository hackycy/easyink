# EasyInk.Render 服务端渲染

`EasyInk.Render` 是 EasyInk 的服务端 PDF 渲染 Runtime。它以独立进程 `easyink-render-host` 运行，接收 HTML、PDF、EasyInk schema + data 三类输入，统一输出可打印 PDF，并把排错所需的诊断信息按 `requestId` 收口。

这篇文档同时面向接入者和开发者：先用最短路径跑通一次渲染，再理解 Host 内部如何把请求送到浏览器、EasyInk Runtime、PDF 校验和 diagnostics。

## 适合场景

Render 适合需要在服务端或本地后台稳定产出 PDF 的场景：

- 前端或后端已经有 HTML，需要用固定 Chrome 版本转成 PDF。
- 已经有 PDF，需要走统一的输入校验、页数和 metadata 诊断后再进入打印链路。
- 已经有 EasyInk 模板和业务数据，需要在无浏览器 UI 的进程里生成 PDF。
- 需要把浏览器版本、等待策略、安全拦截、日志和诊断统一封装起来。

Render 不负责物理打印，也不负责调用方 SDK。物理打印请继续看 [打印方案](/printing/) 和 EasyInk Printer / HiPrint 集成。

## 一句话架构

```text
Caller
  -> Render Protocol HTTP JSON
  -> easyink-render-host
  -> source pipeline: html | pdf | easyink
  -> Chrome for Testing / EasyInk Runtime / PDF validator
  -> application/pdf or JSON error + diagnostics
```

核心边界很简单：调用方只和 HTTP 协议交互，不需要知道 chromedp、cdproto、Chrome DevTools Protocol 或 EasyInk Runtime 的内部细节。

| 组件 | 职责 |
| --- | --- |
| Render Host | Go 编写的 `easyink-render-host` 可执行文件，负责 HTTP、认证、队列、浏览器生命周期和渲染编排。 |
| Browser Bundle | 固定版本 Chrome for Testing，由 `--browser-path` 指定可执行文件路径。 |
| EasyInk Runtime Bundle | 内嵌在 Host 中，把 EasyInk schema + data 渲染成浏览器可加载的 HTML。 |
| Render Protocol | `/v1/info`、`/v1/health`、`/v1/render/print-pdf` 的 HTTP JSON 协议。 |
| Diagnostics | 每个请求生成诊断摘要，按需落盘 HTML snapshot、截图和脱敏请求头。 |
| Release Manifest | 描述 Host、Browser、平台、版本、下载地址、SHA256 和协议兼容性。 |

## 与 Viewer 和 Printer 的关系

`@easyink/viewer` 是前端预览运行时，适合在业务页面里显示、打印和导出当前文档。`EasyInk.Render` 是无 UI 的服务端渲染进程，适合在后端、本地服务或 CI 环境里稳定产出 PDF。

`EasyInk Printer (.NET)` 是本地打印服务，重点是把 PDF 提交给 Windows 打印管线。Render 的输出可以成为 Printer 的输入，但 Render 本身不枚举打印机、不提交打印任务、不维护打印队列。

## 快速跑通

Render Host 启动时必须指定 Chrome for Testing 或兼容的 headless shell 可执行文件。Host 首期只允许监听 `127.0.0.1`，并要求所有请求携带 Bearer token。

### 1. 构建 Host

在仓库根目录执行：

```powershell
Push-Location lib/EasyInk.Render/host
go test ./...
go build -o easyink-render-host.exe ./cmd/easyink-render-host
Pop-Location
```

Linux 或 macOS：

```bash
cd lib/EasyInk.Render/host
go test ./...
go build -o easyink-render-host ./cmd/easyink-render-host
cd ../../..
```

### 2. 启动 Host

Windows PowerShell 示例：

```powershell
$BrowserPath = 'C:\path\to\chrome.exe'

lib\EasyInk.Render\host\easyink-render-host.exe `
  --host 127.0.0.1 `
  --port 18181 `
  --browser-path $BrowserPath `
  --profile-root $env:TEMP\easyink-render-profile `
  --temp-dir $env:TEMP\easyink-render-temp `
  --log-dir $env:TEMP\easyink-render-logs `
  --max-concurrency 2 `
  --max-queue-size 16 `
  --request-timeout-ms 30000 `
  --auth-token test-token
```

Bash 示例：

```bash
./lib/EasyInk.Render/host/easyink-render-host \
  --host 127.0.0.1 \
  --port 18181 \
  --browser-path /path/to/chrome \
  --profile-root /tmp/easyink-render-profile \
  --temp-dir /tmp/easyink-render-temp \
  --log-dir /tmp/easyink-render-logs \
  --max-concurrency 2 \
  --max-queue-size 16 \
  --request-timeout-ms 30000 \
  --auth-token test-token
```

### 3. 检查健康状态

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:18181/v1/health `
  -Headers @{ Authorization = 'Bearer test-token' }
```

成功时会看到 `status`、`browser.status` 和 `queue`：

```json
{
  "status": "ok",
  "browser": {
    "status": "ready",
    "version": "HeadlessChrome/...",
    "restarts": 0
  },
  "queue": {
    "running": 0,
    "pending": 0,
    "maxConcurrency": 2,
    "maxQueueSize": 16
  }
}
```

### 4. 渲染 HTML 为 PDF

```powershell
Invoke-WebRequest `
  -Uri http://127.0.0.1:18181/v1/render/print-pdf `
  -Method Post `
  -Headers @{ Authorization = 'Bearer test-token' } `
  -ContentType 'application/json' `
  -InFile lib\EasyInk.Render\samples\html\request.json `
  -OutFile render-html.pdf
```

等价的 curl：

```bash
curl -X POST http://127.0.0.1:18181/v1/render/print-pdf \
  -H 'Authorization: Bearer test-token' \
  -H 'Content-Type: application/json' \
  --data-binary @lib/EasyInk.Render/samples/html/request.json \
  --output render-html.pdf
```

## Render Protocol

### 基础规则

- 请求体使用 JSON。
- 成功的默认输出是 `application/pdf` 二进制。
- `output.type=base64Json` 时返回 JSON，便于调试和测试。
- 错误响应使用 JSON，包含稳定错误码、`requestId` 和 diagnostics。
- `requestId` 必填，建议调用方使用业务任务 ID 或链路追踪 ID。
- 所有接口都需要 `Authorization: Bearer <token>`。

### 接口

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/v1/info` | GET | 返回 Host 版本、协议版本、浏览器版本和能力列表。 |
| `/v1/health` | GET | 返回 Host、Browser 和渲染队列状态。 |
| `/v1/render/print-pdf` | POST | 把 HTML、PDF 或 EasyInk schema + data 归一为 PDF。 |

### 请求结构

```json
{
  "requestId": "req-001",
  "source": {},
  "pdf": {},
  "wait": {},
  "output": {},
  "security": {},
  "diagnostics": {}
}
```

| 字段 | 说明 |
| --- | --- |
| `source` | 输入内容，`type` 为 `html`、`pdf` 或 `easyink`。 |
| `pdf` | 纸张、边距、横向、背景等 PDF 输出选项。 |
| `wait` | HTML/EasyInk 渲染完成条件。 |
| `output` | 默认二进制 PDF；调试时可设为 `base64Json`。 |
| `security` | 外链 allowlist、文件访问、PDF 输入大小限制。 |
| `diagnostics` | 是否额外写入 HTML snapshot、截图、脱敏请求头。 |

## 三类输入

### HTML 输入

HTML 输入适合调用方已经完成页面拼装，只需要 Render 负责加载、等待和 `Page.printToPDF` 的场景。

```json
{
  "requestId": "sample-html-001",
  "source": {
    "type": "html",
    "html": "<!doctype html><html><body><main class=\"easyink-ready\">Sample HTML to PDF</main></body></html>"
  },
  "pdf": {
    "paperWidthMm": 80,
    "paperHeightMm": 120,
    "printBackground": true,
    "marginMm": { "top": 0, "right": 0, "bottom": 0, "left": 0 }
  },
  "wait": {
    "selector": ".easyink-ready"
  }
}
```

常用字段：

- `source.html`：完整 HTML 字符串。
- `source.baseUrl`：用于解析相对资源 URL。Host 会向 `<head>` 注入 `<base>`，如果 HTML 已有 `<base>` 则保留原值。
- `security.allowedOrigins`：允许加载的外部公共资源 origin。
- `wait.until`：`load`、`selector`、`easyinkReady` 或 `networkIdle`。
- `wait.selector`：等待指定 DOM 节点 ready。

HTML 会以 data URL 方式加载到浏览器页面中。外部资源请求会经过安全校验和请求拦截，私网、localhost、link-local、非 http/https 协议默认都会被阻断。

### PDF 输入

PDF 输入不会经过 Chrome。Host 会解码 base64，校验大小、PDF header、`startxref`、`%%EOF` 和基本结构，读取页数与 metadata，然后把原 PDF bytes 按统一响应契约返回。

```json
{
  "requestId": "sample-pdf-001",
  "source": {
    "type": "pdf",
    "fileName": "sample.pdf",
    "pdfBase64": "JVBERi0xLjQK..."
  },
  "output": {
    "type": "base64Json"
  }
}
```

PDF 输入适合接入侧已经有 PDF，但希望统一做输入大小控制、诊断、错误码和后续打印链路归一的场景。

### EasyInk 输入

EasyInk 输入由 Host 内嵌的 Runtime Bundle 处理。Host 会把 schema + data 编码进受控 HTML，注入 viewer runtime、material runtime、QRCode/Barcode vendor 脚本，再交给 Chrome 输出 PDF。

```json
{
  "requestId": "sample-easyink-001",
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
        "no": "R-001"
      }
    }
  }
}
```

EasyInk 输入的默认行为：

- `schema.page.width` 和 `schema.page.height` 会成为 PDF 纸张尺寸。
- 目前页面单位只支持 `mm`。
- 默认开启 `printBackground`。
- 默认边距为 0。
- 默认等待 `.easyink-ready`。
- Runtime 内置 text、rect、line、image、qrcode、barcode、ellipse、container、table-static、table-data、flow-row、chart、page-number、svg-star、svg-heart、svg 等基础渲染能力。

## 离线资源和字体

Render 支持请求内资源包，适合把图片、字体等依赖随请求一起提交，避免 Host 访问外网。

资源 URL 必须挂载在固定 origin：

- `https://easyink.local/resources/...`
- `https://easyink.local/fonts/...`

示例：

```json
{
  "source": {
    "type": "html",
    "html": "<img src=\"https://easyink.local/resources/logo.png\"><p class=\"easyink-ready\">ok</p>",
    "resources": [
      {
        "url": "https://easyink.local/resources/logo.png",
        "contentType": "image/png",
        "base64": "..."
      }
    ],
    "fonts": [
      {
        "family": "Receipt Font",
        "url": "https://easyink.local/fonts/receipt.woff2",
        "contentType": "font/woff2",
        "base64": "...",
        "weight": "700",
        "style": "normal"
      }
    ]
  }
}
```

Host 会为字体生成 `@font-face`，并通过请求级拦截直接返回资源内容，不访问外部网络。

## 等待策略

| `wait.until` | 行为 |
| --- | --- |
| 空或 `load` | 等待 `body` ready。 |
| `selector` | 等待 `wait.selector` 指定节点 ready。 |
| `easyinkReady` | 等待 `.easyink-ready`，除非显式传入其他 selector。 |
| `networkIdle` | 等待网络空闲；如果同时传 selector，也会先等 selector。 |

`wait.timeoutMs` 会参与单次渲染超时控制。如果请求里设置了更短的 timeout，会覆盖 Host 启动参数中的 `--request-timeout-ms`。

## Diagnostics

每个请求都会生成 diagnostics 摘要。成功响应和错误响应都会带上：

```http
X-EasyInk-Request-Id: req-001
X-EasyInk-Diagnostics-Id: diag-...
```

默认落盘内容包括：

- `diagnostics.json`：结构化摘要。
- `render.log`：便于 grep 的 key-value 日志。

摘要字段包括：

- `requestId`、`sourceType`、Host 版本、协议版本、浏览器版本。
- `durationMs`、`finalUrl`、`pageCount`。
- 页面 `console.error` 和失败网络请求。
- PDF 输入的 title、author、creator、producer。
- 可选的 request headers、HTML snapshot 和 screenshot 路径。

开启更多附件：

```json
{
  "diagnostics": {
    "includeHtmlSnapshot": true,
    "includeScreenshot": true,
    "includeRequestHeaders": true
  }
}
```

请求头落盘前会脱敏认证类字段。HTML snapshot 和 screenshot 默认不写入，只有显式开启才会出现在 `--log-dir/diagnostics/<diagnosticsId>/` 下。

## 安全模型

Render 的安全边界按服务端渲染来设计，默认保守：

- Host 只允许监听 `127.0.0.1`。
- 所有接口都要求 Bearer token。
- Browser 使用每请求独立 context，避免 Cookie、localStorage、sessionStorage 污染。
- 默认禁用 `file://` 访问，除非显式设置 `security.allowFileAccess=true`。
- `source.type=url` 不属于 v1 协议，调用方不能让 Host 直接打开任意 URL。
- HTML 外链资源需要同源或在 `security.allowedOrigins` 中列出。
- localhost、私网 IP、link-local、IPv6 private、DNS 解析到私网地址和重定向到私网地址会被阻断。
- 浏览器启动时清空代理环境变量，并设置 direct proxy，降低代理绕过 allowlist 的风险。
- 请求体最大 64 MB，PDF 输入默认最大 50 MB，可通过 `security.maxInputBytes` 降低或调整。

## 实现导览

Render Host 代码集中在 `lib/EasyInk.Render/host`：

```text
cmd/easyink-render-host/main.go
  进程入口：解析配置、启动 Browser Manager、运行 HTTP server。

internal/config
  CLI 参数、默认值、loopback 和目录可写校验。

internal/server
  HTTP 路由、Bearer token、并发限制、队列、响应写入、diagnostics 落盘。

internal/protocol
  v1 请求/响应模型、错误码、Host/Protocol 版本。

internal/browser
  Chrome for Testing 启动、复用、探活、重启、每请求 browser context。

internal/render
  source pipeline：HTML 到 PDF、PDF 校验透传、EasyInk 到 HTML 再转 PDF。

internal/easyink
  内嵌 EasyInk Runtime Bundle，生成 runtime HTML 和 PDF 默认参数。

internal/security
  baseUrl、资源 URL、私网地址、协议和 allowlist 校验。

internal/diagnostics
  diagnostics collector、summary/log/attachment 写入。
```

请求进入 `/v1/render/print-pdf` 后，主要链路是：

```text
server.printPDF
  -> JSON decode + DisallowUnknownFields
  -> acquireRenderSlot
  -> render.Service.RenderPrintPDF
  -> source.type switch
  -> persistDiagnostics
  -> application/pdf or base64Json or JSON error
```

HTML 和 EasyInk 渲染会创建浏览器页面；PDF 输入不需要浏览器，所以浏览器版本在 diagnostics 中会显示为当前 manager 版本或 `not-required`。

## 开发流程

### 改协议字段

1. 修改 `host/internal/protocol/protocol.go`。
2. 更新 `protocol/openapi/render-v1.openapi.json`。
3. 更新 `protocol/fixtures` 和 `samples`。
4. 为 JSON decode、默认值和错误响应补测试。
5. 更新本文档的请求字段说明。

### 改 HTML/PDF 渲染行为

1. 修改 `host/internal/render`。
2. 优先加单元测试覆盖参数映射、等待策略、PDF 输入校验或安全拦截。
3. 需要真实浏览器时，使用 `EASYINK_RENDER_BROWSER_PATH` 运行集成测试。
4. 保持错误码稳定，只有新增行为时再添加新错误码。

### 改 EasyInk Runtime

1. 修改 `host/internal/easyink/runtime/easyink-viewer` 下的内嵌资源。
2. 更新 `assets/materials/manifest.json`。
3. 在 `host/internal/easyink/easyink_test.go` 中补 runtime HTML 或真实浏览器验证。
4. 确认 `.easyink-ready` 仍在渲染完成后出现。

### 改发布和 manifest

发布辅助脚本在 `lib/EasyInk.Render/tools/render-release.mjs`。常用命令：

```bash
pnpm render:manifest
pnpm render:release:test
```

构建 Host 包：

```bash
node lib/EasyInk.Render/tools/render-release.mjs build-host \
  --platform linux-x64 \
  --version 0.1.0 \
  --outDir lib/EasyInk.Render/releases
```

下载 Browser Bundle 并生成 manifest：

```bash
node lib/EasyInk.Render/tools/render-release.mjs download-browser \
  --platform linux-x64 \
  --version 148.0.7778.97 \
  --outDir lib/EasyInk.Render/releases
```

校验 archive 与 manifest：

```bash
node lib/EasyInk.Render/tools/render-release.mjs verify-package \
  --kind host \
  --manifest lib/EasyInk.Render/releases/host/0.1.0/linux-x64/runtime-manifest.linux-x64.json \
  --archive lib/EasyInk.Render/releases/host/0.1.0/linux-x64/easyink-render-host-0.1.0-linux-x64.tar.gz
```

## Docker 验证

如果本机没有 Go 或 Chrome，可以用 Docker 做隔离验证。

单元测试：

```bash
docker run --rm \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'gofmt -w cmd internal && go test ./...'
```

真实浏览器集成测试：

```bash
docker run --rm \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'go test -c ./internal/render -o /src/render.test'

docker run --rm --entrypoint sh \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  chromedp/headless-shell:latest \
  -lc 'EASYINK_RENDER_BROWSER_PATH=/headless-shell/headless-shell ./render.test -test.v'
```

验证 Browser Bundle 下载与启动：

```bash
export EASYINK_RENDER_BROWSER_VERSION=148.0.7778.97
export EASYINK_RENDER_BROWSER_PLATFORM=linux-x64
export EASYINK_RENDER_RELEASE_DIR=lib/EasyInk.Render/releases-browser-docker

docker run --rm \
  -e EASYINK_RENDER_BROWSER_VERSION \
  -e EASYINK_RENDER_BROWSER_PLATFORM \
  -e EASYINK_RENDER_RELEASE_DIR \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:22-bookworm \
  bash -lc '
    node lib/EasyInk.Render/tools/render-release.mjs download-browser \
      --platform "$EASYINK_RENDER_BROWSER_PLATFORM" \
      --version "$EASYINK_RENDER_BROWSER_VERSION" \
      --outDir "$EASYINK_RENDER_RELEASE_DIR"

    MANIFEST="$EASYINK_RENDER_RELEASE_DIR/browser/$EASYINK_RENDER_BROWSER_VERSION/$EASYINK_RENDER_BROWSER_PLATFORM/runtime-manifest.$EASYINK_RENDER_BROWSER_PLATFORM.json"
    ARCHIVE=$(find "$EASYINK_RENDER_RELEASE_DIR/browser/$EASYINK_RENDER_BROWSER_VERSION/$EASYINK_RENDER_BROWSER_PLATFORM" -maxdepth 1 \( -name "*.zip" -o -name "*.tar.gz" \) | head -n 1)
    node lib/EasyInk.Render/tools/render-release.mjs verify-package \
      --kind browser \
      --manifest "$MANIFEST" \
      --archive "$ARCHIVE"
  '
```

完整发布包启动验证建议放在 CI：Linux 包在 Linux runner 中启动，Windows/macOS 包分别在对应 runner 中启动。

## 常见问题

### configuration error: auth-token is required

Host 不允许无认证启动。启动时传入 `--auth-token`，请求时传入 `Authorization: Bearer <token>`。

### host must be 127.0.0.1

v1 Host 只允许 loopback 监听。它面向本机服务或受控 sidecar，不直接暴露公网接口。

### browser startup error

检查 `--browser-path` 是否指向实际可执行文件，而不是目录。Linux 容器还需要 Chrome 运行库，真实浏览器测试可直接使用 `chromedp/headless-shell` 镜像。

### render queue is full

当前 `running` 已达到 `--max-concurrency`，且等待队列达到 `--max-queue-size`。调用方应该退避重试，或根据机器资源调大并发和队列。

### resource origin is not allowed

HTML 中的外部资源不在同源或 `security.allowedOrigins` 中。对于请求内资源，改用 `https://easyink.local/resources/...` 或 `https://easyink.local/fonts/...`。

### RENDER_TIMEOUT

先看 diagnostics 里的 `consoleErrors` 和 `failedRequests`。如果页面确实需要更久，调大 `wait.timeoutMs` 或 Host 的 `--request-timeout-ms`；如果等待 selector 永远不出现，修正 `wait.selector` 或 EasyInk Runtime 的 ready 标记。

## 文档收敛约定

Render 的使用、架构和开发说明以本文为主。`lib/EasyInk.Render/README.md` 只保留源码入口、常用命令和维护约定，避免设计方案、教程和排错步骤散落在源码目录下。