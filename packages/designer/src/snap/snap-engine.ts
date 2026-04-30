import type { Rect } from '@easyink/core'
import type { MaterialNode, PageSchema } from '@easyink/schema'
import type { SnapLine, SnapSource } from '../types'
import { getRotatedAABB, snapToGrid } from '@easyink/core'

/**
 * Snap engine: candidate-collection + best-pick model.
 *
 * Replaces the previous "branch + short-circuit" approach in use-element-drag,
 * where matching one source (e.g. grid) silently suppressed others (e.g. guides).
 *
 * Pipeline:
 *   1. `collectSnapCandidates(ctx)` enumerates all snap-target lines from
 *      grid / guides / other elements, segregated per axis.
 *   2. `pickBestSnap(testValues, candidates, threshold)` picks the candidate
 *      with smallest absolute distance from any test value, with stable
 *      tie-breaking by source priority (element > guide > grid).
 *   3. `computeSnap(...)` runs both axes, returns final `{ dx, dy, lines }`.
 *
 * Threshold is treated in document units. Callers must normalize for zoom
 * (`threshold / max(zoom, epsilon)`) before invoking.
 */

export interface SnapCandidate {
  /** Coordinate (X for vertical lines, Y for horizontal lines). */
  value: number
  source: SnapSource
  /** ID of the source element when `source === 'element'`. */
  targetId?: string
  /**
   * Extent along the perpendicular axis. For element source this is the
   * `[edge, edge+span]` of the source element on the perpendicular axis,
   * used by the overlay to draw a Figma-style short segment between
   * the selection and the target.
   */
  segmentExtent?: { min: number, max: number }
}

export interface SnapCandidates {
  /** Vertical-line candidates (compared against X coordinates). */
  x: SnapCandidate[]
  /** Horizontal-line candidates (compared against Y coordinates). */
  y: SnapCandidate[]
}

export interface SnapEngineContext {
  page: Pick<PageSchema, 'width' | 'height' | 'grid'>
  guidesX: number[]
  guidesY: number[]
  /** Other elements (those not being moved) to align with. */
  otherNodes: MaterialNode[]
  /**
   * Visual size of a node (may differ from `node.width / node.height` for
   * materials with virtual content, e.g. table placeholder rows). Used both
   * for selection-box assembly and for emitting snap candidates so rotated
   * elements get a true AABB.
   */
  getVisualSize: (n: MaterialNode) => { width: number, height: number }
  enabled: boolean
  gridSnap: boolean
  guideSnap: boolean
  elementSnap: boolean
}

const SOURCE_PRIORITY: Record<SnapSource, number> = {
  element: 3,
  guide: 2,
  grid: 1,
}

/**
 * Enumerate snap-target candidates for both axes from the configured sources.
 * Grid emits no enumerable candidate list (infinite values) — it is handled
 * specially in `pickBestSnap` by snapping the test value to the nearest grid step.
 */
export function collectSnapCandidates(ctx: SnapEngineContext): SnapCandidates {
  const x: SnapCandidate[] = []
  const y: SnapCandidate[] = []
  const pageW = ctx.page.width
  const pageH = ctx.page.height

  if (ctx.guideSnap) {
    for (const g of ctx.guidesX) {
      x.push({ value: g, source: 'guide', segmentExtent: { min: 0, max: pageH } })
    }
    for (const g of ctx.guidesY) {
      y.push({ value: g, source: 'guide', segmentExtent: { min: 0, max: pageW } })
    }
  }

  if (ctx.elementSnap) {
    for (const node of ctx.otherNodes) {
      const size = ctx.getVisualSize(node)
      // Use the rotated AABB so candidates align with the element's true
      // visual extent. `getRotatedAABB` short-circuits when rotation is 0.
      const aabb = getRotatedAABB(
        { x: node.x, y: node.y, width: size.width, height: size.height },
        node.rotation,
      )
      const xMin = aabb.x
      const xMax = aabb.x + aabb.width
      const yMin = aabb.y
      const yMax = aabb.y + aabb.height
      const yExtent = { min: yMin, max: yMax }
      const xExtent = { min: xMin, max: xMax }
      // Vertical lines (left, center, right of the element)
      x.push({ value: xMin, source: 'element', targetId: node.id, segmentExtent: yExtent })
      x.push({ value: (xMin + xMax) / 2, source: 'element', targetId: node.id, segmentExtent: yExtent })
      x.push({ value: xMax, source: 'element', targetId: node.id, segmentExtent: yExtent })
      // Horizontal lines (top, middle, bottom of the element)
      y.push({ value: yMin, source: 'element', targetId: node.id, segmentExtent: xExtent })
      y.push({ value: (yMin + yMax) / 2, source: 'element', targetId: node.id, segmentExtent: xExtent })
      y.push({ value: yMax, source: 'element', targetId: node.id, segmentExtent: xExtent })
    }
  }

  return { x, y }
}

export interface SnapPickResult {
  /** The snapped coordinate to align the test value to. */
  snapTo: number
  /** Which test value matched. */
  testValue: number
  candidate: SnapCandidate
  distance: number
}

/**
 * Pick the closest snap among:
 *  - explicit candidates (guide/element)
 *  - implicit grid-step snap (when `grid` provided and gridSnap enabled)
 *
 * Returns null if no candidate is within threshold.
 *
 * Tie-breaking: source priority `element > guide > grid` (within a 1e-6 fudge),
 * so a guide and a grid line at equal distance still surface the guide.
 */
export function pickBestSnap(
  testValues: number[],
  candidates: SnapCandidate[],
  threshold: number,
  grid?: { step: number },
): SnapPickResult | null {
  let best: SnapPickResult | null = null
  const TIE_EPS = 1e-6

  function consider(result: SnapPickResult) {
    if (result.distance > threshold)
      return
    if (best == null) {
      best = result
      return
    }
    const delta = result.distance - best.distance
    if (delta < -TIE_EPS) {
      best = result
      return
    }
    if (delta <= TIE_EPS
      && SOURCE_PRIORITY[result.candidate.source] > SOURCE_PRIORITY[best.candidate.source]) {
      best = result
    }
  }

  for (const testValue of testValues) {
    for (const candidate of candidates) {
      const dist = Math.abs(testValue - candidate.value)
      consider({ snapTo: candidate.value, testValue, candidate, distance: dist })
    }
    if (grid && grid.step > 0) {
      const snapped = snapToGrid(testValue, grid.step)
      const dist = Math.abs(testValue - snapped)
      consider({
        snapTo: snapped,
        testValue,
        candidate: { value: snapped, source: 'grid' },
        distance: dist,
      })
    }
  }

  return best
}

export interface SnapComputeInput {
  /** Selection bounding box in document units, before applying dx/dy. */
  selectionBox: Rect
  /** Proposed translation in document units. */
  dx: number
  dy: number
  /** Threshold in document units (caller already normalized for zoom). */
  threshold: number
  /** Which axes participate in snapping. Default: both. */
  axes?: { x?: boolean, y?: boolean }
  /**
   * Which selection-box sides participate per axis. Default for translate:
   * x => [min, center, max], y => [min, center, max]. Resize handlers may
   * pass a single side per axis (the moving edge).
   */
  sidesX?: ('min' | 'center' | 'max')[]
  sidesY?: ('min' | 'center' | 'max')[]
  /**
   * Pre-computed candidates from `collectSnapCandidates(ctx)`. When provided,
   * `computeSnap` skips re-collecting; callers that drive a long-lived
   * pointer interaction (drag/resize) cache these once at pointerdown to
   * avoid an O(n) allocation every pointermove frame.
   */
  precomputedCandidates?: SnapCandidates
}

export interface SnapComputeResult {
  /** Adjusted translation that aligns the selection to the chosen candidate. */
  dx: number
  dy: number
  /** Snap lines for visual overlay. */
  lines: SnapLine[]
}

const DEFAULT_SIDES: ('min' | 'center' | 'max')[] = ['min', 'center', 'max']

function sideValue(box: Rect, axis: 'x' | 'y', side: 'min' | 'center' | 'max'): number {
  if (axis === 'x') {
    if (side === 'min')
      return box.x
    if (side === 'center')
      return box.x + box.width / 2
    return box.x + box.width
  }
  if (side === 'min')
    return box.y
  if (side === 'center')
    return box.y + box.height / 2
  return box.y + box.height
}

function buildLine(
  orientation: 'vertical' | 'horizontal',
  candidate: SnapCandidate,
  selectionBox: Rect,
  dx: number,
  dy: number,
): SnapLine {
  const movedBox: Rect = {
    x: selectionBox.x + dx,
    y: selectionBox.y + dy,
    width: selectionBox.width,
    height: selectionBox.height,
  }
  const ext = candidate.segmentExtent
  if (orientation === 'vertical') {
    const selMin = movedBox.y
    const selMax = movedBox.y + movedBox.height
    if (ext) {
      return {
        orientation,
        position: candidate.value,
        from: Math.min(selMin, ext.min),
        to: Math.max(selMax, ext.max),
        source: candidate.source,
        targetId: candidate.targetId,
      }
    }
    return {
      orientation,
      position: candidate.value,
      from: selMin,
      to: selMax,
      source: candidate.source,
      targetId: candidate.targetId,
    }
  }
  const selMin = movedBox.x
  const selMax = movedBox.x + movedBox.width
  if (ext) {
    return {
      orientation,
      position: candidate.value,
      from: Math.min(selMin, ext.min),
      to: Math.max(selMax, ext.max),
      source: candidate.source,
      targetId: candidate.targetId,
    }
  }
  return {
    orientation,
    position: candidate.value,
    from: selMin,
    to: selMax,
    source: candidate.source,
    targetId: candidate.targetId,
  }
}

/**
 * Top-level snap entry point. Collects candidates, picks the best for each
 * axis, and returns adjusted translation + snap lines for overlay.
 *
 * Snap is bypassed entirely when `ctx.enabled` is false; callers should also
 * bypass when modifier keys (Cmd/Ctrl) are held.
 */
export function computeSnap(
  ctx: SnapEngineContext,
  input: SnapComputeInput,
): SnapComputeResult {
  if (!ctx.enabled) {
    return { dx: input.dx, dy: input.dy, lines: [] }
  }

  const candidates = input.precomputedCandidates ?? collectSnapCandidates(ctx)
  const grid = ctx.gridSnap && ctx.page.grid?.enabled ? ctx.page.grid : undefined
  const sidesX = input.sidesX ?? DEFAULT_SIDES
  const sidesY = input.sidesY ?? DEFAULT_SIDES
  const wantX = input.axes?.x !== false
  const wantY = input.axes?.y !== false

  const movedBox: Rect = {
    x: input.selectionBox.x + input.dx,
    y: input.selectionBox.y + input.dy,
    width: input.selectionBox.width,
    height: input.selectionBox.height,
  }

  const lines: SnapLine[] = []
  let outDx = input.dx
  let outDy = input.dy

  if (wantX) {
    const testsX = sidesX.map(s => sideValue(movedBox, 'x', s))
    const gridX = grid && grid.width > 0 ? { step: grid.width } : undefined
    const pick = pickBestSnap(testsX, candidates.x, input.threshold, gridX)
    if (pick) {
      outDx += pick.snapTo - pick.testValue
      lines.push(buildLine('vertical', pick.candidate, input.selectionBox, outDx, input.dy))
    }
  }

  if (wantY) {
    const testsY = sidesY.map(s => sideValue(movedBox, 'y', s))
    const gridY = grid && grid.height > 0 ? { step: grid.height } : undefined
    const pick = pickBestSnap(testsY, candidates.y, input.threshold, gridY)
    if (pick) {
      outDy += pick.snapTo - pick.testValue
      lines.push(buildLine('horizontal', pick.candidate, input.selectionBox, input.dx, outDy))
    }
  }

  return { dx: outDx, dy: outDy, lines }
}
