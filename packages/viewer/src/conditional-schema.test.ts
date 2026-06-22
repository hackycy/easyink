import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { trustedViewerHtml } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { resolveConditionalSchema } from './conditional-schema'
import { createViewer } from './index'
import { MaterialRendererRegistry } from './material-registry'

function schema(elements: MaterialNode[]): DocumentSchema {
  return { version: '1.0.0', unit: 'mm', page: { mode: 'fixed', width: 100, height: 100 }, guides: { x: [], y: [] }, elements }
}

function node(id: string, path: string, whenFalse: 'remove' | 'reserve' = 'remove'): MaterialNode {
  return {
    id,
    type: 'conditional',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    props: {},
    renderCondition: { rule: { kind: 'compare', operator: 'exists', operands: [{ kind: 'field', path }] }, whenFalse },
  }
}

describe('resolveConditionalSchema', () => {
  it('partitions include, remove, and reserve without mutating input', () => {
    const registry = new MaterialRendererRegistry()
    registry.register('conditional', { kind: 'none' }, { render: vi.fn(() => ({})), condition: { scope: 'node', effects: ['remove', 'reserve'] } })
    const original = schema([node('include', 'show'), node('remove', 'gone'), node('reserve', 'space', 'reserve')])
    const result = resolveConditionalSchema(original, { show: true }, registry)
    expect(result.schema.elements.map(item => item.id)).toEqual(['include', 'reserve'])
    expect(result.schema.elements[1]?.hidden).toBe(true)
    expect(original.elements[1]?.hidden).toBeUndefined()
    expect(result.states).toEqual(new Map([['include', 'include'], ['remove', 'remove'], ['reserve', 'reserve']]))
  })

  it('recomputes conditions on updateData before binding, measurement, and paint', async () => {
    const container = document.createElement('div')
    const runtime = createViewer({ container })
    const measure = vi.fn(() => ({ width: 10, height: 10 }))
    runtime.registerMaterial('conditional', { kind: 'none' }, {
      condition: { scope: 'node', effects: ['remove', 'reserve'] },
      measure,
      render: () => ({ html: trustedViewerHtml('<span>visible</span>') }),
    })
    const conditional = node('runtime', 'show')

    await runtime.open({ schema: schema([conditional]), data: {} })
    expect(container.querySelector('[data-element-id="runtime"]')).toBeNull()
    expect(measure).not.toHaveBeenCalled()

    await runtime.updateData({ show: true })
    expect(container.querySelector('[data-element-id="runtime"]')?.textContent).toBe('visible')
    expect(measure).toHaveBeenCalledTimes(1)
  })

  it('ignores conditions on materials without the capability', () => {
    const original = schema([node('plain', 'missing')])
    expect(resolveConditionalSchema(original, {}, new MaterialRendererRegistry()).schema).toBe(original)
  })

  it('keeps static hidden priority even when reserve is not a declared condition effect', () => {
    const registry = new MaterialRendererRegistry()
    registry.register('conditional', { kind: 'none' }, { render: () => ({}), condition: { scope: 'node', effects: ['remove'] } })
    const hidden = { ...node('hidden', 'show'), hidden: true }
    expect(resolveConditionalSchema(schema([hidden]), { show: true }, registry).states.get('hidden')).toBe('reserve')
  })

  it('deduplicates diagnostics by node, code, and AST path', () => {
    const registry = new MaterialRendererRegistry()
    registry.register('conditional', { kind: 'none' }, { render: () => ({}), condition: { scope: 'node', effects: ['remove'] } })
    const repeatedMissing = {
      ...node('n', 'missing'),
      renderCondition: {
        rule: { kind: 'group' as const, operator: 'and' as const, children: [
          { kind: 'compare' as const, operator: 'eq' as const, operands: [{ kind: 'field' as const, path: 'missing' }, { kind: 'literal' as const, value: 1 }] },
          { kind: 'compare' as const, operator: 'eq' as const, operands: [{ kind: 'field' as const, path: 'missing' }, { kind: 'literal' as const, value: 2 }] },
        ] },
      },
    }
    const result = resolveConditionalSchema(schema([repeatedMissing]), {}, registry)
    expect(result.diagnostics).toHaveLength(2)
    expect(result.diagnostics.every(item => item.category === 'condition' && item.scope === 'condition')).toBe(true)
  })
})
