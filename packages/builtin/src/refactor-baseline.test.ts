import type { PanelSectionId } from '@easyink/plugin-api/designer'
import type { LocaleDeclaration, LocaleTree } from '@easyink/plugin-api/material'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import { resolveMaterialConditionCapability } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { DesignerStore } from '../../designer/src/store/designer-store'
import { materials as allDesigner } from './all/designer'
import { materials as allViewer } from './all/viewer'
import { materials as basicDesigner } from './basic/designer'
import { materials as basicViewer } from './basic/viewer'
import { materials as none } from './none'

const basicTypes = [
  'text',
  'image',
  'barcode',
  'qrcode',
  'line',
  'rect',
  'ellipse',
  'table-static',
  'table-data',
  'flow-row',
  'ring-progress',
  'progress',
  'rating',
  'svg',
  'svg-star',
  'svg-heart',
  'page-number',
]
const sectionIds: PanelSectionId[] = ['geometry', 'props', 'overlay', 'binding', 'condition', 'visibility']

// Normalize the shared table words now carried by complete table materials to
// the old snapshot shape. The frozen G0 snapshots themselves remain unchanged.
function materialLocale(locale: LocaleDeclaration | undefined): LocaleDeclaration | undefined {
  function withoutTable(tree: LocaleTree) {
    if (!tree.materials)
      return tree
    const { table: _table, ...materials } = tree.materials as LocaleTree
    return { ...tree, materials }
  }
  return locale && {
    messages: locale.messages && withoutTable(locale.messages),
    locales: Object.fromEntries(Object.entries(locale.locales ?? {}).map(([code, tree]) => [code, withoutTable(tree)])),
  }
}

function viewerFeatures(material: ViewerMaterial) {
  const implementation = material.renderer!
  return 'createSession' in implementation
    ? implementation.createSession({ signal: new AbortController().signal, onDispose: () => {} })
    : implementation
}

describe('g0 builtin capability baseline', () => {
  it('freezes all 25, basic 17, none and the separate basic entry', async () => {
    expect(allDesigner).toHaveLength(25)
    expect(allViewer).toHaveLength(25)
    expect(basicDesigner.map(material => material.model.type)).toEqual(basicTypes)
    expect(basicViewer.map(material => material.model.type)).toEqual(basicTypes)
    expect(none).toEqual([])
    const catalogs: Record<string, unknown> = {}
    for (const [set, materials] of Object.entries({ all: allDesigner, basic: basicDesigner, none })) {
      const store = await DesignerStore.create({ materials })
      try {
        catalogs[set] = store.getCatalogGroups().map(group => ({
          id: group.id,
          label: group.label,
          order: group.order,
          items: group.items.map(item => ({ type: item.materialType })),
        }))
      }
      finally {
        await store.destroy()
      }
    }
    expect({
      designer: allDesigner.map(material => material.model.type),
      viewer: allViewer.map(material => material.model.type),
      catalogs,
    }).toMatchSnapshot()
  })

  it.each(['mm', 'pt', 'px'])('freezes default nodes and partial-input merge semantics in %s', (unit) => {
    expect(allDesigner.map(({ model }) => {
      const defaults = model.createDefaultNode({ id: `baseline-${model.type}` }, unit)
      const merged = model.createDefaultNode({ id: `merged-${model.type}`, x: 7, props: { custom: { keep: true } } }, unit)
      return { type: model.type, defaults, merged }
    })).toMatchSnapshot()
  })

  it('freezes binding, condition/pageAware, property schemas, locale and AI descriptors', async () => {
    const stores = await Promise.all(['zh-CN', 'en-US'].map(code => DesignerStore.create({ materials: allDesigner, locale: { code } })))
    try {
      const table = allDesigner.find(material => material.model.type === 'table-data')!.locale!
      function words(tree: LocaleTree | undefined) {
        return (tree?.materials as LocaleTree | undefined)?.table
      }
      function catalog(store: DesignerStore) {
        return Object.fromEntries(store.getCatalogGroups().map(group => [group.id, store.t(group.label)]))
      }
      expect({
        designer: allDesigner.map(material => ({
          type: material.model.type,
          name: material.ui!.palette![0]!.label,
          category: material.ui!.palette![0]!.group.id,
          capabilities: material.model.capabilities,
          binding: material.model.binding,
          condition: resolveMaterialConditionCapability(material.model.condition),
          propSchemas: material.properties,
          localeMessages: materialLocale(material.locale),
          aiDescriptor: material.ai,
          lazy: !!material.loadRenderer,
          sections: sectionIds.filter(id => !material.sectionFilter || material.sectionFilter(id, { node: material.model.createDefaultNode(), isEditing: false })),
        })),
        viewer: allViewer.map(material => ({
          type: material.model.type,
          binding: material.model.binding,
          condition: resolveMaterialConditionCapability(material.model.condition),
          pageAware: material.model.pageAware ?? false,
          measure: !!viewerFeatures(material).measure,
          getRenderSize: !!viewerFeatures(material).getRenderSize,
          fragmentPaginator: !!viewerFeatures(material).fragmentPaginator,
        })),
        bundleLocale: {
          messages: { materials: { table: words(table.messages), catalog: catalog(stores[0]!) } },
          locales: {
            'zh-CN': { materials: { table: words(table.locales?.['zh-CN']), catalog: catalog(stores[0]!) } },
            'en-US': { materials: { table: words(table.locales?.['en-US']), catalog: catalog(stores[1]!) } },
          },
        },
      }).toMatchSnapshot()
    }
    finally {
      await Promise.all(stores.map(store => store.destroy()))
    }
  })
})
