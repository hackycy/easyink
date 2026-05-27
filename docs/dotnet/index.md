---
description: EasyInk .NET 打印服务：Windows 本地打印方案，包含 HTTP/WebSocket 服务和底层打印引擎两层架构。
---

# .NET 打印服务

EasyInk 的 .NET 部分解决的是 Windows 本地打印这件事。它把前端调用、本地 HTTP/WebSocket 服务和底层打印引擎拆成了两层。

## 整体关系

```text
浏览器前端
    -> EasyInk.Printer
    -> EasyInk.Engine
    -> Windows 打印通道
```

如果你只需要浏览器去调用本地打印机，通常直接安装 `EasyInk.Printer` 就够了。

## 组件分工

| 组件 | 作用 |
| --- | --- |
| `EasyInk.Engine` | 纯打印引擎，暴露 `EngineApi` |
| `EasyInk.Printer` | 桌面应用，提供 HTTP/WebSocket、UI、审计和配置 |

这个拆分很实用。它让你既可以直接使用完整桌面服务，也可以把底层引擎嵌到自己的 .NET 宿主里。

## 方案选择

- 你是浏览器项目，要调用本地打印机：先选 `EasyInk.Printer`
- 你已经有自己的 .NET 应用，只差打印能力：先看 `EasyInk.Engine`

多数 Web 项目都落在第一种。

## 后续阅读

- [快速上手](./getting-started)
- [Engine DLL](./engine)
- [Printer 应用](./printer)
- [API 参考](./api-reference)
