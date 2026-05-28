import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { RenderCliOptions } from './cli'
import type { RenderApiFailure, RenderApiJsonResponse, RenderApiRequest, RenderApiResponseType } from './protocol'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { RenderCliError, renderWithCli, runRenderCommand } from './cli'

const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024

export interface RenderApiServerOptions extends RenderCliOptions {
  host?: string
  port?: number
  maxBodyBytes?: number
}

export interface RenderApiServer {
  server: Server
  listen: (port?: number, host?: string) => Promise<AddressInfo>
  close: () => Promise<void>
}

const startedAt = Date.now()

export function createRenderApiServer(options: RenderApiServerOptions = {}): RenderApiServer {
  const server = createServer((req, res) => {
    handleRequest(req, res, options).catch((err: unknown) => {
      writeJson(res, statusForError(err), errorToResponse(err))
    })
  })

  return {
    server,
    listen(port = options.port ?? 18081, host = options.host ?? '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          server.off('error', reject)
          resolve(server.address() as AddressInfo)
        })
      })
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        })
      })
    },
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, options: RenderApiServerOptions): Promise<void> {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (method === 'GET' && url.pathname === '/health') {
    writeJson(res, 200, {
      ok: true,
      service: 'easyink-render-api',
      uptimeMs: Date.now() - startedAt,
    })
    return
  }

  if (method === 'GET' && url.pathname === '/v1/render/version') {
    const result = await runRenderCommand(['version'], options)
    writeJson(res, result.exitCode === 0 ? 200 : 502, {
      success: result.exitCode === 0,
      version: result.stdout.trim(),
      stderr: result.stderr.trim() || undefined,
    })
    return
  }

  if (method === 'GET' && url.pathname === '/v1/render/daemon/status') {
    const result = await runRenderCommand(['daemon', 'status'], options)
    writeJsonTextResult(res, result)
    return
  }

  if (method === 'POST' && url.pathname === '/v1/render/daemon/start') {
    writeJsonTextResult(res, await runRenderCommand(['daemon', 'start'], options))
    return
  }

  if (method === 'POST' && url.pathname === '/v1/render/daemon/stop') {
    writeJsonTextResult(res, await runRenderCommand(['daemon', 'stop'], options))
    return
  }

  if (method === 'POST' && url.pathname === '/v1/render/daemon/restart') {
    writeJsonTextResult(res, await runRenderCommand(['daemon', 'restart'], options))
    return
  }

  if (method === 'POST' && url.pathname === '/v1/render/browser/inspect') {
    const body = await readJsonBody<{ runtime?: RenderApiRequest['runtime'] }>(req, options.maxBodyBytes)
    const args = ['browser', 'inspect']
    appendRuntimeInspectFlags(args, { ...options.defaultRuntime, ...body.runtime })
    writeJsonTextResult(res, await runRenderCommand(args, options))
    return
  }

  if (method === 'GET' && url.pathname.startsWith('/v1/render/diagnostics/')) {
    const id = decodeURIComponent(url.pathname.slice('/v1/render/diagnostics/'.length))
    writeJsonTextResult(res, await runRenderCommand(['diagnostics', 'show', id], options))
    return
  }

  if (method === 'POST' && url.pathname === '/v1/render/pdf') {
    const body = await readJsonBody<RenderApiRequest>(req, options.maxBodyBytes)
    if (!body.requestId) {
      body.requestId = randomUUID()
    }
    const result = await renderWithCli(body, options)
    const responseType = resolveResponseType(req, body)
    const diagnostics = body.response?.includeDiagnostics ? result.diagnostics : undefined

    if (responseType === 'pdf') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/pdf')
      res.setHeader('x-easyink-request-id', result.cli.requestId)
      res.setHeader('x-easyink-page-count', String(result.cli.pageCount))
      if (result.cli.diagnosticsPath) {
        res.setHeader('x-easyink-diagnostics-path', result.cli.diagnosticsPath)
      }
      res.end(result.pdf)
      return
    }

    writeJson(res, 200, {
      success: true,
      requestId: result.cli.requestId,
      pageCount: result.cli.pageCount,
      diagnosticsPath: result.cli.diagnosticsPath,
      diagnostics,
      pdfBase64: result.pdf.toString('base64'),
    } satisfies RenderApiJsonResponse)
    return
  }

  writeJson(res, 404, {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${method} ${url.pathname}`,
    },
  } satisfies RenderApiFailure)
}

function resolveResponseType(req: IncomingMessage, body: RenderApiRequest): RenderApiResponseType {
  if (body.response?.type) {
    return body.response.type
  }
  const accept = req.headers.accept ?? ''
  return accept.includes('application/pdf') ? 'pdf' : 'base64Json'
}

async function readJsonBody<T>(req: IncomingMessage, maxBodyBytes = DEFAULT_MAX_BODY_BYTES): Promise<T> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.byteLength
    if (total > maxBodyBytes) {
      throw new RenderCliError(`Request body is larger than ${maxBodyBytes} bytes`, { code: 'REQUEST_BODY_TOO_LARGE' })
    }
    chunks.push(buffer)
  }
  try {
    const text = Buffer.concat(chunks).toString('utf8').trim()
    return (text ? JSON.parse(text) : {}) as T
  }
  catch {
    throw new RenderCliError('Request body must be a JSON object', { code: 'INVALID_JSON' })
  }
}

function writeJson(res: ServerResponse, statusCode: number, value: unknown): void {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(`${JSON.stringify(value, null, 2)}\n`)
}

function writeJsonTextResult(res: ServerResponse, result: { stdout: string, stderr: string, exitCode: number }): void {
  const stdout = result.stdout.trim()
  let data: unknown = stdout
  try {
    data = stdout ? JSON.parse(stdout) : undefined
  }
  catch {
    // Plain text commands such as daemon start/stop remain text payloads.
  }
  writeJson(res, result.exitCode === 0 ? 200 : 502, {
    success: result.exitCode === 0,
    data,
    stderr: result.stderr.trim() || undefined,
  })
}

function errorToResponse(err: unknown): RenderApiFailure {
  if (err instanceof RenderCliError) {
    return {
      success: false,
      requestId: err.cli?.requestId,
      diagnosticsPath: err.cli?.diagnosticsPath,
      error: {
        code: err.code,
        message: err.message,
        exitCode: err.exitCode,
        stderr: err.stderr?.trim() || undefined,
      },
    }
  }

  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : String(err),
    },
  }
}

function statusForError(err: unknown): number {
  if (!(err instanceof RenderCliError)) {
    return 500
  }
  if (err.code === 'INVALID_JSON' || err.code === 'REQUEST_BODY_TOO_LARGE') {
    return 400
  }
  if (err.code === 'INVALID_REQUEST' || err.code === 'INVALID_PDF' || err.code === 'SECURITY_BLOCKED') {
    return 422
  }
  if (err.code === 'RENDER_TIMEOUT' || err.code === 'RENDER_CLI_TIMEOUT') {
    return 504
  }
  return 502
}

function appendRuntimeInspectFlags(args: string[], runtime = {} as RenderApiRequest['runtime']): void {
  if (runtime?.disableSandbox) {
    args.push('--disable-sandbox')
  }
  pushStringFlag(args, '--browser-kind', runtime?.browserKind)
  pushStringFlag(args, '--browser-path', runtime?.browserPath)
  pushStringFlag(args, '--headless-mode', runtime?.headlessMode)
  pushStringFlag(args, '--profile-root', runtime?.profileRoot)
  pushStringFlag(args, '--temp-dir', runtime?.tempDir)
  pushStringFlag(args, '--log-dir', runtime?.logDir)
}

function pushStringFlag(args: string[], name: string, value: string | undefined): void {
  if (value) {
    args.push(name, value)
  }
}
