import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { commonConstraints } from './common'
import { tableStaticConstraints } from './table-static'

function tableNode(model: Record<string, unknown>): MaterialNode {
  return {
    id: 'table',
    type: 'table-static',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    modelVersion: 1,
    model,
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

describe('canonical material constraints', () => {
  it('requires a canonical model object', () => {
    const requiredModel = commonConstraints.find(constraint => constraint.id === 'required-model')!
    expect(requiredModel.check(tableNode({}), {} as never)).toEqual({ passed: true })
    expect(requiredModel.check({ ...tableNode({}), model: null } as unknown as MaterialNode, {} as never))
      .toEqual({ passed: false, details: 'No model object' })
  })

  it('repairs the direct v1 table kind without creating a legacy root field', () => {
    const kind = tableStaticConstraints.find(constraint => constraint.id === 'table-static-kind')!
    const repaired = kind.autoFix!(tableNode({ kind: 'data', columns: [], bands: [] }), {} as never)!

    expect(repaired.model).toMatchObject({ kind: 'static' })
    expect(Object.hasOwn(repaired, 'props')).toBe(false)
  })

  it('reads columns and rows directly from the v1 table model', () => {
    const structure = tableStaticConstraints.find(constraint => constraint.id === 'table-static-has-structure')!
    const model = { kind: 'static', columns: [{ id: 'c1' }], bands: [{ rows: [{ id: 'r1' }] }] }

    expect(structure.check(tableNode(model), {} as never)).toEqual({ passed: true })
    expect(structure.check(tableNode({ ...model, bands: [] }), {} as never)).toEqual({ passed: false })
  })
})
