import type { RenderRuntimeOptions } from './protocol'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { config as loadDotenvFile } from 'dotenv'

export const DEFAULT_RENDER_API_HOST = '127.0.0.1'
export const DEFAULT_RENDER_API_PORT = 18081
export const DEFAULT_CLI_TIMEOUT_MS = 120_000
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024
export const DEFAULT_RENDER_API_CORS_ORIGIN = '*'

export interface RenderProcessConfig {
  binary?: string
  workDir?: string
  keepWorkDir: boolean
  cliTimeoutMs: number
  defaultRuntime: RenderRuntimeOptions
}

export interface RenderApiConfig extends RenderProcessConfig {
  host: string
  port: number
  maxBodyBytes: number
  corsOrigin: string
}

export class RenderConfigError extends Error {
  readonly variable: string

  constructor(variable: string, message: string) {
    super(message)
    this.name = 'RenderConfigError'
    this.variable = variable
  }
}

type Env = Record<string, string | undefined>

export interface LoadRenderApiEnvOptions {
  envDir?: string
  nodeEnv?: string
  baseEnv?: Env
}

export function loadRenderApiEnv(options: LoadRenderApiEnvOptions = {}): Env {
  const baseEnv = options.baseEnv ?? process.env
  const nodeEnv = options.nodeEnv ?? baseEnv.NODE_ENV
  const envDir = options.envDir ?? process.cwd()
  const loadedEnv: Record<string, string> = {}

  for (const envPath of getDotenvPaths(envDir, nodeEnv)) {
    if (existsSync(envPath)) {
      loadDotenvFile({
        path: envPath,
        processEnv: loadedEnv,
        override: true,
        quiet: true,
      })
    }
  }

  return { ...loadedEnv, ...baseEnv }
}

export function loadRenderApiConfig(env: Env = loadRenderApiEnv()): RenderApiConfig {
  return {
    host: readString(env, 'EASYINK_RENDER_API_HOST') ?? DEFAULT_RENDER_API_HOST,
    port: readNumber(env, 'EASYINK_RENDER_API_PORT', DEFAULT_RENDER_API_PORT),
    binary: readString(env, 'EASYINK_RENDER_BIN'),
    workDir: readString(env, 'EASYINK_RENDER_API_WORK_DIR'),
    keepWorkDir: readBoolean(env, 'EASYINK_RENDER_API_KEEP_WORK_DIR', false),
    cliTimeoutMs: readNumber(env, 'EASYINK_RENDER_API_CLI_TIMEOUT_MS', DEFAULT_CLI_TIMEOUT_MS),
    maxBodyBytes: readNumber(env, 'EASYINK_RENDER_API_MAX_BODY_BYTES', DEFAULT_MAX_BODY_BYTES),
    corsOrigin: readString(env, 'EASYINK_RENDER_API_CORS_ORIGIN') ?? DEFAULT_RENDER_API_CORS_ORIGIN,
    defaultRuntime: loadDefaultRuntime(env),
  }
}

function getDotenvPaths(envDir: string, nodeEnv: string | undefined): string[] {
  const paths = [
    join(envDir, '.env'),
    join(envDir, '.env.local'),
  ]
  if (nodeEnv) {
    paths.push(
      join(envDir, `.env.${nodeEnv}`),
      join(envDir, `.env.${nodeEnv}.local`),
    )
  }
  return paths
}

function loadDefaultRuntime(env: Env): RenderRuntimeOptions {
  return compactRuntime({
    noDaemon: readOptionalBoolean(env, 'EASYINK_RENDER_NO_DAEMON'),
    forceRestartDaemon: readOptionalBoolean(env, 'EASYINK_RENDER_FORCE_RESTART_DAEMON'),
    disableSandbox: readOptionalBoolean(env, 'EASYINK_RENDER_DISABLE_SANDBOX'),
    browserKind: readString(env, 'EASYINK_RENDER_BROWSER_KIND'),
    browserPath: readString(env, 'EASYINK_RENDER_BROWSER_PATH'),
    headlessMode: readString(env, 'EASYINK_RENDER_HEADLESS_MODE'),
    profileRoot: readString(env, 'EASYINK_RENDER_PROFILE_ROOT'),
    tempDir: readString(env, 'EASYINK_RENDER_TEMP_DIR'),
    logDir: readString(env, 'EASYINK_RENDER_LOG_DIR'),
    maxConcurrency: readOptionalNumber(env, 'EASYINK_RENDER_MAX_CONCURRENCY'),
    maxQueueSize: readOptionalNumber(env, 'EASYINK_RENDER_MAX_QUEUE_SIZE'),
    requestTimeoutMs: readOptionalNumber(env, 'EASYINK_RENDER_REQUEST_TIMEOUT_MS'),
    idleTimeoutMs: readOptionalNumber(env, 'EASYINK_RENDER_IDLE_TIMEOUT_MS'),
  })
}

function compactRuntime(runtime: RenderRuntimeOptions): RenderRuntimeOptions {
  const result: RenderRuntimeOptions = {}
  for (const [key, value] of Object.entries(runtime) as [keyof RenderRuntimeOptions, RenderRuntimeOptions[keyof RenderRuntimeOptions]][]) {
    if (value !== undefined) {
      result[key] = value as never
    }
  }
  return result
}

function readString(env: Env, name: string): string | undefined {
  const value = env[name]?.trim()
  return value || undefined
}

function readNumber(env: Env, name: string, defaultValue: number): number {
  return readOptionalNumber(env, name) ?? defaultValue
}

function readOptionalNumber(env: Env, name: string): number | undefined {
  const value = readString(env, name)
  if (value === undefined) {
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new RenderConfigError(name, `${name} must be a positive number`)
  }
  return parsed
}

function readBoolean(env: Env, name: string, defaultValue: boolean): boolean {
  return readOptionalBoolean(env, name) ?? defaultValue
}

function readOptionalBoolean(env: Env, name: string): boolean | undefined {
  const value = readString(env, name)?.toLowerCase()
  if (value === undefined) {
    return undefined
  }
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true
  }
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false
  }
  throw new RenderConfigError(name, `${name} must be a boolean value`)
}
