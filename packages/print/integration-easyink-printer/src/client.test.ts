import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EasyInkPrinterClient } from './client'

const sockets: MockWebSocket[] = []

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  })

  constructor(public readonly url: string) {
    sockets.push(this)
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  closeFromServer(reason = ''): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close', { reason }))
  }
}

let originalWebSocket: typeof WebSocket
let originalFetch: typeof fetch

beforeEach(() => {
  sockets.length = 0
  originalWebSocket = globalThis.WebSocket
  originalFetch = globalThis.fetch
  vi.useRealTimers()
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: MockWebSocket,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: originalWebSocket,
  })
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: originalFetch,
  })
})

async function connectClient(client: EasyInkPrinterClient): Promise<MockWebSocket> {
  const connected = client.connect()
  const socket = sockets[0]
  expect(socket).toBeDefined()
  socket!.open()
  await connected
  return socket!
}

function parseBinaryFrameMetadata(frame: ArrayBuffer): { id: string } {
  const metadataLength = new DataView(frame).getUint32(0, false)
  const metadataBytes = new Uint8Array(frame, 4, metadataLength)
  return JSON.parse(new TextDecoder().decode(metadataBytes)) as { id: string }
}

describe('easy ink printer client', () => {
  it('disconnects and clears remote state when endpoint config changes', async () => {
    const client = new EasyInkPrinterClient({ serviceUrl: 'http://one.test', apiKey: 'old-key' })
    const socket = await connectClient(client)
    client.devices = [{ name: 'Old Printer' }]
    client.jobs.set('job-1', { jobId: 'job-1', status: 'queued' })

    const reconnect = client.configure({ serviceUrl: 'http://two.test' })

    expect(reconnect).toBe(true)
    expect(socket.close).toHaveBeenCalledTimes(1)
    expect(client.connectionState).toBe('idle')
    expect(client.devices).toEqual([])
    expect(client.jobs.size).toBe(0)
    expect(client.serviceUrl).toBe('http://two.test')
  })

  it('wraps printer list timeout as a coded print error', async () => {
    vi.useFakeTimers()
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })),
    })
    const client = new EasyInkPrinterClient({ responseTimeoutMs: 10 })

    const list = client.refreshPrinters()
    const assertion = expect(list).rejects.toMatchObject({ code: 'PRINTER_LIST_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10)

    await assertion
  })

  it('rejects printer list service errors instead of treating them as an empty list', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async () => new Response(JSON.stringify({
        success: false,
        errorInfo: {
          code: 'INTERNAL_ERROR',
          message: 'printer backend failed',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })),
    })
    const client = new EasyInkPrinterClient()

    await expect(client.refreshPrinters()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'printer backend failed',
    })
    expect(client.devices).toEqual([])
  })

  it('rejects immediately when WebSocket send fails', async () => {
    const client = new EasyInkPrinterClient({ responseTimeoutMs: 1000 })
    const socket = await connectClient(client)
    socket.send.mockImplementationOnce(() => {
      throw new Error('socket closed')
    })

    await expect(client.printPdf(new Blob(['pdf']), { printerName: 'Printer A' }))
      .rejects
      .toMatchObject({ code: 'PRINTER_SEND_FAILED' })
  })

  it('forwards userData with printUploadedPdfAsync requests', async () => {
    const client = new EasyInkPrinterClient({ responseTimeoutMs: 1000 })
    const socket = await connectClient(client)

    const printPromise = client.printPdf(new Blob(['pdf']), {
      printerName: 'Printer A',
      userData: {
        userId: 'demo-user',
        documentType: 'receipt',
      },
    })

    await vi.waitFor(() => {
      expect(socket.send).toHaveBeenCalledTimes(1)
    })

    const uploadMetadata = parseBinaryFrameMetadata(socket.send.mock.calls[0]![0] as ArrayBuffer)
    socket.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ id: uploadMetadata.id, success: true, data: {} }),
    }))

    await vi.waitFor(() => {
      expect(socket.send).toHaveBeenCalledTimes(2)
    })

    const submitPayload = JSON.parse(String(socket.send.mock.calls[1]![0])) as {
      command: string
      id: string
      params: { userData?: { userId?: string, documentType?: string } }
    }

    expect(submitPayload.command).toBe('printUploadedPdfAsync')
    expect(submitPayload.params.userData).toEqual({
      userId: 'demo-user',
      documentType: 'receipt',
    })

    socket.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        id: submitPayload.id,
        success: true,
        data: { jobId: 'job-123', status: 'queued' },
      }),
    }))

    await expect(printPromise).resolves.toBe('job-123')
  })

  it('submits EasyInk schema and data through renderSource', async () => {
    const client = new EasyInkPrinterClient({ responseTimeoutMs: 1000 })
    const socket = await connectClient(client)

    const printPromise = client.printEasyInk({
      schema: {
        version: '1.0.0',
        unit: 'mm',
        page: { mode: 'fixed', width: 80, height: 120 },
        guides: { x: [], y: [] },
        elements: [],
      },
      data: { receipt: { no: 'R-001' } },
    }, {
      printerName: 'Printer A',
      paperSize: { width: 80, height: 120, unit: 'mm' },
      forcePageSize: true,
      renderOptions: {
        pdf: { printBackground: true },
        wait: { until: 'easyinkReady', timeoutMs: 5000 },
      },
    })

    await vi.waitFor(() => {
      expect(socket.send).toHaveBeenCalledTimes(1)
    })

    const submitPayload = JSON.parse(String(socket.send.mock.calls[0]![0])) as {
      command: string
      id: string
      params: {
        renderSource?: { type?: string, data?: unknown }
        renderOptions?: { pdf?: { printBackground?: boolean }, wait?: { until?: string } }
        paperSize?: { width?: number, height?: number, unit?: string }
        forcePaperSize?: boolean
      }
    }

    expect(submitPayload.command).toBe('printAsync')
    expect(submitPayload.params.renderSource).toMatchObject({
      type: 'easyink',
      data: { receipt: { no: 'R-001' } },
    })
    expect(submitPayload.params.paperSize).toEqual({ width: 80, height: 120, unit: 'mm' })
    expect(submitPayload.params.forcePaperSize).toBe(true)
    expect(submitPayload.params.renderOptions).toMatchObject({
      pdf: { printBackground: true },
      wait: { until: 'easyinkReady' },
    })

    socket.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        id: submitPayload.id,
        success: true,
        data: { jobId: 'job-render', status: 'queued' },
      }),
    }))

    await expect(printPromise).resolves.toBe('job-render')
  })

  it('submits HTML through renderSource', async () => {
    const client = new EasyInkPrinterClient({ responseTimeoutMs: 1000 })
    const socket = await connectClient(client)

    const printPromise = client.printHtml('<main class="easyink-ready">ok</main>', {
      printerName: 'Printer A',
      baseUrl: 'https://example.com/forms/',
      renderOptions: {
        wait: { selector: '.easyink-ready' },
      },
    })

    await vi.waitFor(() => {
      expect(socket.send).toHaveBeenCalledTimes(1)
    })

    const submitPayload = JSON.parse(String(socket.send.mock.calls[0]![0])) as {
      id: string
      params: {
        renderSource?: { type?: string, html?: string, baseUrl?: string }
        renderOptions?: { wait?: { selector?: string } }
      }
    }

    expect(submitPayload.params.renderSource).toEqual({
      type: 'html',
      html: '<main class="easyink-ready">ok</main>',
      baseUrl: 'https://example.com/forms/',
    })
    expect(submitPayload.params.renderOptions?.wait?.selector).toBe('.easyink-ready')

    socket.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        id: submitPayload.id,
        success: true,
        data: { jobId: 'job-html', status: 'queued' },
      }),
    }))

    await expect(printPromise).resolves.toBe('job-html')
  })

  it('keeps timeout failure state when closing a stalled connection', async () => {
    vi.useFakeTimers()
    const client = new EasyInkPrinterClient({ connectTimeoutMs: 10 })

    const connected = client.connect()
    const assertion = expect(connected).rejects.toMatchObject({ code: 'PRINTER_CONNECT_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10)

    await assertion
    expect(client.connectionState).toBe('error')
    expect(client.lastError).toContain('连接超时')
  })

  it('reconnects dropped WebSocket connections with VueUse transport state', async () => {
    vi.useFakeTimers()
    const client = new EasyInkPrinterClient({
      reconnectDelayMs: 10,
      reconnectBackoffMultiplier: 1,
      maxReconnectDelayMs: 10,
      maxReconnectAttempts: 2,
    })
    const socket = await connectClient(client)

    socket.closeFromServer('network lost')

    expect(client.isConnected).toBe(false)
    expect(client.connectionState).toBe('reconnecting')
    expect(client.lastError).toContain('network lost')
    expect(client.reconnectAttempts).toBe(1)

    await vi.advanceTimersByTimeAsync(10)
    const retrySocket = sockets[1]
    expect(retrySocket).toBeDefined()
    retrySocket!.open()

    expect(client.isConnected).toBe(true)
    expect(client.connectionState).toBe('connected')
    expect(client.reconnectAttempts).toBe(0)
  })

  it('fails connect after the configured maximum reconnect attempts', async () => {
    vi.useFakeTimers()
    const client = new EasyInkPrinterClient({
      connectTimeoutMs: 1000,
      reconnectDelayMs: 10,
      reconnectBackoffMultiplier: 1,
      maxReconnectDelayMs: 10,
      maxReconnectAttempts: 2,
    })

    const connected = client.connect()
    sockets[0]!.closeFromServer()
    expect(client.connectionState).toBe('reconnecting')
    expect(client.reconnectAttempts).toBe(1)

    await vi.advanceTimersByTimeAsync(10)
    sockets[1]!.closeFromServer()
    expect(client.reconnectAttempts).toBe(2)

    await vi.advanceTimersByTimeAsync(10)
    sockets[2]!.closeFromServer()

    await expect(connected).rejects.toMatchObject({ code: 'PRINTER_RECONNECT_FAILED' })
    expect(client.connectionState).toBe('error')
    expect(client.lastError).toContain('最大重连次数')
  })
})
