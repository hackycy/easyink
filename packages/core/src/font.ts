import type { DocumentSchema } from '@easyink/schema'
import { traverseNodes } from '@easyink/schema'

/**
 * Font descriptor from a font provider.
 */
export interface FontDescriptor {
  family: string
  displayName: string
  weights: string[]
  styles: string[]
  category?: string
  preview?: string
}

/**
 * Font provider interface for loading font data.
 * Implemented by the host application.
 */
export interface FontProvider {
  listFonts: () => Promise<FontDescriptor[]>
  loadFont: (fontFamily: string, weight?: string, style?: string) => Promise<FontSource>
}

export type FontSource = string | ArrayBuffer

export interface FontLoadRequest {
  family: string
  weight?: string
  style?: string
}

export type FontLoadStatus = 'unloaded' | 'loading' | 'loaded' | 'error'

export interface FontLoadState extends FontLoadRequest {
  status: FontLoadStatus
  message?: string
  cause?: unknown
}

export interface FontLoadSuccess extends FontLoadRequest {
  source: FontSource
}

export interface FontLoadFailure extends FontLoadRequest {
  message: string
  cause: unknown
}

export interface FontBatchLoadOptions {
  onFailure?: (failure: FontLoadFailure) => void
  logFailures?: boolean
}

export interface FontBatchLoadResult {
  loaded: FontLoadSuccess[]
  failures: FontLoadFailure[]
}

export interface FontPreloadResult {
  loadedFamilies: string[]
  failures: FontLoadFailure[]
}

interface FontCacheEntry {
  source: FontSource
  loaded: boolean
}

/**
 * FontManager provides font catalog access, loading state, caching and
 * optional @font-face injection for Designer and Viewer hosts.
 */
export class FontManager {
  private _provider?: FontProvider
  private _cache = new Map<string, FontCacheEntry>()
  private _inflight = new Map<string, Promise<FontSource>>()
  private _failures = new Map<string, FontLoadFailure>()
  private _fontList?: FontDescriptor[]
  private _generation = 0
  private _injectedTargets = new WeakMap<Document | ShadowRoot, Map<string, HTMLStyleElement>>()
  private _injectedTargetRefs = new Set<Document | ShadowRoot>()

  constructor(provider?: FontProvider) {
    this._provider = provider
  }

  get provider(): FontProvider | undefined {
    return this._provider
  }

  setProvider(provider?: FontProvider): void {
    this._provider = provider
    this._generation++
    this._cache.clear()
    this._inflight.clear()
    this._failures.clear()
    this._fontList = undefined
    this.clearInjectedFonts()
  }

  async listFonts(): Promise<FontDescriptor[]> {
    if (this._fontList)
      return this._fontList
    if (!this._provider)
      return []
    this._fontList = await this._provider.listFonts()
    return this._fontList
  }

  async loadFont(family: string, weight?: string, style?: string): Promise<FontSource> {
    const key = fontCacheKey(family, weight, style)
    const cached = this._cache.get(key)
    if (cached)
      return cached.source

    const inflight = this._inflight.get(key)
    if (inflight)
      return inflight

    if (!this._provider) {
      throw new Error(`No font provider configured, cannot load font: ${family}`)
    }

    const provider = this._provider
    const generation = this._generation
    this._failures.delete(key)
    const request = provider.loadFont(family, weight, style)
      .then((source) => {
        if (this._generation !== generation || this._provider !== provider)
          throw new Error(`Font provider changed while loading font: ${family}`)
        this._cache.set(key, { source, loaded: true })
        this._failures.delete(key)
        return source
      })
      .catch((err) => {
        if (this._generation === generation && this._provider === provider) {
          this._failures.set(key, toFontLoadFailure({ family, weight, style }, err))
        }
        throw err
      })
      .finally(() => {
        if (this._inflight.get(key) === request) {
          this._inflight.delete(key)
        }
      })

    this._inflight.set(key, request)
    return request
  }

  async ensureFontLoaded(request: FontLoadRequest, target?: Document | ShadowRoot): Promise<FontLoadSuccess> {
    const provider = this._provider
    const generation = this._generation
    const source = await this.loadFont(request.family, request.weight, request.style)
    if (this._generation !== generation || this._provider !== provider) {
      throw new Error(`Font provider changed while loading font: ${request.family}`)
    }
    if (target) {
      this.injectFontFace({
        family: request.family,
        weight: request.weight,
        style: request.style,
        source,
        target,
      })
    }
    return { ...request, source }
  }

  async loadFonts(requests: FontLoadRequest[], options: FontBatchLoadOptions = {}): Promise<FontBatchLoadResult> {
    const uniqueRequests = dedupeFontRequests(requests)
    if (uniqueRequests.length === 0) {
      return { loaded: [], failures: [] }
    }

    const settled = await Promise.allSettled(uniqueRequests.map(async (request) => {
      return await this.ensureFontLoaded(request)
    }))

    const result: FontBatchLoadResult = { loaded: [], failures: [] }
    const shouldLogFailures = options.logFailures ?? !options.onFailure

    settled.forEach((entry, index) => {
      if (entry.status === 'fulfilled') {
        result.loaded.push(entry.value)
        return
      }

      const failure = toFontLoadFailure(uniqueRequests[index]!, entry.reason)
      result.failures.push(failure)
      options.onFailure?.(failure)
      if (shouldLogFailures) {
        console.warn('[easyink] font preload failed', failure)
      }
    })

    return result
  }

  async preloadFonts(families: string[], options: FontBatchLoadOptions = {}): Promise<FontPreloadResult> {
    const result = await this.loadFonts(families.map(family => ({ family })), options)
    return {
      loadedFamilies: result.loaded.map(entry => entry.family),
      failures: result.failures,
    }
  }

  isLoaded(family: string, weight?: string, style?: string): boolean {
    const key = fontCacheKey(family, weight, style)
    return this._cache.get(key)?.loaded === true
  }

  getLoadState(family: string, weight?: string, style?: string): FontLoadState {
    const key = fontCacheKey(family, weight, style)
    const failure = this._failures.get(key)
    if (this._cache.get(key)?.loaded) {
      return { family, weight, style, status: 'loaded' }
    }
    if (this._inflight.has(key)) {
      return { family, weight, style, status: 'loading' }
    }
    if (failure) {
      return {
        family,
        weight,
        style,
        status: 'error',
        message: failure.message,
        cause: failure.cause,
      }
    }
    return { family, weight, style, status: 'unloaded' }
  }

  clear(): void {
    this._generation++
    this._cache.clear()
    this._inflight.clear()
    this._failures.clear()
    this._fontList = undefined
    this.clearInjectedFonts()
  }

  private injectFontFace(input: {
    family: string
    source: FontSource
    target: Document | ShadowRoot
    weight?: string
    style?: string
  }): void {
    const key = fontCacheKey(input.family, input.weight, input.style)
    let injected = this._injectedTargets.get(input.target)
    if (!injected) {
      injected = new Map()
      this._injectedTargets.set(input.target, injected)
      this._injectedTargetRefs.add(input.target)
    }
    if (injected.has(key))
      return

    const styleEl = createFontFaceStyle(input)
    getFontStyleContainer(input.target).appendChild(styleEl)
    injected.set(key, styleEl)
  }

  private clearInjectedFonts(): void {
    for (const target of this._injectedTargetRefs) {
      const injected = this._injectedTargets.get(target)
      if (!injected)
        continue
      for (const styleEl of injected.values()) {
        styleEl.remove()
      }
    }
    this._injectedTargets = new WeakMap()
    this._injectedTargetRefs.clear()
  }
}

export function collectFontFamilies(schema: DocumentSchema): Set<string> {
  const families = new Set<string>()

  if (schema.page.font)
    families.add(schema.page.font)

  traverseNodes(schema, (node) => {
    collectPropsFontFamilies(node.props, families)
  })

  return families
}

function collectPropsFontFamilies(props: Record<string, unknown> | undefined, families: Set<string>): void {
  if (!props)
    return

  const fontFamily = props.fontFamily
  if (typeof fontFamily === 'string' && fontFamily)
    families.add(fontFamily)

  const typography = props.typography
  if (typography && typeof typography === 'object' && !Array.isArray(typography)) {
    const typographyFontFamily = (typography as Record<string, unknown>).fontFamily
    if (typeof typographyFontFamily === 'string' && typographyFontFamily)
      families.add(typographyFontFamily)
  }
}

function createFontFaceStyle(input: {
  family: string
  source: FontSource
  target: Document | ShadowRoot
  weight?: string
  style?: string
}): HTMLStyleElement {
  const key = fontCacheKey(input.family, input.weight, input.style)
  const doc = getFontOwnerDocument(input.target)
  const src = typeof input.source === 'string'
    ? `url("${escapeCssString(input.source)}")`
    : `url("${arrayBufferToDataUrl(input.source)}")`

  const styleEl = doc.createElement('style')
  styleEl.dataset.easyinkFont = key
  styleEl.textContent = [
    '@font-face {',
    `font-family: "${escapeCssString(input.family)}";`,
    `src: ${src};`,
    `font-weight: ${input.weight || 'normal'};`,
    `font-style: ${input.style || 'normal'};`,
    'font-display: swap;',
    '}',
  ].join(' ')

  return styleEl
}

function getFontStyleContainer(target: Document | ShadowRoot): HTMLElement | ShadowRoot {
  if (target.nodeType === 9)
    return (target as Document).head
  return target as ShadowRoot
}

function getFontOwnerDocument(target: Document | ShadowRoot): Document {
  const doc = target.nodeType === 9 ? target as Document : target.ownerDocument
  if (!doc)
    throw new Error('Font injection target does not have an owner document')
  return doc
}

function fontCacheKey(family: string, weight?: string, style?: string): string {
  return `${family}|${weight || 'normal'}|${style || 'normal'}`
}

function arrayBufferToDataUrl(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return `data:font/woff2;base64,${btoa(binary)}`
}

function escapeCssString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function dedupeFontRequests(requests: FontLoadRequest[]): FontLoadRequest[] {
  const deduped = new Map<string, FontLoadRequest>()
  for (const request of requests) {
    const key = fontCacheKey(request.family, request.weight, request.style)
    if (!deduped.has(key)) {
      deduped.set(key, request)
    }
  }
  return [...deduped.values()]
}

function toFontLoadFailure(request: FontLoadRequest, reason: unknown): FontLoadFailure {
  return {
    ...request,
    message: reason instanceof Error ? reason.message : String(reason),
    cause: normalizeFontLoadCause(reason),
  }
}

function normalizeFontLoadCause(reason: unknown): unknown {
  if (reason instanceof Error) {
    return {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    }
  }
  return reason
}
