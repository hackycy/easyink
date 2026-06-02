import type { LodopScriptConfig } from './script'
import { EasyInkPrintError } from '@easyink/print-core'
import { loadLodopScript } from './script'
import { serializeViewerPage } from './serialize'

export type LodopPrintAction = 'print' | 'preview' | 'setup' | 'design'
export type LodopLength = number | string

const DEFAULT_RUNTIME_READY_TIMEOUT_MS = 8000
const RUNTIME_READY_INTERVAL_MS = 100
const runtimeActionQueues = new WeakMap<LodopRuntime, Promise<void>>()

/**
 * Describes a printer reported by the LODOP runtime.
 */
export interface LodopDevice {
  displayName?: string
  isDefault?: boolean
  name: string
  index: number
}

/**
 * Minimal LODOP/C-LODOP runtime contract used by EasyInk.
 */
export interface LodopRuntime {
  VERSION?: string
  CVERSION?: string
  On_Return?: (taskId: unknown, value: unknown) => void
  PRINT_INIT: (this: LodopRuntime, title: string) => unknown
  PRINT_INITA?: (this: LodopRuntime, top: LodopLength, left: LodopLength, width: LodopLength, height: LodopLength, title: string) => unknown
  SET_PRINT_PAGESIZE?: (this: LodopRuntime, orient: number, width: number, height: number, pageName: string) => unknown
  SET_PRINTER_INDEX?: (this: LodopRuntime, printer: string | number) => unknown
  SET_PRINT_COPIES?: (this: LodopRuntime, copies: number) => unknown
  SET_PRINT_MODE?: (this: LodopRuntime, mode: string, value: unknown) => unknown
  SET_SHOW_MODE?: (this: LodopRuntime, mode: string, value: unknown) => unknown
  SET_PRINT_STYLE?: (this: LodopRuntime, styleName: string, value: unknown) => unknown
  SET_PRINT_STYLEA?: (this: LodopRuntime, itemNameOrIndex: string | number, styleName: string, value: unknown) => unknown
  ADD_PRINT_HTM: (this: LodopRuntime, top: LodopLength, left: LodopLength, width: LodopLength, height: LodopLength, html: string) => unknown
  ADD_PRINT_HTML?: (this: LodopRuntime, top: LodopLength, left: LodopLength, width: LodopLength, height: LodopLength, html: string) => unknown
  ADD_PRINT_IMAGE?: (this: LodopRuntime, top: LodopLength, left: LodopLength, width: LodopLength, height: LodopLength, image: string) => unknown
  ADD_PRINT_URL?: (this: LodopRuntime, top: LodopLength, left: LodopLength, width: LodopLength, height: LodopLength, url: string) => unknown
  GET_PRINTER_COUNT?: (this: LodopRuntime) => number
  GET_PRINTER_NAME?: (this: LodopRuntime, index: number) => string
  PRINT: (this: LodopRuntime) => unknown
  PREVIEW: (this: LodopRuntime) => unknown
  PRINT_SETUP: (this: LodopRuntime) => unknown
  PRINT_DESIGN: (this: LodopRuntime) => unknown
}

export type LodopGetter = () => LodopRuntime | undefined

export interface PrintHtmlOptions {
  html: string
  /** Page width in millimeters. */
  width: number
  /** Page height in millimeters. */
  height: number
  printerName?: string
  orientation?: 'auto' | 'portrait' | 'landscape'
  copies?: number
  forcePageSize?: boolean
  pageName?: string
  title?: string
  action?: LodopPrintAction
  top?: LodopLength
  left?: LodopLength
  itemWidth?: LodopLength
  itemHeight?: LodopLength
  useHtmlParser?: 'htm' | 'html'
  catchPrintStatus?: boolean
  resultTimeoutMs?: number
  modes?: Record<string, unknown>
  showModes?: Record<string, unknown>
  styles?: Record<string, unknown>
  itemStyles?: Record<string, unknown>
}

/**
 * Options for printing one or more already-rendered Viewer pages.
 */
export interface PrintPagesOptions extends Omit<PrintHtmlOptions, 'html'> {}

export interface PrintImageOptions extends Omit<PrintHtmlOptions, 'html' | 'useHtmlParser'> {
  image: string
  stretch?: 0 | 1 | 2
}

export interface LodopProgress {
  current: number
  total: number
}

export interface LodopClientLike {
  printerName?: string
  useDefaultPrinter?: () => string | undefined | Promise<string | undefined>
  printHtml?: (options: PrintHtmlOptions) => Promise<unknown>
  printImage?: (options: PrintImageOptions) => Promise<unknown>
  printBase64Image?: (base64Image: string, options: Omit<PrintImageOptions, 'image'>) => Promise<unknown>
  printPages: (
    pages: HTMLElement[],
    options: PrintPagesOptions,
    onProgress?: (progress: LodopProgress) => void,
  ) => Promise<void>
}

export interface LodopClientOptions {
  getLodop?: LodopGetter
  runtimeName?: string
  script?: LodopScriptConfig | false
  printerName?: string
  defaultCopies?: number
  forcePageSize?: boolean
  allowDefaultPrinter?: boolean
  resultTimeoutMs?: number
  runtimeReadyTimeoutMs?: number
}

export interface LodopRuntimeClientOptions extends LodopClientOptions {
  lodop: LodopRuntime | LodopGetter
}

export class LodopClient implements LodopClientLike {
  printerName?: string
  defaultCopies: number
  forcePageSize: boolean
  allowDefaultPrinter: boolean
  devices: LodopDevice[] = []

  private readonly getLodop: LodopGetter
  private readonly script: LodopScriptConfig | false | undefined
  private readonly resultTimeoutMs: number
  private readonly runtimeReadyTimeoutMs: number

  constructor(options: LodopClientOptions = {}) {
    const runtimeName = options.runtimeName ?? resolveScriptName(options.script)
    this.getLodop = options.getLodop ?? (() => getGlobalLodop(runtimeName))
    this.script = options.script
    this.printerName = options.printerName
    this.defaultCopies = options.defaultCopies ?? 1
    this.forcePageSize = options.forcePageSize ?? true
    this.allowDefaultPrinter = options.allowDefaultPrinter ?? true
    this.resultTimeoutMs = options.resultTimeoutMs ?? 30000
    this.runtimeReadyTimeoutMs = options.runtimeReadyTimeoutMs ?? DEFAULT_RUNTIME_READY_TIMEOUT_MS
  }

  configure(options: Partial<LodopClientOptions>): void {
    if (options.printerName !== undefined)
      this.printerName = options.printerName
    if (options.defaultCopies !== undefined)
      this.defaultCopies = options.defaultCopies
    if (options.forcePageSize !== undefined)
      this.forcePageSize = options.forcePageSize
    if (options.allowDefaultPrinter !== undefined)
      this.allowDefaultPrinter = options.allowDefaultPrinter
  }

  getRuntime(): LodopRuntime {
    const runtime = this.getLodop()
    if (!runtime)
      throw new EasyInkPrintError('LODOP 打印控件未安装或未启动', 'LODOP_RUNTIME_UNAVAILABLE')
    if (!runtime.VERSION && !runtime.CVERSION)
      throw new EasyInkPrintError('LODOP 打印控件不可用', 'LODOP_RUNTIME_UNAVAILABLE')
    return runtime
  }

  async ready(): Promise<LodopRuntime> {
    if (this.script)
      await loadLodopScript(this.script)
    return waitForLodopRuntime(this.getLodop, this.runtimeReadyTimeoutMs)
  }

  async listPrinters(): Promise<LodopDevice[]> {
    const runtime = await this.ready()
    const count = Number(runtime.GET_PRINTER_COUNT?.() ?? 0)
    const defaultName = readDefaultPrinterName(runtime)
    const devices: LodopDevice[] = []

    for (let index = 0; index < count; index++) {
      const name = String(runtime.GET_PRINTER_NAME?.(index) ?? '')
      if (!name)
        continue
      devices.push({
        displayName: name,
        index,
        isDefault: defaultName ? name === defaultName : index === 0,
        name,
      })
    }

    this.devices = devices
    this.ensureSelectedPrinter(devices)
    return devices
  }

  async useDefaultPrinter(): Promise<string | undefined> {
    const runtime = await this.ready()
    const selected = readDefaultPrinterName(runtime) ?? this.devices.find(device => device.isDefault)?.name ?? this.devices[0]?.name
    this.printerName = selected
    return selected
  }

  setPrinter(printerName: string | undefined): void {
    this.printerName = printerName
  }

  setForcePageSize(value: boolean): void {
    this.forcePageSize = value
  }

  isForcePageSize(): boolean {
    return this.forcePageSize
  }

  async printHtml(options: PrintHtmlOptions): Promise<unknown> {
    const runtime = await this.ready()
    const printerName = await this.resolvePrinterName(options.printerName)
    return printHtmlWithLodopRuntime(runtime, options, {
      defaultCopies: this.defaultCopies,
      forcePageSize: this.isForcePageSize(),
      printerName,
      resultTimeoutMs: this.resultTimeoutMs,
    })
  }

  async printImage(options: PrintImageOptions): Promise<unknown> {
    const runtime = await this.ready()
    const printerName = await this.resolvePrinterName(options.printerName)
    return printImageWithLodopRuntime(runtime, options, {
      defaultCopies: this.defaultCopies,
      forcePageSize: this.isForcePageSize(),
      printerName,
      resultTimeoutMs: this.resultTimeoutMs,
    })
  }

  printBase64Image(base64Image: string, options: Omit<PrintImageOptions, 'image'>): Promise<unknown> {
    return this.printImage({ ...options, image: base64Image })
  }

  async printPages(
    pages: HTMLElement[],
    options: PrintPagesOptions,
    onProgress?: (progress: LodopProgress) => void,
  ): Promise<void> {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      await this.printHtml({
        ...options,
        html: serializeViewerPage(pages[pageIndex]!),
      })
      onProgress?.({ current: pageIndex + 1, total: pages.length })
    }
  }

  private ensureSelectedPrinter(devices: LodopDevice[]): void {
    if (!this.printerName)
      return
    if (devices.some(device => device.name === this.printerName))
      return
    this.printerName = undefined
  }

  private async resolvePrinterName(printerName: string | undefined): Promise<string | undefined> {
    if (printerName)
      return printerName
    if (this.printerName)
      return this.printerName
    const selected = await this.useDefaultPrinter()
    if (selected || this.allowDefaultPrinter)
      return selected
    throw new EasyInkPrintError('未选择打印机', 'LODOP_PRINTER_NOT_SELECTED')
  }
}

export class LodopRuntimeClient extends LodopClient {
  constructor(options: LodopRuntimeClientOptions) {
    const runtimeOrGetter = options.lodop
    super({
      ...options,
      getLodop: typeof runtimeOrGetter === 'function'
        ? runtimeOrGetter as LodopGetter
        : () => runtimeOrGetter,
    })
  }
}

export function createLodopClient(options?: LodopClientOptions): LodopClient {
  return new LodopClient(options)
}

export function createLodopRuntimeClient(options: LodopRuntimeClientOptions): LodopRuntimeClient {
  return new LodopRuntimeClient(options)
}

export function createLegacyLodopClient(options: LodopRuntimeClientOptions): LodopRuntimeClient {
  return createLodopRuntimeClient(options)
}

export function printHtmlWithLodopRuntime(
  runtime: LodopRuntime,
  options: PrintHtmlOptions,
  defaults: {
    printerName?: string
    defaultCopies?: number
    forcePageSize?: boolean
    resultTimeoutMs?: number
  } = {},
): Promise<unknown> {
  return enqueueLodopAction(runtime, () => {
    prepareLodopJob(runtime, options, defaults)
    addHtml(runtime, options)
    applyItemStyles(runtime, options.itemStyles)
    return runLodopAction(runtime, options.action ?? 'print', {
      catchPrintStatus: options.catchPrintStatus,
      resultTimeoutMs: options.resultTimeoutMs ?? defaults.resultTimeoutMs,
    })
  })
}

export function printImageWithLodopRuntime(
  runtime: LodopRuntime,
  options: PrintImageOptions,
  defaults: {
    printerName?: string
    defaultCopies?: number
    forcePageSize?: boolean
    resultTimeoutMs?: number
  } = {},
): Promise<unknown> {
  if (!runtime.ADD_PRINT_IMAGE)
    throw new EasyInkPrintError('当前 LODOP 运行时不支持图片打印', 'LODOP_IMAGE_UNSUPPORTED')

  return enqueueLodopAction(runtime, () => {
    prepareLodopJob(runtime, options, defaults)
    runtime.ADD_PRINT_IMAGE?.(
      options.top ?? 0,
      options.left ?? 0,
      options.itemWidth ?? '100%',
      options.itemHeight ?? '100%',
      options.image,
    )
    if (options.stretch !== undefined)
      runtime.SET_PRINT_STYLEA?.(0, 'Stretch', options.stretch)
    applyItemStyles(runtime, options.itemStyles)
    return runLodopAction(runtime, options.action ?? 'print', {
      catchPrintStatus: options.catchPrintStatus,
      resultTimeoutMs: options.resultTimeoutMs ?? defaults.resultTimeoutMs,
    })
  })
}

function prepareLodopJob(
  runtime: LodopRuntime,
  options: Omit<PrintHtmlOptions, 'html'>,
  defaults: {
    printerName?: string
    defaultCopies?: number
    forcePageSize?: boolean
  },
): void {
  const printerName = options.printerName ?? defaults.printerName
  const copies = options.copies ?? defaults.defaultCopies ?? 1
  const forcePageSize = options.forcePageSize ?? defaults.forcePageSize ?? true

  runtime.PRINT_INIT(options.title ?? 'EasyInk 打印任务')
  if (printerName)
    runtime.SET_PRINTER_INDEX?.(printerName)
  runtime.SET_PRINT_COPIES?.(copies)

  if (forcePageSize) {
    runtime.SET_PRINT_PAGESIZE?.(
      resolveLodopOrient(options),
      Math.round(options.width * 10),
      Math.round(options.height * 10),
      options.pageName ?? '',
    )
  }

  if (options.catchPrintStatus)
    runtime.SET_PRINT_MODE?.('CATCH_PRINT_STATUS', true)

  applyModes(runtime, options.modes)
  applyShowModes(runtime, options.showModes)
  applyStyles(runtime, options.styles)
}

function enqueueLodopAction<T>(runtime: LodopRuntime, action: () => Promise<T>): Promise<T> {
  const previous = runtimeActionQueues.get(runtime) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(action)
  runtimeActionQueues.set(runtime, current.then(() => undefined, () => undefined))
  return current
}

function addHtml(runtime: LodopRuntime, options: PrintHtmlOptions): void {
  const args = [
    options.top ?? 0,
    options.left ?? 0,
    options.itemWidth ?? `${options.width}mm`,
    options.itemHeight ?? `${options.height}mm`,
    options.html,
  ] as const

  if (options.useHtmlParser === 'html' && runtime.ADD_PRINT_HTML) {
    runtime.ADD_PRINT_HTML(...args)
    return
  }

  runtime.ADD_PRINT_HTM(...args)
}

function runLodopAction(
  runtime: LodopRuntime,
  action: LodopPrintAction,
  options: {
    catchPrintStatus?: boolean
    resultTimeoutMs?: number
  } = {},
): Promise<unknown> {
  const call = () => {
    if (action === 'preview')
      return runtime.PREVIEW()
    if (action === 'setup')
      return runtime.PRINT_SETUP()
    if (action === 'design')
      return runtime.PRINT_DESIGN()
    return runtime.PRINT()
  }

  if (!runtime.CVERSION) {
    const value = call()
    assertSuccessfulPrintResult(value, action, options.catchPrintStatus)
    return Promise.resolve(value)
  }

  return new Promise((resolve, reject) => {
    const previousRuntimeReturn = runtime.On_Return
    const cLodop = getGlobalCLodop()
    const previousCLodopReturn = cLodop?.On_Return
    let settled = false
    let timer: ReturnType<typeof setTimeout>

    const cleanup = () => {
      runtime.On_Return = previousRuntimeReturn
      if (cLodop)
        cLodop.On_Return = previousCLodopReturn
    }
    const settle = (value: unknown) => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      cleanup()
      try {
        assertSuccessfulPrintResult(value, action, options.catchPrintStatus)
        resolve(value)
      }
      catch (error) {
        reject(error)
      }
    }
    const onReturn = (_taskId: unknown, value: unknown) => settle(value)
    timer = setTimeout(() => {
      if (settled)
        return
      settled = true
      cleanup()
      reject(new EasyInkPrintError('等待 LODOP 打印结果超时', 'LODOP_PRINT_TIMEOUT'))
    }, options.resultTimeoutMs ?? 30000)

    runtime.On_Return = onReturn
    if (cLodop)
      cLodop.On_Return = onReturn

    try {
      const value = call()
      if (value !== undefined && value !== null && value !== '')
        settle(value)
    }
    catch (error) {
      settled = true
      clearTimeout(timer)
      cleanup()
      reject(new EasyInkPrintError('LODOP 打印失败', 'LODOP_PRINT_FAILED', error))
    }
  })
}

function assertSuccessfulPrintResult(value: unknown, action: LodopPrintAction, catchPrintStatus: boolean | undefined): void {
  if (action !== 'print')
    return
  if (catchPrintStatus) {
    if (value === undefined || value === null || value === '')
      throw new EasyInkPrintError('LODOP 未返回打印任务 ID', 'LODOP_PRINT_JOB_ID_MISSING')
    return
  }
  if (value === false || value === 0 || value === '0')
    throw new EasyInkPrintError(`LODOP 打印失败: PRINT 返回 ${formatLodopResult(value)}`, 'LODOP_PRINT_FAILED', value)
}

function formatLodopResult(value: unknown): string {
  if (typeof value === 'string')
    return JSON.stringify(value)
  if (value === undefined)
    return 'undefined'
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

function resolveLodopOrient(options: Pick<PrintHtmlOptions, 'orientation' | 'width' | 'height'>): 0 | 1 | 2 {
  if (options.orientation === 'portrait')
    return 1
  if (options.orientation === 'landscape')
    return 2
  return options.width > options.height ? 2 : 1
}

function applyModes(runtime: LodopRuntime, modes: Record<string, unknown> | undefined): void {
  if (!modes)
    return
  for (const [mode, value] of Object.entries(modes))
    runtime.SET_PRINT_MODE?.(mode, value)
}

function applyShowModes(runtime: LodopRuntime, modes: Record<string, unknown> | undefined): void {
  if (!modes)
    return
  for (const [mode, value] of Object.entries(modes))
    runtime.SET_SHOW_MODE?.(mode, value)
}

function applyStyles(runtime: LodopRuntime, styles: Record<string, unknown> | undefined): void {
  if (!styles)
    return
  for (const [styleName, value] of Object.entries(styles))
    runtime.SET_PRINT_STYLE?.(styleName, value)
}

function applyItemStyles(runtime: LodopRuntime, styles: Record<string, unknown> | undefined): void {
  if (!styles)
    return
  for (const [styleName, value] of Object.entries(styles))
    runtime.SET_PRINT_STYLEA?.(0, styleName, value)
}

function readDefaultPrinterName(runtime: LodopRuntime): string | undefined {
  try {
    const name = String(runtime.GET_PRINTER_NAME?.(-1) ?? '')
    return name || undefined
  }
  catch {
    return undefined
  }
}

function resolveScriptName(script: LodopScriptConfig | false | undefined): string | undefined {
  if (!script || script === true || typeof script === 'string')
    return undefined
  return script.name
}

function getGlobalLodop(name?: string): LodopRuntime | undefined {
  const globalWindow = globalThis as Record<string, unknown>
  if (name) {
    const namedRuntime = globalWindow[name]
    if (isLodopRuntime(namedRuntime))
      return namedRuntime

    const namedGetter = globalWindow[`get${name}`]
    if (typeof namedGetter === 'function') {
      const runtime = (namedGetter as LodopGetter)()
      if (runtime)
        return runtime
    }
  }

  const getLodop = globalWindow.getLodop
  if (typeof getLodop === 'function') {
    const runtime = (getLodop as LodopGetter)()
    if (runtime)
      return runtime
  }

  const getCLodop = globalWindow.getCLodop
  if (typeof getCLodop === 'function') {
    const runtime = (getCLodop as LodopGetter)()
    if (runtime)
      return runtime
  }

  return isLodopRuntime(globalWindow.CLODOP) ? globalWindow.CLODOP : undefined
}

function getGlobalCLodop(): LodopRuntime | undefined {
  const globalWindow = globalThis as { CLODOP?: LodopRuntime }
  return globalWindow.CLODOP
}

function waitForLodopRuntime(getLodop: LodopGetter, timeoutMs: number): Promise<LodopRuntime> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const check = () => {
      const runtime = getLodop()
      if (runtime && (runtime.VERSION || runtime.CVERSION)) {
        resolve(runtime)
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new EasyInkPrintError('LODOP 脚本已加载，但运行时尚不可用', 'LODOP_RUNTIME_NOT_READY'))
        return
      }

      setTimeout(check, RUNTIME_READY_INTERVAL_MS)
    }

    check()
  })
}

function isLodopRuntime(value: unknown): value is LodopRuntime {
  return Boolean(value && typeof value === 'object' && ('VERSION' in value || 'CVERSION' in value))
}
