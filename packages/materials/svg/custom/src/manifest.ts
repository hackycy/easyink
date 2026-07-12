import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { svgCustomAIMaterialDescriptor } from './ai'
import { createSvgCustomExtension } from './designer'
import { svgCustomLocaleMessages } from './locale'
import { svgCustomDesignerPropSchemas } from './prop-schemas'
import { createSvgCustomNode, SVG_CUSTOM_TYPE } from './schema'
import { renderSvgCustom } from './viewer'

export const svgCustomMaterialManifest = defineStandardMaterialManifest({
  type: SVG_CUSTOM_TYPE,
  nameKey: 'materials.svgCustom.name',
  category: 'svg',
  iconKey: 'svg-custom',
  catalogOrder: 30,
  defaultNode: createSvgCustomNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', ports: [{ id: 'content', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar', modelPath: '/model/content', formatEditor: { tabs: ['preset'] } }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: svgCustomDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createSvgCustomExtension,
  localeMessages: svgCustomLocaleMessages,
  viewerExtension: { render: renderSvgCustom },
  viewerCapabilities: { sanitizedMarkup: true },
  aiDescriptor: svgCustomAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/content'] },
})
