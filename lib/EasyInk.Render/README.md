# EasyInk.Render

`EasyInk.Render` 是独立的服务端渲染可执行文件架构。它交付 `easyink-render-host` 和配套 Browser Bundle，把 HTML、PDF、EasyInk schema + data 统一归一为可打印 PDF，并返回受控诊断信息。

`EasyInk.Render` 不包含外部系统集成或调用方库实现。任何调用方都只通过 Render Protocol 调用 `easyink-render-host`。

## 命名

最终命名固定为 `EasyInk.Render`。

原因：

- `Render` 表达服务端渲染能力边界。
- 架构边界是可执行文件和协议，不绑定调用方语言。
- 外部调用方通过协议访问能力，不感知 chromedp、cdproto 或 CDP 原始类型。
- 目录承载 Host、Protocol、Manifests、Samples、测试 fixture 和发布脚本。

排除名称：

- `EasyInk.Chromium`：把实现细节暴露为产品边界。
- `EasyInk.RenderRuntime`：只覆盖运行时，无法完整承载协议、manifest 和诊断能力。
- `EasyInk.PrintRender`：把能力限制在打印前置渲染。
- `EasyInk.Browser`：容易被理解成浏览器自动化工具。

## 核心概念

| 名称 | 说明 |
| --- | --- |
| EasyInk.Render | 总体能力和目录名。 |
| Render Host | Go 编写的跨平台可执行文件，文件名为 `easyink-render-host`。 |
| Render Protocol | HTTP JSON + PDF 二进制协议，不暴露 CDP 类型。 |
| Browser Bundle | manifest 指定版本的 Chrome for Testing。 |
| EasyInk Runtime Bundle | 内置在 Host 产物中的 EasyInk schema/viewer 渲染资源，用于把 schema + data 合成为 HTML。 |
| Runtime Manifest | 描述 Host、Browser、平台、版本、下载地址、SHA256 和协议兼容性。 |
| Diagnostics | 按 `requestId` 聚合的渲染耗时、控制台错误、网络失败、截图和日志引用。 |

## 定稿技术栈

```text
Render Host: Go executable
Browser control: chromedp + cdproto
Browser runtime: Chrome for Testing
Protocol server: net/http
Listen address: 127.0.0.1
Request: JSON
Success response: application/pdf binary
Error response: JSON
PDF operation: CDP Page.printToPDF
```

## 输入模型

```text
source.type=html
  -> load HTML in Chrome
  -> Page.printToPDF
  -> PDF

source.type=pdf
  -> validate PDF
  -> normalize output contract
  -> PDF

source.type=easyink
  -> bind schema + data
  -> render with EasyInk Runtime Bundle
  -> load generated HTML in Chrome
  -> Page.printToPDF
  -> PDF
```

Node.js 不进入 Runtime 架构。Playwright 只存在于测试对照工具中，用于生成 PDF 输出质量 fixture，不参与 Host、CLI、manifest、日志或生命周期管理。

## 落地架构

```text
Caller
  -> Render Protocol
  -> easyink-render-host
  -> Source Pipeline (html | pdf | easyink)
  -> chromedp / cdproto
  -> Chrome for Testing
  -> PDF / Diagnostics
```

`easyink-render-host` 是逻辑名称。Windows 产物为 `easyink-render-host.exe`，Linux/macOS 产物为 `easyink-render-host`。首期协议固定为 `127.0.0.1` loopback HTTP；WebSocket 和 stdio 不进入首期交付。

## 文档

- [架构设计](architecture.md)
- [实施方案](proposal.md)

## 当前落地状态

`host/` 已提供首期 Go Host 实现：

- `GET /v1/info`
- `GET /v1/health`
- `POST /v1/render/print-pdf`
- `source.type=html` 通过 chromedp/CDP `Page.printToPDF` 输出 PDF。
- `source.type=pdf` 执行 base64 解码、大小限制、PDF header/EOF/startxref/结构校验、页数解析、metadata 归一和透传输出。
- `source.type=easyink` 通过内置 EasyInk Runtime Bundle 合成 HTML，再走 `Page.printToPDF`；内置 viewer 读取 materials manifest，并支持 text、rect、line、image、qrcode、barcode、ellipse、container、table-static、table-data、flow-row、chart、page-number、svg-star、svg-heart、svg 基础渲染和 binding 文本投影。
- 支持请求内离线资源包和字体包；资源 URL 必须使用 `https://easyink.local/resources/...` 或 `https://easyink.local/fonts/...`，由 Host 在请求级资源拦截中直接返回，不访问外部网络。
- 支持 `output.type=base64Json` 调试响应。
- 支持 requestId diagnostics、console error、network failed request、最终 URL、页数、PDF metadata 和日志落盘；调用方可通过 `diagnostics.includeHtmlSnapshot`、`diagnostics.includeScreenshot`、`diagnostics.includeRequestHeaders` 显式开启 HTML snapshot、截图和脱敏请求头附件。二进制、调试 JSON 和错误响应均返回 `X-EasyInk-Request-Id` 与 `X-EasyInk-Diagnostics-Id` 便于定位附件。
- 支持 token 认证、并发限制、有界渲染队列、baseUrl/resource URL 安全校验、请求级资源拦截、外链 allowlist、非 http/https 拦截、DNS 解析后私网地址拦截、direct proxy 浏览器启动和代理环境变量清空。
- 支持 `wait.until=load|selector|easyinkReady|networkIdle`，并支持 selector/timeout 组合。
- Browser Manager 支持复用根浏览器、每请求独立 browser context、异常探活后自动重启和结构化 `/v1/health`；健康检查返回 `queue.running`、`queue.pending`、`queue.maxConcurrency` 和 `queue.maxQueueSize`。
- 发布工具支持 Host/Browser/runtime manifest 生成、SHA256/size 校验和 Browser Bundle 打包。

## 发布与 Manifest 验证

Render 发布辅助脚本位于 `tools/render-release.mjs`：

```bash
pnpm render:manifest
pnpm render:release:test
```

OpenAPI 协议描述位于 `protocol/openapi/render-v1.openapi.json`。

生成单个平台 Host 包和 runtime manifest：

```bash
node lib/EasyInk.Render/tools/render-release.mjs build-host \
  --platform linux-x64 \
  --version 0.1.0 \
  --outDir lib/EasyInk.Render/releases \
  --urlBase https://download.easyink.dev/render
```

生成 Host 多平台矩阵包、逐个校验 SHA256/size/executable，并输出 `release-index.json`：

```bash
node lib/EasyInk.Render/tools/render-release.mjs build-host-matrix \
  --platforms win-x64,linux-x64,linux-arm64,darwin-x64,darwin-arm64 \
  --version 0.1.0 \
  --outDir lib/EasyInk.Render/releases \
  --urlBase https://download.easyink.dev/render
```

生成 Browser Bundle 包和 browser manifest：

从 Chrome for Testing manifest 下载官方 `chrome-headless-shell` archive，并生成 browser manifest：

```bash
node lib/EasyInk.Render/tools/render-release.mjs download-browser \
  --platform linux-x64 \
  --version 148.0.7778.97 \
  --outDir lib/EasyInk.Render/releases
```

如果已经有本地解压后的浏览器目录，也可以重新打包成本项目的 Browser Bundle：

```bash
node lib/EasyInk.Render/tools/render-release.mjs build-browser \
  --platform linux-x64 \
  --version 148.0.7778.97 \
  --browserDir /path/to/chrome-for-testing \
  --browserExecutable headless-shell \
  --outDir lib/EasyInk.Render/releases
```

合并 Host manifest 和 Browser manifest：

```bash
node lib/EasyInk.Render/tools/render-release.mjs build-runtime \
  --platform linux-x64 \
  --hostManifest lib/EasyInk.Render/releases/host/0.1.0/linux-x64/runtime-manifest.linux-x64.json \
  --browserManifest lib/EasyInk.Render/releases/browser/148.0.7778.97/linux-x64/runtime-manifest.linux-x64.json \
  --outDir lib/EasyInk.Render/releases/runtime/0.1.0/linux-x64
```

校验已生成包与 manifest 的 SHA256/size 是否一致：

```bash
node lib/EasyInk.Render/tools/render-release.mjs verify-package \
  --manifest lib/EasyInk.Render/releases/host/0.1.0/linux-x64/runtime-manifest.linux-x64.json \
  --archive lib/EasyInk.Render/releases/host/0.1.0/linux-x64/easyink-render-host-0.1.0-linux-x64.tar.gz
```

校验会同时解压包并确认 manifest 指向的 executable 存在。校验 Browser Bundle 时添加 `--kind browser`。

对当前操作系统可执行的 Browser Bundle，还可以进一步解包并运行 `--version`，确认浏览器二进制能启动且版本匹配：

```bash
node lib/EasyInk.Render/tools/render-release.mjs verify-browser \
  --manifest lib/EasyInk.Render/releases/browser/148.0.7778.97/linux-x64/runtime-manifest.linux-x64.json \
  --archive lib/EasyInk.Render/releases/browser/148.0.7778.97/linux-x64/chrome-headless-shell-linux64.zip
```

Docker 环境下的 Browser Bundle 下载、manifest 校验和启动验证步骤见 [Browser Bundle Docker 验证教程](tutorials/browser-bundle-docker.md)。Host 发布包构建、archive 校验和 packaged Host 启动验证见 [Host Package Docker 打包验证教程](tutorials/host-package-docker.md)。

## Docker 验证

本机不需要安装 Go。使用 Docker 执行单元测试：

```bash
docker run --rm \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'export PATH=/usr/local/go/bin:$PATH; gofmt -w cmd internal && go test ./...'
```

执行真实浏览器集成测试：

```bash
docker run --rm \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'export PATH=/usr/local/go/bin:$PATH; go test -c ./internal/render -o /src/render.test'

docker run --rm --entrypoint sh \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  chromedp/headless-shell:latest \
  -lc 'EASYINK_RENDER_BROWSER_PATH=/headless-shell/headless-shell ./render.test -test.v'
```

启动 Host：

```bash
docker run --rm \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'export PATH=/usr/local/go/bin:$PATH; go build -o /src/easyink-render-host ./cmd/easyink-render-host'

docker run --rm --entrypoint sh \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  chromedp/headless-shell:latest \
  -lc './easyink-render-host --host 127.0.0.1 --port 18181 --browser-path /headless-shell/headless-shell --profile-root /tmp/easyink-profile --temp-dir /tmp/easyink-temp --log-dir /tmp/easyink-logs --max-concurrency 2 --max-queue-size 16 --auth-token test-token'
```

也可以直接构建 Host 镜像：

```bash
docker build -t easyink-render-host lib/EasyInk.Render/host
```
