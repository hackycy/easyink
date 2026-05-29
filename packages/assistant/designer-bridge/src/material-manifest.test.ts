import type { DesignerStore } from '@easyink/designer'
import { describe, expect, it } from 'vitest'
import { createAssistantMaterialManifest } from './material-manifest'

describe('assistant material manifest bridge', () => {
  it('serializes active designer materials without function props', () => {
    const store = {
      listMaterials: () => [
        {
          type: 'text',
          name: 'Text',
          category: 'basic',
          capabilities: { bindable: true, resizable: true },
          props: [
            {
              key: 'content',
              label: 'Content',
              type: 'string',
              visible: () => true,
              default: 'Hello',
            },
          ],
          aiDescriptor: {
            type: 'text',
            description: 'Text material',
            properties: ['content'],
            binding: 'single' as const,
          },
        },
      ],
    } as unknown as DesignerStore

    const manifest = createAssistantMaterialManifest(store)

    expect(manifest.materials).toEqual([
      {
        type: 'text',
        name: 'Text',
        capabilities: { bindable: true, resizable: true },
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
          binding: 'single',
        },
      },
    ])
    expect(JSON.stringify(manifest)).not.toContain('visible')
  })
})
