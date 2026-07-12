import type { FontProvider } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { DesignerMaterialBundle } from '../materials/registry'
import type { MaterialDefinition } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { registerMaterialBundle } from '../materials/registry'
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

  it('uses EasyInk paper presets by default', () => {
    const store = new DesignerStore()

    expect(store.listPaperPresets().map(preset => preset.name)).toContain('A4')
    expect(store.getPaperPresetBySize(210, 297)?.name).toBe('A4')
  })

  it('can replace built-in paper presets with host presets', () => {
    const store = new DesignerStore(undefined, undefined, undefined, {
      paper: {
        mode: 'replace',
        presets: [{ name: 'Enterprise Label', width: 76, height: 42 }],
      },
    })

    expect(store.listPaperPresets()).toEqual([
      { name: 'Enterprise Label', width: 76, height: 42 },
    ])
    expect(store.getPaperPreset('A4')).toBeUndefined()
  })

  it('applies the configured default paper only when the input has no explicit page size', () => {
    const runtimeConfig = {
      paper: {
        mode: 'replace' as const,
        presets: [{ name: 'Enterprise Label', width: 76, height: 42 }],
        defaultPreset: 'Enterprise Label',
      },
    }

    const defaulted = new DesignerStore(undefined, undefined, undefined, runtimeConfig)
    const explicit = new DesignerStore({ page: { width: 90 } }, undefined, undefined, runtimeConfig)

    expect(defaulted.schema.page).toMatchObject({
      width: 76,
      height: 42,
      pageModel: { paper: { width: 76, height: 42 } },
    })
    expect(explicit.schema.page).toMatchObject({
      width: 90,
      height: 297,
      pageModel: { paper: { width: 90, height: 297 } },
    })
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

  it('registers materials, catalog groups, and cached designer extensions', () => {
    const store = new DesignerStore()
    const definition = createMaterialDefinition('sample')
    const factory = vi.fn(() => ({ renderContent: () => () => {} }))

    store.registerMaterial(definition)
    store.registerCatalogGroup({
      id: 'basic',
      label: 'materials.catalog.basic',
      items: [{
        id: 'basic-sample',
        groupId: 'basic',
        label: 'Sample',
        icon: definition.icon,
        materialType: 'sample',
      }],
    })
    store.registerDesignerFactory('sample', factory)

    expect(store.getMaterial('sample')).toMatchObject({ type: 'sample', name: 'Sample' })
    expect(store.getCatalogGroups()).toHaveLength(1)
    expect(store.getCatalogGroups()[0]?.items).toHaveLength(1)
    expect(store.getCatalog()).toHaveLength(1)
    expect(store.getDesignerExtension('sample')).toBe(store.getDesignerExtension('sample'))
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('returns a stable loading extension while a lazy designer factory loads', async () => {
    const store = new DesignerStore()
    const factory = vi.fn(() => ({ renderContent: () => () => {} }))
    store.registerLazyDesignerFactory('lazy-sample', () => Promise.resolve(factory))

    const loading = store.getDesignerExtension('lazy-sample')

    expect(loading).toBe(store.getDesignerExtension('lazy-sample'))
    expect(factory).not.toHaveBeenCalled()

    await Promise.resolve()
    await Promise.resolve()

    expect(store.getDesignerExtension('lazy-sample')).toBe(store.getDesignerExtension('lazy-sample'))
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

  it('registers bundle and material locale messages from material bundles', () => {
    const store = new DesignerStore()

    store.setLocale({}, 'en-US')
    const unregister = registerMaterialBundle(store, {
      localeMessages: {
        messages: { bundle: { title: 'Bundle Default' } },
        locales: {
          'en-US': { bundle: { title: 'Bundle Title' } },
        },
      },
      materials: [{
        type: 'sample',
        name: 'materials.sample.name',
        icon: { render: () => null },
        category: 'basic',
        capabilities: {},
        binding: { kind: 'none' },
        createDefaultNode: input => createNode(input?.id ?? 'sample-1'),
        factory: vi.fn(() => ({ renderContent: () => () => {} })),
        propSchemas: [
          { key: 'label', label: 'materials.sample.property.label', type: 'string' },
        ],
        localeMessages: {
          messages: {
            materials: {
              sample: {
                name: 'Sample Default',
                property: { label: 'Label Default' },
              },
            },
          },
          locales: {
            'en-US': {
              materials: {
                sample: {
                  name: 'Sample',
                  property: { label: 'Label' },
                },
              },
            },
          },
        },
      }],
      catalogs: [{
        id: 'basic',
        label: 'materials.catalog.basic',
        items: [{ type: 'sample' }],
      }],
    })

    expect(store.t('bundle.title')).toBe('Bundle Title')
    expect(store.t('materials.sample.name')).toBe('Sample')
    expect(store.t('materials.sample.property.label')).toBe('Label')
    expect(store.getMaterial('sample')?.props.map(schema => schema.label)).toEqual(['materials.sample.property.label'])

    unregister()

    expect(store.t('bundle.title')).toBe('bundle.title')
    expect(store.t('materials.sample.name')).toBe('materials.sample.name')
  })

  it('unwinds overlapping material bundle registrations without removing later owners', () => {
    const store = new DesignerStore()
    const first = registerMaterialBundle(store, createBundle('sample', 'First'))
    const second = registerMaterialBundle(store, createBundle('sample', 'Second'))

    expect(store.getMaterial('sample')?.name).toBe('Second')
    expect(store.getCatalog()).toHaveLength(1)
    expect(store.getCatalog()[0]?.label).toBe('Second')

    first()
    expect(store.getMaterial('sample')?.name).toBe('Second')

    second()
    expect(store.getMaterial('sample')).toBeUndefined()
    expect(store.getDesignerExtension('sample')).toBeUndefined()
    expect(store.getCatalog()).toEqual([])
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
    binding: { kind: 'none' },
    props: [],
    createDefaultNode: input => ({
      id: input?.id ?? 'sample-1',
      type,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
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
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function createBundle(type: string, name: string): DesignerMaterialBundle {
  const definition = createMaterialDefinition(type)
  return {
    materials: [{
      ...definition,
      name,
      factory: () => ({ renderContent: () => () => {} }),
    }],
    catalogs: [{
      id: 'basic',
      label: 'Basic',
      items: [{ id: `basic-${type}`, type, label: name }],
    }],
  }
}
