import { randomUUID } from 'crypto'
import type { EngineApi } from '../../engine/engine-api'
import { ErrorCode, error } from '../../engine/models'
import type { PrinterResult } from '../../engine/models'

export class PrinterController {
  constructor(private readonly engine: EngineApi) {}

  getPrinters(): Promise<PrinterResult> {
    return this.engine.handleCommand({ command: 'getPrinters', id: randomUUID() })
  }

  getPrinterStatus(printerName: string): Promise<PrinterResult> {
    if (!printerName) {
      return Promise.resolve(error('unknown', ErrorCode.InvalidParams, '缺少 printerName 参数'))
    }

    return this.engine.handleCommand({
      command: 'getPrinterStatus',
      id: randomUUID(),
      params: { printerName }
    })
  }
}
