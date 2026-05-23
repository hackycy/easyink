import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export interface HostConfig {
  httpPort: number
  startHttpServer: boolean
  autoStart: boolean
  apiKey?: string
  trustAllOrigins: boolean
  dbPath?: string
  crashLogDir?: string
  fileLogDir?: string
  fileLogRetentionDays: number
  printDebugLoggingEnabled: boolean
  printDebugArtifactsDir?: string
  printDebugArtifactRetentionCount: number
  language: '' | 'en-US'
  maxQueueSize: number
  printTimeoutSeconds: number
  maxConcurrentRequests: number
  maxWebSocketConnections: number
  auditLogRetentionDays: number
  startMinimized: boolean
  minimizeToTray: boolean
}

export const defaultHostConfig: HostConfig = {
  httpPort: 18081,
  startHttpServer: true,
  autoStart: false,
  trustAllOrigins: false,
  fileLogRetentionDays: 7,
  printDebugLoggingEnabled: false,
  printDebugArtifactRetentionCount: 10,
  language: '',
  maxQueueSize: 100,
  printTimeoutSeconds: 60,
  maxConcurrentRequests: 50,
  maxWebSocketConnections: 100,
  auditLogRetentionDays: 90,
  startMinimized: false,
  minimizeToTray: true
}

export function getUserDataPath(): string {
  return process.env.EASYINK_ELECTRON_USER_DATA_DIR || app.getPath('userData')
}

export function getConfigPath(): string {
  return join(getUserDataPath(), 'config.json')
}

export function resolveDbPath(dbPath?: string): string {
  return isBlank(dbPath) ? join(getUserDataPath(), 'data', 'audit.db') : dbPath!.trim()
}

export function resolveFileLogDir(logDir?: string): string {
  return isBlank(logDir) ? join(getUserDataPath(), 'data', 'logs') : logDir!.trim()
}

export function resolveCrashLogDir(crashLogDir?: string): string {
  return isBlank(crashLogDir) ? join(getUserDataPath(), 'data', 'crash') : crashLogDir!.trim()
}

export function resolvePrintDebugArtifactsDir(dir?: string): string {
  return isBlank(dir) ? join(resolveFileLogDir(), 'print-debug') : dir!.trim()
}

export async function loadHostConfig(): Promise<HostConfig> {
  const path = getConfigPath()
  try {
    const raw = await readFile(path, 'utf8')
    return normalizeHostConfig(JSON.parse(raw) as Partial<HostConfig>)
  } catch {
    const config = normalizeHostConfig({})
    await saveHostConfig(config)
    return config
  }
}

export async function saveHostConfig(config: HostConfig): Promise<void> {
  const path = getConfigPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(normalizeHostConfig(config), null, 2)}\n`, 'utf8')
}

export function normalizeHostConfig(config: Partial<HostConfig>): HostConfig {
  const merged = { ...defaultHostConfig, ...config }
  return {
    startHttpServer: merged.startHttpServer,
    autoStart: merged.autoStart,
    apiKey: merged.apiKey,
    trustAllOrigins: merged.trustAllOrigins,
    dbPath: merged.dbPath,
    crashLogDir: merged.crashLogDir,
    fileLogDir: merged.fileLogDir,
    printDebugLoggingEnabled: merged.printDebugLoggingEnabled,
    printDebugArtifactsDir: merged.printDebugArtifactsDir,
    startMinimized: merged.startMinimized,
    minimizeToTray: merged.minimizeToTray,
    httpPort: clampInteger(merged.httpPort, 1024, 65535, defaultHostConfig.httpPort),
    fileLogRetentionDays: clampInteger(
      merged.fileLogRetentionDays,
      1,
      3650,
      defaultHostConfig.fileLogRetentionDays
    ),
    language: merged.language === 'en-US' ? 'en-US' : '',
    printDebugArtifactRetentionCount: clampInteger(
      merged.printDebugArtifactRetentionCount,
      1,
      10000,
      defaultHostConfig.printDebugArtifactRetentionCount
    ),
    maxQueueSize: clampInteger(merged.maxQueueSize, 10, 1000, defaultHostConfig.maxQueueSize),
    printTimeoutSeconds: clampInteger(
      merged.printTimeoutSeconds,
      5,
      600,
      defaultHostConfig.printTimeoutSeconds
    ),
    maxConcurrentRequests: clampInteger(
      merged.maxConcurrentRequests,
      5,
      1000,
      defaultHostConfig.maxConcurrentRequests
    ),
    maxWebSocketConnections: clampInteger(
      merged.maxWebSocketConnections,
      10,
      10000,
      defaultHostConfig.maxWebSocketConnections
    ),
    auditLogRetentionDays: clampInteger(
      merged.auditLogRetentionDays,
      1,
      3650,
      defaultHostConfig.auditLogRetentionDays
    )
  }
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue)) {
    return fallback
  }
  return Math.min(max, Math.max(min, numberValue))
}
