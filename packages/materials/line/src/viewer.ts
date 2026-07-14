import type { MaterialMeasureRequest, MaterialViewerExtension, MaterialViewerLayoutFacet, ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { LineProps } from './schema'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans, viewerElement } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'

import { getLineThickness } from './schema'

const DASH_PATTERN = {
  dashed: { segment: 3, gap: 2 },
  dotted: { segment: 0.5, gap: 1.5 },
} as const

function buildRects(totalWidth: number, totalHeight: number, segmentWidth: number, gapWidth: number, color: string) {
  const rects = []
  for (let x = 0; x < totalWidth; x += segmentWidth + gapWidth) {
    const width = Math.min(segmentWidth, totalWidth - x)
    rects.push(viewerElement('rect', { namespace: 'svg', attributes: { x, y: 0, width, height: totalHeight, fill: color } }))
  }
  return rects
}

function buildShapeTree(lineType: LineProps['lineType'] | undefined, width: number, height: number, color: string) {
  if (lineType === 'dashed')
    return buildRects(width, height, DASH_PATTERN.dashed.segment, DASH_PATTERN.dashed.gap, color)
  if (lineType === 'dotted')
    return buildRects(width, height, DASH_PATTERN.dotted.segment, DASH_PATTERN.dotted.gap, color)
  return [viewerElement('rect', { namespace: 'svg', attributes: { x: 0, y: 0, width, height, fill: color } })]
}

function resolveLineRenderHeight(node: MaterialNode): number {
  return Math.max(0.1, getLineThickness(node))
}

export function renderLine(node: MaterialNode, _context: ViewerRenderContext) {
  const p = getNodeModel<Partial<LineProps>>(node)
  const lineColor = p.lineColor || '#000000'
  const lineType = p.lineType || 'solid'
  const width = _context.layoutPlan.borderBox.width
  const thickness = _context.layoutPlan.borderBox.height
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(thickness) || thickness <= 0)
    throw new Error('LINE_COMMITTED_LAYOUT_REQUIRED')
  return {
    tree: viewerElement('svg', {
      namespace: 'svg',
      attributes: { width: '100%', height: '100%', viewBox: `0 0 ${width} ${thickness}`, preserveAspectRatio: 'none' },
      style: { 'display': 'block', 'width': '100%', 'height': '100%', 'overflow': 'hidden', 'shape-rendering': 'crispEdges' },
    }, buildShapeTree(lineType, width, thickness, lineColor)),
  }
}

export const lineViewerLayout: MaterialViewerLayoutFacet = Object.freeze({
  async measure(request: MaterialMeasureRequest) {
    const node = Object.freeze({ ...request.node, model: request.resolvedModel }) as MaterialNode
    const thickness = resolveLineRenderHeight(node)
    const borderBox = { x: request.node.x, y: request.node.y, width: Math.max(0, request.node.width), height: thickness }
    return createNonFragmentingMaterialPlans({
      instanceKey: request.instanceKey,
      nodeId: request.node.id,
      nodeRevision: request.nodeRevision,
      constraintKey: createLayoutConstraintKey(request.constraints),
      pageIndex: 0,
      borderBox,
      fragmentBox: borderBox,
    }).layoutPlan
  },
})

export function createLineViewerExtension(): MaterialViewerExtension {
  return {
    render: (node, context) => renderLine(node, context),
  }
}
