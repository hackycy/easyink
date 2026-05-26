import type { EasyInkPrinterDevice, EasyInkPrinterJob, EasyInkPrinterOffset, EasyInkPrinterPaperSize, EasyInkPrinterPrintHtmlOptions, EasyInkPrinterPrintRenderOptions, EasyInkPrinterPrintRequest, EasyInkPrinterUserData } from '@easyink/print-integration-easyink-printer'
import { toMillimeters } from '@easyink/print-core'
import { createEasyInkPrinter, createEasyInkPrinterClient, DEFAULT_EASYINK_PRINTER_URL } from '@easyink/print-integration-easyink-printer'
import { computed, reactive, ref, watch } from 'vue'

const CONFIG_KEY = 'easyink:printServiceConfig'
const DEFAULT_AUDIT_USER_DATA: EasyInkPrinterUserData = {
  userId: 'demo-user-001',
  documentType: 'receipt',
}

export interface PrintServiceDevice extends EasyInkPrinterDevice {}

export interface PaperSizeParams extends EasyInkPrinterPaperSize {}

export interface OffsetParams extends EasyInkPrinterOffset {}

export interface PrintJobInfo extends EasyInkPrinterJob {}

export interface PrintServiceConfig {
  enabled: boolean
  serviceUrl: string
  apiKey?: string
  printerName?: string
  copies: number
  forcePageSize?: boolean
  userData?: EasyInkPrinterUserData
}

function defaultConfig(): PrintServiceConfig {
  return {
    enabled: false,
    serviceUrl: DEFAULT_EASYINK_PRINTER_URL,
    copies: 1,
    forcePageSize: false,
    userData: { ...DEFAULT_AUDIT_USER_DATA },
  }
}

function normalizeUserData(input: unknown): EasyInkPrinterUserData | undefined {
  if (!input || typeof input !== 'object')
    return undefined

  const record = input as { userId?: unknown, documentType?: unknown }
  const userId = typeof record.userId === 'string' ? record.userId.trim() : ''
  const documentType = typeof record.documentType === 'string' ? record.documentType.trim() : ''

  if (!userId && !documentType)
    return undefined

  return {
    userId: userId || undefined,
    documentType: documentType || undefined,
  }
}

function loadConfig(): PrintServiceConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw)
      return defaultConfig()
    const parsed = JSON.parse(raw) as Partial<PrintServiceConfig>
    return {
      enabled: parsed.enabled ?? false,
      serviceUrl: parsed.serviceUrl ?? DEFAULT_EASYINK_PRINTER_URL,
      apiKey: parsed.apiKey,
      printerName: parsed.printerName,
      copies: parsed.copies ?? 1,
      forcePageSize: parsed.forcePageSize ?? false,
      userData: normalizeUserData(parsed.userData),
    }
  }
  catch {
    return defaultConfig()
  }
}

function persistConfig(cfg: PrintServiceConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  }
  catch { /* quota */ }
}

const config = reactive<PrintServiceConfig>(loadConfig())
const client = createEasyInkPrinterClient({
  serviceUrl: config.serviceUrl,
  apiKey: config.apiKey,
  printerName: config.printerName,
  defaultCopies: config.copies,
})
const printer = createEasyInkPrinter({
  client,
  viewer: 'iframe',
  printerName: () => config.printerName,
  copies: () => config.copies,
  forcePageSize: () => config.forcePageSize ?? false,
  resolveRequestOptions: () => ({
    userData: normalizeUserData(config.userData),
  }),
})
const connectionState = ref(client.connectionState)
const lastError = ref(client.lastError)
const devices = ref<PrintServiceDevice[]>([])
const jobs = reactive(new Map<string, PrintJobInfo>())

let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(config, (val) => {
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(persistConfig, 200, {
    ...val,
    userData: normalizeUserData(val.userData),
  })
  const reconnect = val.serviceUrl !== client.serviceUrl || val.apiKey !== client.apiKey
  client.configure({
    serviceUrl: val.serviceUrl,
    apiKey: val.apiKey,
    printerName: val.printerName,
    defaultCopies: val.copies,
  })
  if (reconnect) {
    syncState()
    if (val.enabled)
      connect().catch(() => { /* surfaced via state */ })
  }
}, { deep: true })

function syncState() {
  connectionState.value = client.connectionState
  lastError.value = client.lastError
  devices.value = [...client.devices]
  config.printerName = client.printerName

  jobs.clear()
  for (const [jobId, job] of client.jobs)
    jobs.set(jobId, job)
}

async function connect(): Promise<void> {
  connectionState.value = 'connecting'
  try {
    await client.connect()
    await client.refreshPrinters()
  }
  catch (e) {
    client.lastError = e instanceof Error ? e.message : '连接 EasyInk Printer 服务失败'
    throw e
  }
  finally {
    syncState()
  }
}

function disconnect() {
  client.disconnect()
  syncState()
}

async function refreshDevices(): Promise<PrintServiceDevice[]> {
  const list = await client.refreshPrinters()
  syncState()
  return list
}

async function print(input: EasyInkPrinterPrintRequest): Promise<void> {
  await printer.print({
    ...input,
    printerName: input.printerName ?? config.printerName,
    copies: input.copies ?? config.copies,
    forcePageSize: input.forcePageSize ?? config.forcePageSize ?? false,
    requestOptions: {
      userData: normalizeUserData(config.userData),
      ...input.requestOptions,
    },
  })
  syncState()
}

async function printWithRenderSource(input: EasyInkPrinterPrintRequest): Promise<void> {
  input.onPhase?.({ phase: 'submitting', message: '发送 schema + data 到 EasyInk Printer' })
  const forcePageSize = input.forcePageSize ?? config.forcePageSize ?? false
  const requestOptions = {
    userData: normalizeUserData(config.userData),
    ...input.requestOptions,
  } satisfies Partial<EasyInkPrinterPrintRenderOptions>
  const renderOptions = requestOptions.renderOptions
  const jobId = await client.printEasyInk({
    schema: input.schema,
    data: input.data,
  }, {
    ...requestOptions,
    printerName: input.printerName ?? config.printerName,
    copies: input.copies ?? config.copies,
    forcePageSize,
    paperSize: requestOptions.paperSize ?? (forcePageSize ? resolveSchemaPaperSize(input.schema) : undefined),
    renderOptions: {
      pdf: {
        printBackground: true,
        ...renderOptions?.pdf,
      },
      wait: {
        until: 'easyinkReady',
        ...renderOptions?.wait,
      },
      security: renderOptions?.security,
      diagnostics: renderOptions?.diagnostics,
    },
  })

  if (input.waitForCompletion !== false)
    await client.waitForJob(jobId)
  syncState()
}

async function printHtml(html: string, options: EasyInkPrinterPrintHtmlOptions & { waitForCompletion?: boolean } = {}): Promise<void> {
  const jobId = await client.printHtml(html, {
    printerName: config.printerName,
    copies: config.copies,
    userData: normalizeUserData(config.userData),
    ...options,
  })

  if (options.waitForCompletion !== false)
    await client.waitForJob(jobId)
  syncState()
}

async function waitForJob(jobId: string): Promise<PrintJobInfo> {
  const job = await client.waitForJob(jobId)
  syncState()
  return job
}

function setEnabled(enabled: boolean) {
  config.enabled = enabled
  if (enabled) {
    connect().catch(() => { /* surfaced via state */ })
  }
  else {
    disconnect()
  }
}

function updateConfig(patch: Partial<PrintServiceConfig>) {
  Object.assign(config, {
    ...patch,
    userData: 'userData' in patch ? normalizeUserData(patch.userData) : config.userData,
  })
}

function resolveSchemaPaperSize(schema: EasyInkPrinterPrintRequest['schema']): EasyInkPrinterPaperSize {
  return {
    width: toMillimeters(schema.page.width, schema.unit),
    height: toMillimeters(schema.page.height, schema.unit),
    unit: 'mm',
  }
}

if (config.enabled) {
  Promise.resolve().then(() => connect().catch(() => { /* surfaced via state */ }))
}

export function useEasyInkPrint() {
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
    jobs,
    enabled: computed(() => config.enabled),
    printerName: computed(() => config.printerName),
    copies: computed(() => config.copies),
    serviceUrl: computed(() => config.serviceUrl),
    forcePageSize: computed(() => Boolean(config.forcePageSize)),
    userData: computed(() => normalizeUserData(config.userData)),

    connect,
    disconnect,
    setEnabled,
    updateConfig,
    refreshDevices,
    print,
    printWithRenderSource,
    printHtml,
    waitForJob,
  }
}

export type PrintServiceStore = ReturnType<typeof useEasyInkPrint>
