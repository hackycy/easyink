import type { MaterialCatalogEntry, MaterialDefinition, MaterialDesignerExtension, MaterialExtensionFactory } from '../types'
import type { DesignerStore } from './designer-store'
import { markRaw } from 'vue'
import { createMaterialExtensionContext } from '../materials/extension-context'

export class MaterialRegistry {
  private materials = markRaw(new Map<string, MaterialDefinition>())
  private factories = markRaw(new Map<string, MaterialExtensionFactory>())
  private cachedExtensions = markRaw(new Map<string, MaterialDesignerExtension>())
  private catalog: MaterialCatalogEntry[] = []

  registerMaterial(definition: MaterialDefinition): void {
    this.materials.set(definition.type, markRaw({
      ...definition,
      icon: markRaw(definition.icon),
    }))
  }

  getMaterial(type: string): MaterialDefinition | undefined {
    return this.materials.get(type)
  }

  registerCatalogEntry(entry: MaterialCatalogEntry): void {
    this.catalog.push(markRaw({
      ...entry,
      icon: markRaw(entry.icon),
    }))
  }

  getCatalog(): MaterialCatalogEntry[] {
    return this.catalog
  }

  getQuickMaterials(): MaterialCatalogEntry[] {
    return this.catalog.filter(entry => entry.priority === 'quick')
  }

  getGroupedMaterials(group: string): MaterialCatalogEntry[] {
    return this.catalog.filter(entry => entry.group === group && entry.priority !== 'quick')
  }

  registerDesignerFactory(type: string, factory: MaterialExtensionFactory): void {
    this.factories.set(type, factory)
  }

  getDesignerExtension(type: string, store: DesignerStore): MaterialDesignerExtension | undefined {
    let extension = this.cachedExtensions.get(type)
    if (extension)
      return extension

    const factory = this.factories.get(type)
    if (!factory)
      return undefined

    extension = factory(createMaterialExtensionContext(store))
    this.cachedExtensions.set(type, extension)
    return extension
  }

  clear(): void {
    this.materials.clear()
    this.factories.clear()
    this.cachedExtensions.clear()
    this.catalog = []
  }
}
