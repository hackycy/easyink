import type { BindingFormatDiagnostic, FontProvider, FragmentPaginateInput, FragmentPaginateResult, FragmentPaginator, MaterialViewerExtension, ViewerMeasureContext, ViewerMeasureResult, ViewerRenderContext, ViewerRenderOutput, ViewerRenderSize } from '@easyink/core'
import type { DocumentSchema } from '@easyink/schema'
import type { DiagnosticCategory, DiagnosticSeverity, ExportEntry, ExportFormat, ExportPhase } from '@easyink/shared'
import type { ViewerHost } from './viewer-host'

export * from '@easyink/schema'

// Re-export viewer-material contract types from core so host code can import from one place.
export type { FragmentPaginateInput, FragmentPaginateResult, FragmentPaginator, MaterialViewerExtension, ViewerMeasureContext, ViewerMeasureResult, ViewerRenderContext, ViewerRenderOutput, ViewerRenderSize }

// ---------------------------------------------------------------------------
// Viewer options & input
// ---------------------------------------------------------------------------

export interface ViewerOptions {
  mode?: DocumentSchema['page']['mode']
  container?: HTMLElement
  host?: ViewerHost
  iframe?: HTMLIFrameElement
  fontProvider?: FontProvider
}

export interface ViewerOpenInput {
  schema: DocumentSchema
  data?: Record<string, unknown>
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
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
  scope?: 'schema' | 'datasource' | 'font' | 'material' | 'print' | 'exporter' | 'hook'
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

// ---------------------------------------------------------------------------
// Binding projection
// ---------------------------------------------------------------------------

export interface ProjectedBinding {
  bindIndex: number
  value: unknown
  diagnostics?: BindingFormatDiagnostic[]
}
