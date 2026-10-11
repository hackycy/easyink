import type { Command, MaterialDesignerExtension, NodeSignal, PropertyPanelOverlay, PropSchema, SelectionSnapshot, TransactionAPI } from '@easyink/core'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { BindingRef, DocumentSchema, DocumentSchemaInput, MaterialNode } from '@easyink/schema'
import type { LocaleDeclaration, MaterialDeclaration, RendererDeclaration } from './material'
import type { DeepReadonly, ResourceContext } from './resources'

export type { MaterialModel } from './material'
export type { PropSchema } from '@easyink/core'

export interface ConfirmRequest {
  readonly id: string
  readonly title?: string
  readonly message: string
  readonly description?: string
  readonly severity?: 'info' | 'warning' | 'danger'
  readonly confirmText?: string
  readonly cancelText?: string
  readonly payload?: unknown
}

export interface AssetPickRequest {
  readonly id: string
  readonly source: string
  readonly title?: string
  readonly currentUrl?: string
  readonly accept?: readonly string[]
  readonly payload?: unknown
}

export interface TextFilePickRequest {
  readonly id: string
  readonly source: string
  readonly title?: string
  readonly accept?: readonly string[]
  readonly encoding?: string
  readonly maxBytes?: number
  readonly payload?: unknown
}

export interface ResolvedAsset {
  readonly url: string
  readonly assetId?: string
  readonly alt?: string
  readonly width?: number
  readonly height?: number
  readonly name?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface ResolvedTextFile {
  readonly text: string
  readonly name?: string
  readonly type?: string
  readonly size?: number
  readonly lastModified?: number
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface DesignerQueries {
  readonly getSchema: () => DeepReadonly<DocumentSchema>
  readonly getNode: (id: string) => DeepReadonly<MaterialNode> | undefined
  readonly getSelection: () => DeepReadonly<SelectionSnapshot>
  readonly isEditing: (nodeId: string) => boolean
  readonly getDataSources: () => readonly DeepReadonly<DataSourceDescriptor>[]
  readonly getMaterials: () => readonly DeepReadonly<MaterialDeclaration>[]
  readonly getBindingLabel: (binding: BindingRef) => string
  readonly t: (key: string) => string
}

export interface DesignerContext extends DesignerQueries, ResourceContext {
  readonly commitCommand: (command: Command) => void
  /** Existing synchronous draft transaction protocol; no atomicity across await. */
  readonly tx: TransactionAPI
  readonly replaceDocument: (schema: DocumentSchemaInput) => void
  readonly readDocumentExtension: (namespace: string) => unknown
  readonly writeDocumentExtension: (namespace: string, value: unknown) => void
  readonly registerDataSource: (source: DataSourceDescriptor) => void
  readonly confirm: (request: ConfirmRequest) => Promise<boolean>
  readonly pickAsset: (request: AssetPickRequest) => Promise<ResolvedAsset | null>
  readonly pickFileText: (request: TextFilePickRequest) => Promise<ResolvedTextFile | null>
  readonly executeCommand: <TArgs, TResult>(command: DesignerCommand<TArgs, TResult>, args: TArgs) => Promise<TResult>
  readonly reportDiagnostic: (diagnostic: { code: string, message: string, cause?: unknown }) => void
}

export interface MaterialPropertiesContext extends DesignerQueries, ResourceContext {
  readonly node: DeepReadonly<MaterialNode>
  readonly tx: TransactionAPI
  readonly flushPendingEdits: () => void
}

export interface DesignerRendererContext extends DesignerContext {
  readonly requestPropertyPanel: (overlay: PropertyPanelOverlay | null) => void
  readonly getZoom: () => number
  readonly getPageEl: () => HTMLElement | null
  readonly on: (event: string, handler: (...args: unknown[]) => void) => () => void
  readonly emit: (event: string, payload: unknown) => void
}

export type DesignerRenderer = (context: DesignerRendererContext) => MaterialDesignerExtension
export type PanelSectionId = 'geometry' | 'props' | 'overlay' | 'binding' | 'condition' | 'visibility'

/** Vue-bearing features are supplied only by the /ui specialization. */
export type DesignerMaterial<TUI = never> = MaterialDeclaration & RendererDeclaration<DesignerRenderer> & {
  readonly properties?: readonly PropSchema[]
  readonly sectionFilter?: (section: PanelSectionId, context: { node: DeepReadonly<MaterialNode>, isEditing: boolean }) => boolean
  readonly ui?: TUI
}

export interface DesignerCommand<TArgs = void, TResult = void> {
  readonly id: string
  readonly handler: (args: TArgs, context: DesignerContext) => TResult | Promise<TResult>
}

export interface DesignerExtension<TUI = never> {
  readonly id: string
  readonly locale?: LocaleDeclaration
  readonly commands?: readonly DesignerCommand<never, unknown>[]
  readonly ui?: TUI
}

export type { NodeSignal }
