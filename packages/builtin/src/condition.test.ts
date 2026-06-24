import { describe, expect, it } from 'vitest'
import { builtinDesignerMaterialBundle as basicDesigner, builtinViewerMaterialBundle as basicViewer } from './basic'
import { createBuiltinDesignerMaterialBundle } from './designer'
import { createBuiltinViewerMaterialBundle } from './viewer'

describe('builtin conditional rendering capabilities', () => {
  it('uses the framework default condition capability without builtin material overrides', () => {
    const designer = createBuiltinDesignerMaterialBundle('all')
    const viewer = createBuiltinViewerMaterialBundle('all')

    expect(designer.materials.filter(material => material.condition !== undefined)).toEqual([])
    expect(viewer.materials.filter(material => material.extension.condition !== undefined)).toEqual([])
    expect(basicDesigner.materials.filter(material => material.condition !== undefined)).toEqual([])
    expect(basicViewer.materials.filter(material => material.extension.condition !== undefined)).toEqual([])
  })
})
