import type { BuiltinViewerRegistrar } from './types'
import { builtinDesignerMaterialSets } from './designer'
import { builtinViewerMaterialSets, registerBuiltinViewerMaterialBundle } from './viewer'

export * from './ai'
export * from './designer'
export * from './types'
export * from './viewer'

export const builtinDesignerMaterialBundle = builtinDesignerMaterialSets.all
export const builtinDesignerMaterials = builtinDesignerMaterialBundle.materials
export const builtinViewerMaterialBundle = builtinViewerMaterialSets.all
export const builtinViewerMaterials = builtinViewerMaterialBundle.materials

export const builtinAllDesignerMaterialBundle = builtinDesignerMaterialSets.all
export const builtinAllDesignerMaterials = builtinAllDesignerMaterialBundle.materials
export const builtinAllViewerMaterialBundle = builtinViewerMaterialSets.all
export const builtinAllViewerMaterials = builtinAllViewerMaterialBundle.materials

export const builtinBasicDesignerMaterialBundle = builtinDesignerMaterialSets.basic
export const builtinBasicDesignerMaterials = builtinBasicDesignerMaterialBundle.materials
export const builtinBasicViewerMaterialBundle = builtinViewerMaterialSets.basic
export const builtinBasicViewerMaterials = builtinBasicViewerMaterialBundle.materials

export const builtinNoneDesignerMaterialBundle = builtinDesignerMaterialSets.none
export const builtinNoneDesignerMaterials = builtinNoneDesignerMaterialBundle.materials
export const builtinNoneViewerMaterialBundle = builtinViewerMaterialSets.none
export const builtinNoneViewerMaterials = builtinNoneViewerMaterialBundle.materials

export function registerAllBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  registerBuiltinViewerMaterialBundle(register, builtinAllViewerMaterialBundle)
}

export function registerBasicBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  registerBuiltinViewerMaterialBundle(register, builtinBasicViewerMaterialBundle)
}

export function registerNoneBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  registerBuiltinViewerMaterialBundle(register, builtinNoneViewerMaterialBundle)
}
