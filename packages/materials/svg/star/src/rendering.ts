import type { Point, Rect } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { SvgStarControlSelection, SvgStarProps } from './schema'
import { escapeHtml } from '@easyink/shared'

const VIEWBOX_SIZE = 100
const STAR_HANDLE_SIZE = 6

export interface StarEditGuide {
  handles: Point[]
}

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function getRawStarPoints(props: SvgStarProps): Point[] {
  const pointCount = clamp(Math.round(props.starPoints), 3, 24)
  const innerRatio = clamp(props.starInnerRatio, 0.08, 0.95)
  const points: Point[] = []
  for (let i = 0; i < pointCount * 2; i++) {
    const r = i % 2 === 0 ? 1 : innerRatio
    const angle = degreesToRadians(props.starRotation + (i * 180) / pointCount)
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
  }
  return points
}

function getRawInnerHandlePoints(props: SvgStarProps): Point[] {
  const pointCount = clamp(Math.round(props.starPoints), 3, 24)
  const innerRatio = clamp(props.starInnerRatio, 0.08, 0.95)
  const points: Point[] = []
  for (let i = 0; i < pointCount; i++) {
    const angle = degreesToRadians(props.starRotation + (2 * i + 1) * 180 / pointCount)
    points.push({ x: Math.cos(angle) * innerRatio, y: Math.sin(angle) * innerRatio })
  }
  return points
}

function getBounds(points: Point[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX)
      minX = p.x
    if (p.x > maxX)
      maxX = p.x
    if (p.y < minY)
      minY = p.y
    if (p.y > maxY)
      maxY = p.y
  }
  return { minX, maxX, minY, maxY }
}

function computeStrokeInset(props: SvgStarProps, nodeWidth: number, nodeHeight: number): { insetX: number, insetY: number } {
  const bw = Math.max(0, props.borderWidth || 0)
  if (bw <= 0)
    return { insetX: 0, insetY: 0 }
  return {
    insetX: (bw / Math.max(nodeWidth, Number.EPSILON)) * VIEWBOX_SIZE / 2,
    insetY: (bw / Math.max(nodeHeight, Number.EPSILON)) * VIEWBOX_SIZE / 2,
  }
}

function fitPointToViewBox(p: Point, bounds: Bounds, insetX: number, insetY: number): Point {
  const rangeX = bounds.maxX - bounds.minX
  const rangeY = bounds.maxY - bounds.minY
  const availX = VIEWBOX_SIZE - 2 * insetX
  const availY = VIEWBOX_SIZE - 2 * insetY
  return {
    x: insetX + ((p.x - bounds.minX) / Math.max(rangeX, Number.EPSILON)) * availX,
    y: insetY + ((p.y - bounds.minY) / Math.max(rangeY, Number.EPSILON)) * availY,
  }
}

function fitPointsToViewBox(points: Point[], bounds: Bounds, insetX: number, insetY: number): Point[] {
  return points.map(p => fitPointToViewBox(p, bounds, insetX, insetY))
}

function viewBoxToRaw(p: Point, bounds: Bounds, insetX: number, insetY: number): Point {
  const rangeX = bounds.maxX - bounds.minX
  const rangeY = bounds.maxY - bounds.minY
  const availX = VIEWBOX_SIZE - 2 * insetX
  const availY = VIEWBOX_SIZE - 2 * insetY
  return {
    x: bounds.minX + ((p.x - insetX) / Math.max(availX, Number.EPSILON)) * rangeX,
    y: bounds.minY + ((p.y - insetY) / Math.max(availY, Number.EPSILON)) * rangeY,
  }
}

function computeStrokeWidth(props: SvgStarProps, nodeWidth: number, nodeHeight: number): number {
  const bw = Math.max(0, props.borderWidth || 0)
  if (bw <= 0)
    return 0
  const minDim = Math.min(nodeWidth, nodeHeight)
  if (minDim <= 0)
    return 0
  return (bw / minDim) * VIEWBOX_SIZE
}

export function buildStarSvgMarkup(props: SvgStarProps, nodeWidth: number, nodeHeight: number): string {
  const normalized = normalizeStarProps(props)
  const rawPoints = getRawStarPoints(normalized)
  const bounds = getBounds(rawPoints)
  const { insetX, insetY } = computeStrokeInset(normalized, nodeWidth, nodeHeight)
  const vbPoints = fitPointsToViewBox(rawPoints, bounds, insetX, insetY)
  const strokeWidth = computeStrokeWidth(normalized, nodeWidth, nodeHeight)

  return `<svg viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" preserveAspectRatio="none"`
    + ` style="width:100%;height:100%;display:block;overflow:hidden" xmlns="http://www.w3.org/2000/svg">`
    + `<polygon points="${serializePoints(vbPoints)}" ${getPaintAttrs(normalized, strokeWidth)} />`
    + `</svg>`
}

export function getStarEditGuide(props: SvgStarProps, nodeWidth: number, nodeHeight: number): StarEditGuide {
  const normalized = normalizeStarProps(props)
  const rawStarPoints = getRawStarPoints(normalized)
  const bounds = getBounds(rawStarPoints)
  const { insetX, insetY } = computeStrokeInset(normalized, nodeWidth, nodeHeight)
  const rawHandlePoints = getRawInnerHandlePoints(normalized)
  const handles = fitPointsToViewBox(rawHandlePoints, bounds, insetX, insetY)
  return { handles }
}

export function getStarControlRect(node: MaterialNode, props: SvgStarProps, selection: SvgStarControlSelection): Rect {
  const guide = getStarEditGuide(props, node.width, node.height)
  const vbPoint = guide.handles[selection.index]
  const localPoint = viewBoxToLocalPoint(node, vbPoint)
  const documentPoint = localToDocumentPoint(node, localPoint)
  return {
    x: documentPoint.x - STAR_HANDLE_SIZE / 2,
    y: documentPoint.y - STAR_HANDLE_SIZE / 2,
    width: STAR_HANDLE_SIZE,
    height: STAR_HANDLE_SIZE,
  }
}

export function resolveStarControl(localPoint: Point, node: MaterialNode, props: SvgStarProps): SvgStarControlSelection | null {
  if (!isPointInsideNode(localPoint, node))
    return null

  const normalized = normalizeStarProps(props)
  const guide = getStarEditGuide(normalized, node.width, node.height)
  const threshold = Math.max(5, Math.min(node.width, node.height) * 0.06)

  let minDistance = Infinity
  let minIndex = -1

  for (let i = 0; i < guide.handles.length; i++) {
    const handleLocal = viewBoxToLocalPoint(node, guide.handles[i])
    const dist = distance(localPoint, handleLocal)
    if (dist < minDistance) {
      minDistance = dist
      minIndex = i
    }
  }

  if (minIndex >= 0 && minDistance <= threshold)
    return { handle: 'inner-radius', index: minIndex }

  return null
}

export function updateStarControlFromLocalPoint(node: MaterialNode, props: SvgStarProps, _handle: SvgStarControlSelection['handle'], localPoint: Point): Partial<SvgStarProps> {
  const normalized = normalizeStarProps(props)
  const rawStarPoints = getRawStarPoints(normalized)
  const bounds = getBounds(rawStarPoints)
  const { insetX, insetY } = computeStrokeInset(normalized, node.width, node.height)

  const vbPoint = localToViewBoxPoint(node, localPoint)
  const rawPoint = viewBoxToRaw(vbPoint, bounds, insetX, insetY)
  const dist = Math.hypot(rawPoint.x, rawPoint.y)
  return {
    starInnerRatio: clamp(dist, 0.08, 0.95),
  }
}

export function getStarHandleRects(node: MaterialNode, props: SvgStarProps): Record<string, Rect> {
  const guide = getStarEditGuide(props, node.width, node.height)
  const rects: Record<string, Rect> = {}
  for (let i = 0; i < guide.handles.length; i++) {
    rects[`inner-radius:${i}`] = getStarControlRect(node, props, { handle: 'inner-radius', index: i })
  }
  return rects
}

function viewBoxToLocalPoint(node: MaterialNode, point: Point): Point {
  return {
    x: (point.x / VIEWBOX_SIZE) * node.width,
    y: (point.y / VIEWBOX_SIZE) * node.height,
  }
}

function localToViewBoxPoint(node: MaterialNode, point: Point): Point {
  return {
    x: (point.x / Math.max(node.width, Number.EPSILON)) * VIEWBOX_SIZE,
    y: (point.y / Math.max(node.height, Number.EPSILON)) * VIEWBOX_SIZE,
  }
}

function localToDocumentPoint(node: MaterialNode, point: Point): Point {
  const radians = degreesToRadians(node.rotation ?? 0)
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 }
  const offset = {
    x: point.x - node.width / 2,
    y: point.y - node.height / 2,
  }
  return {
    x: center.x + offset.x * Math.cos(radians) - offset.y * Math.sin(radians),
    y: center.y + offset.x * Math.sin(radians) + offset.y * Math.cos(radians),
  }
}

function getPaintAttrs(props: SvgStarProps, strokeWidth: number): string {
  return [
    `fill="${escapeHtml(props.fillColor || 'transparent')}"`,
    `stroke="${escapeHtml(strokeWidth > 0 ? props.borderColor : 'transparent')}"`,
    `stroke-width="${strokeWidth}"`,
    'stroke-linejoin="round"',
  ].join(' ')
}

function normalizeStarProps(props: SvgStarProps): SvgStarProps {
  return {
    ...props,
    starPoints: clamp(Math.round(props.starPoints || 5), 3, 24),
    starInnerRatio: clamp(props.starInnerRatio || 0.381966, 0.08, 0.95),
    starRotation: props.starRotation ?? -90,
  }
}

function isPointInsideNode(point: Point, node: MaterialNode): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= node.width && point.y <= node.height
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180
}

function serializePoints(points: Point[]): string {
  return points.map(p => `${p.x.toFixed(2).replace(/\.00$/, '')},${p.y.toFixed(2).replace(/\.00$/, '')}`).join(' ')
}
