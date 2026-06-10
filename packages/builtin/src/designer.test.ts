import { IconFilePen, IconSignature } from '@easyink/icons'
import { describe, expect, it } from 'vitest'
import { builtinDesignerMaterialSets, createBuiltinDesignerMaterialBundle } from './designer'

const builtinDesignerMaterialBundle = createBuiltinDesignerMaterialBundle('all')

function catalogItemTypes(groupId: string, bundle = builtinDesignerMaterialBundle): string[] {
  return bundle.catalogs.find(group => group.id === groupId)?.items.map(item => item.type) ?? []
}

describe('builtin designer material bundle', () => {
  it('exposes all, basic, and none material sets', () => {
    expect(builtinDesignerMaterialSets.all.materials.length).toBeGreaterThan(0)
    expect(builtinDesignerMaterialSets.basic.materials.map(material => material.type)).toContain('table-static')
    expect(builtinDesignerMaterialSets.basic.materials.map(material => material.type)).toContain('svg')
    expect(builtinDesignerMaterialSets.basic.materials.some(material => material.category === 'chart')).toBe(false)
    expect(builtinDesignerMaterialSets.basic.materials.map(material => material.type)).not.toContain('signature')
    expect(catalogItemTypes('basic', builtinDesignerMaterialSets.basic)).not.toContain('signature')
    expect(builtinDesignerMaterialSets.basic.catalogs.map(group => group.id)).not.toContain('chart')
    expect(builtinDesignerMaterialSets.none).toEqual({
      materials: [],
      catalogs: [],
    })
  })

  it('exposes every catalog entry as a registered material', () => {
    const materialTypes = new Set(builtinDesignerMaterialBundle.materials.map(material => material.type))

    for (const group of builtinDesignerMaterialBundle.catalogs) {
      for (const entry of group.items)
        expect(materialTypes.has(entry.type)).toBe(true)
    }
  })

  it('shows scatter chart in the chart catalog group', () => {
    expect(catalogItemTypes('chart')).toContain('chart-scatter')
  })

  it('shows gauge chart in the chart catalog group', () => {
    expect(catalogItemTypes('chart')).toContain('chart-gauge')
  })

  it('shows signature as a non-bindable basic quick material', () => {
    const material = builtinDesignerMaterialBundle.materials.find(item => item.type === 'signature')

    expect(catalogItemTypes('basic')).toContain('signature')
    expect(material?.category).toBe('basic')
    expect(material?.binding).toEqual({ kind: 'none' })
    expect(material?.capabilities.bindable).toBe(false)
    expect(material?.capabilities.rotatable).toBe(false)
    expect(material?.icon).toBe(IconSignature)
    expect(material?.icon).not.toBe(IconFilePen)
    expect(material?.propSchemas?.map(schema => schema.key)).toEqual(['backgroundColor', 'penColor'])
  })

  it('shows radar chart in the chart catalog group', () => {
    expect(catalogItemTypes('chart')).toContain('chart-radar')
  })

  it('shows ring progress in the data catalog group with custom-only formatting', () => {
    expect(catalogItemTypes('data')).toContain('ring-progress')

    const material = builtinDesignerMaterialBundle.materials.find(item => item.type === 'ring-progress')

    expect(material?.category).toBe('data')
    expect(material?.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'value',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.icon).toBeDefined()
    expect(material?.icon).not.toBe(builtinDesignerMaterialBundle.materials.find(item => item.type === 'chart-gauge')?.icon)
    expect(material?.icon).not.toBe(builtinDesignerMaterialBundle.materials.find(item => item.type === 'ellipse')?.icon)
  })

  it('shows progress in the data catalog group with custom-only formatting and a distinct icon', () => {
    expect(catalogItemTypes('data')).toContain('progress')

    const material = builtinDesignerMaterialBundle.materials.find(item => item.type === 'progress')
    const ringProgress = builtinDesignerMaterialBundle.materials.find(item => item.type === 'ring-progress')

    expect(material?.category).toBe('data')
    expect(material?.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'value',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.icon).toBeDefined()
    expect(material?.icon).not.toBe(ringProgress?.icon)
    expect(material?.icon).not.toBe(builtinDesignerMaterialBundle.materials.find(item => item.type === 'chart-bar')?.icon)
  })

  it('shows rating in the data catalog group with custom-only value binding', () => {
    expect(catalogItemTypes('data')).toContain('rating')

    const material = builtinDesignerMaterialBundle.materials.find(item => item.type === 'rating')

    expect(material?.category).toBe('data')
    expect(material?.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'value',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.capabilities.bindable).toBe(true)
    expect(material?.aiDescriptor?.binding).toBe('single')
    expect(material?.icon).toBeDefined()
    expect(builtinDesignerMaterialBundle.materials.filter(item => item.type !== 'rating').map(item => item.icon)).not.toContain(material?.icon)
  })

  it('shows custom ECharts in the chart catalog group with a distinct icon', () => {
    expect(catalogItemTypes('chart')).toContain('chart-custom')

    const chartCustom = builtinDesignerMaterialBundle.materials.find(item => item.type === 'chart-custom')
    const chartMaterialIcons = builtinDesignerMaterialBundle.materials
      .filter(item => item.category === 'chart' && item.type !== 'chart-custom')
      .map(item => item.icon)

    expect(chartCustom?.icon).toBeDefined()
    expect(chartMaterialIcons).not.toContain(chartCustom?.icon)
  })

  it('registers custom svg as an ordinary bindable material', () => {
    const material = builtinDesignerMaterialBundle.materials.find(item => item.type === 'svg')

    expect(material?.capabilities.bindable).toBe(true)
    expect(material?.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'content',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.aiDescriptor?.binding).toBe('single')
  })

  it('limits structured chart material data formatting to custom formatters', () => {
    const chartMaterials = builtinDesignerMaterialBundle.materials.filter(material => material.category === 'chart')

    expect(chartMaterials.map(material => material.type).sort()).toEqual([
      'chart-bar',
      'chart-custom',
      'chart-gauge',
      'chart-line',
      'chart-pie',
      'chart-radar',
      'chart-scatter',
    ])
    for (const material of chartMaterials.filter(item => item.type !== 'chart-custom'))
      expect(material.binding).toMatchObject({ kind: 'data-contract', formatEditor: { tabs: ['custom'], defaultTab: 'custom' } })
  })

  it('registers custom ECharts as an ordinary option-bound lazy material', () => {
    const material = builtinDesignerMaterialBundle.materials.find(item => item.type === 'chart-custom')

    expect(material?.capabilities.bindable).toBe(true)
    expect(material?.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'option',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    })
    expect(material?.lazyFactory).toEqual(expect.any(Function))
    expect(material?.aiDescriptor?.binding).toBe('single')
  })
})
