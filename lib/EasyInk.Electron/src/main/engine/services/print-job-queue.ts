import type { PrintService } from './abstractions'
import type { Logger } from './logger'
import { nullLogger } from './logger'
import { ErrorCode, JobStatus, error } from '../models'
import type { PrintJob, PrintRequestParams, PrinterResult } from '../models'

export class PrintJobQueue {
  private readonly queue: Array<{ requestId: string; request: PrintRequestParams }> = []
  private readonly jobs = new Map<string, { job: PrintJob; request: PrintRequestParams }>()
  private processing = false
  private disposed = false

  constructor(
    private readonly printService: PrintService,
    private readonly maxQueueSize = 100,
    private readonly logger: Logger = nullLogger,
    private readonly onPrintCompleted?: (
      requestId: string,
      request: PrintRequestParams,
      result: PrinterResult
    ) => void
  ) {}

  enqueue(requestId: string, request: PrintRequestParams): string {
    if (this.disposed) {
      throw new Error('打印队列已释放')
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('打印队列已满，请稍后重试')
    }

    const job: PrintJob = {
      jobId: requestId,
      printerName: request.printerName,
      status: JobStatus.Queued,
      createdAt: new Date().toISOString()
    }
    this.jobs.set(requestId, { job, request })
    this.queue.push({ requestId, request })
    void this.process()
    return requestId
  }

  getJobStatus(jobId: string): PrintJob | undefined {
    const entry = this.jobs.get(jobId)
    return entry ? cloneJob(entry.job) : undefined
  }

  getAllJobs(): PrintJob[] {
    return [...this.jobs.values()]
      .map((entry) => {
        const job = cloneJob(entry.job)
        delete job.result
        return job
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  dispose(): void {
    this.disposed = true
    this.queue.length = 0
  }

  private async process(): Promise<void> {
    if (this.processing) {
      return
    }

    this.processing = true
    try {
      while (this.queue.length > 0 && !this.disposed) {
        const item = this.queue.shift()
        if (!item) {
          continue
        }

        const entry = this.jobs.get(item.requestId)
        if (!entry) {
          continue
        }

        entry.job.status = JobStatus.Printing
        entry.job.startedAt = new Date().toISOString()

        let response: PrinterResult
        try {
          response = await this.printService.print(item.requestId, item.request)
          entry.job.result = response
          entry.job.status = response.success ? JobStatus.Completed : JobStatus.Failed
          entry.job.errorMessage = response.errorInfo?.message
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          response = error(item.requestId, ErrorCode.InternalError, message)
          entry.job.status = JobStatus.Failed
          entry.job.errorMessage = message
          this.logger.log('error', `打印任务 ${item.requestId} 失败: ${message}`, item.requestId)
        } finally {
          entry.job.completedAt = new Date().toISOString()
        }

        this.onPrintCompleted?.(item.requestId, item.request, response)
        this.purgeExpiredJobs()
      }
    } finally {
      this.processing = false
    }
  }

  private purgeExpiredJobs(): void {
    const cutoff = Date.now() - 60 * 60 * 1000
    for (const [key, entry] of this.jobs) {
      if (entry.job.completedAt && new Date(entry.job.completedAt).getTime() < cutoff) {
        this.jobs.delete(key)
      }
    }
  }
}

function cloneJob(job: PrintJob): PrintJob {
  return JSON.parse(JSON.stringify(job)) as PrintJob
}
