import { computed, reactive, ref, watch } from 'vue'
import { hiprint } from 'vue-plugin-hiprint'

export const DEFAULT_PRINTER_HOST = 'http://localhost:17521'
export const DEFAULT_PRINTER_PAGE_SIZE = 58
export const DEFAULT_PRINTER_COPIES = 1

const PRINTER_CONFIG_KEY = 'easyink:printerConfig'
const CONNECT_TIMEOUT_MS = 4000
const REFRESH_DELAY_MS = 300
const REFRESH_TIMEOUT_MS = 2500

export interface PrinterDevice {
  description: string
  displayName: string
  isDefault: boolean
  name: string
  status: number
  options: Record<string, any>
}

export interface PrintHTMLOptions {
  height: number
  html: string
  printer: string
  width: number
  paperFooter?: number
  paperHeader?: number
}

export interface PrinterConfig {
  enablePrinterService: boolean
  printerDevice?: string
  printerPaperSize?: number
  printCopies?: number
  printerServiceUrl?: string
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

function loadConfig(): PrinterConfig {
  try {
    const stored = localStorage.getItem(PRINTER_CONFIG_KEY)
    if (!stored)
      return defaultConfig()
    const parsed = JSON.parse(stored) as Partial<PrinterConfig>
    return {
      enablePrinterService: parsed.enablePrinterService ?? false,
      printerDevice: parsed.printerDevice,
      printerPaperSize: parsed.printerPaperSize ?? DEFAULT_PRINTER_PAGE_SIZE,
      printCopies: parsed.printCopies ?? DEFAULT_PRINTER_COPIES,
      printerServiceUrl: parsed.printerServiceUrl ?? DEFAULT_PRINTER_HOST,
    }
  }
  catch {
    return defaultConfig()
  }
}

function defaultConfig(): PrinterConfig {
  return {
    enablePrinterService: false,
    printerDevice: undefined,
    printerPaperSize: DEFAULT_PRINTER_PAGE_SIZE,
    printCopies: DEFAULT_PRINTER_COPIES,
    printerServiceUrl: DEFAULT_PRINTER_HOST,
  }
}

function persistConfig(snapshot: PrinterConfig) {
  try {
    localStorage.setItem(PRINTER_CONFIG_KEY, JSON.stringify(snapshot))
  }
  catch { /* quota exceeded */ }
}

// ---------- singleton state ----------

const config = reactive<PrinterConfig>(loadConfig())
const connectionState = ref<ConnectionState>('idle')
const lastError = ref<string>('')
const devices = ref<PrinterDevice[]>([])
let initialized = false
let connectPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

watch(config, (val) => {
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(persistConfig, 200, { ...val })
}, { deep: true })

function ensureInit() {
  if (initialized)
    return
  hiprint.init()
  // route hiprint websocket open status into our reactive ref
  Object.defineProperty(hiprint.hiwebSocket, 'opened', {
    get() {
      return connectionState.value === 'connected'
    },
    set(value: boolean) {
      if (value) {
        connectionState.value = 'connected'
        lastError.value = ''
      }
      else if (connectionState.value === 'connected') {
        connectionState.value = 'idle'
      }
    },
    enumerable: true,
    configurable: true,
  })
  initialized = true
}

function namespace(): string {
  return import.meta.env?.VITE_APP_NAMESPACE || 'easyink-playground'
}

function disconnect(): void {
  try {
    if (hiprint.hiwebSocket?.hasIo?.())
      hiprint.hiwebSocket.stop()
  }
  catch { /* ignore */ }
  connectionState.value = 'idle'
  connectPromise = null
}

function connect(): Promise<void> {
  ensureInit()

  if (connectionState.value === 'connected')
    return Promise.resolve()
  if (connectPromise)
    return connectPromise

  connectionState.value = 'connecting'
  lastError.value = ''

  connectPromise = new Promise<void>((resolve, reject) => {
    const url = config.printerServiceUrl || DEFAULT_PRINTER_HOST
    let settled = false

    const timer = setTimeout(() => {
      if (settled)
        return
      settled = true
      connectionState.value = 'error'
      lastError.value = `连接超时 (${url})`
      try {
        if (hiprint.hiwebSocket?.hasIo?.())
          hiprint.hiwebSocket.stop()
      }
      catch { /* ignore */ }
      connectPromise = null
      reject(new Error(lastError.value))
    }, CONNECT_TIMEOUT_MS)

    hiprint.hiwebSocket.setHost(
      url,
      `vue-plugin-hiprint-${namespace()}`,
      (connected: boolean) => {
        if (settled)
          return
        if (connected) {
          settled = true
          clearTimeout(timer)
          connectionState.value = 'connected'
          connectPromise = null
          refreshDevices().catch(() => { /* ignore */ })
          resolve()
        }
      },
    )

    if (!hiprint.hiwebSocket?.hasIo?.())
      hiprint.hiwebSocket.start()
  })

  return connectPromise
}

async function refreshDevices(): Promise<PrinterDevice[]> {
  if (connectionState.value !== 'connected') {
    devices.value = []
    return []
  }

  const list = await new Promise<PrinterDevice[]>((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      done = true
      resolve([])
    }, REFRESH_DELAY_MS + REFRESH_TIMEOUT_MS)

    setTimeout(() => {
      hiprint.refreshPrinterList((res: PrinterDevice[]) => {
        if (done)
          return
        clearTimeout(timer)
        resolve(Array.isArray(res) ? res : [])
      })
    }, REFRESH_DELAY_MS)
  })

  devices.value = list

  if (list.length === 0) {
    config.printerDevice = undefined
    return list
  }
  const fallback = list.find(d => d.isDefault) || list[0]!
  if (!config.printerDevice || list.every(d => d.name !== config.printerDevice))
    config.printerDevice = fallback.name

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
  if (!config.enablePrinterService)
    throw new Error('打印服务未启用')
  if (!opts.printer)
    throw new Error('未选择打印机')
  if (connectionState.value !== 'connected')
    await connect()

  return new Promise<void>((resolve, reject) => {
    const tpl = new hiprint.PrintTemplate()
    const panel = tpl.addPrintPanel({
      width: opts.width,
      height: opts.height,
      paperFooter: opts.paperFooter ?? 340,
      paperHeader: opts.paperHeader ?? 46,
      paperNumberDisabled: true,
    })
    panel.addPrintHtml({ options: { content: opts.html } })

    tpl.on('printSuccess', () => resolve())
    tpl.on('printError', (e: unknown) => {
      reject(new Error(e instanceof Error ? e.message : '打印失败'))
    })

    tpl.print2({}, {
      printer: opts.printer,
      margins: { marginType: 'none' },
    })
  })
}

export interface PrintPagesProgress {
  current: number
  total: number
}

async function printPages(
  pages: HTMLElement[],
  opts: { width: number, height: number, printer: string },
  onProgress?: (p: PrintPagesProgress) => void,
): Promise<void> {
  for (let i = 0; i < pages.length; i++) {
    onProgress?.({ current: i + 1, total: pages.length })
    await printHtml({
      width: opts.width,
      height: opts.height,
      html: pages[i]!.innerHTML,
      printer: opts.printer,
    })
  }
}

// auto-connect if previously enabled
if (config.enablePrinterService) {
  Promise.resolve().then(() => connect().catch(() => { /* surfaced via state */ }))
}

// ---------- public API ----------

export function usePrinter() {
  return {
    config,
    connectionState: computed(() => connectionState.value),
    isConnected: computed(() => connectionState.value === 'connected'),
    isConnecting: computed(() => connectionState.value === 'connecting'),
    isError: computed(() => connectionState.value === 'error'),
    lastError: computed(() => lastError.value),
    devices: computed(() => devices.value),
    enabled: computed(() => config.enablePrinterService),
    printerDevice: computed(() => config.printerDevice),
    paperSize: computed(() => config.printerPaperSize ?? DEFAULT_PRINTER_PAGE_SIZE),
    copies: computed(() => config.printCopies ?? DEFAULT_PRINTER_COPIES),
    serviceUrl: computed(() => config.printerServiceUrl ?? DEFAULT_PRINTER_HOST),

    connect,
    disconnect,
    setEnabled,
    updateConfig,
    refreshDevices,
    printHtml,
    printPages,
  }
}

export type PrinterStore = ReturnType<typeof usePrinter>
