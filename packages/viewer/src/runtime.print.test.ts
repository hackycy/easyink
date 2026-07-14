import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { ViewerRuntime } from './runtime'
import type { ViewerExportContext, ViewerOptions, ViewerPageMetrics, ViewerPrintContext, ViewerPrintOptions, ViewerPrintPolicy } from './types'
import { compileBuiltinMaterialProfile } from '@easyink/builtin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViewer as createProfileViewer, resolvePrintPolicy } from './index'
import { buildPrintStyles } from './print-service'

const builtinProfile = compileBuiltinMaterialProfile('all')
const createViewer = (options: Omit<ViewerOptions, 'profile'> & { profile?: ViewerOptions['profile'] }) => createProfileViewer({ ...options, profile: options.profile ?? builtinProfile })

function createItemsTable(): MaterialNode {
  const columns = [
    { id: 'column-0', track: { kind: 'fr' as const, weight: 0.5 } },
    { id: 'column-1', track: { kind: 'fr' as const, weight: 0.5 } },
  ]
  return {
    id: 'items',
    type: 'table-data',
    x: 5,
    y: 10,
    width: 70,
    height: 24,
    modelVersion: 1,
    model: {
      kind: 'data',
      columns,
      bands: [
        tableBand('header', 0, ['名称', '数量'], columns),
        tableBand('detail', 1, ['', ''], columns, ['items:name', 'items:qty']),
        tableBand('footer', 2, ['合计', '3'], columns),
      ],
      merges: [],
      style: {},
      data: { collectionPort: 'records' },
    } as unknown as Record<string, unknown>,
    slots: {},
    bindings: {
      'records': { sourceId: 'invoice', fieldPath: 'items' },
      'items:name': { sourceId: 'invoice', fieldPath: 'items/name', fieldLabel: '名称' },
      'items:qty': { sourceId: 'invoice', fieldPath: 'items/qty', fieldLabel: '数量' },
    },
    output: { visibility: 'include' },
  }
}

function tableBand(role: 'header' | 'detail' | 'footer', rowIndex: number, text: string[], columns: Array<{ id: string }>, ports: string[] = []) {
  return {
    id: `band-${rowIndex}`,
    role,
    rows: [{
      id: `row-${rowIndex}`,
      minHeight: 8,
      cells: columns.map((column, columnIndex) => ({
        id: `cell-${rowIndex}-${columnIndex}`,
        columnId: column.id,
        content: { kind: 'text' as const, text: text[columnIndex] ?? '', ...(ports[columnIndex] ? { bindingPort: ports[columnIndex] } : {}) },
      })),
    }],
  }
}

function createContinuousSchema(pageHeight = 100): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'continuous',
      width: 80,
      height: pageHeight,
      layout: { strategy: 'stack-flow', flowAxis: 'y' },
      pagination: { strategy: 'none' },
      reflow: { strategy: 'flow-y', preserveTrailingGap: true, collisionPolicy: 'diagnose' },
    },
    guides: { x: [], y: [] },
    elements: [
      createItemsTable(),
      {
        id: 'after',
        type: 'line',
        x: 5,
        y: 62,
        width: 70,
        height: 8,
        modelVersion: 1,
        model: {
          lineColor: '#000000',
          lineType: 'solid',
        },
        slots: {},
        bindings: {},
        output: { visibility: 'include' },
      },
    ],
  }
}

function createContinuousSchemaWithPrint(orientation: 'auto' | 'portrait' | 'landscape'): DocumentSchema {
  return {
    ...createContinuousSchema(),
    page: {
      ...createContinuousSchema().page,
      print: {
        orientation,
      },
    },
  }
}

function createFixedSchema(): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: {
      mode: 'fixed',
      width: 80,
      height: 60,
    },
    guides: { x: [], y: [] },
    elements: [],
  }
}

function createThreePageFixedSchema(): DocumentSchema {
  return {
    ...createFixedSchema(),
    page: {
      ...createFixedSchema().page,
      pagination: { strategy: 'fixed-sheets', pageCount: 3 },
    },
    elements: [10, 70, 130].map((y, index): MaterialNode => ({
      id: `page-line-${index}`,
      type: 'line',
      x: 5,
      y,
      width: 70,
      height: 5,
      modelVersion: 1,
      model: { lineColor: '#000000', lineType: 'solid' },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    })),
  }
}

function createData(): Record<string, unknown> {
  return {
    items: Array.from({ length: 10 }, (_, index) => ({ name: `Item ${index + 1}`, qty: index + 1 })),
  }
}

function getPrintPolicy(viewer: ViewerRuntime, options?: ViewerPrintOptions): ViewerPrintPolicy {
  const schema = viewer.schema
  expect(schema).toBeDefined()
  const policy = resolvePrintPolicy({ schema: schema!, options, renderedPages: viewer.renderedPages })
  expect(policy).toBeDefined()
  return policy
}

function getPrintStyles(viewer: ViewerRuntime, options?: ViewerPrintOptions): string {
  const policy = getPrintPolicy(viewer, options)
  return buildPrintStyles(policy)
}

function setRenderedPages(viewer: ViewerRuntime, pages: ViewerPageMetrics[]): void {
  const runtime = viewer as unknown as { _renderedPageMetrics: ViewerPageMetrics[] }
  runtime._renderedPageMetrics = pages
}

function mockWindowPrint(implementation: () => void = () => {}): ReturnType<typeof vi.fn> {
  const print = vi.fn(implementation)
  Object.defineProperty(window, 'print', {
    configurable: true,
    value: print,
  })
  return print
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'print')
  Reflect.deleteProperty(window, 'IntersectionObserver')
  document.body.innerHTML = ''
})

describe('viewer runtime print policy', () => {
  it('defaults pageSizeMode to driver for continuous-mode browser printing', () => {
    const policy = resolvePrintPolicy({ schema: createContinuousSchema() })

    expect(policy.pageSizeMode).toBe('driver')
    expect(policy.orientation).toBe('auto')
    expect(policy.sheetSize).toBeUndefined()
    expect(policy.pageBreakBehavior).toEqual({ after: 'auto', inside: 'auto' })
  })

  it('normalizes unknown page modes through profile schema admission', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    await expect(viewer.open({
      schema: {
        ...createContinuousSchema(),
        page: {
          mode: 'book',
          width: 80,
          height: 100,
        },
      } as never,
      data: createData(),
    })).resolves.toBeUndefined()
    expect(viewer.schema?.page.mode).toBe('fixed')
  })

  it('uses configured orientation for continuous-mode driver printing', () => {
    const policy = resolvePrintPolicy({ schema: createContinuousSchemaWithPrint('landscape') })

    expect(policy.pageSizeMode).toBe('driver')
    expect(policy.orientation).toBe('landscape')
    expect(policy.sheetSize).toBeUndefined()
  })

  it('does not force a fixed page size for continuous-mode browser printing', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    const pageHeight = 100

    await viewer.open({
      schema: createContinuousSchema(pageHeight),
      data: createData(),
    })

    const pageEl = container.querySelector('.ei-viewer-page') as HTMLElement | null
    expect(pageEl).not.toBeNull()
    expect(Number.parseFloat(pageEl!.style.height)).toBeGreaterThan(pageHeight)

    const printStyles = getPrintStyles(viewer)
    expect(printStyles).not.toContain('size: 80mm')
    expect(printStyles).toContain('break-after: auto;')
    expect(printStyles).toContain('break-inside: auto;')
  })

  it('writes driver orientation into @page only when configured', () => {
    const printStyles = buildPrintStyles(resolvePrintPolicy({ schema: createContinuousSchemaWithPrint('landscape') }))

    expect(printStyles).toContain('size: landscape;')
  })

  it('uses cached rendered continuous metrics when continuous printing requests a fixed page size', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    await viewer.open({
      schema: createContinuousSchema(),
      data: createData(),
    })

    const renderedPage = viewer.renderedPages[0]!
    const pageEl = container.querySelector('.ei-viewer-page') as HTMLElement | null
    expect(pageEl).not.toBeNull()
    pageEl!.style.height = '1mm'

    const printStyles = getPrintStyles(viewer, { pageSizeMode: 'fixed' })
    expect(printStyles).toContain(`size: ${renderedPage.width}${renderedPage.unit} ${renderedPage.height}${renderedPage.unit};`)
    expect(printStyles).not.toContain('size: 80mm 1mm;')
    expect(printStyles).toContain('break-after: auto;')
  })

  it('keeps fixed-page browser printing constrained to the template size', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })

    await viewer.open({ schema: createFixedSchema() })

    const printStyles = getPrintStyles(viewer)
    expect(printStyles).toContain('size: 80mm 60mm;')
    expect(printStyles).not.toContain('size: landscape;')
    expect(printStyles).toContain('break-after: page;')
    expect(printStyles).toContain('break-inside: avoid;')
    expect(printStyles).toContain('.ei-viewer-page-slot:last-child .ei-viewer-page')
    expect(printStyles).toContain('width: auto !important;\n    height: auto !important;\n    margin: 0 !important;')
  })

  it('keeps configured orientation in fixed-size print policy without changing sheet sizing', () => {
    const policy = resolvePrintPolicy({ schema: {
      ...createFixedSchema(),
      page: {
        ...createFixedSchema().page,
        print: { orientation: 'landscape' },
      },
    } })

    expect(policy.pageSizeMode).toBe('fixed')
    expect(policy.orientation).toBe('landscape')
    expect(policy.sheetSize).toMatchObject({ width: 80, height: 60, unit: 'mm' })
  })

  it('uses page model paper as the fixed print size source', () => {
    const policy = resolvePrintPolicy({
      schema: {
        ...createFixedSchema(),
        page: {
          ...createFixedSchema().page,
          width: 80,
          height: 60,
          pageModel: { kind: 'paged-paper', paper: { width: 100, height: 40 } },
        },
      },
    })

    expect(policy.sheetSize).toMatchObject({ width: 100, height: 40, unit: 'mm' })
  })
})

describe('viewer runtime print behavior', () => {
  it('materializes every virtualized page before browser print and restores interactive retention', async () => {
    const observer = installControlledIntersectionObserver()
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    await viewer.open({ schema: createThreePageFixedSchema() })
    const wrappers = [...container.querySelectorAll('.ei-viewer-page-slot')] as HTMLElement[]
    expect(wrappers).toHaveLength(3)

    observer.emit([{ target: wrappers[0]!, isIntersecting: true } as unknown as IntersectionObserverEntry])
    expect(container.querySelectorAll('.ei-viewer-page')).toHaveLength(2)

    const printSpy = mockWindowPrint(() => {
      expect(container.querySelectorAll('.ei-viewer-page')).toHaveLength(3)
      expect(container.querySelectorAll('.ei-viewer-element')).toHaveLength(3)
    })
    await viewer.print({ throwOnError: true })

    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('.ei-viewer-page')).toHaveLength(2)
    expect(observer.disconnect).not.toHaveBeenCalled()
    await viewer.destroy()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('keeps every page materialized through an asynchronous custom print driver', async () => {
    const observer = installControlledIntersectionObserver()
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    viewer.registerPrintDriver({
      id: 'capture-all-pages',
      async print() {
        expect(container.querySelectorAll('.ei-viewer-page')).toHaveLength(3)
        await Promise.resolve()
        expect(container.querySelectorAll('.ei-viewer-element')).toHaveLength(3)
      },
    })
    await viewer.open({ schema: createThreePageFixedSchema() })
    const wrappers = [...container.querySelectorAll('.ei-viewer-page-slot')] as HTMLElement[]
    observer.emit([{ target: wrappers[2]!, isIntersecting: true } as unknown as IntersectionObserverEntry])

    await viewer.print({ driverId: 'capture-all-pages', throwOnError: true })

    expect(container.querySelectorAll('.ei-viewer-page')).toHaveLength(2)
  })

  it('passes resolved print policy to print drivers', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    const printSpy = mockWindowPrint()
    const calls: ViewerPrintContext[] = []

    viewer.registerPrintDriver({
      id: 'test-print-driver',
      async print(context) {
        calls.push(context)
      },
    })

    await viewer.open({ schema: createFixedSchema() })
    await viewer.print({ driverId: 'test-print-driver', pageSizeMode: 'fixed' })

    expect(printSpy).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.printPolicy.pageSizeMode).toBe('fixed')
    expect(calls[0]!.printPolicy.sheetSize).toMatchObject({ width: 80, height: 60, unit: 'mm' })
    expect(calls[0]!.renderedPages[0]).toMatchObject({ width: 80, height: 60, unit: 'mm' })
    expect(calls[0]!.container).toBe(container)
  })

  it('uses print driver default page size mode when caller only passes driverId', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    const calls: ViewerPrintContext[] = []

    viewer.registerPrintDriver({
      id: 'fixed-default-driver',
      defaults: { pageSizeMode: 'fixed' },
      async print(context) {
        calls.push(context)
      },
    })

    await viewer.open({ schema: createFixedSchema() })
    await viewer.print({ driverId: 'fixed-default-driver' })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.printPolicy.pageSizeMode).toBe('fixed')
    expect(calls[0]!.printPolicy.sheetSize).toMatchObject({ width: 80, height: 60, unit: 'mm' })
  })

  it('cleans print isolation state when window.print throws', async () => {
    const wrapper = document.createElement('section')
    const container = document.createElement('div')
    wrapper.appendChild(container)
    document.body.appendChild(wrapper)
    const diagnostics: string[] = []
    const viewer = createViewer({ container })
    const styleCountBefore = document.head.querySelectorAll('style').length
    mockWindowPrint(() => {
      throw new Error('print boom')
    })

    await viewer.open({
      schema: createFixedSchema(),
      onDiagnostic(event) {
        diagnostics.push(event.code)
      },
    })
    await viewer.print()

    expect(container.hasAttribute('data-ei-printing')).toBe(false)
    expect(wrapper.hasAttribute('data-ei-print-ancestor')).toBe(false)
    expect(document.body.hasAttribute('data-ei-print-ancestor')).toBe(false)
    expect(document.head.querySelectorAll('style')).toHaveLength(styleCountBefore)
    expect(diagnostics).toContain('PRINT_ERROR')
  })

  it('propagates isolated browser print failures to call diagnostics and throwOnError', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const viewer = createViewer({ container })
    const callbackDiagnostics: string[] = []
    mockWindowPrint(() => {
      throw new Error('print boom')
    })

    await viewer.open({ schema: createFixedSchema() })

    await expect(viewer.print({
      throwOnError: true,
      onDiagnostic(event) {
        callbackDiagnostics.push(event.code)
      },
    })).rejects.toThrow('print boom')

    expect(callbackDiagnostics).toContain('PRINT_ERROR')
    expect(container.hasAttribute('data-ei-printing')).toBe(false)
  })

  it('rejects continuous pdf printing when rendered metrics are missing', async () => {
    const container = document.createElement('div')
    const diagnostics: string[] = []
    const viewer = createViewer({ container })
    const printSpy = mockWindowPrint()

    await viewer.open({
      schema: createContinuousSchema(),
      data: createData(),
      onDiagnostic(event) {
        diagnostics.push(event.code)
      },
    })
    setRenderedPages(viewer, [])

    await viewer.print({ pageSizeMode: 'fixed' })

    expect(printSpy).not.toHaveBeenCalled()
    expect(container.hasAttribute('data-ei-printing')).toBe(false)
    expect(diagnostics).toContain('PRINT_RENDER_METRICS_MISSING')
  })

  it('uses browser printing by default even when print drivers are registered', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    const printSpy = mockWindowPrint()
    const calls: ViewerPrintContext[] = []

    viewer.registerPrintDriver({
      id: 'test-print-driver',
      async print(context) {
        calls.push(context)
      },
    })

    await viewer.open({ schema: createFixedSchema() })
    await viewer.print({ pageSizeMode: 'fixed' })

    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(0)
  })

  it('throws print driver failures when throwOnError is enabled', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    viewer.registerPrintDriver({
      id: 'bad-print-driver',
      async print() {
        throw new Error('print boom')
      },
    })

    await viewer.open({ schema: createFixedSchema() })

    await expect(viewer.print({ driverId: 'bad-print-driver', throwOnError: true })).rejects.toThrow('print boom')
  })

  it('replaces print drivers with the same id', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    const calls: string[] = []

    viewer.registerPrintDriver({
      id: 'replaceable-print',
      async print() {
        calls.push('old')
      },
    })
    viewer.registerPrintDriver({
      id: 'replaceable-print',
      async print() {
        calls.push('new')
      },
    })

    await viewer.open({ schema: createFixedSchema() })
    await viewer.print({ driverId: 'replaceable-print' })

    expect(calls).toEqual(['new'])
  })
})

describe('viewer runtime export behavior', () => {
  it('waits for an active export lease before destroying the committed batch', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    let releaseExport: (() => void) | undefined
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const gate = new Promise<void>((resolve) => {
      releaseExport = resolve
    })
    viewer.registerExporter({
      id: 'destroy-lease',
      format: 'pdf',
      async export() {
        markStarted?.()
        await gate
        return new Blob(['leased'])
      },
    })
    await viewer.open({ schema: createFixedSchema() })
    const exporting = viewer.exportDocument({ format: 'pdf', throwOnError: true })
    await started

    let destroyed = false
    const destroying = viewer.destroy().then(() => destroyed = true)
    await Promise.resolve()
    expect(destroyed).toBe(false)
    expect(container.childNodes.length).toBeGreaterThan(0)

    releaseExport?.()
    await exporting
    await destroying
    expect(container.childNodes).toHaveLength(0)
  })

  it('keeps every page materialized through exporter preparation and capture', async () => {
    const observer = installControlledIntersectionObserver()
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    viewer.registerExporter({
      id: 'capture-all-pages',
      format: 'pdf',
      async prepare() {
        expect(container.querySelectorAll('.ei-viewer-page')).toHaveLength(3)
        await Promise.resolve()
      },
      async export() {
        expect(container.querySelectorAll('.ei-viewer-element')).toHaveLength(3)
        return new Blob(['all pages'])
      },
    })
    await viewer.open({ schema: createThreePageFixedSchema() })
    const wrappers = [...container.querySelectorAll('.ei-viewer-page-slot')] as HTMLElement[]
    observer.emit([{ target: wrappers[0]!, isIntersecting: true } as unknown as IntersectionObserverEntry])
    expect(container.querySelectorAll('.ei-viewer-page')).toHaveLength(2)

    await viewer.exportDocument({ format: 'pdf', throwOnError: true })

    expect(container.querySelectorAll('.ei-viewer-page')).toHaveLength(2)
  })

  it('passes rendered pages, container, and diagnostics callback to exporters', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    let captured: ViewerExportContext | undefined
    const diagnostics: string[] = []
    const callbackDiagnostics: string[] = []

    viewer.registerExporter({
      id: 'test-exporter',
      format: 'pdf',
      async export(context) {
        captured = context
        context.onDiagnostic?.({
          category: 'exporter',
          severity: 'warning',
          code: 'EXPORT_WARNING',
          message: 'export warning',
          scope: 'exporter',
        })
        return new Blob(['ok'], { type: 'application/pdf' })
      },
    })

    await viewer.open({
      schema: createFixedSchema(),
      onDiagnostic(event) {
        diagnostics.push(event.code)
      },
    })

    const blob = await viewer.exportDocument({
      format: 'pdf',
      onDiagnostic(event) {
        callbackDiagnostics.push(event.code)
      },
    })

    expect(blob).toBeInstanceOf(Blob)
    expect(captured?.container).toBe(container)
    expect(captured?.renderedPages?.[0]).toMatchObject({ width: 80, height: 60, unit: 'mm' })
    expect(diagnostics).toContain('EXPORT_WARNING')
    expect(callbackDiagnostics).toContain('EXPORT_WARNING')
  })

  it('throws exporter failures when throwOnError is enabled', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    viewer.registerExporter({
      id: 'bad-exporter',
      format: 'pdf',
      async export() {
        throw new Error('export boom')
      },
    })

    await viewer.open({ schema: createFixedSchema() })

    await expect(viewer.exportDocument({ format: 'pdf', throwOnError: true })).rejects.toThrow('export boom')
  })

  it('replaces exporters with the same id', async () => {
    const container = document.createElement('div')
    const viewer = createViewer({ container })
    const calls: string[] = []

    viewer.registerExporter({
      id: 'replaceable-export',
      format: 'pdf',
      async export() {
        calls.push('old')
      },
    })
    viewer.registerExporter({
      id: 'replaceable-export',
      format: 'pdf',
      async export() {
        calls.push('new')
      },
    })

    await viewer.open({ schema: createFixedSchema() })
    await viewer.exportDocument('pdf')

    expect(calls).toEqual(['new'])
  })
})

function installControlledIntersectionObserver() {
  let callback: IntersectionObserverCallback | undefined
  const disconnect = vi.fn()
  class ControlledIntersectionObserver {
    constructor(nextCallback: IntersectionObserverCallback) {
      callback = nextCallback
    }

    observe() {}
    unobserve() {}
    disconnect() {
      disconnect()
    }
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: ControlledIntersectionObserver,
  })
  return {
    disconnect,
    emit(entries: IntersectionObserverEntry[]) {
      callback?.(entries, {} as IntersectionObserver)
    },
  }
}
