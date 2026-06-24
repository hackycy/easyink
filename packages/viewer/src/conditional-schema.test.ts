import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { trustedViewerHtml } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { resolveConditionalSchema } from './conditional-schema'
import { createViewer } from './index'
import { MaterialRendererRegistry } from './material-registry'

function schema(elements: MaterialNode[], page: Partial<DocumentSchema['page']> = {}): DocumentSchema {
  return { version: '1.0.0', unit: 'mm', page: { mode: 'fixed', width: 100, height: 100, ...page }, guides: { x: [], y: [] }, elements }
}

function node(id: string, path: string, whenHidden: 'remove' | 'reserve' = 'remove'): MaterialNode {
  return {
    id,
    type: 'conditional',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    props: {},
    renderCondition: { whenMatched: 'show', groups: [{ conditions: [{ source: { path }, operator: { compare: 'exists' } }] }], whenHidden },
  }
}

describe('resolveConditionalSchema', () => {
  it('partitions include, remove, and reserve without mutating input', () => {
    const registry = new MaterialRendererRegistry()
    registry.register('conditional', { kind: 'none' }, { render: vi.fn(() => ({})), condition: { scope: 'node', hiddenEffects: ['remove', 'reserve'] } })
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
      condition: { scope: 'node', hiddenEffects: ['remove', 'reserve'] },
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

  it('removes flow-y space for conditionally removed runtime nodes', async () => {
    const container = document.createElement('div')
    const runtime = createViewer({ container })
    runtime.registerMaterial('conditional', { kind: 'none' }, {
      condition: { scope: 'node', hiddenEffects: ['remove', 'reserve'] },
      render: node => ({ html: trustedViewerHtml(`<span>${node.id}</span>`) }),
    })

    await runtime.open({
      schema: schema([
        node('optional', 'show'),
        { ...node('after', 'after'), y: 20 },
      ], {
        mode: 'continuous',
        layout: { strategy: 'stack-flow', flowAxis: 'y' },
        pagination: { strategy: 'none' },
        reflow: { strategy: 'flow-y', preserveTrailingGap: false },
      }),
      data: { after: true },
    })

    const optionalEl = container.querySelector('[data-element-id="optional"]') as HTMLElement | null
    const afterEl = container.querySelector('[data-element-id="after"]') as HTMLElement | null
    expect(optionalEl).toBeNull()
    expect(afterEl).not.toBeNull()
    expect(Number.parseFloat(afterEl!.style.top)).toBe(10)
  })

  it('preserves flow-y space for conditionally reserved runtime nodes', async () => {
    const container = document.createElement('div')
    const runtime = createViewer({ container })
    runtime.registerMaterial('conditional', { kind: 'none' }, {
      condition: { scope: 'node', hiddenEffects: ['remove', 'reserve'] },
      render: node => ({ html: trustedViewerHtml(`<span>${node.id}</span>`) }),
    })

    await runtime.open({
      schema: schema([
        node('optional', 'show', 'reserve'),
        { ...node('after', 'after'), y: 20 },
      ], {
        mode: 'continuous',
        layout: { strategy: 'stack-flow', flowAxis: 'y' },
        pagination: { strategy: 'none' },
        reflow: { strategy: 'flow-y', preserveTrailingGap: false },
      }),
      data: { after: true },
    })

    const optionalEl = container.querySelector('[data-element-id="optional"]') as HTMLElement | null
    const afterEl = container.querySelector('[data-element-id="after"]') as HTMLElement | null
    expect(optionalEl).toBeNull()
    expect(afterEl).not.toBeNull()
    expect(Number.parseFloat(afterEl!.style.top)).toBe(20)
  })

  it('reflows conditionally removed space again after updateData', async () => {
    const container = document.createElement('div')
    const runtime = createViewer({ container })
    runtime.registerMaterial('conditional', { kind: 'none' }, {
      condition: { scope: 'node', hiddenEffects: ['remove', 'reserve'] },
      render: node => ({ html: trustedViewerHtml(`<span>${node.id}</span>`) }),
    })
    const input = schema([
      node('optional', 'show'),
      { ...node('after', 'after'), y: 20 },
    ], {
      mode: 'continuous',
      layout: { strategy: 'stack-flow', flowAxis: 'y' },
      pagination: { strategy: 'none' },
      reflow: { strategy: 'flow-y', preserveTrailingGap: false },
    })

    await runtime.open({ schema: input, data: { show: true, after: true } })
    expect(Number.parseFloat((container.querySelector('[data-element-id="after"]') as HTMLElement).style.top)).toBe(20)

    await runtime.updateData({ after: true })
    expect(container.querySelector('[data-element-id="optional"]')).toBeNull()
    expect(Number.parseFloat((container.querySelector('[data-element-id="after"]') as HTMLElement).style.top)).toBe(10)

    await runtime.updateData({ show: true, after: true })
    expect(container.querySelector('[data-element-id="optional"]')).not.toBeNull()
    expect(Number.parseFloat((container.querySelector('[data-element-id="after"]') as HTMLElement).style.top)).toBe(20)
  })

  it('uses default condition capability when no material override is declared', () => {
    const original = schema([node('plain', 'missing')])
    const result = resolveConditionalSchema(original, {}, new MaterialRendererRegistry())
    expect(result.schema.elements).toEqual([])
    expect(result.states.get('plain')).toBe('remove')
  })

  it('ignores conditions when a material explicitly disables the capability', () => {
    const registry = new MaterialRendererRegistry()
    registry.register('conditional', { kind: 'none' }, { render: () => ({}), condition: false })
    const original = schema([node('plain', 'missing')])
    expect(resolveConditionalSchema(original, {}, registry).schema).toBe(original)
  })

  it('keeps static hidden priority even when reserve is not a declared condition effect', () => {
    const registry = new MaterialRendererRegistry()
    registry.register('conditional', { kind: 'none' }, { render: () => ({}), condition: { scope: 'node', hiddenEffects: ['remove'] } })
    const hidden = { ...node('hidden', 'show'), hidden: true }
    expect(resolveConditionalSchema(schema([hidden]), { show: true }, registry).states.get('hidden')).toBe('reserve')
  })

  it('deduplicates diagnostics by node, code, group, and condition', () => {
    const registry = new MaterialRendererRegistry()
    registry.register('conditional', { kind: 'none' }, { render: () => ({}), condition: { scope: 'node', hiddenEffects: ['remove'] } })
    const repeatedMissing = {
      ...node('n', 'missing'),
      renderCondition: {
        whenMatched: 'show' as const,
        groups: [{ conditions: [
          { source: { path: 'missing' }, operator: { compare: 'eq' as const }, valueType: 'number' as const, value: { kind: 'literal' as const, value: 1 } },
          { source: { path: 'missing' }, operator: { compare: 'eq' as const }, valueType: 'number' as const, value: { kind: 'literal' as const, value: 2 } },
        ] }],
      },
    }
    const result = resolveConditionalSchema(schema([repeatedMissing]), {}, registry)
    expect(result.diagnostics).toHaveLength(2)
    expect(result.diagnostics.every(item => item.category === 'condition' && item.scope === 'condition')).toBe(true)
  })
})
