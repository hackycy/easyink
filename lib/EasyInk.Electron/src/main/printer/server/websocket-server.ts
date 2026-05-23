import { createHash, randomUUID } from 'crypto'
import type { IncomingMessage } from 'http'
import type { Socket } from 'net'
import { EventEmitter } from 'events'
import type { EngineApi } from '../../engine/engine-api'
import { ErrorCode, error, ok } from '../../engine/models'
import type { PrinterResult, PrintRequestParams } from '../../engine/models'
import type { PrintController } from '../api/print-controller'
import type { AuditService } from '../services/audit-service'
import type { HostConfig } from '../config/host-config'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const MAX_BINARY_MESSAGE_SIZE = 60 * 1024 * 1024
const MAX_PDF_BYTES = 50 * 1024 * 1024
const MAX_CHUNK_BYTES = 2 * 1024 * 1024
const UPLOAD_SESSION_TTL_MS = 10 * 60 * 1000

interface WebSocketMessage {
  command: string
  id: string
  params?: Record<string, unknown>
  pdfBytes?: Buffer
}

interface UploadSession {
  uploadId: string
  totalChunks: number
  totalBytes: number
  createdAt: number
  chunks: Array<Buffer | undefined>
  receivedChunks: number
  receivedBytes: number
}

export class WebSocketServer {
  private readonly connections = new Set<WebSocketConnection>()
  private readonly uploads = new Map<string, UploadSession>()

  constructor(
    private readonly engine: EngineApi,
    private readonly printController: PrintController,
    private readonly auditService: AuditService,
    private readonly config: HostConfig
  ) {}

  get connectionCount(): number {
    return this.connections.size
  }

  handleUpgrade(req: IncomingMessage, socket: Socket): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (url.pathname !== '/ws') {
      rejectUpgrade(socket, 404, 'Not Found')
      return
    }

    if (!this.authorize(req, url)) {
      rejectUpgrade(socket, 401, 'Unauthorized')
      return
    }

    if (!isWebSocketUpgrade(req)) {
      rejectUpgrade(socket, 400, 'Bad Request')
      return
    }

    const key = req.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      rejectUpgrade(socket, 400, 'Bad Request')
      return
    }

    const accept = createHash('sha1').update(`${key}${WS_GUID}`).digest('base64')
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        ''
      ].join('\r\n')
    )

    const connection = new WebSocketConnection(socket)
    this.connections.add(connection)
    connection.on('message', (messageType, payload) => {
      void this.handleMessage(connection, messageType, payload)
    })
    connection.on('close', () => {
      this.connections.delete(connection)
    })
  }

  dispose(): void {
    for (const connection of this.connections) {
      connection.close()
    }
    this.connections.clear()
    this.uploads.clear()
  }

  private async handleMessage(
    connection: WebSocketConnection,
    messageType: 'text' | 'binary',
    payload: Buffer
  ): Promise<void> {
    let result: PrinterResult
    try {
      const message =
        messageType === 'binary' ? parseBinaryMessage(payload) : parseTextMessage(payload)
      result = await this.routeMessage(message)
    } catch (err) {
      result = error('unknown', ErrorCode.InvalidJson, getErrorMessage(err))
    }

    connection.sendText(JSON.stringify(result))
  }

  private async routeMessage(message: WebSocketMessage): Promise<PrinterResult> {
    switch (message.command) {
      case 'print':
        return this.executePrintCommand(message.id, 'print', message.params, message.pdfBytes)
      case 'printAsync':
        return this.executePrintCommand(message.id, 'printAsync', message.params, message.pdfBytes)
      case 'uploadPdfChunk':
        return this.handleUploadPdfChunk(message)
      case 'printUploadedPdf':
        return this.handlePrintUploadedPdf(message, 'print')
      case 'printUploadedPdfAsync':
        return this.handlePrintUploadedPdf(message, 'printAsync')
      case 'getPrinters':
      case 'getPrinterStatus':
      case 'getJobStatus':
      case 'getAllJobs':
        return this.engine.handleCommand({
          command: message.command,
          id: message.id,
          params: message.params
        })
      case 'queryLogs':
        return ok(message.id, {
          logs: this.auditService.query({
            startTime: toOptionalString(message.params?.startTime),
            endTime: toOptionalString(message.params?.endTime),
            printerName: toOptionalString(message.params?.printerName),
            userId: toOptionalString(message.params?.userId),
            status: toOptionalString(message.params?.status),
            limit: Number(message.params?.limit ?? 100),
            offset: Number(message.params?.offset ?? 0)
          })
        })
      default:
        return error(message.id, ErrorCode.UnknownCommand, `未知命令: ${message.command}`)
    }
  }

  private async executePrintCommand(
    id: string,
    command: string,
    params: Record<string, unknown> | undefined,
    pdfBytes?: Buffer
  ): Promise<PrinterResult> {
    if (!params || Object.keys(params).length === 0) {
      return error(id, ErrorCode.InvalidParams, '缺少打印参数')
    }

    const printParams = { ...params }
    if (pdfBytes && pdfBytes.byteLength > 0) {
      delete printParams.pdfBase64
      delete printParams.pdfUrl
      printParams.pdfBytes = pdfBytes
    }

    return this.printController.executeCommand(
      command,
      id,
      printParams as unknown as PrintRequestParams
    )
  }

  private handleUploadPdfChunk(message: WebSocketMessage): PrinterResult {
    this.cleanupExpiredUploads()

    const params = message.params
    const pdfBytes = message.pdfBytes
    if (!params) {
      return error(message.id, ErrorCode.InvalidParams, '缺少分片参数')
    }
    if (!pdfBytes || pdfBytes.byteLength === 0) {
      return error(message.id, ErrorCode.InvalidParams, '缺少分片数据')
    }
    if (pdfBytes.byteLength > MAX_CHUNK_BYTES) {
      return error(
        message.id,
        'CHUNK_TOO_LARGE',
        `分片超过 ${MAX_CHUNK_BYTES / 1024 / 1024}MB 上限`
      )
    }

    const uploadId = toOptionalString(params.uploadId) ?? ''
    const chunkIndex = toInteger(params.chunkIndex)
    const totalChunks = toInteger(params.totalChunks)
    const totalBytes = toInteger(params.totalBytes)
    if (!uploadId || chunkIndex == null || totalChunks == null || totalBytes == null) {
      return error(
        message.id,
        ErrorCode.InvalidParams,
        '缺少 uploadId、chunkIndex、totalChunks 或 totalBytes'
      )
    }
    if (totalBytes <= 0 || totalBytes > MAX_PDF_BYTES) {
      return error(message.id, 'PDF_TOO_LARGE', `PDF 超过 ${MAX_PDF_BYTES / 1024 / 1024}MB 上限`)
    }
    if (totalChunks <= 0 || chunkIndex < 0 || chunkIndex >= totalChunks) {
      return error(message.id, ErrorCode.InvalidParams, '无效的分片序号')
    }

    const upload =
      this.uploads.get(uploadId) ?? createUploadSession(uploadId, totalChunks, totalBytes)
    this.uploads.set(uploadId, upload)

    const chunkResult = addUploadChunk(upload, chunkIndex, totalChunks, totalBytes, pdfBytes)
    if (!chunkResult.success) {
      return error(message.id, chunkResult.code, chunkResult.message)
    }

    return ok(message.id, {
      uploadId,
      receivedChunks: upload.receivedChunks,
      totalChunks: upload.totalChunks,
      receivedBytes: upload.receivedBytes,
      totalBytes: upload.totalBytes,
      completed:
        upload.receivedChunks === upload.totalChunks && upload.receivedBytes === upload.totalBytes
    })
  }

  private handlePrintUploadedPdf(
    message: WebSocketMessage,
    command: string
  ): Promise<PrinterResult> | PrinterResult {
    const params = message.params
    const uploadId = toOptionalString(params?.uploadId) ?? ''
    if (!params || !uploadId) {
      return error(message.id, ErrorCode.InvalidParams, '缺少 uploadId')
    }

    const upload = this.uploads.get(uploadId)
    if (!upload) {
      return error(message.id, 'UPLOAD_NOT_FOUND', `上传不存在: ${uploadId}`)
    }

    const pdfBytes = assembleUpload(upload)
    if (!pdfBytes) {
      return error(message.id, 'UPLOAD_INCOMPLETE', 'PDF 分片尚未上传完成')
    }

    this.uploads.delete(uploadId)
    const printParams = { ...params }
    delete printParams.uploadId
    return this.executePrintCommand(message.id, command, printParams, pdfBytes)
  }

  private cleanupExpiredUploads(): void {
    const cutoff = Date.now() - UPLOAD_SESSION_TTL_MS
    for (const [uploadId, upload] of this.uploads) {
      if (upload.createdAt < cutoff) {
        this.uploads.delete(uploadId)
      }
    }
  }

  private authorize(req: IncomingMessage, url: URL): boolean {
    if (!this.config.apiKey) {
      return true
    }
    return (
      req.headers['x-api-key'] === this.config.apiKey ||
      url.searchParams.get('apiKey') === this.config.apiKey
    )
  }
}

class WebSocketConnection extends EventEmitter {
  private buffer = Buffer.alloc(0)
  private fragments: Buffer[] = []
  private fragmentedType: 'text' | 'binary' | undefined
  private closed = false

  constructor(private readonly socket: Socket) {
    super()
    socket.on('data', (chunk) => this.read(chunk))
    socket.on('close', () => this.emit('close'))
    socket.on('error', () => this.emit('close'))
  }

  sendText(message: string): void {
    this.sendFrame(0x1, Buffer.from(message, 'utf8'))
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.sendFrame(0x8, Buffer.alloc(0))
    this.socket.end()
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 2) {
      const frame = tryReadFrame(this.buffer)
      if (!frame) {
        return
      }
      this.buffer = this.buffer.subarray(frame.frameLength)
      this.handleFrame(frame)
    }
  }

  private handleFrame(frame: WebSocketFrame): void {
    if (frame.opcode === 0x8) {
      this.close()
      return
    }
    if (frame.opcode === 0x9) {
      this.sendFrame(0xa, frame.payload)
      return
    }
    if (frame.opcode === 0xa) {
      return
    }

    const type =
      frame.opcode === 0x1 ? 'text' : frame.opcode === 0x2 ? 'binary' : this.fragmentedType
    if (!type) {
      this.close()
      return
    }

    if (frame.opcode === 0x1 || frame.opcode === 0x2) {
      this.fragmentedType = frame.fin ? undefined : type
      this.fragments = [frame.payload]
    } else {
      this.fragments.push(frame.payload)
    }

    const size = this.fragments.reduce((sum, item) => sum + item.byteLength, 0)
    if (size > MAX_BINARY_MESSAGE_SIZE) {
      this.sendText(JSON.stringify(error('unknown', 'MESSAGE_TOO_LARGE', 'WebSocket 消息过大')))
      this.close()
      return
    }

    if (frame.fin) {
      const payload = Buffer.concat(this.fragments)
      this.fragments = []
      this.fragmentedType = undefined
      this.emit('message', type, payload)
    }
  }

  private sendFrame(opcode: number, payload: Buffer): void {
    if (this.socket.destroyed) {
      return
    }
    this.socket.write(encodeFrame(opcode, payload))
  }
}

interface WebSocketFrame {
  fin: boolean
  opcode: number
  payload: Buffer
  frameLength: number
}

function tryReadFrame(buffer: Buffer): WebSocketFrame | undefined {
  const first = buffer[0]
  const second = buffer[1]
  const fin = (first & 0x80) !== 0
  const opcode = first & 0x0f
  const masked = (second & 0x80) !== 0
  let payloadLength = second & 0x7f
  let offset = 2

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return undefined
    payloadLength = buffer.readUInt16BE(offset)
    offset += 2
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return undefined
    const high = buffer.readUInt32BE(offset)
    const low = buffer.readUInt32BE(offset + 4)
    const length = high * 2 ** 32 + low
    if (length > Number.MAX_SAFE_INTEGER) {
      throw new Error('WebSocket 消息过大')
    }
    payloadLength = length
    offset += 8
  }

  const maskLength = masked ? 4 : 0
  const frameLength = offset + maskLength + payloadLength
  if (buffer.length < frameLength) {
    return undefined
  }

  const mask = masked ? buffer.subarray(offset, offset + 4) : undefined
  offset += maskLength
  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength))
  if (mask) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4]
    }
  }

  return { fin, opcode, payload, frameLength }
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const headerLength = payload.length < 126 ? 2 : payload.length <= 0xffff ? 4 : 10
  const frame = Buffer.alloc(headerLength + payload.length)
  frame[0] = 0x80 | opcode
  if (payload.length < 126) {
    frame[1] = payload.length
    payload.copy(frame, 2)
  } else if (payload.length <= 0xffff) {
    frame[1] = 126
    frame.writeUInt16BE(payload.length, 2)
    payload.copy(frame, 4)
  } else {
    frame[1] = 127
    frame.writeUInt32BE(0, 2)
    frame.writeUInt32BE(payload.length, 6)
    payload.copy(frame, 10)
  }
  return frame
}

function parseTextMessage(payload: Buffer): WebSocketMessage {
  const parsed = JSON.parse(payload.toString('utf8')) as Partial<WebSocketMessage>
  return {
    command: String(parsed.command ?? ''),
    id: parsed.id ? String(parsed.id) : randomUUID(),
    params: parsed.params as Record<string, unknown> | undefined
  }
}

function parseBinaryMessage(payload: Buffer): WebSocketMessage {
  if (payload.byteLength < 4) {
    throw new Error('二进制消息过短')
  }

  const metadataLength = payload.readUInt32BE(0)
  if (metadataLength <= 0 || metadataLength > payload.byteLength - 4) {
    throw new Error('无效的二进制元数据长度')
  }

  const metadata = parseTextMessage(payload.subarray(4, 4 + metadataLength))
  return {
    ...metadata,
    pdfBytes: Buffer.from(payload.subarray(4 + metadataLength))
  }
}

function createUploadSession(
  uploadId: string,
  totalChunks: number,
  totalBytes: number
): UploadSession {
  return {
    uploadId,
    totalChunks,
    totalBytes,
    createdAt: Date.now(),
    chunks: Array.from<Buffer | undefined>({ length: totalChunks }).fill(undefined),
    receivedChunks: 0,
    receivedBytes: 0
  }
}

function addUploadChunk(
  upload: UploadSession,
  chunkIndex: number,
  totalChunks: number,
  totalBytes: number,
  chunk: Buffer
): { success: true } | { success: false; code: string; message: string } {
  if (totalChunks !== upload.totalChunks || totalBytes !== upload.totalBytes) {
    return { success: false, code: 'INVALID_CHUNK', message: '上传元数据不一致' }
  }
  if (upload.chunks[chunkIndex]) {
    return { success: true }
  }
  if (upload.receivedBytes + chunk.byteLength > upload.totalBytes) {
    return { success: false, code: 'INVALID_CHUNK', message: '分片总大小超过声明大小' }
  }

  upload.chunks[chunkIndex] = chunk
  upload.receivedChunks += 1
  upload.receivedBytes += chunk.byteLength
  return { success: true }
}

function assembleUpload(upload: UploadSession): Buffer | undefined {
  if (upload.receivedChunks !== upload.totalChunks || upload.receivedBytes !== upload.totalBytes) {
    return undefined
  }
  if (upload.chunks.some((chunk) => !chunk)) {
    return undefined
  }
  return Buffer.concat(upload.chunks as Buffer[], upload.totalBytes)
}

function isWebSocketUpgrade(req: IncomingMessage): boolean {
  return (
    req.headers.upgrade?.toLowerCase() === 'websocket' &&
    String(req.headers.connection ?? '')
      .toLowerCase()
      .includes('upgrade')
  )
}

function rejectUpgrade(socket: Socket, statusCode: number, message: string): void {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

function toInteger(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) ? numberValue : undefined
}

function toOptionalString(value: unknown): string | undefined {
  return value == null ? undefined : String(value)
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
