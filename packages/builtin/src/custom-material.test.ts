import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { DesignerStore } from '../../designer/src/store/designer-store'
import { createViewer } from '../../viewer/src/index'
import { materials as none } from './none'
import { badge } from './test-fixtures/custom-material/designer'
import { badge as viewerBadge } from './test-fixtures/custom-material/viewer'

describe('a custom package with explicit complete material selections', () => {
  it('provides presets, properties, locale and bound output without framework changes', async () => {
    const designerSelection: readonly DesignerMaterial[] = [...none, badge]
    const viewerSelection: readonly ViewerMaterial[] = [...none, viewerBadge]
    const node = badge.model.createDefaultNode({ binding: { sourceId: 'customer', fieldPath: 'name' } })
    const store = await DesignerStore.create({
      materials: designerSelection,
      schema: { elements: [node] },
    })
    const container = document.createElement('div')
    const viewer = await createViewer({ materials: viewerSelection, container })
    const designerContainer = document.createElement('div')
    let mounted: HTMLElement | null = null
    let unmount: (() => void) | undefined
    try {
      expect(badge.model).toBe(viewerBadge.model)
      expect(store.listMaterials().map(item => item.type)).toEqual(['vendor/badge'])
      const presets = store.getCatalog()
      expect(presets.map(preset => preset.id)).toEqual(['priority-badge', 'badge'])
      expect(presets[0]!.createDefaultNode!().props.label).toBe('Priority')
      expect(store.getMaterial('vendor/badge')?.props).toEqual(badge.properties)
      unmount = store.getDesignerExtension('vendor/badge')!.renderContent({ get: () => node, subscribe: () => () => {} }, designerContainer)
      expect(designerContainer.textContent).toBe('Badge: Badge')
      const result = await viewer.open({ schema: normalizeDocumentSchema({ elements: [node] }), data: { name: 'Ada' } })
      expect(result).toMatchObject({ status: 'completed', diagnostics: [] })
      mounted = container.querySelector('[data-element-id="badge"] span')
      expect(mounted?.textContent).toBe('Ada')
      expect(mounted?.hasAttribute('data-badge-live')).toBe(false)
    }
    finally {
      const closing = store.destroy()
      expect(store.destroy()).toBe(closing)
      const [designerCleanup, viewerCleanup] = await Promise.all([closing, viewer.destroy()])
      expect(designerCleanup.errors).toEqual([])
      expect(viewerCleanup.errors).toEqual([])
      expect(designerContainer.childNodes).toHaveLength(0)
      expect(container.childNodes).toHaveLength(0)
      unmount?.()
    }
    expect(mounted?.hasAttribute('data-badge-live')).toBe(false)
  })

  it('keeps none empty and diagnoses a persisted custom node until explicitly selected', async () => {
    const store = await DesignerStore.create({ materials: none })
    const container = document.createElement('div')
    const viewer = await createViewer({ materials: none, container })
    const schema = normalizeDocumentSchema({ elements: [badge.model.createDefaultNode()] })
    const before = JSON.stringify(schema)
    try {
      expect(store.listMaterials()).toEqual([])
      expect(store.getCatalog()).toEqual([])
      const result = await viewer.open({ schema })
      expect(result).toMatchObject({ status: 'completed', diagnostics: [expect.objectContaining({ code: 'UNKNOWN_MATERIAL', nodeId: 'badge' })] })
      expect(container.textContent).toContain('[Unknown: vendor/badge]')
      expect(JSON.stringify(schema)).toBe(before)
    }
    finally {
      await Promise.all([store.destroy(), viewer.destroy()])
    }
  })
})
