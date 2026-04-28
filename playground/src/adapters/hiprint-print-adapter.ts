import type { PrintAdapter, ViewerExportContext } from '@easyink/viewer'
import { usePrinter } from '../hooks/usePrinter'

/**
 * HiPrint PrintAdapter for EasyInk Viewer.
 * Uses the singleton printer store (config managed via PrinterSettingsModal).
 */
export function createHiPrintAdapter(): PrintAdapter {
  const printer = usePrinter()

  return {
    id: 'hiprint-adapter',
    async print(_context: ViewerExportContext) {
      if (!printer.enabled.value)
        throw new Error('打印服务未启用')

      if (!printer.isConnected.value)
        await printer.connect()

      if (!printer.printerDevice.value)
        throw new Error('未选择打印机')

      const container = document.querySelector('.ei-viewer-page')?.parentElement
      if (!container)
        throw new Error('找不到打印内容')

      const pages = Array.from(
        container.querySelectorAll<HTMLElement>('.ei-viewer-page'),
      )
      if (pages.length === 0)
        throw new Error('没有可打印的页面')

      const paperSize = printer.paperSize.value
      const printerDevice = printer.printerDevice.value

      await printer.printPages(pages, {
        width: paperSize,
        height: 0, // page height resolved per-page below
        printer: printerDevice,
      })
    },
  }
}
