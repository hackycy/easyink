import { describe, expect, it } from 'vitest'
import { builtinDesignerMaterialBundle as basicDesigner, builtinViewerMaterialBundle as basicViewer } from './basic'
import { createBuiltinDesignerMaterialBundle } from './designer'
import { createBuiltinViewerMaterialBundle } from './viewer'

describe('builtin conditional rendering capabilities', () => {
  it('shares the same condition definition between designer and viewer for the first release materials', () => {
    const designer = createBuiltinDesignerMaterialBundle('all')
    const viewer = createBuiltinViewerMaterialBundle('all')
    const expected = ['text', 'image', 'barcode', 'qrcode', 'line', 'rect', 'ellipse', 'signature']

    for (const type of expected) {
      const designerCondition = designer.materials.find(material => material.type === type)?.condition
      const viewerCondition = viewer.materials.find(material => material.type === type)?.extension.condition
      expect(designerCondition, type).toBeDefined()
      expect(viewerCondition, type).toBe(designerCondition)
    }

    expect(designer.materials.filter(material => material.condition).map(material => material.type).sort()).toEqual([...expected].sort())

    for (const material of basicDesigner.materials.filter(item => item.condition)) {
      expect(basicViewer.materials.find(item => item.type === material.type)?.extension.condition).toBe(material.condition)
    }
  })
})
