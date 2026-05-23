import { createServer } from 'http'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import type { Socket } from 'net'
import type { EngineApi } from '../../engine/engine-api'
import { ErrorCode, error } from '../../engine/models'
import type { PrinterResult, PrintRequestParams } from '../../engine/models'
import type { AuditService } from '../services/audit-service'
import type { HostConfig } from '../config/host-config'
import type { PrintController } from '../api/print-controller'
import { JobController } from '../api/job-controller'
import { LogController } from '../api/log-controller'
import { PrinterController } from '../api/printer-controller'
import { StatusController } from '../api/status-controller'
import { WebSocketServer } from './websocket-server'
import { parseMultipartBody } from './multipart-parser'

const MAX_HTTP_BODY_BYTES = 10 * 1024 * 1024

export class HttpServer {
  private server?: Server
  private readonly webSocketServer: WebSocketServer
  private readonly printerController: PrinterController
  private readonly jobController: JobController
  private readonly logController: LogController
  private readonly statusController = new StatusController()
  private readonly requestLimiter: AsyncSemaphore

  constructor(
    private readonly engine: EngineApi,
    private readonly printController: PrintController,
    auditService: AuditService,
    private readonly config: HostConfig
  ) {
    this.webSocketServer = new WebSocketServer(engine, printController, auditService, config)
    this.printerController = new PrinterController(engine)
    this.jobController = new JobController(engine)
    this.logController = new LogController(auditService)
    this.requestLimiter = new AsyncSemaphore(config.maxConcurrentRequests)
  }

  start(): Promise<number> {
    if (this.server) {
      return Promise.resolve(this.port)
    }

    this.server = createServer((req, res) => {
      void this.handle(req, res)
    })
    this.server.on('upgrade', (req, socket) => {
      this.webSocketServer.handleUpgrade(req, socket as Socket)
    })

    return new Promise((resolve, reject) => {
      const server = this.server!
      const onError = (err: Error): void => {
        server.off('listening', onListening)
        this.webSocketServer.dispose()
        this.server = undefined
        reject(err)
      }
      const onListening = (): void => {
        server.off('error', onError)
        resolve(this.port)
      }

      server.once('error', onError)
      server.listen(this.config.httpPort, '0.0.0.0', onListening)
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }

      const server = this.server
      const finish = (): void => {
        this.webSocketServer.dispose()
        this.server = undefined
        resolve()
      }

      try {
        server.close(finish)
      } catch {
        finish()
      }
    })
  }

  get port(): number {
    const address = this.server?.address() as AddressInfo | null
    return address?.port ?? this.config.httpPort
  }

  get connectionCount(): number {
    return this.webSocketServer.connectionCount
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    await this.requestLimiter.acquire()
    try {
      setCorsHeaders(req, res, this.config.trustAllOrigins)
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end()
        return
      }

      if (!this.authorize(req)) {
        writeJson(res, 401, error('unknown', ErrorCode.Unauthorized, '未授权'))
        return
      }

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      try {
        const result = await this.route(req, url)
        writeJson(res, result.success ? 200 : 400, result)
      } catch (err) {
        const code = err instanceof SyntaxError ? ErrorCode.InvalidJson : ErrorCode.InternalError
        writeJson(
          res,
          code === ErrorCode.InvalidJson ? 400 : 500,
          error('unknown', code, getErrorMessage(err))
        )
      }
    } finally {
      this.requestLimiter.release()
    }
  }

  private async route(req: IncomingMessage, url: URL): Promise<PrinterResult> {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return this.statusController.getStatus({
        httpPort: this.port,
        webSocket: true,
        connections: this.webSocketServer.connectionCount,
        queue: this.engine.getQueueStats().data,
        config: this.config
      })
    }

    if (req.method === 'GET' && url.pathname === '/api/status/connections') {
      return this.statusController.getConnections(this.webSocketServer.connectionCount)
    }

    if (req.method === 'GET' && url.pathname === '/api/printers') {
      return this.printerController.getPrinters()
    }

    if (
      req.method === 'GET' &&
      url.pathname.startsWith('/api/printers/') &&
      url.pathname.endsWith('/status')
    ) {
      const printerName = decodeURIComponent(
        url.pathname.slice('/api/printers/'.length, -'/status'.length)
      )
      return this.printerController.getPrinterStatus(printerName)
    }

    if (
      req.method === 'POST' &&
      (url.pathname === '/api/print' || url.pathname === '/api/print/async')
    ) {
      const params = await readPrintRequestBody(req)
      const command = url.pathname.endsWith('/async') ? 'printAsync' : 'print'
      return command === 'printAsync'
        ? this.printController.enqueuePrint(params as unknown as PrintRequestParams)
        : this.printController.print(params as unknown as PrintRequestParams)
    }

    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      return this.jobController.getAllJobs()
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
      return this.jobController.getJobStatus(
        decodeURIComponent(url.pathname.slice('/api/jobs/'.length))
      )
    }

    if (req.method === 'GET' && url.pathname === '/api/logs') {
      return this.logController.queryLogs(url.searchParams)
    }

    return error('unknown', ErrorCode.NotFound, `未找到接口: ${req.method} ${url.pathname}`)
  }

  private authorize(req: IncomingMessage): boolean {
    if (!this.config.apiKey) {
      return true
    }
    return req.headers['x-api-key'] === this.config.apiKey
  }
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse, trustAllOrigins: boolean): void {
  const origin = req.headers.origin
  res.setHeader(
    'Access-Control-Allow-Origin',
    trustAllOrigins ? '*' : typeof origin === 'string' && isLocalOrigin(origin) ? origin : 'null'
  )
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    const hostname = url.hostname.toLowerCase()
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    )
  } catch {
    return false
  }
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readPrintRequestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(req, MAX_HTTP_BODY_BYTES)
  const contentType = String(req.headers['content-type'] ?? '')
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    return readMultipartPrintParams(body, contentType)
  }
  if (body.byteLength === 0) {
    return {}
  }
  return JSON.parse(body.toString('utf8')) as Record<string, unknown>
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) {
      throw new Error('请求体超过 10MB 上限')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function readMultipartPrintParams(body: Buffer, contentType: string): Record<string, unknown> {
  const parts = parseMultipartBody(body, contentType)
  const paramsPart = parts.find((part) => part.name === 'params')
  const params = paramsPart
    ? (JSON.parse(paramsPart.data.toString('utf8')) as Record<string, unknown>)
    : {}
  const pdfPart = parts.find((part) => part.name === 'pdf' || part.name === 'file')
  if (pdfPart && pdfPart.data.byteLength > 0) {
    delete params.pdfBase64
    delete params.pdfUrl
    params.pdfBytes = pdfPart.data
  }
  return params
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

class AsyncSemaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(private readonly maxConcurrent: number) {}

  acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active += 1
        resolve()
      })
    })
  }

  release(): void {
    this.active = Math.max(0, this.active - 1)
    const next = this.waiters.shift()
    if (next) {
      next()
    }
  }
}
