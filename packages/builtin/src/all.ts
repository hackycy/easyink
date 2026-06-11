import type { BuiltinViewerRegistrar } from './types'
import { builtinDesignerMaterialSets } from './designer'
import { builtinViewerMaterialSets, registerBuiltinViewerMaterialBundle } from './viewer'

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

export const builtinDesignerMaterialBundle = builtinDesignerMaterialSets.all
export const builtinDesignerMaterials = builtinDesignerMaterialBundle.materials
export const builtinViewerMaterialBundle = builtinViewerMaterialSets.all
export const builtinViewerMaterials = builtinViewerMaterialBundle.materials

export function registerBuiltinViewerMaterials(register: BuiltinViewerRegistrar): void {
  registerBuiltinViewerMaterialBundle(register, builtinViewerMaterialBundle)
}
