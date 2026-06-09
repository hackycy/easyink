import { describe, expect, it } from 'vitest'
import { builtinDesignerMaterialBundle } from './designer'

describe('builtin designer material bundle', () => {
  it('exposes every grouped catalog entry as a registered material', () => {
    const materialTypes = new Set(builtinDesignerMaterialBundle.materials.map(material => material.type))

    for (const entry of builtinDesignerMaterialBundle.groupedCatalog)
      expect(materialTypes.has(entry.type)).toBe(true)
  })

  it('shows scatter chart in the chart catalog group', () => {
    expect(builtinDesignerMaterialBundle.groupedCatalog).toContainEqual({
      type: 'chart-scatter',
      group: 'chart',
    })
  })

  it('shows gauge chart in the chart catalog group', () => {
    expect(builtinDesignerMaterialBundle.groupedCatalog).toContainEqual({
      type: 'chart-gauge',
      group: 'chart',
    })
  })

  it('shows radar chart in the chart catalog group', () => {
    expect(builtinDesignerMaterialBundle.groupedCatalog).toContainEqual({
      type: 'chart-radar',
      group: 'chart',
    })
  })

  it('shows ring progress in the data catalog group with custom-only formatting', () => {
    expect(builtinDesignerMaterialBundle.groupedCatalog).toContainEqual({
      type: 'ring-progress',
      group: 'data',
    })

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
    expect(builtinDesignerMaterialBundle.groupedCatalog).toContainEqual({
      type: 'progress',
      group: 'data',
    })

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
    expect(builtinDesignerMaterialBundle.groupedCatalog).toContainEqual({
      type: 'rating',
      group: 'data',
    })

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
    expect(builtinDesignerMaterialBundle.groupedCatalog).toContainEqual({
      type: 'chart-custom',
      group: 'chart',
    })

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
