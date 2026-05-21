import { describe, expect, it } from 'vitest'
import { createLayoutBehaviorPropSchemas, getPropSchemas, groupPropSchemas } from './index'

describe('designer prop schemas', () => {
  it('returns built-in material schemas without page-context behavior schemas', () => {
    const schemas = getPropSchemas('text')

    expect(schemas.map(schema => schema.key)).toContain('content')
    expect(schemas.map(schema => schema.key)).not.toContain('placement.mode')
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

  it('creates page-context behavior schemas for auto-paged flow documents', () => {
    const schemas = createLayoutBehaviorPropSchemas({
      page: {
        mode: 'fixed',
        width: 210,
        height: 297,
        layout: { strategy: 'stack-flow', flowAxis: 'y' },
        reflow: { strategy: 'flow-y' },
        pagination: { strategy: 'auto-sheets' },
      },
    })

    expect(schemas.map(schema => schema.key)).toEqual([
      'placement.mode',
      'break.keepTogether',
      'break.before',
      'break.after',
      'repeat.scope',
    ])
  })

  it('keeps repeat visible for fixed-sheet documents without flow controls', () => {
    const schemas = createLayoutBehaviorPropSchemas({
      page: {
        mode: 'fixed',
        width: 210,
        height: 297,
        layout: { strategy: 'absolute' },
        reflow: { strategy: 'measure-only' },
        pagination: { strategy: 'fixed-sheets' },
      },
    })

    expect(schemas.map(schema => schema.key)).toEqual(['repeat.scope'])
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
