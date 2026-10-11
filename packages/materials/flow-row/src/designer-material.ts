import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconLayoutPanelTop } from '@easyink/icons'
import { paletteGroups } from '@easyink/shared'
import { flowRowAIMaterialDescriptor } from './ai'
import { createFlowRowExtension } from './designer'
import { flowRowLocaleMessages } from './locale'
import { flowRowModel } from './material-model'
import { flowRowDesignerPropSchemas } from './prop-schemas'

export const flowRow: DesignerMaterial = {
  model: flowRowModel,
  renderer: createFlowRowExtension,
  properties: flowRowDesignerPropSchemas,
  ai: flowRowAIMaterialDescriptor,
  locale: flowRowLocaleMessages,
  ui: { palette: [{ id: 'flowRow', label: 'materials.flowRow.name', icon: IconLayoutPanelTop, group: paletteGroups.data, order: 2 }] },
}
