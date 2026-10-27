import { IconFilePen, IconSignature } from '@easyink/icons'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DesignerStore } from '../../designer/src/store/designer-store'
import { materials } from './all/designer'
import { materials as basic } from './basic/designer'
import { materials as none } from './none'

let store: DesignerStore
let basicStore: DesignerStore
beforeAll(async () => {
  store = await DesignerStore.create({ materials })
  basicStore = await DesignerStore.create({ materials: basic })
})
afterAll(async () => {
  await Promise.all([store.destroy(), basicStore.destroy()])
})

function catalogItemTypes(groupId: string, host = store): string[] {
  return host.getCatalogGroups().find(group => group.id === groupId)?.items.map(item => item.materialType) ?? []
}

describe('builtin complete Designer materials', () => {
  it('exposes all, basic, and none material sets', () => {
    expect(materials.length).toBeGreaterThan(0)
    expect(basic.map(material => material.model.type)).toContain('table-static')
    expect(basic.map(material => material.model.type)).toContain('svg')
    expect(basic.some(material => material.ui?.palette?.[0]?.group.id === 'chart')).toBe(false)
    expect(basic.map(material => material.model.type)).not.toContain('signature')
    expect(catalogItemTypes('basic', basicStore)).not.toContain('signature')
    expect(basicStore.getCatalogGroups().map(group => group.id)).not.toContain('chart')
    expect(none).toEqual([])
  })

  it('exposes every catalog entry as a registered material', () => {
    const materialTypes = new Set(materials.map(material => material.model.type))

    for (const group of store.getCatalogGroups()) {
      for (const entry of group.items)
        expect(materialTypes.has(entry.materialType)).toBe(true)
    }
  })

  it('shows scatter chart in the chart catalog group', () => {
    expect(catalogItemTypes('chart')).toContain('chart-scatter')
  })

  it('shows gauge chart in the chart catalog group', () => {
    expect(catalogItemTypes('chart')).toContain('chart-gauge')
  })

  it('shows signature as a non-bindable basic quick material', () => {
    const material = materials.find(item => item.model.type === 'signature')

    expect(catalogItemTypes('basic')).toContain('signature')
    expect(material?.ui?.palette?.[0]?.group.id).toBe('basic')
    expect(material?.model.binding).toEqual({ kind: 'none' })
    expect(material?.model.binding.kind).toBe('none')
    expect(material?.model.capabilities?.rotatable).toBe(false)
    expect(material?.ui?.palette?.[0]?.icon).toBe(IconSignature)
    expect(material?.ui?.palette?.[0]?.icon).not.toBe(IconFilePen)
    expect(material?.properties?.map(schema => schema.key)).toEqual(['backgroundColor', 'penColor'])
  })

  it('shows radar chart in the chart catalog group', () => {
    expect(catalogItemTypes('chart')).toContain('chart-radar')
  })

  it('shows ring progress in the data catalog group with custom-only formatting', () => {
    expect(catalogItemTypes('data')).toContain('ring-progress')

    const material = materials.find(item => item.model.type === 'ring-progress')

    expect(material?.ui?.palette?.[0]?.group.id).toBe('data')
    expect(material?.model.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'value',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.ui?.palette?.[0]?.icon).toBeDefined()
    expect(material?.ui?.palette?.[0]?.icon).not.toBe(materials.find(item => item.model.type === 'chart-gauge')?.ui?.palette?.[0]?.icon)
    expect(material?.ui?.palette?.[0]?.icon).not.toBe(materials.find(item => item.model.type === 'ellipse')?.ui?.palette?.[0]?.icon)
  })

  it('shows progress in the data catalog group with custom-only formatting and a distinct icon', () => {
    expect(catalogItemTypes('data')).toContain('progress')

    const material = materials.find(item => item.model.type === 'progress')
    const ringProgress = materials.find(item => item.model.type === 'ring-progress')

    expect(material?.ui?.palette?.[0]?.group.id).toBe('data')
    expect(material?.model.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'value',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.ui?.palette?.[0]?.icon).toBeDefined()
    expect(material?.ui?.palette?.[0]?.icon).not.toBe(ringProgress?.ui?.palette?.[0]?.icon)
    expect(material?.ui?.palette?.[0]?.icon).not.toBe(materials.find(item => item.model.type === 'chart-bar')?.ui?.palette?.[0]?.icon)
  })

  it('shows rating in the data catalog group with custom-only value binding', () => {
    expect(catalogItemTypes('data')).toContain('rating')

    const material = materials.find(item => item.model.type === 'rating')

    expect(material?.ui?.palette?.[0]?.group.id).toBe('data')
    expect(material?.model.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'value',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.model.binding.kind).not.toBe('none')
    expect(material?.ai?.binding).toBe('single')
    expect(material?.ui?.palette?.[0]?.icon).toBeDefined()
    expect(materials.filter(item => item.model.type !== 'rating').map(item => item.ui?.palette?.[0]?.icon)).not.toContain(material?.ui?.palette?.[0]?.icon)
  })

  it('shows custom ECharts in the chart catalog group with a distinct icon', () => {
    expect(catalogItemTypes('chart')).toContain('chart-custom')

    const chartCustom = materials.find(item => item.model.type === 'chart-custom')
    const chartMaterialIcons = materials
      .filter(item => item.ui?.palette?.[0]?.group.id === 'chart' && item.model.type !== 'chart-custom')
      .map(item => item.ui?.palette?.[0]?.icon)

    expect(chartCustom?.ui?.palette?.[0]?.icon).toBeDefined()
    expect(chartMaterialIcons).not.toContain(chartCustom?.ui?.palette?.[0]?.icon)
  })

  it('registers custom svg as an ordinary bindable material', () => {
    const material = materials.find(item => item.model.type === 'svg')

    expect(material?.model.binding.kind).not.toBe('none')
    expect(material?.model.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'content',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.ai?.binding).toBe('single')
  })

  it('limits structured chart material data formatting to custom formatters', () => {
    const chartMaterials = materials.filter(material => material.ui?.palette?.[0]?.group.id === 'chart')

    expect(chartMaterials.map(material => material.model.type).sort()).toEqual([
      'chart-bar',
      'chart-custom',
      'chart-gauge',
      'chart-line',
      'chart-pie',
      'chart-radar',
      'chart-scatter',
    ])
    for (const material of chartMaterials.filter(item => item.model.type !== 'chart-custom'))
      expect(material.model.binding).toMatchObject({ kind: 'data-contract', formatEditor: { tabs: ['custom'], defaultTab: 'custom' } })
  })

  it('registers custom ECharts as an ordinary option-bound lazy material', () => {
    const material = materials.find(item => item.model.type === 'chart-custom')

    expect(material?.model.binding.kind).not.toBe('none')
    expect(material?.model.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'option',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.loadRenderer).toEqual(expect.any(Function))
    expect(material?.ai?.binding).toBe('single')
  })
})
