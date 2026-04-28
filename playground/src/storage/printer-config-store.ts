import type { PrinterConfig } from '../hooks/usePrinter'
import { DEFAULT_PRINTER_COPIES, DEFAULT_PRINTER_HOST, DEFAULT_PRINTER_PAGE_SIZE } from '../hooks/usePrinter'

const PRINTER_CONFIG_KEY = 'easyink:printerConfig'

export function loadPrinterConfig(): PrinterConfig {
  try {
    const stored = localStorage.getItem(PRINTER_CONFIG_KEY)
    if (!stored)
      return getDefaultPrinterConfig()

    const parsed = JSON.parse(stored) as Partial<PrinterConfig>
    return {
      enablePrinterService: parsed.enablePrinterService ?? false,
      printerDevice: parsed.printerDevice,
      printerPaperSize: parsed.printerPaperSize ?? DEFAULT_PRINTER_PAGE_SIZE,
      printCopies: parsed.printCopies ?? DEFAULT_PRINTER_COPIES,
      printerServiceUrl: parsed.printerServiceUrl ?? DEFAULT_PRINTER_HOST,
    }
  }
  catch {
    return getDefaultPrinterConfig()
  }
}

export function savePrinterConfig(config: PrinterConfig): void {
  try {
    localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(config))
  }
  catch {
    /* quota exceeded */
  }
}

function getDefaultPrinterConfig(): PrinterConfig {
  return {
    enablePrinterService: false,
    printerDevice: undefined,
    printerPaperSize: DEFAULT_PRINTER_PAGE_SIZE,
    printCopies: DEFAULT_PRINTER_COPIES,
    printerServiceUrl: DEFAULT_PRINTER_HOST,
  }
}
