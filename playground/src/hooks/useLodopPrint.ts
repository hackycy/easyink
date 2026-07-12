import type { LodopDevice, LodopPrintRequest, LodopRuntime } from '@easyink/print-integration-lodop'
import { createLodopClient, createLodopPrinter, DEFAULT_CLODOP_SCRIPT_URLS, loadLodopScript } from '@easyink/print-integration-lodop'
import { computed, reactive, ref, watch } from 'vue'
import { playgroundViewerProfile } from '../viewer-materials'

const CONFIG_KEY = 'easyink:lodopPrintConfig'
const DEFAULT_COPIES = 1
const RUNTIME_READY_TIMEOUT_MS = 8000

export type LodopConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

export interface LodopPrintConfig {
  enabled: boolean
  manageScript: boolean
  scriptUrl: string
  runtimeName?: string
  printerName?: string
  copies: number
  forcePageSize: boolean
}

export interface LodopPrinterDevice extends LodopDevice {}

function defaultConfig(): LodopPrintConfig {
  return {
    enabled: false,
    manageScript: true,
    scriptUrl: DEFAULT_CLODOP_SCRIPT_URLS[0],
    runtimeName: undefined,
    printerName: undefined,
    copies: DEFAULT_COPIES,
    forcePageSize: true,
  }
}

function normalizeConfig(input: Partial<LodopPrintConfig> | undefined): LodopPrintConfig {
  const fallback = defaultConfig()
  return {
    enabled: input?.enabled ?? fallback.enabled,
    manageScript: input?.manageScript ?? fallback.manageScript,
    scriptUrl: input?.scriptUrl || fallback.scriptUrl,
    runtimeName: normalizeOptionalString(input?.runtimeName),
    printerName: input?.printerName,
    copies: normalizeCopies(input?.copies),
    forcePageSize: input?.forcePageSize ?? fallback.forcePageSize,
  }
}

function loadConfig(): LodopPrintConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw)
      return defaultConfig()
    return normalizeConfig(JSON.parse(raw) as Partial<LodopPrintConfig>)
  }
  catch {
    return defaultConfig()
  }
}

function persistConfig(snapshot: LodopPrintConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(snapshot))
  }
  catch { /* quota */ }
}

const config = reactive<LodopPrintConfig>(loadConfig())
const connectionState = ref<LodopConnectionState>('idle')
const lastError = ref('')
const devices = ref<LodopPrinterDevice[]>([])

const client = createLodopClient({
  getLodop: resolveConfiguredRuntime,
  script: false,
  printerName: config.printerName,
  defaultCopies: config.copies,
  forcePageSize: config.forcePageSize,
})

const printer = createLodopPrinter({
  profile: playgroundViewerProfile,
  client,
  viewer: 'iframe',
  printerName: () => config.printerName,
  copies: () => config.copies,
  forcePageSize: () => config.forcePageSize,
})

let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(config, (value) => {
  if (saveTimer)
    clearTimeout(saveTimer)

  saveTimer = setTimeout(persistConfig, 200, { ...value })
  client.configure({
    printerName: value.printerName,
    defaultCopies: value.copies,
    forcePageSize: value.forcePageSize,
  })
  syncState()
}, { deep: true })

function syncState() {
  devices.value = [...client.devices]
  config.printerName = client.printerName
  config.forcePageSize = client.forcePageSize
}

async function connect(): Promise<void> {
  connectionState.value = 'connecting'
  lastError.value = ''

  try {
    const scriptUrl = normalizeScriptUrl(config.scriptUrl)

    if (config.manageScript) {
      await loadLodopScript({
        src: scriptUrl,
        name: normalizeOptionalString(config.runtimeName),
        timeoutMs: RUNTIME_READY_TIMEOUT_MS,
      })
    }

    await client.ready()
    connectionState.value = 'connected'
    await refreshDevices()
  }
  catch (error) {
    connectionState.value = 'error'
    lastError.value = error instanceof Error ? error.message : 'LODOP 不可用'
    throw error
  }
  finally {
    syncState()
  }
}

function disconnect(): void {
  connectionState.value = 'idle'
  lastError.value = ''
  devices.value = []
}

async function refreshDevices(): Promise<LodopPrinterDevice[]> {
  const list = await client.listPrinters()
  syncState()
  return list
}

async function testAvailability(): Promise<LodopRuntime> {
  await connect()
  return client.getRuntime()
}

function setEnabled(enabled: boolean): void {
  config.enabled = enabled
  if (enabled) {
    connect().catch(() => { /* surfaced via state */ })
  }
  else {
    disconnect()
  }
}

function updateConfig(patch: Partial<LodopPrintConfig>): void {
  Object.assign(config, {
    ...patch,
    runtimeName: 'runtimeName' in patch ? normalizeOptionalString(patch.runtimeName) : config.runtimeName,
    scriptUrl: 'scriptUrl' in patch ? String(patch.scriptUrl ?? '') : config.scriptUrl,
    copies: 'copies' in patch ? normalizeCopies(patch.copies) : config.copies,
  })
}

async function print(input: LodopPrintRequest): Promise<void> {
  if (connectionState.value !== 'connected')
    await connect()

  await printer.print({
    ...input,
    printerName: input.printerName ?? config.printerName,
    copies: input.copies ?? config.copies,
    forcePageSize: input.forcePageSize ?? config.forcePageSize,
  })
  syncState()
}

function resolveConfiguredRuntime(): LodopRuntime | undefined {
  const runtimeName = normalizeOptionalString(config.runtimeName)
  const globalWindow = globalThis as Record<string, unknown>

  if (runtimeName) {
    const named = globalWindow[runtimeName]
    if (isLodopRuntime(named))
      return named

    const namedGetter = globalWindow[`get${runtimeName}`]
    if (typeof namedGetter === 'function') {
      const runtime = (namedGetter as () => LodopRuntime | undefined)()
      if (runtime)
        return runtime
    }
  }

  const getLodop = globalWindow.getLodop
  if (typeof getLodop === 'function') {
    const runtime = (getLodop as () => LodopRuntime | undefined)()
    if (runtime)
      return runtime
  }

  const getCLodop = globalWindow.getCLodop
  if (typeof getCLodop === 'function') {
    const runtime = (getCLodop as () => LodopRuntime | undefined)()
    if (runtime)
      return runtime
  }

  return isLodopRuntime(globalWindow.CLODOP) ? globalWindow.CLODOP : undefined
}

function isLodopRuntime(value: unknown): value is LodopRuntime {
  return Boolean(value && typeof value === 'object' && ('VERSION' in value || 'CVERSION' in value))
}

function normalizeCopies(value: unknown): number {
  const copies = Number(value)
  return Number.isFinite(copies) && copies >= 1 ? Math.min(99, Math.trunc(copies)) : DEFAULT_COPIES
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeScriptUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  const fallback = DEFAULT_CLODOP_SCRIPT_URLS[0]
  if (!raw)
    return fallback

  if (/\/(?:C?Lodopfuncs|Lodop)\.js(?:[?#].*)?$/i.test(raw))
    return raw

  return `${raw.replace(/\/+$/, '')}/CLodopfuncs.js`
}

if (config.enabled) {
  Promise.resolve().then(() => connect().catch(() => { /* surfaced via state */ }))
}

export function useLodopPrint() {
  return {
    client,
    printer,
    config,
    connectionState: computed(() => connectionState.value),
    isConnected: computed(() => connectionState.value === 'connected'),
    isConnecting: computed(() => connectionState.value === 'connecting'),
    isError: computed(() => connectionState.value === 'error'),
    lastError: computed(() => lastError.value),
    devices: computed(() => devices.value),
    enabled: computed(() => config.enabled),
    manageScript: computed(() => config.manageScript),
    scriptUrl: computed(() => config.scriptUrl),
    runtimeName: computed(() => config.runtimeName),
    printerName: computed(() => config.printerName),
    copies: computed(() => config.copies),
    forcePageSize: computed(() => config.forcePageSize),

    connect,
    disconnect,
    refreshDevices,
    setEnabled,
    testAvailability,
    updateConfig,
    print,
  }
}

export type LodopPrintStore = ReturnType<typeof useLodopPrint>
