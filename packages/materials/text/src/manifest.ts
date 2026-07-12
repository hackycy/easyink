import { defineStandardMaterialManifest } from '@easyink/core'
import { textAIMaterialDescriptor } from './ai'
import { createTextExtension } from './designer'
import { textLocaleMessages } from './locale'
import { textDesignerPropSchemas } from './prop-schemas'
import { createTextNode, TEXT_CONDITION, TEXT_TYPE } from './schema'
import { textSchemaAdapter } from './schema-adapter'
import { getTextRenderSize, measureText, renderText } from './viewer'

export const textMaterialManifest = defineStandardMaterialManifest({
  type: TEXT_TYPE,
  nameKey: 'materials.text.name',
  category: 'basic',
  iconKey: 'text',
  catalogOrder: 10,
  defaultNode: createTextNode(),
  interaction: { rotatable: true, resizable: true, supportsAnimation: true, supportsUnionDrop: true },
  binding: { kind: 'ports', ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar', modelPath: '/model/content', formatEditor: { tabs: ['preset'] } }] },
  condition: TEXT_CONDITION,
  layout: { intrinsicSize: 'height', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: textDesignerPropSchemas,
  schemaAdapter: textSchemaAdapter,
  designerFactory: createTextExtension,
  localeMessages: textLocaleMessages,
  viewerExtension: { render: renderText, measure: measureText, getRenderSize: getTextRenderSize },
  aiDescriptor: textAIMaterialDescriptor,
})
