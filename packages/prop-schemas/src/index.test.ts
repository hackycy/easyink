import { describe, expect, it } from 'vitest'
import { getPropSchemas, groupPropSchemas } from './index'

describe('designer prop schemas', () => {
  it('returns built-in material schemas with shared stack layout schemas', () => {
    const schemas = getPropSchemas('text')

    expect(schemas.map(schema => schema.key)).toContain('content')
    expect(schemas.map(schema => schema.key)).toContain('layoutMode')
  })

  it('exposes the text layout model instead of the legacy autoWrap control', () => {
    const keys = getPropSchemas('text').map(schema => schema.key)

    expect(keys).toContain('heightMode')
    expect(keys).toContain('wrapMode')
    expect(keys).toContain('minHeight')
    expect(keys).toContain('maxHeight')
    expect(keys).not.toContain('autoWrap')
  })

  it('keeps text auto-height constraints nullable in the editor', () => {
    const schemas = getPropSchemas('text')
    const minHeight = schemas.find(schema => schema.key === 'minHeight')
    const maxHeight = schemas.find(schema => schema.key === 'maxHeight')

    expect(minHeight).toMatchObject({ default: null, nullable: true })
    expect(maxHeight).toMatchObject({ default: null, nullable: true })
  })

  it('returns shared stack layout schemas for unknown material types', () => {
    expect(getPropSchemas('unknown-material').map(schema => schema.key)).toEqual([
      'layoutMode',
      'keepTogether',
      'pageBreakBefore',
      'pageBreakAfter',
    ])
  })

  it('groups schemas by their configured group', () => {
    const groups = groupPropSchemas([
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'color', label: 'Color', type: 'color', group: 'appearance' },
    ])

    expect(groups.get('general')?.map(schema => schema.key)).toEqual(['title'])
    expect(groups.get('appearance')?.map(schema => schema.key)).toEqual(['color'])
  })
})
