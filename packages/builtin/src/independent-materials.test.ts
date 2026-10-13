import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createAssistantMaterialManifest } from '../../assistant/designer-bridge/src/material-manifest'
import { DesignerStore } from '../../designer/src/store/designer-store'
import { createViewer } from '../../viewer/src/index'
import { materials as designerMaterials } from './all/designer'
import { materials as viewerMaterials } from './all/viewer'

describe('independent complete builtin materials', () => {
  it.each(designerMaterials.map(material => [material.model.type, material] as const))('consumes %s without another material or builtin registrar', async (type, material) => {
    const viewerMaterial = viewerMaterials.find(candidate => candidate.model.type === type)!
    const node = material.model.createDefaultNode({ id: `independent-${type}` })
    const store = await DesignerStore.create({
      materials: [material],
      schema: { elements: [node] },
      extensions: [{ id: 'inspect', commands: [{ id: 'manifest', handler: (_args, context) => createAssistantMaterialManifest(context) }] }],
    })
    const container = document.createElement('div')
    const viewer = await createViewer({ materials: [viewerMaterial], container })
    try {
      expect(material.model).toBe(viewerMaterial.model)
      expect(store.listMaterials().map(item => item.type)).toEqual([type])
      const definition = store.getMaterial(type)!
      expect(definition.binding).toEqual(material.model.binding)
      expect(definition.props).toEqual(material.properties)
      expect(definition.aiDescriptor).toEqual(material.ai)
      expect(store.getCatalog().map(item => item.id)).toEqual(material.ui!.palette!.map(item => item.id))
      for (const preset of material.ui!.palette!) {
        expect(store.t(preset.label)).not.toBe(preset.label)
        expect(store.t(preset.group.label)).not.toBe(preset.group.label)
      }
      const manifest = createAssistantMaterialManifest(store.getExtensionContext(store.getContributions('designer.command')[0]!.owner))
      expect(manifest.materials.map(item => item.type)).toEqual([type])
      expect(manifest.materials[0]?.ai).toEqual(material.ai)
      if (material.loadRenderer) {
        expect(material.renderer).toBeUndefined()
        store.getDesignerExtension(type)
        await expect.poll(() => store.materialExtensionRevision).toBe(1)
      }
      const extension = store.getDesignerExtension(type)!
      const designerContainer = document.createElement('div')
      const cleanup = extension.renderContent({ get: () => node, subscribe: () => () => {} }, designerContainer)
      try {
        expect(designerContainer.childNodes.length).toBeGreaterThan(0)
      }
      finally {
        cleanup()
      }
      const result = await viewer.open({ schema: normalizeDocumentSchema({ elements: [node] }) })
      expect(result.status).toBe('completed')
      if (result.status !== 'completed')
        throw new Error('Expected completed independent render')
      expect(result.diagnostics.filter(item => /UNKNOWN_MATERIAL|MATERIAL_(?:RENDER|MEASURE|RENDER_SIZE)_ERROR/.test(item.code))).toEqual([])
      const outputId = node.repeat?.scope === 'every-output-page' ? `${node.id}__p0` : node.id
      expect(container.querySelector(`[data-element-id="${outputId}"]`)).not.toBeNull()
    }
    finally {
      const [designerCleanup, viewerCleanup] = await Promise.all([store.destroy(), viewer.destroy()])
      expect(designerCleanup.errors).toEqual([])
      expect(viewerCleanup.errors).toEqual([])
      expect(container.childNodes).toHaveLength(0)
    }
  }, 15000)
})
