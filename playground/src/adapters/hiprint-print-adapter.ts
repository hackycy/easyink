import type { PrintAdapter, ViewerExportContext } from '@easyink/viewer'
import { usePrinter } from '../hooks/usePrinter'
import { loadPrinterConfig } from '../storage/printer-config-store'

/**
 * HiPrint PrintAdapter for EasyInk Viewer
 * Enables silent printing through HiPrint service
 */
export function createHiPrintAdapter(): PrintAdapter {
  const config = loadPrinterConfig()
  const printer = usePrinter(config)

  return {
    id: 'hiprint-adapter',
    async print(context: ViewerExportContext) {
      if (!printer.getPrinterEnabled.value) {
        throw new Error('打印服务未启用')
      }

      if (!printer.getConnected.value) {
        // Try to connect
        printer.connectService()
        // Wait for connection
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            if (printer.getConnected.value) {
              resolve(undefined)
            }
            else {
              reject(new Error('打印服务未连接'))
            }
          }, 2000)
        })
      }

      if (!printer.getPrinterDevice.value) {
        throw new Error('未选择打印机')
      }

      // Get all page elements from DOM
      const container = document.querySelector('.ei-viewer-page')?.parentElement
      if (!container) {
        throw new Error('找不到打印内容')
      }

      const pages = container.querySelectorAll<HTMLElement>('.ei-viewer-page')
      if (pages.length === 0) {
        throw new Error('没有可打印的页面')
      }

      const paperSize = printer.getPrinterPaperSize.value
      const printerDevice = printer.getPrinterDevice.value

      // Print each page
      for (const page of pages) {
        const html = page.innerHTML
        const width = paperSize
        const height = Number.parseFloat(page.style.height) || page.offsetHeight

        await printer.printHtml({
          width,
          height,
          html,
          printer: printerDevice,
        })
      }
    },
  }
}
