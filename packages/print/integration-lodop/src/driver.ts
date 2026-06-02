import type { PrintDriverBaseOptions } from '@easyink/print-core'
import type { PrintDriver, ViewerPrintContext } from '@easyink/viewer'
import type { LodopClientLike, PrintPagesOptions } from './client'
import { getViewerPages, resolvePrintDriverValue, resolveViewerPrintSize } from '@easyink/print-core'

/**
 * Configures the official Viewer print driver for LODOP.
 */
export interface LodopDriverOptions extends PrintDriverBaseOptions<LodopClientLike, PrintPagesOptions> {}

/**
 * Creates a Viewer print driver that forwards rendered pages to LODOP.
 *
 * Use function-valued options when printer settings can change at runtime.
 */
export function createLodopDriver(options: LodopDriverOptions): PrintDriver {
  return {
    id: options.id ?? 'lodop',
    defaults: { pageSizeMode: 'driver' },
    async print(context: ViewerPrintContext) {
      const pages = getViewerPages(context.container)
      const { widthMm, heightMm } = resolveViewerPrintSize(context)
      const printerName = resolvePrintDriverValue(options.printerName) ?? options.client.printerName ?? await options.client.useDefaultPrinter?.()
      const copies = resolvePrintDriverValue(options.copies)
      const forcePageSize = resolvePrintDriverValue(options.forcePageSize)
      const requestOptions = await options.resolveRequestOptions?.({
        printContext: context,
        pages,
        pageSizes: pages.map(() => ({ widthMm, heightMm })),
        widthMm,
        heightMm,
        printerName,
        copies,
        forcePageSize,
      })

      context.onPhase?.({ phase: 'printing', message: 'LODOP 打印中' })
      await options.client.printPages(pages, {
        width: widthMm,
        height: heightMm,
        printerName,
        orientation: context.printPolicy.orientation,
        copies,
        forcePageSize,
        ...requestOptions,
      }, (progress) => {
        context.onProgress?.({ ...progress, message: 'LODOP 打印中' })
      })
    },
  }
}
