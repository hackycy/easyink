import type { ViewerRenderContext } from '../material-viewer'
import { createFallbackViewerRenderContext } from '../material-viewer'

const DEFAULT_MAX_NODES = 10_000

export function createTestViewerRenderContext(
  overrides: Partial<ViewerRenderContext> = {},
): ViewerRenderContext {
  const resolvedModel = overrides.resolvedModel ?? {}
  const instanceKey = overrides.instanceKey ?? 'test-instance'
  const pageIndex = overrides.pageIndex ?? 0
  const unit = resolveLayoutUnit(overrides.unit ?? 'mm')
  const context = createFallbackViewerRenderContext({
    instanceKey,
    nodeId: 'test-node',
    nodeRevision: 0,
    resolvedModel,
    pageIndex,
    unit,
    width: 1,
    height: 1,
    fragmentBox: { x: 0, y: 0, width: 1, height: 1 },
    data: overrides.data ?? {},
    zoom: 1,
    capabilities: overrides.capabilities ?? {
      sanitizeMarkup() {
        throw new Error('TEST_VIEWER_SANITIZED_MARKUP_NOT_CONFIGURED')
      },
    },
    maxNodes: DEFAULT_MAX_NODES,
    slotOutputs: overrides.slotOutputs,
    reportDiagnostic: overrides.reportDiagnostic,
  })
  return Object.freeze({ ...context, ...overrides })
}

function resolveLayoutUnit(unit: string): 'mm' | 'pt' | 'px' | 'inch' {
  if (unit === 'mm' || unit === 'pt' || unit === 'px' || unit === 'inch')
    return unit
  throw new Error(`TEST_VIEWER_LAYOUT_UNIT_UNSUPPORTED: ${unit}`)
}
