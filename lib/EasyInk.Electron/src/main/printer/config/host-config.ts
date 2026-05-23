import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export interface HostConfig {
  httpPort: number
  startHttpServer: boolean
  apiKey?: string
  trustAllOrigins: boolean
  dbPath?: string
  fileLogDir?: string
  fileLogRetentionDays: number
  printDebugLoggingEnabled: boolean
  printDebugArtifactsDir?: string
  printDebugArtifactRetentionCount: number
  maxQueueSize: number
  printTimeoutSeconds: number
  auditLogRetentionDays: number
  startMinimized: boolean
  minimizeToTray: boolean
}

export const defaultHostConfig: HostConfig = {
  httpPort: 18081,
  startHttpServer: true,
  trustAllOrigins: false,
  fileLogRetentionDays: 7,
  printDebugLoggingEnabled: false,
  printDebugArtifactRetentionCount: 10,
  maxQueueSize: 100,
  printTimeoutSeconds: 60,
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

export function resolvePrintDebugArtifactsDir(dir?: string): string {
  return isBlank(dir) ? join(resolveFileLogDir(), 'print-debug') : dir!.trim()
}

export async function loadHostConfig(): Promise<HostConfig> {
  const path = getConfigPath()
  try {
    const raw = await readFile(path, 'utf8')
    return normalizeConfig(JSON.parse(raw) as Partial<HostConfig>)
  } catch {
    const config = normalizeConfig({})
    await saveHostConfig(config)
    return config
  }
}

export async function saveHostConfig(config: HostConfig): Promise<void> {
  const path = getConfigPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(normalizeConfig(config), null, 2)}\n`, 'utf8')
}

function normalizeConfig(config: Partial<HostConfig>): HostConfig {
  return {
    ...defaultHostConfig,
    ...config,
    httpPort: clampInteger(config.httpPort, 1024, 65535, defaultHostConfig.httpPort),
    fileLogRetentionDays: clampInteger(
      config.fileLogRetentionDays,
      1,
      3650,
      defaultHostConfig.fileLogRetentionDays
    ),
    printDebugArtifactRetentionCount: clampInteger(
      config.printDebugArtifactRetentionCount,
      1,
      10000,
      defaultHostConfig.printDebugArtifactRetentionCount
    ),
    maxQueueSize: clampInteger(config.maxQueueSize, 10, 1000, defaultHostConfig.maxQueueSize),
    printTimeoutSeconds: clampInteger(
      config.printTimeoutSeconds,
      5,
      600,
      defaultHostConfig.printTimeoutSeconds
    ),
    auditLogRetentionDays: clampInteger(
      config.auditLogRetentionDays,
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
