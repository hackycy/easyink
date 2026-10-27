import type { DocumentSchema, MaterialNode, TableDataSchema, TableNode } from '@easyink/schema'
import { materials as builtinDesignerMaterials } from '@easyink/builtin/all'
import { afterEach, describe, expect, it } from 'vitest'
import { createBuiltinViewer } from './test-fixtures/builtin-viewer'

function defaultNode(type: string, partial: Partial<MaterialNode> = {}, unit = 'mm'): MaterialNode {
  const material = builtinDesignerMaterials.find(material => material.model.type === type)
  if (!material)
    throw new Error(`Missing builtin material ${type}`)
  return material.model.createDefaultNode({ id: type, ...partial }, unit)
}

afterEach(() => document.body.replaceChildren())

describe('builtin Viewer output regression', () => {
  it.each(['mm', 'pt', 'px'] as const)('renders fixed-page geometry, copies, conditions, bindings and page numbers in %s', async (unit) => {
    const container = document.createElement('div')
    const viewer = await createBuiltinViewer({ container })
    const unknown: MaterialNode = {
      id: 'unknown',
      type: 'custom/uninstalled',
      x: 1,
      y: 2,
      width: 10,
      height: 5,
      props: { custom: { keep: true } },
      extensions: { vendor: 'opaque' },
    }
    const schema: DocumentSchema = {
      version: '1.0.0',
      unit,
      page: { mode: 'fixed', width: 80, height: 60, pages: 2, copies: 2 },
      guides: { x: [], y: [] },
      elements: [
        defaultNode('text', { id: 'title', x: 5, y: 10, width: 40, height: 8, binding: { sourceId: 'customer', fieldPath: 'customer/name' } }, unit),
        defaultNode('text', {
          id: 'removed',
          x: 5,
          y: 20,
          width: 40,
          height: 8,
          renderCondition: { whenMatched: 'show', whenHidden: 'remove', groups: [{ conditions: [{ source: { path: 'absent' }, operator: { compare: 'exists' } }] }] },
        }, unit),
        unknown,
        defaultNode('page-number', { id: 'page-number', x: 50, y: 50, width: 25, height: 8 }, unit),
      ],
    }
    const before = JSON.stringify(schema)
    try {
      await viewer.open({ schema, data: { customer: { name: 'Ada' } } })
      expect(container.textContent).toContain('Ada')
      expect(container.textContent).toContain('[Unknown: custom/uninstalled]')
      expect(container.querySelector('[data-element-id="removed"]')).toBeNull()
      expect(viewer.renderedPages).toEqual(Array.from({ length: 4 }, (_, index) => ({ index, width: 80, height: 60, unit })))
      const pages = [...container.querySelectorAll<HTMLElement>('.ei-viewer-page')]
      expect(pages).toHaveLength(4)
      pages.forEach((page, index) => {
        expect(page.style.width).toBe(`80${unit}`)
        expect(page.style.height).toBe(`60${unit}`)
        const title = page.querySelector<HTMLElement>('[data-element-id="title"]')
        const unknownOutput = page.querySelector<HTMLElement>('[data-element-id="unknown"]')
        if (index % 2 === 0) {
          expect(title?.textContent).toBe('Ada')
          expect(title?.style).toMatchObject({ left: `5${unit}`, top: `10${unit}`, width: `40${unit}`, height: `8${unit}` })
          expect(unknownOutput?.textContent).toBe('[Unknown: custom/uninstalled]')
          expect(unknownOutput?.style).toMatchObject({ left: `1${unit}`, top: `2${unit}`, width: `10${unit}`, height: `5${unit}` })
        }
        else {
          expect(title).toBeNull()
          expect(unknownOutput).toBeNull()
        }
        const number = page.querySelector<HTMLElement>(`[data-element-id="page-number__p${index}"]`)
        expect(number?.textContent).toBe(`${index + 1}/4`)
        expect(number?.style).toMatchObject({ left: `50${unit}`, top: `50${unit}`, width: `25${unit}`, height: `8${unit}` })
        expect(page.querySelectorAll('[data-element-id]')).toHaveLength(index % 2 === 0 ? 3 : 1)
      })
      expect(JSON.stringify(schema)).toBe(before)
    }
    finally {
      await viewer.destroy()
    }
  })

  it('paginates table rows before a bound chart and numbers every output page', async () => {
    const container = document.createElement('div')
    const viewer = await createBuiltinViewer({ container })
    const table: TableNode & { table: TableDataSchema } = {
      ...defaultNode('table-data', { id: 'items', x: 5, y: 10, width: 70, height: 16 }),
      type: 'table-data',
      table: {
        kind: 'data',
        showHeader: true,
        showFooter: false,
        topology: {
          columns: [{ ratio: 1 }],
          rows: [
            { height: 8, role: 'header', cells: [{ content: { text: 'Name' } }] },
            { height: 8, role: 'repeat-template', cells: [{ binding: { sourceId: 'invoice', fieldPath: 'items/name' } }] },
          ],
        },
        layout: {},
      },
    }
    const schema: DocumentSchema = {
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 80, height: 60, pagination: { strategy: 'auto-sheets' } },
      guides: { x: [], y: [] },
      elements: [table, defaultNode('page-number', { x: 50, y: 52, width: 25, height: 6 }), defaultNode('chart-bar', {
        id: 'chart',
        x: 5,
        y: 100,
        width: 60,
        height: 30,
        binding: {
          kind: 'data-contract',
          mappings: {
            category: { sourceId: 'invoice', select: { path: 'items/name' } },
            value: { sourceId: 'invoice', select: { path: 'items/qty' } },
          },
        },
      })],
    }
    const data = { items: Array.from({ length: 12 }, (_, index) => ({ name: `Item ${index + 1}`, qty: index + 1 })) }
    const before = JSON.stringify({ schema, data })
    try {
      await viewer.open({ schema, data })
      expect(viewer.renderedPages).toEqual(Array.from({ length: 3 }, (_, index) => ({ index, width: 80, height: 60, unit: 'mm' })))
      const pages = [...container.querySelectorAll<HTMLElement>('.ei-viewer-page')]
      expect(pages).toHaveLength(3)
      const fragments = [...container.querySelectorAll<HTMLElement>('[data-element-id^="items__p"]')]
      expect(fragments).toHaveLength(2)
      const rows = fragments.flatMap(fragment => [...fragment.querySelectorAll('tr')].map(row => row.textContent))
      expect(rows).toEqual(['Name', ...data.items.slice(0, 9).map(item => item.name), 'Name', ...data.items.slice(9).map(item => item.name)])
      expect(fragments[0]?.style).toMatchObject({ left: '5mm', top: '10mm', width: '70mm' })
      expect(fragments[1]?.style).toMatchObject({ left: '5mm', top: '0mm', width: '70mm' })
      fragments.forEach((fragment, index) => {
        expect(pages[index]?.contains(fragment)).toBe(true)
        expect(Number.parseFloat(fragment.style.top) + Number.parseFloat(fragment.style.height)).toBeLessThanOrEqual(60)
      })
      pages.forEach((page, index) => {
        expect(page.style).toMatchObject({ width: '80mm', height: '60mm' })
        const number = page.querySelector<HTMLElement>(`[data-element-id="page-number__p${index}"]`)
        expect(number?.textContent).toBe(`${index + 1}/3`)
        expect(number?.style).toMatchObject({ left: '50mm', top: '52mm', width: '25mm', height: '6mm' })
      })
      const chart = pages[2]?.querySelector<HTMLElement>('[data-element-id="chart"]')
      expect(chart?.style).toMatchObject({ left: '5mm', top: '0mm', width: '60mm', height: '30mm' })
      const svg = chart?.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg?.getAttribute('viewBox')).toBe('0 0 227 113')
      expect(svg?.querySelectorAll('path').length).toBeGreaterThan(12)
      expect(chart?.textContent).toContain('Item 1')
      expect(chart?.textContent).toContain('Item 10')
      expect(JSON.stringify({ schema, data })).toBe(before)
    }
    finally {
      await viewer.destroy()
    }
  })
})
