import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { IconTable } from '@easyink/icons'
import { tableKernelLocaleMessages } from '@easyink/material-table-kernel/locale'
import { paletteGroups } from '@easyink/shared'
import { tableStaticAIMaterialDescriptor } from './ai'
import { createTableStaticExtension } from './designer'
import { tableStaticLocaleMessages } from './locale'
import { tableStaticModel } from './material-model'
import { tableStaticDesignerPropSchemas } from './prop-schemas'

export const tableStatic: DesignerMaterial = {
  model: tableStaticModel,
  renderer: createTableStaticExtension,
  properties: tableStaticDesignerPropSchemas,
  ai: tableStaticAIMaterialDescriptor,
  locale: { messages: { ...tableKernelLocaleMessages.messages, ...tableStaticLocaleMessages.messages, materials: { ...tableKernelLocaleMessages.messages.materials, ...tableStaticLocaleMessages.messages.materials } }, locales: Object.fromEntries(Object.entries(tableStaticLocaleMessages.locales).map(([code, tree]) => [code, { materials: { ...(tableKernelLocaleMessages.locales as Record<string, typeof tableKernelLocaleMessages.messages>)[code]?.materials, ...tree.materials } }])) },
  ui: { palette: [{ id: 'tableStatic', label: 'materials.tableStatic.name', icon: IconTable, group: paletteGroups.data, order: 0 }] },
  sectionFilter: section => section !== 'binding',
}
