import type { ExportDiagnostic } from '@easyink/export-runtime'

const DEFAULT_ASSET_LOAD_TIMEOUT_MS = 10000

export async function waitForRenderableAssets(
  root: HTMLElement,
  options: {
    onDiagnostic?: (diagnostic: ExportDiagnostic) => void
    timeoutMs?: number
    diagnosticPrefix?: string
  } = {},
): Promise<void> {
  const { onDiagnostic, timeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS, diagnosticPrefix = 'CAPTURE' } = options
  const fonts = root.ownerDocument.fonts
  if (fonts) {
    try {
      await fonts.ready
    }
    catch (err) {
      onDiagnostic?.({
        severity: 'warning',
        code: `${diagnosticPrefix}_FONT_READY_FAILED`,
        message: 'Font readiness check failed before DOM capture; export will continue with current font state.',
        scope: 'asset',
        cause: serializeCause(err),
      })
    }
  }

  const images = Array.from(root.querySelectorAll('img'))
  const backgroundUrls = collectBackgroundImageUrls(root)
  await Promise.all([
    ...images.map(image => waitForImage(image, onDiagnostic, timeoutMs, diagnosticPrefix)),
    ...backgroundUrls.map(url => waitForBackgroundImage(root.ownerDocument, url, onDiagnostic, timeoutMs, diagnosticPrefix)),
  ])
}

function waitForImage(
  image: HTMLImageElement,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
  timeoutMs: number,
  diagnosticPrefix: string,
): Promise<void> {
  if (image.complete) {
    if (image.currentSrc && image.naturalWidth === 0)
      emitImageWarning(image, onDiagnostic, diagnosticPrefix)
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    function cleanup() {
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
      if (timeoutId !== undefined)
        clearTimeout(timeoutId)
    }
    function onLoad() {
      cleanup()
      resolve()
    }
    function onError() {
      cleanup()
      emitImageWarning(image, onDiagnostic, diagnosticPrefix)
      resolve()
    }
    function onTimeout() {
      cleanup()
      emitImageTimeoutWarning(image.currentSrc || image.src || image.alt || '', onDiagnostic, diagnosticPrefix)
      resolve()
    }

    image.addEventListener('load', onLoad, { once: true })
    image.addEventListener('error', onError, { once: true })
    timeoutId = setTimeout(onTimeout, timeoutMs)
  })
}

function waitForBackgroundImage(
  document: Document,
  src: string,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
  timeoutMs: number,
  diagnosticPrefix: string,
): Promise<void> {
  const ImageCtor = document.defaultView?.Image ?? Image
  const image = new ImageCtor()
  image.src = src

  if (image.complete) {
    if (image.naturalWidth === 0)
      emitBackgroundImageWarning(src, onDiagnostic, diagnosticPrefix)
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    function cleanup() {
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
      if (timeoutId !== undefined)
        clearTimeout(timeoutId)
    }
    function onLoad() {
      cleanup()
      resolve()
    }
    function onError() {
      cleanup()
      emitBackgroundImageWarning(src, onDiagnostic, diagnosticPrefix)
      resolve()
    }
    function onTimeout() {
      cleanup()
      emitBackgroundImageTimeoutWarning(src, onDiagnostic, diagnosticPrefix)
      resolve()
    }

    image.addEventListener('load', onLoad, { once: true })
    image.addEventListener('error', onError, { once: true })
    timeoutId = setTimeout(onTimeout, timeoutMs)
  })
}

function collectBackgroundImageUrls(root: HTMLElement): string[] {
  const urls = new Set<string>()
  const view = root.ownerDocument.defaultView
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]

  for (const element of elements) {
    for (const value of [element.style.backgroundImage, view?.getComputedStyle(element).backgroundImage]) {
      if (!value || value === 'none')
        continue
      for (const url of parseCssImageUrls(value))
        urls.add(url)
    }
  }

  return [...urls]
}

function parseCssImageUrls(value: string): string[] {
  const urls: string[] = []
  for (const match of value.matchAll(/url\((['"]?)(.*?)\1\)/g)) {
    const url = match[2]?.trim()
    if (url)
      urls.push(url)
  }
  return urls
}

function emitImageWarning(
  image: HTMLImageElement,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
  diagnosticPrefix: string,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: `${diagnosticPrefix}_IMAGE_LOAD_FAILED`,
    message: 'Image failed to load before DOM capture; export will continue without blocking.',
    scope: 'asset',
    detail: { src: image.currentSrc || image.src || image.alt || '' },
  })
}

function emitImageTimeoutWarning(
  src: string,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
  diagnosticPrefix: string,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: `${diagnosticPrefix}_IMAGE_LOAD_TIMEOUT`,
    message: 'Image load timed out before DOM capture; export will continue without blocking.',
    scope: 'asset',
    detail: { src },
  })
}

function emitBackgroundImageWarning(
  src: string,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
  diagnosticPrefix: string,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: `${diagnosticPrefix}_BACKGROUND_IMAGE_LOAD_FAILED`,
    message: 'Background image failed to load before DOM capture; export will continue without blocking.',
    scope: 'asset',
    detail: { src },
  })
}

function emitBackgroundImageTimeoutWarning(
  src: string,
  onDiagnostic: ((diagnostic: ExportDiagnostic) => void) | undefined,
  diagnosticPrefix: string,
): void {
  onDiagnostic?.({
    severity: 'warning',
    code: `${diagnosticPrefix}_BACKGROUND_IMAGE_LOAD_TIMEOUT`,
    message: 'Background image load timed out before DOM capture; export will continue without blocking.',
    scope: 'asset',
    detail: { src },
  })
}

function serializeCause(err: unknown): unknown {
  if (err instanceof Error)
    return { name: err.name, message: err.message, stack: err.stack }
  return err
}
