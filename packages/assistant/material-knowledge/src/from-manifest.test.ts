import { describe, expect, it } from 'vitest'
import { createRegistryFromManifest } from './from-manifest'

describe('createRegistryFromManifest', () => {
  it('synthesizes ordinary material knowledge from binding and props without ai metadata', () => {
    const registry = createRegistryFromManifest({
      materials: [
        {
          type: 'external-title',
          name: 'External Title',
          binding: { kind: 'ordinary', primaryProp: 'content', formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' } },
          props: [
            { key: 'content', type: 'string', default: '' },
            { key: 'fontSize', type: 'number', default: 14 },
            { key: 'tone', type: 'enum', enum: [{ value: 'quiet' }, { value: 'strong' }] },
          ],
        },
      ],
    })

    const knowledge = registry.get('external-title')
    expect(knowledge?.bindingSpec).toMatchObject({
      mode: 'scalar',
      accepts: { types: ['string', 'number', 'boolean', 'date', 'image-url'] },
      produces: { kind: 'scalar-field', fieldCount: 'single' },
    })
    expect(knowledge?.properties).toEqual([
      { key: 'content', type: 'string', required: false, defaultValue: '', enumValues: undefined },
      { key: 'fontSize', type: 'number', required: false, defaultValue: 14, enumValues: undefined },
      { key: 'tone', type: 'enum', required: true, defaultValue: undefined, enumValues: ['quiet', 'strong'] },
    ])
  })

  it('synthesizes data-contract material knowledge from target contract fields', () => {
    const registry = createRegistryFromManifest({
      materials: [
        {
          type: 'chart-line',
          name: 'Line Chart',
          binding: {
            kind: 'data-contract',
            formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
            contract: {
              version: 3,
              model: {
                kind: 'tabular',
                fields: {
                  category: { type: 'string', required: true },
                  value: { type: 'number', required: true },
                },
              },
            },
          },
        },
      ],
    })

    expect(registry.get('chart-line')).toMatchObject({
      category: 'visualization',
      bindingSpec: {
        mode: 'collection',
        accepts: {
          types: ['string', 'number'],
          isArray: true,
          minChildren: 2,
          requiredChildFields: ['category', 'value'],
        },
        produces: { kind: 'multi-field', fieldCount: 'multiple' },
      },
    })
  })

  it('ignores the removed container material even if a stale manifest includes it', () => {
    const registry = createRegistryFromManifest({
      materials: [
        {
          type: 'container',
          name: 'Removed Container',
          binding: { kind: 'none' },
        },
      ],
    })

    expect(registry.has('container')).toBe(false)
    expect(registry.types()).not.toContain('container')
  })
})
