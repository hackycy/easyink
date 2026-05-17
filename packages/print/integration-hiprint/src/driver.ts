import type { PrintDriverBaseOptions } from '@easyink/print-core'
import type { PrintDriver, ViewerPrintContext } from '@easyink/viewer'
import type { HiPrintClient, PrintPagesOptions } from './client'
import { getViewerPages, resolvePrintDriverValue, resolveViewerPrintSize } from '@easyink/print-core'

/**
 * Configures the official Viewer print driver for HiPrint.
 */
export interface HiPrintDriverOptions extends PrintDriverBaseOptions<HiPrintClient, PrintPagesOptions> {}

/**
 * Creates a Viewer print driver that forwards rendered pages to HiPrint.
 *
 * Use function-valued options when printer settings can change at runtime.
 */
export function createHiPrintDriver(options: HiPrintDriverOptions): PrintDriver {
  return {
    id: options.id ?? 'hiprint',
    defaults: { pageSizeMode: 'driver' },
    async print(context: ViewerPrintContext) {
      const pages = getViewerPages(context.container)
      const { widthMm, heightMm } = resolveViewerPrintSize(context)
      const printerName = resolvePrintDriverValue(options.printerName) ?? options.client.printerName ?? await options.client.useDefaultPrinter()
      const copies = resolvePrintDriverValue(options.copies)
      const forcePageSize = resolvePrintDriverValue(options.forcePageSize)
      const requestOptions = await options.resolveRequestOptions?.({
        printContext: context,
        pages,
        widthMm,
        heightMm,
        printerName,
        copies,
        forcePageSize,
      })

      context.onPhase?.({ phase: 'printing', message: 'HiPrint 打印中' })
      await options.client.printPages(pages, {
        width: widthMm,
        height: heightMm,
        printerName,
        orientation: context.printPolicy.orientation,
        copies,
        forcePageSize,
        ...requestOptions,
      }, (progress) => {
        context.onProgress?.({ ...progress, message: 'HiPrint 打印中' })
      })
    },
  }
}
