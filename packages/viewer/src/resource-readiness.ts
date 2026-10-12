import type { ViewerDiagnosticEvent } from './types'

export const RESOURCE_READY_TIMEOUT_MS = 3_000

export type ReadinessOutcome<T>
  = | { status: 'ready', value: T }
    | { status: 'failed', cause: unknown }
    | { status: 'timed-out' }

export function settleWithin<T>(work: PromiseLike<T>, signal: AbortSignal, timeoutMs = RESOURCE_READY_TIMEOUT_MS): Promise<ReadinessOutcome<T>> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      // Work may already have started before its signal was checked.
      void Promise.resolve(work).catch(() => {})
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }

    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const abort = () => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    const finish = (outcome: ReadinessOutcome<T>) => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      resolve(outcome)
    }
    timer = setTimeout(finish, timeoutMs, { status: 'timed-out' })
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(work).then(
      value => finish({ status: 'ready', value }),
      cause => finish({ status: 'failed', cause }),
    )
  })
}

export async function waitForCandidateImages(
  candidate: HTMLElement,
  document: Document,
  signal: AbortSignal,
  timeoutMs = RESOURCE_READY_TIMEOUT_MS,
): Promise<ViewerDiagnosticEvent[]> {
  const diagnostics: ViewerDiagnosticEvent[] = []
  const images = [...candidate.querySelectorAll<HTMLImageElement>('img[src], img[srcset], picture img')]
  const backgrounds = collectBackgroundImages(candidate)
  const backgroundResults = new Map<string, ReadinessOutcome<void>>()

  await Promise.all([...images.map(async (image) => {
    const outcome = await waitForImage(image, signal, timeoutMs)
    if (outcome.status === 'ready')
      return

    diagnostics.push(createImageDiagnostic(image, outcome.status))
    replaceImageWithPlaceholder(image)
  }), ...[...backgrounds.keys()].map(async (url) => {
    const image = document.createElement('img')
    image.decoding = 'async'
    image.src = url
    const outcome = await waitForImage(image, signal, timeoutMs)
    backgroundResults.set(url, outcome)
  })])

  for (const [url, refs] of backgrounds) {
    const outcome = backgroundResults.get(url)
    if (!outcome || outcome.status === 'ready')
      continue

    for (const element of refs) {
      const background = element.style.backgroundImage
      element.style.backgroundImage = replaceFailedBackground(background, url)
      element.dataset.resourceBackgroundPlaceholder = 'image'
      if (element.style.backgroundImage === 'none')
        element.style.backgroundColor = '#f3f4f6'
      diagnostics.push(createImageDiagnostic(element, outcome.status))
    }
  }

  return diagnostics
}

async function waitForImage(image: HTMLImageElement, signal: AbortSignal, timeoutMs: number): Promise<ReadinessOutcome<void>> {
  const decodeScope = new AbortController()
  try {
    // Detached candidates must not depend on viewport-driven lazy loading.
    image.loading = 'eager'
    return await settleWithin(Promise.resolve().then(() => decodeImage(image, decodeScope.signal)), signal, timeoutMs)
  }
  finally {
    // Release event listeners even if the browser does not implement decode().
    decodeScope.abort()
  }
}

function decodeImage(image: HTMLImageElement, signal: AbortSignal): Promise<void> {
  if (signal.aborted)
    return Promise.reject(signal.reason)
  if (image.complete && image.naturalWidth === 0)
    return Promise.reject(new Error('Image did not load'))

  if (typeof image.decode === 'function') {
    return image.decode().then(() => {
      if (!image.complete || image.naturalWidth === 0)
        throw new Error('Image decode completed without a loaded image')
    })
  }

  if (image.complete) {
    return image.naturalWidth > 0
      ? Promise.resolve()
      : Promise.reject(new Error('Image did not load'))
  }

  return new Promise((resolve, reject) => {
    function cleanup() {
      image.removeEventListener('load', loaded)
      image.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    function loaded() {
      cleanup()
      image.naturalWidth > 0 ? resolve() : reject(new Error('Image did not decode'))
    }
    function failed() {
      cleanup()
      reject(new Error('Image failed to load'))
    }
    function aborted() {
      cleanup()
      reject(signal.reason)
    }
    image.addEventListener('load', loaded, { once: true })
    image.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
  })
}

function collectBackgroundImages(candidate: HTMLElement): Map<string, HTMLElement[]> {
  const backgrounds = new Map<string, HTMLElement[]>()
  const elements = [candidate, ...candidate.querySelectorAll<HTMLElement>('*')]
  for (const element of elements) {
    const background = element.style.backgroundImage
    for (const { url } of parseBackgroundUrls(background)) {
      const refs = backgrounds.get(url) ?? []
      refs.push(element)
      backgrounds.set(url, refs)
    }
  }
  return backgrounds
}

function replaceFailedBackground(background: string, failedUrl: string): string {
  let result = background
  for (const token of parseBackgroundUrls(background).reverse()) {
    if (token.url === failedUrl)
      result = `${result.slice(0, token.start)}none${result.slice(token.end)}`
  }
  return result
}

function parseBackgroundUrls(value: string): { url: string, start: number, end: number }[] {
  const tokens: { url: string, start: number, end: number }[] = []
  let cursor = 0
  while (cursor < value.length) {
    const start = value.toLowerCase().indexOf('url', cursor)
    if (start < 0)
      break
    let open = start + 3
    while (/\s/.test(value[open] ?? ''))
      open++
    if (value[open] !== '(') {
      cursor = start + 3
      continue
    }

    let end = open + 1
    let quote = ''
    let escaped = false
    for (; end < value.length; end++) {
      const char = value[end]!
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (quote) {
        if (char === quote)
          quote = ''
      }
      else if (char === '"' || char === '\'') {
        quote = char
      }
      else if (char === ')') {
        break
      }
    }
    if (end >= value.length)
      break

    const content = value.slice(open + 1, end).trim()
    const quoted = (content.startsWith('"') && content.endsWith('"')) || (content.startsWith('\'') && content.endsWith('\''))
    const url = quoted ? content.slice(1, -1) : content
    if (url)
      tokens.push({ url, start, end: end + 1 })
    cursor = end + 1
  }
  return tokens
}

function replaceImageWithPlaceholder(image: HTMLImageElement): void {
  const placeholder = image.ownerDocument.createElement('div')
  placeholder.className = 'ei-viewer-resource-placeholder'
  placeholder.dataset.resourcePlaceholder = 'image'
  placeholder.setAttribute('role', 'img')
  placeholder.setAttribute('aria-label', image.alt || 'Image unavailable')
  if (image.alt)
    placeholder.title = image.alt
  placeholder.textContent = 'Image unavailable'
  placeholder.style.cssText = image.style.cssText
  placeholder.style.display = 'flex'
  placeholder.style.alignItems = 'center'
  placeholder.style.justifyContent = 'center'
  placeholder.style.boxSizing = 'border-box'
  placeholder.style.overflow = 'hidden'
  placeholder.style.backgroundColor = '#f3f4f6'
  placeholder.style.color = '#555'
  placeholder.style.fontSize ||= '12px'
  placeholder.style.whiteSpace = 'nowrap'
  placeholder.style.textOverflow = 'ellipsis'
  image.replaceWith(placeholder)
}

function createImageDiagnostic(element: Element, outcome: 'failed' | 'timed-out'): ViewerDiagnosticEvent {
  const nodeId = element.closest<HTMLElement>('[data-element-id]')?.dataset.elementId
  return {
    category: 'viewer',
    severity: 'warning',
    code: outcome === 'timed-out' ? 'IMAGE_LOAD_TIMEOUT' : 'IMAGE_LOAD_FAILED',
    message: outcome === 'timed-out' ? 'Image readiness timed out; a placeholder was used.' : 'Image could not be loaded or decoded; a placeholder was used.',
    nodeId,
    scope: 'material',
  }
}
