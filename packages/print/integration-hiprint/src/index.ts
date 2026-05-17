/**
 * Public entry for the HiPrint integration.
 */
export {
  createHiPrintClient,
  DEFAULT_HIPRINT_URL,
  HiPrintClient,
  type HiPrintClientOptions,
  type HiPrintDevice,
  type HiPrintProgress,
  type PrintHtmlOptions,
  type PrintPagesOptions,
} from './client'

/**
 * Official Viewer print driver for HiPrint.
 */
export { createHiPrintDriver, type HiPrintDriverOptions } from './driver'
