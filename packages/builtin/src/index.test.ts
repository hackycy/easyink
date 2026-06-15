import { describe, expect, it } from 'vitest'
import {
  builtinAllDesignerMaterialBundle,
  builtinAllDesignerMaterials,
  builtinAllViewerMaterialBundle,
  builtinAllViewerMaterials,
  builtinBasicDesignerMaterialBundle,
  builtinBasicViewerMaterialBundle,
  builtinDesignerMaterialBundle,
  builtinDesignerMaterials,
  builtinDesignerMaterialSets,
  builtinNoneDesignerMaterialBundle,
  builtinNoneViewerMaterialBundle,
  builtinViewerMaterialBundle,
  builtinViewerMaterials,
  builtinViewerMaterialSets,
  registerAllBuiltinViewerMaterials,
  registerBasicBuiltinViewerMaterials,
  registerNoneBuiltinViewerMaterials,
} from './index'

describe('builtin root entry', () => {
  it('exposes all material bundle aliases equivalent to the all set', () => {
    expect(builtinDesignerMaterialBundle).toBe(builtinDesignerMaterialSets.all)
    expect(builtinDesignerMaterials).toBe(builtinDesignerMaterialSets.all.materials)
    expect(builtinViewerMaterialBundle).toBe(builtinViewerMaterialSets.all)
    expect(builtinViewerMaterials).toBe(builtinViewerMaterialSets.all.materials)
    expect(builtinAllDesignerMaterialBundle).toBe(builtinDesignerMaterialSets.all)
    expect(builtinAllDesignerMaterials).toBe(builtinDesignerMaterialSets.all.materials)
    expect(builtinAllViewerMaterialBundle).toBe(builtinViewerMaterialSets.all)
    expect(builtinAllViewerMaterials).toBe(builtinViewerMaterialSets.all.materials)
  })

  it('exposes basic and none material bundles from the root entry', () => {
    expect(builtinBasicDesignerMaterialBundle).toBe(builtinDesignerMaterialSets.basic)
    expect(builtinBasicViewerMaterialBundle).toBe(builtinViewerMaterialSets.basic)
    expect(builtinNoneDesignerMaterialBundle).toBe(builtinDesignerMaterialSets.none)
    expect(builtinNoneViewerMaterialBundle).toBe(builtinViewerMaterialSets.none)
  })

  it('registers all, basic, and none viewer materials without subpath imports', () => {
    const allTypes: string[] = []
    const basicTypes: string[] = []
    const noneTypes: string[] = []

    registerAllBuiltinViewerMaterials(type => allTypes.push(type))
    registerBasicBuiltinViewerMaterials(type => basicTypes.push(type))
    registerNoneBuiltinViewerMaterials(type => noneTypes.push(type))

    expect(allTypes).toEqual(builtinViewerMaterialSets.all.materials.map(material => material.type))
    expect(basicTypes).toEqual(builtinViewerMaterialSets.basic.materials.map(material => material.type))
    expect(noneTypes).toEqual([])
  })
})
