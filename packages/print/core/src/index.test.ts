import type { DocumentSchema, ViewerOptions, ViewerPrintContext } from '@easyink/viewer'
import { ViewerRuntime } from '@easyink/viewer'
import { describe, expect, it, vi } from 'vitest'
import { createManagedPrintViewer, EasyInkPrintError, getViewerPages, resolvePrintLandscape, resolvePrintOffset, resolvePrintSize, resolveViewerPdfPages, toMillimeters } from './index'

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

describe('print core utilities', () => {
  it('converts common units to millimeters', () => {
    expect(toMillimeters(2, 'cm')).toBe(20)
    expect(toMillimeters(1, 'in')).toBe(25.4)
    expect(toMillimeters(96, 'px')).toBe(25.4)
    expect(toMillimeters(10, 'unknown')).toBe(10)
  })

  it('resolves explicit sheet size before rendered page metrics', () => {
    expect(resolvePrintSize(
      { width: 80, height: 60, unit: 'mm', source: 'schema' },
      { index: 0, width: 90, height: 70, unit: 'mm' },
    )).toMatchObject({ width: 80, height: 60, unit: 'mm' })
  })

  it('throws a coded print error when size is missing', () => {
    expect(() => resolvePrintSize(undefined, undefined)).toThrow(EasyInkPrintError)
    try {
      resolvePrintSize(undefined, undefined)
    }
    catch (error) {
      expect(error).toMatchObject({ code: 'PRINT_SIZE_MISSING' })
    }
  })

  it('resolves orientation and offsets from print policy values', () => {
    expect(resolvePrintLandscape('landscape', 60, 80)).toBe(true)
    expect(resolvePrintLandscape('portrait', 80, 60)).toBe(false)
    expect(resolvePrintLandscape('auto', 80, 60)).toBe(true)
    expect(resolvePrintOffset({ horizontal: 1, vertical: 96, unit: 'px' })).toEqual({ x: 25.4 / 96, y: 25.4, unit: 'mm' })
    expect(resolvePrintOffset({ horizontal: 0, vertical: 0, unit: 'mm' })).toBeUndefined()
  })

  it('collects viewer pages or throws coded errors', () => {
    const container = document.createElement('div')
    const page = document.createElement('section')
    page.className = 'ei-viewer-page'
    container.appendChild(page)

    expect(getViewerPages(container)).toEqual([page])
    expect(() => getViewerPages(undefined)).toThrow(EasyInkPrintError)
    expect(() => getViewerPages(document.createElement('div'))).toThrow(EasyInkPrintError)
  })

  it('resolves PDF page sizes from each rendered page metric', () => {
    const container = document.createElement('div')
    container.appendChild(document.createElement('section')).className = 'ei-viewer-page'
    container.appendChild(document.createElement('section')).className = 'ei-viewer-page'

    const pages = resolveViewerPdfPages({
      container,
      renderedPages: [
        { index: 0, width: 80, height: 60, unit: 'mm' },
        { index: 1, width: 100, height: 40, unit: 'mm' },
      ],
      printPolicy: {
        pageMode: 'fixed',
        pageSizeMode: 'fixed',
        sheetSize: { width: 80, height: 60, unit: 'mm', source: 'schema' },
        orientation: 'auto',
        pageBreakBehavior: { after: 'page', inside: 'avoid' },
        offset: { horizontal: 0, vertical: 0, unit: 'mm' },
      },
      schema: createFixedSchema(),
      data: {},
      entry: 'api',
    })

    expect(pages.map(({ widthMm, heightMm }) => ({ widthMm, heightMm }))).toEqual([
      { widthMm: 80, heightMm: 60 },
      { widthMm: 100, heightMm: 40 },
    ])
  })

  it('creates a managed DOM viewer and destroys owned nodes after printing', async () => {
    const print = vi.fn(async () => {})
    const managed = createManagedPrintViewer({ viewer: 'dom' })
    const before = document.body.childElementCount

    await managed.printWithDriver({
      schema: createFixedSchema(),
      data: {},
    }, {
      id: 'managed-test',
      defaults: { pageSizeMode: 'fixed' },
      print,
    })

    expect(print).toHaveBeenCalledTimes(1)
    expect(document.body.childElementCount).toBe(before)
  })

  it('renders materials selected in the creation options before printing', async () => {
    const material: NonNullable<ViewerOptions['materials']>[number] = {
      model: { type: 'selected', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'selected', type: 'selected', x: 0, y: 0, width: 1, height: 1, props: {} }) },
      renderer: { render: (_node, ctx) => {
        const element = ctx.document.createElement('span')
        element.textContent = 'Selected material'
        return { element }
      } },
    }
    const print = vi.fn(async (context: ViewerPrintContext) => {
      expect(context.container?.textContent).toContain('Selected material')
    })
    const managed = createManagedPrintViewer({
      viewer: 'dom',
      viewerOptions: { materials: [material] },
    })

    await managed.printWithDriver({
      schema: { ...createFixedSchema(), elements: [material.model.createDefaultNode()] },
      data: {},
    }, {
      id: 'managed-selected-test',
      defaults: { pageSizeMode: 'fixed' },
      print,
    })

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('releases the owned mount when Host creation rejects', async () => {
    const material: NonNullable<ViewerOptions['materials']>[number] = {
      model: { type: 'duplicate', binding: { kind: 'none' as const }, createDefaultNode: () => ({ id: 'duplicate', type: 'duplicate', x: 0, y: 0, width: 1, height: 1, props: {} }) },
      renderer: { render: () => ({}) },
    }
    const managed = createManagedPrintViewer({ viewer: 'dom', viewerOptions: { materials: [material, material] } })
    const before = document.body.childElementCount
    await expect(managed.printWithDriver({ schema: createFixedSchema() }, { id: 'duplicate', print: async () => {} })).rejects.toMatchObject({ cause: { code: 'duplicate-identity' } })
    expect(document.body.childElementCount).toBe(before)
  })

  it('releases a failed print and awaits resource cleanup', async () => {
    const release = Promise.withResolvers<void>()
    const cleanupStarted = Promise.withResolvers<void>()
    const cause = new Error('print failed')
    const material: NonNullable<ViewerOptions['materials']>[number] = {
      model: { type: 'cleanup', binding: { kind: 'none' as const }, createDefaultNode: () => ({ id: 'cleanup', type: 'cleanup', x: 0, y: 0, width: 1, height: 1, props: {} }) },
      loadRenderer: async (ctx) => {
        ctx.onDispose(async () => {
          cleanupStarted.resolve()
          await release.promise
        })
        return { render: () => ({}) }
      },
    }
    const managed = createManagedPrintViewer({ viewer: 'dom', viewerOptions: { materials: [material] } })
    const before = document.body.childElementCount
    const rejected = managed.printWithDriver(
      { schema: { ...createFixedSchema(), elements: [material.model.createDefaultNode()] } },
      { id: 'failed', print: async () => { throw cause } },
    ).catch(error => error)
    await cleanupStarted.promise
    const disposal = managed.destroy()
    expect(managed.destroy()).toBe(disposal)
    expect(document.body.childElementCount).toBe(before)
    release.resolve()
    await disposal
    expect(await rejected).toBe(cause)
  })

  it('awaits creation cleanup and leaves a later print session intact', async () => {
    const cleanupStarted = Promise.withResolvers<void>()
    const releaseCleanup = Promise.withResolvers<void>()
    const destroy = ViewerRuntime.prototype.destroy
    const cleanup = vi.spyOn(ViewerRuntime.prototype, 'destroy').mockImplementation(function (this: ViewerRuntime) {
      const result = destroy.call(this)
      cleanupStarted.resolve()
      return Promise.all([result, releaseCleanup.promise]).then(([result]) => result)
    })
    const managed = createManagedPrintViewer({ viewer: 'dom', viewerOptions: { materials: [] }, autoDestroy: false })
    const print = vi.fn(async () => {})
    const input = { schema: createFixedSchema() }
    const driver = { id: 'pending', print }
    const before = document.body.childElementCount
    const pending = managed.printWithDriver(input, driver).catch(error => error)
    const disposal = managed.destroy()
    let settled = false
    void disposal.then(() => {
      settled = true
    })
    expect(managed.destroy()).toBe(disposal)
    await cleanupStarted.promise
    expect(settled).toBe(false)
    releaseCleanup.resolve()
    await disposal
    cleanup.mockRestore()
    expect(await pending).toMatchObject({ code: 'PRINT_VIEWER_DISPOSED' })
    expect(document.body.childElementCount).toBe(before)
    await managed.printWithDriver(input, driver)
    expect(print).toHaveBeenCalledOnce()
    expect(document.body.childElementCount).toBe(before + 1)
    await managed.destroy()
    expect(document.body.childElementCount).toBe(before)
  })

  it('returns material cleanup failures through the managed destroy result', async () => {
    const cause = new Error('material cleanup')
    const material: NonNullable<ViewerOptions['materials']>[number] = {
      model: { type: 'cleanup-error', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'cleanup-error', type: 'cleanup-error', x: 0, y: 0, width: 1, height: 1, props: {} }) },
      renderer: { render: (_node, ctx) => {
        ctx.onDispose(() => {
          throw cause
        })
        return {}
      } },
    }
    const managed = createManagedPrintViewer({ viewer: 'dom', autoDestroy: false, viewerOptions: { materials: [material] } })
    await managed.printWithDriver({ schema: { ...createFixedSchema(), elements: [material.model.createDefaultNode()] } }, { id: 'cleanup-error', print: async () => {} })
    expect((await managed.destroy()).errors).toMatchObject([{ phase: 'consumer', cause }])
  })
})
