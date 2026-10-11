import type { BuiltinPanelSectionId } from './types'
import { resolveMaterialConditionCapability } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { builtinDesignerMaterialBundle as basicDesigner, builtinViewerMaterialBundle as basicViewer } from './basic'
import { builtinDesignerMaterialSets } from './designer'
import { builtinViewerMaterialSets } from './viewer'

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
const sectionIds: BuiltinPanelSectionId[] = ['geometry', 'props', 'overlay', 'binding', 'condition', 'visibility']

describe('g0 builtin capability baseline', () => {
  it('freezes all 25, basic 17, none and the separate basic entry', () => {
    expect(builtinDesignerMaterialSets.all.materials).toHaveLength(25)
    expect(builtinViewerMaterialSets.all.materials).toHaveLength(25)
    expect(builtinDesignerMaterialSets.basic.materials.map(material => material.type)).toEqual(basicTypes)
    expect(builtinViewerMaterialSets.basic.materials.map(material => material.type)).toEqual(basicTypes)
    expect(basicDesigner.materials.map(material => material.type)).toEqual(basicTypes)
    expect(basicViewer.materials.map(material => material.type)).toEqual(basicTypes)
    expect(builtinDesignerMaterialSets.none).toEqual({ materials: [], catalogs: [] })
    expect(builtinViewerMaterialSets.none).toEqual({ materials: [] })
    expect({
      designer: builtinDesignerMaterialSets.all.materials.map(material => material.type),
      viewer: builtinViewerMaterialSets.all.materials.map(material => material.type),
      catalogs: Object.fromEntries(Object.entries(builtinDesignerMaterialSets).map(([set, bundle]) => [set, bundle.catalogs])),
    }).toMatchSnapshot()
  })

  it.each(['mm', 'pt', 'px'])('freezes default nodes and partial-input merge semantics in %s', (unit) => {
    expect(builtinDesignerMaterialSets.all.materials.map((material) => {
      const defaults = material.createDefaultNode({ id: `baseline-${material.type}` }, unit)
      const merged = material.createDefaultNode({ id: `merged-${material.type}`, x: 7, props: { custom: { keep: true } } }, unit)
      return { type: material.type, defaults, merged }
    })).toMatchSnapshot()
  })

  it('freezes binding, condition/pageAware, property schemas, locale and AI descriptors', () => {
    expect({
      designer: builtinDesignerMaterialSets.all.materials.map(material => ({
        type: material.type,
        name: material.name,
        category: material.category,
        capabilities: material.capabilities,
        binding: material.binding,
        condition: resolveMaterialConditionCapability(material.condition),
        propSchemas: material.propSchemas,
        localeMessages: material.localeMessages,
        aiDescriptor: material.aiDescriptor,
        lazy: !!material.lazyFactory,
        sections: sectionIds.filter(id => !material.sectionFilter || material.sectionFilter(id)),
      })),
      viewer: builtinViewerMaterialSets.all.materials.map(material => ({
        type: material.type,
        binding: material.binding,
        condition: resolveMaterialConditionCapability(material.extension.condition),
        pageAware: material.extension.pageAware ?? false,
        measure: !!material.extension.measure,
        getRenderSize: !!material.extension.getRenderSize,
        fragmentPaginator: !!material.extension.fragmentPaginator,
      })),
      bundleLocale: builtinDesignerMaterialSets.all.localeMessages,
    }).toMatchSnapshot()
  })
})
