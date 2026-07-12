import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { projectBindings, walkProfileMaterialNodes } from './binding-projector'

const mocks = vi.hoisted(() => ({
  formatBindingDisplayValue: vi.fn((value: unknown, _binding: unknown, context: { data?: Record<string, unknown> }) => ({
    value: `${String(value)} / ${String(context.data?.invoiceNo)}`,
    diagnostics: [],
  })),
}))

vi.mock('@easyink/core', async importOriginal => ({
  ...await importOriginal<typeof import('@easyink/core')>(),
  formatBindingDisplayValue: mocks.formatBindingDisplayValue,
  hasBindingFormat: () => true,
  resolveBindingValue: (_binding: unknown, data: Record<string, unknown>) => (data.customer as { name: string }).name,
}))

describe('projectBindings', () => {
  it('passes the current runtime data to custom binding formatters', () => {
    mocks.formatBindingDisplayValue.mockClear()
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
          custom: { source: '(value, data) => value + " / " + data.invoiceNo' },
        },
      } },
      output: { visibility: 'include' },
    }, data)

    expect(projected).toEqual([{
      port: 'value',
      value: 'Ada / INV-001',
      diagnostics: [],
    }])
    expect(mocks.formatBindingDisplayValue).toHaveBeenCalledWith(
      'Ada',
      expect.objectContaining({ fieldPath: 'customer/name' }),
      { data },
    )
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
