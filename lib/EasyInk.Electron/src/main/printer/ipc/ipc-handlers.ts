import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { AppContext } from '../app-context'
import type { PrinterCommand, PrintRequestParams } from '../../engine/models'

export function registerIpcHandlers(context: AppContext): void {
  ipcMain.handle('easyink:getStatus', () => ({
    name: '@easyink/electron',
    httpPort: context.httpServer?.port,
    chromiumPrint: true,
    htmlPrint: true,
    config: context.config
  }))

  ipcMain.handle('easyink:getPrinters', () =>
    context.engine.handleCommand({
      command: 'getPrinters',
      id: randomUUID()
    })
  )

  ipcMain.handle('easyink:getPrinterStatus', (_event, printerName: string) =>
    context.engine.handleCommand({
      command: 'getPrinterStatus',
      id: randomUUID(),
      params: { printerName }
    })
  )

  ipcMain.handle('easyink:print', async (_event, params: PrintRequestParams) => {
    const request: PrinterCommand = {
      command: 'print',
      id: randomUUID(),
      params: params as unknown as Record<string, unknown>
    }
    const result = await context.engine.handleCommand(request)
    context.auditService.record('print', params, result)
    return result
  })

  ipcMain.handle('easyink:printAsync', async (_event, params: PrintRequestParams) => {
    const request: PrinterCommand = {
      command: 'printAsync',
      id: randomUUID(),
      params: params as unknown as Record<string, unknown>
    }
    const result = await context.engine.handleCommand(request)
    context.auditService.record('printAsync', params, result)
    return result
  })

  ipcMain.handle('easyink:getAllJobs', () =>
    context.engine.handleCommand({
      command: 'getAllJobs',
      id: randomUUID()
    })
  )

  ipcMain.handle('easyink:getJobStatus', (_event, jobId: string) =>
    context.engine.handleCommand({
      command: 'getJobStatus',
      id: randomUUID(),
      params: { jobId }
    })
  )

  ipcMain.handle('easyink:getLogs', (_event, limit?: number) => context.auditService.query(limit))

  ipcMain.handle('easyink:handleCommand', (_event, command: PrinterCommand) =>
    context.engine.handleCommand(command)
  )
}
