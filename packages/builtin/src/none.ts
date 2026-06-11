import type { BuiltinDesignerMaterialBundle, BuiltinViewerMaterialBundle, BuiltinViewerRegistrar } from './types'

export type {
  BuiltinDesignerCatalogGroupRegistration,
  BuiltinDesignerCatalogRegistration,
  BuiltinDesignerMaterialBundle,
  BuiltinDesignerMaterialRegistration,
  BuiltinLocaleMessages,
  BuiltinMaterialSet,
  BuiltinViewerMaterialBundle,
  BuiltinViewerMaterialRegistration,
  BuiltinViewerRegistrar,
} from './types'

export const builtinDesignerMaterialBundle: BuiltinDesignerMaterialBundle = {
  materials: [],
  catalogs: [],
}
export const builtinDesignerMaterials = builtinDesignerMaterialBundle.materials
export const builtinViewerMaterialBundle: BuiltinViewerMaterialBundle = {
  materials: [],
}
export const builtinViewerMaterials = builtinViewerMaterialBundle.materials

export function registerBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  void register
}
