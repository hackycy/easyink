import type { DesignerAssetPickRequest, DesignerAssetUploadRequest, DesignerLocalAssetPickResult, DesignerResolvedAsset } from '../types'

export interface AssetFilePickerDiagnostic {
  severity: 'warn' | 'error'
  message: string
  detail?: Record<string, unknown>
}

export interface AssetFilePickerOptions {
  document?: Document
  input?: HTMLInputElement | null
  createImage?: () => HTMLImageElement
  imageProbeTimeoutMs?: number
  onDiagnostic?: (diagnostic: AssetFilePickerDiagnostic) => void
  messages?: Partial<Record<AssetFilePickerMessageKey, string>>
}

const DEFAULT_ACCEPT = ['image/*']
const CANCEL_FOCUS_DELAY_MS = 1500
const PICKER_FAILSAFE_MS = 30_000
const IMAGE_PROBE_TIMEOUT_MS = 1500
type AssetFilePickerMessageKey = 'documentMissing' | 'unsupportedFileType' | 'pickerOpenFailed'

const DEFAULT_MESSAGES: Record<AssetFilePickerMessageKey, string> = {
  documentMissing: 'Asset file picker requires a browser document.',
  unsupportedFileType: 'Selected file type is not supported by this image field.',
  pickerOpenFailed: 'Failed to open image file picker.',
}

export async function pickAssetWithFileInput(
  request: DesignerAssetPickRequest,
  options: AssetFilePickerOptions = {},
): Promise<DesignerLocalAssetPickResult | null> {
  const doc = options.document ?? options.input?.ownerDocument ?? globalThis.document
  if (!doc?.body) {
    options.onDiagnostic?.({
      severity: 'error',
      message: message(options, 'documentMissing'),
      detail: { requestId: request.id },
    })
    return null
  }

  const input = options.input ?? doc.createElement('input')
  const removeInputOnCleanup = !input.isConnected
  input.type = 'file'
  input.accept = normalizeAccept(request.accept).join(',')
  input.multiple = false
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  input.style.top = '-9999px'
  input.tabIndex = -1
  input.value = ''
  if (removeInputOnCleanup)
    doc.body.appendChild(input)

  return await new Promise<DesignerLocalAssetPickResult | null>((resolve) => {
    let settled = false
    let focusCancelTimer: ReturnType<typeof globalThis.setTimeout> | undefined
    let failsafeTimer: ReturnType<typeof globalThis.setTimeout> | undefined
    const supportsCancelEvent = 'oncancel' in input

    function cleanup() {
      input.removeEventListener('change', onChange)
      input.removeEventListener('cancel', onCancel)
      globalThis.window?.removeEventListener('focus', onWindowFocus)
      if (focusCancelTimer !== undefined)
        globalThis.clearTimeout(focusCancelTimer)
      if (failsafeTimer !== undefined)
        globalThis.clearTimeout(failsafeTimer)
      input.value = ''
      if (removeInputOnCleanup)
        input.remove()
    }

    function settle(result: DesignerLocalAssetPickResult | null) {
      if (settled)
        return
      settled = true
      cleanup()
      resolve(result)
    }

    function onCancel() {
      settle(null)
    }

    function onWindowFocus() {
      if (focusCancelTimer !== undefined)
        globalThis.clearTimeout(focusCancelTimer)
      focusCancelTimer = globalThis.setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0))
          settle(null)
      }, CANCEL_FOCUS_DELAY_MS)
    }

    async function onChange() {
      if (focusCancelTimer !== undefined) {
        globalThis.clearTimeout(focusCancelTimer)
        focusCancelTimer = undefined
      }
      const file = input.files?.[0]
      if (!file) {
        settle(null)
        return
      }

      settle(await readAcceptedAssetFile(file, request, options))
    }

    input.addEventListener('change', onChange)
    input.addEventListener('cancel', onCancel)
    if (!supportsCancelEvent)
      globalThis.window?.addEventListener('focus', onWindowFocus)
    failsafeTimer = globalThis.setTimeout(() => {
      if (!settled && doc.hasFocus())
        settle(null)
    }, PICKER_FAILSAFE_MS)

    try {
      input.click()
    }
    catch (error) {
      try {
        input.showPicker?.()
      }
      catch {
        options.onDiagnostic?.({
          severity: 'error',
          message: message(options, 'pickerOpenFailed'),
          detail: {
            requestId: request.id,
            error: error instanceof Error ? error.message : String(error),
          },
        })
        settle(null)
      }
    }
  })
}

export async function readAcceptedAssetFile(
  file: File,
  request: DesignerAssetPickRequest,
  options: AssetFilePickerOptions = {},
): Promise<DesignerLocalAssetPickResult | null> {
  const accept = getImagePickerAccept(request.accept)
  if (!matchesAccept(file, accept)) {
    options.onDiagnostic?.({
      severity: 'warn',
      message: message(options, 'unsupportedFileType'),
      detail: { requestId: request.id, fileName: file.name, fileType: file.type, accept },
    })
    return null
  }

  try {
    const size = await probeImageSize(file, options.createImage, options.imageProbeTimeoutMs).catch(() => undefined)
    return {
      file,
      name: file.name,
      width: size?.width,
      height: size?.height,
    }
  }
  catch {
    return null
  }
}

export async function uploadAssetAsDataUrl(request: DesignerAssetUploadRequest): Promise<DesignerResolvedAsset> {
  const url = await readFileAsDataUrl(request.file)
  return {
    url,
    alt: request.picked.alt,
    width: request.picked.width,
    height: request.picked.height,
    name: request.picked.name ?? request.file.name,
    metadata: request.picked.metadata,
  }
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  const reader = new FileReader()
  return await new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed.'))
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result)
        resolve(reader.result)
      else
        reject(new Error('FileReader returned an empty result.'))
    }
    reader.readAsDataURL(file)
  })
}

export function getImagePickerAccept(accept?: string[]): string[] {
  return normalizeAccept(accept)
}

function message(options: AssetFilePickerOptions, key: AssetFilePickerMessageKey): string {
  return options.messages?.[key] ?? DEFAULT_MESSAGES[key]
}

function normalizeAccept(accept?: string[]): string[] {
  const values = accept?.map(item => item.trim()).filter(Boolean) ?? []
  return values.length > 0 ? values : DEFAULT_ACCEPT
}

function matchesAccept(file: File, accept: string[]): boolean {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (!type)
    return true

  return accept.some((entry) => {
    const normalized = entry.toLowerCase()
    if (normalized === '*/*')
      return true
    if (normalized.endsWith('/*'))
      return type.startsWith(`${normalized.slice(0, -1)}`)
    if (normalized.startsWith('.'))
      return name.endsWith(normalized)
    return type === normalized
  })
}

function probeImageSize(
  src: string | Blob,
  createImage: AssetFilePickerOptions['createImage'],
  timeoutMs = IMAGE_PROBE_TIMEOUT_MS,
): Promise<{ width: number, height: number }> {
  return new Promise((resolve, reject) => {
    const image = createImage?.() ?? new Image()
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined
    let objectUrl: string | undefined

    function cleanup() {
      image.onload = null
      image.onerror = null
      if (timeout !== undefined)
        globalThis.clearTimeout(timeout)
      if (objectUrl)
        URL.revokeObjectURL(objectUrl)
    }

    image.onload = () => {
      cleanup()
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('Image size probe failed.'))
    }
    timeout = globalThis.setTimeout(() => {
      cleanup()
      reject(new Error('Image size probe timed out.'))
    }, timeoutMs)
    if (typeof src === 'string') {
      image.src = src
      return
    }

    if (typeof URL.createObjectURL !== 'function') {
      cleanup()
      reject(new Error('URL.createObjectURL is unavailable.'))
      return
    }

    objectUrl = URL.createObjectURL(src)
    image.src = objectUrl
  })
}
