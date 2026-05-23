import { randomUUID } from 'crypto'
import type { EngineApi } from '../../engine/engine-api'
import type { PrinterCommand, PrinterResult } from '../../engine/models'

export class PrintController {
  constructor(private readonly engine: EngineApi) {}

  print(params: Record<string, unknown>): Promise<PrinterResult> {
    return this.executeCommand('print', params)
  }

  enqueuePrint(params: Record<string, unknown>): Promise<PrinterResult> {
    return this.executeCommand('printAsync', params)
  }

  private executeCommand(command: string, params: Record<string, unknown>): Promise<PrinterResult> {
    const request: PrinterCommand = {
      command,
      id: randomUUID(),
      params
    }
    return this.engine.handleCommand(request)
  }
}
