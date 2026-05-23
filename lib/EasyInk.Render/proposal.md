# EasyInk.Render 实施方案

## 方案摘要

建立 `EasyInk.Render` 作为独立渲染能力层，提供可下载的 `easyink-render-host` 和浏览器运行时。C#、Node.js、Golang 等服务端通过统一协议调用它，把 HTML、URL、Viewer payload 或模板渲染成 PDF/图片。

C# 端集成时，`EasyInk.Printer` 负责下载和启动 Render Host；打印请求如果包含 HTML 或 Viewer 输入，先调用 Render Host 生成 PDF，再把 PDF 交给现有 `EasyInk.Engine` 打印链路。

## 推荐技术路线

### MVP 路线

用 Node.js + Playwright 快速验证协议和渲染能力。

优点：

- 开发速度快。
- PDF、截图、等待策略成熟。
- 易于验证模板、字体、网络和诊断能力。

缺点：

- 发布形态较重。
- Host 运行时依赖 Node.js 或需要额外打包。
- 长期作为基础设施时，部署边界不如单文件 Host 清晰。

### 长期路线

用 Go 或 Rust 编写 `easyink-render-host`，直接控制 Chrome DevTools Protocol。

优点：

- Host 可以做成单个可执行文件。
- 适合 C#、Node.js、Golang 等多语言共同调用。
- 运行时边界清晰。
- 不把 Playwright/Puppeteer API 暴露给协议。

缺点：

- 初期开发成本更高。
- 需要自行封装部分浏览器控制细节。

建议：先用 MVP 路线验证协议和产品体验，再切换或重写为长期 Host。协议保持稳定，Host 实现可以替换。

## 目录规划

```text
lib/EasyInk.Render/
  README.md
  architecture.md
  proposal.md
  host/
  protocol/
  clients/
    dotnet/
    nodejs/
    go/
  manifests/
  samples/
```

当前先建立文档目录，后续再按阶段补充代码。

## Manifest 设计

由 EasyInk 维护版本 manifest，设置页和各语言宿主都通过 manifest 下载 runtime。

```json
{
  "schemaVersion": 1,
  "protocolVersion": "1.0",
  "host": {
    "version": "1.0.0",
    "platform": "win-x64",
    "url": "https://download.easyink.dev/render/host/1.0.0/win-x64.zip",
    "sha256": "...",
    "size": 12345678
  },
  "browser": {
    "name": "chrome-for-testing",
    "version": "126.0.0.0",
    "platform": "win-x64",
    "url": "https://download.easyink.dev/render/browser/chrome-126-win-x64.zip",
    "sha256": "...",
    "size": 234567890
  },
  "compatibility": {
    "minWindowsVersion": "10.0",
    "supportedClients": ["dotnet", "nodejs", "go"]
  }
}
```

## C# 集成方案

### 新增配置

在 `EasyInk.Printer` 的配置层增加：

- `RenderEnabled`
- `RenderHostVersion`
- `RenderHostPath`
- `RenderBrowserVersion`
- `RenderBrowserPath`
- `RenderEndpoint`
- `RenderMaxConcurrency`
- `RenderTimeoutSeconds`
- `RenderTempDir`
- `RenderAllowedOrigins`

### 设置页

新增设置分组：`渲染服务`。

建议字段：

- 安装状态：未安装、已安装、校验失败、版本过旧。
- Host 版本。
- Browser 版本。
- 下载按钮。
- 删除按钮。
- 启用开关。
- 最大并发。
- 渲染超时。
- 临时目录。
- 允许访问的域名。

启用条件：

- Host 已下载并校验通过。
- Browser 已下载并校验通过。
- 当前系统满足 manifest 的兼容性要求。

### 打印请求预处理

扩展打印请求输入：

- `html`
- `htmlUrl`
- `viewer`
- `template`
- `renderOptions`

处理规则：

1. 如果请求已有 `pdfBytes`、`pdfBase64` 或 `pdfUrl`，不经过 Render，保持现有行为。
2. 如果请求包含 HTML、URL、Viewer 或模板输入，调用 Render Host 生成 PDF。
3. 生成的 PDF 写入 `PdfBytes`。
4. 继续调用现有 `EngineApi` 和 `RoutingPrintService`。

这样可以最大限度复用当前 C# 打印能力，不改变 PDFium/GDI、SumatraPDF、ESC/POS Raw 的责任边界。

## Node.js 集成方案

Node.js SDK 只封装协议：

```ts
const client = new EasyInkRenderClient({ endpoint: 'http://127.0.0.1:18181' })

const pdf = await client.renderPdf({
  source: {
    type: 'html',
    html
  },
  pdf: {
    printBackground: true,
    paperWidthMm: 80,
    marginMm: { top: 0, right: 0, bottom: 0, left: 0 }
  }
})
```

Node.js 服务可以选择：

- 连接已有 Render Host。
- 自行下载并启动 Render Host。
- 在容器中固定挂载 Render Host 和 Browser Bundle。

## Golang 集成方案

Golang SDK 同样只封装协议：

```go
client := easyinkrender.NewClient("http://127.0.0.1:18181")

pdf, err := client.RenderPDF(ctx, easyinkrender.RenderPDFRequest{
    Source: easyinkrender.Source{
        Type: "html",
        HTML: html,
    },
    PDF: easyinkrender.PDFOptions{
        PrintBackground: true,
        PaperWidthMM: 80,
    },
})
```

Golang 服务端适合直接托管 `easyink-render-host`，也适合作为长期 Host 的实现语言候选。

## 分阶段落地

### 阶段 1：协议和 MVP Host

- 定义 Render Protocol v1。
- 实现 HTML 到 PDF。
- 实现 URL 到 PDF。
- 支持等待策略：load、networkIdle、selector、timeout。
- 支持 PDF 基础选项：纸张、边距、横向、背景。
- 输出基础 diagnostics。

验收：Node.js 或命令行可以调用 Host 生成 PDF。

### 阶段 2：C# 集成

- `EasyInk.Printer` 增加 Runtime Manager。
- 设置页增加下载、校验、启用能力。
- 增加 Render Client。
- 打印请求支持 HTML/URL 渲染成 PDF。
- 生成 PDF 后复用现有打印链路。

验收：C# 端可以打印 HTML 输入，最终仍走现有 PDF 打印路由。

### 阶段 3：Viewer 和模板

- 支持 EasyInk Viewer payload。
- 支持模板和数据合成。
- 支持字体包和资源包。
- 支持失败截图、HTML 快照和网络诊断。

验收：业务页面可以不依赖浏览器前端，直接在服务端渲染成 PDF。

### 阶段 4：多语言 SDK

- 发布 C# SDK。
- 发布 Node.js SDK。
- 发布 Golang SDK。
- 补充 Docker/container 使用文档。

验收：不同语言服务端使用同一 Render Host 产出一致结果。

## 测试计划

- 单页 HTML 到 PDF。
- 多页 HTML 到 PDF。
- 自定义纸张和零边距。
- 外部字体加载。
- 图片资源加载。
- URL allowlist 拦截。
- 超时和取消。
- 并发渲染。
- 大 PDF 输出。
- Host 崩溃后重启。
- Browser Bundle 缺失或校验失败。
- Windows 10/11 兼容性。

## 风险

### Windows 7 兼容性

现代 Chromium 对 Windows 7/8.1 支持有限。Render 能力应以 Windows 10/11 为主要目标，C# 原有打印链路继续保持 Windows 7 支持。

### SSRF 和本地文件访问

服务端渲染天然存在访问内网和本地文件的风险。默认必须关闭本地文件访问，并提供域名 allowlist。

### 浏览器体积

浏览器运行时体积较大，因此必须按需下载，不内置到 C# 安装包。下载过程必须支持断点、校验和失败恢复。

### 协议演进

协议需要版本化。Host 可以升级实现，但不能随意破坏 v1 请求和响应结构。

## 推荐下一步

1. 固化 Render Protocol v1 字段。
2. 决定 MVP Host 使用 Node.js + Playwright 还是直接 Go/Rust + CDP。
3. 先做 CLI/HTTP Host 原型，不接 C# 设置页。
4. 用真实 EasyInk Viewer 页面验证 PDF 输出质量。
5. 再接入 `EasyInk.Printer` 设置页和打印请求预处理。
