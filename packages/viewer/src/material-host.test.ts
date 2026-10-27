import type { ViewerImplementation, ViewerMaterial } from '@easyink/plugin-api/viewer'
import { describe, expect, it, vi } from 'vitest'
import { createViewerMaterialHost } from './material-host'

function model(type: string) {
  return {
    type,
    binding: { kind: 'none' as const },
    createDefaultNode: () => ({ id: type, type, x: 0, y: 0, width: 10, height: 10, rotation: 0, props: {} }),
  }
}

describe('viewer material consumer', () => {
  it('reads eager renderers from the kernel and never owns another writable declaration registry', async () => {
    const material: ViewerMaterial = { model: model('eager'), renderer: { render: (_node, ctx) => ({ element: ctx.document.createElement('span') }) } }
    const a = await createViewerMaterialHost({ kind: 'viewer', materials: [material] })
    const b = await createViewerMaterialHost({ kind: 'viewer', materials: [material] })
    expect(await a.getRenderer('eager')).toBe(material.renderer)
    expect(await a.getRenderer('missing')).toBeUndefined()
    expect('register' in a).toBe(false)
    const disposal = a.destroy()
    expect(a.destroy()).toBe(disposal)
    expect(a.host.registry.materials).toEqual([])
    expect(() => a.getRenderer('eager')).toThrow(/disposing/)
    await disposal
    expect(await b.getRenderer('eager')).toBe(material.renderer)
    await b.destroy()
  })

  it('deduplicates lazy work and does not publish late results or failures', async () => {
    const external = Promise.withResolvers<ViewerImplementation>()
    const clean = vi.fn()
    const loadRenderer = vi.fn(async (ctx: import('@easyink/plugin-api').ResourceContext) => {
      ctx.onDispose(clean)
      return external.promise
    })
    const consumer = await createViewerMaterialHost({ kind: 'viewer', materials: [{ model: model('lazy'), loadRenderer }] })
    expect(loadRenderer).not.toHaveBeenCalled()
    const first = consumer.getRenderer('lazy')
    expect(consumer.getRenderer('lazy')).toBe(first)
    await consumer.destroy()
    external.reject(new Error('late network failure'))
    expect(await first).toBeUndefined()
    expect(clean).toHaveBeenCalledOnce()
    expect(consumer.host.lateCleanupErrors).toEqual([])
  })

  it('releases late resources registered by a loader that ignores abort', async () => {
    const external = Promise.withResolvers<void>()
    const close = vi.fn()
    const consumer = await createViewerMaterialHost({ kind: 'viewer', materials: [{
      model: model('late'),
      loadRenderer: async (ctx) => {
        await external.promise
        ctx.onDispose(close)
        return { render: (_node, context) => ({ element: context.document.createElement('span') }) }
      },
    }] })
    const pending = consumer.getRenderer('late')
    await consumer.destroy()
    external.resolve()
    expect(await pending).toBeUndefined()
    expect(close).toHaveBeenCalledOnce()
  })

  it('cleans an invalid lazy result without changing the active Host and retries', async () => {
    const clean = vi.fn()
    let attempts = 0
    const consumer = await createViewerMaterialHost({ kind: 'viewer', materials: [{
      model: model('invalid'),
      loadRenderer: async (ctx) => {
        ctx.onDispose(clean)
        return ++attempts === 1 ? {} as ViewerImplementation : { render: (_node, context) => ({ element: context.document.createElement('span') }) }
      },
    }] })
    await expect(consumer.getRenderer('invalid')).rejects.toThrow(/must return/)
    expect(clean).toHaveBeenCalledOnce()
    expect(consumer.host.state).toBe('active')
    const renderer = await consumer.getRenderer('invalid')
    expect(await consumer.getRenderer('invalid')).toBe(renderer)
    await consumer.destroy()
    expect(clean).toHaveBeenCalledTimes(2)
  })
})
