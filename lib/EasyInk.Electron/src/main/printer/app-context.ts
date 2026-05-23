import { EngineApi } from '../engine/engine-api'
import type { HostConfig } from './config/host-config'
import { loadHostConfig, resolveDbPath, resolveFileLogDir } from './config/host-config'
import { PrintController } from './api/print-controller'
import { AuditService } from './services/audit-service'
import { PrintDebugLogService } from './services/print-debug-log-service'
import { SimpleLogger } from './services/simple-logger'
import { HttpServer } from './server/http-server'

export interface AppContext {
  config: HostConfig
  engine: EngineApi
  printController: PrintController
  auditService: AuditService
  debugLogService: PrintDebugLogService
  logger: SimpleLogger
  httpServer?: HttpServer
}

export async function createAppContext(): Promise<AppContext> {
  const config = await loadHostConfig()
  const logger = new SimpleLogger(
    resolveFileLogDir(config.fileLogDir),
    config.printDebugLoggingEnabled,
    config.fileLogRetentionDays
  )
  const auditService = new AuditService(resolveDbPath(config.dbPath), config.auditLogRetentionDays)
  const debugLogService = new PrintDebugLogService(config)
  const engine = new EngineApi({
    maxQueueSize: config.maxQueueSize,
    printTimeoutMs: config.printTimeoutSeconds * 1000
  })
  const printController = new PrintController(engine, debugLogService)

  engine.on('log', (level, message, jobId) => {
    logger.log(level, message)
    debugLogService.appendEngineLog(jobId, level, message)
  })

  engine.on('printCompleted', (requestId, request, result, command) => {
    try {
      auditService.recordCompletion(command ?? 'print', requestId, request, result)
    } catch (err) {
      logger.error('审计日志写入失败', err)
    }

    try {
      debugLogService.writeCompletionResult(requestId, request, result)
    } catch (err) {
      logger.error('打印调试完成日志写入失败', err)
    }
  })

  const context: AppContext = {
    config,
    engine,
    printController,
    auditService,
    debugLogService,
    logger
  }

  if (config.startHttpServer) {
    const httpServer = new HttpServer(engine, printController, auditService, config)
    try {
      await httpServer.start()
      context.httpServer = httpServer
    } catch (err) {
      logger.error('HTTP 服务启动失败', err)
      await httpServer.stop()
    }
  }

  return context
}

export async function disposeAppContext(context: AppContext): Promise<void> {
  await context.httpServer?.stop()
  context.engine.dispose()
  context.debugLogService.dispose()
  context.auditService.dispose()
  context.logger.dispose()
}
