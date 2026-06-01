import type { FontProvider } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { MaterialDefinition } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from './designer-store'

describe('designer store schema initialization', () => {
  it('normalizes an empty schema input to a complete document schema', () => {
    const store = new DesignerStore({})

    expect(store.schema.unit).toBe('mm')
    expect(store.schema.page).toMatchObject({ mode: 'fixed', width: 210, height: 297 })
    expect(store.schema.guides).toEqual({ x: [], y: [] })
    expect(store.schema.elements).toEqual([])
  })

  it('normalizes partial schema replacements', () => {
    const store = new DesignerStore()

    store.setSchema({ page: { width: 80 } })

    expect(store.schema.page).toMatchObject({ mode: 'fixed', width: 80, height: 297 })
    expect(store.schema.guides).toEqual({ x: [], y: [] })
    expect(store.schema.elements).toEqual([])
  })

  it('keeps save status transitions behind the store API', () => {
    const store = new DesignerStore()

    store.queueSave()
    expect(store.workbench.status).toMatchObject({ draft: 'modified', savePhase: 'queued' })

    store.startSave()
    expect(store.workbench.status.savePhase).toBe('saving')

    store.completeSave()
    expect(store.workbench.status.draft).toBe('clean')
    expect(store.workbench.status.savePhase).toBe('success')
    expect(store.workbench.status.saveUpdatedAt).toEqual(expect.any(Number))

    store.resetTemplateSaveState()
    expect(store.workbench.status).toMatchObject({ draft: 'clean', savePhase: 'idle' })
    expect(store.workbench.status.saveUpdatedAt).toBeUndefined()
  })

  it('prunes removed elements from logical groups', () => {
    const store = new DesignerStore({
      elements: [
        createNode('a'),
        createNode('b'),
        createNode('c'),
      ],
      groups: [{ id: 'grp_1', memberIds: ['a', 'b', 'c'] }],
    })

    store.removeElement('b')
    expect(store.schema.groups).toEqual([{ id: 'grp_1', memberIds: ['a', 'c'] }])

    store.removeElement('a')
    expect(store.schema.groups).toEqual([])
  })

  it('registers materials, catalog entries, and cached designer extensions', () => {
    const store = new DesignerStore()
    const definition = createMaterialDefinition('sample')
    const factory = vi.fn(() => ({ renderContent: () => () => {} }))

    store.registerMaterial(definition)
    store.registerCatalogEntry({
      id: 'quick-sample',
      group: 'quick',
      label: 'Sample',
      icon: definition.icon,
      materialType: 'sample',
      priority: 'quick',
    })
    store.registerDesignerFactory('sample', factory)

    expect(store.getMaterial('sample')).toMatchObject({ type: 'sample', name: 'Sample' })
    expect(store.getQuickMaterials()).toHaveLength(1)
    expect(store.getCatalog()).toHaveLength(1)
    expect(store.getDesignerExtension('sample')).toBe(store.getDesignerExtension('sample'))
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('resolves registered locale messages after host locale overrides', () => {
    const store = new DesignerStore()

    store.setLocale({ plugin: { title: 'Host Title' } }, 'en-US')
    const unregister = store.registerLocaleMessages({
      messages: { plugin: { title: 'Default Title', action: '默认操作' } },
      locales: {
        'en-US': { plugin: { title: 'Registered Title', action: 'Registered Action' } },
      },
    })

    expect(store.t('plugin.title')).toBe('Host Title')
    expect(store.t('plugin.action')).toBe('Registered Action')

    unregister()

    expect(store.t('plugin.action')).toBe('plugin.action')
  })

  it('delegates font loading while preserving font manager compatibility', async () => {
    const store = new DesignerStore()
    const provider: FontProvider = {
      listFonts: async () => [{
        family: 'Inter',
        displayName: 'Inter',
        weights: ['400'],
        styles: ['normal'],
        source: 'system',
      }],
      loadFont: async () => ({ type: 'system' }),
    }

    store.setFontProvider(provider)
    const revision = store.fontRevision

    await expect(store.ensureFontLoaded({ family: 'Inter' })).resolves.toBe(true)
    expect(store.fontManager).toBe(store.fontService.manager)
    expect(store.getFontStatus('Inter')).toBe('loaded')
    expect(store.getFontStatuses(['Inter'], store.fontRevision)).toEqual({ Inter: 'loaded' })
    expect(store.fontRevision).toBeGreaterThan(revision)
  })
})

function createMaterialDefinition(type: string): MaterialDefinition {
  return {
    type,
    name: 'Sample',
    icon: { render: () => null } as MaterialDefinition['icon'],
    category: 'basic',
    capabilities: {},
    props: [],
    createDefaultNode: input => ({
      id: input?.id ?? 'sample-1',
      type,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      props: {},
      ...input,
    } satisfies MaterialNode),
  }
}

function createNode(id: string): MaterialNode {
  return {
    id,
    type: 'sample',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    props: {},
  }
}
