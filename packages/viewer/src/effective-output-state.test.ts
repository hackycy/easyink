import type { MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { cloneJsonValue } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { resolveEffectiveOutputStates } from './effective-output-state'

function node(id: string, visibility: MaterialNode['output']['visibility'] = 'include', children: MaterialNode[] = []): MaterialNode {
  return {
    id,
    type: 'box',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: children.length ? { content: children } : {},
    bindings: {},
    output: { visibility },
  }
}

describe('resolveEffectiveOutputStates', () => {
  it('ignores editor hidden and maps include, reserve, and remove to paint and measure flags', () => {
    const profile = createTestCompiledMaterialProfile()
    const hidden = { ...node('hidden'), editorState: { hidden: true } }
    const states = resolveEffectiveOutputStates([hidden, node('reserve', 'reserve'), node('remove', 'remove')], {}, profile)

    expect(states.get('hidden')).toEqual({ visibility: 'include', shouldMeasure: true, shouldPaint: true })
    expect(states.get('reserve')).toEqual({ visibility: 'reserve', shouldMeasure: true, shouldPaint: false })
    expect(states.get('remove')).toEqual({ visibility: 'remove', shouldMeasure: false, shouldPaint: false })
    expect(Object.isFrozen(states.get('hidden'))).toBe(true)
    expect('set' in states).toBe(false)
  })

  it('recurses through slots and inherits remove over reserve over include', () => {
    const profile = createTestCompiledMaterialProfile()
    const reserveChild = node('reserve-child', 'include', [node('reserve-grandchild', 'remove')])
    const root = node('root', 'reserve', [reserveChild])
    const removedRoot = node('removed-root', 'remove', [node('removed-child', 'include')])

    const states = resolveEffectiveOutputStates([root, removedRoot], {}, profile)

    expect(states.get('reserve-child')?.visibility).toBe('reserve')
    expect(states.get('reserve-grandchild')?.visibility).toBe('remove')
    expect(states.get('removed-child')?.visibility).toBe('remove')
  })

  it('evaluates canonical render conditions with data and enforces manifest effects', () => {
    const allowed = createTestMaterialManifest({ type: 'allowed' })
    const denied = createTestMaterialManifest({ type: 'denied' })
    const profile = createTestCompiledMaterialProfile([
      { ...allowed, common: { ...allowed.common, condition: { scope: 'node', hiddenEffects: ['reserve'] } } },
      { ...denied, common: { ...denied.common, condition: false } },
    ])
    const conditional = (id: string, type: string, effect: 'remove' | 'reserve'): MaterialNode => ({
      ...node(id),
      type,
      output: {
        visibility: 'include',
        renderCondition: {
          whenMatched: 'show',
          whenHidden: effect,
          groups: [{ conditions: [{ source: { path: 'show' }, operator: { compare: 'eq' }, valueType: 'boolean', value: { kind: 'literal', value: true } }] }],
        },
      },
    })

    const states = resolveEffectiveOutputStates([
      conditional('reserve', 'allowed', 'reserve'),
      conditional('remove-denied', 'allowed', 'remove'),
      conditional('condition-disabled', 'denied', 'reserve'),
    ], { show: false }, profile)

    expect(states.get('reserve')?.visibility).toBe('reserve')
    expect(states.get('remove-denied')?.visibility).toBe('include')
    expect(states.get('condition-disabled')?.visibility).toBe('include')
  })

  it('does not mutate or clone source nodes and follows the canonical unique-node traversal assumption', () => {
    const profile = createTestCompiledMaterialProfile()
    const shared = node('shared')
    const root = node('root', 'reserve', [shared])
    root.slots.second = [shared]
    const snapshot = cloneJsonValue(root as unknown as JsonValue)

    const states = resolveEffectiveOutputStates([root], {}, profile)

    expect(root).toEqual(snapshot)
    expect(states.size).toBe(2)
    expect(states.get('shared')?.visibility).toBe('reserve')
  })
})
