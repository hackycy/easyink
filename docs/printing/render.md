---
description: EasyInk.Render CLI 渲染运行时：将 HTML、PDF 或 EasyInk Schema 输入转换为 PDF，不涉及打印机枚举和物理打印任务。
---

# Render PDF 渲染 {#render}

`EasyInk.Render` 只做一件事：把输入稳定变成 PDF。

先跑一个最小命令：

```bash
easyink-render render \
  --request lib/EasyInk.Render/samples/html/request.json \
  --out out.pdf \
  --json
```

成功后你会拿到 `out.pdf`。如果加了 `--json`，标准输出会给出 `success`、`requestId`、`pageCount` 和 diagnostics 路径。

## 请求格式 {#request-format}

Render 读取的是一个 JSON 请求文件。最小 HTML 请求长这样：

```json
{
  "requestId": "html-001",
  "source": {
    "type": "html",
    "html": "<!doctype html><html><body><main class=\"ready\">Hello</main></body></html>"
  },
  "wait": {
    "selector": ".ready",
    "timeoutMs": 5000
  },
  "pdf": {
    "printBackground": true
  }
}
```

这段请求会加载 HTML，等待 `.ready` 出现，再调用浏览器的 PDF 输出能力。`wait.timeoutMs` 没传时，HTML 渲染内部默认等待 30000 ms。

## 输入类型 {#source-types}

当前实现支持三种 `source.type`：

```json
{
  "source": {
    "type": "easyink",
    "schema": {
      "version": "1.0.0",
      "unit": "mm",
      "page": { "mode": "fixed", "width": 80, "height": 120 },
      "guides": { "x": [], "y": [] },
      "elements": []
    },
    "data": {
      "receipt": { "no": "R-001" }
    }
  }
}
```

- `html`：加载 `source.html`，按 `wait` 条件等待后输出 PDF。
- `pdf`：校验并归一 `source.pdfBase64`，读取页数和 metadata，不启动浏览器。
- `easyink`：用内嵌 EasyInk Viewer runtime 把 `schema + data` 渲染成 HTML，再进入 HTML pipeline。

`easyink` 输入会自动补默认等待条件：`wait.until` 为 `easyinkReady`，`wait.selector` 为 `.easyink-ready`。如果你显式传入 `wait`，就以你的配置为准。

连续纸在 Render 路径里按 Viewer 实际渲染高度生成 PDF。也就是说，输出纸高来自渲染完成后的页面尺寸，而不是 schema 的初始 `page.height`，更不是交给浏览器打印驱动决定。

如果你直接提交 HTML，并且 HTML 里已经写了 `@page`，可以让 Render 使用这份 CSS 纸张尺寸：

```json
{
  "source": {
    "type": "html",
    "html": "<!doctype html><html><head><style>@page { size: 80mm 180mm; margin: 0; }</style></head><body><main class=\"ready\">Hello</main></body></html>"
  },
  "wait": { "selector": ".ready" },
  "pdf": {
    "preferCSSPageSize": true,
    "printBackground": true
  }
}
```

`easyink` 输入会自动启用这个行为。内嵌 Viewer runtime 会在渲染完成后写入实际 `@page` 尺寸，Render 再按这份 CSS 输出 PDF。

内嵌 runtime 由根级 `internal-packages/viewer-runtime` 构建。该内部包通过 pnpm workspace 引入 `@easyink/viewer`，输出 `index.html`、`viewer.js` 和 `viewer.css` 到 Go host 的 embed 目录，避免 Render 侧维护另一套 EasyInk 渲染实现。

这些输出文件是构建产物，不提交到 Git。你需要本地跑 Go 测试或直接构建 Docker image 时，先执行：

```bash
pnpm render:runtime
```

CI、`pnpm render:manifest`、`pnpm render:host:docker` 和 `build-host.sh` 都会先生成这组文件。

## 配置文件 {#config-files}

Render 会用到几类 JSON 文件。我们先看最常改的请求文件：

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
    "printBackground": true
  }
}
```

`samples/*/request.json` 是给 `easyink-render render --request` 读取的输入样例。你调服务渲染时，通常复制这类文件，然后改 `source`、`wait`、`pdf`、`security` 和 `output`。

发布包还有一个 manifest：

```json
{
  "host": {
    "version": "0.1.0",
    "platform": "linux-arm64",
    "executable": "easyink-render"
  },
  "browser": {
    "name": "chrome-for-testing",
    "version": "148.0.7778.97"
  },
  "easyinkRuntime": {
    "bundled": true,
    "entry": "runtime/easyink-viewer/index.html"
  }
}
```

`manifests/runtime-manifest.sample.json` 是发布 manifest 模板。构建 host 包时，发布工具会把目标平台、包大小、sha256 和下载地址写进生成的 `runtime-manifest.<platform>.json`。客户端用它判断该下载哪个 Render host、哪个浏览器包，以及内嵌 EasyInk runtime 的入口在哪里。

仓库里还有一组 protocol fixtures：

```text
lib/EasyInk.Render/protocol/fixtures/
```

这些文件用于协议测试，覆盖 `html`、`pdf`、`easyink` 三种输入形态。它们不是运行时默认配置；如果你改了请求协议字段，要同步更新 fixtures 和文档，避免测试只验证旧协议。

运行时配置不是仓库文件，而是用户机器上的 `config.json`。可以用命令查看：

```bash
easyink-render config get
easyink-render config set browser.path /path/to/headless-shell
```

Linux/macOS 默认写到 `~/.config/easyink-render/config.json`，Windows 默认写到 `%APPDATA%\EasyInk.Render\config.json`。它保存浏览器路径、profile/temp/log 目录、并发数、队列长度、超时配置和浏览器 sandbox 开关。

## 手动构建 {#manual-build}

本机手动构建 Render host 发布包时，优先使用 Docker 脚本：

```bash
./lib/EasyInk.Render/build-host.sh all
./lib/EasyInk.Render/build-host.sh 0.1.0 linux-x64,darwin-arm64
```

Windows 使用：

```bat
lib\EasyInk.Render\build-host.bat all
lib\EasyInk.Render\build-host.bat 0.1.0 win-x64,win-x86
```

脚本会先执行 `pnpm render:runtime` 和 `pnpm render:manifest`，再通过 Docker 构建 host 包。GitHub Actions 的 `Build EasyInk.Render` workflow 也支持手动触发，可指定 platforms、url_base、docker_image，并可选择是否执行 Docker image smoke test。

## 一次性渲染 {#no-daemon}

默认 `render` 会自动发现或拉起本机 daemon。CI、隔离环境或临时调试时，可以改成当前进程一次性执行：

```bash
easyink-render render \
  --no-daemon \
  --request lib/EasyInk.Render/samples/html/request.json \
  --out out.pdf
```

`--no-daemon` 仍然会按输入类型决定是否需要浏览器。`source.type=pdf` 不需要浏览器；`html` 和 `easyink` 需要可用的浏览器运行时。

## Daemon 管理 {#daemon}

日常本机开发通常直接用默认 daemon。你需要排查常驻进程时，再用这些命令：

```bash
easyink-render daemon start
easyink-render daemon status
easyink-render daemon stop
easyink-render daemon restart
```

`daemon status` 会输出 JSON。它适合确认 daemon 是否正在运行、当前使用的 IPC 和运行时状态。

## 浏览器检查 {#browser-inspect}

怀疑浏览器路径、headless 模式或启动参数有问题时，先跑 inspect：

```bash
easyink-render browser inspect \
  --browser-kind headless-shell \
  --browser-path /path/to/headless-shell
```

如果这一步失败，先修浏览器配置。继续调模板通常只会得到更长的错误链。

## 配置优先级 {#config-priority}

Render 配置按这个顺序合并：

```text
CLI flags > environment variables > config file > defaults
```

你可以直接读写配置：

```bash
easyink-render config get
easyink-render config get browser.kind
easyink-render config set maxConcurrency 2
```

当前可读写的 key 包括：

- `browser.kind`
- `browser.path`
- `browser.headlessMode`
- `browser.disableSandbox`
- `profileRoot`
- `tempDir`
- `logDir`
- `maxConcurrency`
- `maxQueueSize`
- `requestTimeoutMs`
- `idleTimeoutMs`

如果命令行同时传了 `--browser-kind` 这类参数，它会覆盖配置文件里的值。默认会保留浏览器 sandbox；只有在容器 root 用户或浏览器运行时明确要求时，才设置 `browser.disableSandbox=true`、环境变量 `EASYINK_RENDER_DISABLE_SANDBOX=true`，或在命令行传 `--disable-sandbox`。

## Diagnostics {#diagnostics}

Render 会把诊断信息写到日志目录。你也可以把这次渲染的 diagnostics 固定到一个文件：

```bash
easyink-render render \
  --request request.json \
  --out out.pdf \
  --diagnostics-out diagnostics.json
```

查看 diagnostics：

```bash
easyink-render diagnostics show diagnostics.json
```

如果你传的是 diagnostics id，而不是文件路径，CLI 会从默认日志目录里找对应的 `diagnostics.json`。

## 安全边界 {#security}

HTML 和 EasyInk 输入会经过资源安全校验。

```json
{
  "security": {
    "allowedOrigins": ["https://cdn.example.com"],
    "allowFileAccess": false,
    "maxInputBytes": 52428800
  }
}
```

默认策略会阻断私网、localhost、link-local、非 `http/https` 协议等外链资源。浏览器运行时也会禁用代理环境变量，并使用独立的 profile/context。IPC daemon 请求必须带状态文件中的 nonce，单个 IPC payload 和 request JSON 会被限制在 128 MiB 内；PDF 与离线资源还会受 `security.maxInputBytes` 限制。Diagnostics 默认以当前用户私有权限写入，且不会把 `data:` 页面地址原文写入 `finalUrl`。

关于 Render，目前知道这些就够用了。如果你的下一步是把 PDF 送到打印机，回到 [打印方案](/printing/) 选择 EasyInk Printer 或 HiPrint。
