import { randomUUID } from 'crypto'
import type { EngineApi } from '../../engine/engine-api'
import { ErrorCode, error } from '../../engine/models'
import type { PrinterResult } from '../../engine/models'

export class JobController {
  constructor(private readonly engine: EngineApi) {}

  getAllJobs(): PrinterResult {
    return this.engine.getAllJobs()
  }

  getJobStatus(jobId: string): Promise<PrinterResult> | PrinterResult {
    if (!jobId) {
      return error('unknown', ErrorCode.InvalidParams, '缺少 jobId 参数')
    }

    return this.engine.handleCommand({
      command: 'getJobStatus',
      id: randomUUID(),
      params: { jobId }
    })
  }
}
