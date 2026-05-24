# Browser Bundle Docker 验证教程

这个教程用于在不污染本机 Node/Go 环境的情况下，用 Docker 下载并验证 Chrome for Testing Browser Bundle。

验证内容：

- 从 Chrome for Testing 官方 manifest 下载指定版本的 `chrome-headless-shell`。
- 生成 Browser Bundle manifest。
- 校验 archive 的 SHA256、size 和 executable 是否与 manifest 一致。
- 在 Docker Linux 环境内解包并运行 `chrome-headless-shell --version`，确认浏览器能启动且版本匹配。

## 前置条件

- 本机已安装 Docker。
- 仓库根目录已经安装过 pnpm 依赖。
- Docker 容器架构与要验证的平台一致。常见映射：
  - x86_64 Linux Docker：`linux-x64`
  - arm64 Linux Docker：`linux-arm64`

Chrome for Testing 并不总是发布 `linux-arm64` 的 `chrome-headless-shell`。如果下载命令提示平台不存在，换用 `linux-x64` runner 或只验证已发布的平台。

## 1. 设置变量

在仓库根目录执行：

```bash
export EASYINK_RENDER_BROWSER_VERSION=148.0.7778.97
export EASYINK_RENDER_BROWSER_PLATFORM=linux-x64
export EASYINK_RENDER_RELEASE_DIR=lib/EasyInk.Render/releases-browser-docker
```

如果你的 Docker 是 arm64 Linux，并且该 Chrome for Testing 版本发布了 arm64 包，可以把平台改成：

```bash
export EASYINK_RENDER_BROWSER_PLATFORM=linux-arm64
```

## 2. 下载 Browser Bundle 并生成 manifest

```bash
docker run --rm \
  -e EASYINK_RENDER_BROWSER_VERSION \
  -e EASYINK_RENDER_BROWSER_PLATFORM \
  -e EASYINK_RENDER_RELEASE_DIR \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:22-bookworm \
  bash -lc '
    node lib/EasyInk.Render/tools/render-release.mjs download-browser \
      --platform "$EASYINK_RENDER_BROWSER_PLATFORM" \
      --version "$EASYINK_RENDER_BROWSER_VERSION" \
      --outDir "$EASYINK_RENDER_RELEASE_DIR"
  '
```

输出目录形如：

```text
lib/EasyInk.Render/releases-browser-docker/
  browser/
    148.0.7778.97/
      linux-x64/
        chrome-headless-shell-linux64.zip
        runtime-manifest.linux-x64.json
```

## 3. 校验 SHA256、size 和 executable

```bash
docker run --rm \
  -e EASYINK_RENDER_BROWSER_VERSION \
  -e EASYINK_RENDER_BROWSER_PLATFORM \
  -e EASYINK_RENDER_RELEASE_DIR \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:22-bookworm \
  bash -lc '
    MANIFEST="$EASYINK_RENDER_RELEASE_DIR/browser/$EASYINK_RENDER_BROWSER_VERSION/$EASYINK_RENDER_BROWSER_PLATFORM/runtime-manifest.$EASYINK_RENDER_BROWSER_PLATFORM.json"
    ARCHIVE=$(find "$EASYINK_RENDER_RELEASE_DIR/browser/$EASYINK_RENDER_BROWSER_VERSION/$EASYINK_RENDER_BROWSER_PLATFORM" -maxdepth 1 \( -name "*.zip" -o -name "*.tar.gz" \) | head -n 1)
    node lib/EasyInk.Render/tools/render-release.mjs verify-package \
      --kind browser \
      --manifest "$MANIFEST" \
      --archive "$ARCHIVE"
  '
```

这一步会解压 archive 并确认 manifest 指向的 browser executable 存在。

## 4. 启动验证 Browser Bundle

只对当前 Docker 环境可执行的平台运行这一步。例如 x86_64 Linux Docker 验证 `linux-x64`。

```bash
docker run --rm \
  -e EASYINK_RENDER_BROWSER_VERSION \
  -e EASYINK_RENDER_BROWSER_PLATFORM \
  -e EASYINK_RENDER_RELEASE_DIR \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:22-bookworm \
  bash -lc '
    apt-get update
    apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libexpat1 \
      libgbm1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      xdg-utils
    MANIFEST="$EASYINK_RENDER_RELEASE_DIR/browser/$EASYINK_RENDER_BROWSER_VERSION/$EASYINK_RENDER_BROWSER_PLATFORM/runtime-manifest.$EASYINK_RENDER_BROWSER_PLATFORM.json"
    ARCHIVE=$(find "$EASYINK_RENDER_RELEASE_DIR/browser/$EASYINK_RENDER_BROWSER_VERSION/$EASYINK_RENDER_BROWSER_PLATFORM" -maxdepth 1 \( -name "*.zip" -o -name "*.tar.gz" \) | head -n 1)
    node lib/EasyInk.Render/tools/render-release.mjs verify-browser \
      --manifest "$MANIFEST" \
      --archive "$ARCHIVE"
  '
```

成功时会看到类似输出：

```text
[render-release] browser verified: lib/EasyInk.Render/releases-browser-docker/browser/148.0.7778.97/linux-x64/chrome-headless-shell-linux64.zip
[render-release] browser version: HeadlessChrome 148.0.7778.97
```

## 5. 清理产物

验证完成后可以删除临时发布目录：

```bash
rm -rf lib/EasyInk.Render/releases-browser-docker
```

## 常见问题

### Chrome for Testing download not found

该版本没有发布当前 EasyInk platform 对应的 `chrome-headless-shell`。换一个 Chrome for Testing 版本，或在对应架构的 Docker/CI runner 上验证。

### browser startup exited with code ...

通常是 Docker 镜像缺少 Chrome 运行库。确认第 4 步安装了依赖；也可以换用包含浏览器运行库的 CI 镜像。

### browser version output did not include ...

manifest 中的 browser version 和 archive 实际版本不一致。重新运行 `download-browser`，不要手动替换 archive。
