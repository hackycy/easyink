import { BrowserWindow } from 'electron'
import type { PrinterService } from './abstractions'
import { PrinterStatusCode } from '../models'
import type { PrinterInfo, PrinterStatus } from '../models'

export class ChromiumPrinterService implements PrinterService {
  private probeWindow?: BrowserWindow

  async getPrinters(): Promise<PrinterInfo[]> {
    const webContents = this.getProbeWindow().webContents
    const printers = await webContents.getPrintersAsync()
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName || printer.name,
      description: printer.description,
      isDefault: isDefaultPrinter(printer.options),
      status: readPrinterStatus(printer.options),
      statusCode: mapPrinterStatus(printer.options),
      options: printer.options as Record<string, unknown>
    }))
  }

  async getPrinterStatus(printerName: string): Promise<PrinterStatus> {
    const printer = (await this.getPrinters()).find((item) => item.name === printerName)
    if (!printer) {
      return {
        printerName,
        statusCode: PrinterStatusCode.NotFound,
        message: `打印机不存在: ${printerName}`
      }
    }

    return {
      printerName,
      statusCode: printer.statusCode,
      status: printer.status,
      message: getPrinterStatusMessage(printer.statusCode)
    }
  }

  dispose(): void {
    this.probeWindow?.destroy()
    this.probeWindow = undefined
  }

  private getProbeWindow(): BrowserWindow {
    if (this.probeWindow && !this.probeWindow.isDestroyed()) {
      return this.probeWindow
    }

    this.probeWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    return this.probeWindow
  }
}

function mapPrinterStatus(options: Electron.Options): PrinterStatusCode {
  const status = readPrinterStatus(options)
  const reasons = readPrinterStateReasons(options)
  if (reasons.some((reason) => reason.includes('media-jam') || reason.includes('paper-jam'))) {
    return PrinterStatusCode.PaperJam
  }
  if (
    reasons.some(
      (reason) =>
        reason.includes('media-empty') ||
        reason.includes('media-needed') ||
        reason.includes('paper-out')
    )
  ) {
    return PrinterStatusCode.PaperOut
  }
  if (reasons.some((reason) => reason.includes('offline'))) {
    return PrinterStatusCode.Offline
  }

  if (status == null || status === 0) {
    return PrinterStatusCode.Ready
  }

  if ((status & 0x00000008) !== 0) {
    return PrinterStatusCode.PaperJam
  }
  if ((status & 0x00000010) !== 0 || (status & 0x00000040) !== 0) {
    return PrinterStatusCode.PaperOut
  }
  if ((status & 0x00000001) !== 0) {
    return PrinterStatusCode.Stopped
  }
  if ((status & 0x00000080) !== 0 || (status & 0x00000400) !== 0) {
    return PrinterStatusCode.Offline
  }

  if (status > 0) {
    return PrinterStatusCode.Error
  }

  return PrinterStatusCode.Unknown
}

function isDefaultPrinter(options: Electron.Options): boolean {
  return options['printer-is-default'] === true || options['system_driverinfo'] === 'default'
}

function readPrinterStatus(options: Electron.Options): number | undefined {
  const optionBag = options as Record<string, unknown>
  const rawStatus = optionBag.status ?? optionBag['printer-state']
  const status = Number(rawStatus)
  return Number.isFinite(status) ? status : undefined
}

function readPrinterStateReasons(options: Electron.Options): string[] {
  const optionBag = options as Record<string, unknown>
  const rawReasons = optionBag['printer-state-reasons'] ?? optionBag.printerStateReasons
  if (Array.isArray(rawReasons)) {
    return rawReasons.map((reason) => String(reason).toLowerCase())
  }
  return rawReasons ? String(rawReasons).toLowerCase().split(',') : []
}

function getPrinterStatusMessage(statusCode: PrinterStatusCode): string {
  switch (statusCode) {
    case PrinterStatusCode.Ready:
      return '打印机就绪'
    case PrinterStatusCode.Offline:
      return '打印机离线'
    case PrinterStatusCode.PaperJam:
      return '打印机卡纸'
    case PrinterStatusCode.PaperOut:
      return '打印机缺纸'
    case PrinterStatusCode.Stopped:
      return '打印机已停止'
    default:
      return '打印机状态异常'
  }
}
