import type { FontProvider, MaterialViewerExtension, ViewerMeasureContext, ViewerMeasureResult, ViewerRenderContext, ViewerRenderOutput } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { DiagnosticCategory, DiagnosticSeverity, ExportEntry, ExportFormat, ExportPhase } from '@easyink/shared'

export type { DocumentSchema, MaterialNode }

// Re-export viewer-material contract types from core so host code can import from one place.
export type { MaterialViewerExtension, ViewerMeasureContext, ViewerMeasureResult, ViewerRenderContext, ViewerRenderOutput }

// ---------------------------------------------------------------------------
// Viewer options & input
// ---------------------------------------------------------------------------

export interface ViewerOptions {
  mode?: 'fixed' | 'stack' | 'label'
  container?: HTMLElement
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
  scope?: 'schema' | 'datasource' | 'font' | 'material' | 'print' | 'export-adapter'
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

export interface ThumbnailResult {
  pageIndex: number
  dataUrl?: string
}

// ---------------------------------------------------------------------------
// Export & print adapters
// ---------------------------------------------------------------------------

export interface ExportAdapter {
  id: string
  format: ExportFormat
  prepare?: (context: ViewerExportContext) => Promise<void>
  export: (context: ViewerExportContext) => Promise<Blob | void>
}

export interface ViewerExportContext {
  schema: DocumentSchema
  data?: Record<string, unknown>
  entry: ExportEntry
}

export interface ExportDispatchState {
  phase: ExportPhase
  entry: ExportEntry
  format?: string
  error?: string
}

export interface PrintAdapter {
  id: string
  print: (context: ViewerExportContext) => Promise<void>
}

// ---------------------------------------------------------------------------
// Binding projection
// ---------------------------------------------------------------------------

export interface ProjectedBinding {
  bindIndex: number
  value: unknown
}
