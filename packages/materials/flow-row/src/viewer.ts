import type { MaterialMeasureRequest, MaterialViewerLayoutFacet, ViewerMeasureContext, ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans, viewerElement, viewerText } from '@easyink/core'
import { buildSegments, getFlowRowProps, measureFlowRows, resolveFlowRows } from './rendering'

export function renderFlowRow(node: MaterialNode, context: ViewerRenderContext) {
  const model = resolveFlowRows(node, {
    data: context.data ?? {},
    nodeId: node.id,
    reportDiagnostic: context.reportDiagnostic,
  })
  const props = getFlowRowProps(node)
  const unit = context.unit ?? 'mm'
  const children = model.rows.map(row => viewerElement('div', { style: {
    'display': 'flex',
    'flex-direction': 'column',
    'gap': `${props.gap}${unit}`,
    'width': '100%',
    'box-sizing': 'border-box',
  } }, buildSegments(props.columns).map((segment) => {
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

export function measureFlowRow(node: MaterialNode, context: ViewerMeasureContext) {
  const model = resolveFlowRows(node, {
    data: context.data ?? {},
    nodeId: node.id,
    reportDiagnostic: context.reportDiagnostic,
  })
  return {
    width: node.width,
    height: Math.max(node.height, measureFlowRows(node, model)),
  }
}

export const flowRowViewerLayout: MaterialViewerLayoutFacet = Object.freeze({
  async measure(request: MaterialMeasureRequest) {
    const node = Object.freeze({ ...request.node, model: request.resolvedModel }) as MaterialNode
    const measured = measureFlowRow(node, { data: request.scope.data, unit: request.constraints.unit })
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
