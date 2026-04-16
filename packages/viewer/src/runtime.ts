import type { InternalHooks } from '@easyink/core'
import type { DocumentSchema } from '@easyink/schema'
import type {
  ExportAdapter,
  MaterialViewerExtension,
  PrintAdapter,
  ViewerDiagnosticEvent,
  ViewerMeasureContext,
  ViewerOpenInput,
  ViewerOptions,
  ViewerRenderResult,
} from './types'
import { createInternalHooks, createPagePlan, FontManager } from '@easyink/core'
import { traverseNodes, validateSchema } from '@easyink/schema'
import { UNIT_FACTOR } from '@easyink/shared'
import { applyBindingsToProps, projectBindings } from './binding-projector'
import { collectFontFamilies, loadAndInjectFonts } from './font-loader'
import { MaterialRendererRegistry } from './material-registry'
import { renderPages } from './render-surface'
import { applyStackFlowLayout } from './stack-flow-layout'

export class ViewerRuntime {
  private _options: ViewerOptions
  private _schema?: DocumentSchema
  private _data: Record<string, unknown> = {}
  private _diagnosticHandler?: (event: ViewerDiagnosticEvent) => void
  private _exportAdapters: ExportAdapter[] = []
  private _printAdapters: PrintAdapter[] = []
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
  // Public API
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
    this._diagnosticHandler = input.onDiagnostic

    // 3. Render (font loading + binding + page plan + DOM)
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

    // Stage 1: Font loading
    await this.loadFonts(diagnostics)

    // Stage 2: Binding projection
    const resolvedPropsMap = this.resolveAllBindings(diagnostics)

    // Stage 3: Hook - beforePagePlan
    this._hooks.beforePagePlan.call({ schema: this._schema, mode: this._schema.page.mode })

    // Stage 3.5: Measure elements that need expansion (e.g., table-data)
    const { schema: measuredSchema, diagnostics: layoutDiagnostics } = this.applyMeasureAndLayout()
    diagnostics.push(...layoutDiagnostics)

    // Stage 4: Page planning
    const plan = createPagePlan(measuredSchema)

    for (const d of plan.diagnostics) {
      diagnostics.push({
        category: 'viewer',
        severity: d.severity,
        code: d.code,
        message: d.message,
      })
    }

    // Stage 5: DOM rendering
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
        entry: 'preview',
      })
      return
    }

    // Fallback: window.print with DOM isolation
    if (typeof window !== 'undefined') {
      if (this._options.container) {
        this.printWithIsolation()
      }
      else {
        window.print()
      }
    }
  }

  private printWithIsolation(): void {
    const container = this._options.container!
    const doc = container.ownerDocument

    // Mark ancestor chain so print CSS can hide everything else
    const ancestors: HTMLElement[] = []
    let el: HTMLElement | null = container.parentElement
    while (el) {
      el.setAttribute('data-ei-print-ancestor', '')
      ancestors.push(el)
      if (el === doc.body)
        break
      el = el.parentElement
    }
    container.setAttribute('data-ei-printing', '')

    // Inject print stylesheet
    const style = doc.createElement('style')
    style.textContent = this.buildPrintStyles()
    doc.head.appendChild(style)

    window.print()

    // Cleanup
    style.remove()
    container.removeAttribute('data-ei-printing')
    for (const a of ancestors) {
      a.removeAttribute('data-ei-print-ancestor')
    }
  }

  private buildPrintStyles(): string {
    const schema = this._schema!
    const page = schema.page

    // Convert page dimensions to mm for @page size
    const factor = UNIT_FACTOR[schema.unit] ?? 25.4
    const wMm = page.width * 25.4 / factor
    const hMm = page.height * 25.4 / factor

    // Print offset from PagePrintConfig
    const hOff = page.print?.horizontalOffset ?? 0
    const vOff = page.print?.verticalOffset ?? 0
    const offsetCSS = (hOff !== 0 || vOff !== 0)
      ? `transform: translate(${hOff * 25.4 / factor}mm, ${vOff * 25.4 / factor}mm) !important;`
      : ''

    return `@media print {
  @page {
    size: ${wMm}mm ${hMm}mm;
    margin: 0;
  }
  [data-ei-print-ancestor] {
    display: block !important;
    position: static !important;
    overflow: visible !important;
    visibility: visible !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    background: none !important;
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    box-shadow: none !important;
    opacity: 1 !important;
    transform: none !important;
    z-index: auto !important;
    inset: auto !important;
    flex: none !important;
  }
  [data-ei-print-ancestor] > *:not([data-ei-print-ancestor]):not([data-ei-printing]) {
    display: none !important;
  }
  [data-ei-printing] {
    display: block !important;
    position: static !important;
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 !important;
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    background: none !important;
    border: none !important;
    box-shadow: none !important;
  }
  .ei-viewer-page {
    box-shadow: none !important;
    margin: 0 !important;
    break-after: page;
    break-inside: avoid;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    ${offsetCSS}
  }
  .ei-viewer-page:last-child {
    break-after: auto;
  }
}`
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

  private applyMeasureAndLayout(): { schema: DocumentSchema, diagnostics: ViewerDiagnosticEvent[] } {
    if (!this._schema)
      return { schema: this._schema!, diagnostics: [] }

    const measureCtx: ViewerMeasureContext = { data: this._data, unit: this._schema.unit }
    let modified = false
    const diagnostics: ViewerDiagnosticEvent[] = []

    let elements = this._schema.elements.map((node) => {
      const result = this._materialRegistry.measure(node, measureCtx)
      if (!result || (result.width === node.width && result.height === node.height))
        return node
      modified = true
      return { ...node, height: result.height, width: result.width }
    })

    if (this._schema.page.mode === 'stack') {
      const flowResult = applyStackFlowLayout(this._schema.elements, elements)
      elements = flowResult.elements
      diagnostics.push(...flowResult.diagnostics)
      if (!modified) {
        modified = elements.some((node, index) => {
          const original = this._schema!.elements[index]
          return !!original && (node.y !== original.y || node.height !== original.height || node.width !== original.width)
        })
      }
    }

    if (!modified)
      return { schema: this._schema, diagnostics }
    return { schema: { ...this._schema, elements }, diagnostics }
  }

  private async loadFonts(diagnostics: ViewerDiagnosticEvent[]): Promise<void> {
    if (!this._schema || !this._fontManager.provider)
      return

    const families = collectFontFamilies(this._schema)
    if (families.size === 0)
      return

    const container = this._options.container
    if (!container)
      return

    const target = container.ownerDocument
    const fontDiags = await loadAndInjectFonts(families, this._fontManager, target)
    diagnostics.push(...fontDiags)
  }

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
        const projected = projectBindings(node, this._data)
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
