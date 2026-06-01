# EasyInk.Render

`EasyInk.Render` 是 CLI-first PDF render runtime。主可执行文件是 `easyink-render`：默认通过本地 IPC 自动启动并复用 daemon/browser；需要 CI 或故障隔离时可使用 `render --no-daemon` 单进程渲染。

完整教程、架构说明、协议示例、跨平台构建测试和 Docker 验证步骤统一维护在 [docs/printing/render.md](../../docs/printing/render.md)。

## 当前实现

- CLI：`render`、`daemon`、`browser inspect`、`config`、`diagnostics show`、`version`。
- Daemon：Windows Named Pipe，macOS/Linux Unix Domain Socket；不监听 TCP 端口。
- 输入：`source.type=html`、`source.type=pdf`、`source.type=easyink`，继续复用 `protocol.PrintPDFRequest`。
- Browser：渲染架构只支持 Chromium；浏览器二进制需支持 Chromium/Chrome DevTools Protocol，最低 Chromium 80。
- Diagnostics：按 `requestId` 记录浏览器信息、耗时、console error、网络失败、页数、PDF metadata、日志和可选附件。
- Runtime：Render 主路径为 CLI/IPC daemon。

## 目录

```text
host/       Go CLI、daemon、IPC、render host 实现
protocol/   协议 fixture
manifests/  runtime manifest 示例
samples/    html/pdf/easyink 请求示例
tools/      发布包和 manifest 辅助脚本
```

Render 专用的 pnpm 内部包位于仓库根级 `internal-packages/viewer-runtime`，和 `packages/` 平级。该包会把 `@easyink/viewer` 打包成 host 可 embed 的 HTML runtime。

生成的 runtime bundle 会放到 `host/internal/easyink/runtime/easyink-viewer/`，该目录是构建产物，不提交到 Git。运行 Go 测试、Docker image build 或 host 发布包构建前，先执行 `pnpm render:runtime`；`pnpm render:manifest`、`pnpm render:host:docker`、`build-host.sh` 和 CI 会自动完成这一步。

## 常用命令

Docker 单元测试：

```bash
pnpm render:runtime
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
  sh -lc 'CGO_ENABLED=0 GOOS=linux GOARCH=amd64 /usr/local/go/bin/go build -trimpath -o /tmp/easyink-render ./cmd/easyink-render && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 /usr/local/go/bin/go build -trimpath -o /tmp/easyink-render.exe ./cmd/easyink-render'
```

真实浏览器渲染验证：

```bash
docker run --rm --platform linux/amd64 --entrypoint /bin/sh \
  -v "$PWD/lib/EasyInk.Render:/work" \
  -w /work \
  mcr.microsoft.com/playwright:v1.57.0-noble \
  -lc 'BROWSER_PATH="$(find /ms-playwright -path "*/chrome-linux*/chrome" -type f | head -n 1)" && ./host/easyink-render render --no-daemon --request samples/html/request.json --out /tmp/out.pdf --browser-path "$BROWSER_PATH" --disable-sandbox --profile-root /tmp/easyink-profile --temp-dir /tmp/easyink-temp --log-dir /tmp/easyink-logs --json && test -s /tmp/out.pdf'
```

发布工具：

```bash
pnpm render:runtime
pnpm render:manifest
pnpm render:release:test
pnpm render:host:docker -- --platforms all
```

手动构建 host 发布包：

```bash
./lib/EasyInk.Render/build-host.sh all
./lib/EasyInk.Render/build-host.sh 0.1.0 linux-x64,darwin-arm64
```

Windows 可继续使用 `build-host.bat`，参数顺序相同。两个脚本都会先构建 `internal-packages/viewer-runtime` 并校验 manifest，再通过 Docker 构建 host 包。

Docker 构建测试：

```bash
docker build --platform linux/amd64 \
  -t easyink-render:test \
  -f lib/EasyInk.Render/host/Dockerfile \
  lib/EasyInk.Render/host
docker run --rm easyink-render:test version
```

Windows 手动构建发布 host 包时，可直接运行 `build-host.bat`。该脚本通过 Docker 中的 `golang:1.23-bookworm` 交叉编译，不要求本机安装 Go；默认构建 `win-x64,win-x86`，例如 `build-host.bat all` 会构建所有 host 平台，`build-host.bat 0.1.0 all` 可指定版本。

## 文档维护约定

Render 使用、架构、开发、发布和排错说明统一更新到 [docs/printing/render.md](../../docs/printing/render.md)。如果新增协议字段、CLI 命令、daemon IPC 方法、浏览器能力、runtime manifest 字段或发布命令，请同步更新该文档、OpenAPI、samples 和相关测试。
