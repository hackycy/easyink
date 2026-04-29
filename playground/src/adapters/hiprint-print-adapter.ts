import type { PrintAdapter, ViewerExportContext } from '@easyink/viewer'
import { usePrinter } from '../hooks/usePrinter'

const UNIT_TO_MM = {
  cm: 10,
  in: 25.4,
  mm: 1,
  pt: 0.352778,
} as const

function toMillimeters(length: string, fallbackUnit: string): number {
  const trimmed = length.trim()
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(mm|cm|in|pt)?$/)
  if (!match)
    throw new Error(`无法解析打印页面尺寸: ${length}`)

  const value = Number(match[1])
  const unit = match[2] || fallbackUnit
  const factor = UNIT_TO_MM[unit as keyof typeof UNIT_TO_MM] || 1

  return value * factor
}

/**
 * HiPrint PrintAdapter for EasyInk Viewer.
 * Uses the singleton printer store (config managed via PrinterSettingsModal).
 */
export function createHiPrintAdapter(): PrintAdapter {
  const printer = usePrinter()

  return {
    id: 'hiprint-adapter',
    async print(context: ViewerExportContext) {
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

      const firstPage = pages[0]!
      const printerDevice = printer.printerDevice.value
      let width = toMillimeters(`${context.schema.page.width}${context.schema.unit}`, context.schema.unit)
      // 标签模式下宽度由内容决定，使用页面样式中的宽度（已转换为毫米）
      if (context.schema.page.mode === 'label') {
        width = toMillimeters(firstPage.style.width, context.schema.unit)
      }
      const height = toMillimeters(firstPage.style.height, context.schema.unit)

      await printer.printPages(pages, {
        width,
        height,
        printer: printerDevice,
      })
    },
  }
}
