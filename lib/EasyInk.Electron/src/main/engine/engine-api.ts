import { EventEmitter } from 'events'
import type { PrintService, PrinterService } from './services/abstractions'
import { ChromiumPrintService } from './services/chromium-print-service'
import { ChromiumPrinterService } from './services/chromium-printer-service'
import { PrintJobQueue } from './services/print-job-queue'
import { ErrorCode, JobStatus, error, ok } from './models'
import type { PrintRequestParams, PrinterCommand, PrinterResult } from './models'
import type { Logger, LogLevel } from './services/logger'

export interface EngineApiOptions {
  printerService?: PrinterService
  printService?: PrintService
  maxQueueSize?: number
  printTimeoutMs?: number
}

export interface EngineApiEvents {
  log: [LogLevel, string, string?]
  printCompleted: [string, PrintRequestParams, PrinterResult]
}

export class EngineApi extends EventEmitter {
  private readonly printerService: PrinterService
  private readonly printService: PrintService
  private readonly jobQueue: PrintJobQueue
  private readonly logger: Logger

  constructor(options: EngineApiOptions = {}) {
    super()
    this.logger = {
      log: (level, message, jobId) => this.emit('log', level, message, jobId)
    }
    this.printerService = options.printerService ?? new ChromiumPrinterService()
    this.printService =
      options.printService ??
      new ChromiumPrintService(this.printerService, this.logger, options.printTimeoutMs)
    this.jobQueue = new PrintJobQueue(
      this.printService,
      options.maxQueueSize ?? 100,
      this.logger,
      (requestId, request, result) => this.emit('printCompleted', requestId, request, result)
    )
  }

  override on<K extends keyof EngineApiEvents>(
    eventName: K,
    listener: (...args: EngineApiEvents[K]) => void
  ): this {
    return super.on(eventName, listener)
  }

  async getPrinters(): Promise<PrinterResult> {
    return ok('printers', await this.printerService.getPrinters())
  }

  async getPrinterStatus(printerName: string): Promise<PrinterResult> {
    if (!printerName) {
      return error('unknown', ErrorCode.InvalidParams, '缺少 printerName 参数')
    }
    return ok('unknown', await this.printerService.getPrinterStatus(printerName))
  }

  getJobStatus(jobId: string): PrinterResult {
    const info = this.jobQueue.getJobStatus(jobId)
    if (!info) {
      return error(jobId, ErrorCode.JobNotFound, `任务不存在: ${jobId}`)
    }
    return ok(jobId, info)
  }

  getAllJobs(): PrinterResult {
    return ok('all', this.jobQueue.getAllJobs())
  }

  async handleCommandJson(json: string): Promise<PrinterResult> {
    try {
      return await this.handleCommand(JSON.parse(json) as PrinterCommand)
    } catch {
      return error('unknown', ErrorCode.InvalidJson, '无效的 JSON')
    }
  }

  async handleCommand(request: PrinterCommand): Promise<PrinterResult> {
    switch (request.command) {
      case 'getPrinters':
        return ok(request.id, await this.printerService.getPrinters())
      case 'getPrinterStatus':
        return this.handleGetPrinterStatus(request)
      case 'print':
        return this.handlePrint(request)
      case 'printAsync':
        return this.handleEnqueuePrint(request)
      case 'getJobStatus':
        return this.handleGetJobStatus(request)
      case 'getAllJobs':
        return ok(request.id, this.jobQueue.getAllJobs())
      default:
        return error(request.id, ErrorCode.UnknownCommand, `未知命令: ${request.command}`)
    }
  }

  dispose(): void {
    this.jobQueue.dispose()
    if ('dispose' in this.printerService && typeof this.printerService.dispose === 'function') {
      this.printerService.dispose()
    }
  }

  private async handleGetPrinterStatus(request: PrinterCommand): Promise<PrinterResult> {
    const printerName = getParam<string>(request, 'printerName')
    if (!printerName) {
      return error(request.id, ErrorCode.InvalidParams, '缺少 printerName 参数')
    }
    return ok(request.id, await this.printerService.getPrinterStatus(printerName))
  }

  private async handlePrint(request: PrinterCommand): Promise<PrinterResult> {
    const printParams = extractPrintParams(request)
    if (!printParams) {
      return error(request.id, ErrorCode.InvalidParams, '缺少打印参数或格式错误')
    }

    const result = await this.printService.print(request.id, printParams)
    this.emit('printCompleted', request.id, printParams, result)
    return result
  }

  private handleEnqueuePrint(request: PrinterCommand): PrinterResult {
    const printParams = extractPrintParams(request)
    if (!printParams) {
      return error(request.id, ErrorCode.InvalidParams, '缺少打印参数或格式错误')
    }

    try {
      const jobId = this.jobQueue.enqueue(request.id, printParams)
      return ok(request.id, { jobId, status: JobStatus.Queued })
    } catch (err) {
      return error(
        request.id,
        ErrorCode.QueueFull,
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  private handleGetJobStatus(request: PrinterCommand): PrinterResult {
    const jobId = getParam<string>(request, 'jobId')
    if (!jobId) {
      return error(request.id, ErrorCode.InvalidParams, '缺少 jobId 参数')
    }
    return this.getJobStatus(jobId)
  }
}

function extractPrintParams(request: PrinterCommand): PrintRequestParams | undefined {
  if (!request.params || Object.keys(request.params).length === 0) {
    return undefined
  }
  return request.params as unknown as PrintRequestParams
}

function getParam<T>(request: PrinterCommand, key: string): T | undefined {
  return request.params?.[key] as T | undefined
}
