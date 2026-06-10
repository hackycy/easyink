import type { AIMaterialDescriptor } from '@easyink/shared'
import type { DesignerStore } from '../store/designer-store'
import type { LazyMaterialExtensionFactory, LocaleMessageRegistration, MaterialCapabilities, MaterialCatalogEntry, MaterialCatalogGroup, MaterialDefinition, MaterialExtensionFactory, PanelSectionId, PropSchema } from '../types'

// ─── Material definitions ────────────────────────────────────────────

export interface DesignerMaterialRegistration {
  type: string
  name: string
  icon: MaterialDefinition['icon']
  category: MaterialDefinition['category']
  capabilities: MaterialCapabilities
  binding: MaterialDefinition['binding']
  createDefaultNode: MaterialDefinition['createDefaultNode']
  factory: MaterialExtensionFactory
  lazyFactory?: LazyMaterialExtensionFactory
  aiDescriptor?: AIMaterialDescriptor
  /** Designer property schemas owned by this material. */
  propSchemas?: PropSchema[]
  localeMessages?: LocaleMessageRegistration
  sectionFilter?: MaterialDefinition['sectionFilter']
}

export interface DesignerCatalogRegistration {
  id?: string
  type: string
  label?: string
  icon?: MaterialCatalogEntry['icon']
  createDefaultNode?: MaterialDefinition['createDefaultNode']
  dragData?: string
  order?: number
}

export interface DesignerCatalogGroupRegistration {
  id: string
  label: string
  order?: number
  items: DesignerCatalogRegistration[]
}

export interface DesignerMaterialBundle {
  materials: DesignerMaterialRegistration[]
  catalogs: DesignerCatalogGroupRegistration[]
  localeMessages?: LocaleMessageRegistration
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
 *                   10.2 (material catalog groups)
 */
export function registerMaterialBundle(store: DesignerStore, bundle: DesignerMaterialBundle): () => void {
  const unregisterLocaleMessages: Array<() => void> = []
  if (bundle.localeMessages)
    unregisterLocaleMessages.push(store.registerLocaleMessages(bundle.localeMessages))

  for (const entry of bundle.materials) {
    if (entry.localeMessages)
      unregisterLocaleMessages.push(store.registerLocaleMessages(entry.localeMessages))

    const definition: MaterialDefinition = {
      type: entry.type,
      name: entry.name,
      icon: entry.icon,
      category: entry.category,
      capabilities: entry.capabilities,
      binding: entry.binding,
      props: entry.propSchemas ? [...entry.propSchemas] : [],
      aiDescriptor: entry.aiDescriptor,
      createDefaultNode: entry.createDefaultNode,
      sectionFilter: entry.sectionFilter,
    }

    store.registerMaterial(definition)
    if (entry.lazyFactory)
      store.registerLazyDesignerFactory(entry.type, entry.lazyFactory)
    else
      store.registerDesignerFactory(entry.type, entry.factory)
  }

  for (const group of bundle.catalogs) {
    const items: MaterialCatalogEntry[] = []
    for (const entry of group.items) {
      const def = store.getMaterial(entry.type)
      if (!def)
        continue
      items.push({
        id: entry.id ?? `${group.id}-${entry.type}`,
        groupId: group.id,
        label: entry.label ?? def.name,
        icon: entry.icon ?? def.icon,
        materialType: entry.type,
        createDefaultNode: entry.createDefaultNode,
        dragData: entry.dragData,
        order: entry.order,
      })
    }
    if (items.length === 0)
      continue
    const catalogGroup: MaterialCatalogGroup = {
      id: group.id,
      label: group.label,
      order: group.order,
      items,
    }
    store.registerCatalogGroup(catalogGroup)
  }

  return () => {
    for (const unregister of unregisterLocaleMessages)
      unregister()
  }
}

export { tableSectionFilter }
