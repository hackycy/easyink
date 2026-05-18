import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHiPrintRuntimeClient, HiPrintClient } from './client'

const runtime = vi.hoisted(() => {
  const addedHtml: Record<string, unknown>[] = []
  const addedPanels: Record<string, unknown>[] = []
  const printOptions: Record<string, unknown>[] = []
  let successCallback: (() => void) | undefined

  class PrintTemplate {
    addPrintPanel = vi.fn((options: Record<string, unknown>) => {
      addedPanels.push(options)
      return {
        addPrintHtml: vi.fn((htmlOptions: Record<string, unknown>) => {
          addedHtml.push(htmlOptions)
        }),
      }
    })

    on = vi.fn((event: 'printSuccess' | 'printError', callback: () => void) => {
      if (event === 'printSuccess')
        successCallback = callback
    })

    print2 = vi.fn((_data: Record<string, unknown>, options: Record<string, unknown>) => {
      printOptions.push(options)
      successCallback?.()
    })
  }

  return {
    addedHtml,
    addedPanels,
    printOptions,
    init: vi.fn(),
    refreshPrinterList: vi.fn(),
    PrintTemplate,
    hiwebSocket: {
      setHost: vi.fn(),
      hasIo: vi.fn(() => true),
      start: vi.fn(),
      stop: vi.fn(),
      printerList: [] as Array<{ name: string, isDefault?: boolean }>,
    },
  }
})

vi.mock('vue-plugin-hiprint', () => ({
  hiprint: runtime,
}))

beforeEach(() => {
  runtime.addedHtml.length = 0
  runtime.addedPanels.length = 0
  runtime.printOptions.length = 0
  runtime.hiwebSocket.printerList = []
  runtime.init.mockClear()
  runtime.refreshPrinterList.mockReset()
  runtime.hiwebSocket.setHost.mockReset()
  runtime.hiwebSocket.hasIo.mockReset().mockReturnValue(true)
  runtime.hiwebSocket.start.mockClear()
  runtime.hiwebSocket.stop.mockClear()
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('hi print client', () => {
  it('disconnects and clears devices when endpoint config changes', () => {
    const client = new HiPrintClient({ serviceUrl: 'http://one.test' })
    client.connectionState = 'connected'
    client.devices = [{ name: 'Old Printer' }]

    const reconnect = client.configure({ serviceUrl: 'http://two.test' })

    expect(reconnect).toBe(true)
    expect(runtime.hiwebSocket.stop).toHaveBeenCalledTimes(1)
    expect(client.connectionState).toBe('idle')
    expect(client.devices).toEqual([])
    expect(client.serviceUrl).toBe('http://two.test')
  })

  it('rejects printer refresh timeout instead of reporting an empty list', async () => {
    vi.useFakeTimers()
    const client = new HiPrintClient({ refreshDelayMs: 0, refreshTimeoutMs: 10 })
    client.connectionState = 'connected'
    runtime.refreshPrinterList.mockImplementation(() => {})

    const refresh = client.refreshPrinters()
    const assertion = expect(refresh).rejects.toMatchObject({ code: 'HIPRINT_PRINTER_REFRESH_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10)

    await assertion
    expect(client.lastError).toBe('刷新 HiPrint 打印机列表超时')
  })

  it('serializes each viewer page with the root element for printing', async () => {
    const client = new HiPrintClient({ printerName: 'Printer A' })
    client.connectionState = 'connected'
    const page = document.createElement('section')
    page.className = 'ei-viewer-page'
    page.style.width = '80mm'
    page.innerHTML = '<span>hello</span>'

    await client.printPages([page], { width: 80, height: 60, printerName: 'Printer A' })

    expect(runtime.addedHtml).toHaveLength(1)
    expect(runtime.addedHtml[0]).toEqual({ options: expect.objectContaining({ content: expect.stringContaining('class="ei-viewer-page"') }) })
    expect(String((runtime.addedHtml[0] as { options: { content: string } }).options.content).startsWith('<section')).toBe(true)
  })

  it('sizes manual HTML elements to the full page and passes through print2 options', async () => {
    const client = new HiPrintClient({ printerName: 'Printer A' })
    client.connectionState = 'connected'

    await client.printHtml({
      html: '<main>hello</main>',
      width: 80,
      height: 60,
      printerName: 'Printer A',
      title: 'Job Title',
      silent: false,
      margins: { marginType: 'printableArea' },
    })

    expect(runtime.addedPanels[0]).toEqual(expect.objectContaining({
      height: 60,
      paperHeader: 0,
      width: 80,
    }))
    expect(runtime.addedPanels[0]?.paperFooter).toBeCloseTo(170.08, 2)
    expect(runtime.addedHtml[0]).toEqual({ options: expect.objectContaining({
      content: '<main>hello</main>',
      left: 0,
      top: 0,
    }) })
    expect(Number((runtime.addedHtml[0] as { options: { height: number } }).options.height)).toBeCloseTo(170.08, 2)
    expect(Number((runtime.addedHtml[0] as { options: { width: number } }).options.width)).toBeCloseTo(226.77, 2)
    expect(runtime.printOptions[0]).toEqual(expect.objectContaining({
      margins: { marginType: 'printableArea' },
      printer: 'Printer A',
      silent: false,
      title: 'Job Title',
    }))
  })

  it('maps EasyInk orientation to HiPrint panel orient values', async () => {
    const client = new HiPrintClient({ printerName: 'Printer A' })
    client.connectionState = 'connected'

    await client.printHtml({
      html: '<main>landscape</main>',
      width: 80,
      height: 60,
      printerName: 'Printer A',
      orientation: 'landscape',
    })

    await client.printHtml({
      html: '<main>portrait</main>',
      width: 80,
      height: 60,
      printerName: 'Printer A',
      orientation: 'portrait',
    })

    expect(runtime.addedPanels[0]).toEqual(expect.objectContaining({
      orient: 2,
    }))
    expect(runtime.addedPanels[1]).toEqual(expect.objectContaining({
      orient: 1,
    }))
    expect(runtime.printOptions[0]).toEqual(expect.objectContaining({
      landscape: true,
    }))
    expect(runtime.printOptions[1]).toEqual(expect.objectContaining({
      landscape: false,
    }))
  })

  it('falls back to hiwebSocket printerList when refresh callback returns empty', async () => {
    const client = new HiPrintClient()
    client.connectionState = 'connected'
    runtime.hiwebSocket.printerList = [{ name: 'Cached Printer', isDefault: true }]
    runtime.refreshPrinterList.mockImplementation((callback: (devices: unknown[]) => void) => callback([]))

    await expect(client.refreshPrinters()).resolves.toEqual([expect.objectContaining({
      displayName: 'Cached Printer',
      isDefault: true,
      name: 'Cached Printer',
    })])
  })

  it('creates a print-only runtime client without owning the socket lifecycle', async () => {
    let selectedPrinter = 'Runtime Printer'
    const client = createHiPrintRuntimeClient({
      hiprint: runtime as never,
      printerName: () => selectedPrinter,
      defaultCopies: 2,
    })

    await client.printHtml({
      html: '<main>runtime</main>',
      width: 80,
      height: 60,
      title: 'Runtime Job',
    })

    expect(runtime.init).not.toHaveBeenCalled()
    expect(runtime.hiwebSocket.setHost).not.toHaveBeenCalled()
    expect(runtime.hiwebSocket.stop).not.toHaveBeenCalled()
    expect(runtime.printOptions[0]).toEqual(expect.objectContaining({
      copies: 2,
      printer: 'Runtime Printer',
      title: 'Runtime Job',
    }))

    selectedPrinter = 'Runtime Printer 2'
    await client.printHtml({
      html: '<main>runtime 2</main>',
      width: 80,
      height: 60,
    })

    expect(runtime.printOptions[1]).toEqual(expect.objectContaining({
      printer: 'Runtime Printer 2',
    }))
  })

  it('lets the injected runtime use its default printer when explicitly allowed', async () => {
    const client = createHiPrintRuntimeClient({
      hiprint: runtime as never,
      allowDefaultPrinter: true,
    })

    await client.printHtml({
      html: '<main>default printer</main>',
      width: 80,
      height: 60,
    })

    expect(runtime.printOptions[0]).toEqual(expect.not.objectContaining({
      printer: expect.anything(),
    }))
  })
})
