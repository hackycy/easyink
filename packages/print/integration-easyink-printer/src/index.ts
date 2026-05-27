export {
  createEasyInkPrinterClient,
  DEFAULT_EASYINK_PRINTER_URL,
  EasyInkPrinterClient,
  type EasyInkPrinterClientOptions,
  type EasyInkPrinterConnectionState,
  type EasyInkPrinterDevice,
  type EasyInkPrinterJob,
  type EasyInkPrinterOffset,
  type EasyInkPrinterPaperSize,
  type EasyInkPrinterUserData,
} from './client'

export {
  createEasyInkPrinterDriver,
  type EasyInkPrinterDriverOptions,
} from './driver'

export {
  createEasyInkPrinter,
  type EasyInkPaperSize,
  type EasyInkPrinter,
  type EasyInkPrinterDefaults,
  type EasyInkPrinterOptions,
  type EasyInkPrinterPrintHtmlInput,
  type EasyInkPrinterPrintInput,
  type EasyInkPrinterPrintPdfInput,
  type EasyInkPrintStrategy,
} from './sdk'
