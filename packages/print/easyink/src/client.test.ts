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
