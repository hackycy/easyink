import type { FontProvider } from '@easyink/core'
import type { DesignerCommand, DesignerContext, DesignerRendererContext } from '@easyink/plugin-api/designer'
import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import type { MaterialNode } from '@easyink/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesignerStore } from './designer-store'

const stores: DesignerStore[] = []
async function create(options: Parameters<typeof DesignerStore.create>[0] = {}) {
  const store = await DesignerStore.create(options)
  stores.push(store)
  return store
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.destroy()))
})

describe('designer store schema initialization', () => {
  it('normalizes an empty schema input to a complete document schema', async () => {
    const store = await create({ schema: {} })
    expect(store.schema.unit).toBe('mm')
    expect(store.schema.page).toMatchObject({ mode: 'fixed', width: 210, height: 297 })
    expect(store.schema.guides).toEqual({ x: [], y: [] })
    expect(store.schema.elements).toEqual([])
    expect(store.listMaterials()).toEqual([])
  })

  it('normalizes partial schema replacements', async () => {
    const store = await create()
    store.setSchema({ page: { width: 80 } })
    expect(store.schema.page).toMatchObject({ mode: 'fixed', width: 80, height: 297 })
    expect(store.schema.guides).toEqual({ x: [], y: [] })
    expect(store.schema.elements).toEqual([])
  })

  it('uses EasyInk paper presets by default', async () => {
    const store = await create()
    expect(store.listPaperPresets().map(preset => preset.name)).toContain('A4')
    expect(store.getPaperPresetBySize(210, 297)?.name).toBe('A4')
  })

  it('can replace built-in paper presets with host presets', async () => {
    const store = await create({ runtimeConfig: { paper: { mode: 'replace', presets: [{ name: 'Enterprise Label', width: 76, height: 42 }] } } })
    expect(store.listPaperPresets()).toEqual([{ name: 'Enterprise Label', width: 76, height: 42 }])
    expect(store.getPaperPreset('A4')).toBeUndefined()
  })

  it('applies the configured default paper only without an explicit page size', async () => {
    const runtimeConfig = { paper: { mode: 'replace' as const, presets: [{ name: 'Enterprise Label', width: 76, height: 42 }], defaultPreset: 'Enterprise Label' } }
    const defaulted = await create({ runtimeConfig })
    const explicit = await create({ schema: { page: { width: 90 } }, runtimeConfig })
    expect(defaulted.schema.page).toMatchObject({ width: 76, height: 42, pageModel: { paper: { width: 76, height: 42 } } })
    expect(explicit.schema.page).toMatchObject({ width: 90, height: 297, pageModel: { paper: { width: 90, height: 297 } } })
  })

  it('keeps save status transitions behind the store API', async () => {
    const store = await create()
    store.queueSave()
    expect(store.workbench.status).toMatchObject({ draft: 'modified', savePhase: 'queued' })
    store.startSave()
    expect(store.workbench.status.savePhase).toBe('saving')
    store.completeSave()
    expect(store.workbench.status).toMatchObject({ draft: 'clean', savePhase: 'success' })
    expect(store.workbench.status.saveUpdatedAt).toEqual(expect.any(Number))
    store.resetTemplateSaveState()
    expect(store.workbench.status).toMatchObject({ draft: 'clean', savePhase: 'idle' })
    expect(store.workbench.status.saveUpdatedAt).toBeUndefined()
  })

  it('prunes removed elements from logical groups', async () => {
    const store = await create({ schema: { elements: [createNode('a'), createNode('b'), createNode('c')], groups: [{ id: 'grp_1', memberIds: ['a', 'b', 'c'] }] } })
    store.removeElement('b')
    expect(store.schema.groups).toEqual([{ id: 'grp_1', memberIds: ['a', 'c'] }])
    store.removeElement('a')
    expect(store.schema.groups).toEqual([])
  })

  it('consumes complete materials and palette declarations from the unique Host', async () => {
    const factory = vi.fn(() => ({ renderContent: () => () => {} }))
    const store = await create({ materials: [{ ...material('sample'), renderer: factory }] })
    expect(store.getMaterial('sample')).toMatchObject({ type: 'sample', name: 'Sample' })
    expect(store.getCatalogGroups()).toHaveLength(1)
    expect(store.getCatalogGroups()[0]?.items).toHaveLength(1)
    expect(store.getCatalog()).toHaveLength(1)
    expect(store.getDesignerExtension('sample')).toBe(store.getDesignerExtension('sample'))
    expect(factory).toHaveBeenCalledTimes(1)
    expect('registerMaterial' in store).toBe(false)
    expect('materialRegistry' in store).toBe(false)
  })

  it('returns a stable loading extension and acquires a lazy factory only on demand', async () => {
    const factory = vi.fn(() => ({ renderContent: () => () => {} }))
    const load = Promise.withResolvers<typeof factory>()
    const { renderer: _renderer, ...rest } = material('lazy-sample')
    const loader = vi.fn(() => load.promise)
    const store = await create({ materials: [{ ...rest, loadRenderer: loader }] })
    expect(loader).not.toHaveBeenCalled()
    const loading = store.getDesignerExtension('lazy-sample')
    expect(loading).toBe(store.getDesignerExtension('lazy-sample'))
    expect(factory).not.toHaveBeenCalled()
    load.resolve(factory)
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(store.getDesignerExtension('lazy-sample')).not.toBe(loading))
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('combines extension and material locale with application overrides and whole-tree fallback', async () => {
    const store = await create({
      locale: { code: 'en-US', messages: { plugin: { title: 'Host Title' } } },
      extensions: [{ id: 'fixture', locale: { messages: { plugin: { action: 'Default Action', missing: 'Default Missing' } }, locales: { 'en-US': { plugin: { title: 'Plugin Title', action: 'Action' } } } } }],
      materials: [{ ...material('sample'), properties: [{ key: 'label', label: 'materials.sample.label', type: 'string' }], locale: { messages: { materials: { sample: { label: 'Default Label' } } }, locales: { 'en-US': { materials: { sample: { label: 'Label' } } } } } }],
    })
    expect(store.t('plugin.title')).toBe('Host Title')
    expect(store.t('plugin.action')).toBe('Action')
    expect(store.t('plugin.missing')).toBe('plugin.missing')
    expect(store.t('materials.sample.label')).toBe('Label')
    expect(store.getMaterial('sample')?.props.map(schema => schema.label)).toEqual(['materials.sample.label'])
    store.setLocale({}, 'unknown')
    expect(store.t('plugin.action')).toBe('Default Action')
    expect(store.t('materials.sample.label')).toBe('Default Label')
    expect('registerLocaleMessages' in store).toBe(false)
  })

  it('rolls back required factory failures before rejecting creation', async () => {
    const release = Promise.withResolvers<void>()
    const cleanup = vi.fn(() => release.promise)
    let context!: DesignerRendererContext
    const first = { ...material('first'), renderer: (ctx: DesignerRendererContext) => {
      context = ctx
      ctx.onDispose(cleanup)
      return { renderContent: () => () => {} }
    } }
    const failure = new Error('required factory failed')
    const pending = DesignerStore.create({ materials: [first, { ...material('second'), renderer: () => {
      throw failure
    } }] })
    let settled = false
    void pending.catch(() => {
      settled = true
    })
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))
    expect(settled).toBe(false)
    expect(context.signal.aborted).toBe(true)
    expect(() => context.getSchema()).toThrow(/disposed/)
    release.resolve()
    await expect(pending).rejects.toMatchObject({ cause: failure })
  })

  it('invalidates synchronously and returns the same destruction Promise while all cleanup continues', async () => {
    const release = Promise.withResolvers<void>()
    const order: string[] = []
    let context!: DesignerRendererContext
    const store = await create({ materials: [{ ...material('sample'), renderer: (ctx) => {
      context = ctx
      ctx.onDispose(() => {
        order.push('first')
      })
      ctx.onDispose(() => {
        order.push('broken')
        throw new Error('cleanup failed')
      })
      ctx.onDispose(() => {
        order.push('last')
        return release.promise
      })
      return { renderContent: () => () => {} }
    } }] })
    const pending = store.destroy()
    expect(store.destroy()).toBe(pending)
    expect(context.signal.aborted).toBe(true)
    expect(() => context.tx.run('node', () => {})).toThrow(/disposed/)
    expect(() => store.getDesignerExtension('sample')).toThrow(/disposed/)
    release.resolve()
    const result = await pending
    expect(order).toEqual(['last', 'broken', 'first'])
    expect(result.errors).toHaveLength(1)
    expect(store.destroy()).toBe(pending)
    expect(store.dataSourceRegistry.getSources()).toEqual([])
  })

  it('does not start or publish late lazy factories after destruction', async () => {
    const factory = vi.fn(() => ({ renderContent: () => () => {} }))
    const late = Promise.withResolvers<typeof factory>()
    const { renderer: _renderer, ...rest } = material('late')
    let signal!: AbortSignal
    const cleanup = vi.fn()
    const store = await create({ materials: [{ ...rest, loadRenderer: (resources) => {
      signal = resources.signal
      resources.onDispose(cleanup)
      return late.promise
    } }] })
    store.getDesignerExtension('late')
    const revision = store.materialExtensionRevision
    await store.destroy()
    expect(signal.aborted).toBe(true)
    expect(cleanup).toHaveBeenCalledTimes(1)
    late.resolve(factory)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(factory).not.toHaveBeenCalled()
    expect(store.materialExtensionRevision).toBe(revision)
    expect(store.diagnostics.entries).toEqual([])
  })

  it('executes declared commands with stable owner contexts independently across Hosts', async () => {
    const contexts: DesignerContext[] = []
    const cleanup = vi.fn()
    const command: DesignerCommand<string, string> = {
      id: 'fixture.edit',
      handler: (value, context) => {
        contexts.push(context)
        context.onDispose(cleanup)
        context.tx.run('node', draft => draft.props.value = value)
        return value
      },
    }
    const extension = { id: 'fixture', commands: [command], ui: { toolbar: [{ id: 'fixture.edit', label: 'Edit', onClick: () => {} }] } }
    const a = await create({ schema: { elements: [createNode('node')] }, extensions: [extension] })
    const b = await create({ schema: { elements: [createNode('node')] }, extensions: [extension] })
    const ownerA = a.getContributions('designer.toolbar')[0].owner
    const ownerB = b.getContributions('designer.toolbar')[0].owner
    const contextA = a.getExtensionContext(ownerA)
    const contextB = b.getExtensionContext(ownerB)
    expect(contextA).toBe(a.getExtensionContext(ownerA))
    expect(contextA).not.toBe(contextB)
    expect('store' in contextA).toBe(false)
    expect('getZoom' in contextA).toBe(false)
    expect('on' in contextA).toBe(false)
    await expect(contextA.executeCommand(command, 'a')).resolves.toBe('a')
    await expect(contextB.executeCommand(command, 'b')).resolves.toBe('b')
    expect(contexts).toEqual([contextA, contextB])
    expect(a.schema.elements[0].props.value).toBe('a')
    expect(b.schema.elements[0].props.value).toBe('b')
    const spoof = { ...command, handler: vi.fn(() => 'spoof') }
    await expect(contextA.executeCommand(spoof, 'bad')).rejects.toThrow(/not installed/)
    expect(spoof.handler).not.toHaveBeenCalled()
    await a.destroy()
    expect(cleanup).toHaveBeenCalledTimes(1)
    await expect(contextA.executeCommand(command, 'late')).rejects.toThrow(/disposed/)
    await contextB.executeCommand(command, 'still live')
    expect(b.schema.elements[0].props.value).toBe('still live')
  })

  it('rejects a command completion after owner invalidation and cleans its acquired resources', async () => {
    const late = Promise.withResolvers<string>()
    const cleanup = vi.fn()
    const command: DesignerCommand<void, string> = { id: 'fixture.wait', handler: (_args, context) => {
      context.onDispose(cleanup)
      return late.promise
    } }
    const store = await create({ extensions: [{ id: 'fixture', commands: [command] }] })
    const context = store.getExtensionContext(store.getContributions('designer.command')[0].owner)
    const pending = context.executeCommand(command, undefined)
    await store.destroy()
    late.resolve('late')
    await expect(pending).rejects.toThrow(/disposed/)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('delegates font loading while preserving the font manager', async () => {
    const provider: FontProvider = {
      listFonts: async () => [{ family: 'Inter', displayName: 'Inter', weights: ['400'], styles: ['normal'], source: 'system' }],
      loadFont: async () => ({ type: 'system' }),
    }
    const store = await create({ fontProvider: provider })
    const revision = store.fontRevision
    await expect(store.ensureFontLoaded({ family: 'Inter' })).resolves.toBe(true)
    expect(store.fontManager).toBe(store.fontService.manager)
    expect(store.getFontStatuses(['Inter'])).toEqual({ Inter: 'loaded' })
    expect(store.fontRevision).toBeGreaterThan(revision)
  })

  it('does not publish late manual font success or failure after destruction', async () => {
    for (const outcome of ['success', 'failure'] as const) {
      const late = Promise.withResolvers<string>()
      const provider: FontProvider = { listFonts: async () => [], loadFont: vi.fn(() => late.promise) }
      const store = await create({ fontProvider: provider })
      store.setFontTarget(document)
      const pending = store.ensureFontLoaded({ family: `late-${outcome}` })
      await vi.waitFor(() => expect(provider.loadFont).toHaveBeenCalledTimes(1))
      await store.destroy()
      const revision = store.fontRevision
      if (outcome === 'success')
        late.resolve('https://example.com/late.woff2')
      else
        late.reject(new Error('late font failure'))
      await expect(pending).resolves.toBe(false)
      expect(store.fontRevision).toBe(revision)
      expect(store.diagnostics.entries).toEqual([])
      expect(store.getFontStatus(`late-${outcome}`)).toBe('unloaded')
      expect(document.querySelector('style[data-easyink-font]')).toBeNull()
      await expect(store.ensureFontLoaded({ family: 'new' })).rejects.toThrow(/disposed/)
    }
  })

  it('discards a font catalog that completes after Host destruction', async () => {
    const catalog = Promise.withResolvers<Awaited<ReturnType<FontProvider['listFonts']>>>()
    const provider: FontProvider = { listFonts: vi.fn(() => catalog.promise), loadFont: vi.fn(async () => ({ type: 'system' as const })) }
    const store = await create({ fontProvider: provider })
    const pending = store.ensureFontLoaded({ family: 'late-catalog' })
    await store.destroy()
    catalog.resolve([{ family: 'late-catalog', displayName: 'Late', weights: ['400'], styles: ['normal'], source: 'system' }])
    await expect(pending).resolves.toBe(false)
    expect(provider.loadFont).not.toHaveBeenCalled()
    expect(store.getFontStatus('late-catalog')).toBe('unloaded')
    expect(store.diagnostics.entries).toEqual([])
  })
})

function material(type: string): Extract<DesignerMaterial, { renderer: unknown }> {
  return {
    model: { type, binding: { kind: 'none' }, capabilities: {}, createDefaultNode: input => ({ ...createNode(input?.id ?? `${type}-1`), type, ...input }) },
    renderer: () => ({ renderContent: () => () => {} }),
    ui: { palette: [{ id: `basic-${type}`, label: 'Sample', icon: { render: () => null }, group: { id: 'basic', label: 'materials.catalog.basic' } }] },
  }
}
function createNode(id: string): MaterialNode {
  return { id, type: 'sample', x: 0, y: 0, width: 10, height: 10, props: {} }
}
