# 打印方案

打印章节最想帮你解决的，不是“打印接口长什么样”，而是“我到底该选哪条链路”。

EasyInk 当前有两条官方前端打印集成：

- `@easyink/print-integration-easyink-printer`
- `@easyink/print-integration-hiprint`

它们都已经把“托管 Viewer 渲染 + 打印提交”这一段封装好了，所以多数项目不需要自己先写 `PrintDriver`。

## 最短接入路径

不管你最后选哪条链路，前端主流程都很像：

```ts
const printer = createXXXPrinter({
  client,
  viewer: 'iframe',
})

await printer.print({ schema, data })
```

也就是说，业务层真正关心的往往只有：

- 打到哪个服务
- 选哪台打印机
- 打几份
- 这次用什么模板和数据

## 官方链路选择

| 方案 | 更适合什么场景 |
| --- | --- |
| EasyInk Printer | Windows、本地服务、正式单据、PDF 质量优先 |
| HiPrint | 跨平台、小票、卡片、已有 electron-hiprint 环境 |

如果你只看一个判断条件，也够用了：

- 更在意 Windows 本地打印稳定性和 PDF 路径，选 EasyInk Printer
- 更在意跨平台和 HTML 提交链路，选 HiPrint

## 自定义驱动边界

因为官方打印器已经把下面这些事做掉了：

- 创建托管 Viewer
- 打开 `schema + data`
- 取渲染结果
- 按对应协议提交打印
- 在合适的时候销毁 Viewer

这意味着如果你的需求只是“把模板稳定打出去”，直接接官方打印器通常是最短路径。

## EasyInk Printer 方案

这条链路默认更偏向 PDF 或服务端 Render 路径，适合正式文档和尺寸控制要求更强的场景。

它的高层打印器默认会用 `pageSizeMode: 'fixed'`，也就是更倾向于按模板或渲染尺寸来控制输出。

继续看这里：

- [EasyInk Printer (.NET)](/dotnet/)
- [快速上手](/dotnet/getting-started)

## HiPrint 方案

这条链路默认更偏向驱动主导的纸张策略，适合小票和设备驱动自己决定介质的场景。

它的高层打印器默认会用 `pageSizeMode: 'driver'`。

继续看这里：

- [Electron HiPrint](/hiprint/)
- [快速上手](/hiprint/getting-started)

## Render 适用场景

如果你的目标不是“立刻打印”，而是“先稳定把 HTML、Schema 或 PDF 归一成 PDF 输出”，那更应该先看 Render：

- [EasyInk.Render CLI 渲染运行时](/printing/render)

Render 不负责枚举打印机和提交物理打印任务，它负责把输入稳定地变成 PDF。

## 排错顺序

用户说“点了打印没反应”时，先按这个顺序查：

1. 客户端是不是连上了本地服务或运行时。
2. 打印机列表是不是能正常刷新。
3. 当前打印机是不是有效。
4. `printer.print()` 的 `onPhase` / `onDiagnostic` 有没有给出错误信息。

多数问题其实都卡在连接和设备，不在模板本身。
