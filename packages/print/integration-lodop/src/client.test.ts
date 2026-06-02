import { describe, expect, it, vi } from 'vitest'
import { createLodopClient, createLodopRuntimeClient } from './client'
import { loadLodopScript } from './script'

function createRuntime() {
  const calls = {
    html: [] as unknown[][],
    image: [] as unknown[][],
    modes: [] as unknown[][],
    pageSizes: [] as unknown[][],
    printerIndexes: [] as unknown[],
    copies: [] as unknown[],
    actions: [] as string[],
  }

  return {
    calls,
    runtime: {
      VERSION: '6.6.0.0',
      PRINT_INIT: vi.fn(),
      SET_PRINT_PAGESIZE: vi.fn((...args: unknown[]) => calls.pageSizes.push(args)),
      SET_PRINTER_INDEX: vi.fn((printer: unknown) => calls.printerIndexes.push(printer)),
      SET_PRINT_COPIES: vi.fn((copies: unknown) => calls.copies.push(copies)),
      SET_PRINT_MODE: vi.fn((...args: unknown[]) => calls.modes.push(args)),
      SET_PRINT_STYLEA: vi.fn(),
      ADD_PRINT_HTM: vi.fn((...args: unknown[]) => calls.html.push(args)),
      ADD_PRINT_IMAGE: vi.fn((...args: unknown[]) => calls.image.push(args)),
      GET_PRINTER_COUNT: vi.fn(() => 2),
      GET_PRINTER_NAME: vi.fn((index: number) => index === -1 ? 'Printer B' : `Printer ${index === 0 ? 'A' : 'B'}`),
      PRINT: vi.fn(() => {
        calls.actions.push('print')
        return true
      }),
      PREVIEW: vi.fn(() => {
        calls.actions.push('preview')
        return 1
      }),
      PRINT_SETUP: vi.fn(() => 1),
      PRINT_DESIGN: vi.fn(() => 1),
    },
  }
}

describe('lodop client', () => {
  it('prints html through ADD_PRINT_HTM with millimeter page sizing', async () => {
    const { calls, runtime } = createRuntime()
    const client = createLodopRuntimeClient({
      lodop: runtime,
      printerName: 'Printer A',
      defaultCopies: 2,
    })

    await client.printHtml({
      html: '<main>hello</main>',
      width: 80,
      height: 60,
      orientation: 'landscape',
      title: 'Job Title',
    })

    expect(runtime.PRINT_INIT).toHaveBeenCalledWith('Job Title')
    expect(calls.printerIndexes).toEqual(['Printer A'])
    expect(calls.copies).toEqual([2])
    expect(calls.pageSizes[0]).toEqual([2, 800, 600, ''])
    expect(calls.html[0]).toEqual([0, 0, '80mm', '60mm', '<main>hello</main>'])
    expect(calls.actions).toEqual(['print'])
  })

  it('calls LODOP html methods with the runtime as this', async () => {
    const { runtime } = createRuntime()
    const htmlThisValues: unknown[] = []
    runtime.ADD_PRINT_HTM = vi.fn(function (this: unknown, ...args: unknown[]) {
      htmlThisValues.push(this)
      return args.length
    })
    const client = createLodopRuntimeClient({ lodop: runtime })

    await client.printHtml({
      html: '<main>context</main>',
      width: 80,
      height: 60,
    })

    expect(htmlThisValues).toEqual([runtime])
  })

  it('prints base64 images through ADD_PRINT_IMAGE', async () => {
    const { calls, runtime } = createRuntime()
    const client = createLodopRuntimeClient({
      lodop: runtime,
      allowDefaultPrinter: true,
    })

    await client.printBase64Image('data:image/png;base64,abc', {
      width: 40,
      height: 30,
      action: 'preview',
      itemWidth: '100%',
      itemHeight: '100%',
      stretch: 2,
    })

    expect(calls.pageSizes[0]).toEqual([2, 400, 300, ''])
    expect(calls.image[0]).toEqual([0, 0, '100%', '100%', 'data:image/png;base64,abc'])
    expect(runtime.SET_PRINT_STYLEA).toHaveBeenCalledWith(0, 'Stretch', 2)
    expect(calls.actions).toEqual(['preview'])
  })

  it('lists printers and marks the runtime default printer', async () => {
    const { runtime } = createRuntime()
    const client = createLodopRuntimeClient({ lodop: runtime })

    await expect(client.listPrinters()).resolves.toEqual([
      { displayName: 'Printer A', index: 0, isDefault: false, name: 'Printer A' },
      { displayName: 'Printer B', index: 1, isDefault: true, name: 'Printer B' },
    ])
  })

  it('waits for C-LODOP On_Return when the runtime is async', async () => {
    const { calls, runtime } = createRuntime()
    const asyncRuntime = runtime as typeof runtime & {
      CVERSION?: string
      On_Return?: (taskId: unknown, value: unknown) => void
    }
    Object.assign(asyncRuntime, {
      CVERSION: '6.6.4.2',
      PRINT: vi.fn(() => {
        setTimeout(() => asyncRuntime.On_Return?.('task-1', true), 0)
        return undefined
      }),
    })
    const client = createLodopRuntimeClient({ lodop: asyncRuntime, resultTimeoutMs: 1000 })
    const printed = client.printHtml({
      html: '<main>async</main>',
      width: 80,
      height: 60,
    })

    await expect(printed).resolves.toBe(true)
    expect(calls.html).toHaveLength(1)
  })

  it('serializes concurrent C-LODOP actions for the same runtime', async () => {
    const { calls, runtime } = createRuntime()
    const asyncRuntime = runtime as typeof runtime & {
      CVERSION?: string
      On_Return?: (taskId: unknown, value: unknown) => void
    }
    Object.assign(asyncRuntime, {
      CVERSION: '6.6.4.2',
      PRINT: vi.fn(() => undefined),
    })
    const client = createLodopRuntimeClient({ lodop: asyncRuntime, resultTimeoutMs: 1000 })

    const first = client.printHtml({ html: '<main>one</main>', width: 80, height: 60 })
    const second = client.printHtml({ html: '<main>two</main>', width: 80, height: 60 })

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(calls.html).toHaveLength(1)

    asyncRuntime.On_Return?.('task-1', true)
    await expect(first).resolves.toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(calls.html).toHaveLength(2)

    asyncRuntime.On_Return?.('task-2', true)
    await expect(second).resolves.toBe(true)
  })

  it('includes the raw LODOP print result when PRINT fails', async () => {
    const { runtime } = createRuntime()
    runtime.PRINT = vi.fn(() => false)
    const client = createLodopRuntimeClient({ lodop: runtime })

    await expect(client.printHtml({
      html: '<main>failed</main>',
      width: 80,
      height: 60,
    })).rejects.toThrow('PRINT 返回 false')
  })

  it('serializes canvas materials as image data URLs for viewer pages', async () => {
    const { calls, runtime } = createRuntime()
    const client = createLodopRuntimeClient({ lodop: runtime })
    const page = document.createElement('section')
    page.className = 'ei-viewer-page'
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,canvas')
    page.appendChild(canvas)

    await client.printPages([page], { width: 80, height: 60 })

    const html = String(calls.html[0]?.[4])
    expect(html).toContain('<img')
    expect(html).toContain('data:image/png;base64,canvas')
    expect(html).not.toContain('<canvas')
  })

  it('loads a named C-LODOP script and resolves the named runtime', async () => {
    const { runtime } = createRuntime()
    const globalWindow = globalThis as Record<string, unknown>
    const client = createLodopClient({
      script: {
        src: 'http://localhost:8000/CLodopfuncs.js',
        name: 'CLODOPA',
        timeoutMs: 1000,
      },
    })

    const ready = client.ready()
    const script = document.querySelector('script[src="http://localhost:8000/CLodopfuncs.js?name=CLODOPA"]')
    expect(script).toBeInstanceOf(HTMLScriptElement)

    globalWindow.CLODOPA = runtime
    script?.dispatchEvent(new Event('load'))

    await expect(ready).resolves.toBe(runtime)

    delete globalWindow.CLODOPA
  })

  it('allows applications to load the script separately and inject their own getter', async () => {
    const { runtime } = createRuntime()
    const loaded = loadLodopScript({
      src: 'http://localhost:8000/CLodopfuncs.js',
      timeoutMs: 1000,
      forceReload: true,
    })
    const script = Array.from(document.scripts).find(item => item.getAttribute('src') === 'http://localhost:8000/CLodopfuncs.js')
    script?.dispatchEvent(new Event('load'))
    await loaded

    const client = createLodopClient({
      getLodop: () => runtime,
      script: false,
    })

    await expect(client.ready()).resolves.toBe(runtime)
  })

  it('waits for an existing LODOP script element to finish loading', async () => {
    const script = document.createElement('script')
    script.src = 'http://localhost:8000/pending-CLodopfuncs.js'
    document.head.appendChild(script)

    let settled = false
    const loaded = loadLodopScript({
      src: 'http://localhost:8000/pending-CLodopfuncs.js',
      timeoutMs: 1000,
    }).then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    script.dispatchEvent(new Event('load'))
    await loaded
    expect(settled).toBe(true)
  })
})
