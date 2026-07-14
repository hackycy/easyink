import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { formatBindingDisplayValue, resolveBindingValue, viewerElement, viewerText } from '@easyink/core'
import { projectTableTopology, renderTableTree, resolveTableBaseProps } from '@easyink/material-table-kernel'

export function renderTableStatic(node: MaterialNode<unknown>, contextOrUnit: ViewerRenderContext | string = 'mm') {
  const context = typeof contextOrUnit === 'string' ? undefined : contextOrUnit
  const unit = typeof contextOrUnit === 'string' ? contextOrUnit : contextOrUnit.unit
  const data = context?.data ?? {}
  if (node.type !== 'table-static') {
    return {
      tree: viewerElement('div', { style: { 'width': '100%', 'height': '100%', 'display': 'flex', 'align-items': 'center', 'justify-content': 'center', 'background': '#f9f9f9', 'color': '#999', 'font-size': '12px' } }, [viewerText('[Table]')]),
    }
  }

  const props = resolveTableBaseProps(node)
  const { topology } = projectTableTopology(node)
  return { tree: renderTableTree({
    node,
    topology,
    props,
    unit,
    elementHeight: node.height,
    slotOutputs: context?.slotOutputs,
    renderBudget: context?.renderBudget,
    cellText: (cell) => {
      if (cell.staticBinding) {
        const raw = resolveBindingValue(cell.staticBinding, data)
        const formatted = formatBindingDisplayValue(raw, cell.staticBinding, { data })
        for (const diagnostic of formatted.diagnostics)
          context?.reportDiagnostic?.({ ...diagnostic, nodeId: node.id })
        return formatted.value
      }
      return cell.content?.text || ''
    },
  }) }
}
