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
- `profileRoot`
- `tempDir`
- `logDir`
- `maxConcurrency`
- `maxQueueSize`
- `requestTimeoutMs`
- `idleTimeoutMs`

如果命令行同时传了 `--browser-kind` 这类参数，它会覆盖配置文件里的值。

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

默认策略会阻断私网、localhost、link-local、非 `http/https` 协议等外链资源。浏览器运行时也会禁用代理环境变量，并使用独立的 profile/context。

关于 Render，目前知道这些就够用了。如果你的下一步是把 PDF 送到打印机，回到 [打印方案](/printing/) 选择 EasyInk Printer 或 HiPrint。
