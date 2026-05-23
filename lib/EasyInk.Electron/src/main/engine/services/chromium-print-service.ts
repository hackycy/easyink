import { BrowserWindow } from 'electron'
import type { WebContentsPrintOptions } from 'electron'
import type { PrintService, PrinterService } from './abstractions'
import type { Logger } from './logger'
import { nullLogger } from './logger'
import { ErrorCode, JobStatus, error, ok } from '../models'
import type { PrintRequestParams, PrintResult, PrinterResult } from '../models'
import { resolvePrintSource } from './providers/print-source-provider'
import { marginsToElectron, paperSizeToMicrons } from './unit-converter'

export class ChromiumPrintService implements PrintService {
  constructor(
    private readonly printerService: PrinterService,
    private readonly logger: Logger = nullLogger,
    private readonly timeoutMs = 60000
  ) {}

  async print(
    requestId: string,
    request: PrintRequestParams,
    signal?: AbortSignal
  ): Promise<PrinterResult> {
    if (!request.printerName) {
      return error(requestId, ErrorCode.InvalidParams, '缺少 printerName 参数')
    }

    const status = await this.printerService.getPrinterStatus(request.printerName)
    if (status.statusCode === 'PRINTER_NOT_FOUND') {
      return error(requestId, ErrorCode.InvalidParams, status.message)
    }

    let source
    try {
      source = await resolvePrintSource(request)
    } catch (err) {
      return error(requestId, ErrorCode.InvalidPrintSource, getErrorMessage(err))
    }

    const printWindow = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    })

    try {
      this.throwIfAborted(signal)
      await withTimeout(
        printWindow.webContents.loadURL(source.url),
        this.timeoutMs,
        '打印内容加载超时'
      )
      this.throwIfAborted(signal)

      const printOptions = buildPrintOptions(request)
      await printWebContents(printWindow, printOptions)
      const data: PrintResult = {
        jobId: requestId,
        status: JobStatus.Completed,
        printedAt: new Date().toISOString()
      }
      this.logger.log('info', `打印完成: ${request.printerName} (${source.type})`, requestId)
      return ok(requestId, data)
    } catch (err) {
      const message = getErrorMessage(err)
      const code = message.includes('超时') ? ErrorCode.PrintTimeout : ErrorCode.PrintFailed
      this.logger.log('error', `打印失败: ${message}`, requestId)
      return error(requestId, code, message)
    } finally {
      printWindow.destroy()
      await source.cleanup()
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error('打印任务已取消')
    }
  }
}

function buildPrintOptions(request: PrintRequestParams): WebContentsPrintOptions {
  const options: WebContentsPrintOptions = {
    silent: request.silent ?? true,
    printBackground: true,
    deviceName: request.printerName,
    copies: Math.max(1, request.copies ?? 1),
    landscape: request.landscape ?? false
  }

  const pageSize = paperSizeToMicrons(request.paperSize)
  if (pageSize && request.forcePaperSize) {
    options.pageSize = pageSize
  }

  const margins = marginsToElectron(request.margins)
  if (margins) {
    options.margins = margins
  }

  return options
}

function printWebContents(window: BrowserWindow, options: WebContentsPrintOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    window.webContents.print(options, (success, failureReason) => {
      if (success) {
        resolve()
      } else {
        reject(new Error(failureReason || 'Chromium 打印失败'))
      }
    })
  })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timer]).finally(() => {
    if (timeout) {
      clearTimeout(timeout)
    }
  })
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
