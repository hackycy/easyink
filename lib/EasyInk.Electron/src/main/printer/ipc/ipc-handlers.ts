import { app, ipcMain } from 'electron'
import type { AppContext } from '../app-context'
import { randomUUID } from 'crypto'
import { networkInterfaces } from 'os'
import type { PrinterCommand, PrintRequestParams, PrinterResult } from '../../engine/models'
import { ok } from '../../engine/models'
import {
  getConfigPath,
  resolveCrashLogDir,
  resolveDbPath,
  resolveFileLogDir,
  resolvePrintDebugArtifactsDir,
  normalizeHostConfig,
  saveHostConfig
} from '../config/host-config'
import type { HostConfig } from '../config/host-config'
import type { AuditLogQuery } from '../services/audit-service'
import { HttpServer } from '../server/http-server'

interface QueueStats {
  queued: number
  printing: number
  completed: number
  failed: number
  total: number
  maxQueueSize: number
  processing: boolean
}

export function registerIpcHandlers(context: AppContext): void {
  ipcMain.handle('easyink:getStatus', () => buildStatus(context))

  ipcMain.handle('easyink:getConfig', () => ok('config', buildConfigSnapshot(context.config)))

  ipcMain.handle('easyink:saveConfig', async (_event, patch: Partial<HostConfig>) => {
    const previousConfig = { ...context.config }
    const nextConfig = normalizeHostConfig({ ...context.config, ...patch })
    await saveHostConfig(nextConfig)
    Object.assign(context.config, nextConfig)
    app.setLoginItemSettings({
      openAtLogin: Boolean(context.config.autoStart),
      args: ['--autostart']
    })
    await syncHttpServer(context, previousConfig, nextConfig)
    return ok('config', {
      config: buildConfigSnapshot(context.config),
      restartRequired: requiresRestart(previousConfig, nextConfig)
    })
  })

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

  ipcMain.handle('easyink:getLogs', (_event, query?: number | Record<string, unknown>) => {
    if (typeof query === 'number' || query == null) {
      return context.auditService.query(query ?? 100)
    }
    return context.auditService.query(query as AuditLogQuery)
  })

  ipcMain.handle('easyink:exportLogsCsv', (_event, query?: Record<string, unknown>) => {
    const logs = context.auditService.query({
      ...(query as AuditLogQuery | undefined),
      limit: Number(query?.limit ?? 500)
    })
    return ok('logsCsv', {
      csv: toCsv(logs as unknown as Array<Record<string, unknown>>),
      count: logs.length
    })
  })

  ipcMain.handle('easyink:handleCommand', (_event, command: PrinterCommand) =>
    context.engine.handleCommand(command)
  )
}

function buildStatus(context: AppContext): PrinterResult {
  const queueStats = unwrapData<QueueStats>(
    context.engine.getQueueStats() as PrinterResult<QueueStats>
  )
  const config = buildConfigSnapshot(context.config)
  const port = context.httpServer?.port ?? context.config.httpPort
  return ok('status', {
    name: 'EasyInk Printer',
    httpPort: port,
    serviceRunning: Boolean(context.httpServer),
    serviceAddress: getLanUrls(port),
    chromiumPrint: true,
    htmlPrint: true,
    viewerPrint: true,
    webSocket: Boolean(context.httpServer),
    connections: context.httpServer?.connectionCount ?? 0,
    queue: queueStats,
    queueStatus: queueStats && (queueStats.queued > 0 || queueStats.printing > 0) ? 'Busy' : 'Idle',
    startupError: context.startupError,
    uptimeSeconds: Math.round(process.uptime()),
    deviceNumber: generateDeviceNumber(),
    appVersion: app.getVersion(),
    macAddresses: getMacAddresses(),
    config
  })
}

function buildConfigSnapshot(config: HostConfig): HostConfig & {
  configPath: string
  resolvedDbPath: string
  resolvedFileLogDir: string
  resolvedCrashLogDir: string
  resolvedPrintDebugArtifactsDir: string
} {
  return {
    ...config,
    configPath: getConfigPath(),
    resolvedDbPath: resolveDbPath(config.dbPath),
    resolvedFileLogDir: resolveFileLogDir(config.fileLogDir),
    resolvedCrashLogDir: resolveCrashLogDir(config.crashLogDir),
    resolvedPrintDebugArtifactsDir: resolvePrintDebugArtifactsDir(config.printDebugArtifactsDir)
  }
}

function unwrapData<T>(result: PrinterResult<T>): T | undefined {
  return result.success ? result.data : undefined
}

function getLanUrls(port: number): string[] {
  const urls = Object.values(networkInterfaces())
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${port}`)
  return urls.length > 0 ? urls : [`http://localhost:${port}`]
}

function getMacAddresses(): string[] {
  return Array.from(
    new Set(
      Object.values(networkInterfaces())
        .flatMap((items) => items ?? [])
        .filter((item) => !item.internal && item.mac && item.mac !== '00:00:00:00:00:00')
        .map((item) => item.mac.toUpperCase())
    )
  )
}

function generateDeviceNumber(): string {
  const mac = getMacAddresses()[0] ?? 'EASYINK'
  return mac
    .replace(/[^A-F0-9]/gi, '')
    .slice(-8)
    .padStart(8, '0')
    .toUpperCase()
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const headers = [
    'timestamp',
    'printerName',
    'status',
    'userId',
    'labelType',
    'jobId',
    'command',
    'sourceType',
    'copies',
    'paperWidth',
    'paperHeight',
    'paperUnit',
    'errorMessage'
  ]
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(','))
  }
  return lines.join('\n')
}

function csvCell(value: unknown): string {
  if (value == null) {
    return ''
  }
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

async function syncHttpServer(
  context: AppContext,
  previousConfig: HostConfig,
  nextConfig: HostConfig
): Promise<void> {
  const serverNeedsRestart =
    previousConfig.httpPort !== nextConfig.httpPort ||
    previousConfig.maxConcurrentRequests !== nextConfig.maxConcurrentRequests ||
    previousConfig.maxWebSocketConnections !== nextConfig.maxWebSocketConnections

  if (context.httpServer && (!nextConfig.startHttpServer || serverNeedsRestart)) {
    await context.httpServer.stop()
    context.httpServer = undefined
  }

  if (nextConfig.startHttpServer && !context.httpServer) {
    const httpServer = new HttpServer(
      context.engine,
      context.printController,
      context.auditService,
      context.config
    )
    try {
      await httpServer.start()
      context.httpServer = httpServer
      context.startupError = undefined
    } catch (err) {
      context.startupError = err instanceof Error ? err.message : String(err)
      context.logger.error('HTTP 服务启动失败', err)
      await httpServer.stop()
    }
  }
}

function requiresRestart(previousConfig: HostConfig, nextConfig: HostConfig): boolean {
  const restartKeys: Array<keyof HostConfig> = [
    'dbPath',
    'crashLogDir',
    'fileLogDir',
    'printDebugLoggingEnabled',
    'printDebugArtifactsDir',
    'printDebugArtifactRetentionCount',
    'auditLogRetentionDays',
    'fileLogRetentionDays',
    'maxQueueSize',
    'printTimeoutSeconds',
    'minimizeToTray',
    'startMinimized'
  ]
  return restartKeys.some((key) => previousConfig[key] !== nextConfig[key])
}
