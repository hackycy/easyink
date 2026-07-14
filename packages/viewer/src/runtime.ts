import type { CompiledMaterialProfile, InternalHooks, MaterialLoadDiagnostic, MaterialNodeLoadState, PageLayerRenderPlan, TextWatermarkPageLayerPlan } from '@easyink/core'
import type { DocumentSchema, MaterialNode, PageBackground } from '@easyink/schema'
import type { CommittedPageSlotRegistry } from './committed-page-slots'
import type { CommittedPagePlan } from './layout-runtime'
import type { ReaderLease } from './reader-lease'
import type { RenderTaskToken } from './render-task'
import type { ResolvedRuntimeModel } from './runtime-model-resolver'
import type {
  PrintDriver,
  ViewerDataUpdateOptions,
  ViewerDiagnosticEvent,
  ViewerExporter,
  ViewerExportOptions,
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
import { BrowserTextMeasureService, snapshotViewerTreePolicy } from '@easyink/browser-dom'
import { createInternalHooks, FontManager, groupPageLayerPlansByPlacement, loadDocumentWithProfile, MeasureService, PAGE_CONTENT_LAYER_STACK_INDEX, resolvePageLayerPlans, resolvePageLayerStackIndex, VIEWER_TREE_ABSOLUTE_MAX_NODES, walkMaterialNodes } from '@easyink/core'
import { cloneJsonValue, deepFreezeJsonValue, UNIT_FACTOR } from '@easyink/shared'
import { createCommittedPageSlotRegistry } from './committed-page-slots'
import { toViewerCssUnit } from './css-unit'
import { resolveEffectiveOutputStates } from './effective-output-state'
import { createFontPreparationAdapter } from './font-loader'
import { assertViewerPerformanceBudget, createDefaultLayoutRuntime, DEFAULT_VIEWER_PERFORMANCE_BUDGET } from './layout-runtime'
import { ProfileMaterialRuntime } from './material-runtime'
import { createBoundedMeasureScheduler } from './measure-scheduler'
import { PageDomVirtualizer } from './page-dom-virtualizer'
import { resolvePrintPolicy } from './print-policy'
import { runPrintWithIsolation } from './print-service'
import { createReaderLeaseCoordinator } from './reader-lease'
import { createReadonlyMap } from './readonly-map'
import { mountCommittedMaterial, RenderSurface } from './render-surface'
import { RenderTaskCoordinator } from './render-task'
import { createResourceReadinessCoordinator } from './resource-readiness'
import { createRuntimeModelResolutionCache } from './runtime-model-resolver'
import { safeSummarizeThrown } from './safe-thrown'
import { createThumbnails } from './thumbnail-pipeline'
import { createBrowserViewerHost, createIframeViewerHost } from './viewer-host'

interface ViewerInputState {
  readonly document?: DocumentSchema
  readonly nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  readonly data: Readonly<Record<string, unknown>>
  readonly documentRevision: number
  readonly dataRevision: number
  readonly diagnostics: readonly ViewerDiagnosticEvent[]
  readonly onDiagnostic?: (event: ViewerDiagnosticEvent) => void
}

interface CommittedViewerBatch {
  readonly schema: DocumentSchema
  readonly data: Record<string, unknown>
  readonly renderedPages: readonly ViewerPageMetrics[]
  readonly pageVirtualizer?: PageDomVirtualizer
  readonly container?: HTMLElement
}

interface MountedCommittedPages {
  readonly virtualizer: PageDomVirtualizer
  readonly slots: CommittedPageSlotRegistry
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
  private _destroyPromise?: Promise<void>
  private _emittingHookFailure = false
  private _pageVirtualizer?: PageDomVirtualizer
  private _pageSlots?: CommittedPageSlotRegistry
  private readonly _performanceBudget: Readonly<ViewerPerformanceBudget>
  private readonly _tasks = new RenderTaskCoordinator()
  private readonly _layoutRuntime: ReturnType<typeof createDefaultLayoutRuntime>
  private readonly _renderSurface?: RenderSurface
  private readonly _resourceReadiness: ReturnType<typeof createResourceReadinessCoordinator>
  private readonly _textMeasure?: BrowserTextMeasureService
  private readonly _readerLeases = createReaderLeaseCoordinator()
  private _requested: ViewerInputState = initialViewerInputState()
  private _committed: ViewerInputState = initialViewerInputState()
  private _lastRenderResult: ViewerRenderResult = emptyRenderResult([])
  private _requestedDocumentRevision = 0
  private _requestedDataRevision = 0
  private _committedDocumentRevision = 0
  private _committedDataRevision = 0
  private _committedResourceRevision = 0

  constructor(options: ViewerOptions) {
    if (!options?.profile)
      throw new Error('MATERIAL_PROFILE_REQUIRED')
    const maxNodes = options.browserDom?.maxNodes ?? VIEWER_TREE_ABSOLUTE_MAX_NODES
    if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
      throw new Error('VIEWER_MAX_NODES_INVALID')
    this._performanceBudget = resolvePerformanceBudget(options.performanceBudget, maxNodes)
    this._options = options
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
    const textMeasureDocument = this._host?.document ?? getGlobalDocument()
    this._textMeasure = textMeasureDocument
      ? new BrowserTextMeasureService(textMeasureDocument, { maxEntries: this._performanceBudget.measureCacheEntries })
      : undefined
    this._resourceReadiness = createResourceReadinessCoordinator({
      prepareFont: this._host
        ? createFontPreparationAdapter(this._fontManager, this._host.document)
        : (value, signal) => prepareFontWithoutHost(this._fontManager, value, signal),
      prepareAsset: options.prepareAsset ?? (async (_value, signal) => {
        throwIfAborted(signal)
        return Object.freeze({ state: 'ready' as const })
      }),
    })
    this._hooks = createInternalHooks()
    this._renderSurface = this._host
      ? new RenderSurface(this._host.mount)
      : undefined
    this._layoutRuntime = createDefaultLayoutRuntime({
      profile: options.profile,
      materials: this._materials,
      measureService: new MeasureService({ maxEntries: this._performanceBudget.measureCacheEntries }),
      runtimeModelCache: createRuntimeModelResolutionCache(options.profile, this._performanceBudget.measureCacheEntries),
      scheduler: createBoundedMeasureScheduler(this._performanceBudget.maxMeasureInFlight),
      textMeasure: (input, resourceRevision, signal) => {
        if (!this._textMeasure)
          throw new Error('VIEWER_TEXT_MEASURE_DOCUMENT_UNAVAILABLE')
        return this._textMeasure.measure(input, resourceRevision, signal)
      },
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
      prepareResources: (input, signal) => this.prepareLayoutResources(
        input.document,
        input.runtimeModels,
        signal,
        input.reportDiagnostic ?? (diagnostic => this.emitRuntimeDiagnostic(diagnostic)),
      ),
    })
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async open(input: ViewerOpenInput): Promise<void> {
    this.ensureNotDestroyed()
    const data = snapshotInlineData(input.data ?? {}, this._performanceBudget)
    const loaded = loadDocumentWithProfile(input.schema, this._options.profile)
    const document = snapshotCanonicalDocument(loaded.schema, this._options.profile)
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
      document,
      nodeStates: snapshotNodeStates(loaded.nodeStates),
      data,
      documentRevision,
      dataRevision,
      diagnostics,
      ...(input.onDiagnostic ? { onDiagnostic: input.onDiagnostic } : {}),
    })
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
        reportDiagnostic: diagnostic => this.emitCandidateDiagnostic(candidate, diagnostic),
      }, task.signal)
    }
    catch (error) {
      if (!this._tasks.isCurrent(task.generation))
        return
      throw error
    }
    if (!this._tasks.isCurrent(task.generation))
      return

    const diagnostics = [...candidate.diagnostics, ...committedPlan.diagnostics.map(layoutDiagnosticToViewer)]
    let writerLease: ReaderLease
    try {
      writerLease = await this._readerLeases.acquireWriter(task.signal)
    }
    catch (error) {
      if (!this._tasks.isCurrent(task.generation))
        return
      throw error
    }
    try {
      if (!this._tasks.isCurrent(task.generation))
        return
      let mountedPages: MountedCommittedPages | undefined
      if (this._renderSurface) {
        const commit = await this._renderSurface.commitAtomically((root, transaction) => {
          mountedPages = this.mountCommittedPages(root, committedPlan, candidate, diagnostics, transaction)
          transaction.register(mountedPages.virtualizer)
        }, task.signal)
        diagnostics.push(...commit.cleanupDiagnostics)
      }

      const pages = committedPlan.pages.map(page => ({
        index: page.index,
        width: page.width,
        height: page.height,
        elementCount: page.fragments.length,
        element: mountedPages?.slots.get(page.index),
      }))
      this._committed = candidate
      this._schema = candidate.document
      this._data = candidate.data as Record<string, unknown>
      this._nodeStates = candidate.nodeStates
      this._loadDiagnostics = [...candidate.diagnostics]
      this._diagnosticHandler = candidate.onDiagnostic
      this._pageVirtualizer = mountedPages?.virtualizer
      this._pageSlots = mountedPages?.slots
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
    }
    catch (error) {
      if (!this._tasks.isCurrent(task.generation))
        return
      throw error
    }
    finally {
      writerLease.release()
    }
    diagnostics.forEach(diagnostic => this.emitDiagnostic(diagnostic))
  }

  private async prepareAndPlan(candidate: ViewerInputState, task: RenderTaskToken): Promise<void> {
    if (!candidate.document)
      throw new Error('No schema loaded. Call open() first.')
    const facetDiagnostics = await this._materials.prepare(
      collectPreparedMaterialTypes(candidate, this._options.profile),
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
  ): MountedCommittedPages {
    const document = root.ownerDocument
    const zoom = this.resolveCandidateZoom(candidate.document!, this._host?.mount)
    const unit = candidate.document!.unit
    const virtualizer = new PageDomVirtualizer({ overscan: this._performanceBudget.pageDomOverscan })
    const slots = createCommittedPageSlotRegistry()
    transaction.register(virtualizer)
    transaction.register(() => slots.clear())
    for (const page of committedPlan.pages) {
      const slot = createCommittedPageSlot(document, page.index, page.width, page.height, unit, zoom)
      slots.register(page.index, slot)
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
    return Object.freeze({ virtualizer, slots })
  }

  private async prepareLayoutResources(
    document: DocumentSchema,
    runtimeModels: ReadonlyMap<string, ResolvedRuntimeModel>,
    signal: AbortSignal,
    reportDiagnostic: (diagnostic: unknown) => void,
  ): Promise<number> {
    throwIfAborted(signal)
    const resources = collectDeclaredLayoutResources(document, runtimeModels, this._options.profile)
    const result = await this._resourceReadiness.prepare(resources, signal)
    throwIfAborted(signal)
    result.diagnostics.forEach(reportDiagnostic)
    return result.resourceRevision
  }

  private emitRuntimeDiagnostic(value: unknown): void {
    this.emitDiagnostic(runtimeDiagnosticToViewer(value))
  }

  private emitCandidateDiagnostic(candidate: ViewerInputState, value: unknown): void {
    notifyDiagnosticObserver(candidate.onDiagnostic, runtimeDiagnosticToViewer(value))
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

    await this.withCommittedBatch('print', async (batch) => {
      const printPolicy = this.createPrintPolicy(resolvedOptions, batch)
      if (!printPolicy)
        return

      if (!shouldUseBrowser) {
        const customDriver = driver!
        try {
          options.onPhase?.({ phase: 'preparing', message: customDriver.id })
          await customDriver.print({
            schema: batch.schema,
            data: batch.data,
            entry: 'preview',
            printPolicy,
            renderedPages: batch.renderedPages.map(page => ({ ...page })),
            container: batch.container,
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
    })
  }

  private createPrintPolicy(
    options: ViewerPrintOptions,
    batch: CommittedViewerBatch,
  ): ViewerPrintPolicy | undefined {
    try {
      return resolvePrintPolicy({
        schema: batch.schema,
        options,
        renderedPages: batch.renderedPages.map(page => ({ ...page })),
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

    try {
      return await this.withCommittedBatch('export', async (batch) => {
        const context = {
          schema: batch.schema,
          data: batch.data,
          entry: options.entry ?? 'api' as const,
          renderedPages: batch.renderedPages.map(page => ({ ...page })),
          container: batch.container,
          onPhase: options.onPhase,
          onProgress: options.onProgress,
          onDiagnostic: (event: ViewerDiagnosticEvent) => this.emitTaskDiagnostic(event, options.onDiagnostic),
        }
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
      if (err instanceof ViewerOutputDestroyedError)
        throw err
      if (options.throwOnError)
        throw err
      return undefined
    }
  }

  destroy(): Promise<void> {
    if (this._destroyPromise)
      return this._destroyPromise
    this._destroyed = true
    const reason = new ViewerOutputDestroyedError()
    this._readerLeases.close(reason)
    this._tasks.dispose()
    this._readerLeases.revokeActive(reason)
    this._destroyPromise = Promise.resolve().then(() => this.finishDestroy())
    return this._destroyPromise
  }

  private async finishDestroy(): Promise<void> {
    const diagnostics: ViewerDiagnosticEvent[] = []
    await this._readerLeases.waitForIdle(new AbortController().signal)
    try {
      this._renderSurface?.dispose()
    }
    catch (error) {
      appendDisposeDiagnostics(diagnostics, error)
    }
    this._pageVirtualizer = undefined
    this._pageSlots = undefined
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
    diagnostics.push(...facetDiagnostics.map(facetDiagnosticToViewer))
    try {
      this._fontManager.clear()
    }
    catch (error) {
      appendDisposeDiagnostics(diagnostics, error)
    }
    try {
      this._textMeasure?.clear()
    }
    catch (error) {
      appendDisposeDiagnostics(diagnostics, error)
    }
    try {
      this._resourceReadiness.clear()
    }
    catch (error) {
      appendDisposeDiagnostics(diagnostics, error)
    }
    try {
      this._host?.clear()
    }
    catch (error) {
      appendDisposeDiagnostics(diagnostics, error)
    }
    try {
      this._host?.mount.replaceChildren()
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
    this._nodeStates = createReadonlyMap(new Map())
    this._loadDiagnostics = []
    this._renderedPageMetrics = []
    this._lastRenderResult = emptyRenderResult([])
    this._committedDocumentRevision = 0
    this._committedDataRevision = 0
    this._committedResourceRevision = 0
    diagnostics.forEach(diagnostic => this.emitDiagnostic(diagnostic))
    this._diagnosticHandler = undefined
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

  private async withCommittedBatch<T>(
    mode: 'print' | 'export',
    action: (batch: CommittedViewerBatch) => T | Promise<T>,
  ): Promise<T> {
    const lease = await this._readerLeases.acquire()
    try {
      const schema = this._schema
      if (!schema)
        throw new Error('No schema loaded')
      const batch: CommittedViewerBatch = Object.freeze({
        schema,
        data: this._data,
        renderedPages: Object.freeze(this._renderedPageMetrics.map(page => Object.freeze({ ...page }))),
        ...(this._pageVirtualizer ? { pageVirtualizer: this._pageVirtualizer } : {}),
        ...(this._host ? { container: this._host.mount } : {}),
      })
      const run = () => action(batch)
      const actionPromise = Promise.resolve(batch.pageVirtualizer
        ? batch.pageVirtualizer.withMaterializedPages(mode, run)
        : run())
      void actionPromise.catch(() => {})
      return await Promise.race([actionPromise, lease.revoked])
    }
    finally {
      lease.release()
    }
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

    const unit = toViewerCssUnit(this._schema.unit)
    container.style.paddingLeft = `${ox}${unit}`
    container.style.paddingTop = `${oy}${unit}`
  }

  private emitDiagnostic(event: ViewerDiagnosticEvent): void {
    notifyDiagnosticObserver(this._diagnosticHandler, event)
    try {
      this._hooks.diagnosticsEmitted.call(event).catch(() => {
        this.emitDiagnosticHookError()
      })
    }
    catch {
      this.emitDiagnosticHookError()
    }
  }

  private emitTaskDiagnostic(
    event: ViewerDiagnosticEvent,
    onDiagnostic?: (event: ViewerDiagnosticEvent) => void,
  ): void {
    notifyDiagnosticObserver(onDiagnostic, event)
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
      notifyDiagnosticObserver(this._diagnosticHandler, {
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

class ViewerOutputDestroyedError extends Error {
  readonly code = 'VIEWER_OUTPUT_DESTROYED'

  constructor() {
    super('VIEWER_OUTPUT_DESTROYED')
    this.name = 'ViewerOutputDestroyedError'
  }
}

function getGlobalWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window
}

function getGlobalDocument(): Document | undefined {
  return typeof document === 'undefined' ? undefined : document
}

function notifyDiagnosticObserver(
  observer: ((event: ViewerDiagnosticEvent) => void) | undefined,
  event: ViewerDiagnosticEvent,
): void {
  try {
    observer?.(event)
  }
  catch {
    // Diagnostics are observational and must never affect runtime control flow.
  }
}

function collectPreparedMaterialTypes(
  candidate: ViewerInputState,
  profile: ViewerOptions['profile'],
): string[] {
  if (!candidate.document)
    return []
  const outputStates = resolveEffectiveOutputStates(
    candidate.document.elements,
    candidate.data as Record<string, unknown>,
    profile,
  )
  const types = new Set<string>()
  walkMaterialNodes(candidate.document, profile, (node) => {
    if (candidate.nodeStates.get(node.id)?.status === 'ready'
      && outputStates.get(node.id)?.shouldMeasure === true) {
      types.add(node.type)
    }
  })
  return [...types]
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
  browserMaxNodes: number,
): Readonly<ViewerPerformanceBudget> {
  const requested: ViewerPerformanceBudget = {
    ...DEFAULT_VIEWER_PERFORMANCE_BUDGET,
    ...configured,
  }
  assertViewerPerformanceBudget(requested)
  const result = {} as ViewerPerformanceBudget
  for (const key of Object.keys(DEFAULT_VIEWER_PERFORMANCE_BUDGET) as Array<keyof ViewerPerformanceBudget>) {
    result[key] = Math.min(requested[key], DEFAULT_VIEWER_PERFORMANCE_BUDGET[key])
  }
  result.maxRuntimeRows = Math.min(
    result.maxInlineDataNodes,
    result.maxRuntimeRows,
    result.maxLayoutFactsPerMaterial,
    result.maxRenderTreeNodesPerMaterial,
    browserMaxNodes,
  )
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

function snapshotCanonicalDocument(
  document: DocumentSchema,
  profile: ViewerOptions['profile'],
): DocumentSchema {
  const normalized = copyDefinedJson(document)
  const copy = cloneJsonValue(normalized as never, {
    maxDepth: profile.admissionBudget.maxDepth,
    maxNodes: profile.admissionBudget.maxJsonNodes,
    maxStringBytes: profile.admissionBudget.maxStringBytes,
  })
  return deepFreezeJsonValue(copy) as DocumentSchema
}

function copyDefinedJson(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(copyDefinedJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, copyDefinedJson(child)]))
  }
  if (value === undefined)
    throw new Error('VIEWER_CANONICAL_DOCUMENT_INVALID')
  return value
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

function collectDeclaredLayoutResources(
  document: DocumentSchema,
  runtimeModels: ReadonlyMap<string, ResolvedRuntimeModel>,
  profile: CompiledMaterialProfile,
): Array<Readonly<{ kind: 'font' | 'asset', value: string }>> {
  const resources: Array<Readonly<{ kind: 'font' | 'asset', value: string }>> = []
  const pageFont = document.page.font?.trim()
  if (pageFont)
    resources.push(Object.freeze({ kind: 'font', value: pageFont }))
  const measurableNodeIds = new Set([...runtimeModels.values()].map(model => model.nodeId))
  walkMaterialNodes(document, profile, (node, _address, introspection) => {
    if (!measurableNodeIds.has(node.id))
      return
    for (const resource of introspection.resources) {
      const value = resource.value.trim()
      if (value)
        resources.push(Object.freeze({ kind: resource.kind, value }))
    }
  })
  return resources
}

async function prepareFontWithoutHost(
  fontManager: FontManager,
  value: string,
  signal: AbortSignal,
): Promise<Readonly<{ state: 'ready' | 'failed', message?: string }>> {
  throwIfAborted(signal)
  try {
    await fontManager.loadFont(value)
    throwIfAborted(signal)
    return Object.freeze({ state: 'ready' })
  }
  catch (cause) {
    throwIfAborted(signal)
    return Object.freeze({ state: 'failed', message: safeSummarizeThrown(cause).message })
  }
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
  content.style.zIndex = String(PAGE_CONTENT_LAYER_STACK_INDEX)
  const pageLayers = groupPageLayerPlansByPlacement(resolvePageLayerPlans(input.document.page, {
    width: input.page.width,
    height: input.page.height,
  }))
  appendCommittedPageLayers(pageElement, pageLayers.underContent, input.page.index, toViewerCssUnit(input.document.unit), input.diagnostics)
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
        toViewerCssUnit(input.document.unit),
        input.materials.getLayoutOverflow(fragment.node.type),
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
        && (diagnostic.code === 'VIEWER_MATERIAL_RENDER_ERROR'
          || diagnostic.code === 'VIEWER_MATERIAL_MOUNT_ERROR'
          || diagnostic.code === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED'),
      )) {
        wrapper.setAttribute('data-render-error', 'true')
      }
      mounts.push(mount)
      content.appendChild(wrapper)
      input.checkpoint()
    }
    appendCommittedPageLayers(pageElement, pageLayers.overContent, input.page.index, toViewerCssUnit(input.document.unit), input.diagnostics)
    appendCommittedPageLayers(pageElement, pageLayers.top, input.page.index, toViewerCssUnit(input.document.unit), input.diagnostics)
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
  const cssUnit = toViewerCssUnit(schema.unit)
  element.className = 'ei-viewer-page'
  element.setAttribute('data-page-index', String(page.index))
  element.style.position = 'relative'
  element.style.width = `${page.width}${cssUnit}`
  element.style.height = `${page.height}${cssUnit}`
  element.style.overflow = 'hidden'
  element.style.boxSizing = 'border-box'
  applyCommittedPageBackground(element, schema.page.background, cssUnit)
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

function applyCommittedPageBackground(element: HTMLElement, background: PageBackground | undefined, unit: string): void {
  if (!background) {
    element.style.background = 'white'
    return
  }
  element.style.backgroundColor = background.color || 'white'
  if (!background.image)
    return
  element.style.backgroundImage = `url(${JSON.stringify(background.image)})`
  const repeat = background.repeat || 'none'
  if (repeat === 'full') {
    element.style.backgroundSize = '100% 100%'
    element.style.backgroundRepeat = 'no-repeat'
  }
  else {
    element.style.backgroundRepeat = repeat === 'repeat' || repeat === 'repeat-x' || repeat === 'repeat-y'
      ? repeat
      : 'no-repeat'
    if (background.width != null && background.height != null)
      element.style.backgroundSize = `${background.width}${unit} ${background.height}${unit}`
    else if (background.width != null)
      element.style.backgroundSize = `${background.width}${unit} auto`
    else if (background.height != null)
      element.style.backgroundSize = `auto ${background.height}${unit}`
  }
  if (background.offsetX != null || background.offsetY != null)
    element.style.backgroundPosition = `${background.offsetX ?? 0}${unit} ${background.offsetY ?? 0}${unit}`
}

function appendCommittedPageLayers(
  pageElement: HTMLElement,
  plans: readonly PageLayerRenderPlan[],
  pageIndex: number,
  unit: string,
  diagnostics: ViewerDiagnosticEvent[],
): void {
  for (const plan of plans) {
    if (plan.layer.kind === 'watermark' && plan.layer.type === 'text')
      appendCommittedTextWatermark(pageElement, plan, pageIndex, unit, diagnostics)
  }
}

function appendCommittedTextWatermark(
  pageElement: HTMLElement,
  plan: TextWatermarkPageLayerPlan,
  pageIndex: number,
  unit: string,
  diagnostics: ViewerDiagnosticEvent[],
): void {
  const layer = pageElement.ownerDocument.createElement('div')
  layer.className = 'ei-viewer-page-layer ei-viewer-page-layer--watermark'
  layer.setAttribute('data-page-layer-id', plan.layer.id)
  layer.setAttribute('data-page-layer-kind', plan.layer.kind)
  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.zIndex = String(resolvePageLayerStackIndex(plan))
  layer.style.pointerEvents = 'none'
  layer.style.userSelect = 'none'
  layer.style.overflow = 'hidden'
  layer.style.color = plan.layer.color
  layer.style.opacity = String(plan.layer.opacity)
  for (const tile of plan.tiles) {
    const text = pageElement.ownerDocument.createElement('span')
    text.className = 'ei-viewer-page-layer__watermark-tile'
    text.textContent = plan.layer.text
    text.style.position = 'absolute'
    text.style.display = 'inline-flex'
    text.style.alignItems = 'center'
    text.style.justifyContent = 'center'
    text.style.left = `${tile.x}${unit}`
    text.style.top = `${tile.y}${unit}`
    text.style.fontSize = `${plan.layer.fontSize}${unit}`
    text.style.fontWeight = '500'
    text.style.lineHeight = '1'
    text.style.whiteSpace = 'nowrap'
    text.style.transform = `translate(-50%, -50%) rotate(${plan.layer.rotation}deg)`
    text.style.transformOrigin = 'center center'
    layer.appendChild(text)
  }
  if (plan.truncated) {
    diagnostics.push({
      category: 'viewer',
      severity: 'warning',
      code: 'PAGE_WATERMARK_TRUNCATED',
      message: `Page ${pageIndex + 1} layer ${plan.layer.id} generated too many watermark tiles and was truncated.`,
      detail: { pageIndex, layerId: plan.layer.id, tileCount: plan.tiles.length },
    })
  }
  pageElement.appendChild(layer)
}

function createCommittedElementWrapper(
  document: Document,
  node: Readonly<MaterialNode<unknown>>,
  box: Readonly<{ x: number, y: number, width: number, height: number }>,
  pageOffset: number,
  unit: string,
  overflow: 'visible' | 'clip',
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
  wrapper.style.overflow = overflow === 'visible' ? 'visible' : 'hidden'
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

function runtimeDiagnosticToViewer(value: unknown): ViewerDiagnosticEvent {
  const detail = snapshotDiagnosticDetail(value)
  return {
    category: 'viewer',
    severity: 'warning',
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
