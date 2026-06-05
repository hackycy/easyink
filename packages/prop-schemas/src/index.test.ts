import { describe, expect, it } from 'vitest'
import { createLayoutBehaviorPropSchemas, groupPropSchemas } from './index'

describe('designer prop schemas', () => {
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
