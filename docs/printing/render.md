# EasyInk.Render CLI 渲染运行时

`EasyInk.Render` 是 CLI-first 的 PDF render runtime。主入口是 `easyink-render` 命令：默认自动发现或启动本机 daemon，通过本地 IPC 复用浏览器进程完成渲染；需要隔离或 CI 简化时，可以用 `--no-daemon` 在当前进程内完成一次渲染。

Render 仍只负责把 HTML、PDF、EasyInk schema + data 归一为可打印 PDF，不枚举打印机、不提交物理打印任务。EasyInk Printer 或其他宿主应把 Render 输出的 PDF 当作打印输入。

## 一句话架构

```text
easyink-render render
  -> local daemon over IPC
  -> Browser Manager
  -> render.Service.RenderPrintPDF
  -> PDF + diagnostics + stable CLI result
```

默认路径不需要端口、HTTP endpoint 或 auth token。Render 不再提供 HTTP 兼容入口，功能、文档和发布主路径都以 CLI/IPC daemon 为准。

| 组件 | 职责 |
| --- | --- |
| CLI | 解析命令、加载配置、输出稳定 JSON/text、归一退出码。 |
| Daemon | 本机 IPC 常驻运行时，缓存 Browser Manager，处理队列和状态；默认不空闲退出，可配置 idle timeout。 |
| IPC | Windows 使用 Named Pipe，macOS/Linux 使用 Unix Domain Socket，frame 为长度前缀 JSON header + 可选二进制 payload。 |
| Browser | 支持 `chrome-for-testing`、`chromium`、`chrome`、`edge`、`headless-shell`、`custom`。 |
| Render Core | 复用 `protocol.PrintPDFRequest` 和 `render.Service.RenderPrintPDF`。 |
| Diagnostics | 每次渲染落盘 `diagnostics.json`、`render.log`，按需写 snapshot/screenshot。 |

## 快速跑通

### 下载预构建包

如果只是使用 Render CLI，不需要本机安装 Go。前往 [EasyInk Releases](https://github.com/hackycy/easyink/releases)，选择 `app-v*` 开头的应用发布版本，在该版本的 Release assets 中按平台下载：

| 平台 | 产物 |
| --- | --- |
| Windows x64 | `easyink-render-*-win-x64.zip` |
| Windows x86 | `easyink-render-*-win-x86.zip` |
| Linux x64 | `easyink-render-*-linux-x64.tar.gz` |
| Linux arm64 | `easyink-render-*-linux-arm64.tar.gz` |
| macOS x64 | `easyink-render-*-darwin-x64.tar.gz` |
| macOS arm64 | `easyink-render-*-darwin-arm64.tar.gz` |

同一个 Release 还会提供 `runtime-manifest.<platform>.json` 和 `easyink-render-host-release-index-*.json`，用于校验、自动下载或宿主集成。

Windows 解压后可直接运行：

```powershell
.\easyink-render.exe version
```

macOS/Linux 解压后先确认可执行权限：

```bash
tar -xzf easyink-render-*-linux-x64.tar.gz
chmod +x easyink-render
./easyink-render version
```

### 构建

推荐在 Docker 内构建和测试，避免本机 Go 版本差异：

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc '/usr/local/go/bin/gofmt -w cmd internal && /usr/local/go/bin/go test ./...'
```

Linux 二进制：

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'CGO_ENABLED=0 GOOS=linux GOARCH=amd64 /usr/local/go/bin/go build -trimpath -o easyink-render ./cmd/easyink-render-host'
```

Windows x64 二进制：

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'CGO_ENABLED=0 GOOS=windows GOARCH=amd64 /usr/local/go/bin/go build -trimpath -o easyink-render.exe ./cmd/easyink-render-host'
```

macOS 本地构建：

```bash
cd lib/EasyInk.Render/host
go test ./...
go build -trimpath -o easyink-render ./cmd/easyink-render-host
```

### 单次渲染

默认 daemon 模式：

```bash
easyink-render render \
  --request lib/EasyInk.Render/samples/html/request.json \
  --out out.pdf \
  --browser-kind headless-shell \
  --browser-path /path/to/headless-shell \
  --json
```

行为：

- 第一次运行会启动本机 daemon。
- 后续配置兼容的 render 命令复用同一个 daemon 和浏览器进程。
- PDF 写入 `--out`。
- `--json` 输出稳定机器可读结果。

单进程隔离模式：

```bash
easyink-render render \
  --no-daemon \
  --request lib/EasyInk.Render/samples/html/request.json \
  --out out.pdf \
  --browser-kind chromium \
  --browser-path /path/to/chromium
```

PDF 输入不需要浏览器：

```bash
easyink-render render \
  --no-daemon \
  --request lib/EasyInk.Render/samples/pdf/request.json \
  --out normalized.pdf
```

### Daemon 管理

```bash
easyink-render daemon start
easyink-render daemon status
easyink-render daemon stop
easyink-render daemon restart
```

`daemon status` 输出 pid、IPC endpoint、browser kind/name/version、queue、uptime、host/protocol version。`daemon stop` 会关闭 daemon 和浏览器进程。

Daemon 启动有两层本地互斥：`daemon.start.lock` 只保护并发自动启动的临界区，`daemon.process.lock` 由实际 daemon 进程持有到退出，用于阻止外部重复执行内部 `daemon run`。锁文件会记录持有进程 PID；如果进程已不存在，会在下一次启动时自动清理。macOS/Linux 上 IPC socket 只会在确认不是活连接后才清理，避免重复启动误删已有 daemon 的入口。

## 命令

```text
easyink-render render
easyink-render daemon start
easyink-render daemon run
easyink-render daemon stop
easyink-render daemon restart
easyink-render daemon status
easyink-render browser inspect
easyink-render config get
easyink-render config set
easyink-render diagnostics show
easyink-render version
```

`daemon run` 是 CLI 自动启动 daemon 的内部命令，普通用户通常不需要直接调用。

## 配置

优先级：

```text
CLI flags > environment variables > config file > defaults
```

配置文件路径：

| 平台 | 路径 |
| --- | --- |
| Windows | `%AppData%\EasyInk.Render\config.json` |
| macOS/Linux | `~/.config/easyink-render/config.json` |

状态文件路径：

| 平台 | 路径 |
| --- | --- |
| Windows | `%LocalAppData%\EasyInk.Render\daemon.json` |
| macOS/Linux | `~/.easyink-render/daemon.json` |

IPC endpoint：

| 平台 | Transport | 默认 endpoint |
| --- | --- | --- |
| Windows | Named Pipe | `\\.\pipe\easyink-render-default` |
| macOS/Linux | Unix Domain Socket | `$XDG_RUNTIME_DIR/easyink-render/daemon.sock` 或 `~/.easyink-render/run/daemon.sock` |

常用环境变量：

```text
EASYINK_RENDER_BROWSER_KIND
EASYINK_RENDER_BROWSER_PATH
EASYINK_RENDER_PROFILE_ROOT
EASYINK_RENDER_TEMP_DIR
EASYINK_RENDER_LOG_DIR
EASYINK_RENDER_IDLE_TIMEOUT_MS
```

配置示例：

```bash
easyink-render config set browser.kind chromium
easyink-render config set browser.path /path/to/chromium
easyink-render config set browser.headlessMode auto
easyink-render config get
```

## Browser 检查

```bash
easyink-render browser inspect \
  --browser-kind headless-shell \
  --browser-path /path/to/headless-shell
```

输出示例：

```json
{
  "kind": "headless-shell",
  "name": "chrome",
  "version": "148.0.7778.97",
  "headless": true,
  "cdp": true,
  "printToPDF": true
}
```

## Diagnostics

默认落盘：

```text
<logDir>/diagnostics/<diagnostics-id>/diagnostics.json
<logDir>/diagnostics/<diagnostics-id>/render.log
```

请求里启用附件后还会写：

```text
<logDir>/diagnostics/<diagnostics-id>/snapshot.html
<logDir>/diagnostics/<diagnostics-id>/screenshot.png
```

把最终 diagnostics 额外写到指定位置：

```bash
easyink-render render \
  --request request.json \
  --out out.pdf \
  --diagnostics-out diagnostics.json
```

查看 diagnostics：

```bash
easyink-render diagnostics show diagnostics.json
easyink-render diagnostics show diag-1779633993491225802
```

## 输出和退出码

成功文本输出：

```text
Rendered out.pdf pages=1 diagnostics=/path/to/diagnostics.json
```

成功 JSON：

```json
{
  "success": true,
  "requestId": "sample-html-001",
  "out": "out.pdf",
  "pageCount": 1,
  "diagnosticsPath": "/path/to/diagnostics.json"
}
```

退出码：

| Code | 含义 |
| --- | --- |
| 0 | success |
| 1 | general failure |
| 2 | invalid CLI arguments |
| 3 | invalid request JSON |
| 4 | daemon unavailable or startup failed |
| 5 | daemon protocol error |
| 6 | render failed |
| 7 | output write failed |
| 8 | timeout |
| 9 | browser unavailable |

## Render Protocol

CLI 和 daemon 继续复用 `protocol.PrintPDFRequest`。这意味着现有 samples、fixtures、OpenAPI 字段和渲染核心可以继续继承：

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

支持输入：

- `source.type=html`：加载 HTML，等待 `load`、`selector`、`easyinkReady` 或 `networkIdle` 后调用 `Page.printToPDF`。
- `source.type=pdf`：校验并归一 PDF bytes，读取页数和 metadata，不启动浏览器。
- `source.type=easyink`：使用内嵌 EasyInk Runtime 把 schema + data 渲染成 HTML，再进入 HTML pipeline。

安全边界保持不变：外链资源通过 allowlist 校验，默认阻断私网、localhost、link-local、非 http/https 协议；浏览器禁用代理环境变量并使用独立 profile/context。

## Docker 验证

单进程真实浏览器渲染：

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'CGO_ENABLED=0 GOOS=linux GOARCH=amd64 /usr/local/go/bin/go build -trimpath -o /src/easyink-render ./cmd/easyink-render-host'

docker run --rm --platform linux/amd64 --entrypoint /bin/sh \
  -v "$PWD/lib/EasyInk.Render:/work" \
  -w /work \
  chromedp/headless-shell:latest \
  -lc './host/easyink-render render --no-daemon --request samples/html/request.json --out /tmp/out.pdf --browser-kind headless-shell --browser-path /headless-shell/headless-shell --profile-root /tmp/easyink-profile --temp-dir /tmp/easyink-temp --log-dir /tmp/easyink-logs --json && test -s /tmp/out.pdf'
```

Daemon 自动启动和复用：

```bash
docker run --rm --platform linux/amd64 --entrypoint /bin/sh \
  -v "$PWD/lib/EasyInk.Render:/work" \
  -w /work \
  chromedp/headless-shell:latest \
  -lc 'set -e; ./host/easyink-render render --request samples/html/request.json --out /tmp/out1.pdf --browser-kind headless-shell --browser-path /headless-shell/headless-shell --profile-root /tmp/easyink-profile --temp-dir /tmp/easyink-temp --log-dir /tmp/easyink-logs --idle-timeout-ms 60000 --json; ./host/easyink-render render --request samples/html/request.json --out /tmp/out2.pdf --browser-kind headless-shell --browser-path /headless-shell/headless-shell --profile-root /tmp/easyink-profile --temp-dir /tmp/easyink-temp --log-dir /tmp/easyink-logs --idle-timeout-ms 60000 --json; ./host/easyink-render daemon status; ./host/easyink-render daemon stop; test -s /tmp/out1.pdf; test -s /tmp/out2.pdf'
```

## 发布

Host package 的发布可执行文件名为 `easyink-render`，Windows 为 `easyink-render.exe`。发布工具仍从 Go 包路径 `./cmd/easyink-render-host` 构建，输出物和 manifest 使用新的 CLI 名称。

```bash
pnpm render:manifest
pnpm render:release:test
pnpm render:host:docker -- --platforms all
```

Windows 手动发布可运行 `lib\EasyInk.Render\build-host.bat`。该脚本使用 Docker 内的 `golang:1.23-bookworm` 交叉编译 host 包，不依赖本机 Go 环境；默认构建 `win-x64,win-x86`，传入 `all` 可构建全部平台，例如 `lib\EasyInk.Render\build-host.bat all`，也可用 `lib\EasyInk.Render\build-host.bat 0.1.0 all` 指定版本。

`runtime-manifest` 继续描述 host、browser、EasyInk Runtime、平台、版本、下载地址、SHA256 和协议兼容性。新增平台或浏览器包时，需要同步更新 manifest、release tests 和本文档。
