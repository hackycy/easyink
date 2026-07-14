import type { ViewerTreePolicy } from '@easyink/browser-dom'
import type { CompiledMaterialProfile, FontProvider, MaterialViewerExtension, ViewerRenderContext, ViewerRenderOutput } from '@easyink/core'
import type { DocumentSchema, DocumentSchemaInput } from '@easyink/schema'
import type { DiagnosticCategory, DiagnosticSeverity, ExportEntry, ExportFormat, ExportPhase } from '@easyink/shared'
import type { PreparedCollectionProvider } from './prepared-collections'
import type { ViewerHost } from './viewer-host'

export * from '@easyink/schema'

// Re-export viewer-material contract types from core so host code can import from one place.
export type { MaterialViewerExtension, ViewerRenderContext, ViewerRenderOutput }

// ---------------------------------------------------------------------------
// Viewer options & input
// ---------------------------------------------------------------------------

export interface ViewerOptions {
  profile: CompiledMaterialProfile
  mode?: DocumentSchema['page']['mode']
  container?: HTMLElement
  host?: ViewerHost
  iframe?: HTMLIFrameElement
  fontProvider?: FontProvider
  prepareAsset?: (
    value: string,
    signal: AbortSignal,
  ) => Promise<Readonly<{ state: 'ready' | 'failed', message?: string }>>
  browserDom?: {
    policy?: ViewerTreePolicy
    imperativeDom?: readonly string[]
    maxNodes?: number
  }
  performanceBudget?: Partial<ViewerPerformanceBudget>
  preparedCollections?: PreparedCollectionProvider
}

export interface ViewerOpenInput {
  schema: DocumentSchemaInput
  documentRevision?: number
  data?: Record<string, unknown>
  dataRevision?: number
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
}

export interface ViewerDataUpdateOptions {
  dataRevision?: number
}

export interface ViewerRevisionSnapshot {
  documentRevision: number
  dataRevision: number
  resourceRevision: number
}

export interface ViewerPerformanceBudget {
  measureCacheEntries: number
  maxMeasureInFlight: number
  pageDomOverscan: number
  maxInlineDataNodes: number
  maxInlineDataStringBytes: number
  maxRuntimeRows: number
  maxLayoutFactsPerMaterial: number
  maxRenderTreeNodesPerMaterial: number
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export interface ViewerDiagnosticEvent {
  category: DiagnosticCategory
  severity: DiagnosticSeverity
  code: string
  message: string
  nodeId?: string
  detail?: unknown
  /** 6.10: 诊断来源阶段 */
  scope?: 'schema' | 'datasource' | 'condition' | 'font' | 'material' | 'print' | 'exporter' | 'hook'
  /** 6.10: 原始异常对象，用于根因追踪 */
  cause?: unknown
}

// ---------------------------------------------------------------------------
// Render result
// ---------------------------------------------------------------------------

export interface ViewerRenderResult {
  pages: ViewerPageResult[]
  thumbnails: ThumbnailResult[]
  diagnostics: ViewerDiagnosticEvent[]
}

export interface ViewerPageResult {
  index: number
  width: number
  height: number
  elementCount: number
  element?: HTMLElement
}

export interface ViewerPageMetrics {
  index: number
  width: number
  height: number
  unit: string
}

export interface ThumbnailResult {
  pageIndex: number
  dataUrl?: string
}

// ---------------------------------------------------------------------------
// Exporters & print drivers
// ---------------------------------------------------------------------------

export interface ViewerExporter {
  id: string
  format: ExportFormat
  prepare?: (context: ViewerExportContext) => Promise<void>
  export: (context: ViewerExportContext) => Promise<Blob | void>
}

export interface ViewerExportContext {
  schema: DocumentSchema
  data?: Record<string, unknown>
  entry: ExportEntry
  renderedPages?: ViewerPageMetrics[]
  container?: HTMLElement
  onPhase?: (event: ViewerTaskPhaseEvent) => void
  onProgress?: (event: ViewerTaskProgressEvent) => void
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
}

export interface ExportDispatchState {
  phase: ExportPhase
  entry: ExportEntry
  format?: string
  error?: string
}

export type ViewerPrintPageSizeMode = 'driver' | 'fixed'

export interface ViewerTaskPhaseEvent {
  phase: string
  message?: string
}

export interface ViewerTaskProgressEvent {
  current?: number
  total?: number
  message?: string
}

export interface ViewerTaskCallbacks {
  onPhase?: (event: ViewerTaskPhaseEvent) => void
  onProgress?: (event: ViewerTaskProgressEvent) => void
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
  throwOnError?: boolean
}

export interface ViewerPrintOptions extends ViewerTaskCallbacks {
  pageSizeMode?: ViewerPrintPageSizeMode
  driverId?: string
}

export interface ViewerExportOptions extends ViewerTaskCallbacks {
  format?: string
  entry?: ExportEntry
}

export interface ViewerPrintSheetSize {
  width: number
  height: number
  unit: string
  source: 'schema' | 'rendered'
}

export interface ViewerPrintPolicy {
  pageMode: DocumentSchema['page']['mode']
  pageSizeMode: ViewerPrintPageSizeMode
  sheetSize?: ViewerPrintSheetSize
  orientation: 'portrait' | 'landscape' | 'auto'
  pageBreakBehavior: {
    after: 'auto' | 'page'
    inside: 'auto' | 'avoid'
  }
  offset: {
    horizontal: number
    vertical: number
    unit: string
  }
}

export interface ViewerPrintContext extends ViewerExportContext {
  printPolicy: ViewerPrintPolicy
  renderedPages: ViewerPageMetrics[]
  container?: HTMLElement
}

export interface PrintDriver {
  id: string
  defaults?: {
    pageSizeMode?: ViewerPrintPageSizeMode
  }
  print: (context: ViewerPrintContext) => Promise<void>
}
