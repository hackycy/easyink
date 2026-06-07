import type { DesignerResolvedTextFile, DesignerTextFilePickRequest } from '../types'

export interface TextFilePickerDiagnostic {
  severity: 'warn' | 'error'
  message: string
  detail?: Record<string, unknown>
}

export interface TextFilePickerOptions {
  document?: Document
  input?: HTMLInputElement | null
  onDiagnostic?: (diagnostic: TextFilePickerDiagnostic) => void
  messages?: Partial<Record<TextFilePickerMessageKey, string>>
}

const DEFAULT_ACCEPT = ['text/*']
const CANCEL_FOCUS_DELAY_MS = 1500
const PICKER_FAILSAFE_MS = 30_000
type TextFilePickerMessageKey = 'documentMissing' | 'unsupportedFileType' | 'pickerOpenFailed' | 'fileTooLarge' | 'fileReadFailed'

const DEFAULT_MESSAGES: Record<TextFilePickerMessageKey, string> = {
  documentMissing: 'Text file picker requires a browser document.',
  unsupportedFileType: 'Selected file type is not supported by this text field.',
  pickerOpenFailed: 'Failed to open text file picker.',
  fileTooLarge: 'Selected text file is too large.',
  fileReadFailed: 'Failed to read selected text file.',
}

export async function pickTextFileWithFileInput(
  request: DesignerTextFilePickRequest,
  options: TextFilePickerOptions = {},
): Promise<DesignerResolvedTextFile | null> {
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

  return await new Promise<DesignerResolvedTextFile | null>((resolve) => {
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

    function settle(result: DesignerResolvedTextFile | null) {
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

      settle(await readAcceptedTextFile(file, request, options))
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

export async function readAcceptedTextFile(
  file: File,
  request: DesignerTextFilePickRequest,
  options: TextFilePickerOptions = {},
): Promise<DesignerResolvedTextFile | null> {
  const accept = normalizeAccept(request.accept)
  if (!matchesAccept(file, accept)) {
    options.onDiagnostic?.({
      severity: 'warn',
      message: message(options, 'unsupportedFileType'),
      detail: { requestId: request.id, fileName: file.name, fileType: file.type, accept },
    })
    return null
  }

  if (typeof request.maxBytes === 'number' && request.maxBytes >= 0 && file.size > request.maxBytes) {
    options.onDiagnostic?.({
      severity: 'warn',
      message: message(options, 'fileTooLarge'),
      detail: { requestId: request.id, fileName: file.name, fileSize: file.size, maxBytes: request.maxBytes },
    })
    return null
  }

  try {
    const text = await readFileAsText(file, request.encoding)
    return {
      text,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
    }
  }
  catch (error) {
    options.onDiagnostic?.({
      severity: 'error',
      message: message(options, 'fileReadFailed'),
      detail: {
        requestId: request.id,
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error),
      },
    })
    return null
  }
}

export async function readFileAsText(file: File, encoding?: string): Promise<string> {
  if (typeof FileReader !== 'function' && typeof file.text === 'function')
    return await file.text()

  const reader = new FileReader()
  return await new Promise<string>((resolve, reject) => {
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed.'))
    reader.onload = () => {
      if (typeof reader.result === 'string')
        resolve(reader.result)
      else
        reject(new Error('FileReader did not return text.'))
    }
    reader.readAsText(file, encoding)
  })
}

export function getTextFilePickerAccept(accept?: string[]): string[] {
  return normalizeAccept(accept)
}

function message(options: TextFilePickerOptions, key: TextFilePickerMessageKey): string {
  return options.messages?.[key] ?? DEFAULT_MESSAGES[key]
}

function normalizeAccept(accept?: string[]): string[] {
  const values = accept?.map(item => item.trim()).filter(Boolean) ?? []
  return values.length > 0 ? values : DEFAULT_ACCEPT
}

function matchesAccept(file: File, accept: string[]): boolean {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  const extensionAccepts = accept.map(entry => entry.toLowerCase()).filter(entry => entry.startsWith('.'))

  return accept.some((entry) => {
    const normalized = entry.toLowerCase()
    if (normalized === '*/*')
      return true
    if (normalized.startsWith('.') && name.endsWith(normalized))
      return true
    if (!type)
      return extensionAccepts.length === 0
    if (normalized.endsWith('/*'))
      return type.startsWith(`${normalized.slice(0, -1)}`)
    return type === normalized
  })
}
