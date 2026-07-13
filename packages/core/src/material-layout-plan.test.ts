import type { JsonValue } from '@easyink/shared'
import type { MaterialFragmentPlan, MaterialLayoutPlan } from './material-layout-plan'
import { describe, expect, it } from 'vitest'
import {
  createLayoutConstraintKey,
  freezeMaterialFragmentPlan,
  freezeMaterialLayoutPlan,
  validateMaterialLayoutPlan,
} from './material-layout-plan'

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

describe('material layout plan', () => {
  it('builds a stable key from all layout constraints', () => {
    expect(createLayoutConstraintKey({
      availableWidth: 210,
      availableHeight: 297,
      unit: 'mm',
      writingMode: 'horizontal-tb',
    })).toBe('210:297:mm:horizontal-tb')
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
