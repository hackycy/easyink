import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { pageNumberAIMaterialDescriptor } from './ai'
import { createPageNumberExtension } from './designer'
import { pageNumberLocaleMessages } from './locale'
import { pageNumberDesignerPropSchemas } from './prop-schemas'
import { createPageNumberNode, PAGE_NUMBER_TYPE } from './schema'
import { renderPageNumber } from './viewer'

export const pageNumberMaterialManifest = defineStandardMaterialManifest({
  type: PAGE_NUMBER_TYPE,
  nameKey: 'materials.pageNumber.name',
  category: 'utility',
  iconKey: 'page-number',
  catalogOrder: 10,
  defaultNode: createPageNumberNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'none' },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'every-output-page', overflow: 'clip' },
  properties: pageNumberDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createPageNumberExtension,
  localeMessages: pageNumberLocaleMessages,
  viewerExtension: { render: renderPageNumber },
  aiDescriptor: pageNumberAIMaterialDescriptor,
  generation: { enabled: true, modelSchema: 'infer-from-default', bindingShape: 'infer-from-binding', examples: 'default-model', requiredModelPaths: ['/format'] },
})
