import type { DesignerStore } from '@easyink/designer'
import { describe, expect, it } from 'vitest'
import { createAssistantMaterialManifest } from './material-manifest'

describe('assistant material manifest bridge', () => {
  it('serializes active designer materials without function props', () => {
    const store = {
      t: (key: string) => key === 'materials.text.name' ? 'Text' : key,
      listEditableMaterialManifests: () => [
        {
          type: 'text',
          common: {
            nameKey: 'materials.text.name',
            interaction: { rotatable: true, resizable: true, supportsAnimation: true },
            structure: { slots: [] },
            binding: { kind: 'ports', ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar', modelPath: '/model/content', formatEditor: { tabs: ['preset'] } }] },
            properties: [{ key: 'content', label: 'Content', type: 'string', visible: () => true, default: 'Hello' }],
          },
          facets: {
            ai: { descriptor: { type: 'text', description: 'Text material', properties: ['content'], bindings: 'single' } },
          },
        },
      ],
    } as unknown as DesignerStore

    const manifest = createAssistantMaterialManifest(store)

    expect(manifest.materials).toEqual([
      {
        type: 'text',
        name: 'Text',
        capabilities: { bindable: true, rotatable: true, resizable: true, supportsChildren: false, supportsAnimation: true, multiBinding: false },
        binding: { kind: 'ordinary', primaryProp: 'content', formatEditor: { tabs: ['preset'], defaultTab: 'preset' } },
        props: [{
          key: 'content',
          label: 'Content',
          type: 'string',
          default: 'Hello',
        }],
        ai: {
          type: 'text',
          description: 'Text material',
          properties: ['content'],
          bindings: 'single',
        },
      },
    ])
    expect(JSON.stringify(manifest)).not.toContain('visible')
  })

  it('maps canonical data contracts and leaves non-exact port policies custom', () => {
    const contract = { version: 3 as const, model: { kind: 'tabular' as const, fields: { value: { labelKey: 'value', type: 'number' as const } } } }
    const material = (type: string, binding: unknown) => ({
      type,
      common: { nameKey: type, interaction: { rotatable: false, resizable: true }, structure: { slots: [] }, binding, properties: [] },
      facets: {},
    })
    const store = {
      t: (key: string) => key,
      listEditableMaterialManifests: () => [
        material('chart', { kind: 'ports', dataContract: contract, ports: [{ id: 'data', key: { kind: 'exact', value: 'dataset' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }] }),
        material('custom', { kind: 'ports', ports: [{ id: 'cell', key: { kind: 'prefix', value: 'cell:' }, role: 'display', valueShape: 'scalar', modelPath: '/model/cells', formatEditor: false }] }),
      ],
    } as unknown as DesignerStore

    const manifest = createAssistantMaterialManifest(store)

    expect(manifest.materials[0]?.binding).toEqual({ kind: 'data-contract', contract, formatEditor: false })
    expect(manifest.materials[1]?.binding).toEqual({ kind: 'custom' })
  })
})
