import { EasyInkPrintError } from '@easyink/print-core'

export const DEFAULT_CLODOP_SCRIPT_URLS = [
  'http://localhost:8000/CLodopfuncs.js',
  'http://localhost:18000/CLodopfuncs.js',
] as const

const scriptLoadPromises = new Map<string, Promise<void>>()

export interface LodopScriptSource {
  src: string
  name?: string
  id?: string
  attrs?: Record<string, string>
}

export interface LodopScriptOptions {
  src?: string
  sources?: Array<string | LodopScriptSource>
  name?: string
  id?: string
  timeoutMs?: number
  document?: Document
  forceReload?: boolean
  attrs?: Record<string, string>
}

export type LodopScriptConfig = true | string | LodopScriptOptions

export function loadLodopScript(config: LodopScriptConfig): Promise<void> {
  const options = normalizeScriptOptions(config)
  const sources = normalizeScriptSources(options)
  return loadLodopScriptSources(sources, options, 0)
}

function loadLodopScriptSources(
  sources: LodopScriptSource[],
  options: LodopScriptOptions,
  index: number,
): Promise<void> {
  const source = sources[index]
  if (!source)
    return Promise.reject(new EasyInkPrintError('加载 LODOP 脚本失败', 'LODOP_SCRIPT_LOAD_FAILED'))

  return loadSingleLodopScript(source, options).catch((error) => {
    if (index + 1 < sources.length)
      return loadLodopScriptSources(sources, options, index + 1)
    throw error
  })
}

function loadSingleLodopScript(source: LodopScriptSource, options: LodopScriptOptions): Promise<void> {
  const document = options.document ?? globalThis.document
  if (!document)
    throw new EasyInkPrintError('当前环境不支持加载 LODOP 脚本', 'LODOP_SCRIPT_DOCUMENT_MISSING')

  const name = source.name ?? options.name
  const src = withScriptName(source.src, name)
  const cacheKey = `${source.id ?? options.id ?? ''}|${src}`
  if (!options.forceReload) {
    const cached = scriptLoadPromises.get(cacheKey)
    if (cached)
      return cached
  }

  const promise = new Promise<void>((resolve, reject) => {
    const existing = !options.forceReload ? findExistingScript(document, src, source.id ?? options.id) : undefined
    const script = existing ?? document.createElement('script')
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    let onLoad = () => {}
    let onError = () => {}

    const cleanup = () => {
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
      clearTimeout(timer)
    }
    const finish = (callback: () => void) => {
      if (settled)
        return
      settled = true
      cleanup()
      callback()
    }
    onLoad = () => finish(() => {
      script.dataset.easyinkLodopLoaded = 'true'
      resolve()
    })
    onError = () => finish(() => {
      scriptLoadPromises.delete(cacheKey)
      reject(new EasyInkPrintError(`加载 LODOP 脚本失败: ${src}`, 'LODOP_SCRIPT_LOAD_FAILED'))
    })
    timer = setTimeout(() => {
      finish(() => {
        scriptLoadPromises.delete(cacheKey)
        reject(new EasyInkPrintError(`加载 LODOP 脚本超时: ${src}`, 'LODOP_SCRIPT_LOAD_TIMEOUT'))
      })
    }, options.timeoutMs ?? 8000)

    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)

    if (existing) {
      if (isExistingScriptReady(existing, name))
        onLoad()
      return
    }

    if (source.id ?? options.id)
      script.id = (source.id ?? options.id)!
    script.async = true
    script.src = src
    const attrs = { ...options.attrs, ...source.attrs }
    for (const [name, value] of Object.entries(attrs))
      script.setAttribute(name, value)
    document.head.appendChild(script)
  })

  scriptLoadPromises.set(cacheKey, promise)
  return promise
}

function normalizeScriptOptions(config: LodopScriptConfig): LodopScriptOptions {
  if (config === true)
    return {}
  if (typeof config === 'string')
    return { src: config }
  return config
}

function normalizeScriptSources(options: LodopScriptOptions): LodopScriptSource[] {
  const rawSources = options.sources ?? (options.src ? [options.src] : [...DEFAULT_CLODOP_SCRIPT_URLS])
  return rawSources.map((source) => {
    if (typeof source === 'string')
      return { src: source, name: options.name, id: options.id, attrs: options.attrs }
    return {
      ...source,
      name: source.name ?? options.name,
      id: source.id ?? options.id,
      attrs: { ...options.attrs, ...source.attrs },
    }
  })
}

function findExistingScript(document: Document, src: string, id: string | undefined): HTMLScriptElement | undefined {
  if (id) {
    const byId = document.getElementById(id)
    if (byId instanceof HTMLScriptElement)
      return byId
  }
  return Array.from(document.scripts).find(script => script.src === src || script.getAttribute('src') === src)
}

function withScriptName(src: string, name: string | undefined): string {
  if (!name || /[?&]name=/.test(src))
    return src
  return `${src}${src.includes('?') ? '&' : '?'}name=${encodeURIComponent(name)}`
}

function isExistingScriptReady(script: HTMLScriptElement, runtimeName: string | undefined): boolean {
  const readyState = (script as HTMLScriptElement & { readyState?: string }).readyState
  return script.dataset.easyinkLodopLoaded === 'true'
    || readyState === 'loaded'
    || readyState === 'complete'
    || hasLodopRuntimeGlobal(runtimeName)
}

function hasLodopRuntimeGlobal(runtimeName: string | undefined): boolean {
  const globalWindow = globalThis as Record<string, unknown>
  if (runtimeName && (globalWindow[runtimeName] || globalWindow[`get${runtimeName}`]))
    return true
  return Boolean(globalWindow.getLodop || globalWindow.getCLodop || globalWindow.CLODOP)
}
