import type { DeepReadonly } from '@easyink/plugin-api'
import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import type { HostRegistry } from '@easyink/plugin-runtime'
import type { MaterialCatalogEntry, MaterialCatalogGroup, MaterialDefinition, MaterialDesignerExtension } from '../types'
import { deepClone } from '@easyink/shared'

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

/** Workbench projection of the sole kernel registry; no registration or declaration cache. */
export class MaterialConsumer {
  constructor(private readonly registry: HostRegistry<DesignerMaterial>) {}

  getMaterial(type: string): MaterialDefinition | undefined {
    const material = this.registry.getMaterial(type)?.value
    return material ? this.definition(material) : undefined
  }

  listMaterials(): MaterialDefinition[] {
    return this.registry.materials.map(entry => this.definition(entry.value))
  }

  private definition(material: DeepReadonly<DesignerMaterial>): MaterialDefinition {
    const preset = material.ui?.palette?.[0]
    return {
      type: material.model.type,
      name: preset?.label ?? material.model.type,
      icon: preset?.icon ?? { render: () => null },
      category: (preset?.group.id ?? 'basic') as MaterialDefinition['category'],
      capabilities: { ...material.model.capabilities, pageAware: material.model.pageAware },
      binding: deepClone(material.model.binding) as MaterialDefinition['binding'],
      condition: deepClone(material.model.condition) as MaterialDefinition['condition'],
      createDefaultNode: material.model.createDefaultNode,
      props: deepClone(material.properties ?? []) as MaterialDefinition['props'],
      aiDescriptor: deepClone(material.ai) as MaterialDefinition['aiDescriptor'],
      sectionFilter: material.sectionFilter,
    }
  }

  getCatalogGroups(): MaterialCatalogGroup[] {
    const groups = new Map<string, MaterialCatalogGroup>()
    for (const material of this.registry.materials) {
      for (const preset of material.value.ui?.palette ?? []) {
        let group = groups.get(preset.group.id)
        if (!group) {
          group = { ...preset.group, items: [] }
          groups.set(group.id, group)
        }
        group.items.push({
          id: preset.id,
          groupId: group.id,
          label: preset.label,
          icon: preset.icon as MaterialDefinition['icon'],
          materialType: material.key,
          order: preset.order,
          dragData: preset.dragData,
          createDefaultNode: preset.createDefaultNode,
        })
      }
    }
    return [...groups.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(group => ({
      ...group,
      items: group.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }))
  }

  getCatalog(): MaterialCatalogEntry[] {
    return this.getCatalogGroups().flatMap(group => group.items)
  }
}

export { LOADING_EXTENSION }
