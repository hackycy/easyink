# 自定义打印驱动开发

这篇文档不是讲“打印驱动接口长什么样”，而是讲“什么时候值得自己写驱动，以及一套驱动最少应该承担什么职责”。

先说结论：

- 如果你只是接 EasyInk Printer 或 HiPrint，优先用官方驱动。
- 如果你需要对接的是公司内部打印网关、专用硬件、厂商 SDK，才应该写自定义驱动。

原因很直接。驱动不是一个简单的 `print()` 函数，它承担的是 Viewer 和真实打印系统之间的协议适配层。

## 驱动到底负责什么

一个合格的 `PrintDriver` 至少要做下面几件事：

1. 从 Viewer 容器中拿到已渲染页面。
2. 把页面尺寸转换成目标打印系统能理解的单位。
3. 按目标协议发送打印任务。
4. 通过 `onPhase`、`onProgress`、`onDiagnostic` 把过程反馈给上层 UI。
5. 在失败时抛出可定位的问题，而不是沉默失败。

`PrintDriver` 的接口很小，但责任并不小：

```ts
import type { PrintDriver } from '@easyink/viewer'

interface PrintDriver {
  id: string
  print: (context: ViewerPrintContext) => Promise<void>
}
```

## 先理解 `ViewerPrintContext`

你真正需要关注的是这几个字段：

- `container`：当前已经渲染完成的页面容器
- `renderedPages`：每页的实际尺寸
- `printPolicy`：打印策略，包含纸张尺寸、方向、偏移量
- `onPhase` / `onProgress` / `onDiagnostic`：反馈通道

```ts
interface ViewerPrintContext extends ViewerExportContext {
  printPolicy: ViewerPrintPolicy
  renderedPages: ViewerPageMetrics[]
  container?: HTMLElement
}
```

这意味着驱动不需要重新排版。它应该消费 Viewer 已经确定下来的结果，而不是在驱动层二次计算布局。

## 设计驱动前先做一个判断

先问自己：你的目标打印系统更像下面哪一种？

### 类型一：接受 DOM / HTML

例如 Electron 环境下的浏览器打印能力，或者厂商提供的 HTML 打印运行时。

这类系统最适合直接发送 Viewer 页面 DOM。

### 类型二：接受 PDF / 图片

例如远程打印网关、Windows 本地打印服务、需要稳定纸张尺寸的正式单据系统。

这类系统更适合先把页面转成 PDF 或图片，再上传。

### 类型三：接受逐页流式协议

例如需要 WebSocket 实时提交任务、逐页 ACK、支持设备侧状态回传的场景。

这类系统要求驱动能处理连接复用、逐页进度和异常中断。

## 模式一：直接发送 DOM

这个模式的核心原则是“不重新解释布局，只传递已经渲染好的页面”。

```ts
import type { PrintDriver, ViewerPrintContext } from '@easyink/viewer'

function createLocalPrintDriver(): PrintDriver {
  return {
    id: 'local-printer',
    async print(context: ViewerPrintContext) {
      const pages = context.container
        ? Array.from(context.container.querySelectorAll('.ei-viewer-page'))
        : []

      if (pages.length === 0)
        throw new Error('没有可打印的页面')

      const { sheetSize, orientation } = context.printPolicy
      const width = sheetSize?.width ?? context.renderedPages[0]?.width ?? 210
      const height = sheetSize?.height ?? context.renderedPages[0]?.height ?? 297

      context.onPhase?.({ phase: 'printing', message: '发送到本地打印运行时' })

      await sendToPrinter({
        pages,
        paperWidth: width,
        paperHeight: height,
        orientation,
      })
    },
  }
}
```

适合这个模式的前提是：目标运行时能忠实复用当前 HTML/CSS 输出。如果设备端本身不理解这些样式，直接发 DOM 反而会把问题转移到设备侧。

## 模式二：先生成 PDF 再发送

这是更稳的一种方案，尤其适合正式文档和需要精确纸张尺寸的打印任务。

```ts
import { renderPagesToPdfBlob } from '@easyink/export-plugin-dom-pdf'
import type { PrintDriver } from '@easyink/viewer'

function createRemotePrintDriver(): PrintDriver {
  return {
    id: 'remote-printer',
    async print(context) {
      const pages = Array.from(
        context.container?.querySelectorAll('.ei-viewer-page') ?? []
      )

      if (pages.length === 0)
        throw new Error('没有可打印的页面')

      const firstPage = context.renderedPages[0]
      const widthMm = context.printPolicy.sheetSize?.width ?? firstPage?.width ?? 210
      const heightMm = context.printPolicy.sheetSize?.height ?? firstPage?.height ?? 297

      context.onPhase?.({ phase: 'preparing', message: '生成 PDF' })
      const pdfBlob = await renderPagesToPdfBlob({
        pages,
        widthMm,
        heightMm,
        onProgress: context.onProgress,
      })

      context.onPhase?.({ phase: 'submitting', message: '上传打印任务' })
      const response = await fetch('https://print-service.example.com/print', {
        method: 'POST',
        body: pdfBlob,
        headers: { 'Content-Type': 'application/pdf' },
      })

      if (!response.ok)
        throw new Error(`打印服务返回 HTTP ${response.status}`)

      context.onPhase?.({ phase: 'waiting', message: '等待打印完成' })
      const { jobId } = await response.json()
      await waitForPrintComplete(jobId)
    },
  }
}
```

这个模式的优点不是“实现更简单”，而是边界更清晰：浏览器负责渲染，打印服务负责输出，双方通过 PDF 这个稳定格式解耦。

## 模式三：WebSocket 流式打印

如果你的打印服务需要长连接、逐页确认或实时状态回传，驱动就应该把“连接管理”和“打印提交”分成两层。

```ts
import type { PrintDriver } from '@easyink/viewer'

function createWsPrintDriver(wsUrl: string): PrintDriver {
  let socket: WebSocket | null = null

  async function ensureConnected(): Promise<WebSocket> {
    if (socket?.readyState === WebSocket.OPEN)
      return socket

    return new Promise((resolve, reject) => {
      socket = new WebSocket(wsUrl)
      socket.onopen = () => resolve(socket!)
      socket.onerror = () => reject(new Error('连接打印服务失败'))
    })
  }

  return {
    id: 'ws-printer',
    async print(context) {
      const ws = await ensureConnected()
      const pages = Array.from(
        context.container?.querySelectorAll('.ei-viewer-page') ?? []
      )

      if (pages.length === 0)
        throw new Error('没有可打印的页面')

      context.onPhase?.({ phase: 'printing', message: '发送打印数据' })

      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        await sendPageOverWs(ws, pages[pageIndex]!, context.printPolicy)
        context.onProgress?.({
          current: pageIndex + 1,
          total: pages.length,
          message: `打印第 ${pageIndex + 1}/${pages.length} 页`,
        })
      }
    },
  }
}
```

注意这里真正的关键点不是 WebSocket 本身，而是驱动要对“部分成功”有明确语义。比如打印了 3 页，第 4 页失败了，业务侧该怎么显示？这需要你在协议层定义清楚。

## 一个更实际的工程建议

不要把“连接管理 + 驱动实现 + 配置持久化”写在一个文件里。把职责拆开：

- `client` 或 `service`：连接、刷新设备、发送任务、等待结果
- `driver`：从 `ViewerPrintContext` 提取页面并调用 client
- `settings store`：保存用户配置、同步 UI 状态

官方的 `@easyink/print-integration-easyink-printer` 和 `@easyink/print-integration-hiprint` 都是按这个分层实现的。自定义驱动也建议延续这个结构，因为它能把“业务设置变化”和“打印一次任务”解耦。

## 单位转换不要省略

打印系统之间最容易出错的不是连接，而是单位。`px`、`pt`、`mm`、`inch` 混用时，最终打印出来就是尺寸不对。

```ts
const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  inch: 25.4,
  pt: 0.352778,
  px: 25.4 / 96,
}

function toMillimeters(value: number, unit: string): number {
  return value * (UNIT_TO_MM[unit] ?? 1)
}
```

建议在驱动入口就把所有尺寸统一转换成毫米，后面的协议层只处理一种单位。这样最不容易出错。

## 一定要实现的反馈通道

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

## 什么时候不应该继续抽象

很多团队在写第一个驱动时会继续往上抽象一个“统一打印平台”，试图把 DOM、PDF、图片、硬件指令全部塞进一个大接口。通常这一步太早了。

更短路径是：

- 先围绕一种真实设备和协议把驱动跑通。
- 把共性抽成 `client` 或 `print-core` 工具。
- 第二种设备出现时，再判断是否需要继续抽象。

因为打印系统的差异点常常在协议边界，而不是 Viewer 这一层。

## 开发完成前的检查清单

一个自定义驱动至少应该验证这些场景：

1. 无打印机时是否给出明确错误。
2. `container` 为空时是否阻止提交。
3. 多页打印时进度是否递增。
4. 连接断开时是否能抛出稳定错误码。
5. 纸张方向和尺寸是否与 Viewer 渲染结果一致。

## Playground 参考

Playground 已迁移到高层 print SDK，不再维护业务侧驱动包装。可以直接对照两个 hook：

- `playground/src/hooks/useEasyInkPrint.ts`：创建 EasyInk Printer client 和托管 print SDK
- `playground/src/hooks/useHiPrint.ts`：创建 HiPrint client 和托管 print SDK
