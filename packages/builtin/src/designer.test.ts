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
