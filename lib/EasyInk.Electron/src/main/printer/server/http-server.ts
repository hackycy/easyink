import { createServer } from 'http'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { randomUUID } from 'crypto'
import type { EngineApi } from '../../engine/engine-api'
import { ErrorCode, error, ok } from '../../engine/models'
import type { PrinterCommand, PrinterResult, PrintRequestParams } from '../../engine/models'
import type { AuditService } from '../services/audit-service'
import type { HostConfig } from '../config/host-config'

export class HttpServer {
  private server?: Server

  constructor(
    private readonly engine: EngineApi,
    private readonly auditService: AuditService,
    private readonly config: HostConfig
  ) {}

  start(): Promise<number> {
    if (this.server) {
      return Promise.resolve(this.port)
    }

    this.server = createServer((req, res) => {
      void this.handle(req, res)
    })

    return new Promise((resolve, reject) => {
      this.server?.once('error', reject)
      this.server?.listen(this.config.httpPort, '127.0.0.1', () => resolve(this.port))
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }

      this.server.close(() => {
        this.server = undefined
        resolve()
      })
    })
  }

  get port(): number {
    const address = this.server?.address() as AddressInfo | null
    return address?.port ?? this.config.httpPort
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    setCorsHeaders(res, this.config.trustAllOrigins)
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    if (!this.authorize(req)) {
      writeJson(res, 401, error('unknown', ErrorCode.InvalidParams, '未授权'))
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    try {
      const result = await this.route(req, url)
      writeJson(res, result.success ? 200 : 400, result)
    } catch (err) {
      writeJson(res, 500, error('unknown', ErrorCode.InternalError, getErrorMessage(err)))
    }
  }

  private async route(req: IncomingMessage, url: URL): Promise<PrinterResult> {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return ok('status', {
        name: '@easyink/electron',
        httpPort: this.port,
        chromiumPrint: true,
        htmlPrint: true,
        uptimeSeconds: Math.round(process.uptime())
      })
    }

    if (req.method === 'GET' && url.pathname === '/api/printers') {
      return this.engine.handleCommand({ command: 'getPrinters', id: randomUUID() })
    }

    if (
      req.method === 'GET' &&
      url.pathname.startsWith('/api/printers/') &&
      url.pathname.endsWith('/status')
    ) {
      const printerName = decodeURIComponent(
        url.pathname.slice('/api/printers/'.length, -'/status'.length)
      )
      return this.engine.handleCommand({
        command: 'getPrinterStatus',
        id: randomUUID(),
        params: { printerName }
      })
    }

    if (
      req.method === 'POST' &&
      (url.pathname === '/api/print' || url.pathname === '/api/print/async')
    ) {
      const params = await readJsonBody(req)
      const command = url.pathname.endsWith('/async') ? 'printAsync' : 'print'
      const request: PrinterCommand = {
        command,
        id: randomUUID(),
        params
      }
      const result = await this.engine.handleCommand(request)
      this.auditService.record(command, params as unknown as PrintRequestParams, result)
      return result
    }

    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      return this.engine.handleCommand({ command: 'getAllJobs', id: randomUUID() })
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
      return this.engine.handleCommand({
        command: 'getJobStatus',
        id: randomUUID(),
        params: { jobId: decodeURIComponent(url.pathname.slice('/api/jobs/'.length)) }
      })
    }

    if (req.method === 'GET' && url.pathname === '/api/logs') {
      const limit = Number(url.searchParams.get('limit') ?? 100)
      return ok('logs', this.auditService.query(limit))
    }

    return error('unknown', ErrorCode.UnknownCommand, `未找到接口: ${req.method} ${url.pathname}`)
  }

  private authorize(req: IncomingMessage): boolean {
    if (!this.config.apiKey) {
      return true
    }
    return req.headers['x-api-key'] === this.config.apiKey
  }
}

function setCorsHeaders(res: ServerResponse, trustAllOrigins: boolean): void {
  res.setHeader('Access-Control-Allow-Origin', trustAllOrigins ? '*' : 'http://localhost')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > 10 * 1024 * 1024) {
      throw new Error('请求体超过 10MB 上限')
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) {
    return {}
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
