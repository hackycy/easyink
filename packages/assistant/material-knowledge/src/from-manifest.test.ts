import type { ManifestEntry, ManifestLike, ManifestMaterialBindingDefinition } from './from-manifest'
import { describe, expect, it } from 'vitest'
import { createRegistryFromManifest } from './from-manifest'

function manifest(...materials: ManifestEntry[]): ManifestLike {
  return { version: 1, profileId: 'test', engineVersion: '0.0.30', materials }
}

function entry(type: string, binding: ManifestMaterialBindingDefinition, overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    type,
    modelVersion: 1,
    common: {
      nameKey: `materials.${type}.name`,
      category: 'test',
      defaultNode: { width: 50, height: 20 },
      binding,
      properties: [],
    },
    generation: { modelSchema: {}, bindingShape: {}, examples: [{}] },
    ...overrides,
  }
}

describe('createRegistryFromManifest', () => {
  it('synthesizes ordinary knowledge from canonical ports and properties', () => {
    const registry = createRegistryFromManifest(manifest(entry('external-title', {
      kind: 'ports',
      ports: [{ role: 'display', valueShape: 'scalar' }],
    }, {
      common: {
        nameKey: 'materials.external-title.name',
        category: 'typography',
        defaultNode: { width: 80, height: 12 },
        binding: { kind: 'ports', ports: [{ role: 'display', valueShape: 'scalar' }] },
        properties: [
          { key: 'content', type: 'string', default: '' },
          { key: 'fontSize', type: 'number', default: 14 },
          { key: 'tone', type: 'enum', enum: [{ value: 'quiet' }, { value: 'strong' }] },
        ],
      },
    })))

    expect(registry.get('external-title')).toMatchObject({
      category: 'typography',
      sizing: { defaultSize: { width: 80, height: 12 } },
      bindingSpec: { mode: 'scalar', produces: { kind: 'scalar-field', fieldCount: 'single' } },
    })
    expect(registry.get('external-title')?.properties).toHaveLength(3)
  })

  it('synthesizes collection knowledge from canonical data contracts', () => {
    const registry = createRegistryFromManifest(manifest(entry('chart-line', {
      kind: 'ports',
      ports: [{ role: 'semantic', valueShape: 'record-array' }],
      dataContract: {
        version: 3,
        model: { kind: 'tabular', fields: { category: { type: 'string', required: true }, value: { type: 'number', required: true } } },
      },
    }, { common: {
      nameKey: 'materials.chart-line.name',
      category: 'visualization',
      defaultNode: { width: 100, height: 60 },
      binding: {
        kind: 'ports',
        ports: [{ role: 'semantic', valueShape: 'record-array' }],
        dataContract: { version: 3, model: { kind: 'tabular', fields: { category: { type: 'string', required: true }, value: { type: 'number', required: true } } } },
      },
      properties: [],
    } })))

    expect(registry.get('chart-line')).toMatchObject({
      category: 'visualization',
      bindingSpec: { mode: 'collection', accepts: { minChildren: 2, requiredChildFields: ['category', 'value'] } },
    })
  })

  it('ignores the removed container material', () => {
    const registry = createRegistryFromManifest(manifest(entry('container', { kind: 'none' })))
    expect(registry.has('container')).toBe(false)
  })
})
