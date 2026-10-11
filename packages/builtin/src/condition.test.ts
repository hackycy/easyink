import { resolveMaterialConditionCapability } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { builtinDesignerMaterialBundle as basicDesigner, builtinViewerMaterialBundle as basicViewer } from './basic'
import { createBuiltinDesignerMaterialBundle } from './designer'
import { createBuiltinViewerMaterialBundle } from './viewer'

describe('builtin conditional rendering capabilities', () => {
  it('preserves framework default conditions when text/image declare them in the shared model', () => {
    const designer = createBuiltinDesignerMaterialBundle('all')
    const viewer = createBuiltinViewerMaterialBundle('all')

    expect(designer.materials.filter(material => material.condition !== undefined).map(material => material.type)).toEqual(['text', 'image'])
    expect(viewer.materials.filter(material => material.extension.condition !== undefined)).toEqual([])
    expect(basicDesigner.materials.filter(material => material.condition !== undefined).map(material => material.type)).toEqual(['text', 'image'])
    expect(basicViewer.materials.filter(material => material.extension.condition !== undefined)).toEqual([])
    const expected = { scope: 'node', hiddenEffects: ['remove', 'reserve'] }
    for (const material of [...designer.materials, ...basicDesigner.materials])
      expect(resolveMaterialConditionCapability(material.condition)).toEqual(expected)
    for (const material of [...viewer.materials, ...basicViewer.materials])
      expect(resolveMaterialConditionCapability(material.extension.condition)).toEqual(expected)
  })
})
