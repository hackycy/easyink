import type { LayoutRuntimeRef } from '@easyink/core'
import type { ViewerFragmentPaginator, ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode, TableDataSchema, TableNode } from '@easyink/schema'
import { materials as builtinModels } from '@easyink/builtin/all'
import { trustedViewerHtml } from '@easyink/core'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { createViewer } from './index'
import { createBuiltinViewer } from './test-fixtures/builtin-viewer'

function tableSchema() {
  const table: TableNode & { table: TableDataSchema } = {
    id: 'table',
    type: 'table-data',
    x: 5,
    y: 10,
    width: 70,
    height: 16,
    props: {},
    table: {
      kind: 'data',
      showHeader: true,
      showFooter: true,
      layout: {},
      topology: {
        columns: [{ ratio: 1 }],
        rows: [
          { height: 8, role: 'header', cells: [{ content: { text: 'Name' } }] },
          { height: 8, role: 'repeat-template', cells: [{ binding: { sourceId: 'data', fieldPath: 'items/name' } }] },
          { height: 8, role: 'footer', cells: [{ content: { text: 'Total' } }] },
        ],
      },
    },
  }
  return normalizeDocumentSchema({ page: { mode: 'fixed', width: 80, height: 25, pagination: { strategy: 'auto-sheets' } }, elements: [table] })
}

describe('fragment state through the Viewer pipeline', () => {
  it('preserves simple material geometry, bound content and target-document SVGs alongside session materials', async () => {
    function node(type: string, partial: Partial<MaterialNode>): MaterialNode {
      const model = builtinModels.find(material => material.model.type === type)!.model
      return model.createDefaultNode({ id: type, ...partial }, 'mm')
    }
    const target = document.implementation.createHTMLDocument('output-target')
    const mount = target.createElement('div')
    const viewer = await createBuiltinViewer({ container: mount })
    const schema = normalizeDocumentSchema({
      page: { mode: 'fixed', width: 100, height: 100, copies: 2 },
      elements: [
        node('text', { x: 1, y: 1, width: 12, height: 4, props: { overflow: 'visible', wrapMode: 'anywhere', fontSize: 4, lineHeight: 1 }, binding: { sourceId: 'data', fieldPath: 'label' } }),
        node('line', { x: 1, y: 20, width: 40, height: 0, props: { lineWidth: 0.5 } }),
        node('flow-row', { x: 1, y: 25, width: 40, height: 5, binding: { sourceId: 'data', fieldPath: 'items' }, props: { columns: [{ ratio: 1, textAlign: 'left', wrapMode: 'block', binding: { sourceId: 'data', fieldPath: 'items/name' } }] } }),
        node('barcode', { x: 1, y: 50, width: 40, height: 10, props: { showText: false }, binding: { sourceId: 'data', fieldPath: 'barcode' } }),
        node('chart-custom', { x: 50, y: 10, width: 40, height: 30, binding: { sourceId: 'data', fieldPath: 'option' } }),
        node('page-number', { x: 80, y: 90, width: 20, height: 5 }),
      ],
    })
    const data = { label: 'abcdefghijabcdefghij', items: [{ name: 'first' }, { name: 'second' }], barcode: 'EasyInk', option: { title: { text: 'bound-chart' }, series: [{ type: 'pie', data: [{ name: 'A', value: 1 }] }] } }
    const before = JSON.stringify({ schema, data })
    try {
      const result = await viewer.open({ schema, data })
      expect(result.status).toBe('completed')
      if (result.status !== 'completed')
        throw new Error('Expected completed representative output')
      expect(result.pages).toHaveLength(2)
      expect(result.diagnostics.filter(d => d.code.startsWith('MATERIAL_'))).toEqual([])
      for (const [index, page] of [...mount.querySelectorAll<HTMLElement>('.ei-viewer-page')].entries()) {
        const text = page.querySelector<HTMLElement>('[data-element-id="text"]')!
        expect(text.textContent).toBe(data.label)
        expect(Number.parseFloat(text.style.height)).toBeGreaterThan(4)
        expect(text.firstElementChild!.getAttribute('style')).toContain('overflow:visible')
        const line = page.querySelector<HTMLElement>('[data-element-id="line"]')!
        expect(line.style.height).toBe('0.5mm')
        expect(line.querySelector('svg')).not.toBeNull()
        expect(page.querySelector('[data-element-id="flow-row"]')!.textContent).toContain('first')
        expect(page.querySelector('[data-element-id="flow-row"]')!.textContent).toContain('second')
        const barcode = page.querySelector('[data-element-id="barcode"] svg')!
        expect(barcode.ownerDocument).toBe(target)
        expect(barcode.querySelectorAll('rect').length).toBeGreaterThan(16)
        expect(barcode.getAttribute('aria-hidden')).toBeNull()
        const chart = page.querySelector('[data-element-id="chart-custom"] svg')!
        expect(chart.ownerDocument).toBe(target)
        expect(chart.textContent).toContain('bound-chart')
        expect(page.querySelector('[data-element-type="page-number"]')!.textContent).toBe(`${index + 1}/2`)
      }
      expect(JSON.stringify({ schema, data })).toBe(before)
    }
    finally {
      await viewer.destroy()
    }
  })

  it('isolates two table sessions across multi-level pagination and rerender, preserving original schema', async () => {
    const schema = tableSchema()
    const before = JSON.stringify(schema)
    const mounts = [document.createElement('div'), document.createElement('div')]
    const viewers = await Promise.all(mounts.map(container => createBuiltinViewer({ container })))
    const data = (prefix: string, count: number) => ({ items: Array.from({ length: count }, (_, i) => ({ name: `${prefix}-${i}` })) })
    try {
      const results = await Promise.all(viewers.map((viewer, i) => viewer.open({ schema, data: data(i ? 'B' : 'A', 40) })))
      for (const result of results) {
        expect(result.status).toBe('completed')
        if (result.status !== 'completed')
          throw new Error('Expected completed table output')
        expect(result.pages.length).toBeGreaterThan(3)
        expect(result.diagnostics.filter(d => d.code === 'MATERIAL_PAGINATE_ERROR')).toEqual([])
      }
      expect(mounts[0].textContent).not.toContain('B-')
      expect(mounts[1].textContent).not.toContain('A-')
      for (const [index, mount] of mounts.entries()) {
        const allCells = [...mount.querySelectorAll('td')].map(cell => cell.textContent)
        const cells = allCells.filter(text => text !== 'Name' && text !== 'Total')
        expect(cells).toEqual(Array.from({ length: 40 }, (_, i) => `${index ? 'B' : 'A'}-${i}`))
        expect(allCells.filter(text => text === 'Name')).toHaveLength(viewers[index].renderedPages.length)
        expect(allCells.filter(text => text === 'Total')).toHaveLength(1)
        expect(mount.lastElementChild!.textContent).toContain('Total')
      }
      const stableHeights = [...mounts[0].querySelectorAll<HTMLElement>('.ei-viewer-element')].map(el => el.style.height)
      await viewers[0].render()
      expect([...mounts[0].querySelectorAll<HTMLElement>('.ei-viewer-element')].map(el => el.style.height)).toEqual(stableHeights)
      await viewers[0].updateData(data('C', 3))
      expect(mounts[0].textContent).not.toContain('A-')
      expect(mounts[0].textContent).toContain('C-2')
      expect(mounts[1].textContent).toContain('B-39')
      expect(JSON.stringify(schema)).toBe(before)
      expect(JSON.stringify(viewers[0].schema)).not.toContain('runtimeRef')
    }
    finally {
      await Promise.all(viewers.map(viewer => viewer.destroy()))
    }
  })

  it('inherits binding inputs on every derived fragment after reflow and assigns new content identities', async () => {
    const prepared: LayoutRuntimeRef[] = []
    const drawn: LayoutRuntimeRef[] = []
    const material: ViewerMaterial = {
      model: {
        type: 'split-content',
        binding: { kind: 'ordinary', primaryProp: 'label', formatEditor: { tabs: ['preset'], defaultTab: 'preset' } },
        createDefaultNode: () => ({ id: 'split', type: 'split-content', x: 0, y: 10, width: 30, height: 10, props: { label: 'unbound' } }),
      },
      renderer: { createSession: () => {
        const remaining = new Map<LayoutRuntimeRef, number>()
        return {
          prepare: (_node, ctx) => {
            prepared.push(ctx.runtimeRef)
            remaining.set(ctx.runtimeRef, 5)
          },
          measure: node => ({ width: node.width, height: 70 }),
          fragmentPaginator: {
            canPaginate: () => true,
            getRemainingContent: fragment => remaining.get(fragment.runtimeRef!)!,
            paginateFragment: ({ fragment, createFragment }) => {
              const count = remaining.get(fragment.runtimeRef!)!
              const currentPage = createFragment({ ...fragment.node, id: `${fragment.node.id}-current`, height: 10 })
              const nextPage = createFragment({ ...fragment.node, id: `${fragment.node.id}-next`, height: count === 2 ? 10 : 70 })
              remaining.set(currentPage.runtimeRef!, 1)
              remaining.set(nextPage.runtimeRef!, count - 1)
              return { currentPage, nextPage, diagnostics: [] }
            },
          },
          render: (_node, ctx) => {
            drawn.push(ctx.runtimeRef)
            return { html: trustedViewerHtml(`<span>${ctx.resolvedProps.label}</span>`) }
          },
        }
      } },
    }
    const source = material.model.createDefaultNode()
    const schema = normalizeDocumentSchema({
      page: { mode: 'fixed', width: 80, height: 25, layout: { strategy: 'stack-flow' }, reflow: { strategy: 'flow-y' }, pagination: { strategy: 'auto-sheets' } },
      elements: [{ ...source, binding: { sourceId: 'data', fieldPath: 'label' } }],
    })
    const mount = document.createElement('div')
    const viewer = await createViewer({ container: mount, materials: [material] })
    try {
      const result = await viewer.open({ schema, data: { label: 'bound' } })
      expect(result.status).toBe('completed')
      expect(prepared).toHaveLength(1)
      expect(drawn).toHaveLength(5)
      expect(new Set(drawn).size).toBe(5)
      expect(drawn.every(ref => ref.session === prepared[0].session && ref !== prepared[0])).toBe(true)
      expect([...mount.querySelectorAll('.ei-viewer-element')].map(el => el.textContent)).toEqual(Array.from({ length: 5 }).fill('bound'))
    }
    finally {
      await viewer.destroy()
    }
  })

  it.each(['no-progress', 'same-reference', 'invalid-count', 'negative-count', 'fractional-count', 'unsafe-count', 'missing-count', 'unowned', 'throw', 'can-paginate'] as const)('stops a %s paginator locally and keeps sibling output', async (fault) => {
    let calls = 0
    const cleanup = vi.fn()
    let signal!: AbortSignal
    const invalidCounts: Record<string, number> = { 'invalid-count': Number.NaN, 'negative-count': -1, 'fractional-count': 0.5, 'unsafe-count': Number.MAX_SAFE_INTEGER + 1 }
    const paginator: ViewerFragmentPaginator = {
      canPaginate: () => {
        if (fault === 'can-paginate')
          throw new Error('cannot inspect pagination capability')
        return true
      },
      getRemainingContent: fragment => fault in invalidCounts ? invalidCounts[fault] : fragment.node.id === 'bad' ? 2 : fault === 'no-progress' ? 2 : 1,
      paginateFragment: ({ fragment, createFragment }) => {
        calls++
        if (fault === 'throw')
          throw new Error('cannot split')
        const currentPage = createFragment({ ...fragment.node, id: 'current' })
        const nextPage = fault === 'same-reference' ? fragment : createFragment({ ...fragment.node, id: 'next' })
        if (fault === 'unowned')
          nextPage.runtimeRef = { session: Symbol('foreign'), fragment: 1 }
        return { currentPage, nextPage, diagnostics: [] }
      },
    }
    // JavaScript consumers can omit a method despite the public declaration.
    if (fault === 'missing-count')
      Reflect.deleteProperty(paginator, 'getRemainingContent')
    const bad: ViewerMaterial = {
      model: { type: 'bad-split', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'bad', type: 'bad-split', x: 0, y: 0, width: 10, height: 10, props: {} }) },
      renderer: { createSession: () => ({
        prepare: (_node, context) => {
          signal = context.signal
          context.onDispose(cleanup)
        },
        measure: node => ({ width: node.width, height: 100 }),
        fragmentPaginator: paginator,
        render: () => { throw new Error('failed paginator must never render') },
      }) },
    }
    const good: ViewerMaterial = {
      model: { type: 'good', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'good', type: 'good', x: 20, y: 0, width: 10, height: 10, props: {} }) },
      renderer: { render: () => ({ html: trustedViewerHtml('<span>sibling</span>') }) },
    }
    const mount = document.createElement('div')
    const viewer = await createViewer({ container: mount, materials: [bad, good] })
    try {
      const result = await viewer.open({ schema: normalizeDocumentSchema({ page: { mode: 'fixed', width: 80, height: 25, pagination: { strategy: 'auto-sheets' } }, elements: [bad.model.createDefaultNode(), good.model.createDefaultNode()] }) })
      expect(result.status).toBe('completed')
      if (result.status !== 'completed')
        throw new Error('Expected completed output with diagnostics')
      expect(calls).toBe(fault in invalidCounts || fault === 'missing-count' || fault === 'can-paginate' ? 0 : 1)
      expect(result.diagnostics.filter(d => d.code === 'MATERIAL_PAGINATE_ERROR')).toHaveLength(1)
      if (fault === 'missing-count')
        expect(String(result.diagnostics.find(d => d.code === 'MATERIAL_PAGINATE_ERROR')!.cause)).toContain('getRemainingContent')
      expect(signal.aborted).toBe(true)
      await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce())
      expect(mount.querySelector<HTMLElement>('[data-element-id="bad"]')?.style.height).toBe('10mm')
      expect(mount.textContent).toContain('Unavailable')
      expect(mount.textContent).toContain('sibling')
    }
    finally {
      await viewer.destroy()
    }
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
