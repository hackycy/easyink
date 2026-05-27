import type { PrintDriverBaseOptions } from '@easyink/print-core'
import type { PrintDriver, ViewerPrintContext } from '@easyink/viewer'
import type { EasyInkPrinterClient, EasyInkPrinterPrintHtmlOptions, EasyInkPrinterPrintPdfOptions, EasyInkPrinterPrintRenderOptions } from './client'
import { renderPagesToPdfBlob } from '@easyink/export-plugin-dom-pdf'
import { exportDiagnosticToViewerEvent, resolvePrintDriverValue, resolvePrintLandscape, resolvePrintOffset, resolveViewerPdfPages, resolveViewerPrintSize } from '@easyink/print-core'

export type EasyInkPrinterDriverSubmitMode = 'pdf' | 'renderSource' | 'html'

export type EasyInkPrinterDriverPrintOptions = EasyInkPrinterPrintPdfOptions & EasyInkPrinterPrintRenderOptions & EasyInkPrinterPrintHtmlOptions

/**
 * Configures the official Viewer print driver for EasyInk Printer.
 */
export interface EasyInkPrinterDriverOptions extends PrintDriverBaseOptions<EasyInkPrinterClient, EasyInkPrinterDriverPrintOptions> {
  submitMode?: EasyInkPrinterDriverSubmitMode
  waitForCompletion?: boolean
}

/**
 * Creates a Viewer print driver that renders Viewer pages to PDF and submits
 * the resulting document to EasyInk Printer.
 *
 * Use function-valued options when printer settings can change at runtime.
 */
export function createEasyInkPrinterDriver(options: EasyInkPrinterDriverOptions): PrintDriver {
  return {
    id: options.id ?? 'easyink-printer',
    defaults: { pageSizeMode: 'fixed' },
    async print(context: ViewerPrintContext) {
      const pdfPages = resolveViewerPdfPages(context)
      const pages = pdfPages.map(page => page.element)
      const pageSizes = pdfPages.map(({ widthMm, heightMm }) => ({ widthMm, heightMm }))
      const { widthMm, heightMm } = resolveViewerPrintSize(context)
      const landscape = resolvePrintLandscape(context.printPolicy.orientation, widthMm, heightMm)
      const printerName = resolvePrintDriverValue(options.printerName)
      const copies = resolvePrintDriverValue(options.copies)
      const forcePageSize = resolvePrintDriverValue(options.forcePageSize)
      const requestOptions = await options.resolveRequestOptions?.({
        printContext: context,
        pages,
        pageSizes,
        widthMm,
        heightMm,
        printerName,
        copies,
        forcePageSize,
        landscape,
      })
      const printOptions: EasyInkPrinterDriverPrintOptions = {
        printerName,
        copies,
        paperSize: forcePageSize
          ? { width: widthMm, height: heightMm, unit: 'mm' }
          : undefined,
        forcePageSize,
        landscape,
        offset: resolvePrintOffset(context.printPolicy.offset),
        ...requestOptions,
      }

      let jobId: string
      if (options.submitMode === 'renderSource') {
        context.onPhase?.({ phase: 'submitting', message: '发送模板数据到打印服务' })
        jobId = await options.client.printEasyInk({
          schema: context.schema,
          data: context.data ?? {},
        }, printOptions)
      }
      else if (options.submitMode === 'html') {
        context.onPhase?.({ phase: 'submitting', message: '发送预览 HTML 到打印服务' })
        jobId = await options.client.printHtml(serializeViewerHtml({
          context,
          pages,
          widthMm,
          heightMm,
        }), printOptions)
      }
      else {
        context.onPhase?.({ phase: 'preparing', message: '生成 PDF 中' })
        const pdfBlob = await renderPagesToPdfBlob({
          pages,
          pageSizes,
          onProgress: context.onProgress,
          onDiagnostic: diagnostic => context.onDiagnostic?.(exportDiagnosticToViewerEvent(diagnostic)),
        })

        context.onPhase?.({ phase: 'submitting', message: '发送打印任务' })
        jobId = await options.client.printPdf(pdfBlob, printOptions)
      }

      if (options.waitForCompletion === false)
        return

      context.onPhase?.({ phase: 'waiting', message: `等待打印结果 (${jobId.slice(0, 8)})` })
      await options.client.waitForJob(jobId)
    },
  }
}

function serializeViewerHtml(input: {
  context: ViewerPrintContext
  pages: HTMLElement[]
  widthMm: number
  heightMm: number
}): string {
  const document = input.pages[0]?.ownerDocument ?? input.context.container?.ownerDocument
  const styles = document ? collectPreviewHeadMarkup(document) : ''
  const pageHtml = input.pages.map(page => serializeViewerPage(page)).join('\n')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    @page { size: ${input.widthMm}mm ${input.heightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .easyink-ready { display: block; margin: 0; padding: 0; }
    .ei-viewer-page {
      box-shadow: none !important;
      margin: 0 !important;
      transform: none !important;
      break-after: page;
      break-inside: avoid;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .ei-viewer-page:last-child { break-after: auto; }
  </style>
  ${styles}
</head>
<body>
  <main class="easyink-ready">
${pageHtml}
  </main>
</body>
</html>`
}

function collectPreviewHeadMarkup(document: Document): string {
  const styles = Array.from(document.head.querySelectorAll<HTMLStyleElement>('style'))
    .map(style => `<style>${escapeStyleText(style.textContent ?? '')}</style>`)

  const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .map(link => link.outerHTML)

  return [...styles, ...links].join('\n  ')
}

function serializeViewerPage(page: HTMLElement): string {
  const clone = page.cloneNode(true) as HTMLElement
  clone.style.boxShadow = 'none'
  clone.style.margin = '0'
  clone.style.transform = 'none'
  clone.style.transformOrigin = ''
  inlineCanvasBitmaps(Array.from(page.querySelectorAll('canvas')), clone)
  return `    ${clone.outerHTML}`
}

function inlineCanvasBitmaps(sourceCanvases: HTMLCanvasElement[], cloneRoot: HTMLElement): void {
  const cloneCanvases = Array.from(cloneRoot.querySelectorAll('canvas'))

  for (let index = 0; index < cloneCanvases.length; index++) {
    const source = sourceCanvases[index]
    const clone = cloneCanvases[index]
    if (!source || !clone)
      continue

    const dataUrl = readCanvasDataUrl(source)
    if (!dataUrl)
      continue

    const img = clone.ownerDocument.createElement('img')
    img.src = dataUrl
    const style = clone.getAttribute('style')
    if (style)
      img.setAttribute('style', style)
    clone.replaceWith(img)
  }
}

function readCanvasDataUrl(canvas: HTMLCanvasElement): string | undefined {
  try {
    return canvas.toDataURL('image/png')
  }
  catch {
    return undefined
  }
}

function escapeStyleText(value: string): string {
  return value.replaceAll('</style', '<\\/style')
}
