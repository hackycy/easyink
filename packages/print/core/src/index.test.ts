import type { DocumentSchema } from '@easyink/viewer'
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
})
