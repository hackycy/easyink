import type { DocumentSchema } from '@easyink/schema'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { DataSourceAligner } from './datasource-aligner'

describe('dataSourceAligner material introspection', () => {
  it('discovers and writes escaped custom binding ports in nested slots', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'owner',
        slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      }),
      createTestMaterialManifest({
        type: 'custom-binding',
        defaultModel: { value: '' },
        binding: { kind: 'ports', ports: [{
          id: 'custom',
          key: { kind: 'exact', value: 'a/b~c' },
          role: 'display',
          valueShape: 'scalar',
          modelPath: '/model/value',
          formatEditor: false,
        }] },
      }),
    ])
    const child = profile.createNode('custom-binding', {
      id: 'child',
      bindings: { 'a/b~c': { sourceId: 'data', fieldPath: 'legacy.name' } },
    })
    const owner = profile.createNode('owner', { id: 'owner', slots: { content: [child] } })
    const schema: DocumentSchema = {
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 100, height: 100 },
      guides: { x: [], y: [] },
      elements: [owner],
    }
    const aligner = new DataSourceAligner()
    const dataSource = { id: 'data', name: 'data', fields: [{ name: 'name', path: 'customer/name' }] }

    const slots = aligner.extractBindings(schema, profile)
    const alignment = aligner.align(schema, dataSource, profile)
    const fixed = aligner.applyAlignment(schema, alignment, profile)

    expect(slots).toEqual([expect.objectContaining({ elementId: 'child', path: '/bindings/a~1b~0c' })])
    expect(fixed.elements[0]?.slots.content?.[0]?.bindings['a/b~c']).toMatchObject({ fieldPath: 'customer/name' })
  })
})
