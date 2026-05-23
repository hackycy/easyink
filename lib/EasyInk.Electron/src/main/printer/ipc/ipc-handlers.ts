import { ipcMain } from 'electron'
import type { AppContext } from '../app-context'
import { randomUUID } from 'crypto'
import type { PrinterCommand, PrintRequestParams } from '../../engine/models'

export function registerIpcHandlers(context: AppContext): void {
  ipcMain.handle('easyink:getStatus', () => ({
    name: '@easyink/electron',
    httpPort: context.httpServer?.port,
    chromiumPrint: true,
    htmlPrint: true,
    viewerPrint: true,
    webSocket: Boolean(context.httpServer),
    connections: context.httpServer?.connectionCount ?? 0,
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

  ipcMain.handle('easyink:print', (_event, params: PrintRequestParams) =>
    context.printController.print(params)
  )

  ipcMain.handle('easyink:printAsync', (_event, params: PrintRequestParams) =>
    context.printController.enqueuePrint(params)
  )

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
