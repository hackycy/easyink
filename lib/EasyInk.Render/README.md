# EasyInk.Render

`EasyInk.Render` 是 EasyInk 的通用服务端渲染能力，用于把 HTML、URL、Viewer 页面或模板数据渲染成 PDF、图片和诊断结果。它不是 C# 打印服务的内部模块，而是一个可下载、可版本化、可被多语言调用的独立渲染基础设施。

## 命名

最终命名采用 `EasyInk.Render`。

原因：

- 与现有 `EasyInk.Net`、`EasyInk.Electron` 目录风格一致。
- `Render` 表达的是能力边界：服务端渲染，而不是某个具体实现。
- 不绑定 Chromium、Playwright、C#、Node.js 或打印机。
- 后续可以自然拆出 `EasyInk.Render.Host`、`EasyInk.Render.Protocol`、`EasyInk.Render.Clients` 等子模块。

不建议使用的名称：

- `EasyInk.Chromium`：暴露实现细节，后续无法平滑替换浏览器内核或渲染实现。
- `EasyInk.RenderRuntime`：过于偏运行时，不便承载协议、SDK、下载管理和诊断能力。
- `EasyInk.PrintRender`：把能力限制在打印前置渲染，无法覆盖 Node.js、Golang 等服务端渲染场景。
- `EasyInk.Browser`：容易让人误解成浏览器自动化工具，而不是稳定的渲染服务。

## 概念约定

| 名称 | 说明 |
| --- | --- |
| EasyInk.Render | 总体能力和目录名。 |
| Render Host | 独立进程，负责接收请求、驱动浏览器、产出 PDF/图片。 |
| Render Protocol | 稳定的跨语言调用协议，不暴露 Playwright/Puppeteer 细节。 |
| Render Client | C#、Node.js、Golang 等语言的轻量 SDK。 |
| Browser Bundle | 可下载的浏览器运行时，例如 Chrome for Testing 或 Chromium。 |
| Runtime Manager | 宿主侧负责下载、校验、安装、清理 Render Host 和 Browser Bundle 的组件。 |

## 设计原则

- 渲染和物理打印分离。
- 协议优先，语言 SDK 只是薄封装。
- 浏览器实现可替换，外部调用方不感知具体浏览器控制库。
- Runtime 不内置到 `EasyInk.Net`，必须由用户在设置页下载版本后启用。
- C# 端优先把它作为 PDF 前置渲染器接入，生成 PDF 后继续复用现有打印链路。
- Node.js、Golang 等后端通过同一协议复用渲染能力。

## 文档

- [架构设计](architecture.md)
- [实施方案](proposal.md)
