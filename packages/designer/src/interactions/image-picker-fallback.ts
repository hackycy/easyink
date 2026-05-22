import type { DesignerImagePickRequest, DesignerImagePickResult } from '../types'

export interface ImagePickerFallbackDiagnostic {
  severity: 'warn' | 'error'
  message: string
  detail?: Record<string, unknown>
}

export interface ImagePickerFallbackOptions {
  document?: Document
  createFileReader?: () => FileReader
  createImage?: () => HTMLImageElement
  onDiagnostic?: (diagnostic: ImagePickerFallbackDiagnostic) => void
}

const DEFAULT_ACCEPT = ['image/*']
const CANCEL_FOCUS_DELAY_MS = 250
const PICKER_FAILSAFE_MS = 30_000

export async function pickImageWithFileInput(
  request: DesignerImagePickRequest,
  options: ImagePickerFallbackOptions = {},
): Promise<DesignerImagePickResult | null> {
  const doc = options.document ?? globalThis.document
  if (!doc?.body) {
    options.onDiagnostic?.({
      severity: 'error',
      message: 'Image picker fallback requires a browser document.',
      detail: { requestId: request.id },
    })
    return null
  }

  const input = doc.createElement('input')
  input.type = 'file'
  input.accept = normalizeAccept(request.accept).join(',')
  input.multiple = false
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  input.style.top = '-9999px'
  input.tabIndex = -1
  doc.body.appendChild(input)

  return await new Promise<DesignerImagePickResult | null>((resolve) => {
    let settled = false
    let focusCancelTimer: number | undefined
    let failsafeTimer: number | undefined

    function cleanup() {
      input.removeEventListener('change', onChange)
      input.removeEventListener('cancel', onCancel)
      globalThis.window?.removeEventListener('focus', onWindowFocus)
      if (focusCancelTimer !== undefined)
        globalThis.clearTimeout(focusCancelTimer)
      if (failsafeTimer !== undefined)
        globalThis.clearTimeout(failsafeTimer)
      input.remove()
    }

    function settle(result: DesignerImagePickResult | null) {
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

      const accept = normalizeAccept(request.accept)
      if (!matchesAccept(file, accept)) {
        options.onDiagnostic?.({
          severity: 'warn',
          message: 'Selected file type is not supported by this image field.',
          detail: { requestId: request.id, fileName: file.name, fileType: file.type, accept },
        })
        settle(null)
        return
      }

      try {
        settle(await readImageFileAsDataUrl(file, options))
      }
      catch (error) {
        options.onDiagnostic?.({
          severity: 'error',
          message: 'Failed to read selected image file.',
          detail: {
            requestId: request.id,
            fileName: file.name,
            error: error instanceof Error ? error.message : String(error),
          },
        })
        settle(null)
      }
    }

    input.addEventListener('change', onChange)
    input.addEventListener('cancel', onCancel)
    globalThis.window?.addEventListener('focus', onWindowFocus)
    failsafeTimer = globalThis.setTimeout(() => {
      if (!settled && doc.hasFocus())
        settle(null)
    }, PICKER_FAILSAFE_MS)

    try {
      if (typeof input.showPicker === 'function')
        input.showPicker()
      else
        input.click()
    }
    catch (error) {
      try {
        input.click()
      }
      catch {
        options.onDiagnostic?.({
          severity: 'error',
          message: 'Failed to open image file picker.',
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

export async function readImageFileAsDataUrl(
  file: File,
  options: ImagePickerFallbackOptions = {},
): Promise<DesignerImagePickResult> {
  const reader = options.createFileReader?.() ?? new FileReader()
  const src = await new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed.'))
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result)
        resolve(reader.result)
      else
        reject(new Error('FileReader returned an empty result.'))
    }
    reader.readAsDataURL(file)
  })

  const size = await probeImageSize(src, options.createImage).catch(() => undefined)
  return {
    src,
    name: file.name,
    width: size?.width,
    height: size?.height,
  }
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
  src: string,
  createImage: ImagePickerFallbackOptions['createImage'],
): Promise<{ width: number, height: number }> {
  return new Promise((resolve, reject) => {
    const image = createImage?.() ?? new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Image size probe failed.'))
    image.src = src
  })
}
