import type { DesignerContext } from '@easyink/plugin-api/designer'
import { describe, expect, it } from 'vitest'
import { createAssistantMaterialManifest } from './material-manifest'

describe('assistant material manifest bridge', () => {
  it('serializes active designer materials without function props', () => {
    const store = {
      getMaterials: () => [
        {
          model: {
            type: 'text',
            capabilities: { resizable: true },
            binding: { kind: 'ordinary', primaryProp: 'content', formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' } },
          },
          ui: { palette: [{ label: 'Text' }] },
          properties: [
            {
              key: 'content',
              label: 'Content',
              type: 'string',
              visible: () => true,
              default: 'Hello',
            },
          ],
          ai: {
            type: 'text',
            description: 'Text material',
            properties: ['content'],
            binding: 'single' as const,
          },
        },
      ],
    } as unknown as DesignerContext

    const manifest = createAssistantMaterialManifest(store)

    expect(manifest.materials).toEqual([
      {
        type: 'text',
        name: 'Text',
        capabilities: { resizable: true },
        binding: { kind: 'ordinary', primaryProp: 'content', formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' } },
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
