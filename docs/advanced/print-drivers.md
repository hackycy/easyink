# 自定义打印驱动开发

如果你只是接 EasyInk Printer 或 HiPrint，先不要写驱动。只有在你要接企业内部打印网关、专用硬件或厂商 SDK 时，这一层才值得进入。

## 驱动接口职责

```ts
interface PrintDriver {
  id: string
  defaults?: {
    pageSizeMode?: 'driver' | 'fixed'
  }
  print: (context: ViewerPrintContext) => Promise<void>
}
```

驱动真正负责的是把 Viewer 已经渲染好的结果，转换成目标打印系统能接受的输入。

## `ViewerPrintContext`

你真正常用的是这些字段：

- `container`
- `renderedPages`
- `printPolicy`
- `onPhase`
- `onProgress`
- `onDiagnostic`

这意味着驱动不应该重新排版，而应该消费 Viewer 已经确定下来的页面结果。

## `print-core` 辅助函数

如果你自己写驱动，优先复用这些现成工具：

- `getViewerPages()`
- `resolveViewerPrintSize()`
- `resolveViewerPdfPages()`
- `resolvePrintLandscape()`
- `resolvePrintOffset()`
- `exportDiagnosticToViewerEvent()`

它们的价值不在“少写几行代码”，而在于把页面提取、单位换算和诊断映射统一下来。

## PDF 提交路径

如果你的目标系统更适合接 PDF，可以这样组织：

```ts
function createRemotePrintDriver(): PrintDriver {
  return {
    id: 'remote-printer',
    async print(context) {
      const pdfPages = resolveViewerPdfPages(context)
      const pages = pdfPages.map(page => page.element)
      const pageSizes = pdfPages.map(({ widthMm, heightMm }) => ({ widthMm, heightMm }))

      const pdfBlob = await renderPagesToPdfBlob({
        pages,
        pageSizes,
        onProgress: context.onProgress,
      })

      await submitPdf(pdfBlob)
    },
  }
}
```

如果目标系统本身更适合接 HTML 或逐页流式协议，再考虑 DOM 提交或 WebSocket 提交路径。

## 工程分层建议

不要把连接管理、配置持久化和驱动实现写在一个文件里。更稳的拆法是：

- `client` 负责连接和任务提交
- `driver` 负责从 `ViewerPrintContext` 提取数据并调用 `client`
- `store` 或设置层负责保存打印机、份数和其他配置

官方打印集成也是按这个思路做的。

## 单位转换

打印系统之间最容易出错的不是连接，而是单位。`px`、`pt`、`mm`、`inch` 混用时，最终打印出来就是尺寸不对。

```ts
import { resolveViewerPrintSize } from '@easyink/print-core'

const { widthMm, heightMm } = resolveViewerPrintSize(context)
```

建议在驱动入口就把所有尺寸统一转换成毫米，后面的协议层只处理一种单位。这样最不容易出错。

## 反馈通道

### 阶段反馈

```ts
context.onPhase?.({ phase: 'preparing', message: '准备打印数据' })
context.onPhase?.({ phase: 'submitting', message: '提交打印任务' })
context.onPhase?.({ phase: 'waiting', message: '等待打印结果' })
```

### 进度反馈

```ts
context.onProgress?.({ current: 1, total: 5, message: '打印第 1/5 页' })
```

### 诊断反馈

```ts
context.onDiagnostic?.({
  category: 'print',
  severity: 'warning',
  code: 'DEVICE_BUSY',
  message: '打印机忙碌，任务已进入等待队列',
})
```

这些反馈不是可选装饰，而是生产环境里定位问题的最小闭环。

## 抽象边界

很多团队在写第一个驱动时会继续往上抽象一个“统一打印平台”，试图把 DOM、PDF、图片、硬件指令全部塞进一个大接口。通常这一步太早了。

更短路径是：

- 先围绕一种真实设备和协议把驱动跑通。
- 把共性抽成 `client` 或 `print-core` 工具。
- 第二种设备出现时，再判断是否需要继续抽象。

因为打印系统的差异点常常在协议边界，而不是 Viewer 这一层。

## 完成前检查清单

一个自定义驱动至少应该验证这些场景：

1. 无打印机时是否给出明确错误。
2. `container` 为空时是否阻止提交。
3. 多页打印时进度是否递增。
4. 连接断开时是否能抛出稳定错误码。
5. 纸张方向和尺寸是否与 Viewer 渲染结果一致。

## Playground 参考

Playground 已迁移到高层打印器，不再维护业务侧驱动包装。可以直接对照两个 hook：

- `playground/src/hooks/useEasyInkPrint.ts`：创建 EasyInk Printer client 和托管打印器
- `playground/src/hooks/useHiPrint.ts`：创建 HiPrint client 和托管打印器
