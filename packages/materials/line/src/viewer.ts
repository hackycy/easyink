import type { MaterialViewerExtension, ViewerRenderContext, ViewerRenderSize } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { LineProps } from './schema'
import { viewerElement } from '@easyink/core'
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

export function getLineRenderSize(node: MaterialNode): Partial<ViewerRenderSize> {
  return {
    height: resolveLineRenderHeight(node),
  }
}

export function renderLine(node: MaterialNode, _context: ViewerRenderContext) {
  const p = getNodeModel<Partial<LineProps>>(node)
  const lineColor = p.lineColor || '#000000'
  const lineType = p.lineType || 'solid'
  const thickness = resolveLineRenderHeight(node)
  return {
    tree: viewerElement('svg', {
      namespace: 'svg',
      attributes: { width: '100%', height: '100%', viewBox: `0 0 ${node.width} ${thickness}`, preserveAspectRatio: 'none' },
      style: { 'display': 'block', 'width': '100%', 'height': '100%', 'overflow': 'hidden', 'shape-rendering': 'crispEdges' },
    }, buildShapeTree(lineType, node.width, thickness, lineColor)),
  }
}

export function createLineViewerExtension(): MaterialViewerExtension {
  return {
    render: (node, context) => renderLine(node, context),
    getRenderSize: node => getLineRenderSize(node),
  }
}
