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
})
