import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import { tableDataModel } from './material-model'
import { createTableDataSession } from './viewer'

export { tableDataModel } from './material-model'
export * from './schema'
export * from './viewer'

export const tableData: ViewerMaterial = { model: tableDataModel, renderer: { createSession: createTableDataSession } }
