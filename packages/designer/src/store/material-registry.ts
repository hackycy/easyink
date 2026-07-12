import type { LazyMaterialExtensionFactory, MaterialCatalogEntry, MaterialCatalogGroup, MaterialDefinition, MaterialDesignerExtension, MaterialExtensionFactory } from '../types'
import type { DesignerStore } from './designer-store'
import { markRaw } from 'vue'
import { createMaterialExtensionContext } from '../materials/extension-context'

const SVG_NS = 'http://www.w3.org/2000/svg'

interface Registration<T> {
  active: boolean
  value: T
  previous?: Registration<T>
}

type FactoryRegistration
  = | { kind: 'eager', factory: MaterialExtensionFactory }
    | { kind: 'lazy', factory: LazyMaterialExtensionFactory }

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
  private materialRegistrations = markRaw(new Map<string, Registration<MaterialDefinition>>())
  private factories = markRaw(new Map<string, MaterialExtensionFactory>())
  private lazyFactories = markRaw(new Map<string, LazyMaterialExtensionFactory>())
  private factoryRegistrations = markRaw(new Map<string, Registration<FactoryRegistration>>())
  private loadingLazyTypes = markRaw(new Set<string>())
  private cachedExtensions = markRaw(new Map<string, MaterialDesignerExtension>())
  private catalogGroups: MaterialCatalogGroup[] = []
  private catalogRegistrations = markRaw(new Map<string, Registration<MaterialCatalogGroup>>())

  registerMaterial(definition: MaterialDefinition): () => void {
    const value = markRaw({
      ...definition,
      icon: markRaw(definition.icon),
    })
    const registration: Registration<MaterialDefinition> = {
      active: true,
      value,
      previous: this.materialRegistrations.get(definition.type),
    }
    this.materialRegistrations.set(definition.type, registration)
    this.materials.set(definition.type, value)
    return this.createRegistrationCleanup(registration, this.materialRegistrations, (current) => {
      if (current)
        this.materials.set(definition.type, current.value)
      else
        this.materials.delete(definition.type)
    })
  }

  getMaterial(type: string): MaterialDefinition | undefined {
    return this.materials.get(type)
  }

  listMaterials(): MaterialDefinition[] {
    return Array.from(this.materials.values())
  }

  registerCatalogGroup(group: MaterialCatalogGroup): () => void {
    const normalized = markRaw({
      ...group,
      items: group.items
        .map(entry => markRaw({
          ...entry,
          icon: markRaw(entry.icon),
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    })

    const registration: Registration<MaterialCatalogGroup> = {
      active: true,
      value: normalized,
      previous: this.catalogRegistrations.get(group.id),
    }
    this.catalogRegistrations.set(group.id, registration)
    this.rebuildCatalogGroup(group.id)
    return this.createRegistrationCleanup(registration, this.catalogRegistrations, () => this.rebuildCatalogGroup(group.id))
  }

  getCatalog(): MaterialCatalogEntry[] {
    return this.catalogGroups.flatMap(group => group.items)
  }

  getCatalogGroups(): MaterialCatalogGroup[] {
    return this.catalogGroups
  }

  registerDesignerFactory(type: string, factory: MaterialExtensionFactory): () => void {
    return this.registerFactory(type, { kind: 'eager', factory })
  }

  registerLazyDesignerFactory(type: string, loader: LazyMaterialExtensionFactory): () => void {
    return this.registerFactory(type, { kind: 'lazy', factory: loader })
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
    this.materialRegistrations.clear()
    this.factories.clear()
    this.lazyFactories.clear()
    this.factoryRegistrations.clear()
    this.loadingLazyTypes.clear()
    this.cachedExtensions.clear()
    this.catalogGroups = []
    this.catalogRegistrations.clear()
  }

  private loadLazyDesignerFactory(type: string, store: DesignerStore): void {
    const loader = this.lazyFactories.get(type)
    if (!loader || this.loadingLazyTypes.has(type))
      return

    this.loadingLazyTypes.add(type)
    loader()
      .then((factory) => {
        this.loadingLazyTypes.delete(type)
        if (this.lazyFactories.get(type) !== loader)
          return
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

  private registerFactory(type: string, value: FactoryRegistration): () => void {
    const registration: Registration<FactoryRegistration> = {
      active: true,
      value,
      previous: this.factoryRegistrations.get(type),
    }
    this.factoryRegistrations.set(type, registration)
    this.applyFactoryRegistration(type, registration)
    return this.createRegistrationCleanup(registration, this.factoryRegistrations, current => this.applyFactoryRegistration(type, current))
  }

  private applyFactoryRegistration(type: string, registration: Registration<FactoryRegistration> | undefined): void {
    this.factories.delete(type)
    this.lazyFactories.delete(type)
    this.loadingLazyTypes.delete(type)
    this.cachedExtensions.delete(type)
    if (!registration)
      return
    if (registration.value.kind === 'eager')
      this.factories.set(type, registration.value.factory)
    else
      this.lazyFactories.set(type, registration.value.factory)
  }

  private rebuildCatalogGroup(id: string): void {
    const current = this.catalogRegistrations.get(id)
    const layers: MaterialCatalogGroup[] = []
    for (let layer = current; layer; layer = layer.previous) {
      if (layer.active)
        layers.unshift(layer.value)
    }
    const index = this.catalogGroups.findIndex(group => group.id === id)
    if (layers.length === 0) {
      if (index >= 0)
        this.catalogGroups.splice(index, 1)
      return
    }
    const items = new Map<string, MaterialCatalogEntry>()
    for (const layer of layers) {
      for (const item of layer.items)
        items.set(item.id, item)
    }
    const latest = layers.at(-1)!
    const rebuilt = markRaw({
      ...latest,
      items: [...items.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    })
    if (index >= 0)
      this.catalogGroups.splice(index, 1, rebuilt)
    else
      this.catalogGroups.push(rebuilt)
    this.catalogGroups.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  private createRegistrationCleanup<T>(
    registration: Registration<T>,
    registrations: Map<string, Registration<T>>,
    apply: (current: Registration<T> | undefined) => void,
  ): () => void {
    return () => {
      if (!registration.active)
        return
      registration.active = false
      for (const [key, current] of registrations) {
        if (current !== registration)
          continue
        let next = registration.previous
        while (next && !next.active)
          next = next.previous
        if (next)
          registrations.set(key, next)
        else
          registrations.delete(key)
        apply(next)
        break
      }
    }
  }
}
