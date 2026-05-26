# Electron HiPrint

HiPrint 这条链路更适合跨平台和小票类场景。EasyInk 在这一层提供的是一个高层打印器，让你不用自己手动创建 Viewer、提取页面 HTML、再去拼接 HiPrint 调用。

## 工作链路

```text
schema + data
    -> 托管 Viewer 渲染
    -> 页面 HTML
    -> HiPrint runtime
    -> 系统打印机
```

这也是它和 EasyInk Printer 的最大差别之一：这里的打印输入更接近 HTML 页面，而不是本地服务侧 PDF 路径。

## 适用场景

- 你需要跨平台
- 你的项目已经接入 `electron-hiprint`
- 你的打印内容主要是小票、卡片或驱动主导纸张尺寸的任务

如果你的场景更像正式报表、A4 或对 PDF 路径依赖更强的 Windows 环境，那通常应该先看 EasyInk Printer。

## 后续阅读

继续直接看 [快速上手](./getting-started)。
