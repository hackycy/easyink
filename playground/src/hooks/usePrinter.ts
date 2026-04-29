import { computed, reactive, ref, watch } from 'vue'
import { hiprint } from 'vue-plugin-hiprint'

export const DEFAULT_PRINTER_HOST = 'http://localhost:17521'
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
  /**
   * 是否向 electron-hiprint 显式传递 pageSize / landscape / scaleFactor。
   * 仅用于驱动会忽略模板尺寸、退回 A4 缩印的打印机 (例如 DELI 标签机)。
   * 普通小票机 / 连续纸打印机必须保持 false, 否则驱动会用最近的预设介质
   * 替换我们的自定义尺寸, 导致内容被截断。
   */
  forcePageSize?: boolean
}

export interface PrinterConfig {
  enablePrinterService: boolean
  printerDevice?: string
  printCopies?: number
  printerServiceUrl?: string
  /** 按设备名记录是否强制传 pageSize (DELI 等标签机需要打开)。 */
  forcePageSizeByDevice?: Record<string, boolean>
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
      printCopies: parsed.printCopies ?? DEFAULT_PRINTER_COPIES,
      printerServiceUrl: parsed.printerServiceUrl ?? DEFAULT_PRINTER_HOST,
      forcePageSizeByDevice: parsed.forcePageSizeByDevice ?? {},
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
    printCopies: DEFAULT_PRINTER_COPIES,
    printerServiceUrl: DEFAULT_PRINTER_HOST,
    forcePageSizeByDevice: {},
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

    // pageSize 处理策略 (经踩坑总结):
    //
    // 1) 不传 pageSize  ->  Chromium 走 OS 打印通道, 由打印机驱动选择当前介质
    //    (小票机的连续卷纸 / 普通打印机的当前纸盒)。这与浏览器直接打印的行为一致,
    //    小票机和连续纸打印机必须走这条路, 否则驱动找不到匹配介质会替换为最近的
    //    预设尺寸, 把超出驱动 form length 的内容裁掉。
    //
    // 2) 传自定义 pageSize -> Chromium 强制按该尺寸排版并请求驱动接受。
    //    DELI 等标签机驱动如果不收到 pageSize 会回退到 A4 然后把模板缩印到纸张中央,
    //    所以这类打印机必须显式传。
    //
    // 因此 pageSize 改为按设备 opt-in: 默认关闭, 用户在打印机设置里为 DELI 这类
    // 标签机单独开启 (vue-plugin-hiprint 官方示例也是默认不传 pageSize)。
    const printOptions: Record<string, unknown> = {
      printer: opts.printer,
      margins: { marginType: 'none' },
    }
    if (opts.forcePageSize) {
      const widthMicrons = Math.round(opts.width * 1000) // 1mm = 1000μm
      const heightMicrons = Math.round(opts.height * 1000)
      const landscape = opts.width > opts.height
      // 物理纸张方向始终以短边为宽。landscape=true 时 Electron 会自动旋转。
      printOptions.pageSize = landscape
        ? { width: heightMicrons, height: widthMicrons }
        : { width: widthMicrons, height: heightMicrons }
      printOptions.landscape = landscape
      printOptions.scaleFactor = 100
    }

    tpl.print2({}, printOptions)
  })
}

export interface PrintPagesProgress {
  current: number
  total: number
}

async function printPages(
  pages: HTMLElement[],
  opts: { width: number, height: number, printer: string, forcePageSize?: boolean },
  onProgress?: (p: PrintPagesProgress) => void,
): Promise<void> {
  for (let i = 0; i < pages.length; i++) {
    onProgress?.({ current: i + 1, total: pages.length })
    await printHtml({
      width: opts.width,
      height: opts.height,
      html: pages[i]!.innerHTML,
      printer: opts.printer,
      forcePageSize: opts.forcePageSize,
    })
  }
}

function setForcePageSize(deviceName: string, value: boolean): void {
  const map = { ...(config.forcePageSizeByDevice ?? {}) }
  if (value)
    map[deviceName] = true
  else
    delete map[deviceName]
  config.forcePageSizeByDevice = map
}

function isForcePageSize(deviceName: string | undefined): boolean {
  if (!deviceName)
    return false
  return Boolean(config.forcePageSizeByDevice?.[deviceName])
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
    copies: computed(() => config.printCopies ?? DEFAULT_PRINTER_COPIES),
    serviceUrl: computed(() => config.printerServiceUrl ?? DEFAULT_PRINTER_HOST),

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
