import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export interface HostConfig {
  httpPort: number
  startHttpServer: boolean
  apiKey?: string
  trustAllOrigins: boolean
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
  maxQueueSize: 100,
  printTimeoutSeconds: 60,
  auditLogRetentionDays: 90,
  startMinimized: false,
  minimizeToTray: true
}

export function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
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

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue)) {
    return fallback
  }
  return Math.min(max, Math.max(min, numberValue))
}
