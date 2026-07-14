import type { MaterialConditionCapability, MaterialMeasureRequest, MaterialViewerExtension } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans, defineMaterialManifest, viewerElement, viewerText } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { resolveConditionalSchema } from './conditional-schema'
import { createViewer } from './index'

function materialProfile(
  extension: MaterialViewerExtension = { render: () => ({ tree: viewerText('') }) },
  condition?: MaterialConditionCapability,
) {
  const base = createTestMaterialManifest({ type: 'conditional', viewer: () => ({
    extension,
    capabilities: {},
    ...(extension.measure
      ? {
          layout: {
            async measure(request: MaterialMeasureRequest) {
              const measured = extension.measure!(request.node as MaterialNode, {
                data: request.scope.data,
                unit: request.constraints.unit,
              })
              return createNonFragmentingMaterialPlans({
                instanceKey: request.instanceKey,
                nodeId: request.node.id,
                nodeRevision: request.nodeRevision,
                constraintKey: createLayoutConstraintKey(request.constraints),
                pageIndex: 0,
                borderBox: { x: request.node.x, y: request.node.y, width: measured?.width ?? request.node.width, height: measured?.height ?? request.node.height },
                fragmentBox: { x: request.node.x, y: request.node.y, width: measured?.width ?? request.node.width, height: measured?.height ?? request.node.height },
              }).layoutPlan
            },
          },
        }
      : {}),
  }) })
  return createTestCompiledMaterialProfile([defineMaterialManifest({
    ...base,
    common: condition === undefined ? base.common : { ...base.common, condition },
  })])
}

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
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: {
      visibility: 'include',
      renderCondition: { whenMatched: 'show', groups: [{ conditions: [{ source: { path }, operator: { compare: 'exists' } }] }], whenHidden },
    },
  }
}

describe('resolveConditionalSchema', () => {
  it('partitions include, remove, and reserve without mutating input', () => {
    const profile = materialProfile({ render: vi.fn(() => ({ tree: viewerText('') })) })
    const original = schema([node('include', 'show'), node('remove', 'gone'), node('reserve', 'space', 'reserve')])
    const result = resolveConditionalSchema(original, { show: true }, profile)
    expect(result.schema.elements.map(item => item.id)).toEqual(['include', 'reserve'])
    expect(result.schema.elements[1]?.editorState?.hidden).toBe(true)
    expect(original.elements[1]?.editorState?.hidden).toBeUndefined()
    expect(result.states).toEqual(new Map([['include', 'include'], ['remove', 'remove'], ['reserve', 'reserve']]))
  })

  it('recomputes conditions on updateData before binding, measurement, and paint', async () => {
    const container = document.createElement('div')
    const measure = vi.fn(() => ({ width: 10, height: 10 }))
    const runtime = createViewer({ container, profile: materialProfile({
      measure,
      render: () => ({ tree: viewerElement('span', {}, [viewerText('visible')]) }),
    }) })
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
    const runtime = createViewer({ container, profile: materialProfile({
      render: node => ({ tree: viewerElement('span', {}, [viewerText(node.id)]) }),
    }) })

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
    const runtime = createViewer({ container, profile: materialProfile({
      render: node => ({ tree: viewerElement('span', {}, [viewerText(node.id)]) }),
    }) })

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
    const runtime = createViewer({ container, profile: materialProfile({
      render: node => ({ tree: viewerElement('span', {}, [viewerText(node.id)]) }),
    }) })
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
    const result = resolveConditionalSchema(original, {}, materialProfile())
    expect(result.schema.elements).toEqual([])
    expect(result.states.get('plain')).toBe('remove')
  })

  it('ignores conditions when a material explicitly disables the capability', () => {
    const original = schema([node('plain', 'missing')])
    expect(resolveConditionalSchema(original, {}, materialProfile(undefined, false)).schema).toBe(original)
  })

  it('keeps static hidden priority even when reserve is not a declared condition effect', () => {
    const hidden = { ...node('hidden', 'show'), editorState: { hidden: true } }
    expect(resolveConditionalSchema(schema([hidden]), { show: true }, materialProfile(undefined, { scope: 'node', hiddenEffects: ['remove'] })).states.get('hidden')).toBe('reserve')
  })

  it('deduplicates diagnostics by node, code, group, and condition', () => {
    const repeatedMissing = {
      ...node('n', 'missing'),
      output: {
        visibility: 'include' as const,
        renderCondition: {
          whenMatched: 'show' as const,
          groups: [{ conditions: [
            { source: { path: 'missing' }, operator: { compare: 'eq' as const }, valueType: 'number' as const, value: { kind: 'literal' as const, value: 1 } },
            { source: { path: 'missing' }, operator: { compare: 'eq' as const }, valueType: 'number' as const, value: { kind: 'literal' as const, value: 2 } },
          ] }],
        },
      },
    }
    const result = resolveConditionalSchema(schema([repeatedMissing]), {}, materialProfile(undefined, { scope: 'node', hiddenEffects: ['remove'] }))
    expect(result.diagnostics).toHaveLength(2)
    expect(result.diagnostics.every(item => item.category === 'condition' && item.scope === 'condition')).toBe(true)
  })
})
