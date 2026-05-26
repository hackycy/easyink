# 自定义打印驱动开发 {#print-drivers}

如果你只是接 EasyInk Printer 或 HiPrint，先用现成集成。只有在你要接企业内部打印网关、专用硬件或厂商 SDK 时，才需要写自定义驱动。

先看一个 PDF 提交型驱动：

```ts
import type { PrintDriver } from '@easyink/viewer'
import { renderPagesToPdfBlob } from '@easyink/export-plugin-dom-pdf'
import { resolveViewerPdfPages, resolveViewerPrintSize } from '@easyink/print-core'

export function createRemotePdfPrintDriver(): PrintDriver {
  return {
    id: 'remote-pdf-printer',
    defaults: {
      pageSizeMode: 'fixed',
    },
    async print(context) {
      context.onPhase?.({ phase: 'preparing', message: '生成 PDF' })

      const pdfPages = resolveViewerPdfPages(context)
      const { widthMm, heightMm } = resolveViewerPrintSize(context)

      const pdfBlob = await renderPagesToPdfBlob({
        pages: pdfPages.map(page => page.element),
        pageSizes: pdfPages.map(page => ({
          widthMm: page.widthMm,
          heightMm: page.heightMm,
        })),
        onProgress: context.onProgress,
      })

      context.onPhase?.({ phase: 'submitting', message: '提交打印任务' })
      await submitPdfToGateway(pdfBlob, { widthMm, heightMm })
    },
  }
}
```

这段代码没有重新排版。它只读取 Viewer 已经渲染好的页面，把页面转成目标系统需要的 PDF，再提交出去。

## 驱动接口 {#driver-api}

打印驱动的接口很小：

```ts
interface PrintDriver {
  id: string
  defaults?: {
    pageSizeMode?: 'driver' | 'fixed'
  }
  print: (context: ViewerPrintContext) => Promise<void>
}
```

`print()` 拿到的是 `ViewerPrintContext`。它代表 Viewer 已经完成渲染，驱动现在要把结果交给打印系统。

## 读取 ViewerPrintContext {#print-context}

驱动里常用这些字段：

```ts
async print(context) {
  const pages = context.renderedPages
  const policy = context.printPolicy
  const container = context.container

  context.onPhase?.({ phase: 'printing', message: `${pages.length} 页` })
}
```

这些字段的含义是：

- `container`：Viewer 渲染后的 DOM 容器。
- `renderedPages`：每页宽高和单位。
- `printPolicy`：纸张模式、方向、偏移等打印策略。
- `onPhase`、`onProgress`、`onDiagnostic`：反馈给宿主的通道。

:::warning 注意
驱动不应该重新计算模板 layout。页面尺寸、分页和元素位置都应该来自 Viewer 的渲染结果。
:::

## 复用 print-core {#print-core}

自己写驱动时，优先复用 `@easyink/print-core`：

```ts
import {
  getViewerPages,
  resolvePrintLandscape,
  resolvePrintOffset,
  resolveViewerPdfPages,
  resolveViewerPrintSize,
} from '@easyink/print-core'

const pages = getViewerPages(context.container)
const pdfPages = resolveViewerPdfPages(context)
const { widthMm, heightMm } = resolveViewerPrintSize(context)
const landscape = resolvePrintLandscape(context.printPolicy.orientation, widthMm, heightMm)
const offset = resolvePrintOffset(context.printPolicy.offset)
```

这些工具会统一处理页面提取、单位换算和方向判断。你不用在每个驱动里重新写一套。

## 选择提交路径 {#submit-path}

常见提交路径有三种：

```ts
// PDF 型网关
await submitPdfToGateway(pdfBlob)

// HTML 型网关
await submitHtmlToGateway(context.container!.innerHTML)

// 厂商 SDK
await printerSdk.print({ pages, widthMm, heightMm })
```

三种方式都可以。选择时看目标系统最稳定支持什么输入：

- 支持 PDF：优先 PDF，尺寸和分页更可控。
- 支持 HTML：可以直接提交 Viewer DOM，但要确认样式和字体加载策略。
- 只能走 SDK：把 `ViewerPrintContext` 转成 SDK 参数，不要让 SDK 反过来接管排版。

## 处理单位 {#units}

打印问题里最常见的是单位混用。建议在驱动入口就统一成毫米：

```ts
import { resolveViewerPrintSize, toMillimeters } from '@easyink/print-core'

const { widthMm, heightMm } = resolveViewerPrintSize(context)

const firstPage = context.renderedPages[0]
const pageWidthMm = toMillimeters(firstPage.width, firstPage.unit)
```

后面的协议层只处理 `mm`。这样你更容易排查“打印出来尺寸不对”的问题。

## 报告阶段和进度 {#feedback}

生产环境里，反馈通道不是装饰。驱动至少应该报告阶段、进度和可恢复诊断：

```ts
context.onPhase?.({ phase: 'preparing', message: '准备打印数据' })
context.onProgress?.({ current: 1, total: 5, message: '处理第 1/5 页' })
context.onDiagnostic?.({
  category: 'print',
  severity: 'warning',
  code: 'DEVICE_BUSY',
  message: '打印机忙碌，任务已进入等待队列',
  scope: 'print',
})
```

宿主可以用这些事件更新 UI、写日志或上报监控。

## 拆分工程边界 {#project-boundary}

建议把驱动拆成三层：

```text
client -> 连接、鉴权、提交任务
driver -> 从 ViewerPrintContext 提取数据并调用 client
store  -> 保存打印机、份数、偏移等业务配置
```

不要在第一个驱动里急着做“统一打印平台”。先围绕一种真实设备跑通，第二种设备出现时再抽公共层。

## 注册和调用 {#register}

注册驱动后，Viewer 可以按 `driverId` 调用它：

```ts
const driver = createRemotePdfPrintDriver()

viewer.registerPrintDriver(driver)

await viewer.print({
  driverId: 'remote-pdf-printer',
  pageSizeMode: 'fixed',
  throwOnError: true,
  onPhase(event) {
    console.log(event.phase, event.message)
  },
})
```

如果你的驱动设置了 `defaults.pageSizeMode`，宿主没有显式传 `pageSizeMode` 时会使用驱动默认值。

## 完成前检查 {#checklist}

写完驱动后，至少跑这些场景：

```ts
await viewer.print({
  driverId: 'remote-pdf-printer',
  throwOnError: true,
  onProgress(event) {
    console.log(event.current, event.total)
  },
})
```

然后检查结果：

- 无打印机或无连接时，是否抛出稳定错误码。
- `container` 为空时，是否阻止提交。
- 多页打印时，进度是否递增。
- 连接断开时，是否能通过 `onDiagnostic` 或异常暴露原因。
- 纸张方向、尺寸和 Viewer 渲染结果是否一致。

Playground 现在使用高层打印器。业务接入可以参考 `playground/src/hooks/useEasyInkPrint.ts` 和 `playground/src/hooks/useHiPrint.ts`。
