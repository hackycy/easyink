import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconDataTable } from '@easyink/icons'
import { tableKernelLocaleMessages } from '@easyink/material-table-kernel/locale'
import { paletteGroups } from '@easyink/shared'
import { tableDataAIMaterialDescriptor } from './ai'
import { createTableDataExtension } from './designer'
import { tableDataLocaleMessages } from './locale'
import { tableDataModel } from './material-model'
import { tableDataDesignerPropSchemas } from './prop-schemas'

export const tableData: DesignerMaterial = {
  model: tableDataModel,
  renderer: createTableDataExtension,
  properties: tableDataDesignerPropSchemas,
  ai: tableDataAIMaterialDescriptor,
  locale: { messages: { ...tableKernelLocaleMessages.messages, ...tableDataLocaleMessages.messages, materials: { ...tableKernelLocaleMessages.messages.materials, ...tableDataLocaleMessages.messages.materials } }, locales: Object.fromEntries(Object.entries(tableDataLocaleMessages.locales).map(([code, tree]) => [code, { materials: { ...(tableKernelLocaleMessages.locales as Record<string, typeof tableKernelLocaleMessages.messages>)[code]?.materials, ...tree.materials } }])) },
  ui: { palette: [{ id: 'tableData', label: 'materials.tableData.name', icon: IconDataTable, group: paletteGroups.data, order: 1 }] },
  sectionFilter: section => section !== 'binding',
}
