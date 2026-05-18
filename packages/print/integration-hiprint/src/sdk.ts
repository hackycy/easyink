import type { ManagedPrintInput, ManagedPrintViewer, ManagedPrintViewerOptions, PrintDriverRequestContext, PrintDriverValue } from '@easyink/print-core'
import type { ViewerPrintPageSizeMode } from '@easyink/viewer'
import type { HiPrintClient, PrintPagesOptions } from './client'
import { createManagedPrintViewer, resolvePrintDriverValue } from '@easyink/print-core'
import { createHiPrintDriver } from './driver'

export interface HiPrintPrintSdkOptions extends ManagedPrintViewerOptions {
  client: HiPrintClient
  printerName?: PrintDriverValue<string>
  copies?: PrintDriverValue<number>
  forcePageSize?: PrintDriverValue<boolean>
  resolveRequestOptions?: (
    context: PrintDriverRequestContext,
  ) => Partial<PrintPagesOptions> | undefined | Promise<Partial<PrintPagesOptions> | undefined>
}

export interface HiPrintPrintInput extends ManagedPrintInput {
  printerName?: string
  copies?: number
  forcePageSize?: boolean
  pageSizeMode?: ViewerPrintPageSizeMode
  requestOptions?: Partial<PrintPagesOptions>
  resolveRequestOptions?: (
    context: PrintDriverRequestContext,
  ) => Partial<PrintPagesOptions> | undefined | Promise<Partial<PrintPagesOptions> | undefined>
}

export interface HiPrintPrintSdk {
  readonly client: HiPrintClient
  readonly viewer: ManagedPrintViewer
  print: (input: HiPrintPrintInput) => Promise<void>
  destroy: () => void
}

/**
 * Creates the high-level HiPrint SDK. The SDK owns Viewer creation/rendering
 * and exposes a single schema/data print call to application code.
 */
export function createHiPrintPrintSdk(options: HiPrintPrintSdkOptions): HiPrintPrintSdk {
  const viewer = createManagedPrintViewer(options)

  return {
    client: options.client,
    viewer,
    print(input) {
      return viewer.printWithDriver({
        ...input,
        pageSizeMode: input.pageSizeMode ?? 'driver',
      }, createHiPrintDriver({
        id: 'hiprint',
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
