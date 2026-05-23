import { createHash } from 'crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { basename, join } from 'path'
import type { PrintRequestParams, PrinterResult } from '../../engine/models'
import type { LogLevel } from '../../engine/services/logger'
import type { HostConfig } from '../config/host-config'
import { resolvePrintDebugArtifactsDir } from '../config/host-config'

const REQUEST_FILE_NAME = 'request.json'
const INPUT_PDF_FILE_NAME = 'input.pdf'
const INPUT_HTML_FILE_NAME = 'input.html'
const MANIFEST_FILE_NAME = 'manifest.json'
const ENGINE_LOG_FILE_NAME = 'engine.log'
const SUBMIT_RESULT_FILE_NAME = 'submit-result.json'
const COMPLETION_RESULT_FILE_NAME = 'completion-result.json'

export class PrintDebugLogService {
  private readonly enabled: boolean
  private readonly artifactRoot: string
  private readonly retentionCount: number
  private readonly artifactPaths = new Map<string, string>()
  private cleanupTimer?: NodeJS.Timeout

  constructor(config: HostConfig) {
    this.enabled = config.printDebugLoggingEnabled
    this.artifactRoot = resolvePrintDebugArtifactsDir(config.printDebugArtifactsDir)
    this.retentionCount = Math.max(1, config.printDebugArtifactRetentionCount)

    if (!this.enabled) {
      return
    }

    mkdirSync(this.artifactRoot, { recursive: true })
    this.cleanupExpiredArtifacts()
    this.cleanupTimer = setInterval(() => this.cleanupExpiredArtifacts(), 24 * 60 * 60 * 1000)
    this.cleanupTimer.unref()
  }

  beginPrintRequest(requestId: string, command: string, params: PrintRequestParams): void {
    if (!this.enabled || !requestId) {
      return
    }

    const directory = this.createArtifactDirectory(requestId)
    this.artifactPaths.set(requestId, directory)
    writeJson(join(directory, REQUEST_FILE_NAME), {
      createdAt: new Date().toISOString(),
      command,
      parameters: sanitizePrintRequest(params, directory)
    })
    this.writeManifest(directory, requestId, command)
    this.cleanupExpiredArtifacts()
  }

  writeSubmitResult(requestId: string, result: PrinterResult): void {
    this.writeResult(requestId, SUBMIT_RESULT_FILE_NAME, result)
  }

  writeCompletionResult(
    requestId: string,
    request: PrintRequestParams,
    result: PrinterResult
  ): void {
    if (!this.enabled) {
      return
    }

    const directory = this.getArtifactDirectory(requestId)
    if (!directory) {
      return
    }

    writeJson(join(directory, COMPLETION_RESULT_FILE_NAME), {
      completedAt: new Date().toISOString(),
      request: summarizePrintRequest(request),
      result
    })
  }

  appendEngineLog(jobId: string | undefined, level: LogLevel, message: string): void {
    if (!this.enabled || !jobId) {
      return
    }

    const directory = this.getArtifactDirectory(jobId)
    if (!directory) {
      return
    }

    appendFileSync(
      join(directory, ENGINE_LOG_FILE_NAME),
      `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`
    )
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
  }

  private writeResult(requestId: string, fileName: string, result: PrinterResult): void {
    if (!this.enabled) {
      return
    }

    const directory = this.getArtifactDirectory(requestId)
    if (!directory) {
      return
    }

    writeJson(join(directory, fileName), {
      writtenAt: new Date().toISOString(),
      result
    })
  }

  private createArtifactDirectory(requestId: string): string {
    const dayDirectory = join(this.artifactRoot, formatDate(new Date()))
    mkdirSync(dayDirectory, { recursive: true })
    const directory = join(
      dayDirectory,
      `${formatArtifactTimestamp(new Date())}_${sanitizeFileName(requestId)}`
    )
    mkdirSync(directory, { recursive: true })
    return directory
  }

  private getArtifactDirectory(requestId: string): string | undefined {
    const cached = this.artifactPaths.get(requestId)
    if (cached && existsSync(cached)) {
      return cached
    }

    const suffix = `_${sanitizeFileName(requestId)}`
    const found = collectArtifactDirectories(this.artifactRoot)
      .filter((directory) => basename(directory).endsWith(suffix))
      .sort()
      .at(-1)

    if (found) {
      this.artifactPaths.set(requestId, found)
    }
    return found
  }

  private writeManifest(directory: string, requestId: string, command: string): void {
    writeJson(join(directory, MANIFEST_FILE_NAME), {
      requestId,
      command,
      createdAt: new Date().toISOString(),
      path: directory
    })
  }

  private cleanupExpiredArtifacts(): void {
    const artifactDirectories = collectArtifactDirectories(this.artifactRoot).sort().reverse()
    for (const directory of artifactDirectories.slice(this.retentionCount)) {
      if (canDeleteArtifactDirectory(directory)) {
        rmSync(directory, { recursive: true, force: true })
      }
    }

    if (!existsSync(this.artifactRoot)) {
      return
    }

    for (const entry of readdirSync(this.artifactRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const dayDirectory = join(this.artifactRoot, entry.name)
      if (readdirSync(dayDirectory).length === 0) {
        rmSync(dayDirectory, { recursive: true, force: true })
      }
    }
  }
}

function sanitizePrintRequest(
  request: PrintRequestParams,
  directory: string
): Record<string, unknown> {
  const payload = clonePrintRequest(request) as Record<string, unknown>
  redactApiKeys(payload)

  if (typeof payload.pdfBase64 === 'string') {
    const bytes = decodeBase64(payload.pdfBase64)
    if (bytes) {
      writeFileSync(join(directory, INPUT_PDF_FILE_NAME), bytes)
      payload.pdfBase64 = describeBytes(INPUT_PDF_FILE_NAME, bytes)
    } else {
      payload.pdfBase64 = { invalidBase64: true, length: payload.pdfBase64.length }
    }
  }

  if (payload.pdfBytes) {
    const bytes = Array.isArray(payload.pdfBytes)
      ? Buffer.from(payload.pdfBytes as number[])
      : Buffer.from(payload.pdfBytes as Uint8Array)
    writeFileSync(join(directory, INPUT_PDF_FILE_NAME), bytes)
    payload.pdfBytes = describeBytes(INPUT_PDF_FILE_NAME, bytes)
  }

  for (const key of ['html', 'htmlBase64'] as const) {
    if (typeof payload[key] === 'string') {
      const html = key === 'htmlBase64' ? decodeBase64Text(payload[key]) : payload[key]
      if (html != null) {
        writeFileSync(join(directory, INPUT_HTML_FILE_NAME), html, 'utf8')
        payload[key] = { savedAs: INPUT_HTML_FILE_NAME, chars: html.length }
      }
    }
  }

  if (payload.viewer && typeof payload.viewer === 'object') {
    const viewer = payload.viewer as { pages?: unknown[] }
    payload.viewer = {
      ...viewer,
      pages: Array.isArray(viewer.pages)
        ? { count: viewer.pages.length, chars: viewer.pages.map(String).join('').length }
        : viewer.pages
    }
  }

  return payload
}

function clonePrintRequest(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value)
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  if (Array.isArray(value)) {
    return value.map(clonePrintRequest)
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      clonePrintRequest(child)
    ])
  )
}

function summarizePrintRequest(request: PrintRequestParams): Record<string, unknown> {
  return {
    printerName: request.printerName,
    copies: request.copies,
    dpi: request.dpi,
    landscape: request.landscape,
    paperSize: request.paperSize,
    offset: request.offset,
    userData: request.userData,
    hasPdfBytes: Boolean(request.pdfBytes),
    hasPdfBase64: Boolean(request.pdfBase64),
    hasPdfUrl: Boolean(request.pdfUrl),
    hasHtml: request.html != null,
    hasHtmlBase64: Boolean(request.htmlBase64),
    hasHtmlUrl: Boolean(request.htmlUrl),
    hasViewer: Boolean(request.viewer)
  }
}

function redactApiKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(redactApiKeys)
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase() === 'apikey' || key.toLowerCase() === 'x-api-key') {
      ;(value as Record<string, unknown>)[key] = '***'
    } else {
      redactApiKeys(child)
    }
  }
}

function describeBytes(savedAs: string, bytes: Buffer): Record<string, unknown> {
  return {
    savedAs,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  }
}

function decodeBase64(value: string): Buffer | undefined {
  try {
    return Buffer.from(stripDataUrlPrefix(value), 'base64')
  } catch {
    return undefined
  }
}

function decodeBase64Text(value: string): string | undefined {
  const bytes = decodeBase64(value)
  return bytes ? bytes.toString('utf8') : undefined
}

function stripDataUrlPrefix(value: string): string {
  const marker = ';base64,'
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

function sanitizeFileName(value: string): string {
  const sanitized = [...value]
    .map((char) => (isInvalidFileNameChar(char) ? '_' : char))
    .join('')
    .trim()
  return sanitized || 'request'
}

function isInvalidFileNameChar(char: string): boolean {
  return '<>:"/\\|?*'.includes(char) || char.charCodeAt(0) < 32
}

function collectArtifactDirectories(root: string): string[] {
  if (!existsSync(root)) {
    return []
  }

  const directories: string[] = []
  for (const day of readdirSync(root, { withFileTypes: true })) {
    if (!day.isDirectory()) {
      continue
    }
    const dayDirectory = join(root, day.name)
    for (const item of readdirSync(dayDirectory, { withFileTypes: true })) {
      const directory = join(dayDirectory, item.name)
      if (item.isDirectory() && existsSync(join(directory, MANIFEST_FILE_NAME))) {
        directories.push(directory)
      }
    }
  }
  return directories
}

function canDeleteArtifactDirectory(directory: string): boolean {
  if (existsSync(join(directory, COMPLETION_RESULT_FILE_NAME))) {
    return true
  }

  if (!existsSync(join(directory, SUBMIT_RESULT_FILE_NAME))) {
    return false
  }

  try {
    const manifest = JSON.parse(readFileSync(join(directory, MANIFEST_FILE_NAME), 'utf8')) as {
      createdAt?: string
    }
    return manifest.createdAt
      ? Date.now() - new Date(manifest.createdAt).getTime() > 60 * 60 * 1000
      : true
  } catch {
    return false
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function formatArtifactTimestamp(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate()
  ).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(
    date.getMinutes()
  ).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}${String(
    date.getMilliseconds()
  ).padStart(3, '0')}`
}
