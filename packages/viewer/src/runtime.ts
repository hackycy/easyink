import type { InternalHooks, MaterialLayoutPlan, MaterialLoadDiagnostic, MaterialNodeLoadState, MaterialTextMeasureInput, PagePlan, PaginationResult, ViewerMeasureResult } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { CommittedPagePlan } from './layout-runtime'
import type { RenderTaskToken } from './render-task'
import type {
  PrintDriver,
  ViewerDataUpdateOptions,
  ViewerDiagnosticEvent,
  ViewerExporter,
  ViewerExportOptions,
  ViewerMeasureContext,
  ViewerOpenInput,
  ViewerOptions,
  ViewerPageMetrics,
  ViewerPerformanceBudget,
  ViewerPrintOptions,
  ViewerPrintPolicy,
  ViewerRenderResult,
  ViewerRevisionSnapshot,
} from './types'
import type { ViewerHost } from './viewer-host'
import { snapshotViewerTreePolicy } from '@easyink/browser-dom'
import { createInternalHooks, createLayoutConstraintKey, createNonFragmentingMaterialPlans, FontManager, freezeMaterialFragmentPlan, freezeMaterialLayoutPlan, loadDocumentWithProfile, MeasureService, planRepeatedOverlays, runLayoutPipeline, runPagination, VIEWER_TREE_ABSOLUTE_MAX_NODES, walkMaterialNodes } from '@easyink/core'
import { cloneJsonValue, deepClone, deepFreezeJsonValue, UNIT_FACTOR } from '@easyink/shared'
import { applyBindingsToProps, projectBindings, walkProfileMaterialNodes } from './binding-projector'
import { resolveConditionalSchema } from './conditional-schema'
import { collectFontFamilies, loadAndInjectFonts } from './font-loader'
import { createDefaultLayoutRuntime } from './layout-runtime'
import { ProfileMaterialRuntime } from './material-runtime'
import { createBoundedMeasureScheduler } from './measure-scheduler'
import { PageDomVirtualizer } from './page-dom-virtualizer'
import { resolvePrintPolicy } from './print-policy'
import { runPrintWithIsolation } from './print-service'
import { createReadonlyMap } from './readonly-map'
import { mountCommittedMaterial, renderPages, RenderSurface } from './render-surface'
import { RenderTaskCoordinator } from './render-task'
import { createRuntimeModelResolutionCache } from './runtime-model-resolver'
import { safeSummarizeThrown } from './safe-thrown'
import { createThumbnails } from './thumbnail-pipeline'
import { createBrowserViewerHost, createIframeViewerHost } from './viewer-host'

const VIEWER_PERFORMANCE_BUDGET_CEILINGS: Readonly<ViewerPerformanceBudget> = Object.freeze({
  measureCacheEntries: 512,
  maxMeasureInFlight: 8,
  pageDomOverscan: 1,
  maxInlineDataNodes: 100_000,
  maxInlineDataStringBytes: 4 * 1024 * 1024,
  maxRuntimeRows: 100_000,
  maxLayoutFactsPerMaterial: 500_000,
  maxRenderTreeNodesPerMaterial: VIEWER_TREE_ABSOLUTE_MAX_NODES,
})

interface ViewerInputState {
  readonly document?: DocumentSchema
  readonly nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  readonly data: Readonly<Record<string, unknown>>
  readonly documentRevision: number
  readonly dataRevision: number
  readonly diagnostics: readonly ViewerDiagnosticEvent[]
  readonly onDiagnostic?: (event: ViewerDiagnosticEvent) => void
}

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
  private readonly _performanceBudget: Readonly<ViewerPerformanceBudget>
  private readonly _tasks = new RenderTaskCoordinator()
  private readonly _layoutRuntime: ReturnType<typeof createDefaultLayoutRuntime>
  private readonly _renderSurface?: RenderSurface
  private _requested: ViewerInputState = initialViewerInputState()
  private _committed: ViewerInputState = initialViewerInputState()
  private _lastRenderResult: ViewerRenderResult = emptyRenderResult([])
  private readonly _preparedResourceKeys = new Set<string>()
  private _requestedDocumentRevision = 0
  private _requestedDataRevision = 0
  private _committedDocumentRevision = 0
  private _committedDataRevision = 0
  private _committedResourceRevision = 0

  constructor(options: ViewerOptions) {
    if (!options?.profile)
      throw new Error('MATERIAL_PROFILE_REQUIRED')
    this._performanceBudget = resolvePerformanceBudget(options.performanceBudget)
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
    this._renderSurface = this._host
      ? new RenderSurface(this._host.mount, { onDiagnostic: diagnostic => this.emitDiagnostic(diagnostic) })
      : undefined
    this._layoutRuntime = createDefaultLayoutRuntime({
      profile: options.profile,
      materials: this._materials,
      measureService: new MeasureService({ maxEntries: this._performanceBudget.measureCacheEntries }),
      runtimeModelCache: createRuntimeModelResolutionCache(options.profile, this._performanceBudget.measureCacheEntries),
      scheduler: createBoundedMeasureScheduler(this._performanceBudget.maxMeasureInFlight),
      textMeasure: input => Promise.resolve(measureTextDeterministically(input)),
      budget: {
        maxDataNodes: this._performanceBudget.maxInlineDataNodes,
        maxDataStringBytes: this._performanceBudget.maxInlineDataStringBytes,
        maxRuntimeRows: this._performanceBudget.maxRuntimeRows,
        maxLayoutFacts: this._performanceBudget.maxLayoutFactsPerMaterial,
        maxKeyTokens: this._performanceBudget.maxRuntimeRows,
        maxKeyBytes: this._performanceBudget.maxInlineDataStringBytes,
      },
      preparedCollections: options.preparedCollections,
      reportDiagnostic: diagnostic => this.emitRuntimeDiagnostic(diagnostic),
      prepareResources: (input, signal) => this.prepareLayoutResources(input.document, signal),
    })
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async open(input: ViewerOpenInput): Promise<void> {
    this.ensureNotDestroyed()
    const data = snapshotInlineData(input.data ?? {}, this._performanceBudget)
    const loaded = loadDocumentWithProfile(input.schema, this._options.profile)
    const documentRevision = this.requireNextRevision(
      input.documentRevision,
      this._requested.documentRevision,
      'DOCUMENT_REVISION_NOT_MONOTONIC',
    )
    const dataRevision = this.requireNextRevision(
      input.dataRevision,
      this._requested.dataRevision,
      'DATA_REVISION_NOT_MONOTONIC',
    )
    const diagnostics = Object.freeze([
      ...this._options.profile.diagnostics.map(profileDiagnosticToViewer),
      ...loaded.diagnostics.map(loadDiagnosticToViewer),
    ])
    const candidate: ViewerInputState = Object.freeze({
      document: loaded.schema,
      nodeStates: snapshotNodeStates(loaded.nodeStates),
      data,
      documentRevision,
      dataRevision,
      diagnostics,
      ...(input.onDiagnostic ? { onDiagnostic: input.onDiagnostic } : {}),
    })
    this._diagnosticHandler = input.onDiagnostic
    this._requested = candidate
    this._requestedDocumentRevision = documentRevision
    this._requestedDataRevision = dataRevision
    const task = this._tasks.begin()
    await this.prepareAndPlan(candidate, task)
  }

  async updateData(data: Record<string, unknown>, options: ViewerDataUpdateOptions = {}): Promise<void> {
    this.ensureNotDestroyed()
    if (!this._requested.document)
      throw new Error('No schema loaded. Call open() first.')
    const snapshot = snapshotInlineData(data, this._performanceBudget)
    const dataRevision = this.requireNextRevision(
      options.dataRevision,
      this._requested.dataRevision,
      'DATA_REVISION_NOT_MONOTONIC',
    )
    const candidate: ViewerInputState = Object.freeze({
      ...this._requested,
      data: snapshot,
      dataRevision,
    })
    this._requested = candidate
    this._requestedDataRevision = dataRevision
    await this.prepareAndPlan(candidate, this._tasks.begin())
  }

  async render(): Promise<ViewerRenderResult> {
    this.ensureNotDestroyed()
    if (!this._requested.document)
      throw new Error('No schema loaded. Call open() first.')
    await this.prepareAndPlan(this._requested, this._tasks.begin())
    return this._lastRenderResult
  }

  private async renderLegacy(expectedOperation?: number): Promise<ViewerRenderResult> {
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
    const renderedPageMetrics = pages.map(page => ({
      index: page.index,
      width: page.width,
      height: page.height,
      unit: runtimeSchema.unit,
    }))

    if (this._host) {
      const previousPageVirtualizer = this._pageVirtualizer
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
        throw error
      }
      this._pageVirtualizer = pageVirtualizer
      this._renderedPageMetrics = renderedPageMetrics
      if (previousPageVirtualizer) {
        try {
          previousPageVirtualizer.dispose()
        }
        catch (error) {
          appendDisposeDiagnostics(diagnostics, error)
        }
      }

      for (const dom of pageDOMs) {
        const page = pages.find(p => p.index === dom.pageIndex)
        if (page) {
          page.element = dom.element
        }
      }

      // Apply page-level viewport offset (preview only, not print)
      this.applyViewportOffset(this._host.mount)
    }
    else {
      this._renderedPageMetrics = renderedPageMetrics
    }

    // Emit all diagnostics
    for (const d of diagnostics.slice(this._loadDiagnostics.length)) {
      this.emitDiagnostic(d)
    }

    return { pages, thumbnails: createThumbnails(pages, runtimeSchema.unit), diagnostics }
  }

  private async planAndPaint(candidate: ViewerInputState, task: RenderTaskToken): Promise<void> {
    if (!candidate.document)
      throw new Error('No schema loaded. Call open() first.')
    let committedPlan: CommittedPagePlan
    try {
      committedPlan = await this._layoutRuntime.plan({
        document: candidate.document,
        nodeStates: candidate.nodeStates,
        documentRevision: candidate.documentRevision,
        data: candidate.data,
        dataRevision: candidate.dataRevision,
      }, task.signal)
      committedPlan = commitRepeatedPageInstances(candidate, committedPlan, this._options.profile)
    }
    catch (error) {
      if (!this._tasks.isCurrent(task.generation))
        return
      throw error
    }
    if (!this._tasks.isCurrent(task.generation))
      return

    const diagnostics = [...candidate.diagnostics, ...committedPlan.diagnostics.map(layoutDiagnosticToViewer)]
    let candidateVirtualizer: PageDomVirtualizer | undefined
    if (this._renderSurface) {
      try {
        await this._renderSurface.commitAtomically((root, transaction) => {
          candidateVirtualizer = this.mountCommittedPages(root, committedPlan, candidate, diagnostics, transaction)
          transaction.register(candidateVirtualizer)
        }, task.signal)
      }
      catch (error) {
        if (!this._tasks.isCurrent(task.generation))
          return
        throw error
      }
      if (!this._tasks.isCurrent(task.generation))
        return
    }

    const pages = committedPlan.pages.map(page => ({
      index: page.index,
      width: page.width,
      height: page.height,
      elementCount: page.fragments.length,
      element: this._host?.mount.querySelector(`[data-page-slot-index="${page.index}"]`) as HTMLElement | undefined,
    }))
    this._committed = candidate
    this._schema = candidate.document
    this._data = candidate.data as Record<string, unknown>
    this._nodeStates = candidate.nodeStates
    this._loadDiagnostics = [...candidate.diagnostics]
    this._diagnosticHandler = candidate.onDiagnostic
    this._pageVirtualizer = candidateVirtualizer
    this._renderedPageMetrics = pages.map(page => ({
      index: page.index,
      width: page.width,
      height: page.height,
      unit: candidate.document!.unit,
    }))
    this._committedDocumentRevision = candidate.documentRevision
    this._committedDataRevision = candidate.dataRevision
    this._committedResourceRevision = committedPlan.resourceRevision
    this._lastRenderResult = {
      pages,
      thumbnails: createThumbnails(pages, candidate.document.unit),
      diagnostics,
    }
    if (this._host)
      this.applyViewportOffset(this._host.mount)
    diagnostics.forEach(diagnostic => this.emitDiagnostic(diagnostic))
  }

  private async prepareAndPlan(candidate: ViewerInputState, task: RenderTaskToken): Promise<void> {
    if (!candidate.document)
      throw new Error('No schema loaded. Call open() first.')
    const facetDiagnostics = await this._materials.prepare(
      collectMaterialTypes(candidate.document, this._options.profile),
    )
    if (!this._tasks.isCurrent(task.generation))
      return
    const preparedCandidate: ViewerInputState = facetDiagnostics.length === 0
      ? candidate
      : Object.freeze({
          ...candidate,
          diagnostics: Object.freeze([
            ...candidate.diagnostics,
            ...facetDiagnostics.map(facetDiagnosticToViewer),
          ]),
        })
    if (this._requested === candidate)
      this._requested = preparedCandidate
    await this.planAndPaint(preparedCandidate, task)
  }

  private mountCommittedPages(
    root: HTMLElement,
    committedPlan: CommittedPagePlan,
    candidate: ViewerInputState,
    diagnostics: ViewerDiagnosticEvent[],
    transaction: import('./render-surface').RenderSurfaceTransaction,
  ): PageDomVirtualizer {
    const document = root.ownerDocument
    const zoom = this.resolveCandidateZoom(candidate.document!, this._host?.mount)
    const unit = candidate.document!.unit
    const virtualizer = new PageDomVirtualizer({ overscan: this._performanceBudget.pageDomOverscan })
    transaction.register(virtualizer)
    for (const page of committedPlan.pages) {
      const slot = createCommittedPageSlot(document, page.index, page.width, page.height, unit, zoom)
      virtualizer.register({
        index: page.index,
        widthPx: page.width * getPxFactor(unit) * zoom,
        heightPx: page.height * getPxFactor(unit) * zoom,
        wrapper: slot,
        mount: () => mountCommittedPage({
          slot,
          page,
          committedPlan,
          materials: this._materials,
          document: candidate.document!,
          zoom,
          browserDom: this._options.browserDom,
          viewerMaxNodes: this._performanceBudget.maxRenderTreeNodesPerMaterial,
          diagnostics,
          checkpoint: transaction.checkpoint,
        }),
      })
      root.appendChild(slot)
      transaction.checkpoint()
    }
    return virtualizer
  }

  private async prepareLayoutResources(document: DocumentSchema, signal: AbortSignal): Promise<number> {
    throwIfAborted(signal)
    const families = collectFontFamilies(document, this._options.profile)
    if (this._host && this._fontManager.provider) {
      const diagnostics = await loadAndInjectFonts(families, this._fontManager, this._host.document)
      throwIfAborted(signal)
      diagnostics.forEach(diagnostic => this.emitDiagnostic(diagnostic))
    }
    for (const family of families) {
      const key = `font:${family}`
      if (!this._preparedResourceKeys.has(key))
        this._preparedResourceKeys.add(key)
    }
    return this._preparedResourceKeys.size
  }

  private emitRuntimeDiagnostic(value: unknown): void {
    const detail = snapshotDiagnosticDetail(value)
    this.emitDiagnostic({
      category: 'viewer',
      severity: 'warning',
      code: readDiagnosticCode(detail),
      message: readDiagnosticMessage(detail),
      detail,
      scope: 'material',
    })
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
    this._tasks.dispose()
    ++this._operation
    const diagnostics: ViewerDiagnosticEvent[] = []
    try {
      this._renderSurface?.dispose()
    }
    catch (error) {
      appendDisposeDiagnostics(diagnostics, error)
    }
    this._pageVirtualizer = undefined
    try {
      await this._layoutRuntime.dispose()
    }
    catch (error) {
      appendDisposeDiagnostics(diagnostics, error)
    }
    let facetDiagnostics: Awaited<ReturnType<ProfileMaterialRuntime['dispose']>> = Object.freeze([])
    try {
      facetDiagnostics = await this._materials.dispose()
    }
    catch (error) {
      appendDisposeDiagnostics(diagnostics, error)
    }
    this._schema = undefined
    this._data = {}
    this._requested = initialViewerInputState()
    this._committed = initialViewerInputState()
    this._exporters = []
    this._printDrivers = []
    this._renderedPageMetrics = []
    this._preparedResourceKeys.clear()
    this._fontManager.clear()
    this._host?.clear()
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

  get currentRevisions(): ViewerRevisionSnapshot {
    return Object.freeze({
      documentRevision: this._committedDocumentRevision,
      dataRevision: this._committedDataRevision,
      resourceRevision: this._committedResourceRevision,
    })
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

  private requireNextRevision(explicit: number | undefined, current: number, code: string): number {
    const next = explicit ?? current + 1
    if (!Number.isSafeInteger(next) || next <= current)
      throw new Error(code)
    return next
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

  private resolveCandidateZoom(schema: DocumentSchema, container?: HTMLElement): number {
    const scale = schema.page.scale
    if (scale == null || scale === 'auto')
      return 1
    if (typeof scale === 'number')
      return scale
    if (!container)
      return 1
    const pxFactor = getPxFactor(schema.unit)
    if (scale === 'fit-width' && schema.page.width > 0)
      return container.clientWidth / (schema.page.width * pxFactor)
    if (scale === 'fit-height' && schema.page.height > 0)
      return container.clientHeight / (schema.page.height * pxFactor)
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

function resolvePerformanceBudget(
  configured: ViewerOptions['performanceBudget'],
): Readonly<ViewerPerformanceBudget> {
  const result = {} as ViewerPerformanceBudget
  for (const key of Object.keys(VIEWER_PERFORMANCE_BUDGET_CEILINGS) as Array<keyof ViewerPerformanceBudget>) {
    const value = configured?.[key] ?? VIEWER_PERFORMANCE_BUDGET_CEILINGS[key]
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('VIEWER_PERFORMANCE_BUDGET_INVALID')
    result[key] = Math.min(value, VIEWER_PERFORMANCE_BUDGET_CEILINGS[key])
  }
  return Object.freeze(result)
}

function snapshotInlineData(
  data: Record<string, unknown>,
  budget: Pick<ViewerPerformanceBudget, 'maxInlineDataNodes' | 'maxInlineDataStringBytes'>,
): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new Error('VIEWER_INLINE_DATA_INVALID')
  const copy = cloneJsonValue(data as never, {
    maxNodes: budget.maxInlineDataNodes,
    maxStringBytes: budget.maxInlineDataStringBytes,
  })
  return deepFreezeJsonValue(copy) as Record<string, unknown>
}

function initialViewerInputState(): ViewerInputState {
  return Object.freeze({
    nodeStates: createReadonlyMap(new Map()),
    data: Object.freeze({}),
    documentRevision: 0,
    dataRevision: 0,
    diagnostics: Object.freeze([]),
  })
}

function snapshotNodeStates(
  source: ReadonlyMap<string, MaterialNodeLoadState>,
): ReadonlyMap<string, MaterialNodeLoadState> {
  const states = new Map<string, MaterialNodeLoadState>()
  for (const [nodeId, state] of source) {
    const copy = cloneJsonValue(state as never)
    states.set(nodeId, deepFreezeJsonValue(copy) as MaterialNodeLoadState)
  }
  return createReadonlyMap(states)
}

function measureTextDeterministically(input: MaterialTextMeasureInput): Readonly<{ width: number, height: number }> {
  const fontSize = input.style.fontSize
  const lineHeight = fontSize * input.style.lineHeight
  const unwrappedWidth = [...input.text].length * fontSize * 0.6
  const lines = input.availableWidth <= 0
    ? 1
    : Math.max(1, Math.ceil(unwrappedWidth / input.availableWidth))
  return Object.freeze({
    width: Math.min(input.availableWidth, unwrappedWidth),
    height: lineHeight * lines,
  })
}

function commitRepeatedPageInstances(
  candidate: ViewerInputState,
  plan: CommittedPagePlan,
  profile: ViewerOptions['profile'],
): CommittedPagePlan {
  const document = candidate.document
  if (!document || plan.pages.length === 0)
    return plan
  const repeated = document.elements.filter(node =>
    profile.getManifest(node.type)?.common.layout.pageRepeat === 'every-output-page',
  )
  if (repeated.length === 0)
    return plan

  const repeatedIds = new Set(repeated.map(node => node.id))
  const instances = new Map(plan.runtimeInstances)
  const pages = plan.pages.map((page) => {
    const fragments = page.fragments.filter(fragment => !repeatedIds.has(fragment.node.id))
    for (const sourceNode of repeated) {
      const committedSource = plan.runtimeInstances.get(sourceNode.id)
      const source = committedSource?.node.type === sourceNode.type
        ? committedSource
        : createQuarantinedRepeatedSource(candidate, sourceNode)
      const instanceKey = JSON.stringify(['page-repeat', source.instanceKey, page.index])
      const nodeId = `${source.nodeId}__p${page.index}`
      const localY = resolveRepeatedElementLocalY(source.node as MaterialNode, page.height)
      const y = page.yOffset + localY
      const node = deepFreezeJsonValue(cloneJsonValue({
        ...source.node,
        id: nodeId,
        y,
      } as never)) as unknown as Readonly<MaterialNode>
      const layoutPlan = freezeMaterialLayoutPlan({
        ...source.layoutPlan,
        instanceKey,
        nodeId,
        borderBox: { ...source.layoutPlan.borderBox, y },
        contentBox: { ...source.layoutPlan.contentBox, y },
      })
      const sourceFragment = source.embeddedFragmentPlan
      if (!sourceFragment)
        continue
      const fragmentPlan = freezeMaterialFragmentPlan({
        ...sourceFragment,
        id: JSON.stringify(['page-repeat-fragment', instanceKey, page.index]),
        sourceInstanceKey: instanceKey,
        sourceNodeId: nodeId,
        box: { ...sourceFragment.box, y },
      })
      const resolvedModel = deepFreezeJsonValue(cloneJsonValue({
        ...source.resolvedModel,
        __pageNumber: page.index + 1,
        __totalPages: plan.pages.length,
      } as never)) as Readonly<Record<string, unknown>>
      const instance = Object.freeze({
        ...source,
        instanceKey,
        nodeId,
        node,
        resolvedModel,
        layoutPlan,
        embeddedFragmentPlan: fragmentPlan,
      })
      instances.set(instanceKey, instance)
      fragments.push(Object.freeze({ node, plan: layoutPlan, fragmentPlan }))
    }
    return Object.freeze({ ...page, fragments: Object.freeze(fragments) })
  })
  return Object.freeze({
    ...plan,
    pages: Object.freeze(pages),
    runtimeInstances: createReadonlyMap(instances),
  })
}

function createQuarantinedRepeatedSource(
  candidate: ViewerInputState,
  sourceNode: MaterialNode,
): import('./layout-runtime').RuntimeMaterialInstancePlan {
  const document = candidate.document!
  const facts = createNonFragmentingMaterialPlans({
    instanceKey: sourceNode.id,
    nodeId: sourceNode.id,
    nodeRevision: candidate.documentRevision,
    constraintKey: createLayoutConstraintKey({
      availableWidth: sourceNode.width,
      availableHeight: document.page.height,
      unit: document.unit,
      writingMode: 'horizontal-tb',
    }),
    pageIndex: 0,
    borderBox: { x: sourceNode.x, y: sourceNode.y, width: sourceNode.width, height: sourceNode.height },
    fragmentBox: { x: sourceNode.x, y: sourceNode.y, width: sourceNode.width, height: sourceNode.height },
  })
  const node = deepFreezeJsonValue(cloneJsonValue(sourceNode as never)) as unknown as Readonly<MaterialNode>
  const resolvedModel = deepFreezeJsonValue(cloneJsonValue(sourceNode.model as never)) as Readonly<Record<string, unknown>>
  return Object.freeze({
    instanceKey: sourceNode.id,
    nodeId: sourceNode.id,
    node,
    scopeKey: 'document',
    scopeData: candidate.data,
    status: 'quarantined',
    diagnostic: Object.freeze({ code: 'MATERIAL_NODE_QUARANTINED' }),
    resolvedModel,
    layoutPlan: facts.layoutPlan,
    embeddedFragmentPlan: facts.fragmentPlan,
    slotChildren: Object.freeze({}),
  })
}

function mountCommittedPage(input: {
  readonly slot: HTMLElement
  readonly page: CommittedPagePlan['pages'][number]
  readonly committedPlan: CommittedPagePlan
  readonly materials: ProfileMaterialRuntime
  readonly document: DocumentSchema
  readonly zoom: number
  readonly browserDom?: ViewerOptions['browserDom']
  readonly viewerMaxNodes: number
  readonly diagnostics: ViewerDiagnosticEvent[]
  readonly checkpoint: () => void
}): () => void {
  const pageElement = createCommittedPageElement(input.slot.ownerDocument, input.page, input.document, input.zoom)
  const content = input.slot.ownerDocument.createElement('div')
  content.className = 'ei-viewer-content-layer'
  content.style.position = 'absolute'
  content.style.inset = '0'
  pageElement.appendChild(content)
  const mounts: ReturnType<typeof mountCommittedMaterial>[] = []
  try {
    const fragments = [...input.page.fragments]
      .sort((left, right) => (left.node.zIndex ?? 0) - (right.node.zIndex ?? 0))
    for (const fragment of fragments) {
      if (!fragment.fragmentPlan) {
        input.diagnostics.push({
          category: 'viewer',
          severity: 'error',
          code: 'VIEWER_COMMITTED_FRAGMENT_REQUIRED',
          message: `Committed fragment is missing for node "${fragment.node.id}"`,
          nodeId: fragment.node.id,
          scope: 'material',
        })
        continue
      }
      const instance = input.committedPlan.runtimeInstances.get(fragment.fragmentPlan.sourceInstanceKey)
      const outputState = instance ? input.committedPlan.outputStates.get(instance.nodeId) : undefined
      if (outputState?.shouldPaint === false)
        continue
      const wrapper = createCommittedElementWrapper(
        input.slot.ownerDocument,
        fragment.node,
        fragment.fragmentPlan.box,
        input.page.yOffset,
        input.document.unit,
      )
      const diagnosticCount = input.diagnostics.length
      const mount = mountCommittedMaterial(wrapper, {
        committedPlan: input.committedPlan,
        fragmentPlan: fragment.fragmentPlan,
        materials: input.materials,
        pageIndex: input.page.index,
        unit: input.document.unit,
        zoom: input.zoom,
        viewerMaxNodes: input.viewerMaxNodes,
        browserDom: input.browserDom,
        diagnostics: input.diagnostics,
      })
      if (input.diagnostics.slice(diagnosticCount).some(diagnostic =>
        diagnostic.nodeId === fragment.node.id
        && (diagnostic.code === 'VIEWER_MATERIAL_RENDER_ERROR' || diagnostic.code === 'VIEWER_MATERIAL_MOUNT_ERROR'),
      )) {
        wrapper.setAttribute('data-render-error', 'true')
      }
      mounts.push(mount)
      content.appendChild(wrapper)
      input.checkpoint()
    }
    input.slot.appendChild(pageElement)
    input.checkpoint()
  }
  catch (error) {
    for (let index = mounts.length - 1; index >= 0; index--)
      mounts[index]!.dispose()
    pageElement.remove()
    throw error
  }
  let disposed = false
  return () => {
    if (disposed)
      return
    disposed = true
    const errors: unknown[] = []
    for (let index = mounts.length - 1; index >= 0; index--) {
      try {
        mounts[index]!.dispose()
      }
      catch (error) {
        errors.push(error)
      }
    }
    pageElement.remove()
    if (errors.length > 0)
      throw new AggregateError(errors, 'VIEWER_COMMITTED_PAGE_DISPOSE_FAILED')
  }
}

function createCommittedPageSlot(
  document: Document,
  index: number,
  width: number,
  height: number,
  unit: string,
  zoom: number,
): HTMLElement {
  const slot = document.createElement('div')
  slot.className = 'ei-viewer-page-slot'
  slot.setAttribute('data-page-slot-index', String(index))
  slot.style.position = 'relative'
  slot.style.boxSizing = 'border-box'
  slot.style.width = `${width * getPxFactor(unit) * zoom}px`
  slot.style.height = `${height * getPxFactor(unit) * zoom}px`
  slot.style.margin = '0 auto 16px auto'
  return slot
}

function createCommittedPageElement(
  document: Document,
  page: CommittedPagePlan['pages'][number],
  schema: DocumentSchema,
  zoom: number,
): HTMLElement {
  const element = document.createElement('div')
  element.className = 'ei-viewer-page'
  element.setAttribute('data-page-index', String(page.index))
  element.style.position = 'relative'
  element.style.width = `${page.width}${schema.unit}`
  element.style.height = `${page.height}${schema.unit}`
  element.style.overflow = 'hidden'
  element.style.boxSizing = 'border-box'
  element.style.backgroundColor = schema.page.background?.color ?? 'white'
  if (schema.page.font)
    element.style.fontFamily = schema.page.font
  if (schema.page.radius)
    element.style.borderRadius = schema.page.radius
  if (zoom !== 1) {
    element.style.transform = `scale(${zoom})`
    element.style.transformOrigin = 'top left'
  }
  return element
}

function createCommittedElementWrapper(
  document: Document,
  node: Readonly<MaterialNode<unknown>>,
  box: Readonly<{ x: number, y: number, width: number, height: number }>,
  pageOffset: number,
  unit: string,
): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'ei-viewer-element'
  wrapper.setAttribute('data-element-id', node.id)
  wrapper.setAttribute('data-element-type', node.type)
  wrapper.style.position = 'absolute'
  wrapper.style.left = `${box.x}${unit}`
  wrapper.style.top = `${box.y - pageOffset}${unit}`
  wrapper.style.width = `${box.width}${unit}`
  wrapper.style.height = `${box.height}${unit}`
  wrapper.style.overflow = 'hidden'
  wrapper.style.zIndex = String(node.zIndex ?? 0)
  if (node.rotation) {
    wrapper.style.transform = `rotate(${node.rotation}deg)`
    wrapper.style.transformOrigin = 'center center'
  }
  if (node.alpha !== undefined && node.alpha !== 1)
    wrapper.style.opacity = String(node.alpha)
  return wrapper
}

function getPxFactor(unit: string): number {
  return 96 / (UNIT_FACTOR[unit] ?? 96)
}

function layoutDiagnosticToViewer(value: unknown): ViewerDiagnosticEvent {
  const detail = snapshotDiagnosticDetail(value)
  return {
    category: 'viewer',
    severity: readDiagnosticSeverity(detail),
    code: readDiagnosticCode(detail),
    message: readDiagnosticMessage(detail),
    detail,
    scope: 'material',
  }
}

function snapshotDiagnosticDetail(value: unknown): unknown {
  try {
    return deepFreezeJsonValue(cloneJsonValue(value as never))
  }
  catch {
    return Object.freeze({ message: safeSummarizeThrown(value).message })
  }
}

function readDiagnosticCode(value: unknown): string {
  return typeof value === 'object' && value !== null && typeof (value as { code?: unknown }).code === 'string'
    ? (value as { code: string }).code
    : 'VIEWER_RUNTIME_DIAGNOSTIC'
}

function readDiagnosticMessage(value: unknown): string {
  return typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string'
    ? (value as { message: string }).message
    : readDiagnosticCode(value)
}

function readDiagnosticSeverity(value: unknown): ViewerDiagnosticEvent['severity'] {
  const severity = typeof value === 'object' && value !== null
    ? (value as { severity?: unknown }).severity
    : undefined
  return severity === 'error' || severity === 'warning' || severity === 'info' ? severity : 'warning'
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
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
