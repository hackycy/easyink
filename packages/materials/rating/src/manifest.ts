import { defineStandardMaterialManifest, recordSchemaAdapter } from '@easyink/core'
import { ratingAIMaterialDescriptor } from './ai'
import { createRatingExtension } from './designer'
import { ratingLocaleMessages } from './locale'
import { ratingDesignerPropSchemas } from './prop-schemas'
import { createRatingNode, RATING_TYPE } from './schema'
import { renderRating } from './viewer'

export const ratingMaterialManifest = defineStandardMaterialManifest({
  type: RATING_TYPE,
  nameKey: 'materials.rating.name',
  category: 'basic',
  iconKey: 'rating',
  catalogOrder: 90,
  defaultNode: createRatingNode(),
  interaction: { rotatable: true, resizable: true },
  binding: { kind: 'ports', ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar', modelPath: '/model/value', formatEditor: { tabs: ['preset'] } }] },
  layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
  properties: ratingDesignerPropSchemas,
  schemaAdapter: recordSchemaAdapter(1),
  designerFactory: createRatingExtension,
  localeMessages: ratingLocaleMessages,
  viewerExtension: { render: renderRating },
  aiDescriptor: ratingAIMaterialDescriptor,
})
