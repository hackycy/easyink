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
      statusCode: mapPrinterStatus(readPrinterStatus(printer.options)),
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
      message: printer.statusCode === PrinterStatusCode.Ready ? '打印机就绪' : '打印机状态异常'
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

function mapPrinterStatus(status?: number): PrinterStatusCode {
  if (status == null || status === 0) {
    return PrinterStatusCode.Ready
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
