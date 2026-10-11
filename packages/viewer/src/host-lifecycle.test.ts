import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { ViewerHost } from './viewer-host'
import { FontManager } from '@easyink/core'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { createViewer } from './index'
import { createCustomViewerHost } from './viewer-host'

function model(type: string) {
  return {
    type,
    binding: { kind: 'none' as const },
    createDefaultNode: () => ({ id: type, type, x: 0, y: 0, width: 10, height: 10, rotation: 0, props: {} }),
  }
}

describe('public Viewer Host lifecycle', () => {
  it('creates an independent Host for each shared declaration and reuses awaitable destroy', async () => {
    const clean: string[] = []
    const material: ViewerMaterial = {
      model: model('shared'),
      renderer: {
        render: (_node, ctx) => {
          const element = ctx.document.createElement('span')
          element.textContent = String(ctx.data.value)
          ctx.onDispose(() => {
            clean.push(String(ctx.data.value))
          })
          return { element }
        },
      },
    }
    const aMount = document.createElement('div')
    const bMount = document.createElement('div')
    const a = await createViewer({ container: aMount, materials: [material] })
    const b = await createViewer({ container: bMount, materials: [material] })
    const schema = normalizeDocumentSchema({ elements: [material.model.createDefaultNode()] })
    await a.open({ schema, data: { value: 'a' } })
    await b.open({ schema, data: { value: 'b' } })
    const first = a.destroy()
    expect(a.destroy()).toBe(first)
    await expect(a.render()).rejects.toThrow(/destroyed/)
    expect(await first).toEqual({ errors: [] })
    expect(aMount.childElementCount).toBe(0)
    expect(bMount.textContent).toBe('b')
    expect(clean).toEqual(['a'])
    await b.destroy()
    expect(clean).toEqual(['a', 'b'])
    expect('registerMaterial' in a).toBe(false)
    expect('materialRegistry' in a).toBe(false)
  })

  it('rejects duplicate complete materials before touching the mount', async () => {
    const material: ViewerMaterial = { model: model('duplicate'), renderer: { render: () => ({}) } }
    const mount = document.createElement('div')
    mount.textContent = 'prior'
    await expect(createViewer({ container: mount, materials: [material, material] })).rejects.toMatchObject({ cause: { code: 'duplicate-identity' } })
    expect(mount.textContent).toBe('prior')
  })

  it('preserves the required initialization failure and aggregates cleanup failures', async () => {
    const cause = new Error('mount access')
    const cleanupCause = new Error('font cleanup')
    // Simulate a JS host whose required mount getter cannot initialize.
    const invalidHost = { document } as ViewerHost
    Object.defineProperty(invalidHost, 'mount', { get: () => {
      throw cause
    } })
    const clear = vi.spyOn(FontManager.prototype, 'clear').mockImplementation(() => {
      throw cleanupCause
    })
    try {
      await expect(createViewer({ host: invalidHost, materials: [] })).rejects.toMatchObject({ cause, cleanup: { errors: expect.arrayContaining([{ owner: expect.anything(), phase: 'consumer', cause: cleanupCause }]) } })
    }
    finally {
      clear.mockRestore()
    }
  })

  it('does not wait for lazy external work or publish late output, and releases late acquired resources', async () => {
    const external = Promise.withResolvers<void>()
    const loaded = Promise.withResolvers<void>()
    const close = vi.fn()
    const render = vi.fn(() => ({ element: document.createElement('span') }))
    const material: ViewerMaterial = {
      model: model('lazy'),
      loadRenderer: async (ctx) => {
        loaded.resolve()
        await external.promise
        ctx.onDispose(close)
        return { render }
      },
    }
    const mount = document.createElement('div')
    const viewer = await createViewer({ container: mount, materials: [material] })
    const pending = viewer.open({ schema: normalizeDocumentSchema({ elements: [material.model.createDefaultNode()] }) })
    // Attach rejection handling before destruction; task cancellation results arrive in the render Gate.
    const settled = pending.catch(error => error)
    await loaded.promise
    await viewer.destroy()
    external.resolve()
    expect(await settled).toBeInstanceOf(Error)
    expect(render).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(mount.childElementCount).toBe(0)
    expect(viewer.renderedPages).toEqual([])
  })

  it('continues acquired cleanup after a surface failure and reports both owners', async () => {
    const surfaceCause = new Error('surface cleanup')
    const materialCause = new Error('material cleanup')
    const cleaned = vi.fn()
    const mount = document.createElement('div')
    const host = { ...createCustomViewerHost({ document, mount }), clear: () => {
      throw surfaceCause
    } }
    const material: ViewerMaterial = {
      model: model('resource'),
      renderer: { render: (_node, ctx) => {
        ctx.onDispose(cleaned)
        ctx.onDispose(() => {
          throw materialCause
        })
        return { element: ctx.document.createElement('span') }
      } },
    }
    const viewer = await createViewer({ host, materials: [material] })
    await viewer.open({ schema: normalizeDocumentSchema({ elements: [material.model.createDefaultNode()] }) })
    const result = await viewer.destroy()
    expect(result.errors).toMatchObject([
      { phase: 'consumer', cause: surfaceCause },
      { phase: 'scope', cause: materialCause },
    ])
    expect(cleaned).toHaveBeenCalledOnce()
  })
})
