import type { PrintRequestParams, PrinterInfo, PrinterResult, PrinterStatus } from '../models'

export interface PrinterService {
  getPrinters: () => Promise<PrinterInfo[]>
  getPrinterStatus: (printerName: string) => Promise<PrinterStatus>
}

export interface PrintService {
  print: (
    requestId: string,
    request: PrintRequestParams,
    signal?: AbortSignal
  ) => Promise<PrinterResult>
}
