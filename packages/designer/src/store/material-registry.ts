import type { LazyMaterialExtensionFactory, MaterialCatalogEntry, MaterialDefinition, MaterialDesignerExtension, MaterialExtensionFactory } from '../types'
import type { DesignerStore } from './designer-store'
import { markRaw } from 'vue'
import { createMaterialExtensionContext } from '../materials/extension-context'

const LOADING_EXTENSION: MaterialDesignerExtension = {
  renderContent(_nodeSignal, container) {
    container.replaceChildren()
    const el = document.createElement('div')
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.display = 'flex'
    el.style.alignItems = 'center'
    el.style.justifyContent = 'center'
    el.style.boxSizing = 'border-box'
    el.style.border = '1px dashed #d0d5dd'
    el.style.background = '#f9fafb'
    el.style.color = '#667085'
    el.style.fontSize = '12px'
    el.textContent = 'Loading...'
    container.appendChild(el)
    return () => container.replaceChildren()
  },
}

export class MaterialRegistry {
  private materials = markRaw(new Map<string, MaterialDefinition>())
  private factories = markRaw(new Map<string, MaterialExtensionFactory>())
  private lazyFactories = markRaw(new Map<string, LazyMaterialExtensionFactory>())
  private loadingLazyTypes = markRaw(new Set<string>())
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

  listMaterials(): MaterialDefinition[] {
    return Array.from(this.materials.values())
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
    this.lazyFactories.delete(type)
  }

  registerLazyDesignerFactory(type: string, loader: LazyMaterialExtensionFactory): void {
    this.lazyFactories.set(type, loader)
    this.factories.delete(type)
  }

  getDesignerExtension(type: string, store: DesignerStore): MaterialDesignerExtension | undefined {
    let extension = this.cachedExtensions.get(type)
    if (extension)
      return extension

    const factory = this.factories.get(type)
    if (!factory) {
      this.loadLazyDesignerFactory(type, store)
      return this.lazyFactories.has(type) ? LOADING_EXTENSION : undefined
    }

    try {
      extension = factory(createMaterialExtensionContext(store))
    }
    catch (err) {
      store.diagnostics.push({
        source: 'material-extension',
        severity: 'error',
        message: `Material extension failed to initialize: ${type}`,
        detail: { type, error: err instanceof Error ? err.message : String(err) },
      })
      return undefined
    }

    this.cachedExtensions.set(type, extension)
    return extension
  }

  clear(): void {
    this.materials.clear()
    this.factories.clear()
    this.lazyFactories.clear()
    this.loadingLazyTypes.clear()
    this.cachedExtensions.clear()
    this.catalog = []
  }

  private loadLazyDesignerFactory(type: string, store: DesignerStore): void {
    const loader = this.lazyFactories.get(type)
    if (!loader || this.loadingLazyTypes.has(type))
      return

    this.loadingLazyTypes.add(type)
    loader()
      .then((factory) => {
        this.loadingLazyTypes.delete(type)
        this.lazyFactories.delete(type)
        this.factories.set(type, factory)
        store.notifyMaterialExtensionLoaded()
      })
      .catch((err) => {
        this.loadingLazyTypes.delete(type)
        store.diagnostics.push({
          source: 'material-extension',
          severity: 'error',
          message: `Lazy material extension failed to load: ${type}`,
          detail: { type, error: err instanceof Error ? err.message : String(err) },
        })
      })
  }
}
