import type { MaterialBindingDefinition, MaterialRuntimeScope } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createMaterialBindingResolver, createMaterialDisplayBindingResolver, projectBindings, walkProfileMaterialNodes } from './binding-projector'

const bindingDefinition: MaterialBindingDefinition = {
  kind: 'ports',
  ports: [
    { id: 'title', key: { kind: 'exact', value: 'title' }, role: 'display', valueShape: 'scalar', modelPath: '/model/title', formatEditor: { tabs: ['preset'] } },
    { id: 'rows', key: { kind: 'exact', value: 'rows' }, role: 'semantic', valueShape: 'record-array', formatEditor: false },
    { id: 'key', key: { kind: 'exact', value: 'key' }, role: 'semantic', valueShape: 'scalar', formatEditor: false },
  ],
}

function bindingNode(bindings: MaterialNode['bindings']): MaterialNode {
  return {
    id: 'bound',
    type: 'box',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings,
    output: { visibility: 'include' },
  }
}

describe('projectBindings', () => {
  it('disables custom binding source without executing it', () => {
    const data = {
      invoiceNo: 'INV-001',
      customer: { name: 'Ada' },
    }
    const projected = projectBindings({
      id: 'txt-customer',
      type: 'text',
      x: 0,
      y: 0,
      width: 40,
      height: 10,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: { value: {
        sourceId: 'invoice',
        fieldPath: 'customer/name',
        format: {
          mode: 'custom',
          custom: { source: 'globalThis.__bindingCustomExecuted = true' },
        },
      } },
      output: { visibility: 'include' },
    }, data)

    expect(projected).toEqual([{
      port: 'value',
      value: 'Ada',
      diagnostics: [expect.objectContaining({ code: 'BINDING_FORMAT_CUSTOM_DISABLED' })],
    }])
    expect((globalThis as Record<string, unknown>).__bindingCustomExecuted).toBeUndefined()
  })

  it('discovers nested binding nodes through profile introspection', () => {
    const child: MaterialNode = {
      id: 'child',
      type: 'child',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: { value: { sourceId: 'invoice', fieldPath: 'customer/name' } },
      output: { visibility: 'include' },
    }
    const schema: DocumentSchema = {
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 80, height: 60 },
      guides: { x: [], y: [] },
      elements: [{ ...child, id: 'owner', type: 'owner', bindings: {}, slots: { content: [child] } }],
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'owner',
        slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      }),
      createTestMaterialManifest({ type: 'child', binding: { kind: 'ports', ports: [] } }),
    ])
    const visited: string[] = []

    walkProfileMaterialNodes(schema, profile, node => visited.push(node.id))

    expect(visited).toEqual(['owner', 'child'])
  })
})

describe('material binding resolvers', () => {
  it('keeps unbound, missing, invalid, and resolved raw states distinct', () => {
    const report = vi.fn()
    const source = { nested: [1] }
    const node = bindingNode({
      missing: { sourceId: 'invoice', fieldPath: 'missing' },
      invalid: { sourceId: 'invoice', fieldPath: 'bad' },
      title: { sourceId: 'invoice', fieldPath: 'title' },
    })
    const resolve = createMaterialBindingResolver({
      node,
      bindingDefinition: {
        kind: 'ports',
        ports: [
          ...bindingDefinition.ports,
          { id: 'missing', key: { kind: 'exact', value: 'missing' }, role: 'semantic', valueShape: 'scalar', formatEditor: false },
          { id: 'invalid', key: { kind: 'exact', value: 'invalid' }, role: 'semantic', valueShape: 'scalar', formatEditor: false },
        ],
      },
      baseScope: { key: 'document', data: { title: source, bad: () => 'bad' } },
      reportDiagnostic: report,
    })

    expect(resolve('unbound')).toEqual({ status: 'unbound' })
    expect(resolve('missing')).toEqual({ status: 'missing' })
    expect(resolve('invalid')).toMatchObject({ status: 'invalid', code: 'MATERIAL_BINDING_RESULT_NOT_JSON' })
    expect(resolve('title')).toMatchObject({ status: 'invalid', code: 'MATERIAL_BINDING_VALUE_INVALID' })
    expect(report).toHaveBeenCalledTimes(2)
  })

  it('walks current scope to parents and publishes an isolated deeply frozen JSON value', () => {
    const source = Object.freeze({ nested: { values: [1] } })
    const parent: MaterialRuntimeScope = { key: 'parent', data: { value: source } }
    const scope: MaterialRuntimeScope = { key: 'row', data: {}, parent }
    const resolve = createMaterialBindingResolver({
      node: bindingNode({ title: { sourceId: 'invoice', fieldPath: 'value' } }),
      bindingDefinition: { kind: 'ports', ports: [{ id: 'title', key: { kind: 'exact', value: 'title' }, role: 'semantic', valueShape: 'record', formatEditor: false }] },
      baseScope: scope,
      reportDiagnostic: vi.fn(),
    })

    const result = resolve('title')
    expect(result).toEqual({ status: 'resolved', value: { nested: { values: [1] } } })
    expect(result.status === 'resolved' && Object.isFrozen(result.value)).toBe(true)
    expect(result.status === 'resolved' && Object.isFrozen((result.value as { nested: { values: number[] } }).nested.values)).toBe(true)
    expect(Object.isFrozen(source.nested)).toBe(false)
  })

  it.each([
    ['object cycle', (scope: MaterialRuntimeScope) => { (scope as { parent?: MaterialRuntimeScope }).parent = scope }],
    ['same key with different data', (scope: MaterialRuntimeScope) => { (scope as { parent?: MaterialRuntimeScope }).parent = { key: scope.key, data: {} } }],
    ['more than 32 scopes', (scope: MaterialRuntimeScope) => {
      let cursor = scope as { parent?: MaterialRuntimeScope }
      for (let index = 0; index < 32; index++) {
        cursor.parent = { key: `parent-${index}`, data: {} }
        cursor = cursor.parent
      }
    }],
  ])('rejects an invalid scope chain: %s', (_case, corrupt) => {
    const report = vi.fn()
    const scope: MaterialRuntimeScope = { key: 'row', data: { value: 'found' } }
    corrupt(scope)
    const resolve = createMaterialBindingResolver({
      node: bindingNode({ title: { sourceId: 'invoice', fieldPath: 'value' } }),
      bindingDefinition,
      baseScope: scope,
      reportDiagnostic: report,
    })

    expect(resolve('title')).toEqual({ status: 'invalid', code: 'MATERIAL_BINDING_SCOPE_INVALID' })
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ code: 'MATERIAL_BINDING_SCOPE_INVALID' }))
  })

  it('reports data-contract and legacy array bindings as stable unsupported invalid results', () => {
    const report = vi.fn()
    const node = bindingNode({
      title: { kind: 'data-contract', mappings: {} },
      rows: [{ sourceId: 'invoice', fieldPath: 'rows' }],
    })
    const resolve = createMaterialBindingResolver({ node, bindingDefinition, baseScope: { key: 'document', data: {} }, reportDiagnostic: report })

    expect(resolve('title')).toEqual({ status: 'invalid', code: 'MATERIAL_BINDING_PORT_KIND_UNSUPPORTED' })
    expect(resolve('rows')).toEqual({ status: 'invalid', code: 'MATERIAL_BINDING_PORT_KIND_UNSUPPORTED' })
    expect(report).toHaveBeenCalledTimes(2)
  })

  it('formats only display ports and never converts collection or identity ports to text', () => {
    const report = vi.fn()
    const node = bindingNode({
      title: { sourceId: 'invoice', fieldPath: 'amount', format: { prefix: '$', suffix: ' USD', mode: 'preset', preset: { type: 'number', minimumFractionDigits: 2 } } },
      rows: { sourceId: 'invoice', fieldPath: 'rows', format: { prefix: 'rows:' } },
      key: { sourceId: 'invoice', fieldPath: 'key', format: { prefix: 'key:' } },
    })
    const format = createMaterialDisplayBindingResolver({
      node,
      bindingDefinition,
      baseScope: { key: 'document', data: { amount: 12, rows: [{ id: 1 }], key: 'a' } },
      reportDiagnostic: report,
    })

    expect(format('title')).toEqual({ status: 'resolved', text: '$12.00 USD' })
    expect(format('rows')).toEqual({ status: 'invalid' })
    expect(format('key')).toEqual({ status: 'invalid' })
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ code: 'MATERIAL_BINDING_DISPLAY_ROLE_REQUIRED', port: 'rows' }))
  })
})
