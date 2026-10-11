import type { ViewerMeasureContext, ViewerRenderContext } from '@easyink/core'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { tableDataModel } from './material-model'
import { measureTableData, renderTableData, tableDataFragmentPaginator } from './viewer'

export { tableDataModel } from './material-model'
export * from './schema'
export * from './viewer'

export const tableData: ViewerMaterial = { model: tableDataModel, renderer: { render: (node, ctx) => renderTableData(node as MaterialNode, ctx as ViewerRenderContext), measure: (node, ctx) => measureTableData(node as MaterialNode, ctx as ViewerMeasureContext), fragmentPaginator: tableDataFragmentPaginator } }
