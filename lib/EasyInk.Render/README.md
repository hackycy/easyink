# EasyInk.Render

`EasyInk.Render` 是 CLI-first PDF render runtime。主可执行文件是 `easyink-render`：默认通过本地 IPC 自动启动并复用 daemon/browser；需要 CI 或故障隔离时可使用 `render --no-daemon` 单进程渲染。

完整教程、架构说明、协议示例、跨平台构建测试和 Docker 验证步骤统一维护在 [docs/printing/render.md](../../docs/printing/render.md)。

## 当前实现

- CLI：`render`、`daemon`、`browser inspect`、`config`、`diagnostics show`、`version`。
- Daemon：Windows Named Pipe，macOS/Linux Unix Domain Socket；不监听 TCP 端口。
- 输入：`source.type=html`、`source.type=pdf`、`source.type=easyink`，继续复用 `protocol.PrintPDFRequest`。
- Browser：支持 `chrome-for-testing`、`chromium`、`chrome`、`edge`、`headless-shell`、`custom`。
- Diagnostics：按 `requestId` 记录浏览器信息、耗时、console error、网络失败、页数、PDF metadata、日志和可选附件。
- HTTP：不提供 HTTP 兼容入口，Render 主路径只保留 CLI/IPC daemon。

## 目录

```text
host/       Go CLI、daemon、IPC、render host 实现
protocol/   协议 fixture
manifests/  runtime manifest 示例
samples/    html/pdf/easyink 请求示例
tools/      发布包和 manifest 辅助脚本
```

## 常用命令

Docker 单元测试：

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc '/usr/local/go/bin/gofmt -w cmd internal && /usr/local/go/bin/go test ./...'
```

跨平台构建检查：

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'CGO_ENABLED=0 GOOS=linux GOARCH=amd64 /usr/local/go/bin/go build -trimpath -o /tmp/easyink-render ./cmd/easyink-render-host && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 /usr/local/go/bin/go build -trimpath -o /tmp/easyink-render.exe ./cmd/easyink-render-host'
```

真实浏览器渲染验证：

```bash
docker run --rm --platform linux/amd64 --entrypoint /bin/sh \
  -v "$PWD/lib/EasyInk.Render:/work" \
  -w /work \
  chromedp/headless-shell:latest \
  -lc './host/easyink-render render --no-daemon --request samples/html/request.json --out /tmp/out.pdf --browser-kind headless-shell --browser-path /headless-shell/headless-shell --profile-root /tmp/easyink-profile --temp-dir /tmp/easyink-temp --log-dir /tmp/easyink-logs --json && test -s /tmp/out.pdf'
```

发布工具：

```bash
pnpm render:manifest
pnpm render:release:test
pnpm render:host:docker -- --platforms all
```

Windows 手动构建发布 host 包时，可直接运行 `build-host.bat`。该脚本通过 Docker 中的 `golang:1.23-bookworm` 交叉编译，不要求本机安装 Go；默认只构建 `win-x64`，例如 `build-host.bat all` 会构建所有 host 平台，`build-host.bat 0.1.0 all` 可指定版本。

## 文档维护约定

Render 使用、架构、开发、发布和排错说明统一更新到 [docs/printing/render.md](../../docs/printing/render.md)。如果新增协议字段、CLI 命令、daemon IPC 方法、浏览器能力、runtime manifest 字段或发布命令，请同步更新该文档、OpenAPI、samples 和相关测试。
