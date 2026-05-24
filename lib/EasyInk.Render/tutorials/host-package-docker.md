# Host Package Docker 打包验证教程

这个教程用于验证“发布包形态”的 Host，而不是直接运行源码目录里的 `go run` 或测试二进制。

验证内容：

- 在 Docker 中构建 `easyink-render-host` Host archive。
- 生成 runtime manifest。
- 校验 Host archive 的 SHA256、size 和 executable。
- 下载并校验 Browser Bundle。
- 在 Docker 中解包 Host archive，用 Chrome for Testing 启动打包后的 Host。
- 调用 `/v1/health` 确认 packaged Host 能提供服务。

## 前置条件

- 本机已安装 Docker。
- 仓库根目录已有 `node_modules`，或者你愿意在容器内执行 `pnpm install --frozen-lockfile`。
- 下面示例验证 `linux-x64`，所以使用 `--platform linux/amd64`。
- Host 打包脚本同时需要 Node.js 和 Go。教程使用 `node:22-bookworm` 容器，并在容器内下载 Go tarball，避免依赖 apt 安装 Node。

如果要验证 `linux-arm64`，需要可用的 arm64 Linux runner 和对应 Browser Bundle。Chrome for Testing 不一定发布 `linux-arm64` 的 `chrome-headless-shell`。

## 1. 设置变量

在仓库根目录执行：

```bash
export EASYINK_RENDER_HOST_VERSION=0.1.0
export EASYINK_RENDER_BROWSER_VERSION=148.0.7778.97
export EASYINK_RENDER_PLATFORM=linux-x64
export EASYINK_RENDER_RELEASE_DIR=lib/EasyInk.Render/releases-package-docker
```

## 2. 构建 Host 发布包

```bash
docker run --rm --platform linux/amd64 \
  -e EASYINK_RENDER_HOST_VERSION \
  -e EASYINK_RENDER_PLATFORM \
  -e EASYINK_RENDER_RELEASE_DIR \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:22-bookworm \
  bash -lc '
    set -euo pipefail
    curl -fsSL https://go.dev/dl/go1.23.12.linux-amd64.tar.gz -o /tmp/go.tgz
    tar -C /usr/local -xzf /tmp/go.tgz
    export PATH=/usr/local/go/bin:$PATH
    cd lib/EasyInk.Render/host
    go mod download
    cd /workspace
    node lib/EasyInk.Render/tools/render-release.mjs build-host \
      --platform "$EASYINK_RENDER_PLATFORM" \
      --version "$EASYINK_RENDER_HOST_VERSION" \
      --outDir "$EASYINK_RENDER_RELEASE_DIR"
  '
```

输出目录形如：

```text
lib/EasyInk.Render/releases-package-docker/
  host/
    0.1.0/
      linux-x64/
        easyink-render-host
        easyink-render-host-0.1.0-linux-x64.tar.gz
        runtime-manifest.linux-x64.json
```

## 3. 校验 Host archive

```bash
docker run --rm --platform linux/amd64 \
  -e EASYINK_RENDER_HOST_VERSION \
  -e EASYINK_RENDER_PLATFORM \
  -e EASYINK_RENDER_RELEASE_DIR \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:22-bookworm \
  bash -lc '
    MANIFEST="$EASYINK_RENDER_RELEASE_DIR/host/$EASYINK_RENDER_HOST_VERSION/$EASYINK_RENDER_PLATFORM/runtime-manifest.$EASYINK_RENDER_PLATFORM.json"
    ARCHIVE="$EASYINK_RENDER_RELEASE_DIR/host/$EASYINK_RENDER_HOST_VERSION/$EASYINK_RENDER_PLATFORM/easyink-render-host-$EASYINK_RENDER_HOST_VERSION-$EASYINK_RENDER_PLATFORM.tar.gz"
    node lib/EasyInk.Render/tools/render-release.mjs verify-package \
      --kind host \
      --manifest "$MANIFEST" \
      --archive "$ARCHIVE"
  '
```

## 4. 下载并校验 Browser Bundle

```bash
docker run --rm --platform linux/amd64 \
  -e EASYINK_RENDER_BROWSER_VERSION \
  -e EASYINK_RENDER_PLATFORM \
  -e EASYINK_RENDER_RELEASE_DIR \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:22-bookworm \
  bash -lc '
    node lib/EasyInk.Render/tools/render-release.mjs download-browser \
      --platform "$EASYINK_RENDER_PLATFORM" \
      --version "$EASYINK_RENDER_BROWSER_VERSION" \
      --outDir "$EASYINK_RENDER_RELEASE_DIR"

    MANIFEST="$EASYINK_RENDER_RELEASE_DIR/browser/$EASYINK_RENDER_BROWSER_VERSION/$EASYINK_RENDER_PLATFORM/runtime-manifest.$EASYINK_RENDER_PLATFORM.json"
    ARCHIVE=$(find "$EASYINK_RENDER_RELEASE_DIR/browser/$EASYINK_RENDER_BROWSER_VERSION/$EASYINK_RENDER_PLATFORM" -maxdepth 1 \( -name "*.zip" -o -name "*.tar.gz" \) | head -n 1)
    node lib/EasyInk.Render/tools/render-release.mjs verify-package \
      --kind browser \
      --manifest "$MANIFEST" \
      --archive "$ARCHIVE"
  '
```

## 5. 启动 packaged Host 并调用 health

这一步使用 `chromedp/headless-shell` 镜像提供浏览器，解包 Host archive 后启动真正的发布二进制。

```bash
docker run --rm --platform linux/amd64 --entrypoint bash \
  -e EASYINK_RENDER_HOST_VERSION \
  -e EASYINK_RENDER_PLATFORM \
  -e EASYINK_RENDER_RELEASE_DIR \
  -v "$PWD:/workspace" \
  -w /workspace \
  chromedp/headless-shell:latest \
  -lc '
    set -euo pipefail
    WORK=/tmp/easyink-render-package-test
    rm -rf "$WORK"
    mkdir -p "$WORK"
    ARCHIVE="$EASYINK_RENDER_RELEASE_DIR/host/$EASYINK_RENDER_HOST_VERSION/$EASYINK_RENDER_PLATFORM/easyink-render-host-$EASYINK_RENDER_HOST_VERSION-$EASYINK_RENDER_PLATFORM.tar.gz"
    tar -xzf "$ARCHIVE" -C "$WORK"
    chmod +x "$WORK/easyink-render-host"
    "$WORK/easyink-render-host" \
      --host 127.0.0.1 \
      --port 18181 \
      --browser-path /headless-shell/headless-shell \
      --profile-root /tmp/easyink-profile \
      --temp-dir /tmp/easyink-temp \
      --log-dir /tmp/easyink-logs \
      --max-concurrency 1 \
      --max-queue-size 1 \
      --request-timeout-ms 10000 \
      --auth-token test-token &
    HOST_PID=$!
    trap "kill $HOST_PID 2>/dev/null || true" EXIT
    for i in $(seq 1 30); do
      if exec 3<>/dev/tcp/127.0.0.1/18181; then
        printf "GET /v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer test-token\r\nConnection: close\r\n\r\n" >&3
        cat <&3 > "$WORK/health.http" || true
        if grep -q "\"status\":\"ok\"" "$WORK/health.http"; then
          cat "$WORK/health.http"
          exec 3<&-
          exec 3>&-
          exit 0
        fi
        exec 3<&-
        exec 3>&-
      fi
      if [ -f "$WORK/health.http" ] && grep -q "\"status\":\"ok\"" "$WORK/health.http"; then
        cat "$WORK/health.http"
        exit 0
      fi
      sleep 1
    done
    echo "packaged host did not become healthy" >&2
    exit 1
  '
```

成功时会看到 JSON，包含：

```json
{
  "status": "ok",
  "browser": {
    "status": "ready"
  }
}
```

## 6. 清理产物

```bash
rm -rf lib/EasyInk.Render/releases-package-docker
```

## 可选：构建全部 Host 平台包

这一步只验证 archive/manifest，不会在当前 Docker 中启动非 Linux 包：

```bash
docker run --rm --platform linux/amd64 \
  -e EASYINK_RENDER_HOST_VERSION \
  -e EASYINK_RENDER_RELEASE_DIR \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:22-bookworm \
  bash -lc '
    set -euo pipefail
    curl -fsSL https://go.dev/dl/go1.23.12.linux-amd64.tar.gz -o /tmp/go.tgz
    tar -C /usr/local -xzf /tmp/go.tgz
    export PATH=/usr/local/go/bin:$PATH
    node lib/EasyInk.Render/tools/render-release.mjs build-host-matrix \
      --platforms win-x64,linux-x64,linux-arm64,darwin-x64,darwin-arm64 \
      --version "$EASYINK_RENDER_HOST_VERSION" \
      --outDir "$EASYINK_RENDER_RELEASE_DIR"
  '
```

非 Linux 平台的真实启动验证应放到 Windows/macOS CI runner 中执行。
