import type { MaterialNode } from '@easyink/schema'
import type { TableStaticProps } from './schema'
import { formatBindingDisplayValue, resolveBindingValue } from '@easyink/core'
import { renderPlainTextCell, renderTableHtml } from '@easyink/material-table-kernel'
import { getNodeProps, isTableNode } from '@easyink/schema'

interface ViewerRenderContext {
  data: Record<string, unknown>
  unit: string
  reportDiagnostic?: (diagnostic: { code: string, message: string, severity: 'warning', nodeId?: string, cause?: unknown }) => void
}

export function renderTableStatic(node: MaterialNode, contextOrUnit: ViewerRenderContext | string = 'mm') {
  const context = typeof contextOrUnit === 'string' ? undefined : contextOrUnit
  const unit = typeof contextOrUnit === 'string' ? contextOrUnit : contextOrUnit.unit
  const data = context?.data ?? {}
  if (!isTableNode(node)) {
    return {
      html: '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f9f9f9;color:#999;font-size:12px;">[Table]</div>',
    }
  }

  const props = getNodeProps<TableStaticProps>(node)
  const html = renderTableHtml({
    topology: node.table.topology,
    props,
    unit,
    elementHeight: node.height,
    tableStyle: 'height:100%',
    cellRenderer: (cell) => {
      if (cell.staticBinding) {
        const raw = resolveBindingValue(cell.staticBinding, data)
        const formatted = formatBindingDisplayValue(raw, cell.staticBinding)
        for (const diagnostic of formatted.diagnostics)
          context?.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })
        return renderPlainTextCell(formatted.value)
      }
      return renderPlainTextCell(cell.content?.text)
    },
  })
  return { html }
}
