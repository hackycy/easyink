import type { JsonValue } from '@easyink/shared'
import type { MaterialFragmentPlan, MaterialLayoutPlan, MaterialViewerLayoutFacet, NonFragmentingMaterialPlansInput } from './material-layout-plan'
import { describe, expect, it } from 'vitest'
import {
  createLayoutConstraintKey,
  createNonFragmentingMaterialPlans,
  freezeMaterialFragmentPlan,
  freezeMaterialLayoutPlan,
  validateMaterialLayoutPlan,
} from './material-layout-plan'

interface InterfacePayload {
  rows: Array<{ id: string }>
}

function createPlan(overrides: Partial<MaterialLayoutPlan> = {}): MaterialLayoutPlan {
  return {
    instanceKey: 'n1',
    nodeId: 'n1',
    nodeRevision: 3,
    constraintKey: '210:297:mm:horizontal-tb',
    borderBox: { x: 0, y: 0, width: 10, height: 20 },
    contentBox: { x: 0, y: 0, width: 10, height: 20 },
    slotBoxes: [],
    breakOpportunities: [],
    diagnostics: [],
    ...overrides,
  }
}

function createFallbackInput(
  overrides: Partial<NonFragmentingMaterialPlansInput> = {},
): NonFragmentingMaterialPlansInput {
  return {
    instanceKey: 'n1',
    nodeId: 'n1',
    nodeRevision: 2,
    constraintKey: '10:20:mm:horizontal-tb',
    borderBox: { x: 0, y: 0, width: 10, height: 20 },
    fragmentBox: { x: 3, y: 4, width: 10, height: 20 },
    pageIndex: 4,
    ...overrides,
  }
}

describe('material layout plan', () => {
  it('builds a stable key from all layout constraints', () => {
    expect(createLayoutConstraintKey({
      availableWidth: 210,
      availableHeight: 297,
      unit: 'mm',
      writingMode: 'horizontal-tb',
    })).toBe('210:297:mm:horizontal-tb')
  })

  it('creates a frozen non-fragmenting fallback with one full consumed range', () => {
    const published = createNonFragmentingMaterialPlans({
      instanceKey: 'n1',
      nodeId: 'n1',
      nodeRevision: 2,
      constraintKey: '10:20:mm:horizontal-tb',
      borderBox: { x: 0, y: 0, width: 10, height: 20 },
      fragmentBox: { x: 3, y: 4, width: 10, height: 20 },
      pageIndex: 4,
    })

    expect(published.layoutPlan.breakOpportunities).toEqual([])
    expect(published.fragmentPlan).toMatchObject({
      id: JSON.stringify(['material-fragment', 'n1', 4, 0, 20]),
      sourceInstanceKey: 'n1',
      sourceNodeId: 'n1',
      consumedRange: { startBlockOffset: 0, endBlockOffset: 20 },
    })
    expect(validateMaterialLayoutPlan(published.layoutPlan)).toEqual([])
    expect(Object.isFrozen(published)).toBe(true)
    expect(Object.isFrozen(published.layoutPlan)).toBe(true)
    expect(Object.isFrozen(published.fragmentPlan)).toBe(true)
  })

  it('mints stable injective fallback fragment identities across output pages', () => {
    const createFragmentId = (instanceKey: string, pageIndex: number) => createNonFragmentingMaterialPlans({
      instanceKey,
      nodeId: 'source-node',
      nodeRevision: 2,
      constraintKey: '10:20:mm:horizontal-tb',
      borderBox: { x: 0, y: 0, width: 10, height: 20 },
      fragmentBox: { x: 3, y: 4, width: 10, height: 20 },
      pageIndex,
    }).fragmentPlan.id

    const delimiterLikeInstanceKey = 'owner/child:[",":full]'
    const first = createFragmentId(delimiterLikeInstanceKey, 4)

    expect(first).toBe(createFragmentId(delimiterLikeInstanceKey, 4))
    expect(first).not.toBe(createFragmentId(delimiterLikeInstanceKey, 5))
    expect(first).toBe(JSON.stringify([
      'material-fragment',
      delimiterLikeInstanceKey,
      4,
      0,
      20,
    ]))
  })

  it('reserves fallback fragment identity for core minting', () => {
    const published = createNonFragmentingMaterialPlans({
      instanceKey: 'n1',
      nodeId: 'n1',
      nodeRevision: 2,
      constraintKey: '10:20:mm:horizontal-tb',
      borderBox: { x: 0, y: 0, width: 10, height: 20 },
      fragmentBox: { x: 3, y: 4, width: 10, height: 20 },
      pageIndex: 4,
      // @ts-expect-error Fragment identity is core-owned and is not accepted from callers.
      fragmentId: 'caller-owned',
    })

    expect(published.fragmentPlan.id).not.toBe('caller-owned')
  })

  it.each([
    { name: 'NaN page index', overrides: { pageIndex: Number.NaN } },
    { name: 'infinite page index', overrides: { pageIndex: Number.POSITIVE_INFINITY } },
    { name: 'negative page index', overrides: { pageIndex: -1 } },
    { name: 'fractional page index', overrides: { pageIndex: 1.5 } },
    { name: 'unsafe page index', overrides: { pageIndex: Number.MAX_SAFE_INTEGER + 1 } },
    { name: 'negative node revision', overrides: { nodeRevision: -1 } },
    { name: 'unsafe node revision', overrides: { nodeRevision: Number.MAX_SAFE_INTEGER + 1 } },
    { name: 'empty instance identity', overrides: { instanceKey: '' } },
    { name: 'empty node identity', overrides: { nodeId: '' } },
    { name: 'empty constraint identity', overrides: { constraintKey: '' } },
    { name: 'non-finite border coordinate', overrides: { borderBox: { x: Number.NaN, y: 0, width: 10, height: 20 } } },
    { name: 'negative border dimension', overrides: { borderBox: { x: 0, y: 0, width: -1, height: 20 } } },
    { name: 'invalid content box', overrides: { contentBox: { x: 0, y: 0, width: 10, height: Number.POSITIVE_INFINITY } } },
    { name: 'non-finite fragment coordinate', overrides: { fragmentBox: { x: 0, y: Number.NEGATIVE_INFINITY, width: 10, height: 20 } } },
    { name: 'negative fragment dimension', overrides: { fragmentBox: { x: 0, y: 0, width: 10, height: -1 } } },
    { name: 'fragment width mismatch', overrides: { fragmentBox: { x: 0, y: 0, width: 9, height: 20 } } },
    { name: 'fragment range mismatch', overrides: { fragmentBox: { x: 0, y: 0, width: 10, height: 19 } } },
  ] satisfies Array<{ name: string, overrides: Partial<NonFragmentingMaterialPlansInput> }>)('rejects invalid fallback input: $name', ({ overrides }) => {
    expect(() => createNonFragmentingMaterialPlans(createFallbackInput(overrides)))
      .toThrowError('NON_FRAGMENTING_MATERIAL_PLANS_INPUT_INVALID')
  })

  it('accepts finite negative page-relative fragment coordinates', () => {
    expect(() => createNonFragmentingMaterialPlans(createFallbackInput({
      fragmentBox: { x: -3, y: -4, width: 10, height: 20 },
    }))).not.toThrow()
  })

  it('rejects non-finite geometry, invalid identity, duplicate slot instances, and invalid break order', () => {
    expect(validateMaterialLayoutPlan(createPlan({
      instanceKey: '',
      nodeRevision: -1,
      constraintKey: '',
      borderBox: { x: 0, y: 0, width: Number.NaN, height: 20 },
      slotBoxes: [
        { slotId: 'content', slotInstanceKey: 'slot-1', box: { x: 0, y: 0, width: 10, height: 10 }, ownership: 'managed', clip: true },
        { slotId: 'content', slotInstanceKey: 'slot-1', box: { x: 0, y: 10, width: 10, height: 10 }, ownership: 'managed', clip: true },
      ],
      breakOpportunities: [
        { id: 'b2', blockOffset: 10, penalty: 0 },
        { id: 'b2', blockOffset: 5, penalty: Number.NaN },
      ],
    }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LAYOUT_PLAN_NON_FINITE_BOX' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_IDENTITY_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_SLOT_INSTANCE_DUPLICATE' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_ORDER' }),
    ]))
  })

  it('rejects invalid runtime scalar and discriminant values', () => {
    const diagnostics = validateMaterialLayoutPlan(createPlan({
      instanceKey: 42 as never,
      nodeId: true as never,
      constraintKey: [] as never,
      slotBoxes: [{
        slotId: 42,
        slotInstanceKey: [],
        box: { x: 0, y: 0, width: 10, height: 10 },
        ownership: 'borrowed',
        clip: 'yes',
      } as never],
      diagnostics: [{
        code: 42,
        severity: 'fatal',
        message: '',
        instanceKey: 42,
        nodeId: true,
      } as never],
      breakOpportunities: [{ id: 42, blockOffset: '5', penalty: '0' } as never],
    }))

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LAYOUT_PLAN_IDENTITY_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_SLOT_IDENTITY_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_SLOT_DISCRIMINANT_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_DIAGNOSTIC_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_ORDER' }),
    ]))
  })

  it('returns diagnostics instead of throwing for malformed runtime entries', () => {
    const malformed = createPlan({
      slotBoxes: [null as never],
      diagnostics: [null as never],
      breakOpportunities: [null as never],
    })

    expect(() => validateMaterialLayoutPlan(malformed)).not.toThrow()
    expect(validateMaterialLayoutPlan(malformed)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LAYOUT_PLAN_SLOT_IDENTITY_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_SLOT_DISCRIMINANT_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_SLOT_BOX_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_DIAGNOSTIC_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_ORDER' }),
    ]))
  })

  it('publishes a recursively frozen isolated copy of material facts', () => {
    const source = {
      instanceKey: 'n1',
      nodeId: 'n1',
      nodeRevision: 3,
      constraintKey: '210:297:mm:horizontal-tb',
      borderBox: { x: 0, y: 0, width: 10, height: 20 },
      contentBox: { x: 0, y: 0, width: 10, height: 20 },
      slotBoxes: [{ slotId: 'content', slotInstanceKey: 'slot-1', box: { x: 0, y: 0, width: 10, height: 20 }, ownership: 'managed' as const, clip: true }],
      breakOpportunities: [{ id: 'b1', blockOffset: 10, penalty: 0 }],
      diagnostics: [{
        code: 'MEASURE_WARNING',
        severity: 'warning' as const,
        message: 'Measured with fallback data.',
        instanceKey: 'n1',
        nodeId: 'n1',
        detail: { fallback: ['row-1'] },
      }],
      payload: { rows: [{ id: 'r1' }] },
    }

    const published = freezeMaterialLayoutPlan(source)

    expect(published).not.toBe(source)
    expect(published.borderBox).not.toBe(source.borderBox)
    expect(published.slotBoxes[0]).not.toBe(source.slotBoxes[0])
    expect(published.slotBoxes[0]?.box).not.toBe(source.slotBoxes[0]?.box)
    expect(published.payload).not.toBe(source.payload)
    expect(Object.isFrozen(published)).toBe(true)
    expect(Object.isFrozen(published.borderBox)).toBe(true)
    expect(Object.isFrozen(published.slotBoxes)).toBe(true)
    expect(Object.isFrozen(published.slotBoxes[0]?.box)).toBe(true)
    expect(Object.isFrozen(published.breakOpportunities)).toBe(true)
    expect(Object.isFrozen(published.diagnostics[0]?.detail)).toBe(true)
    expect(Object.isFrozen((published.payload as { rows: unknown[] }).rows)).toBe(true)
    expect(Object.isFrozen(source)).toBe(false)
    expect(Object.isFrozen(source.borderBox)).toBe(false)
    expect(Object.isFrozen(source.slotBoxes)).toBe(false)
    expect(Object.isFrozen(source.slotBoxes[0]!.box)).toBe(false)
    expect(Object.isFrozen(source.diagnostics[0]!.detail)).toBe(false)
    expect(Object.isFrozen(source.payload.rows)).toBe(false)
  })

  it('preserves a JSON-safe interface payload without requiring an index signature', () => {
    const source: MaterialLayoutPlan<InterfacePayload> = {
      ...createPlan(),
      payload: { rows: [{ id: 'r1' }] },
    }

    const published = freezeMaterialLayoutPlan(source)

    expect(published.payload?.rows[0]?.id).toBe('r1')
    expect(Object.isFrozen(published.payload?.rows)).toBe(true)
    expect(Object.isFrozen(source.payload?.rows)).toBe(false)
  })

  it('allows a layout facet to measure a named JSON-safe payload interface', () => {
    const measure: NonNullable<MaterialViewerLayoutFacet['measure']> = async () => {
      const plan: MaterialLayoutPlan<InterfacePayload> = {
        ...createPlan(),
        payload: { rows: [{ id: 'r1' }] },
      }
      return plan
    }

    expect(measure).toBeTypeOf('function')
  })

  it('rejects non-JSON payloads and diagnostic details', () => {
    const invalidPayload = createPlan({ payload: { value: undefined } as unknown as JsonValue })
    const invalidDetail = createPlan({
      diagnostics: [{
        code: 'INVALID_DETAIL',
        severity: 'error',
        message: 'Invalid detail.',
        instanceKey: 'n1',
        nodeId: 'n1',
        detail: { value: undefined } as unknown as JsonValue,
      }],
    })

    expect(validateMaterialLayoutPlan(invalidPayload)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LAYOUT_PLAN_PAYLOAD_NOT_JSON' }),
    ]))
    expect(validateMaterialLayoutPlan(invalidDetail)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LAYOUT_PLAN_DIAGNOSTIC_INVALID' }),
    ]))
    expect(() => freezeMaterialLayoutPlan(invalidPayload)).toThrow()
    expect(() => freezeMaterialLayoutPlan(invalidDetail)).toThrow()
  })

  it('rejects invalid slot boxes and duplicate break IDs', () => {
    const diagnostics = validateMaterialLayoutPlan(createPlan({
      slotBoxes: [{
        slotId: 'content',
        slotInstanceKey: 'slot-1',
        box: { x: Number.POSITIVE_INFINITY, y: 0, width: -1, height: 10 },
        ownership: 'managed',
        clip: true,
      }],
      breakOpportunities: [
        { id: 'b1', blockOffset: 5, penalty: 0 },
        { id: 'b1', blockOffset: 10, penalty: 1 },
      ],
    }))

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LAYOUT_PLAN_SLOT_BOX_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_INVALID' }),
    ]))
  })

  it('treats the border-box end as implicit and accepts only internal break offsets', () => {
    expect(validateMaterialLayoutPlan(createPlan({
      breakOpportunities: [{ id: 'end', blockOffset: 20, penalty: 0 }],
    }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_ORDER' }),
    ]))
  })

  it('publishes a recursively frozen isolated fragment plan copy', () => {
    const source: MaterialFragmentPlan = {
      id: 'fragment-1',
      sourceInstanceKey: 'n1',
      sourceNodeId: 'n1',
      box: { x: 1, y: 2, width: 10, height: 8 },
      consumedRange: { startBlockOffset: 0, endBlockOffset: 8 },
      renderPayload: { rows: [{ id: 'r1' }] },
      diagnostics: [{
        code: 'FRAGMENT_INFO',
        severity: 'info',
        message: 'Fragment created.',
        instanceKey: 'n1',
        nodeId: 'n1',
        detail: { range: [0, 8] },
      }],
    }

    const published = freezeMaterialFragmentPlan(source)

    expect(published).not.toBe(source)
    expect(published.box).not.toBe(source.box)
    expect(published.consumedRange).not.toBe(source.consumedRange)
    expect(published.renderPayload).not.toBe(source.renderPayload)
    expect(Object.isFrozen(published)).toBe(true)
    expect(Object.isFrozen(published.box)).toBe(true)
    expect(Object.isFrozen(published.consumedRange)).toBe(true)
    expect(Object.isFrozen((published.renderPayload as { rows: unknown[] }).rows)).toBe(true)
    expect(Object.isFrozen(published.diagnostics[0]?.detail)).toBe(true)
    expect(Object.isFrozen(source)).toBe(false)
    expect(Object.isFrozen(source.box)).toBe(false)
    expect(Object.isFrozen(source.consumedRange)).toBe(false)
    expect(Object.isFrozen((source.renderPayload as { rows: unknown[] }).rows)).toBe(false)
    expect(Object.isFrozen(source.diagnostics[0]!.detail)).toBe(false)
  })

  it('rejects non-JSON fragment payloads and diagnostic details', () => {
    const source: MaterialFragmentPlan = {
      id: 'fragment-1',
      sourceInstanceKey: 'n1',
      sourceNodeId: 'n1',
      box: { x: 0, y: 0, width: 10, height: 8 },
      consumedRange: { startBlockOffset: 0, endBlockOffset: 8 },
      renderPayload: { value: undefined } as unknown as JsonValue,
      diagnostics: [],
    }
    const invalidDetail: MaterialFragmentPlan = {
      ...source,
      renderPayload: undefined,
      diagnostics: [{
        code: 'INVALID_DETAIL',
        severity: 'error',
        message: 'Invalid detail.',
        instanceKey: 'n1',
        nodeId: 'n1',
        detail: { value: undefined } as unknown as JsonValue,
      }],
    }

    expect(() => freezeMaterialFragmentPlan(source)).toThrow()
    expect(() => freezeMaterialFragmentPlan(invalidDetail)).toThrow()
    expect(Object.isFrozen(source)).toBe(false)
    expect(Object.isFrozen(invalidDetail)).toBe(false)
  })
})
