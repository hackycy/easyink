# EasyInk.Render

`EasyInk.Render` 是 EasyInk 的服务端 PDF 渲染 Runtime。它交付独立可执行文件 `easyink-render-host`，把 HTML、PDF、EasyInk schema + data 三类输入统一归一为可打印 PDF，并返回受控 diagnostics。

完整教程、架构说明、协议示例、开发流程和 Docker 验证步骤统一维护在 [docs/printing/render.md](../../docs/printing/render.md)。源码目录下只保留这个入口，避免设计文档和教程散落多处。

## 当前实现

- Host 使用 Go、`net/http`、chromedp/cdproto 和 Chrome for Testing。
- API：`GET /v1/info`、`GET /v1/health`、`POST /v1/render/print-pdf`。
- 输入：`source.type=html`、`source.type=pdf`、`source.type=easyink`。
- 输出：默认 `application/pdf`；调试时支持 `output.type=base64Json`。
- 安全：loopback HTTP、Bearer token、每请求 browser context、资源 allowlist、私网地址拦截、direct proxy。
- 诊断：按 `requestId` 聚合耗时、console error、网络失败、页数、PDF metadata、日志和可选附件。

## 目录

```text
host/       Go Render Host 实现
protocol/   OpenAPI 描述和协议 fixture
manifests/  runtime manifest 示例
samples/    html/pdf/easyink 请求示例
tools/      发布包和 manifest 辅助脚本
```

## 常用命令

```bash
docker run --rm \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -c 'set -e; go test ./...; CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o easyink-render-host.exe ./cmd/easyink-render-host'
```

```bash
pnpm render:manifest
pnpm render:release:test
```

Docker 单元测试：

```bash
docker run --rm \
  -v "$PWD/lib/EasyInk.Render/host:/src" \
  -w /src \
  golang:1.23-bookworm \
  sh -lc 'gofmt -w cmd internal && go test ./...'
```

## 文档维护约定

Render 使用、架构、开发、发布和排错说明统一更新到 [docs/printing/render.md](../../docs/printing/render.md)。如果新增协议字段、source pipeline、Runtime 能力或发布命令，请同步更新该文档、OpenAPI、samples 和相关测试。
