import type { LayoutRuntimeRef } from '@easyink/core'
import type { DeepReadonly } from '@easyink/plugin-api'
import type { MaterialModel } from '@easyink/plugin-api/material'
import type { ViewerContext, ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { trustedViewerHtml } from '@easyink/core'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { createViewer } from './index'

const model: MaterialModel = {
  type: 'prepared',
  binding: { kind: 'ordinary', primaryProp: 'label', formatEditor: { tabs: ['preset'], defaultTab: 'preset' } },
  condition: { scope: 'node', hiddenEffects: ['remove', 'reserve'] },
  createDefaultNode: () => ({ id: 'source', type: 'prepared', x: 0, y: 0, width: 10, height: 10, props: { label: 'static' } }),
}

describe('material render sessions', () => {
  it('stops before prepare if a synchronous factory destroys the Viewer reentrantly', async () => {
    const prepare = vi.fn()
    const render = vi.fn(() => ({}))
    let disposal: ReturnType<Awaited<ReturnType<typeof createViewer>>['destroy']> | undefined
    const viewer = await createViewer({ container: document.createElement('div'), materials: [{ model, renderer: { createSession: () => {
      disposal = viewer.destroy()
      return { prepare, render }
    } } }] })
    const result = await viewer.open({ schema: normalizeDocumentSchema({ elements: [model.createDefaultNode()] }) })
    expect(result).toMatchObject({ status: 'cancelled', reason: 'destroyed' })
    await disposal
    expect(prepare).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  it('prepares each included source once after binding and before measurement; copies retain identity and page context', async () => {
    const order: string[] = []
    const prepared: Array<{ id: string, height: number, ref: LayoutRuntimeRef }> = []
    const rendered: Array<{ ref: LayoutRuntimeRef, page: number, copy: number }> = []
    const createSession = vi.fn(() => {
      const labels = new Map<LayoutRuntimeRef, string>()
      return {
        prepare: async (node: DeepReadonly<MaterialNode>, ctx: ViewerContext) => {
          order.push(`prepare:${node.id}`)
          await Promise.resolve()
          labels.set(ctx.runtimeRef, String(ctx.resolvedProps.label))
          prepared.push({ id: node.id, height: node.height, ref: ctx.runtimeRef })
        },
        measure: (node: DeepReadonly<MaterialNode>, ctx: ViewerContext) => {
          order.push(`measure:${node.id}`)
          expect(labels.has(ctx.runtimeRef)).toBe(true)
          return { width: node.width, height: 15 }
        },
        render: (_node: DeepReadonly<MaterialNode>, ctx: ViewerContext) => {
          rendered.push({ ref: ctx.runtimeRef, page: ctx.pageNumber, copy: ctx.copyIndex })
          return { html: trustedViewerHtml(`<span>${labels.get(ctx.runtimeRef)}:${ctx.pageNumber}/${ctx.totalPages}</span>`) }
        },
      }
    })
    const material: ViewerMaterial = { model, renderer: { createSession } }
    const mount = document.createElement('div')
    const viewer = await createViewer({ container: mount, materials: [material] })
    const source = model.createDefaultNode()
    const schema = normalizeDocumentSchema({ page: { mode: 'fixed', width: 80, height: 60, copies: 2 }, elements: [
      { ...source, id: 'a', binding: { sourceId: 'data', fieldPath: 'a' } },
      { ...source, id: 'b', y: 20, binding: { sourceId: 'data', fieldPath: 'b' }, repeat: { scope: 'every-output-page' } },
      { ...source, id: 'reserved', hidden: true },
      { ...source, id: 'removed', renderCondition: { whenMatched: 'show', whenHidden: 'remove', groups: [{ conditions: [{ source: { path: 'missing' }, operator: { compare: 'exists' } }] }] } },
    ] })
    const before = JSON.stringify(schema)
    viewer.hooks.beforePagePlan.tap((context) => {
      order.push('hook')
      return context
    })
    try {
      const result = await viewer.open({ schema, data: { a: 'A', b: 'B' } })
      expect(result.status).toBe('completed')
      expect(createSession).toHaveBeenCalledTimes(1)
      expect(order).toEqual(['hook', 'prepare:a', 'prepare:b', 'measure:a', 'measure:b'])
      expect(prepared.map(item => [item.id, item.height])).toEqual([['a', 10], ['b', 10]])
      expect(prepared[0].ref).not.toBe(prepared[1].ref)
      expect(rendered).toEqual([
        { ref: prepared[0].ref, page: 1, copy: 0 },
        { ref: prepared[1].ref, page: 1, copy: 0 },
        { ref: prepared[0].ref, page: 2, copy: 1 },
        { ref: prepared[1].ref, page: 2, copy: 1 },
      ])
      expect(mount.textContent).toBe('A:1/2B:1/2A:2/2B:2/2')
      await viewer.updateData({ a: 'new A', b: 'new B' })
      expect(createSession).toHaveBeenCalledTimes(2)
      expect(prepared[2].ref.session).not.toBe(prepared[0].ref.session)
      expect(mount.textContent).toBe('new A:1/2new B:1/2new A:2/2new B:2/2')
      expect(JSON.stringify(schema)).toBe(before)
      expect(JSON.stringify(viewer.schema)).not.toContain('runtimeRef')
    }
    finally {
      await viewer.destroy()
    }
  })

  it('cancels pending prepare without waiting; acquired and late resources keep their own cleanup', async () => {
    const entered = Promise.withResolvers<void>()
    const pending = Promise.withResolvers<void>()
    const cleanup = vi.fn()
    const lateCleanup = vi.fn()
    const diagnostics = vi.fn()
    const mount = document.createElement('div')
    const viewer = await createViewer({ container: mount, materials: [{ model, renderer: { createSession: () => ({
      prepare: async (_node, ctx) => {
        ctx.onDispose(cleanup)
        entered.resolve()
        await pending.promise
        ctx.onDispose(lateCleanup)
        ctx.reportDiagnostic({ code: 'LATE', message: 'obsolete' })
      },
      render: () => { throw new Error('cancelled prepare must never render') },
    }) } }] })
    const result = viewer.open({ schema: normalizeDocumentSchema({ elements: [model.createDefaultNode()] }), onDiagnostic: diagnostics })
    await entered.promise
    const disposal = viewer.destroy()
    expect(await result).toMatchObject({ status: 'cancelled', reason: 'destroyed' })
    await disposal
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(mount.childElementCount).toBe(0)
    pending.resolve()
    await pending.promise
    await Promise.resolve()
    expect(lateCleanup).toHaveBeenCalledTimes(1)
    expect(diagnostics).not.toHaveBeenCalled()
    expect(viewer.renderedPages).toEqual([])
  })

  it.each(['prepare', 'measure'] as const)('isolates a %s failure and never calls later methods of that source', async (stage) => {
    const rendered: string[] = []
    const mount = document.createElement('div')
    const material: ViewerMaterial = { model, renderer: { createSession: () => ({
      prepare: (node) => {
        if (stage === 'prepare' && node.id === 'bad')
          throw new Error('prepare failed')
      },
      measure: (node) => {
        if (node.id === 'bad') {
          expect(stage).toBe('measure')
          throw new Error('measure failed')
        }
        return { width: node.width, height: node.height }
      },
      render: (node) => {
        rendered.push(node.id)
        return { html: trustedViewerHtml('<span>good</span>') }
      },
    }) } }
    const viewer = await createViewer({ container: mount, materials: [material] })
    try {
      const result = await viewer.open({ schema: normalizeDocumentSchema({ elements: [
        { ...model.createDefaultNode(), id: 'bad' },
        { ...model.createDefaultNode(), id: 'good', y: 20 },
      ] }) })
      expect(result.status).toBe('completed')
      if (result.status !== 'completed')
        throw new Error('Expected completed output with diagnostics')
      expect(result.diagnostics.filter(d => d.code === `MATERIAL_${stage.toUpperCase()}_ERROR`)).toHaveLength(1)
      expect(rendered).toEqual(['good'])
      expect(mount.querySelector('[data-element-id="bad"]')?.textContent).toContain('Unavailable')
      expect(mount.textContent).toContain('good')
    }
    finally {
      await viewer.destroy()
    }
  })

  it.each(['factory', 'render', 'getRenderSize'] as const)('isolates a %s failure, releases acquired resources and preserves sibling output', async (stage) => {
    const mount = document.createElement('div')
    const cleanup = vi.fn()
    const render = vi.fn((_node, ctx: ViewerContext) => {
      ctx.onDispose(cleanup)
      if (stage === 'render')
        throw new Error('render failed')
      return { html: trustedViewerHtml('<span>must be replaced</span>') }
    })
    const getRenderSize = vi.fn(() => {
      throw new Error('size failed')
    })
    const siblingModel: MaterialModel = { ...model, type: 'sibling', createDefaultNode: () => ({ ...model.createDefaultNode(), type: 'sibling', id: 'good', y: 20 }) }
    const bad: ViewerMaterial = { model, renderer: stage === 'factory'
      ? { createSession: (ctx) => {
          ctx.onDispose(cleanup)
          throw new Error('factory failed')
        } }
      : { render, getRenderSize } }
    const viewer = await createViewer({ container: mount, materials: [bad, { model: siblingModel, renderer: { render: () => ({ html: trustedViewerHtml('<span>sibling</span>') }) } }] })
    try {
      const result = await viewer.open({ schema: normalizeDocumentSchema({ elements: [model.createDefaultNode(), siblingModel.createDefaultNode()] }) })
      expect(result.status).toBe('completed')
      if (result.status !== 'completed')
        throw new Error('Expected completed placeholder output')
      const code = stage === 'factory' ? 'MATERIAL_PREPARE_ERROR' : stage === 'render' ? 'MATERIAL_RENDER_ERROR' : 'MATERIAL_RENDER_SIZE_ERROR'
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code, nodeId: 'source' }))
      expect(cleanup).toHaveBeenCalledOnce()
      expect(mount.textContent).toContain('sibling')
      expect(mount.textContent).not.toContain('must be replaced')
      expect(mount.querySelector<HTMLElement>('[data-element-id="source"]')?.style.height).toBe('10mm')
      expect(getRenderSize).toHaveBeenCalledTimes(stage === 'getRenderSize' ? 1 : 0)
      expect(render).toHaveBeenCalledTimes(stage === 'factory' ? 0 : 1)
    }
    finally {
      await viewer.destroy()
    }
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
