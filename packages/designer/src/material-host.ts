import type { CompiledMaterialProfile, FacetDiagnostic, MaterialDesignerFacet, MaterialExtensionContext, MaterialManifest } from '@easyink/core'
import type { Component } from 'vue'
import type { DesignerMaterialBundle } from './materials/registry'
import { MaterialFacetHost } from '@easyink/core'
import {
  IconBarcode,
  IconChartBar,
  IconChartCustom,
  IconChartGauge,
  IconChartLine,
  IconChartPie,
  IconChartRadar,
  IconChartScatter,
  IconDataTable,
  IconEllipse,
  IconHeart,
  IconImage,
  IconLayoutPanelTop,
  IconLine,
  IconPageNumber,
  IconProgress,
  IconQrcode,
  IconRating,
  IconRect,
  IconRingProgress,
  IconSignature,
  IconStar,
  IconSvg,
  IconTable,
  IconText,
} from '@easyink/icons'

export const builtinMaterialIcons: Readonly<Record<string, Component>> = Object.freeze({
  'text': IconText,
  'image': IconImage,
  'barcode': IconBarcode,
  'qrcode': IconQrcode,
  'line': IconLine,
  'rect': IconRect,
  'ellipse': IconEllipse,
  'table': IconTable,
  'table-data': IconDataTable,
  'flow-row': IconLayoutPanelTop,
  'ring-progress': IconRingProgress,
  'progress': IconProgress,
  'rating': IconRating,
  'svg-custom': IconSvg,
  'svg-star': IconStar,
  'svg-heart': IconHeart,
  'page-number': IconPageNumber,
  'signature': IconSignature,
  'chart-bar': IconChartBar,
  'chart-line': IconChartLine,
  'chart-pie': IconChartPie,
  'chart-radar': IconChartRadar,
  'chart-scatter': IconChartScatter,
  'chart-gauge': IconChartGauge,
  'chart-custom': IconChartCustom,
})

export const builtinCatalogGroupLabels = Object.freeze({
  basic: 'materials.catalog.basic',
  data: 'materials.catalog.data',
  chart: 'materials.catalog.chart',
  svg: 'materials.catalog.svg',
  utility: 'materials.catalog.utility',
})

export interface PreparedDesignerMaterialBundle {
  bundle: DesignerMaterialBundle
  manifests: readonly MaterialManifest[]
  diagnostics: readonly FacetDiagnostic[]
  dispose: () => Promise<readonly FacetDiagnostic[]>
}

export async function prepareDesignerMaterialBundle(
  profile: CompiledMaterialProfile,
  services: MaterialExtensionContext,
): Promise<PreparedDesignerMaterialBundle> {
  const host = new MaterialFacetHost({ getActivationServices: () => services })
  const instances = await Promise.all(profile.materialTypes.map(type =>
    host.activate<MaterialDesignerFacet>(profile, type, 'designer'),
  ))
  const diagnostics = instances.flatMap(instance => instance.diagnostic ? [instance.diagnostic] : [])
  const active = instances.filter((instance): instance is typeof instance & { value: MaterialDesignerFacet } =>
    instance.state === 'active' && instance.value !== undefined,
  )
  const groups = new Map<string, DesignerMaterialBundle['catalogs'][number]>()
  const materials = active.map(({ materialType, value }) => {
    const manifest = profile.getManifest(materialType)!
    let group = groups.get(value.catalog.group)
    if (!group) {
      group = {
        id: value.catalog.group,
        label: builtinCatalogGroupLabels[value.catalog.group as keyof typeof builtinCatalogGroupLabels] ?? value.catalog.group,
        items: [],
      }
      groups.set(value.catalog.group, group)
    }
    group.items.push({ type: materialType, order: value.catalog.order })
    return {
      type: materialType,
      name: manifest.common.nameKey,
      icon: builtinMaterialIcons[manifest.common.iconKey] ?? IconRect,
      category: manifest.common.category as never,
      capabilities: {
        bindable: manifest.common.binding.kind !== 'none',
        rotatable: manifest.common.interaction.rotatable,
        resizable: manifest.common.interaction.resizable,
        supportsChildren: manifest.common.structure.slots.length > 0,
        supportsAnimation: manifest.common.interaction.supportsAnimation,
        supportsUnionDrop: manifest.common.interaction.supportsUnionDrop,
        keepAspectRatio: manifest.common.interaction.keepAspectRatio,
        pageAware: manifest.common.layout.pageRepeat === 'every-output-page',
      },
      condition: manifest.common.condition,
      binding: manifest.common.binding,
      createDefaultNode: (input?: Parameters<CompiledMaterialProfile['createNode']>[1], unit?: string) =>
        profile.createNode(materialType, input, unit as never),
      factory: () => value.extension,
      aiDescriptor: manifest.facets.ai?.descriptor as never,
      propSchemas: [...manifest.common.properties],
      localeMessages: value.localeMessages as never,
    }
  })
  return {
    bundle: { materials, catalogs: [...groups.values()] },
    manifests: Object.freeze(active.map(({ materialType }) => profile.getManifest(materialType)!)),
    diagnostics: Object.freeze(diagnostics),
    dispose: () => host.dispose(),
  }
}
