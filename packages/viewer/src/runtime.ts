import type { InternalHooks, PagePlan, PaginationResult, ViewerMeasureResult } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type {
  MaterialViewerExtension,
  PrintDriver,
  ViewerDiagnosticEvent,
  ViewerExporter,
  ViewerExportOptions,
  ViewerMeasureContext,
  ViewerOpenInput,
  ViewerOptions,
  ViewerPageMetrics,
  ViewerPrintOptions,
  ViewerPrintPolicy,
  ViewerRenderResult,
} from './types'
import type { ViewerHost } from './viewer-host'
import { registerBuiltinViewerMaterials } from '@easyink/builtin'
import { createInternalHooks, FontManager, readNodeRepeatScope, runLayoutPipeline, runPagination } from '@easyink/core'
import { normalizeDocumentSchema, traverseNodes, validateSchema } from '@easyink/schema'
import { deepClone, UNIT_FACTOR } from '@easyink/shared'
import { applyBindingsToProps, projectBindings } from './binding-projector'
import { collectFontFamilies, loadAndInjectFonts } from './font-loader'
import { MaterialRendererRegistry } from './material-registry'
import { PrintPolicyError, resolvePrintPolicy } from './print-policy'
import { runPrintWithIsolation } from './print-service'
import { renderPages } from './render-surface'
import { createThumbnails } from './thumbnail-pipeline'
import { createBrowserViewerHost, createIframeViewerHost } from './viewer-host'

export class ViewerRuntime {
  private _options: ViewerOptions
  private _schema?: DocumentSchema
  private _data: Record<string, unknown> = {}
  private _diagnosticHandler?: (event: ViewerDiagnosticEvent) => void
  private _exporters: ViewerExporter[] = []
  private _printDrivers: PrintDriver[] = []
  private _materialRegistry = new MaterialRendererRegistry()
  private _fontManager: FontManager
  private _hooks: InternalHooks
  private _host?: ViewerHost
  private _renderedPageMetrics: ViewerPageMetrics[] = []
  private _destroyed = false
  private _emittingHookFailure = false

  constructor(options: ViewerOptions = {}) {
    this._options = options
    this._host = options.host
      ?? (options.iframe
        ? createIframeViewerHost(options.iframe)
        : options.container
          ? createBrowserViewerHost(options.container)
          : undefined)
    this._fontManager = new FontManager(options.fontProvider)
    this._hooks = createInternalHooks()
    registerBuiltinViewerMaterials((type, extension) => {
      this.registerMaterial(type, extension)
    })
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async open(input: ViewerOpenInput): Promise<void> {
    this.ensureNotDestroyed()
    this._diagnosticHandler = input.onDiagnostic

    // 1. Validate schema
    const errors = validateSchema(input.schema)
    if (errors.length > 0) {
      const event: ViewerDiagnosticEvent = {
        category: 'schema',
        severity: 'error',
        code: 'INVALID_SCHEMA',
        message: errors.join('; '),
        scope: 'schema',
      }
      this.emitDiagnostic(event)
      throw new Error(`Invalid schema: ${errors.join('; ')}`)
    }

    // 2. Hook: beforeSchemaNormalize + schema normalization
    const schemaForNormalize = this.callSchemaNormalizeHook(input.schema)
    const normalizedSchema = normalizeDocumentSchema(schemaForNormalize)
    this._schema = normalizedSchema

    this._data = input.data ?? {}

    // 3. Render (font loading + binding + page plan + DOM)
    if (this._host) {
      await this.render()
    }
  }

  async updateData(data: Record<string, unknown>): Promise<void> {
    this.ensureNotDestroyed()
    this._data = data
    if (this._host && this._schema) {
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
    try {
      this._hooks.beforePagePlan.call({ schema: this._schema, mode: this._schema.page.mode })
    }
    catch (err) {
      const diagnostic: ViewerDiagnosticEvent = {
        category: 'viewer',
        severity: 'error',
        code: 'BEFORE_PAGE_PLAN_HOOK_ERROR',
        message: `beforePagePlan hook failed: ${err instanceof Error ? err.message : String(err)}`,
        scope: 'hook',
        cause: serializeCause(err),
      }
      diagnostics.push(diagnostic)
      this.emitDiagnostic(diagnostic)
      throw err
    }

    // Stage 3.5: Measure elements that need expansion (e.g., table-data)
    const { measurements, diagnostics: layoutDiagnostics } = this.measureRuntimeElements(resolvedPropsMap)
    diagnostics.push(...layoutDiagnostics)

    // Stage 4: Orthogonal layout + pagination planning. Page-repeated
    // elements are overlays resolved after pagination, so they must not
    // contribute to flow, document height, or page count.
    const repeatedElements = this.collectRepeatedPageElements(this._schema.elements)
    const layoutSchema = repeatedElements.length > 0
      ? { ...this._schema, elements: this._schema.elements.filter(el => !repeatedElements.includes(el)) }
      : this._schema
    const layoutDocument = runLayoutPipeline(layoutSchema, {
      originalSchema: layoutSchema,
      measured: measurements,
    })
    const pagination = runPagination(layoutSchema, layoutDocument, {
      originalSchema: layoutSchema,
      resolveFragmentPaginator: fragment => this._materialRegistry.getFragmentPaginator(fragment.node),
      retainBlankPage: repeatedElements.some(el => !el.hidden) ? () => true : undefined,
    })
    const plan = toPagePlan(pagination)

    for (const d of plan.diagnostics) {
      diagnostics.push({
        category: 'viewer',
        severity: d.severity,
        code: d.code,
        message: d.message,
      })
    }

    // Stage 4.5: Resolve per-page overlays (e.g., page-number)
    this.resolveRepeatedPageElements(plan, resolvedPropsMap, repeatedElements)

    // Stage 5: DOM rendering
    const pages = plan.pages.map(p => ({
      index: p.index,
      width: p.width,
      height: p.height,
      elementCount: p.elements.length,
      element: undefined as HTMLElement | undefined,
    }))
    this._renderedPageMetrics = pages.map(page => ({
      index: page.index,
      width: page.width,
      height: page.height,
      unit: this._schema!.unit,
    }))

    if (this._host) {
      const pageDOMs = renderPages(
        plan.pages,
        this._materialRegistry,
        {
          container: this._host.mount,
          document: this._host.document,
          zoom: this.resolveZoom(),
          unit: this._schema.unit,
          data: this._data,
          resolvedPropsMap,
          pageSchema: this._schema.page,
        },
        diagnostics,
      )

      for (const dom of pageDOMs) {
        const page = pages.find(p => p.index === dom.pageIndex)
        if (page) {
          page.element = dom.element
        }
      }

      // Apply page-level viewport offset (preview only, not print)
      this.applyViewportOffset(this._host.mount)
    }

    // Emit all diagnostics
    for (const d of diagnostics) {
      this.emitDiagnostic(d)
    }

    return { pages, thumbnails: createThumbnails(pages, this._schema.unit), diagnostics }
  }

  async print(options: ViewerPrintOptions = {}): Promise<void> {
    this.ensureNotDestroyed()
    if (!this._schema)
      throw new Error('No schema loaded')

    const shouldUseBrowser = !options.driverId || options.driverId === 'browser'
    const driver = shouldUseBrowser
      ? undefined
      : this._printDrivers.find(item => item.id === options.driverId)

    if (!shouldUseBrowser && !driver) {
      const err = new Error(`No print driver found for id: ${options.driverId}`)
      this.emitPrintError(err, options.onDiagnostic, 'NO_PRINT_DRIVER')
      if (options.throwOnError)
        throw err
      return
    }

    const resolvedOptions = options.pageSizeMode || !driver?.defaults?.pageSizeMode
      ? options
      : { ...options, pageSizeMode: driver.defaults.pageSizeMode }

    const printPolicy = this.createPrintPolicy(resolvedOptions)
    if (!printPolicy)
      return

    if (!shouldUseBrowser) {
      const customDriver = driver!
      try {
        options.onPhase?.({ phase: 'preparing', message: customDriver.id })
        await customDriver.print({
          schema: this._schema,
          data: this._data,
          entry: 'preview',
          printPolicy,
          renderedPages: this.renderedPages,
          container: this._host?.mount,
          onPhase: options.onPhase,
          onProgress: options.onProgress,
          onDiagnostic: event => this.emitTaskDiagnostic(event, options.onDiagnostic),
        })
        options.onPhase?.({ phase: 'completed', message: customDriver.id })
      }
      catch (err) {
        this.emitPrintError(err, options.onDiagnostic)
        if (options.throwOnError)
          throw err
      }
      return
    }

    // Fallback: window.print with DOM isolation
    const fallbackWindow = this._host?.window ?? getGlobalWindow()
    if (fallbackWindow) {
      if (this._host) {
        try {
          runPrintWithIsolation(this._host, printPolicy)
        }
        catch (err) {
          this.emitPrintError(err, options.onDiagnostic)
          if (options.throwOnError)
            throw err
        }
      }
      else {
        try {
          fallbackWindow.print()
        }
        catch (err) {
          this.emitPrintError(err, options.onDiagnostic)
          if (options.throwOnError)
            throw err
        }
      }
    }
  }

  private createPrintPolicy(options: ViewerPrintOptions = {}): ViewerPrintPolicy | undefined {
    try {
      return resolvePrintPolicy({
        schema: this._schema!,
        options,
        renderedPages: this._renderedPageMetrics,
      })
    }
    catch (err) {
      this.emitPrintError(err, options.onDiagnostic)
      if (options.throwOnError)
        throw err
      return undefined
    }
  }

  private emitPrintError(
    err: unknown,
    onDiagnostic?: (event: ViewerDiagnosticEvent) => void,
    code?: string,
  ): void {
    const cause = err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : err
    this.emitTaskDiagnostic({
      category: 'print',
      severity: 'error',
      code: code ?? (err instanceof PrintPolicyError ? err.code : 'PRINT_ERROR'),
      message: err instanceof PrintPolicyError
        ? err.message
        : `Print failed: ${err instanceof Error ? err.message : String(err)}`,
      scope: 'print',
      cause,
    }, onDiagnostic)
  }

  async exportDocument(formatOrOptions?: string | ViewerExportOptions): Promise<Blob | void> {
    this.ensureNotDestroyed()
    if (!this._schema)
      throw new Error('No schema loaded')

    const options = typeof formatOrOptions === 'string'
      ? { format: formatOrOptions }
      : (formatOrOptions ?? {})
    const format = options.format

    const exporter = format
      ? this._exporters.find(item => item.format === format)
      : this._exporters[0]

    if (!exporter) {
      const err = new Error(`No exporter found for format: ${format || 'default'}`)
      this.emitTaskDiagnostic({
        category: 'exporter',
        severity: 'error',
        code: 'NO_EXPORTER',
        message: err.message,
        scope: 'exporter',
        cause: serializeCause(err),
      }, options.onDiagnostic)
      if (options.throwOnError)
        throw err
      return
    }

    const context = {
      schema: this._schema,
      data: this._data,
      entry: options.entry ?? 'api' as const,
      renderedPages: this.renderedPages,
      container: this._host?.mount,
      onPhase: options.onPhase,
      onProgress: options.onProgress,
      onDiagnostic: (event: ViewerDiagnosticEvent) => this.emitTaskDiagnostic(event, options.onDiagnostic),
    }

    try {
      if (exporter.prepare) {
        options.onPhase?.({ phase: 'preparing', message: exporter.id })
        await exporter.prepare(context)
      }

      options.onPhase?.({ phase: 'exporting', message: exporter.id })
      const result = await exporter.export(context)
      options.onPhase?.({ phase: 'completed', message: exporter.id })
      return result
    }
    catch (err) {
      this.emitExportError(exporter.id, format, err, options.onDiagnostic)
      if (options.throwOnError)
        throw err
      return undefined
    }
  }

  destroy(): void {
    this._destroyed = true
    this._schema = undefined
    this._data = {}
    this._materialRegistry.clear()
    this._exporters = []
    this._printDrivers = []
    this._renderedPageMetrics = []
    this._fontManager.clear()
    this._host?.clear()
  }

  // ---------------------------------------------------------------------------
  // Registration API
  // ---------------------------------------------------------------------------

  registerMaterial(type: string, extension: MaterialViewerExtension): void {
    this._materialRegistry.register(type, extension)
  }

  registerExporter(exporter: ViewerExporter): void {
    const index = this._exporters.findIndex(item => item.id === exporter.id)
    if (index >= 0)
      this._exporters[index] = exporter
    else
      this._exporters.push(exporter)
  }

  registerPrintDriver(driver: PrintDriver): void {
    const index = this._printDrivers.findIndex(item => item.id === driver.id)
    if (index >= 0)
      this._printDrivers[index] = driver
    else
      this._printDrivers.push(driver)
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

  get renderedPages(): ViewerPageMetrics[] {
    return this._renderedPageMetrics.map(page => ({ ...page }))
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

  private collectRepeatedPageElements(elements: MaterialNode[]): MaterialNode[] {
    return elements.filter(el =>
      readNodeRepeatScope(el) === 'every-output-page'
      || this._materialRegistry.isPageAware(el.type),
    )
  }

  /**
   * Stage 4.5: Resolve per-page repeated elements.
   * Repeated elements are page overlays: one schema node is copied to every
   * output page after pagination and receives page context props.
   */
  private resolveRepeatedPageElements(
    plan: PagePlan,
    resolvedPropsMap: Map<string, Record<string, unknown>>,
    repeatedElements: MaterialNode[],
  ): void {
    if (repeatedElements.length === 0)
      return

    const totalPages = plan.pages.length

    for (const page of plan.pages) {
      for (const el of repeatedElements) {
        const virtualId = `${el.id}__p${page.index}`
        const virtualNode = {
          ...deepClone(el),
          id: virtualId,
          y: page.yOffset + resolveRepeatedElementLocalY(el, page.height),
        }
        page.elements.push(virtualNode)

        const baseProps = resolvedPropsMap.get(el.id) ?? el.props
        resolvedPropsMap.set(virtualId, {
          ...baseProps,
          __pageNumber: page.index + 1,
          __totalPages: totalPages,
        })
      }
    }
  }

  private measureRuntimeElements(resolvedPropsMap: Map<string, Record<string, unknown>>): { measurements: Map<string, ViewerMeasureResult>, diagnostics: ViewerDiagnosticEvent[] } {
    if (!this._schema)
      return { measurements: new Map(), diagnostics: [] }

    const diagnostics: ViewerDiagnosticEvent[] = []
    const measurements = new Map<string, ViewerMeasureResult>()
    const measureCtx: ViewerMeasureContext = {
      data: this._data,
      unit: this._schema.unit,
      reportDiagnostic: diagnostic => diagnostics.push({
        category: 'datasource',
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        nodeId: diagnostic.nodeId,
        scope: 'datasource',
        cause: diagnostic.cause,
      }),
    }

    for (const node of this._schema.elements) {
      const resolvedProps = resolvedPropsMap.get(node.id) ?? node.props
      const nodeForMeasure = resolvedProps === node.props ? node : { ...node, props: resolvedProps }
      let result
      try {
        result = this._materialRegistry.measure(nodeForMeasure, measureCtx)
      }
      catch (err) {
        diagnostics.push({
          category: 'viewer',
          severity: 'warning',
          code: 'MATERIAL_MEASURE_ERROR',
          message: `Material measure failed for ${node.id}: ${err instanceof Error ? err.message : String(err)}`,
          nodeId: node.id,
          scope: 'material',
          cause: serializeCause(err),
        })
        continue
      }
      if (result) {
        measurements.set(node.id, result)
      }
    }

    return { measurements, diagnostics }
  }

  private async loadFonts(diagnostics: ViewerDiagnosticEvent[]): Promise<void> {
    if (!this._schema || !this._fontManager.provider)
      return

    const families = collectFontFamilies(this._schema)
    if (families.size === 0)
      return

    if (!this._host)
      return

    try {
      const fontDiags = await loadAndInjectFonts(families, this._fontManager, this._host.document)
      diagnostics.push(...fontDiags)
    }
    catch (err) {
      diagnostics.push({
        category: 'viewer',
        severity: 'warning',
        code: 'FONT_LOAD_ERROR',
        message: `Font loading failed: ${err instanceof Error ? err.message : String(err)}`,
        scope: 'font',
        cause: serializeCause(err),
      })
    }
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
        for (const binding of projected) {
          for (const diagnostic of binding.diagnostics ?? []) {
            diagnostics.push({
              category: 'datasource',
              severity: diagnostic.severity,
              code: diagnostic.code,
              message: diagnostic.message,
              nodeId: node.id,
              scope: 'datasource',
              cause: diagnostic.cause,
            })
          }
        }
        const resolvedProps = applyBindingsToProps(node.props, projected, node.type)
        resolvedMap.set(node.id, resolvedProps)
      }
      catch (err) {
        const cause = err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : err
        diagnostics.push({
          category: 'datasource',
          severity: 'warning',
          code: 'BINDING_RESOLVE_ERROR',
          message: `Binding resolution failed for ${node.id}: ${err instanceof Error ? err.message : String(err)}`,
          nodeId: node.id,
          scope: 'datasource',
          cause,
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

  private resolveZoom(): number {
    if (!this._schema)
      return 1

    const scale = this._schema.page.scale
    if (scale == null || scale === 'auto')
      return 1

    if (typeof scale === 'number')
      return scale

    const container = this._host?.mount
    if (!container)
      return 1

    const pxFactor = 96 / (UNIT_FACTOR[this._schema.unit] ?? 25.4)
    const pageWidthPx = this._schema.page.width * pxFactor
    const pageHeightPx = this._schema.page.height * pxFactor

    if (scale === 'fit-width' && pageWidthPx > 0) {
      return container.clientWidth / pageWidthPx
    }

    if (scale === 'fit-height' && pageHeightPx > 0) {
      return container.clientHeight / pageHeightPx
    }

    return 1
  }

  private applyViewportOffset(container: HTMLElement): void {
    if (!this._schema)
      return

    const ox = this._schema.page.offsetX ?? 0
    const oy = this._schema.page.offsetY ?? 0

    if (ox === 0 && oy === 0) {
      container.style.paddingLeft = ''
      container.style.paddingTop = ''
      return
    }

    const unit = this._schema.unit
    container.style.paddingLeft = `${ox}${unit}`
    container.style.paddingTop = `${oy}${unit}`
  }

  private emitDiagnostic(event: ViewerDiagnosticEvent): void {
    this._diagnosticHandler?.(event)
    this._hooks.diagnosticsEmitted.call(event).catch(() => {
      this.emitDiagnosticHookError()
    })
  }

  private emitTaskDiagnostic(
    event: ViewerDiagnosticEvent,
    onDiagnostic?: (event: ViewerDiagnosticEvent) => void,
  ): void {
    onDiagnostic?.(event)
    this.emitDiagnostic(event)
  }

  private callSchemaNormalizeHook(schema: DocumentSchema): DocumentSchema {
    try {
      return this._hooks.beforeSchemaNormalize.call(schema)
    }
    catch (err) {
      this.emitDiagnostic({
        category: 'viewer',
        severity: 'error',
        code: 'SCHEMA_NORMALIZE_HOOK_ERROR',
        message: `Schema normalize hook failed: ${err instanceof Error ? err.message : String(err)}`,
        scope: 'hook',
        cause: serializeCause(err),
      })
      throw err
    }
  }

  private emitExportError(
    exporterId: string,
    format: string | undefined,
    err: unknown,
    onDiagnostic?: (event: ViewerDiagnosticEvent) => void,
  ): void {
    this.emitTaskDiagnostic({
      category: 'exporter',
      severity: 'error',
      code: 'EXPORTER_ERROR',
      message: `Exporter "${exporterId}" failed for format "${format || 'default'}": ${err instanceof Error ? err.message : String(err)}`,
      scope: 'exporter',
      cause: serializeCause(err),
    }, onDiagnostic)
  }

  private emitDiagnosticHookError(): void {
    if (this._emittingHookFailure)
      return
    this._emittingHookFailure = true
    try {
      this._diagnosticHandler?.({
        category: 'viewer',
        severity: 'warning',
        code: 'DIAGNOSTIC_HOOK_ERROR',
        message: 'diagnosticsEmitted hook failed',
        scope: 'hook',
      })
    }
    finally {
      this._emittingHookFailure = false
    }
  }
}

function getGlobalWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window
}

function toPagePlan(result: PaginationResult): PagePlan {
  return {
    mode: result.mode,
    pages: result.pages.map(page => ({
      index: page.index,
      width: page.width,
      height: page.height,
      elements: page.fragments.map(fragment => fragment.node),
      copyIndex: page.pageContext.copyIndex,
      yOffset: page.yOffset,
    })),
    diagnostics: result.diagnostics.map(diagnostic => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
    })),
  }
}

function resolveRepeatedElementLocalY(node: MaterialNode, pageHeight: number): number {
  if (pageHeight <= 0)
    return node.y
  const localY = node.y % pageHeight
  return localY < 0 ? localY + pageHeight : localY
}

function serializeCause(err: unknown): unknown {
  if (err instanceof Error)
    return { name: err.name, message: err.message, stack: err.stack }
  return err
}
