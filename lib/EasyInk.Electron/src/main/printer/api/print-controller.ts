import { randomUUID } from 'crypto'
import type { EngineApi } from '../../engine/engine-api'
import type { PrinterCommand, PrinterResult, PrintRequestParams } from '../../engine/models'
import type { PrintDebugLogService } from '../services/print-debug-log-service'

export class PrintController {
  constructor(
    private readonly engine: EngineApi,
    private readonly debugLogService?: PrintDebugLogService
  ) {}

  print(params: PrintRequestParams): Promise<PrinterResult> {
    return this.executeCommand('print', randomUUID(), params)
  }

  enqueuePrint(params: PrintRequestParams): Promise<PrinterResult> {
    return this.executeCommand('printAsync', randomUUID(), params)
  }

  async executeCommand(
    command: string,
    id: string,
    params: PrintRequestParams
  ): Promise<PrinterResult> {
    const request: PrinterCommand = {
      command,
      id,
      params: params as unknown as Record<string, unknown>
    }
    this.debugLogService?.beginPrintRequest(request.id, command, params)
    const result = await this.engine.handleCommand(request)
    this.debugLogService?.writeSubmitResult(request.id, result)
    return result
  }
}
