import type { DocumentSchema, MaterialNode, TableDataSchema, TableNode } from '@easyink/schema'
import { createHash } from 'node:crypto'
import { materials as builtinDesignerMaterials } from '@easyink/builtin/all'
import { afterEach, describe, expect, it } from 'vitest'
import { createViewer } from './index'
import { createBuiltinViewer } from './test-fixtures/builtin-viewer'

function defaultNode(type: string, partial: Partial<MaterialNode> = {}, unit = 'mm'): MaterialNode {
  const material = builtinDesignerMaterials.find(material => material.model.type === type)
  if (!material)
    throw new Error(`Missing baseline material ${type}`)
  return material.model.createDefaultNode({ id: type, ...partial }, unit)
}

function pageSnapshot(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('.ei-viewer-page')].map(page => ({
    width: page.style.width,
    height: page.style.height,
    elements: [...page.querySelectorAll<HTMLElement>('[data-element-id]')].map(element => ({
      id: element.dataset.elementId,
      left: element.style.left,
      top: element.style.top,
      width: element.style.width,
      height: element.style.height,
      text: element.textContent,
      svg: [...element.querySelectorAll('svg')].map(svg => ({
        viewBox: svg.getAttribute('viewBox'),
        width: svg.getAttribute('width'),
        height: svg.getAttribute('height'),
        contentHash: createHash('sha256').update(svg.outerHTML.replace(/zr\d+/g, 'zr').replace(/ecmeta_series_index="\d+"/g, 'ecmeta_series_index="series"')).digest('hex'),
      })),
    })),
  }))
}

afterEach(() => document.body.replaceChildren())

describe('g0 explicitly assembled viewer output', () => {
  it.each(['mm', 'pt', 'px'] as const)('freezes fixed-page geometry, content, copies, condition, binding and page numbers in %s', async (unit) => {
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
      expect({ metrics: viewer.renderedPages, dom: pageSnapshot(container) }).toMatchSnapshot()
      expect(JSON.stringify(schema)).toBe(before)
    }
    finally {
      viewer.destroy()
    }
  })

  it('freezes table-data fragments, page numbers and chart SVG output', async () => {
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
      expect(container.textContent).toContain('Item 12')
      expect(container.querySelector('[data-element-id="chart"] svg')).not.toBeNull()
      expect(viewer.renderedPages.length).toBeGreaterThan(1)
      expect({ metrics: viewer.renderedPages, dom: pageSnapshot(container) }).toMatchSnapshot()
      expect(JSON.stringify({ schema, data })).toBe(before)
    }
    finally {
      viewer.destroy()
    }
  })

  it('keeps an explicitly empty Viewer selection empty', async () => {
    const container = document.createElement('div')
    const viewer = await createViewer({ container, materials: [] })
    try {
      expect('registerMaterial' in viewer).toBe(false)
      expect('materialRegistry' in viewer).toBe(false)
      await viewer.open({ schema: {
        version: '1.0.0',
        unit: 'mm',
        page: { mode: 'fixed', width: 80, height: 60 },
        guides: { x: [], y: [] },
        elements: [defaultNode('text')],
      } })
      expect(container.textContent).toContain('[Unknown: text]')
    }
    finally {
      viewer.destroy()
    }
  })
})
