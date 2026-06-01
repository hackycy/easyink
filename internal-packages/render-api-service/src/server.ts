import type { H3Event } from 'h3'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { RenderApiConfig } from './config'
import type { RenderApiFailure, RenderApiJsonResponse, RenderApiRequest, RenderApiResponseType } from './protocol'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { getRouterParam, H3 } from 'h3'
import { toNodeHandler } from 'h3/node'
import { RenderCliError, renderWithCli, runRenderCommand } from './cli'
import { DEFAULT_MAX_BODY_BYTES, loadRenderApiConfig } from './config'

export interface RenderApiServerOptions {
  config?: RenderApiConfig
}

export interface RenderApiServer {
  app: H3
  config: RenderApiConfig
  server: Server
  listen: (port?: number, host?: string) => Promise<AddressInfo>
  close: () => Promise<void>
}

const startedAt = Date.now()

export function createRenderApiApp(config: RenderApiConfig = loadRenderApiConfig()): H3 {
  const app = new H3({ silent: true })

  app.use((event) => {
    applyCorsHeaders(event, config)
    if (event.req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: event.res.headers,
      })
    }
  })

  app.get('/health', () => ({
    ok: true,
    service: 'easyink-render-api',
    uptimeMs: Date.now() - startedAt,
  }))

  app.get('/v1/render/version', handleApiError(async (event) => {
    const result = await runRenderCommand(['version'], config)
    event.res.status = result.exitCode === 0 ? 200 : 502
    return {
      success: result.exitCode === 0,
      version: result.stdout.trim(),
      stderr: result.stderr.trim() || undefined,
    }
  }))

  app.get('/v1/render/daemon/status', handleApiError(async (event) => {
    return writeJsonTextResult(event, await runRenderCommand(['daemon', 'status'], config))
  }))

  app.post('/v1/render/daemon/start', handleApiError(async (event) => {
    return writeJsonTextResult(event, await runRenderCommand(['daemon', 'start'], config))
  }))

  app.post('/v1/render/daemon/stop', handleApiError(async (event) => {
    return writeJsonTextResult(event, await runRenderCommand(['daemon', 'stop'], config))
  }))

  app.post('/v1/render/daemon/restart', handleApiError(async (event) => {
    return writeJsonTextResult(event, await runRenderCommand(['daemon', 'restart'], config))
  }))

  app.post('/v1/render/browser/inspect', handleApiError(async (event) => {
    const body = await readJsonBody<{ runtime?: RenderApiRequest['runtime'] }>(event, config.maxBodyBytes)
    const args = ['browser', 'inspect']
    appendRuntimeInspectFlags(args, { ...config.defaultRuntime, ...body.runtime })
    return writeJsonTextResult(event, await runRenderCommand(args, config))
  }))

  app.get('/v1/render/diagnostics/**', handleApiError(async (event) => {
    const id = decodeURIComponent(getRouterParam(event, '_') ?? '')
    return writeJsonTextResult(event, await runRenderCommand(['diagnostics', 'show', id], config))
  }))

  app.post('/v1/render/pdf', handleApiError(async (event) => {
    const body = await readJsonBody<RenderApiRequest>(event, config.maxBodyBytes)
    if (!body.requestId) {
      body.requestId = randomUUID()
    }
    const result = await renderWithCli(body, config)
    const responseType = resolveResponseType(event, body)
    const diagnostics = body.response?.includeDiagnostics ? result.diagnostics : undefined

    if (responseType === 'pdf') {
      event.res.headers.set('content-type', 'application/pdf')
      event.res.headers.set('x-easyink-request-id', result.cli.requestId)
      event.res.headers.set('x-easyink-page-count', String(result.cli.pageCount))
      if (result.cli.diagnosticsPath) {
        event.res.headers.set('x-easyink-diagnostics-path', result.cli.diagnosticsPath)
      }
      return result.pdf
    }

    return {
      success: true,
      requestId: result.cli.requestId,
      pageCount: result.cli.pageCount,
      diagnosticsPath: result.cli.diagnosticsPath,
      diagnostics,
      pdfBase64: result.pdf.toString('base64'),
    } satisfies RenderApiJsonResponse
  }))

  app.all('/**', (event) => {
    event.res.status = 404
    const url = new URL(event.req.url)
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `No route for ${event.req.method} ${url.pathname}`,
      },
    } satisfies RenderApiFailure
  })

  return app
}

export function createRenderApiServer(options: RenderApiServerOptions = {}): RenderApiServer {
  const config = options.config ?? loadRenderApiConfig()
  const app = createRenderApiApp(config)
  const server = createServer(toNodeHandler(app))

  return {
    app,
    config,
    server,
    listen(port = config.port, host = config.host) {
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

function applyCorsHeaders(event: H3Event, config: RenderApiConfig): void {
  event.res.headers.set('access-control-allow-origin', config.corsOrigin)
  event.res.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  event.res.headers.set('access-control-allow-headers', 'content-type, accept, authorization')
  event.res.headers.set('access-control-expose-headers', 'x-easyink-request-id, x-easyink-page-count, x-easyink-diagnostics-path')
  if (config.corsOrigin !== '*') {
    event.res.headers.append('vary', 'origin')
  }
}

function handleApiError(handler: (event: H3Event) => unknown | Promise<unknown>): (event: H3Event) => Promise<unknown> {
  return async (event) => {
    try {
      return await handler(event)
    }
    catch (err) {
      event.res.status = statusForError(err)
      return errorToResponse(err)
    }
  }
}

function resolveResponseType(event: H3Event, body: RenderApiRequest): RenderApiResponseType {
  if (body.response?.type) {
    return body.response.type
  }
  const accept = event.req.headers.get('accept') ?? ''
  return accept.includes('application/pdf') ? 'pdf' : 'base64Json'
}

async function readJsonBody<T>(event: H3Event, maxBodyBytes = DEFAULT_MAX_BODY_BYTES): Promise<T> {
  const contentLength = event.req.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBodyBytes) {
    throw new RenderCliError(`Request body is larger than ${maxBodyBytes} bytes`, { code: 'REQUEST_BODY_TOO_LARGE' })
  }

  const stream = event.req.body
  if (!stream) {
    return {} as T
  }

  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > maxBodyBytes) {
      throw new RenderCliError(`Request body is larger than ${maxBodyBytes} bytes`, { code: 'REQUEST_BODY_TOO_LARGE' })
    }
    chunks.push(Buffer.from(value))
  }

  try {
    const text = Buffer.concat(chunks, total).toString('utf8').trim()
    return (text ? JSON.parse(text) : {}) as T
  }
  catch {
    throw new RenderCliError('Request body must be a JSON object', { code: 'INVALID_JSON' })
  }
}

function writeJsonTextResult(event: H3Event, result: { stdout: string, stderr: string, exitCode: number }): unknown {
  const stdout = result.stdout.trim()
  let data: unknown = stdout
  try {
    data = stdout ? JSON.parse(stdout) : undefined
  }
  catch {
    data = stdout
  }
  event.res.status = result.exitCode === 0 ? 200 : 502
  return {
    success: result.exitCode === 0,
    data,
    stderr: result.stderr.trim() || undefined,
  }
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
