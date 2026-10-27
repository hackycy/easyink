import type { ViewerMaterial, ViewerRenderer } from '@easyink/plugin-api/viewer'
import { FontManager } from '@easyink/core'
import { normalizeDocumentSchema } from '@easyink/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViewer } from './index'

const material: ViewerMaterial = {
  model: {
    type: 'session-test',
    binding: { kind: 'none' },
    createDefaultNode: () => ({ id: 'source', type: 'session-test', x: 0, y: 0, width: 10, height: 10, props: { label: 'source' } }),
  },
  renderer: {
    render: (node, context) => {
      const element = context.document.createElement('span')
      element.textContent = `${node.props.label}:${context.data.value}`
      return { element }
    },
  },
}

function schema() {
  return normalizeDocumentSchema({ elements: [material.model.createDefaultNode()], page: { mode: 'fixed', width: 80, height: 60, font: 'SessionFont' } })
}

const provider = { listFonts: async () => [], loadFont: async () => '' }

afterEach(() => vi.restoreAllMocks())

describe('fixed Viewer render requests', () => {
  it('captures data, schema, dimensions and non-JSON values before a resource await', async () => {
    const entered = Promise.withResolvers<void>()
    const font = Promise.withResolvers<void>()
    vi.spyOn(FontManager.prototype, 'ensureFontLoaded').mockImplementation(async (request) => {
      entered.resolve()
      await font.promise
      return { ...request, source: { type: 'system' } }
    })
    const mount = document.createElement('div')
    const input = schema()
    const date = new Date('2026-10-12T00:00:00Z')
    const data = { value: 'A', nested: { date, missing: undefined, count: 42n } }
    const seen = vi.fn()
    const viewer = await createViewer({ container: mount, fontProvider: provider, materials: [{ ...material, renderer: { render: (node, ctx) => {
      seen(ctx.data.nested)
      return (material.renderer as ViewerRenderer).render(node, ctx)
    } } }] })
    try {
      const pending = viewer.open({ schema: input, data })
      await entered.promise
      data.value = 'mutated'
      date.setFullYear(2030)
      input.page.width = 300
      input.elements[0].props.label = 'mutated'
      viewer.schema!.elements[0].props.label = 'also mutated'
      viewer.data.value = 'also mutated'
      font.resolve()
      const result = await pending
      expect(result.status).toBe('completed')
      if (result.status !== 'completed')
        throw new Error('Expected committed output')
      expect(result.pages[0].width).toBe(80)
      expect(mount.textContent).toBe('source:A')
      expect(seen).toHaveBeenCalledWith({ date: new Date('2026-10-12T00:00:00Z'), missing: undefined, count: 42n })
    }
    finally {
      await viewer.destroy()
    }
  })

  it('revokes A even when newer B fails, without waiting for A external work', async () => {
    const entered = Promise.withResolvers<void>()
    const font = Promise.withResolvers<void>()
    let loads = 0
    vi.spyOn(FontManager.prototype, 'ensureFontLoaded').mockImplementation(async (request) => {
      if (++loads === 1) {
        entered.resolve()
        await font.promise
      }
      return { ...request, source: { type: 'system' } }
    })
    const mount = document.createElement('div')
    const diagnostics = vi.fn()
    const viewer = await createViewer({ container: mount, materials: [material], fontProvider: provider })
    try {
      const a = viewer.open({ schema: schema(), data: { value: 'A' }, onDiagnostic: diagnostics })
      await entered.promise
      const failure = new Error('B layout failed')
      viewer.hooks.beforePagePlan.tap(() => {
        throw failure
      })
      const b = viewer.updateData({ value: 'B' })
      expect(await a).toMatchObject({ status: 'cancelled', reason: 'superseded' })
      await expect(b).rejects.toBe(failure)
      expect(viewer.renderState).toMatchObject({ status: 'failed', requestId: 2, cause: failure })
      font.resolve()
      await font.promise
      expect(mount.childElementCount).toBe(0)
      expect(viewer.renderedPages).toEqual([])
      expect(diagnostics).not.toHaveBeenCalled()
    }
    finally {
      await viewer.destroy()
    }
  })

  it('cancels font waiting immediately on destroy and leaves no late injected font or output', async () => {
    const entered = Promise.withResolvers<void>()
    const font = Promise.withResolvers<string>()
    const mount = document.createElement('div')
    const viewer = await createViewer({ container: mount, materials: [material], fontProvider: {
      listFonts: async () => [],
      loadFont: () => {
        entered.resolve()
        return font.promise
      },
    } })
    const pending = viewer.open({ schema: schema() })
    await entered.promise
    await viewer.destroy()
    expect(await pending).toMatchObject({ status: 'cancelled', reason: 'destroyed' })
    font.resolve('data:font/woff2;base64,AA==')
    await font.promise
    expect(document.head.querySelector('[data-easyink-font^="SessionFont"]')).toBeNull()
    expect(mount.childElementCount).toBe(0)
    expect(viewer.renderState).toEqual({ status: 'disposed' })
  })

  it('renders two Viewers sharing one schema with independent fixed data', async () => {
    const input = schema()
    const mounts = [document.createElement('div'), document.createElement('div')]
    const a = await createViewer({ container: mounts[0], materials: [material] })
    const b = await createViewer({ container: mounts[1], materials: [material] })
    try {
      const results = await Promise.all([a.open({ schema: input, data: { value: 'A' } }), b.open({ schema: input, data: { value: 'B' } })])
      expect(results.map(result => result.status)).toEqual(['completed', 'completed'])
      expect(mounts.map(mount => mount.textContent)).toEqual(['source:A', 'source:B'])
      expect(input).toEqual(schema())
    }
    finally {
      await Promise.all([a.destroy(), b.destroy()])
    }
  })

  it('preserves one committed version during a failed same-document update, then clears it on open', async () => {
    const mount = document.createElement('div')
    const seen = vi.fn()
    const viewer = await createViewer({ container: mount, materials: [material] })
    try {
      const first = await viewer.open({ schema: schema(), data: { value: 'committed' }, onDiagnostic: seen })
      expect(first.status).toBe('completed')
      const oldDOM = mount.firstElementChild
      const oldMetrics = viewer.renderedPages
      const failure = new Error('cannot form layout')
      const untap = viewer.hooks.beforePagePlan.tap(() => {
        throw failure
      })
      const pending = viewer.updateData({ value: 'failed' })
      expect(viewer.renderState.status).toBe('updating')
      expect(mount.firstElementChild).toBe(oldDOM)
      await expect(pending).rejects.toBe(failure)
      expect(mount.firstElementChild).toBe(oldDOM)
      expect(mount.textContent).toBe('source:committed')
      expect(viewer.renderedPages).toEqual(oldMetrics)
      expect(viewer.renderState.status).toBe('failed')
      untap()
      await viewer.updateData({ value: 'retry' })
      expect(mount.textContent).toBe('source:retry')
      const switched = viewer.open({ schema: schema(), data: { value: 'new-document' } })
      expect(mount.childElementCount).toBe(0)
      expect(viewer.renderedPages).toEqual([])
      await switched
      expect(mount.textContent).toBe('source:new-document')
    }
    finally {
      await viewer.destroy()
    }
  })

  it('prepares detached output, skips failing material size methods, and cleans only replaced output resources', async () => {
    const mount = document.createElement('div')
    const cleaned: string[] = []
    const signals: AbortSignal[] = []
    const duringRender: string[] = []
    const getRenderSize = vi.fn(() => ({ width: 10, height: 10 }))
    const viewer = await createViewer({ container: mount, materials: [{ ...material, renderer: {
      render: (_node, ctx) => {
        duringRender.push(mount.textContent ?? '')
        signals.push(ctx.signal)
        ctx.onDispose(() => {
          cleaned.push(String(ctx.data.value))
        })
        if (ctx.data.value === 'local-failure')
          throw new Error('failed after acquiring')
        const element = ctx.document.createElement('span')
        element.textContent = String(ctx.data.value)
        return { element }
      },
      getRenderSize,
    } }] })
    try {
      await viewer.open({ schema: schema(), data: { value: 'A' } })
      expect(signals[0].aborted).toBe(false)
      expect(cleaned).toEqual([])
      const next = await viewer.updateData({ value: 'local-failure' })
      expect(next.status).toBe('completed')
      if (next.status !== 'completed')
        throw new Error('Expected completed placeholder')
      expect(next.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_RENDER_ERROR' }))
      expect(duringRender).toEqual(['', 'A'])
      expect(getRenderSize).toHaveBeenCalledOnce()
      expect(signals.every(signal => signal.aborted)).toBe(true)
      await Promise.resolve()
      expect(cleaned.sort()).toEqual(['A', 'local-failure'])
      expect(mount.querySelector('[data-element-id="source"]')).not.toBeNull()
    }
    finally {
      await viewer.destroy()
    }
  })

  it('cleans a reentrantly superseded candidate without publishing its DOM, metrics or diagnostics', async () => {
    const mount = document.createElement('div')
    const cleaned: string[] = []
    const diagnostics = vi.fn()
    let latest: Promise<unknown> | undefined
    const viewer = await createViewer({ container: mount, materials: [{ ...material, renderer: {
      render: (_node, ctx) => {
        ctx.onDispose(() => {
          cleaned.push(String(ctx.data.value))
        })
        if (ctx.data.value === 'A') {
          latest = viewer.updateData({ value: 'B' })
          ctx.reportDiagnostic({ code: 'STALE_A', message: 'candidate only' })
        }
        const element = ctx.document.createElement('span')
        element.textContent = String(ctx.data.value)
        return { element }
      },
    } }] })
    try {
      const a = await viewer.open({ schema: schema(), data: { value: 'A' }, onDiagnostic: diagnostics })
      expect(a).toMatchObject({ status: 'cancelled', reason: 'superseded' })
      await latest
      expect(mount.textContent).toBe('B')
      expect(viewer.renderState).toMatchObject({ status: 'completed', requestId: 2 })
      expect(diagnostics).not.toHaveBeenCalledWith(expect.objectContaining({ code: 'STALE_A' }))
      expect(cleaned).toEqual(['A'])
    }
    finally {
      await viewer.destroy()
    }
    expect(cleaned).toEqual(['A', 'B'])
  })

  it('does not deliver a late diagnostic hook failure into a newer document', async () => {
    const hook = Promise.withResolvers<void>()
    const oldEvents = vi.fn()
    const newEvents = vi.fn()
    const viewer = await createViewer({ container: document.createElement('div'), materials: [] })
    try {
      const untap = viewer.hooks.diagnosticsEmitted.tap(() => hook.promise)
      await viewer.open({ schema: schema(), onDiagnostic: oldEvents })
      untap()
      await viewer.open({ schema: normalizeDocumentSchema({}), onDiagnostic: newEvents })
      hook.reject(new Error('late hook failure'))
      await Promise.resolve()
      await Promise.resolve()
      expect(newEvents).not.toHaveBeenCalled()
      expect(oldEvents).not.toHaveBeenCalledWith(expect.objectContaining({ code: 'DIAGNOSTIC_HOOK_ERROR' }))
    }
    finally {
      await viewer.destroy()
    }
  })

  it('keeps committed output alive if its diagnostic subscriber throws', async () => {
    const mount = document.createElement('div')
    const viewer = await createViewer({ container: mount, materials: [] })
    try {
      const result = await viewer.open({ schema: schema(), onDiagnostic: () => {
        throw new Error('subscriber failed')
      } })
      expect(result.status).toBe('completed')
      expect(viewer.renderState.status).toBe('completed')
      expect(viewer.renderedPages).toHaveLength(1)
      expect(mount.textContent).toContain('[Unknown: session-test]')
    }
    finally {
      await viewer.destroy()
    }
  })

  it('publishes the destroy promise before output abort listeners and waits for acquired async cleanup', async () => {
    const cleanup = Promise.withResolvers<void>()
    const cleaning = Promise.withResolvers<void>()
    let reentrant: Promise<unknown> | undefined
    const mount = document.createElement('div')
    const viewer = await createViewer({ container: mount, materials: [{ ...material, renderer: {
      render: (_node, ctx) => {
        ctx.signal.addEventListener('abort', () => {
          reentrant = viewer.destroy()
        }, { once: true })
        ctx.onDispose(async () => {
          cleaning.resolve()
          await cleanup.promise
        })
        return { element: ctx.document.createElement('span') }
      },
    } }] })
    await viewer.open({ schema: schema() })
    const disposal = viewer.destroy()
    expect(reentrant).toBe(disposal)
    expect(viewer.destroy()).toBe(disposal)
    await cleaning.promise
    let finished = false
    void disposal.then(() => {
      finished = true
    })
    await Promise.resolve()
    expect(finished).toBe(false)
    cleanup.resolve()
    expect(await disposal).toEqual({ errors: [] })
    expect(mount.childElementCount).toBe(0)
  })

  it('reports a document-open framework failure without retaining a successful preview', async () => {
    const mount = document.createElement('div')
    const viewer = await createViewer({ container: mount, materials: [material] })
    try {
      await viewer.open({ schema: schema(), data: { value: 'old' } })
      const cause = new Error('normalization failed')
      viewer.hooks.beforeSchemaNormalize.tap(() => {
        throw cause
      })
      await expect(viewer.open({ schema: schema() })).rejects.toBe(cause)
      expect(viewer.renderState).toMatchObject({ status: 'failed', cause })
      expect(mount.childElementCount).toBe(0)
      expect(viewer.renderedPages).toEqual([])
    }
    finally {
      await viewer.destroy()
    }
  })
})
