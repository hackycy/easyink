import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { ViewerExportContext, ViewerPrintContext } from './types'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createViewer } from './index'

function fixture() {
  const cleaned: string[] = []
  const computations: string[] = []
  const events: string[] = []
  const scopes = new Map<string, AbortSignal>()
  const material: ViewerMaterial = {
    model: { type: 'owned-output', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'owned', type: 'owned-output', x: 0, y: 0, width: 20, height: 10, props: {} }) },
    renderer: {
      createSession: () => ({
        prepare: (_node, ctx) => {
          const value = String(ctx.data.value)
          ctx.onDispose(() => {
            computations.push(value)
          })
        },
        render: (_node, ctx) => {
          const value = String(ctx.data.value)
          const element = ctx.document.createElement('button')
          element.textContent = value
          const listener = () => events.push(value)
          element.addEventListener('click', listener)
          scopes.set(value, ctx.signal)
          ctx.onDispose(() => {
            element.removeEventListener('click', listener)
            element.remove()
            cleaned.push(value)
          })
          return { element }
        },
      }),
    },
  }
  const schema = normalizeDocumentSchema({ elements: [material.model.createDefaultNode()], page: { mode: 'fixed', width: 80, height: 60 } })
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  return { material, schema, mount, cleaned, computations, events, scopes }
}

describe('fixed output tasks and resource ownership', () => {
  it('exposes completed/cancelled discriminated task results', async () => {
    const viewer = await createViewer()
    expectTypeOf<Awaited<ReturnType<typeof viewer.print>>>().extract<{ status: 'cancelled' }>().toHaveProperty('reason')
    expectTypeOf<Awaited<ReturnType<typeof viewer.exportDocument>>>().extract<{ status: 'completed' }>().toHaveProperty('file')
    expectTypeOf<Parameters<typeof viewer.print>[0]>().exclude<undefined>().not.toHaveProperty('throwOnError')
    await viewer.destroy()
  })
  it.each(['print', 'export'] as const)('follows the latest same-document render before %s starts and rejects a latest failure', async (kind) => {
    const f = fixture()
    const viewer = await createViewer({ container: f.mount, materials: [f.material] })
    const entered = Promise.withResolvers<void>()
    const preparation = Promise.withResolvers<void>()
    const seen: ViewerExportContext[] = []
    viewer.registerPrintDriver({ id: 'test', print: async (ctx) => {
      seen.push(ctx)
    } })
    viewer.registerExporter({ id: 'test', format: 'test', export: async (ctx) => {
      seen.push(ctx)
    } })
    const run = () => kind === 'print' ? viewer.print({ driverId: 'test' }) : viewer.exportDocument('test')
    try {
      await viewer.open({ schema: f.schema, data: { value: 'old' } })
      // Loader/prepare cancellation behavior is covered separately; here stop at a framework await.
      viewer.hooks.beforePagePlan.tap((context) => {
        if (viewer.data.value === 'B') {
          entered.resolve()
          // Reentrant newer render must be followed even when the awaited B result settles first.
          void viewer.updateData({ value: 'C' }).then(() => preparation.resolve())
        }
        return context
      })
      const b = viewer.updateData({ value: 'B' })
      const output = run()
      await entered.promise
      await preparation.promise
      expect((await b).status).toBe('cancelled')
      const result = await output
      expect(result).toMatchObject({ status: 'completed', requestId: 3 })
      expect(seen).toHaveLength(1)
      expect(seen[0].data?.value).toBe('C')
      expect(seen[0].container?.textContent).toBe('C')

      const cause = new Error('latest layout failed')
      const untap = viewer.hooks.beforePagePlan.tap(() => {
        throw cause
      })
      const update = viewer.updateData({ value: 'failed' })
      const failedOutput = run()
      await expect(update).rejects.toBe(cause)
      await expect(failedOutput).rejects.toBe(cause)
      expect(seen).toHaveLength(1)
      expect(f.mount.textContent).toBe('C')
      expect(f.scopes.get('C')!.aborted).toBe(false)
      untap()
    }
    finally {
      await viewer.destroy()
      f.mount.remove()
    }
  })

  it('keeps real listeners and connected DOM alive until both output users finish across refresh and open', async () => {
    const f = fixture()
    const viewer = await createViewer({ container: f.mount, materials: [f.material] })
    const printing = Promise.withResolvers<void>()
    const exporting = Promise.withResolvers<void>()
    const printDone = Promise.withResolvers<void>()
    const exportDone = Promise.withResolvers<void>()
    let printContext!: ViewerPrintContext
    let exportContext!: ViewerExportContext
    viewer.registerPrintDriver({ id: 'test', print: async (ctx) => {
      printContext = ctx
      printing.resolve()
      await printDone.promise
    } })
    viewer.registerExporter({ id: 'test', format: 'test', export: async (ctx) => {
      exportContext = ctx
      exporting.resolve()
      await exportDone.promise
      return new Blob(['A'])
    } })
    try {
      await viewer.open({ schema: f.schema, data: { value: 'A' } })
      expect(f.computations).toEqual(['A'])
      expect(f.cleaned).toEqual([])
      const aButton = f.mount.querySelector('button')!
      const print = viewer.print({ driverId: 'test' })
      const exportTask = viewer.exportDocument('test')
      await Promise.all([printing.promise, exporting.promise])
      const held = printContext.container!
      expect(held).toBe(exportContext.container)
      expect(held).not.toBe(f.mount)
      await viewer.updateData({ value: 'B' })
      await viewer.open({ schema: f.schema, data: { value: 'new-document' } })
      expect(f.mount.textContent).toBe('new-document')
      expect(held.isConnected).toBe(true)
      expect(held.textContent).toBe('A')
      expect(printContext.data?.value).toBe('A')
      expect(printContext.renderedPages).toEqual([{ index: 0, width: 80, height: 60, unit: 'mm' }])
      expect(f.scopes.get('A')!.aborted).toBe(false)
      aButton.click()
      expect(f.events).toEqual(['A'])
      printDone.resolve()
      expect(await print).toMatchObject({ status: 'completed', requestId: 1 })
      expect(f.cleaned).not.toContain('A')
      exportDone.resolve()
      const result = await exportTask
      expect(result.status).toBe('completed')
      if (result.status !== 'completed')
        throw new Error('Expected completed export')
      expect(result.file).toBeInstanceOf(Blob)
      expect(f.scopes.get('A')!.aborted).toBe(true)
      await Promise.resolve()
      expect(f.cleaned.filter(value => value === 'A')).toHaveLength(1)
      expect(held.isConnected).toBe(false)
      aButton.click()
      expect(f.events).toEqual(['A'])
    }
    finally {
      printDone.resolve()
      exportDone.resolve()
      await viewer.destroy()
      f.mount.remove()
    }
  })

  it.each(['document-changed', 'destroyed'] as const)('cancels a waiting output on %s without starting a channel', async (reason) => {
    const f = fixture()
    const entered = Promise.withResolvers<void>()
    const work = Promise.withResolvers<void>()
    const channel = vi.fn(async () => {})
    const viewer = await createViewer({ container: f.mount, materials: [{ ...f.material, renderer: { createSession: () => ({
      prepare: async (_node, ctx) => {
        if (ctx.data.value === 'pending') {
          entered.resolve()
          await work.promise
        }
      },
      render: (_node, ctx) => ({ element: ctx.document.createElement('span') }),
    }) } }] })
    viewer.registerExporter({ id: 'test', format: 'test', export: channel })
    try {
      const render = viewer.open({ schema: f.schema, data: { value: 'pending' } })
      await entered.promise
      const output = viewer.exportDocument('test')
      if (reason === 'document-changed')
        await viewer.open({ schema: f.schema, data: { value: 'other' } })
      else
        await viewer.destroy()
      expect(await output).toMatchObject({ status: 'cancelled', reason })
      expect((await render).status).toBe('cancelled')
      expect(channel).not.toHaveBeenCalled()
    }
    finally {
      work.resolve()
      await viewer.destroy()
      f.mount.remove()
    }
  })

  it('cancels prepare on destroy promptly and prevents late export and diagnostic delivery', async () => {
    const f = fixture()
    const entered = Promise.withResolvers<void>()
    const work = Promise.withResolvers<void>()
    const events = vi.fn()
    const channel = vi.fn(async () => {})
    const viewer = await createViewer({ container: f.mount, materials: [f.material] })
    viewer.registerExporter({ id: 'test', format: 'test', prepare: async (ctx) => {
      entered.resolve()
      await work.promise
      ctx.onDiagnostic?.({ category: 'exporter', severity: 'warning', code: 'LATE', message: 'late' })
    }, export: channel })
    await viewer.open({ schema: f.schema, data: { value: 'A' } })
    const output = viewer.exportDocument({ format: 'test', onDiagnostic: events })
    await entered.promise
    await viewer.destroy()
    expect(await output).toMatchObject({ status: 'cancelled', reason: 'destroyed' })
    expect(f.scopes.get('A')!.aborted).toBe(true)
    work.resolve()
    await work.promise
    await Promise.resolve()
    expect(channel).not.toHaveBeenCalled()
    expect(events).not.toHaveBeenCalled()
    expect(f.mount.childElementCount).toBe(0)
    f.mount.remove()
  })

  it('releases a failed task in finally while the preview keeps its resources', async () => {
    const f = fixture()
    const viewer = await createViewer({ container: f.mount, materials: [f.material] })
    viewer.registerExporter({ id: 'test', format: 'test', export: async () => {
      throw new Error('channel failed')
    } })
    try {
      await viewer.open({ schema: f.schema, data: { value: 'A' } })
      await expect(viewer.exportDocument('test')).rejects.toThrow('channel failed')
      expect(f.scopes.get('A')!.aborted).toBe(false)
      await viewer.updateData({ value: 'B' })
      await Promise.resolve()
      expect(f.cleaned).toEqual(['A'])
    }
    finally {
      await viewer.destroy()
      f.mount.remove()
    }
  })

  it('awaits acquired async cleanup during active output destroy, continues errors and self-cleans late acquisitions', async () => {
    const f = fixture()
    const started = Promise.withResolvers<void>()
    const external = Promise.withResolvers<void>()
    const cleaning = Promise.withResolvers<void>()
    const cleanup = Promise.withResolvers<void>()
    const order: string[] = []
    let acquireLate!: () => void
    const viewer = await createViewer({ container: f.mount, materials: [{ ...f.material, renderer: { render: (_node, ctx) => {
      ctx.onDispose(() => {
        order.push('first')
      })
      ctx.onDispose(async () => {
        cleaning.resolve()
        await cleanup.promise
        order.push('async')
        throw new Error('cleanup failure')
      })
      acquireLate = () => ctx.onDispose(() => {
        order.push('late')
      })
      return { element: ctx.document.createElement('button') }
    } } }] })
    viewer.registerPrintDriver({ id: 'external', print: async () => {
      started.resolve()
      await external.promise
      acquireLate()
    } })
    await viewer.open({ schema: f.schema })
    const output = viewer.print({ driverId: 'external' })
    await started.promise
    const destroyed = viewer.destroy()
    expect(await output).toMatchObject({ status: 'cancelled', reason: 'destroyed' })
    await cleaning.promise
    let disposed = false
    void destroyed.then(() => {
      disposed = true
    })
    await Promise.resolve()
    expect(disposed).toBe(false)
    cleanup.resolve()
    const result = await destroyed
    expect(result.errors).toContainEqual(expect.objectContaining({ phase: 'consumer', cause: expect.objectContaining({ message: 'cleanup failure' }) }))
    expect(order).toEqual(['async', 'first'])
    external.resolve()
    await external.promise
    await Promise.resolve()
    expect(order).toEqual(['async', 'first', 'late'])
    expect(f.mount.childElementCount).toBe(0)
    f.mount.remove()
  })

  it('does not deliver a started old task warning or failure to a new document subscriber', async () => {
    const f = fixture()
    const entered = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const newEvents = vi.fn()
    const viewer = await createViewer({ container: f.mount, materials: [f.material] })
    viewer.registerExporter({ id: 'test', format: 'test', export: async (ctx) => {
      entered.resolve()
      await finish.promise
      ctx.onDiagnostic?.({ category: 'exporter', severity: 'warning', code: 'OLD_TASK', message: 'old warning' })
      throw new Error('old output failed')
    } })
    try {
      await viewer.open({ schema: f.schema, data: { value: 'A' } })
      const output = viewer.exportDocument('test')
      await entered.promise
      await viewer.open({ schema: f.schema, data: { value: 'B' }, onDiagnostic: newEvents })
      finish.resolve()
      await expect(output).rejects.toThrow('old output failed')
      expect(newEvents).not.toHaveBeenCalled()
    }
    finally {
      finish.resolve()
      await viewer.destroy()
      f.mount.remove()
    }
  })
})
