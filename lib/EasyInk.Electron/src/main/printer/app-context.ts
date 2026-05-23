import { EngineApi } from '../engine/engine-api'
import type { HostConfig } from './config/host-config'
import { loadHostConfig } from './config/host-config'
import { AuditService } from './services/audit-service'
import { HttpServer } from './server/http-server'

export interface AppContext {
  config: HostConfig
  engine: EngineApi
  auditService: AuditService
  httpServer?: HttpServer
}

export async function createAppContext(): Promise<AppContext> {
  const config = await loadHostConfig()
  const auditService = new AuditService(config.auditLogRetentionDays)
  const engine = new EngineApi({
    maxQueueSize: config.maxQueueSize,
    printTimeoutMs: config.printTimeoutSeconds * 1000
  })

  const context: AppContext = {
    config,
    engine,
    auditService
  }

  if (config.startHttpServer) {
    context.httpServer = new HttpServer(engine, auditService, config)
    await context.httpServer.start()
  }

  return context
}

export async function disposeAppContext(context: AppContext): Promise<void> {
  await context.httpServer?.stop()
  context.engine.dispose()
}
