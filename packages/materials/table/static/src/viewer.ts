import type { MaterialNode } from '@easyink/schema'
import { formatBindingDisplayValue, resolveBindingValue, trustedViewerHtml } from '@easyink/core'
import { projectTableTopology, renderPlainTextCell, renderTableHtml, resolveTableBaseProps } from '@easyink/material-table-kernel'

interface ViewerRenderContext {
  data: Record<string, unknown>
  unit: string
  reportDiagnostic?: (diagnostic: { code: string, message: string, severity: 'warning', nodeId?: string, cause?: unknown }) => void
}

export function renderTableStatic(node: MaterialNode<unknown>, contextOrUnit: ViewerRenderContext | string = 'mm') {
  const context = typeof contextOrUnit === 'string' ? undefined : contextOrUnit
  const unit = typeof contextOrUnit === 'string' ? contextOrUnit : contextOrUnit.unit
  const data = context?.data ?? {}
  if (node.type !== 'table-static') {
    return {
      html: trustedViewerHtml('<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f9f9f9;color:#999;font-size:12px;">[Table]</div>'),
    }
  }

  const props = resolveTableBaseProps(node)
  const { topology } = projectTableTopology(node)
  const html = renderTableHtml({
    topology,
    props,
    unit,
    elementHeight: node.height,
    tableStyle: 'height:100%',
    cellRenderer: (cell) => {
      if (cell.staticBinding) {
        const raw = resolveBindingValue(cell.staticBinding, data)
        const formatted = formatBindingDisplayValue(raw, cell.staticBinding, { data })
        for (const diagnostic of formatted.diagnostics)
          context?.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })
        return renderPlainTextCell(formatted.value)
      }
      return renderPlainTextCell(cell.content?.text)
    },
  })
  return { html: trustedViewerHtml(html) }
}
