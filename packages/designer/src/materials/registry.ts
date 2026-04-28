import type { DesignerStore } from '../store/designer-store'
import type { MaterialCapabilities, MaterialCatalogEntry, MaterialDefinition, MaterialExtensionFactory, PanelSectionId, PropSchema } from '../types'
import { getPropSchemas } from './prop-schemas'

// ─── Material definitions ────────────────────────────────────────────

export interface DesignerMaterialRegistration {
  type: string
  name: string
  icon: string
  category: MaterialDefinition['category']
  capabilities: MaterialCapabilities
  createDefaultNode: MaterialDefinition['createDefaultNode']
  factory: MaterialExtensionFactory
  /** Material-owned PropSchemas appended to designer's static registry entries. */
  propSchemas?: PropSchema[]
  sectionFilter?: MaterialDefinition['sectionFilter']
}

export interface DesignerCatalogRegistration {
  type: string
  group: MaterialCatalogEntry['group']
}

export interface DesignerMaterialBundle {
  materials: DesignerMaterialRegistration[]
  quickMaterialTypes: string[]
  groupedCatalog: DesignerCatalogRegistration[]
}

/**
 * Table materials hide element-level BindingSection.
 * Cell-level binding is shown via PropertyPanelOverlay during deep editing.
 */
function tableSectionFilter(sectionId: PanelSectionId): boolean {
  if (sectionId === 'binding')
    return false
  return true
}

// ─── Registration function ───────────────────────────────────────────

/**
 * Registers a material bundle, its designer extensions, and its catalog entries
 * on the given DesignerStore.
 *
 * Architecture ref: 11.1 (MaterialDefinition), 11.2 (catalog hierarchy),
 *                   10.2 (quick + grouped material bar)
 */
export function registerMaterialBundle(store: DesignerStore, bundle: DesignerMaterialBundle): void {
  for (const entry of bundle.materials) {
    const baseProps = getPropSchemas(entry.type)
    const mergedProps = entry.propSchemas
      ? [...baseProps, ...entry.propSchemas]
      : baseProps
    const definition: MaterialDefinition = {
      type: entry.type,
      name: entry.name,
      icon: entry.icon,
      category: entry.category,
      capabilities: entry.capabilities,
      props: mergedProps,
      createDefaultNode: entry.createDefaultNode,
      sectionFilter: entry.sectionFilter,
    }

    store.registerMaterial(definition)
    store.registerDesignerFactory(entry.type, entry.factory)
  }

  // Register quick material catalog entries
  for (const type of bundle.quickMaterialTypes) {
    const def = store.getMaterial(type)
    if (!def)
      continue
    store.registerCatalogEntry({
      id: `quick-${type}`,
      group: 'quick',
      label: def.name,
      icon: def.icon,
      materialType: type,
      priority: 'quick',
    })
  }

  // Register grouped material catalog entries
  for (const { type, group } of bundle.groupedCatalog) {
    const def = store.getMaterial(type)
    if (!def)
      continue
    store.registerCatalogEntry({
      id: `grouped-${type}`,
      group,
      label: def.name,
      icon: def.icon,
      materialType: type,
      priority: 'grouped',
    })
  }
}

export { tableSectionFilter }
