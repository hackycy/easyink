import type { ManagedPrintInput, ManagedPrintViewer, ManagedPrintViewerOptions, PrintDriverRequestContext, PrintDriverValue } from '@easyink/print-core'
import type { ViewerPrintPageSizeMode } from '@easyink/viewer'
import type { EasyInkPrinterClient } from './client'
import type { EasyInkPrinterDriverPrintOptions, EasyInkPrinterDriverSubmitMode } from './driver'
import { createManagedPrintViewer, resolvePrintDriverValue } from '@easyink/print-core'
import { createEasyInkPrinterDriver } from './driver'

export interface EasyInkPrinterOptions extends ManagedPrintViewerOptions {
  client: EasyInkPrinterClient
  printerName?: PrintDriverValue<string>
  copies?: PrintDriverValue<number>
  forcePageSize?: PrintDriverValue<boolean>
  submitMode?: PrintDriverValue<EasyInkPrinterDriverSubmitMode>
  waitForCompletion?: boolean
  resolveRequestOptions?: (
    context: PrintDriverRequestContext,
  ) => Partial<EasyInkPrinterDriverPrintOptions> | undefined | Promise<Partial<EasyInkPrinterDriverPrintOptions> | undefined>
}

export interface EasyInkPrinterPrintRequest extends ManagedPrintInput {
  printerName?: string
  copies?: number
  forcePageSize?: boolean
  submitMode?: EasyInkPrinterDriverSubmitMode
  waitForCompletion?: boolean
  pageSizeMode?: ViewerPrintPageSizeMode
  requestOptions?: Partial<EasyInkPrinterDriverPrintOptions>
  resolveRequestOptions?: (
    context: PrintDriverRequestContext,
  ) => Partial<EasyInkPrinterDriverPrintOptions> | undefined | Promise<Partial<EasyInkPrinterDriverPrintOptions> | undefined>
}

export interface EasyInkPrinter {
  readonly client: EasyInkPrinterClient
  readonly viewer: ManagedPrintViewer
  print: (input: EasyInkPrinterPrintRequest) => Promise<void>
  destroy: () => void
}

/**
 * Creates the high-level EasyInk Printer facade. The printer owns Viewer rendering,
 * PDF generation, upload, and optional job completion waiting.
 */
export function createEasyInkPrinter(options: EasyInkPrinterOptions): EasyInkPrinter {
  const viewer = createManagedPrintViewer(options)

  return {
    client: options.client,
    viewer,
    print(input) {
      return viewer.printWithDriver({
        ...input,
        pageSizeMode: input.pageSizeMode ?? 'fixed',
      }, createEasyInkPrinterDriver({
        id: 'easyink-printer',
        client: options.client,
        printerName: () => input.printerName ?? resolvePrintDriverValue(options.printerName),
        copies: () => input.copies ?? resolvePrintDriverValue(options.copies),
        forcePageSize: () => input.forcePageSize ?? resolvePrintDriverValue(options.forcePageSize),
        submitMode: input.submitMode ?? resolvePrintDriverValue(options.submitMode),
        waitForCompletion: input.waitForCompletion ?? options.waitForCompletion,
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
