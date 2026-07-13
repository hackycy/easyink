import type { InternalHooks, MaterialLayoutPlan, MaterialLoadDiagnostic, MaterialNodeLoadState, PagePlan, PaginationResult, ViewerMeasureResult } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type {
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
import { snapshotViewerTreePolicy } from '@easyink/browser-dom'
import { createInternalHooks, createLayoutConstraintKey, createNonFragmentingMaterialPlans, FontManager, freezeMaterialLayoutPlan, loadDocumentWithProfile, planRepeatedOverlays, runLayoutPipeline, runPagination, VIEWER_TREE_ABSOLUTE_MAX_NODES, walkMaterialNodes } from '@easyink/core'
import { deepClone, UNIT_FACTOR } from '@easyink/shared'
import { applyBindingsToProps, projectBindings, walkProfileMaterialNodes } from './binding-projector'
import { resolveConditionalSchema } from './conditional-schema'
import { collectFontFamilies, loadAndInjectFonts } from './font-loader'
import { ProfileMaterialRuntime } from './material-runtime'
import { PageDomVirtualizer } from './page-dom-virtualizer'
import { resolvePrintPolicy } from './print-policy'
import { runPrintWithIsolation } from './print-service'
import { renderPages } from './render-surface'
import { safeSummarizeThrown } from './safe-thrown'
import { createThumbnails } from './thumbnail-pipeline'
import { createBrowserViewerHost, createIframeViewerHost } from './viewer-host'

export class ViewerRuntime {
  private _options: ViewerOptions
  private _schema?: DocumentSchema
  private _data: Record<string, unknown> = {}
  private _diagnosticHandler?: (event: ViewerDiagnosticEvent) => void
  private _exporters: ViewerExporter[] = []
  private _printDrivers: PrintDriver[] = []
  private _materials: ProfileMaterialRuntime
  private _nodeStates: ReadonlyMap<string, MaterialNodeLoadState> = new Map()
  private _loadDiagnostics: ViewerDiagnosticEvent[] = []
  private _fontManager: FontManager
  private _hooks: InternalHooks
  private _host?: ViewerHost
  private _renderedPageMetrics: ViewerPageMetrics[] = []
  private _destroyed = false
  private _emittingHookFailure = false
  private _pageVirtualizer?: PageDomVirtualizer
  private _operation = 0

  constructor(options: ViewerOptions) {
    if (!options?.profile)
      throw new Error('VIEWER_PROFILE_REQUIRED')
    this._options = options
    const maxNodes = options.browserDom?.maxNodes ?? VIEWER_TREE_ABSOLUTE_MAX_NODES
    if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
      throw new Error('VIEWER_MAX_NODES_INVALID')
    const browserDom = Object.freeze({
      maxNodes,
      imperativeDom: Object.freeze([...(options.browserDom?.imperativeDom ?? [])]),
      ...(options.browserDom?.policy ? { policy: snapshotViewerTreePolicy(options.browserDom.policy) } : {}),
    })
    this._options = Object.freeze({ ...options, browserDom })
    this._materials = new ProfileMaterialRuntime(options.profile)
    this._host = options.host
      ?? (options.iframe
        ? createIframeViewerHost(options.iframe)
        : options.container
          ? createBrowserViewerHost(options.container)
          : undefined)
    this._fontManager = new FontManager(options.fontProvider)
    this._hooks = createInternalHooks()
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async open(input: ViewerOpenInput): Promise<void> {
    this.ensureNotDestroyed()
    const operation = ++this._operation
    this._diagnosticHandler = input.onDiagnostic

    const loaded = loadDocumentWithProfile(input.schema, this._options.profile)
    const types = collectMaterialTypes(loaded.schema, this._options.profile)
    const facetDiagnostics = await this._materials.prepare(types)
    if (operation !== this._operation || this._destroyed)
      return
    const diagnostics = [
      ...this._options.profile.diagnostics.map(profileDiagnosticToViewer),
      ...loaded.diagnostics.map(loadDiagnosticToViewer),
      ...facetDiagnostics.map(facetDiagnosticToViewer),
    ]
    this._schema = loaded.schema
    this._nodeStates = loaded.nodeStates
    this._loadDiagnostics = diagnostics
    this._data = input.data ?? {}
    diagnostics.forEach(diagnostic => this.emitDiagnostic(diagnostic))

    // 3. Render (font loading + binding + page plan + DOM)
    if (this._host) {
      await this.render(operation)
    }
  }

  async updateData(data: Record<string, unknown>): Promise<void> {
    this.ensureNotDestroyed()
    this._data = data
    if (this._host && this._schema) {
      await this.render()
    }
  }

  async render(expectedOperation?: number): Promise<ViewerRenderResult> {
    this.ensureNotDestroyed()
    if (!this._schema) {
      throw new Error('No schema loaded. Call open() first.')
    }

    const operation = expectedOperation ?? ++this._operation
    const diagnostics: ViewerDiagnosticEvent[] = [...this._loadDiagnostics]
    const conditional = resolveConditionalSchema(this._schema, this._data, this._options.profile)
    const runtimeSchema = conditional.schema
    diagnostics.push(...conditional.diagnostics)

    // Stage 1: Font loading
    await this.loadFonts(diagnostics, runtimeSchema)
    if (operation !== this._operation || this._destroyed)
      return emptyRenderResult(diagnostics)

    // Stage 2: Binding projection
    const resolvedPropsMap = this.resolveAllBindings(diagnostics, runtimeSchema)

    // Stage 3: Hook - beforePagePlan
    try {
      this._hooks.beforePagePlan.call({ schema: runtimeSchema, mode: runtimeSchema.page.mode })
    }
    catch (err) {
      const thrown = safeSummarizeThrown(err)
      const diagnostic: ViewerDiagnosticEvent = {
        category: 'viewer',
        severity: 'error',
        code: 'BEFORE_PAGE_PLAN_HOOK_ERROR',
        message: `beforePagePlan hook failed: ${thrown.message}`,
        scope: 'hook',
        cause: thrown.cause,
      }
      diagnostics.push(diagnostic)
      this.emitDiagnostic(diagnostic)
      throw err
    }

    // Stage 3.5: Measure elements that need expansion (e.g., table-data)
    const { measurements, diagnostics: layoutDiagnostics } = this.measureRuntimeElements(resolvedPropsMap, runtimeSchema)
    diagnostics.push(...layoutDiagnostics)

    // Stage 4: Orthogonal layout + pagination planning. Page-repeated
    // elements are overlays resolved after pagination, so they must not
    // contribute to flow, document height, or page count.
    const repeatedElements = this.collectRepeatedPageElements(runtimeSchema.elements)
    const paintableRepeatedIds = new Set(repeatedElements
      .filter(node => !node.editorState?.hidden && node.output.visibility === 'include')
      .map(node => node.id))
    const layoutSchema = repeatedElements.length > 0
      ? { ...runtimeSchema, elements: runtimeSchema.elements.filter(el => !repeatedElements.includes(el)) }
      : runtimeSchema
    const originalRepeatedIds = new Set(this.collectRepeatedPageElements(this._schema.elements).map(el => el.id))
    const layoutOriginalSchema = originalRepeatedIds.size > 0
      ? { ...this._schema, elements: this._schema.elements.filter(el => !originalRepeatedIds.has(el.id)) }
      : this._schema
    const layoutDocument = runLayoutPipeline(layoutSchema, {
      originalSchema: layoutOriginalSchema,
      plans: this.createLayoutPlans(layoutSchema, measurements),
    })
    const pagination = runPagination(layoutSchema, layoutDocument, {
      originalSchema: layoutSchema,
      resolveFragmentAdapter: fragment => this.isNodeReady(fragment.node) ? this._materials.getFragmentAdapter(fragment.node.type) : undefined,
      retainBlankPage: paintableRepeatedIds.size > 0 ? () => true : undefined,
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
    this.resolveRepeatedPageElements(plan, resolvedPropsMap, repeatedElements, paintableRepeatedIds)

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
      unit: runtimeSchema.unit,
    }))

    if (this._host) {
      this.disposePageMounts(diagnostics)
      const pageVirtualizer = new PageDomVirtualizer()
      let pageDOMs: ReturnType<typeof renderPages>
      try {
        pageDOMs = renderPages(
          plan.pages,
          this._materials,
          {
            container: this._host.mount,
            document: this._host.document,
            zoom: this.resolveZoom(),
            unit: runtimeSchema.unit,
            data: this._data,
            resolvedPropsMap,
            pageSchema: runtimeSchema.page,
            nodeStates: this._nodeStates,
            browserDom: this._options.browserDom as Required<NonNullable<ViewerOptions['browserDom']>>,
          },
          diagnostics,
          pageVirtualizer,
        )
      }
      catch (error) {
        try {
          pageVirtualizer.dispose()
        }
        catch (cleanupError) {
          appendDisposeDiagnostics(diagnostics, cleanupError)
        }
        this._host.mount.replaceChildren()
        throw error
      }
      this._pageVirtualizer = pageVirtualizer

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
    for (const d of diagnostics.slice(this._loadDiagnostics.length)) {
      this.emitDiagnostic(d)
    }

    return { pages, thumbnails: createThumbnails(pages, runtimeSchema.unit), diagnostics }
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
        await this.withMaterializedPages('print', async () => {
          options.onPhase?.({ phase: 'preparing', message: customDriver.id })
          await customDriver.print({
            schema: this._schema!,
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
        })
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
          this.withMaterializedPages('print', () => runPrintWithIsolation(this._host!, printPolicy))
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
    const thrown = safeSummarizeThrown(err)
    this.emitTaskDiagnostic({
      category: 'print',
      severity: 'error',
      code: code ?? thrown.code ?? 'PRINT_ERROR',
      message: `Print failed: ${thrown.message}`,
      scope: 'print',
      cause: thrown.cause,
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
      const thrown = safeSummarizeThrown(err)
      this.emitTaskDiagnostic({
        category: 'exporter',
        severity: 'error',
        code: 'NO_EXPORTER',
        message: err.message,
        scope: 'exporter',
        cause: thrown.cause,
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
      return await this.withMaterializedPages('export', async () => {
        if (exporter.prepare) {
          options.onPhase?.({ phase: 'preparing', message: exporter.id })
          await exporter.prepare(context)
        }

        options.onPhase?.({ phase: 'exporting', message: exporter.id })
        const result = await exporter.export(context)
        options.onPhase?.({ phase: 'completed', message: exporter.id })
        return result
      })
    }
    catch (err) {
      this.emitExportError(exporter.id, format, err, options.onDiagnostic)
      if (options.throwOnError)
        throw err
      return undefined
    }
  }

  async destroy(): Promise<void> {
    if (this._destroyed)
      return
    this._destroyed = true
    ++this._operation
    const diagnostics: ViewerDiagnosticEvent[] = []
    this.disposePageMounts(diagnostics)
    const materialDisposal = this._materials.dispose()
    this._schema = undefined
    this._data = {}
    this._exporters = []
    this._printDrivers = []
    this._renderedPageMetrics = []
    this._fontManager.clear()
    this._host?.clear()
    const facetDiagnostics = await materialDisposal
    diagnostics.push(...facetDiagnostics.map(facetDiagnosticToViewer))
    diagnostics.forEach(diagnostic => this.emitDiagnostic(diagnostic))
  }

  // ---------------------------------------------------------------------------
  // Registration API
  // ---------------------------------------------------------------------------

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

  get materials(): ProfileMaterialRuntime {
    return this._materials
  }

  // ---------------------------------------------------------------------------
  // Internal pipeline stages
  // ---------------------------------------------------------------------------

  private collectRepeatedPageElements(elements: MaterialNode[]): MaterialNode[] {
    return elements.filter(node =>
      this._options.profile.getManifest(node.type)?.common.layout.pageRepeat === 'every-output-page',
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
    paintableNodeIds: ReadonlySet<string>,
  ): void {
    if (repeatedElements.length === 0)
      return

    const totalPages = plan.pages.length
    const byId = new Map(repeatedElements.map(node => [node.id, node]))
    const placements = planRepeatedOverlays({
      nodes: repeatedElements,
      profile: this._options.profile,
      pageCount: totalPages,
      paintableNodeIds,
    })

    for (const placement of placements) {
      const page = plan.pages[placement.pageIndex]
      const el = byId.get(placement.nodeId)
      if (!page || !el)
        continue
      const virtualId = `${el.id}__p${page.index}`
      const virtualNode = {
        ...deepClone(el),
        id: virtualId,
        sourceNodeId: el.id,
        sourceAdmissionStatus: this._nodeStates.get(el.id)?.status ?? 'missing',
        y: page.yOffset + resolveRepeatedElementLocalY(el, page.height),
      }
      page.elements.push(virtualNode)

      const baseProps = resolvedPropsMap.get(el.id) ?? el.model
      resolvedPropsMap.set(virtualId, {
        ...baseProps,
        __pageNumber: page.index + 1,
        __totalPages: totalPages,
      })
    }
  }

  private measureRuntimeElements(resolvedPropsMap: Map<string, Record<string, unknown>>, schema: DocumentSchema): { measurements: Map<string, ViewerMeasureResult>, diagnostics: ViewerDiagnosticEvent[] } {
    const diagnostics: ViewerDiagnosticEvent[] = []
    const measurements = new Map<string, ViewerMeasureResult>()
    const measureCtx: ViewerMeasureContext = {
      data: this._data,
      unit: schema.unit,
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

    for (const node of schema.elements) {
      const resolvedProps = resolvedPropsMap.get(node.id) ?? node.model as Record<string, unknown>
      const nodeForMeasure = resolvedProps === node.model ? node : { ...node, model: resolvedProps }
      let result
      try {
        result = this.isNodeReady(node) ? this._materials.measure(nodeForMeasure, measureCtx) : null
      }
      catch (err) {
        const thrown = safeSummarizeThrown(err)
        diagnostics.push({
          category: 'viewer',
          severity: 'warning',
          code: 'MATERIAL_MEASURE_ERROR',
          message: `Material measure failed for ${node.id}: ${thrown.message}`,
          nodeId: node.id,
          scope: 'material',
          cause: thrown.cause,
        })
        continue
      }
      if (result) {
        measurements.set(node.id, result)
      }
    }

    return { measurements, diagnostics }
  }

  private createLayoutPlans(
    schema: DocumentSchema,
    measurements: ReadonlyMap<string, ViewerMeasureResult>,
  ): ReadonlyMap<string, MaterialLayoutPlan> {
    const constraints = {
      availableWidth: schema.page.width,
      availableHeight: schema.page.height,
      unit: schema.unit,
      writingMode: 'horizontal-tb' as const,
    }
    const constraintKey = createLayoutConstraintKey(constraints)
    return new Map(schema.elements.map((node) => {
      const measured = measurements.get(node.id)
      const borderBox = {
        x: node.x,
        y: node.y,
        width: measured?.width ?? node.width,
        height: measured?.height ?? node.height,
      }
      const fallback = createNonFragmentingMaterialPlans({
        instanceKey: node.id,
        nodeId: node.id,
        nodeRevision: 0,
        constraintKey,
        pageIndex: 0,
        borderBox,
        fragmentBox: borderBox,
      }).layoutPlan
      return [node.id, measured?.breakOpportunities || measured?.payload !== undefined
        ? freezeMaterialLayoutPlan({
            ...fallback,
            breakOpportunities: measured.breakOpportunities ?? [],
            ...(measured.payload === undefined ? {} : { payload: measured.payload }),
          })
        : fallback]
    }))
  }

  private async loadFonts(diagnostics: ViewerDiagnosticEvent[], schema: DocumentSchema): Promise<void> {
    if (!this._fontManager.provider)
      return

    const families = collectFontFamilies(schema, this._options.profile)
    if (families.size === 0)
      return

    if (!this._host)
      return

    try {
      const fontDiags = await loadAndInjectFonts(families, this._fontManager, this._host.document)
      diagnostics.push(...fontDiags)
    }
    catch (err) {
      const thrown = safeSummarizeThrown(err)
      diagnostics.push({
        category: 'viewer',
        severity: 'warning',
        code: 'FONT_LOAD_ERROR',
        message: `Font loading failed: ${thrown.message}`,
        scope: 'font',
        cause: thrown.cause,
      })
    }
  }

  private resolveAllBindings(diagnostics: ViewerDiagnosticEvent[], schema: DocumentSchema): Map<string, Record<string, unknown>> {
    const resolvedMap = new Map<string, Record<string, unknown>>()
    walkProfileMaterialNodes(schema, this._options.profile, (node) => {
      if (Object.keys(node.bindings).length === 0) {
        resolvedMap.set(node.id, node.model)
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
        const resolvedProps = applyBindingsToProps(node.model, projected, this._materials.getBinding(node.type))
        resolvedMap.set(node.id, resolvedProps)
      }
      catch (err) {
        const thrown = safeSummarizeThrown(err)
        diagnostics.push({
          category: 'datasource',
          severity: 'warning',
          code: 'BINDING_RESOLVE_ERROR',
          message: `Binding resolution failed for ${node.id}: ${thrown.message}`,
          nodeId: node.id,
          scope: 'datasource',
          cause: thrown.cause,
        })
        resolvedMap.set(node.id, node.model)
      }
    })

    return resolvedMap
  }

  private isNodeReady(node: MaterialNode<unknown>): boolean {
    return this._nodeStates.get(node.id)?.status !== 'quarantined'
      && this._materials.get(node.type)?.state === 'active'
  }

  private disposePageMounts(diagnostics: ViewerDiagnosticEvent[]): void {
    const pageVirtualizer = this._pageVirtualizer
    this._pageVirtualizer = undefined
    if (pageVirtualizer) {
      try {
        pageVirtualizer.dispose()
      }
      catch (error) {
        appendDisposeDiagnostics(diagnostics, error)
      }
    }
  }

  private withMaterializedPages<T>(mode: 'print' | 'export', action: () => T): T {
    const pageVirtualizer = this._pageVirtualizer
    return pageVirtualizer ? pageVirtualizer.withMaterializedPages(mode, action) : action()
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

  private emitExportError(
    exporterId: string,
    format: string | undefined,
    err: unknown,
    onDiagnostic?: (event: ViewerDiagnosticEvent) => void,
  ): void {
    const thrown = safeSummarizeThrown(err)
    this.emitTaskDiagnostic({
      category: 'exporter',
      severity: 'error',
      code: 'EXPORTER_ERROR',
      message: `Exporter "${exporterId}" failed for format "${format || 'default'}": ${thrown.message}`,
      scope: 'exporter',
      cause: thrown.cause,
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
      fragments: page.fragments.flatMap(fragment => fragment.fragmentPlan
        ? [{ node: fragment.node as MaterialNode<unknown>, layoutPlan: fragment.plan, fragmentPlan: fragment.fragmentPlan }]
        : []),
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

function collectMaterialTypes(schema: DocumentSchema, profile: ViewerOptions['profile']): string[] {
  const types: string[] = []
  walkMaterialNodes(schema, profile, node => types.push(node.type))
  return types
}

function disposeDiagnostic(error: unknown): ViewerDiagnosticEvent {
  const thrown = safeSummarizeThrown(error)
  return {
    category: 'viewer',
    severity: 'warning',
    code: 'MATERIAL_DISPOSE_ERROR',
    message: thrown.message,
    scope: 'material',
    cause: thrown.cause,
  }
}

function appendDisposeDiagnostics(diagnostics: ViewerDiagnosticEvent[], error: unknown): void {
  if (error instanceof AggregateError) {
    for (const nested of error.errors)
      appendDisposeDiagnostics(diagnostics, nested)
    return
  }
  diagnostics.push(disposeDiagnostic(error))
}

function loadDiagnosticToViewer(diagnostic: MaterialLoadDiagnostic): ViewerDiagnosticEvent {
  return {
    category: 'schema',
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    nodeId: diagnostic.nodeId,
    detail: { path: diagnostic.path, stage: diagnostic.stage, materialType: diagnostic.materialType },
    scope: 'schema',
    cause: diagnostic.cause,
  }
}

function profileDiagnosticToViewer(diagnostic: ViewerOptions['profile']['diagnostics'][number]): ViewerDiagnosticEvent {
  return {
    category: 'viewer',
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    detail: { packageId: diagnostic.packageId, materialType: diagnostic.materialType },
    scope: 'material',
  }
}

function facetDiagnosticToViewer(diagnostic: Awaited<ReturnType<ProfileMaterialRuntime['prepare']>>[number]): ViewerDiagnosticEvent {
  return {
    category: 'viewer',
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    detail: { profileId: diagnostic.profileId, materialType: diagnostic.materialType, surface: diagnostic.surface },
    scope: 'material',
    cause: diagnostic.cause,
  }
}

function emptyRenderResult(diagnostics: ViewerDiagnosticEvent[]): ViewerRenderResult {
  return { pages: [], thumbnails: [], diagnostics }
}
