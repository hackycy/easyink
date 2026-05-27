---
description: EasyInk.Render CLI 渲染运行时：将 Schema 输入稳定转换为 PDF，不涉及打印机枚举和物理打印任务。
---

# EasyInk.Render CLI 渲染运行时

`EasyInk.Render` 解决的是“把输入稳定变成 PDF”这件事。

它不枚举打印机，也不提交物理打印任务。你可以把它理解成打印链路前面的渲染引擎。

## 工作方式

```text
easyink-render render
  -> 本地 daemon 或当前进程
  -> 浏览器渲染
  -> 输出 PDF 和 diagnostics
```

当前主入口是 `easyink-render` 命令。默认模式会自动发现或拉起本机 daemon；如果你想做一次性隔离执行，也可以加 `--no-daemon`。

## 基本命令

```bash
easyink-render render \
  --request lib/EasyInk.Render/samples/html/request.json \
  --out out.pdf \
  --json
```

如果这是第一次运行，CLI 会先把渲染环境准备好。成功之后，你会拿到 PDF 文件和稳定的 JSON 输出。

## `--no-daemon` 使用时机

当你在 CI、隔离环境或临时调试里不想复用常驻 daemon 时，直接这样跑：

```bash
easyink-render render \
  --no-daemon \
  --request lib/EasyInk.Render/samples/html/request.json \
  --out out.pdf
```

如果你只是日常本机开发，默认 daemon 模式通常更省资源也更快。

## Daemon 管理

```bash
easyink-render daemon start
easyink-render daemon status
easyink-render daemon stop
easyink-render daemon restart
```

这组命令足够你完成大多数本地排查。

## Browser 检查

```bash
easyink-render browser inspect \
  --browser-kind headless-shell \
  --browser-path /path/to/headless-shell
```

当你怀疑渲染环境本身有问题，这条命令会比盲猜快很多。

## 常用命令

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

如果你不是在做内部调试，日常最常用的还是 `render`、`daemon status` 和 `diagnostics show`。

## 配置优先级

```text
CLI flags > environment variables > config file > defaults
```

这条规则基本决定了你排查配置问题时该先看哪里。

## Diagnostics 查看

Render 会把诊断结果落盘。最常用的查看方式是：

```bash
easyink-render diagnostics show diagnostics.json
```

如果你在渲染命令里显式指定输出位置，也可以直接把 diagnostics 收到固定文件里：

```bash
easyink-render render \
  --request request.json \
  --out out.pdf \
  --diagnostics-out diagnostics.json
```

## 使用场景

如果你的目标是下面这些之一，就该先看 Render，而不是先看打印机集成：

- 把 HTML 变成 PDF
- 把 EasyInk schema + data 变成 PDF
- 在 CI 或服务端批量生成 PDF
- 排查浏览器渲染和 PDF 输出问题

如果你的目标是“怎么把 PDF 送去本地打印机”，那就回到 [打印方案概述](/printing/) 或具体打印集成章节。
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
