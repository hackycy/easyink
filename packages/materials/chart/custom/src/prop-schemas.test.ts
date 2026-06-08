import { describe, expect, it } from 'vitest'
import { chartCustomDesignerPropSchemas } from './prop-schemas'

describe('chart custom designer prop schemas', () => {
  it('shows configuration only when no datasource binding is active', () => {
    const optionCode = chartCustomDesignerPropSchemas.find(schema => schema.key === 'optionCode')

    expect(chartCustomDesignerPropSchemas.some(schema => schema.key === 'optionMode')).toBe(false)
    expect(optionCode?.label).toBe('materials.chartCustom.property.optionCode')
    expect(optionCode?.visible?.({ __hasBinding: false })).toBe(true)
    expect(optionCode?.visible?.({ __hasBinding: true })).toBe(false)
  })
})
