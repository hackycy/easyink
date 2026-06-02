import type { ManagedPrintInput, ManagedPrintViewer, ManagedPrintViewerOptions, PrintDriverRequestContext, PrintDriverValue } from '@easyink/print-core'
import type { ViewerPrintPageSizeMode } from '@easyink/viewer'
import type { LodopClientLike, PrintPagesOptions } from './client'
import { createManagedPrintViewer, resolvePrintDriverValue } from '@easyink/print-core'
import { createLodopDriver } from './driver'

export interface LodopPrinterOptions extends ManagedPrintViewerOptions {
  client: LodopClientLike
  printerName?: PrintDriverValue<string>
  copies?: PrintDriverValue<number>
  forcePageSize?: PrintDriverValue<boolean>
  resolveRequestOptions?: (
    context: PrintDriverRequestContext,
  ) => Partial<PrintPagesOptions> | undefined | Promise<Partial<PrintPagesOptions> | undefined>
}

export interface LodopPrintRequest extends ManagedPrintInput {
  printerName?: string
  copies?: number
  forcePageSize?: boolean
  pageSizeMode?: ViewerPrintPageSizeMode
  requestOptions?: Partial<PrintPagesOptions>
  resolveRequestOptions?: (
    context: PrintDriverRequestContext,
  ) => Partial<PrintPagesOptions> | undefined | Promise<Partial<PrintPagesOptions> | undefined>
}

export interface LodopPrinter {
  readonly client: LodopClientLike
  readonly viewer: ManagedPrintViewer
  print: (input: LodopPrintRequest) => Promise<void>
  destroy: () => void
}

/**
 * Creates the high-level LODOP printer. The printer owns Viewer creation/rendering
 * and exposes a single schema/data print call to application code.
 */
export function createLodopPrinter(options: LodopPrinterOptions): LodopPrinter {
  const viewer = createManagedPrintViewer(options)

  return {
    client: options.client,
    viewer,
    print(input) {
      return viewer.printWithDriver({
        ...input,
        pageSizeMode: input.pageSizeMode ?? 'driver',
      }, createLodopDriver({
        id: 'lodop',
        client: options.client,
        printerName: () => input.printerName ?? resolvePrintDriverValue(options.printerName),
        copies: () => input.copies ?? resolvePrintDriverValue(options.copies),
        forcePageSize: () => input.forcePageSize ?? resolvePrintDriverValue(options.forcePageSize),
        async resolveRequestOptions(context) {
          const base = await options.resolveRequestOptions?.(context)
          const perPrint = input.resolveRequestOptions
            ? await input.resolveRequestOptions(context)
            : input.requestOptions
          return { ...base, ...perPrint }
        },
      }))
    },
    destroy() {
      viewer.destroy()
    },
  }
}
