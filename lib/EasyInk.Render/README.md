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
