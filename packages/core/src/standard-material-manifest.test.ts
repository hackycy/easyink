import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { recordSchemaAdapter } from './schema-adapter'
import { defineStandardMaterialManifest } from './standard-material-manifest'
import { viewerText } from './viewer-render-tree'

describe('defineStandardMaterialManifest', () => {
  it('publishes the exact same viewer layout facet to Designer and Viewer', async () => {
    const defaultNode: MaterialNode = {
      id: 'shared-layout-default',
      type: 'shared-layout',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }
    const viewerLayout = {
      fragment: {
        createFragment(request: any) {
          return {
            inlineSize: request.plan.borderBox.width,
            blockSize: request.endBlockOffset - request.startBlockOffset,
            consumedRange: {
              startBlockOffset: request.startBlockOffset,
              endBlockOffset: request.endBlockOffset,
            },
            diagnostics: [],
          }
        },
      },
    }
    const manifest = defineStandardMaterialManifest({
      type: 'shared-layout',
      nameKey: 'materials.sharedLayout.name',
      category: 'test',
      iconKey: 'shared-layout',
      catalogOrder: 1,
      defaultNode,
      interaction: { rotatable: false, resizable: true },
      binding: { kind: 'none' },
      layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
      properties: [],
      schemaAdapter: recordSchemaAdapter(1),
      designerFactory: () => ({ renderContent: () => () => {} }),
      viewerExtension: { render: () => ({ tree: viewerText('shared') }) },
      viewerLayout,
      aiDescriptor: {},
      generation: { enabled: false },
    })

    const designer = await manifest.facets.designer!({ services: {} } as never)
    const viewer = await manifest.facets.viewer!({ services: {} } as never)

    expect(designer.layout).toBe(viewerLayout)
    expect(viewer.layout).toBe(viewerLayout)
    expect(designer.layout).toBe(viewer.layout)
  })
})
