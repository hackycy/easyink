import type { InternalHooks } from '@easyink/core'
import type { DataAdapter, DataSourceDescriptor, UsageResolver } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type {
  ExportAdapter,
  MaterialViewerExtension,
  PrintAdapter,
  ViewerDiagnosticEvent,
  ViewerOpenInput,
  ViewerOptions,
  ViewerRenderResult,
} from './types'
import { createInternalHooks, createPagePlan, FontManager } from '@easyink/core'
import { DataSourceRegistry } from '@easyink/datasource'
import { traverseNodes, validateSchema } from '@easyink/schema'
import { applyBindingsToProps, projectBindings } from './binding-projector'
import { collectFontFamilies, loadAndInjectFonts } from './font-loader'
import { MaterialRendererRegistry } from './material-registry'
import { renderPages } from './render-surface'

export class ViewerRuntime {
  private _options: ViewerOptions
  private _schema?: DocumentSchema
  private _data: Record<string, unknown> = {}
  private _dataSources: DataSourceDescriptor[] = []
  private _diagnosticHandler?: (event: ViewerDiagnosticEvent) => void
  private _exportAdapters: ExportAdapter[] = []
  private _printAdapters: PrintAdapter[] = []
  private _registry = new DataSourceRegistry()
  private _materialRegistry = new MaterialRendererRegistry()
  private _fontManager: FontManager
  private _hooks: InternalHooks
  private _destroyed = false

  constructor(options: ViewerOptions = {}) {
    this._options = options
    this._fontManager = new FontManager(options.fontProvider)
    this._hooks = createInternalHooks()
  }

  // ---------------------------------------------------------------------------
  // Public API (architecture doc 06 - ViewerRuntime interface)
  // ---------------------------------------------------------------------------

  async open(input: ViewerOpenInput): Promise<void> {
    this.ensureNotDestroyed()

    // 1. Validate schema
    const errors = validateSchema(input.schema)
    if (errors.length > 0) {
      const event: ViewerDiagnosticEvent = {
        category: 'schema',
        severity: 'error',
        code: 'INVALID_SCHEMA',
        message: errors.join('; '),
      }
      input.onDiagnostic?.(event)
      throw new Error(`Invalid schema: ${errors.join('; ')}`)
    }

    // 2. Hook: beforeSchemaNormalize
    const normalizedSchema = this._hooks.beforeSchemaNormalize.call(input.schema)
    this._schema = normalizedSchema

    this._data = input.data || {}
    this._dataSources = input.dataSources || []
    this._diagnosticHandler = input.onDiagnostic

    // 3. Register data sources + adapters + usage resolvers
    this._registry.clear()
    for (const source of this._dataSources) {
      this._registry.registerSource(source)
    }
    if (input.dataAdapters) {
      for (const adapter of input.dataAdapters) {
        this._registry.registerAdapter(adapter)
      }
    }
    if (input.usageResolvers) {
      for (const resolver of input.usageResolvers) {
        this._registry.registerUsageResolver(resolver)
      }
    }

    // 4. Load data through adapters (if any adapters registered)
    await this.loadAdapterData()

    // 5. Render (font loading + binding + page plan + DOM)
    if (this._options.container) {
      await this.render()
    }
  }

  async updateData(data: Record<string, unknown>): Promise<void> {
    this.ensureNotDestroyed()
    this._data = data
    if (this._options.container && this._schema) {
      await this.render()
    }
  }

  async render(): Promise<ViewerRenderResult> {
    this.ensureNotDestroyed()
    if (!this._schema) {
      throw new Error('No schema loaded. Call open() first.')
    }

    const diagnostics: ViewerDiagnosticEvent[] = []

    // Stage 1: Font loading (architecture doc 06 §6.2 step 2)
    await this.loadFonts(diagnostics)

    // Stage 2: Binding projection (architecture doc 06 §6.2 steps 3-4)
    const resolvedPropsMap = this.resolveAllBindings(diagnostics)

    // Stage 3: Hook - beforePagePlan
    this._hooks.beforePagePlan.call({ schema: this._schema, mode: this._schema.page.mode })

    // Stage 4: Page planning (architecture doc 06 §6.2 step 5)
    const plan = createPagePlan(this._schema)

    for (const d of plan.diagnostics) {
      diagnostics.push({
        category: 'viewer',
        severity: d.severity,
        code: d.code,
        message: d.message,
      })
    }

    // Stage 5: DOM rendering (architecture doc 06 §6.2 step 6)
    const pages = plan.pages.map(p => ({
      index: p.index,
      width: p.width,
      height: p.height,
      elementCount: p.elements.length,
      element: undefined as HTMLElement | undefined,
    }))

    if (this._options.container) {
      const pageDOMs = renderPages(
        plan.pages,
        this._materialRegistry,
        {
          container: this._options.container,
          zoom: 1,
          unit: this._schema.unit,
          data: this._data,
          resolvedPropsMap,
        },
        diagnostics,
      )

      for (const dom of pageDOMs) {
        const page = pages.find(p => p.index === dom.pageIndex)
        if (page) {
          page.element = dom.element
        }
      }
    }

    // Emit all diagnostics
    for (const d of diagnostics) {
      this.emitDiagnostic(d)
    }

    return { pages, thumbnails: [], diagnostics }
  }

  async print(): Promise<void> {
    this.ensureNotDestroyed()
    if (!this._schema)
      throw new Error('No schema loaded')

    if (this._printAdapters.length > 0) {
      const adapter = this._printAdapters[0]!
      await adapter.print({
        schema: this._schema,
        data: this._data,
        dataSources: this._dataSources,
        entry: 'preview',
      })
      return
    }

    // Fallback: use window.print
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  async exportDocument(format?: string): Promise<Blob | void> {
    this.ensureNotDestroyed()
    if (!this._schema)
      throw new Error('No schema loaded')

    const adapter = format
      ? this._exportAdapters.find(a => a.format === format)
      : this._exportAdapters[0]

    if (!adapter) {
      this.emitDiagnostic({
        category: 'export-adapter',
        severity: 'error',
        code: 'NO_EXPORT_ADAPTER',
        message: `No export adapter found for format: ${format || 'default'}`,
      })
      return
    }

    const context = {
      schema: this._schema,
      data: this._data,
      dataSources: this._dataSources,
      entry: 'api' as const,
    }

    if (adapter.prepare) {
      await adapter.prepare(context)
    }

    return adapter.export(context)
  }

  destroy(): void {
    this._destroyed = true
    this._schema = undefined
    this._data = {}
    this._dataSources = []
    this._registry.clear()
    this._materialRegistry.clear()
    this._exportAdapters = []
    this._printAdapters = []
    this._fontManager.clear()
    if (this._options.container) {
      this._options.container.innerHTML = ''
    }
  }

  // ---------------------------------------------------------------------------
  // Registration API
  // ---------------------------------------------------------------------------

  registerMaterial(type: string, extension: MaterialViewerExtension): void {
    this._materialRegistry.register(type, extension)
  }

  registerDataAdapter(adapter: DataAdapter): void {
    this._registry.registerAdapter(adapter)
  }

  registerUsageResolver(resolver: UsageResolver): void {
    this._registry.registerUsageResolver(resolver)
  }

  registerExportAdapter(adapter: ExportAdapter): void {
    this._exportAdapters.push(adapter)
  }

  registerPrintAdapter(adapter: PrintAdapter): void {
    this._printAdapters.push(adapter)
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get schema(): DocumentSchema | undefined {
    return this._schema
  }

  get data(): Record<string, unknown> {
    return this._data
  }

  get hooks(): InternalHooks {
    return this._hooks
  }

  get fontManager(): FontManager {
    return this._fontManager
  }

  get materialRegistry(): MaterialRendererRegistry {
    return this._materialRegistry
  }

  // ---------------------------------------------------------------------------
  // Internal pipeline stages
  // ---------------------------------------------------------------------------

  /**
   * Stage: Font loading — collect references from schema, load via FontManager,
   * inject @font-face into the container's owner document.
   */
  private async loadFonts(diagnostics: ViewerDiagnosticEvent[]): Promise<void> {
    if (!this._schema || !this._fontManager.provider)
      return

    const families = collectFontFamilies(this._schema)
    if (families.size === 0)
      return

    const container = this._options.container
    if (!container)
      return // No DOM target for @font-face injection

    const target = container.ownerDocument
    const fontDiags = await loadAndInjectFonts(families, this._fontManager, target)
    diagnostics.push(...fontDiags)
  }

  /**
   * Stage: Data adapter loading — for each registered data source,
   * attempt to load data through matching adapters and merge into _data.
   */
  private async loadAdapterData(): Promise<void> {
    for (const source of this._dataSources) {
      try {
        const result = await this._registry.loadData(source)
        if (result && typeof result === 'object') {
          Object.assign(this._data, result as Record<string, unknown>)
        }
      }
      catch {
        // No adapter matched or load failed — not fatal, data may be provided directly
      }
    }
  }

  /**
   * Stage: Binding projection — resolve all element bindings against data,
   * apply usage formatting, return a map of nodeId -> resolved props.
   */
  private resolveAllBindings(diagnostics: ViewerDiagnosticEvent[]): Map<string, Record<string, unknown>> {
    const resolvedMap = new Map<string, Record<string, unknown>>()
    if (!this._schema)
      return resolvedMap

    traverseNodes(this._schema, (node) => {
      if (!node.binding) {
        resolvedMap.set(node.id, node.props)
        return
      }

      try {
        const projected = projectBindings(node, this._data, this._registry)
        const resolvedProps = applyBindingsToProps(node.props, projected, node.type)
        resolvedMap.set(node.id, resolvedProps)
      }
      catch (err) {
        diagnostics.push({
          category: 'datasource',
          severity: 'warning',
          code: 'BINDING_RESOLVE_ERROR',
          message: `Binding resolution failed for ${node.id}: ${err instanceof Error ? err.message : String(err)}`,
          nodeId: node.id,
        })
        resolvedMap.set(node.id, node.props)
      }
    })

    return resolvedMap
  }

  private ensureNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error('ViewerRuntime has been destroyed')
    }
  }

  private emitDiagnostic(event: ViewerDiagnosticEvent): void {
    this._diagnosticHandler?.(event)
  }
}
