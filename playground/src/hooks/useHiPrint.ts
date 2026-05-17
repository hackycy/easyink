import type { HiPrintDevice, HiPrintProgress, PrintHtmlOptions } from '@easyink/print-integration-hiprint'
import { createHiPrintClient, DEFAULT_HIPRINT_URL } from '@easyink/print-integration-hiprint'
import { computed, reactive, ref, watch } from 'vue'

export const DEFAULT_PRINTER_HOST = DEFAULT_HIPRINT_URL
export const DEFAULT_PRINTER_COPIES = 1

const PRINTER_CONFIG_KEY = 'easyink:printerConfig'

export interface PrinterDevice extends HiPrintDevice {}

export interface PrintHTMLOptions {
  height: number
  html: string
  orientation?: 'auto' | 'portrait' | 'landscape'
  printer: string
  width: number
  paperFooter?: number
  paperHeader?: number
  forcePageSize?: boolean
}

export interface PrinterConfig {
  enablePrinterService: boolean
  printerDevice?: string
  printCopies?: number
  printerServiceUrl?: string
  forcePageSize?: boolean
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

function defaultConfig(): PrinterConfig {
  return {
    enablePrinterService: false,
    printerDevice: undefined,
    printCopies: DEFAULT_PRINTER_COPIES,
    printerServiceUrl: DEFAULT_PRINTER_HOST,
    forcePageSize: false,
  }
}

function loadConfig(): PrinterConfig {
  try {
    const stored = localStorage.getItem(PRINTER_CONFIG_KEY)
    if (!stored)
      return defaultConfig()
    const parsed = JSON.parse(stored) as Partial<PrinterConfig>
    return {
      enablePrinterService: parsed.enablePrinterService ?? false,
      printerDevice: parsed.printerDevice,
      printCopies: parsed.printCopies ?? DEFAULT_PRINTER_COPIES,
      printerServiceUrl: parsed.printerServiceUrl ?? DEFAULT_PRINTER_HOST,
      forcePageSize: parsed.forcePageSize ?? false,
    }
  }
  catch {
    return defaultConfig()
  }
}

function persistConfig(snapshot: PrinterConfig) {
  try {
    localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(snapshot))
  }
  catch { /* quota exceeded */ }
}

const config = reactive<PrinterConfig>(loadConfig())
const client = createHiPrintClient({
  serviceUrl: config.printerServiceUrl ?? DEFAULT_PRINTER_HOST,
  namespace: import.meta.env?.VITE_APP_NAMESPACE || 'easyink-playground',
  printerName: config.printerDevice,
  defaultCopies: config.printCopies ?? DEFAULT_PRINTER_COPIES,
  forcePageSize: config.forcePageSize,
})
const connectionState = ref<ConnectionState>(client.connectionState)
const lastError = ref(client.lastError)
const devices = ref<PrinterDevice[]>([])

let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(config, (val) => {
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(persistConfig, 200, { ...val })
  const reconnect = (val.printerServiceUrl ?? DEFAULT_PRINTER_HOST) !== client.serviceUrl
  client.configure({
    serviceUrl: val.printerServiceUrl ?? DEFAULT_PRINTER_HOST,
    printerName: val.printerDevice,
    defaultCopies: val.printCopies ?? DEFAULT_PRINTER_COPIES,
    forcePageSize: val.forcePageSize ?? false,
  })
  if (reconnect) {
    syncState()
    if (val.enablePrinterService)
      connect().catch(() => { /* surfaced via state */ })
  }
}, { deep: true })

function syncState() {
  connectionState.value = client.connectionState
  lastError.value = client.lastError
  devices.value = [...client.devices]
  config.printerDevice = client.printerName
  config.forcePageSize = client.forcePageSize
}

async function connect(): Promise<void> {
  connectionState.value = 'connecting'
  try {
    await client.connect()
  }
  finally {
    syncState()
  }
}

function disconnect(): void {
  client.disconnect()
  syncState()
}

async function refreshDevices(): Promise<PrinterDevice[]> {
  const list = await client.refreshPrinters()
  syncState()
  return list
}

function setEnabled(enabled: boolean): void {
  config.enablePrinterService = enabled
  if (enabled) {
    connect().catch(() => { /* surfaced via state */ })
  }
  else {
    disconnect()
  }
}

function updateConfig(patch: Partial<PrinterConfig>): void {
  Object.assign(config, patch)
}

async function printHtml(opts: PrintHTMLOptions): Promise<void> {
  await client.printHtml(toHiPrintOptions(opts))
  syncState()
}

export interface PrintPagesProgress extends HiPrintProgress {}

async function printPages(
  pages: HTMLElement[],
  opts: { width: number, height: number, orientation?: 'auto' | 'portrait' | 'landscape', printer: string, forcePageSize?: boolean },
  onProgress?: (p: PrintPagesProgress) => void,
): Promise<void> {
  await client.printPages(pages, {
    width: opts.width,
    height: opts.height,
    orientation: opts.orientation,
    printerName: opts.printer,
    forcePageSize: opts.forcePageSize,
  }, onProgress)
  syncState()
}

function setForcePageSize(value: boolean): void {
  client.setForcePageSize(value)
  syncState()
}

function isForcePageSize(): boolean {
  return client.isForcePageSize()
}

if (config.enablePrinterService) {
  Promise.resolve().then(() => connect().catch(() => { /* surfaced via state */ }))
}

export function usePrinter() {
  return {
    client,
    config,
    connectionState: computed(() => connectionState.value),
    isConnected: computed(() => connectionState.value === 'connected'),
    isConnecting: computed(() => connectionState.value === 'connecting'),
    isError: computed(() => connectionState.value === 'error'),
    lastError: computed(() => lastError.value),
    devices: computed(() => devices.value),
    enabled: computed(() => config.enablePrinterService),
    printerDevice: computed(() => config.printerDevice),
    copies: computed(() => config.printCopies ?? DEFAULT_PRINTER_COPIES),
    serviceUrl: computed(() => config.printerServiceUrl ?? DEFAULT_PRINTER_HOST),
    forcePageSize: computed(() => Boolean(config.forcePageSize)),

    connect,
    disconnect,
    setEnabled,
    updateConfig,
    refreshDevices,
    printHtml,
    printPages,
    setForcePageSize,
    isForcePageSize,
  }
}

export type PrinterStore = ReturnType<typeof usePrinter>

function toHiPrintOptions(opts: PrintHTMLOptions): PrintHtmlOptions {
  return {
    html: opts.html,
    width: opts.width,
    height: opts.height,
    orientation: opts.orientation,
    printerName: opts.printer,
    forcePageSize: opts.forcePageSize,
    paperFooter: opts.paperFooter,
    paperHeader: opts.paperHeader,
  }
}
