import type { DocumentSchema } from '@easyink/designer'
import type { RenderApiFailure, RenderApiRequest, RenderRuntimeOptions } from '@easyink/render-api-service'
import { computed, reactive, ref, watch } from 'vue'

export type RenderApiConnectionState = 'idle' | 'checking' | 'connected' | 'error'

export interface RenderApiServiceConfig {
  enabled: boolean
  serviceUrl: string
  includeDiagnostics: boolean
  noDaemon: boolean
  disableSandbox: boolean
  requestTimeoutMs?: number
  browserKind?: string
  browserPath?: string
}

export interface RenderApiServiceHealth {
  ok: boolean
  service: string
  uptimeMs: number
}

export interface RenderApiPdfResult {
  pdf: Blob
  requestId?: string
  pageCount?: number
  diagnosticsPath?: string
}

const CONFIG_KEY = 'easyink:renderApiServiceConfig'
const DEFAULT_RENDER_API_SERVICE_URL = 'http://127.0.0.1:18081'

function defaultConfig(): RenderApiServiceConfig {
  return {
    enabled: false,
    serviceUrl: DEFAULT_RENDER_API_SERVICE_URL,
    includeDiagnostics: false,
    noDaemon: false,
    disableSandbox: false,
  }
}

function normalizeConfig(input: Partial<RenderApiServiceConfig> = {}): RenderApiServiceConfig {
  const requestTimeoutMs = normalizePositiveInteger(input.requestTimeoutMs)
  return {
    enabled: Boolean(input.enabled),
    serviceUrl: normalizeServiceUrl(input.serviceUrl) ?? DEFAULT_RENDER_API_SERVICE_URL,
    includeDiagnostics: Boolean(input.includeDiagnostics),
    noDaemon: Boolean(input.noDaemon),
    disableSandbox: Boolean(input.disableSandbox),
    requestTimeoutMs,
    browserKind: normalizeOptionalString(input.browserKind),
    browserPath: normalizeOptionalString(input.browserPath),
  }
}

function loadConfig(): RenderApiServiceConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw)
      return defaultConfig()
    return normalizeConfig(JSON.parse(raw) as Partial<RenderApiServiceConfig>)
  }
  catch {
    return defaultConfig()
  }
}

function persistConfig(config: RenderApiServiceConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(normalizeConfig(config)))
  }
  catch { /* quota */ }
}

function normalizeServiceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed || undefined
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined
}

function buildRuntime(config: RenderApiServiceConfig): RenderRuntimeOptions | undefined {
  const runtime: RenderRuntimeOptions = {
    noDaemon: config.noDaemon || undefined,
    disableSandbox: config.disableSandbox || undefined,
    requestTimeoutMs: config.requestTimeoutMs,
    browserKind: config.browserKind,
    browserPath: config.browserPath,
  }
  return Object.values(runtime).some(value => value !== undefined) ? runtime : undefined
}

const config = reactive<RenderApiServiceConfig>(loadConfig())
const connectionState = ref<RenderApiConnectionState>('idle')
const lastError = ref<string>()
const health = ref<RenderApiServiceHealth>()

let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(config, (value) => {
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(persistConfig, 200, { ...value })
}, { deep: true })

function endpoint(path: string): string {
  return `${normalizeServiceUrl(config.serviceUrl) ?? DEFAULT_RENDER_API_SERVICE_URL}${path}`
}

async function checkHealth(): Promise<RenderApiServiceHealth> {
  connectionState.value = 'checking'
  lastError.value = undefined
  try {
    const response = await fetch(endpoint('/health'), { method: 'GET' })
    const data = await response.json() as RenderApiServiceHealth
    if (!response.ok || !data.ok)
      throw new Error('Render API 服务未就绪')
    health.value = data
    connectionState.value = 'connected'
    return data
  }
  catch (error) {
    connectionState.value = 'error'
    lastError.value = error instanceof Error ? error.message : '连接 Render API 服务失败'
    throw error
  }
}

function setEnabled(enabled: boolean) {
  config.enabled = enabled
  if (enabled)
    checkHealth().catch(() => { /* surfaced via state */ })
  else
    connectionState.value = 'idle'
}

function updateConfig(patch: Partial<RenderApiServiceConfig>) {
  Object.assign(config, normalizeConfig({ ...config, ...patch }))
}

async function renderPdf(request: RenderApiRequest): Promise<RenderApiPdfResult> {
  const response = await fetch(endpoint('/v1/render/pdf'), {
    method: 'POST',
    headers: {
      'accept': 'application/pdf',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      response: {
        type: 'pdf',
        includeDiagnostics: config.includeDiagnostics,
        ...request.response,
      },
      runtime: {
        ...buildRuntime(config),
        ...request.runtime,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(await readFailureMessage(response))
  }

  return {
    pdf: await response.blob(),
    requestId: response.headers.get('x-easyink-request-id') ?? undefined,
    pageCount: normalizePositiveInteger(response.headers.get('x-easyink-page-count')),
    diagnosticsPath: response.headers.get('x-easyink-diagnostics-path') ?? undefined,
  }
}

async function readFailureMessage(response: Response): Promise<string> {
  try {
    const data = await response.json() as RenderApiFailure
    return data.error?.message || `Render API 请求失败 (${response.status})`
  }
  catch {
    return `Render API 请求失败 (${response.status})`
  }
}

async function renderSchema(input: { schema: DocumentSchema, data: Record<string, unknown>, requestId?: string }): Promise<RenderApiPdfResult> {
  return renderPdf({
    requestId: input.requestId ?? `playground-schema-${Date.now()}`,
    source: {
      type: 'easyink',
      schema: input.schema,
      data: input.data,
      fileName: 'easyink-playground-schema',
    },
  })
}

async function renderHtml(input: { html: string, baseUrl?: string, requestId?: string }): Promise<RenderApiPdfResult> {
  return renderPdf({
    requestId: input.requestId ?? `playground-html-${Date.now()}`,
    source: {
      type: 'html',
      html: input.html,
      baseUrl: input.baseUrl,
      fileName: 'easyink-playground-html',
    },
  })
}

if (config.enabled) {
  Promise.resolve().then(() => checkHealth().catch(() => { /* surfaced via state */ }))
}

export function useRenderApiService() {
  return {
    config,
    connectionState: computed(() => connectionState.value),
    enabled: computed(() => config.enabled),
    health: computed(() => health.value),
    includeDiagnostics: computed(() => config.includeDiagnostics),
    isChecking: computed(() => connectionState.value === 'checking'),
    isConnected: computed(() => connectionState.value === 'connected'),
    isError: computed(() => connectionState.value === 'error'),
    lastError: computed(() => lastError.value),
    serviceUrl: computed(() => config.serviceUrl),

    checkHealth,
    renderHtml,
    renderSchema,
    setEnabled,
    updateConfig,
  }
}

export type RenderApiServiceStore = ReturnType<typeof useRenderApiService>
