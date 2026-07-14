import type { MaterialMeasureRequest, MaterialViewerLayoutFacet, ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans, viewerElement, viewerText } from '@easyink/core'
import { buildSegments, getFlowRowProps, measureFlowRows, resolveFlowRows } from './rendering'

export function renderFlowRow(node: MaterialNode, context: ViewerRenderContext) {
  let props = getFlowRowProps(node)
  let segments = buildSegments(props.columns)
  const model = resolveFlowRows(node, {
    data: context.data ?? {},
    nodeId: node.id,
    reportDiagnostic: context.reportDiagnostic,
  }, {
    beforeRows(rowCount, resolvedProps) {
      props = resolvedProps
      segments = buildSegments(props.columns)
      const cellsPerRow = segments.reduce((sum, segment) => sum + segment.columns.length, 0)
      const inlineWrappersPerRow = segments.filter(segment => segment.kind !== 'block').length
      context.renderBudget.reserveNodes('element', 1 + rowCount * (1 + cellsPerRow * 2 + inlineWrappersPerRow))
      context.renderBudget.reserveNodes('text', rowCount * cellsPerRow)
    },
  })
  const unit = context.unit ?? 'mm'
  const children = model.rows.map(row => viewerElement('div', { style: {
    'display': 'flex',
    'flex-direction': 'column',
    'gap': `${props.gap}${unit}`,
    'width': '100%',
    'box-sizing': 'border-box',
  } }, segments.map((segment) => {
    const cells = segment.columns.map(({ column, index }) => viewerElement('div', {
      attributes: { 'data-flow-row-column': index },
      style: {
        'display': 'flex',
        'flex-direction': 'column',
        'justify-content': column.verticalAlign === 'bottom' ? 'flex-end' : column.verticalAlign === 'middle' ? 'center' : 'flex-start',
        'width': segment.kind === 'block' ? '100%' : `${Math.max(0.0001, column.ratio) / segment.columns.reduce((sum, item) => sum + Math.max(0.0001, item.column.ratio), 0) * 100}%`,
        'min-width': '0',
        'box-sizing': 'border-box',
        'white-space': 'normal',
        'overflow-wrap': 'anywhere',
        'word-break': 'break-word',
        'text-align': column.textAlign,
        'padding': `${props.paddingY}${unit} ${props.paddingX}${unit}`,
      },
    }, [viewerElement('span', { style: { display: 'block', width: '100%' } }, [viewerText(row[index]?.text || '\u00A0')])]))
    return segment.kind === 'block'
      ? cells[0]!
      : viewerElement('div', { style: { 'display': 'flex', 'gap': `${props.gap}${unit}`, 'width': '100%', 'box-sizing': 'border-box' } }, cells)
  })))
  return { tree: viewerElement('div', { attributes: { 'data-easyink-material': 'flow-row' }, style: {
    'display': 'flex',
    'flex-direction': 'column',
    'gap': `${props.gap}${unit}`,
    'width': '100%',
    'height': '100%',
    'min-height': `${node.height}${unit}`,
    'box-sizing': 'border-box',
    'overflow': 'visible',
    'font-size': `${props.typography.fontSize}${unit}`,
    'font-family': props.typography.fontFamily || 'inherit',
    'font-weight': props.typography.fontWeight,
    'font-style': props.typography.fontStyle,
    'line-height': props.typography.lineHeight,
    'letter-spacing': `${props.typography.letterSpacing}${unit}`,
    'color': props.typography.color,
    ...(props.backgroundColor ? { background: props.backgroundColor } : {}),
  } }, children) }
}

export const flowRowViewerLayout: MaterialViewerLayoutFacet = Object.freeze({
  async measure(request: MaterialMeasureRequest) {
    const node = Object.freeze({ ...request.node, model: request.resolvedModel }) as MaterialNode
    const model = resolveFlowRows(node, {
      data: request.scope.data as Record<string, unknown>,
      nodeId: node.id,
    }, {
      beforeRows: count => request.budget.reserveRuntimeRows(count),
    })
    const measured = {
      width: node.width,
      height: Math.max(node.height, measureFlowRows(node, model)),
    }
    return createNonFragmentingMaterialPlans({
      instanceKey: request.instanceKey,
      nodeId: request.node.id,
      nodeRevision: request.nodeRevision,
      constraintKey: createLayoutConstraintKey(request.constraints),
      pageIndex: 0,
      borderBox: { x: request.node.x, y: request.node.y, width: measured.width, height: measured.height },
      fragmentBox: { x: request.node.x, y: request.node.y, width: measured.width, height: measured.height },
    }).layoutPlan
  },
})
