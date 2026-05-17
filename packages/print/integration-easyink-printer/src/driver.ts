import type { PrintDriverBaseOptions } from '@easyink/print-core'
import type { PrintDriver, ViewerPrintContext } from '@easyink/viewer'
import type { EasyInkPrinterClient, EasyInkPrinterPrintPdfOptions } from './client'
import { renderPagesToPdfBlob } from '@easyink/export-plugin-dom-pdf'
import { exportDiagnosticToViewerEvent, getViewerPages, resolvePrintDriverValue, resolvePrintLandscape, resolvePrintOffset, resolveViewerPrintSize } from '@easyink/print-core'

/**
 * Configures the official Viewer print driver for EasyInk Printer.
 */
export interface EasyInkPrinterDriverOptions extends PrintDriverBaseOptions<EasyInkPrinterClient, EasyInkPrinterPrintPdfOptions> {
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
      const pages = getViewerPages(context.container)
      const { widthMm, heightMm } = resolveViewerPrintSize(context)
      const landscape = resolvePrintLandscape(context.printPolicy.orientation, widthMm, heightMm)
      const printerName = resolvePrintDriverValue(options.printerName)
      const copies = resolvePrintDriverValue(options.copies)
      const forcePageSize = resolvePrintDriverValue(options.forcePageSize)

      context.onPhase?.({ phase: 'preparing', message: '生成 PDF 中' })
      const pdfBlob = await renderPagesToPdfBlob({
        pages,
        widthMm,
        heightMm,
        onProgress: context.onProgress,
        onDiagnostic: diagnostic => context.onDiagnostic?.(exportDiagnosticToViewerEvent(diagnostic)),
      })

      context.onPhase?.({ phase: 'submitting', message: '发送打印任务' })
      const requestOptions = await options.resolveRequestOptions?.({
        printContext: context,
        pages,
        widthMm,
        heightMm,
        printerName,
        copies,
        forcePageSize,
        landscape,
      })
      const printOptions: EasyInkPrinterPrintPdfOptions = {
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

      const jobId = await options.client.printPdf(pdfBlob, printOptions)
      if (options.waitForCompletion === false)
        return

      context.onPhase?.({ phase: 'waiting', message: `等待打印结果 (${jobId.slice(0, 8)})` })
      await options.client.waitForJob(jobId)
    },
  }
}
