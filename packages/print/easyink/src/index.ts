/**
 * Public entry for the EasyInk Printer integration.
 */
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
  type EasyInkPrinterPrintPdfOptions,
} from './client'

/**
 * Official Viewer print driver for EasyInk Printer.
 */
export { createEasyInkPrinterDriver, type EasyInkPrinterDriverOptions } from './driver'
