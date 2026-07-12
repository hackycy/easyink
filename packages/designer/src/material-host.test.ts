import type { MaterialDesignerFacet, MaterialExtensionContext } from '@easyink/core'
import { compileMaterialProfile, defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { builtinCatalogGroupLabels, builtinMaterialIcons, prepareDesignerMaterialBundle } from './material-host'

describe('designer builtin material host metadata', () => {
  it('owns every builtin icon and catalog label outside the manifest package', () => {
    expect(Object.keys(builtinMaterialIcons).sort()).toEqual([
      'barcode',
      'chart-bar',
      'chart-custom',
      'chart-gauge',
      'chart-line',
      'chart-pie',
      'chart-radar',
      'chart-scatter',
      'ellipse',
      'flow-row',
      'image',
      'line',
      'page-number',
      'progress',
      'qrcode',
      'rating',
      'rect',
      'ring-progress',
      'signature',
      'svg-custom',
      'svg-heart',
      'svg-star',
      'table',
      'table-data',
      'text',
    ])
    expect(builtinCatalogGroupLabels).toEqual({
      basic: 'materials.catalog.basic',
      data: 'materials.catalog.data',
      chart: 'materials.catalog.chart',
      svg: 'materials.catalog.svg',
      utility: 'materials.catalog.utility',
    })
  })

  it('prepares basic, all, and none profiles from their manifest designer facets', async () => {
    const first = manifest('first', 10)
    const second = manifest('second', 20)
    const basic = profile('basic', [first])
    const all = profile('all', [first, second])
    const none = profile('none', [])

    const [basicPrepared, allPrepared, nonePrepared] = await Promise.all([
      prepareDesignerMaterialBundle(basic, {} as MaterialExtensionContext),
      prepareDesignerMaterialBundle(all, {} as MaterialExtensionContext),
      prepareDesignerMaterialBundle(none, {} as MaterialExtensionContext),
    ])

    expect(basicPrepared.bundle.materials.map(item => item.type)).toEqual(['first'])
    expect(allPrepared.bundle.materials.map(item => item.type).sort()).toEqual(['first', 'second'])
    expect(nonePrepared.bundle.materials).toEqual([])
    expect(new Set(allPrepared.bundle.materials.map(item => item.type)).size).toBe(2)
    expect(allPrepared.manifests).toHaveLength(2)
    expect(allPrepared.manifests[0]).toBe(all.getManifest('first'))
    expect(allPrepared.manifests[1]).toBe(all.getManifest('second'))
    expect(allPrepared.bundle.catalogs.flatMap(group => group.items).map(item => item.order)).toEqual([10, 20])
  })

  it('preserves facet activation and disposal failure semantics', async () => {
    const dispose = vi.fn(async () => {
      throw new Error('dispose failed')
    })
    const good = standardManifest('good', 1, dispose)
    const bad = createTestMaterialManifest({
      type: 'bad',
      designer: () => { throw new Error('prepare failed') },
    })
    const prepared = await prepareDesignerMaterialBundle(profile('lifecycle', [good, bad]), {} as MaterialExtensionContext)

    expect(prepared.bundle.materials.map(item => item.type)).toEqual(['good'])
    expect(prepared.diagnostics).toMatchObject([{ code: 'MATERIAL_FACET_ACTIVATION_FAILED', materialType: 'bad' }])
    const diagnostics = await prepared.dispose()
    expect(diagnostics).toMatchObject([{ code: 'MATERIAL_FACET_DISPOSE_FAILED', materialType: 'good' }])
    await expect(prepared.dispose()).resolves.toBe(diagnostics)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})

function manifest(type: string, order: number) {
  return createTestMaterialManifest({ type, designer: () => facet(order) })
}

function facet(order: number, extension: Record<string, unknown> = {}): MaterialDesignerFacet {
  return {
    extension: extension as never,
    catalog: { group: 'basic', order },
    localeMessages: { messages: { material: order } },
  }
}

function profile(id: string, manifests: ReturnType<typeof createTestMaterialManifest>[]) {
  return compileMaterialProfile({
    id,
    engineVersion: '0.0.30',
    packages: [{ packageId: `@easyink/test-${id}`, kind: 'builtin', required: true, manifests }],
  })
}

function standardManifest(type: string, order: number, dispose: () => Promise<void>) {
  return defineStandardMaterialManifest({
    type,
    nameKey: `materials.${type}.name`,
    category: 'basic',
    iconKey: 'box',
    catalogOrder: order,
    defaultNode: {
      id: type,
      type,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      modelVersion: 1,
      model: {},
      bindings: {},
    },
    interaction: { rotatable: true, resizable: true },
    binding: { kind: 'none' },
    layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
    properties: [],
    schemaAdapter: recordSchemaAdapter(1),
    designerFactory: () => ({ renderContent: () => () => {}, dispose }),
    viewerExtension: { render: () => ({ tree: { type: 'text', value: '' } }) },
    aiDescriptor: {},
    generation: { enabled: false },
  })
}
