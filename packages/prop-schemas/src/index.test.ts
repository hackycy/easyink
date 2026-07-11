import { validatePropertyDescriptors } from '@easyink/core'
import { create } from 'mutative'
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

  it('reads and writes output behavior through declared accessors', () => {
    const schemas = createLayoutBehaviorPropSchemas({
      page: {
        layout: { strategy: 'stack-flow' },
        reflow: { strategy: 'flow-y' },
        pagination: { strategy: 'auto-sheets' },
      },
    })
    const node = {
      id: 'node-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' as const },
    }
    const placement = schemas.find(schema => schema.key === 'placement.mode')!
    const keepTogether = schemas.find(schema => schema.key === 'break.keepTogether')!
    const repeat = schemas.find(schema => schema.key === 'repeat.scope')!

    expect(placement.accessor?.paths).toEqual(['/output/placement'])
    expect(keepTogether.accessor?.paths).toEqual(['/output/break'])
    expect(repeat.accessor?.paths).toEqual(['/output/repeat'])

    placement.accessor?.write(node, 'fixed')
    keepTogether.accessor?.write(node, true)
    repeat.accessor?.write(node, true)

    expect(placement.accessor?.read(node)).toBe('fixed')
    expect(keepTogether.accessor?.read(node)).toBe(true)
    expect(repeat.accessor?.read(node)).toBe(true)
    expect(node.output).toMatchObject({
      placement: { mode: 'fixed' },
      break: { keepTogether: true },
      repeat: { scope: 'every-output-page' },
    })
  })

  it('emits patches only below each declared output path and preserves siblings', () => {
    const schemas = createLayoutBehaviorPropSchemas({
      page: {
        layout: { strategy: 'stack-flow' },
        reflow: { strategy: 'flow-y' },
        pagination: { strategy: 'auto-sheets' },
      },
    })
    const original = {
      id: 'node-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: {
        visibility: 'include' as const,
        break: { before: 'page' as const, after: 'auto' as const },
      },
    }

    for (const schema of schemas) {
      const accessor = schema.accessor!
      const value = schema.key === 'placement.mode'
        ? 'fixed'
        : schema.key !== 'break.before'
      const [, patches] = create(original, (draft) => {
        accessor.write(draft, value)
      }, { enablePatches: true })
      const declared = accessor.paths[0]!.slice(1).split('/')

      expect(patches.length).toBeGreaterThan(0)
      for (const patch of patches)
        expect(patch.path.slice(0, declared.length)).toEqual(declared)
    }

    const keepTogether = schemas.find(schema => schema.key === 'break.keepTogether')!
    const next = create(original, (draft) => {
      keepTogether.accessor!.write(draft, true)
    })
    expect(next.output.break).toEqual({ before: 'page', after: 'auto', keepTogether: true })
    expect(original.output.break).toEqual({ before: 'page', after: 'auto' })
  })

  it('passes descriptor validation when break accessors share a composite path', () => {
    const schemas = createLayoutBehaviorPropSchemas({
      page: {
        layout: { strategy: 'stack-flow' },
        reflow: { strategy: 'flow-y' },
        pagination: { strategy: 'auto-sheets' },
      },
    })

    expect(validatePropertyDescriptors(schemas)).toEqual([])
  })
})
