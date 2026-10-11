import type { ResourceContext } from '@easyink/plugin-api'
import type { DesignerMaterial } from '@easyink/plugin-api/designer'
import type { DesignerRendererOperations } from './renderer-context'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { createDesignerMaterialHost } from './host-consumer'

function model(type: string) {
  return {
    type,
    binding: { kind: 'none' as const },
    createDefaultNode: () => ({ id: type, type, x: 0, y: 0, width: 10, height: 10, rotation: 0, props: {} }),
  }
}

function operations(): DesignerRendererOperations {
  return {
    getSchema: () => normalizeDocumentSchema(),
    getNode: () => undefined,
    getSelection: () => ({ ids: [], count: 0, isEmpty: true }),
    isEditing: () => false,
    getDataSources: () => [],
    getMaterials: () => [],
    getBindingLabel: binding => binding.fieldPath ?? '',
    t: key => key,
    executeCommand: async () => { throw new Error('No commands installed') },
    commitCommand: () => {},
    tx: { run: () => {}, batch: fn => fn() },
    replaceDocument: () => {},
    readDocumentExtension: () => undefined,
    writeDocumentExtension: () => {},
    registerDataSource: () => {},
    confirm: async () => false,
    pickAsset: async () => null,
    pickFileText: async () => null,
    reportDiagnostic: () => {},
    requestPropertyPanel: () => {},
    getZoom: () => 1,
    getPageEl: () => null,
  }
}

describe('designer material consumer', () => {
  it('creates separate factories and lifetimes for a reused declaration', async () => {
    const clean = [vi.fn(), vi.fn()]
    let index = 0
    const material: DesignerMaterial = {
      model: model('shared'),
      renderer: (ctx) => {
        expect('store' in ctx).toBe(false)
        ctx.onDispose(clean[index++])
        return { renderContent: () => () => {} }
      },
    }
    const a = await createDesignerMaterialHost({ kind: 'designer', materials: [material] }, operations())
    const b = await createDesignerMaterialHost({ kind: 'designer', materials: [material] }, operations())
    expect(await a.getExtension('shared')).not.toBe(await b.getExtension('shared'))
    const disposal = a.destroy()
    expect(a.destroy()).toBe(disposal)
    expect(() => a.getExtension('shared')).toThrow(/disposing/)
    await disposal
    expect(clean[0]).toHaveBeenCalledOnce()
    expect(clean[1]).not.toHaveBeenCalled()
    expect(b.host.state).toBe('active')
    await b.destroy()
    expect(clean[1]).toHaveBeenCalledOnce()
  })

  it('rolls back all initialized factories before rejecting and preserves cleanup failures', async () => {
    const cleaned: string[] = []
    const cause = new Error('factory')
    const cleanupCause = new Error('cleanup')
    const materials: DesignerMaterial[] = ['a', 'b'].map(type => ({
      model: model(type),
      renderer: (ctx) => {
        ctx.onDispose(() => {
          cleaned.push(type)
        })
        ctx.onDispose(() => {
          throw cleanupCause
        })
        if (type === 'b')
          throw cause
        return { renderContent: () => () => {} }
      },
    }))
    await expect(createDesignerMaterialHost({ kind: 'designer', materials }, operations())).rejects.toMatchObject({
      cause,
      cleanup: { errors: [{ cause: cleanupCause }, { cause: cleanupCause }] },
    })
    expect(cleaned).toEqual(['b', 'a'])
  })

  it('defers and deduplicates lazy work, then suppresses a late factory and cleans acquired resources', async () => {
    const external = Promise.withResolvers<NonNullable<DesignerMaterial['renderer']>>()
    const factory = vi.fn(() => ({ renderContent: () => () => {} }))
    const clean = vi.fn()
    const loadRenderer = vi.fn((resources: ResourceContext) => {
      resources.onDispose(clean)
      return external.promise
    })
    const consumer = await createDesignerMaterialHost({ kind: 'designer', materials: [{ model: model('lazy'), loadRenderer }] }, operations())
    expect(loadRenderer).not.toHaveBeenCalled()
    const first = consumer.getExtension('lazy')
    expect(consumer.getExtension('lazy')).toBe(first)
    await consumer.destroy()
    expect(clean).toHaveBeenCalledOnce()
    external.resolve(factory)
    expect(await first).toBeUndefined()
    expect(factory).not.toHaveBeenCalled()
    expect(consumer.host.registry.materials).toEqual([])
  })

  it('keeps an active lazy failure local, cleans it and allows a retry', async () => {
    const clean = vi.fn()
    let attempts = 0
    const consumer = await createDesignerMaterialHost({ kind: 'designer', materials: [{
      model: model('retry'),
      loadRenderer: async (resources) => {
        resources.onDispose(clean)
        if (++attempts === 1)
          throw new Error('network')
        return () => ({ renderContent: () => () => {} })
      },
    }] }, operations())
    await expect(consumer.getExtension('retry')).rejects.toThrow('network')
    expect(clean).toHaveBeenCalledOnce()
    expect(consumer.host.state).toBe('active')
    expect(await consumer.getExtension('retry')).toBeDefined()
    await consumer.destroy()
    expect(clean).toHaveBeenCalledTimes(2)
  })
})
