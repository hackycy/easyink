import type { LazyMaterialExtensionFactory, MaterialCatalogEntry, MaterialDefinition, MaterialDesignerExtension, MaterialExtensionFactory } from '../types'
import type { DesignerStore } from './designer-store'
import { markRaw } from 'vue'
import { createMaterialExtensionContext } from '../materials/extension-context'

const SVG_NS = 'http://www.w3.org/2000/svg'

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
    el.appendChild(createLoadingIndicator())
    container.appendChild(el)
    return () => container.replaceChildren()
  },
}

function createLoadingIndicator(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '28')
  svg.setAttribute('height', '28')
  svg.setAttribute('viewBox', '0 0 50 50')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  const track = document.createElementNS(SVG_NS, 'circle')
  track.setAttribute('cx', '25')
  track.setAttribute('cy', '25')
  track.setAttribute('r', '18')
  track.setAttribute('fill', 'none')
  track.setAttribute('stroke', '#d0d5dd')
  track.setAttribute('stroke-width', '5')

  const arc = document.createElementNS(SVG_NS, 'circle')
  arc.setAttribute('cx', '25')
  arc.setAttribute('cy', '25')
  arc.setAttribute('r', '18')
  arc.setAttribute('fill', 'none')
  arc.setAttribute('stroke', '#667085')
  arc.setAttribute('stroke-width', '5')
  arc.setAttribute('stroke-linecap', 'round')
  arc.setAttribute('stroke-dasharray', '72 120')

  const spin = document.createElementNS(SVG_NS, 'animateTransform')
  spin.setAttribute('attributeName', 'transform')
  spin.setAttribute('type', 'rotate')
  spin.setAttribute('from', '0 25 25')
  spin.setAttribute('to', '360 25 25')
  spin.setAttribute('dur', '0.9s')
  spin.setAttribute('repeatCount', 'indefinite')
  arc.appendChild(spin)

  svg.append(track, arc)
  return svg
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
