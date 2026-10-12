import type { InternalHooks, PagePlan, PaginationResult, ViewerMeasureResult } from '@easyink/core'
import type { CleanupError, DisposeResult } from '@easyink/plugin-runtime'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type {
  PrintDriver,
  ViewerDiagnosticEvent,
  ViewerExportContext,
  ViewerExporter,
  ViewerExportOptions,
  ViewerExportResult,
  ViewerMeasureContext,
  ViewerOpenInput,
  ViewerOptions,
  ViewerPageMetrics,
  ViewerPrintOptions,
  ViewerPrintResult,
  ViewerRenderCompleted,
  ViewerRenderResult,
  ViewerRenderState,
} from './types'
import type { ViewerHost } from './viewer-host'
import { createFragmentFromNode, createInternalHooks, FontManager, readNodeRepeatScope, runLayoutPipeline, runPagination } from '@easyink/core'
import { normalizeDocumentSchema, traverseNodes, validateSchema } from '@easyink/schema'
import { deepClone, UNIT_FACTOR } from '@easyink/shared'
import { applyBindingsToProps, projectBindings } from './binding-projector'
import { resolveConditionalSchema } from './conditional-schema'
import { applyFontSelections, collectFontFamilies, loadAndInjectFonts } from './font-loader'
import { createViewerMaterialHost } from './material-host'
import { MaterialRendererRegistry } from './material-registry'
import { OutputTask } from './output-task'
import { PrintPolicyError, resolvePrintPolicy } from './print-policy'
import { runPrintWithIsolation } from './print-service'
import { RenderRequest } from './render-request'
import { RenderResources } from './render-resources'
import { renderPages } from './render-surface'
import { waitForCandidateImages } from './resource-readiness'
import { createThumbnails } from './thumbnail-pipeline'
import { createBrowserViewerHost, createIframeViewerHost } from './viewer-host'

export class ViewerRuntime {
  private _options: ViewerOptions
  private _schema?: DocumentSchema
  private _data: Record<string, unknown> = {}
  private _diagnosticHandler?: (event: ViewerDiagnosticEvent) => void
  private _exporters: ViewerExporter[] = []
  private _printDrivers: PrintDriver[] = []
  private _assembly!: Awaited<ReturnType<typeof createViewerMaterialHost>>
  private _fontManager: FontManager
  private _hooks: InternalHooks
  private _host?: ViewerHost
  private _renderedPageMetrics: ViewerPageMetrics[] = []
  private _destroyed = false
  private _emittingHookFailure = false
  private _documentGeneration = 0
  private _nextRequest = 0
  private _request?: RenderRequest
  private _renderState: ViewerRenderState = { status: 'idle' }
  private readonly _requests = new Set<RenderRequest>()
  private _committed?: { request: RenderRequest, result: ViewerRenderCompleted, metrics: ViewerPageMetrics[], container?: HTMLElement, resources: RenderResources[], users: number }
  private _latestRender?: { request: RenderRequest, promise: Promise<ViewerRenderResult> }
  private readonly _outputTasks = new Set<OutputTask>()
  private readonly _outputResources = new Map<RenderRequest, RenderResources[]>()
  private readonly _computationResources = new Map<RenderRequest, RenderResources[]>()
  private readonly _resourceDisposals = new Set<Promise<DisposeResult>>()
  private readonly _disposedResources = new WeakSet<RenderResources>()
  private readonly _cleanupErrors: CleanupError[] = []
  private readonly _lateCleanupErrors: CleanupError[] = []
  private _disposal?: Promise<DisposeResult>

  private constructor(options: ViewerOptions = {}) {
    this._options = options
    this._fontManager = new FontManager(options.fontProvider)
    this._hooks = createInternalHooks()
  }

  static async create(options: ViewerOptions = {}): Promise<ViewerRuntime> {
    const runtime = new ViewerRuntime(options)
    let targetDocument: Document | undefined
    runtime._assembly = await createViewerMaterialHost({ kind: 'viewer', materials: options.materials ?? [], locale: options.locale }, (_registry, resources) => {
      resources.onDispose(() => {
        runtime._schema = undefined
      })
      resources.onDispose(() => {
        runtime._data = {}
      })
      resources.onDispose(() => {
        runtime._exporters = []
      })
      resources.onDispose(() => {
        runtime._printDrivers = []
      })
      resources.onDispose(() => {
        runtime._renderedPageMetrics = []
      })
      let fontInvalidationFailure: { cause: unknown } | undefined
      resources.onDispose(() => {
        if (fontInvalidationFailure)
          throw fontInvalidationFailure.cause
        runtime._fontManager.clear()
      })
      // Invalidating work is synchronous; cleanup errors still flow through DisposeResult.
      resources.signal.addEventListener('abort', () => {
        try {
          runtime._fontManager.clear()
        }
        catch (cause) {
          fontInvalidationFailure = { cause }
        }
      }, { once: true })
      runtime._host = options.host
        ?? (options.iframe
          ? createIframeViewerHost(options.iframe)
          : options.container
            ? createBrowserViewerHost(options.container)
            : undefined)
      resources.onDispose(() => runtime._host?.clear())
      resources.onDispose(async () => {
        for (const request of runtime._computationResources.keys())
          runtime.releaseComputation(request)
        for (const scopes of runtime._outputResources.values()) {
          for (const scope of scopes)
            runtime.disposeResources(scope)
        }
        runtime._outputResources.clear()
        await Promise.all(runtime._resourceDisposals)
      })
      resources.onDispose(() => {
        for (const request of runtime._requests)
          runtime.clearRequestFonts(request)
        runtime._requests.clear()
        runtime._committed = undefined
        runtime._request = undefined
      })
      if (runtime._host) {
        targetDocument = runtime._host.document
        if (!targetDocument || !runtime._host.mount)
          throw new Error('Viewer surface requires a document and mount')
      }
    })
    return runtime
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async open(input: ViewerOpenInput): Promise<ViewerRenderResult> {
    this.ensureNotDestroyed()
    this._documentGeneration++
    for (const task of this._outputTasks) {
      if (!task.started)
        task.cancel('document-changed')
    }
    this._request?.cancel('document-changed')
    this.releasePreview()
    this._host?.clear()
    this._renderedPageMetrics = []
    this._schema = undefined
    this._data = {}
    this._renderState = { status: 'updating', requestId: this._nextRequest + 1 }
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
      this._renderState = { status: 'failed', requestId: this._nextRequest + 1, cause: event }
      this.emitDiagnostic(event)
      throw new Error(`Invalid schema: ${errors.join('; ')}`)
    }

    // 2. Hook: beforeSchemaNormalize + schema normalization
    try {
      const schemaForNormalize = this.callSchemaNormalizeHook(deepClone(input.schema))
      this._schema = normalizeDocumentSchema(schemaForNormalize)
    }
    catch (cause) {
      this._renderState = { status: 'failed', requestId: this._nextRequest + 1, cause }
      throw cause
    }

    this._data = deepClone(input.data ?? {})

    // 3. Render (font loading + binding + page plan + DOM)
    return this.render()
  }

  async updateData(data: Record<string, unknown>): Promise<ViewerRenderResult> {
    this.ensureNotDestroyed()
    this._data = deepClone(data)
    return this.render()
  }

  async render(): Promise<ViewerRenderResult> {
    this.ensureNotDestroyed()
    if (!this._schema) {
      throw new Error('No schema loaded. Call open() first.')
    }

    this._request?.cancel('superseded')
    const request = new RenderRequest(++this._nextRequest, this._documentGeneration, this._schema, this._data, this._host, this._fontManager, this.resolveZoom(this._schema, this._host), this._diagnosticHandler)
    this._request = request
    this._requests.add(request)
    this._outputResources.set(request, [])
    this._computationResources.set(request, [])
    this._renderState = { status: 'updating', requestId: request.id }
    const completion = Promise.withResolvers<ViewerRenderResult>()
    this._latestRender = { request, promise: completion.promise }
    // Outputs observe this promise too; a render without an output still has its public rejection.
    void completion.promise.catch(() => {})
    const registry = new MaterialRendererRegistry(this._assembly, request.document, {
      acquire: (type) => {
        const owner = this._assembly.host.registry.getMaterial(type)!.owner
        const signal = AbortSignal.any([this._assembly.host.resources(type).signal, request.controller.signal])
        const scope = new RenderResources(owner, signal, this._lateCleanupErrors)
        this._computationResources.get(request)!.push(scope)
        return scope.context
      },
      release: (context) => {
        const scope = this._computationResources.get(request)?.find(scope => scope.context === context)
        if (scope)
          this.disposeResources(scope)
      },
    })
    try {
      const result = await this.computeRender(request, registry)
      completion.resolve(result)
      return result
    }
    catch (cause) {
      this.releaseCandidate(request)
      if (request.cancelled) {
        this.clearRequestFonts(request)
        this._requests.delete(request)
        completion.resolve(request.cancelled)
        return request.cancelled
      }
      this._renderState = { status: 'failed', requestId: request.id, cause }
      this.clearRequestFonts(request)
      this._requests.delete(request)
      completion.reject(cause)
      throw cause
    }
    finally {
      this.releaseComputation(request)
    }
  }

  private async computeRender(request: RenderRequest, registry: MaterialRendererRegistry): Promise<ViewerRenderResult> {
    const schema = request.schema
    const data = request.data
    const diagnostics: ViewerDiagnosticEvent[] = []
    const conditional = resolveConditionalSchema(schema, data, registry)
    const runtimeSchema = conditional.schema
    diagnostics.push(...conditional.diagnostics)

    // Stage 1: Font loading
    const fontSelections = await request.wait(this.loadFonts(diagnostics, runtimeSchema, request))
    applyFontSelections(runtimeSchema, fontSelections)
    this.assertCurrentRequest(request)
    await request.wait(registry.load(runtimeSchema.elements.filter(node => !node.hidden).map(node => node.type), request.controller.signal))
    this.assertCurrentRequest(request)

    // Stage 2: Binding projection
    const resolvedPropsMap = this.resolveAllBindings(diagnostics, runtimeSchema, data, registry)

    // Stage 3: Hook - beforePagePlan
    try {
      this._hooks.beforePagePlan.call({ schema: runtimeSchema, mode: runtimeSchema.page.mode })
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
      throw err
    }

    // Preparation sees declared geometry and bound props after the existing hook.
    await request.wait(registry.prepare(runtimeSchema.elements, resolvedPropsMap, {
      data,
      unit: runtimeSchema.unit,
      reportDiagnostic: diagnostic => diagnostics.push({ category: 'viewer', severity: diagnostic.severity, code: diagnostic.code, message: diagnostic.message, nodeId: diagnostic.nodeId, scope: 'material', cause: diagnostic.cause }),
    }, request.controller.signal))
    this.assertCurrentRequest(request)

    // Stage 3.5: Measure elements that need expansion (e.g., table-data)
    const { measurements, diagnostics: layoutDiagnostics } = this.measureRuntimeElements(resolvedPropsMap, runtimeSchema, data, registry)
    diagnostics.push(...layoutDiagnostics)

    // Stage 4: Orthogonal layout + pagination planning. Page-repeated
    // elements are overlays resolved after pagination, so they must not
    // contribute to flow, document height, or page count.
    const repeatedElements = this.collectRepeatedPageElements(runtimeSchema.elements, registry)
    const layoutSchema = repeatedElements.length > 0
      ? { ...runtimeSchema, elements: runtimeSchema.elements.filter(el => !repeatedElements.includes(el)) }
      : runtimeSchema
    const originalRepeatedIds = new Set(this.collectRepeatedPageElements(schema.elements, registry).map(el => el.id))
    const layoutOriginalSchema = originalRepeatedIds.size > 0
      ? { ...schema, elements: schema.elements.filter(el => !originalRepeatedIds.has(el.id)) }
      : schema
    const layoutDocument = runLayoutPipeline(layoutSchema, {
      originalSchema: layoutOriginalSchema,
      measured: measurements,
      runtimeRefs: registry.runtimeRefs,
    })
    const pagination = runPagination(layoutSchema, layoutDocument, {
      originalSchema: layoutSchema,
      resolveFragmentPaginator: fragment => registry.getFragmentPaginator(fragment, {
        data,
        unit: runtimeSchema.unit,
        reportDiagnostic: diagnostic => diagnostics.push({ category: 'viewer', severity: diagnostic.severity, code: diagnostic.code, message: diagnostic.message, nodeId: diagnostic.nodeId, scope: 'material', cause: diagnostic.cause }),
      }),
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
    this.resolveRepeatedPageElements(plan, registry, repeatedElements)

    // Stage 5: DOM rendering
    const pages = plan.pages.map(p => ({
      index: p.index,
      width: p.width,
      height: p.height,
      elementCount: p.elements.length,
      element: undefined as HTMLElement | undefined,
    }))
    const metrics = pages.map(page => ({
      index: page.index,
      width: page.width,
      height: page.height,
      unit: runtimeSchema.unit,
    }))

    this.assertCurrentRequest(request)
    const candidate = request.document?.createElement('div')
    if (request.host) {
      const pageDOMs = renderPages(
        plan.pages,
        registry,
        {
          container: candidate!,
          document: request.document!,
          zoom: request.zoom,
          unit: runtimeSchema.unit,
          data,
          resolvedPropsMap,
          pageSchema: runtimeSchema.page,
          createItemResources: (node) => {
            const owner = this._assembly.host.registry.getMaterial(node.type)?.owner
            if (!owner)
              return undefined
            const scope = new RenderResources(owner, this._assembly.host.resources(node.type).signal, this._lateCleanupErrors)
            this._outputResources.get(request)!.push(scope)
            return scope.context
          },
          releaseItemResources: (context) => {
            const scope = this._outputResources.get(request)!.find(scope => scope.context === context)
            if (scope)
              this.disposeResources(scope)
          },
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

    if (candidate && request.document) {
      diagnostics.push(...await request.wait(waitForCandidateImages(candidate, request.document, request.controller.signal)))
      this.assertCurrentRequest(request)
    }

    const result: ViewerRenderCompleted = { status: 'completed', requestId: request.id, pages, thumbnails: createThumbnails(pages, runtimeSchema.unit), diagnostics }
    this.assertCurrentRequest(request)
    // All fallible preparation runs against the detached candidate. Publish one version.
    if (request.host && candidate) {
      this.parkOutput(this._committed)
      request.mount!.replaceChildren(candidate)
      this.applyViewportOffset(request.mount!, schema)
    }
    const previous = this._committed
    this._renderedPageMetrics = metrics
    request.committed = true
    this._committed = { request, result, metrics, container: candidate, resources: this._outputResources.get(request)!, users: 1 }
    this._renderState = { status: 'completed', requestId: request.id }
    // Cleanup callbacks may request another render; publish fields before releasing the old version.
    if (previous)
      this.releaseOutput(previous)
    // Emit all diagnostics
    for (const d of diagnostics) {
      if (!this.isCurrentRequest(request))
        break
      this.emitDiagnostic(d, request.onDiagnostic, () => this.isCurrentRequest(request))
    }

    return result
  }

  async print(options: ViewerPrintOptions = {}): Promise<ViewerPrintResult> {
    this.ensureNotDestroyed()
    const task = this.createOutputTask()
    let output: ViewerRuntime['_committed']
    let errorCode: string | undefined
    try {
      output = await this.acquireLatestOutput(task)
      task.assertActive()
      const browser = !options.driverId || options.driverId === 'browser'
      const driver = browser ? undefined : this._printDrivers.find(item => item.id === options.driverId)
      if (!browser && !driver) {
        errorCode = 'NO_PRINT_DRIVER'
        throw new Error(`No print driver found for id: ${options.driverId}`)
      }
      const resolvedOptions = options.pageSizeMode || !driver?.defaults?.pageSizeMode
        ? options
        : { ...options, pageSizeMode: driver.defaults.pageSizeMode }
      const printPolicy = resolvePrintPolicy({ schema: output.request.schema, options: resolvedOptions, renderedPages: output.metrics })
      const diagnostics = [...output.result.diagnostics]
      const context = this.outputContext(output, task, options, diagnostics, 'preview')
      options.onPhase?.({ phase: 'preparing', message: driver?.id ?? 'browser' })
      task.assertActive()
      if (driver) {
        await task.wait(driver.print({ ...context, printPolicy, renderedPages: context.renderedPages }))
      }
      else if (output.request.host && output.container) {
        runPrintWithIsolation({ ...output.request.host, mount: output.container }, printPolicy)
      }
      else {
        throw new Error('Browser printing requires a Viewer surface')
      }
      task.assertActive()
      options.onPhase?.({ phase: 'completed', message: driver?.id ?? 'browser' })
      return { status: 'completed', requestId: output.request.id, diagnostics }
    }
    catch (cause) {
      if (task.cancelled)
        return task.cancelled
      this.emitPrintError(cause, options.onDiagnostic, errorCode, output ? event => output?.request.onDiagnostic?.(event) : undefined)
      throw cause
    }
    finally {
      if (output)
        this.releaseOutput(output)
      this._outputTasks.delete(task)
    }
  }

  private createOutputTask(): OutputTask {
    const task = new OutputTask(this._request?.id ?? this._nextRequest, this._documentGeneration)
    this._outputTasks.add(task)
    return task
  }

  private async acquireLatestOutput(task: OutputTask): Promise<NonNullable<ViewerRuntime['_committed']>> {
    while (true) {
      task.assertActive()
      if (this._renderState.status === 'failed')
        throw this._renderState.cause
      const latest = this._latestRender
      if (!latest)
        throw new Error('No schema loaded. Call open() first.')
      task.requestId = latest.request.id
      try {
        await task.wait(latest.promise)
      }
      catch (cause) {
        task.assertActive()
        if (latest !== this._latestRender)
          continue
        throw cause
      }
      task.assertActive()
      if (latest !== this._latestRender)
        continue
      const output = this._committed
      if (!output || output.request !== latest.request)
        throw new Error('Latest render has no completed output')
      // No await between selecting a version and taking its internal use right.
      output.users++
      task.started = true
      return output
    }
  }

  private outputContext(output: NonNullable<ViewerRuntime['_committed']>, task: OutputTask, options: ViewerExportOptions, diagnostics: ViewerDiagnosticEvent[], entry: ViewerExportContext['entry']) {
    const active = <T>(callback: ((value: T) => void) | undefined) => (value: T) => {
      if (!task.controller.signal.aborted)
        callback?.(value)
    }
    return {
      schema: deepClone(output.request.schema),
      data: deepClone(output.request.data),
      entry,
      renderedPages: output.metrics.map(page => ({ ...page })),
      container: output.container,
      signal: task.controller.signal,
      onPhase: active(options.onPhase),
      onProgress: active(options.onProgress),
      onDiagnostic: active((event: ViewerDiagnosticEvent) => {
        diagnostics.push(event)
        options.onDiagnostic?.(event)
        this.emitDiagnostic(event, event => output.request.onDiagnostic?.(event), () => !task.controller.signal.aborted)
      }),
    }
  }

  private emitPrintError(
    err: unknown,
    onDiagnostic?: (event: ViewerDiagnosticEvent) => void,
    code?: string,
    handler?: (event: ViewerDiagnosticEvent) => void,
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
    }, onDiagnostic, handler)
  }

  async exportDocument(formatOrOptions?: string | ViewerExportOptions): Promise<ViewerExportResult> {
    this.ensureNotDestroyed()
    const options = typeof formatOrOptions === 'string'
      ? { format: formatOrOptions }
      : (formatOrOptions ?? {})
    const format = options.format

    const task = this.createOutputTask()
    let output: ViewerRuntime['_committed']
    let exporter: ViewerExporter | undefined
    try {
      output = await this.acquireLatestOutput(task)
      task.assertActive()
      exporter = format ? this._exporters.find(item => item.format === format) : this._exporters[0]
      if (!exporter)
        throw new Error(`No exporter found for format: ${format || 'default'}`)
      const diagnostics = [...output.result.diagnostics]
      const context = this.outputContext(output, task, options, diagnostics, options.entry ?? 'api')
      if (exporter.prepare) {
        options.onPhase?.({ phase: 'preparing', message: exporter.id })
        task.assertActive()
        await task.wait(exporter.prepare(context))
      }
      options.onPhase?.({ phase: 'exporting', message: exporter.id })
      task.assertActive()
      const file = await task.wait(exporter.export(context))
      task.assertActive()
      options.onPhase?.({ phase: 'completed', message: exporter.id })
      return { status: 'completed', requestId: output.request.id, diagnostics, file: file ?? undefined }
    }
    catch (err) {
      if (task.cancelled)
        return task.cancelled
      this.emitExportError(exporter?.id ?? 'unavailable', format, err, options.onDiagnostic, output ? event => output?.request.onDiagnostic?.(event) : undefined, exporter ? 'EXPORTER_ERROR' : 'NO_EXPORTER')
      throw err
    }
    finally {
      if (output)
        this.releaseOutput(output)
      this._outputTasks.delete(task)
    }
  }

  destroy(): Promise<DisposeResult> {
    if (this._disposal)
      return this._disposal
    const completion = Promise.withResolvers<DisposeResult>()
    this._disposal = completion.promise
    this._destroyed = true
    for (const task of this._outputTasks)
      task.cancel('destroyed')
    this._request?.cancel('destroyed')
    for (const request of this._computationResources.keys())
      this.releaseComputation(request)
    for (const scopes of this._outputResources.values()) {
      for (const scope of scopes)
        this.disposeResources(scope)
    }
    this._renderState = { status: 'disposed' }
    void this._assembly.destroy().then(result => completion.resolve({ errors: [...result.errors, ...this._cleanupErrors] }))
    return this._disposal
  }

  // ---------------------------------------------------------------------------
  // Registration API
  // ---------------------------------------------------------------------------

  registerExporter(exporter: ViewerExporter): void {
    this.ensureNotDestroyed()
    const index = this._exporters.findIndex(item => item.id === exporter.id)
    if (index >= 0)
      this._exporters[index] = exporter
    else
      this._exporters.push(exporter)
  }

  registerPrintDriver(driver: PrintDriver): void {
    this.ensureNotDestroyed()
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

  get renderState(): ViewerRenderState {
    return { ...this._renderState }
  }

  get lateCleanupErrors(): readonly CleanupError[] {
    return [...this._assembly.host.lateCleanupErrors, ...this._lateCleanupErrors]
  }

  get hooks(): InternalHooks {
    return this._hooks
  }

  get fontManager(): FontManager {
    return this._fontManager
  }

  // ---------------------------------------------------------------------------
  // Internal pipeline stages
  // ---------------------------------------------------------------------------

  private collectRepeatedPageElements(elements: MaterialNode[], registry: MaterialRendererRegistry): MaterialNode[] {
    return elements.filter(el =>
      readNodeRepeatScope(el) === 'every-output-page'
      || registry.isPageAware(el.type),
    )
  }

  /**
   * Stage 4.5: Resolve per-page repeated elements.
   * Repeated elements are page overlays: one schema node is copied to every
   * output page after pagination and receives page context props.
   */
  private resolveRepeatedPageElements(
    plan: PagePlan,
    registry: MaterialRendererRegistry,
    repeatedElements: MaterialNode[],
  ): void {
    if (repeatedElements.length === 0)
      return

    for (const page of plan.pages) {
      for (const el of repeatedElements) {
        const virtualId = `${el.id}__p${page.index}`
        const virtualNode = {
          ...deepClone(el),
          id: virtualId,
          y: page.yOffset + resolveRepeatedElementLocalY(el, page.height),
        }
        page.elements.push(virtualNode)
        page.fragments!.push({ ...createFragmentFromNode(virtualNode), sourceNodeId: el.id, runtimeRef: registry.runtimeRefs.get(el.id) })
      }
    }
  }

  private measureRuntimeElements(resolvedPropsMap: Map<string, Record<string, unknown>>, schema: DocumentSchema, data: Record<string, unknown>, registry: MaterialRendererRegistry): { measurements: Map<string, ViewerMeasureResult>, diagnostics: ViewerDiagnosticEvent[] } {
    const diagnostics: ViewerDiagnosticEvent[] = []
    const measurements = new Map<string, ViewerMeasureResult>()
    const measureCtx: ViewerMeasureContext = {
      data,
      unit: schema.unit,
      reportDiagnostic: diagnostic => diagnostics.push({
        category: diagnostic.code.startsWith('MATERIAL_') ? 'viewer' : 'datasource',
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        nodeId: diagnostic.nodeId,
        scope: diagnostic.code.startsWith('MATERIAL_') ? 'material' : 'datasource',
        cause: diagnostic.cause,
      }),
    }

    for (const node of schema.elements) {
      const resolvedProps = resolvedPropsMap.get(node.id) ?? node.props
      const nodeForMeasure = resolvedProps === node.props ? node : { ...node, props: resolvedProps }
      let result
      try {
        result = registry.measure(nodeForMeasure, { ...measureCtx, runtimeRef: registry.runtimeRefs.get(node.id) })
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

  private async loadFonts(diagnostics: ViewerDiagnosticEvent[], schema: DocumentSchema, request: RenderRequest): Promise<Map<string, string>> {
    const families = collectFontFamilies(schema)
    if (families.size === 0)
      return new Map()

    if (!request.host)
      return new Map()

    try {
      const result = await loadAndInjectFonts(families, request.fonts, request.document!, request.controller.signal)
      diagnostics.push(...result.diagnostics)
      return result.familySelections
    }
    catch (err) {
      if (request.cancelled)
        throw request.cancelled
      diagnostics.push({
        category: 'viewer',
        severity: 'warning',
        code: 'FONT_LOAD_ERROR',
        message: `Font loading failed: ${err instanceof Error ? err.message : String(err)}`,
        scope: 'font',
        cause: serializeCause(err),
      })
      return new Map([...families].map(family => [family, 'sans-serif']))
    }
  }

  private resolveAllBindings(diagnostics: ViewerDiagnosticEvent[], schema: DocumentSchema, data: Record<string, unknown>, registry: MaterialRendererRegistry): Map<string, Record<string, unknown>> {
    const resolvedMap = new Map<string, Record<string, unknown>>()
    traverseNodes(schema, (node) => {
      if (!node.binding) {
        resolvedMap.set(node.id, node.props)
        return
      }

      try {
        const projected = projectBindings(node, data)
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
        const resolvedProps = applyBindingsToProps(node.props, projected, registry.getBinding(node.type))
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

  private isCurrentRequest(request: RenderRequest): boolean {
    return !this._destroyed && this._assembly.host.state === 'active'
      && this._request === request && this._host === request.host
      && this._host?.document === request.document && this._host?.mount === request.mount
      && this._documentGeneration === request.documentGeneration && !request.cancelled
  }

  private assertCurrentRequest(request: RenderRequest): void {
    if (!this.isCurrentRequest(request))
      request.cancel(this._destroyed ? 'destroyed' : this._documentGeneration !== request.documentGeneration ? 'document-changed' : 'superseded')
    request.assertActive()
  }

  private releasePreview(): void {
    if (!this._committed)
      return
    const previous = this._committed
    this._committed = undefined
    this.parkOutput(previous)
    this.releaseOutput(previous)
  }

  private parkOutput(output: ViewerRuntime['_committed']): void {
    const container = output?.container
    if (!output || output.users <= 1 || !container)
      return
    // Keep the actual canvas, listeners, fonts and owned resources in their document.
    // The new preview can replace its mount without detaching an active output.
    container.style.position = 'fixed'
    container.style.left = '-100000px'
    container.style.top = '0'
    output.request.document!.body.appendChild(container)
  }

  private releaseOutput(output: NonNullable<ViewerRuntime['_committed']>): void {
    if (--output.users > 0)
      return
    output.container?.remove()
    this.clearRequestFonts(output.request)
    for (const scope of output.resources)
      this.disposeResources(scope)
    this._outputResources.delete(output.request)
    this._requests.delete(output.request)
  }

  private releaseCandidate(request: RenderRequest): void {
    for (const scope of this._outputResources.get(request) ?? [])
      this.disposeResources(scope)
    this._outputResources.delete(request)
  }

  private releaseComputation(request: RenderRequest): void {
    for (const scope of this._computationResources.get(request) ?? [])
      this.disposeResources(scope)
    this._computationResources.delete(request)
  }

  private disposeResources(scope: RenderResources): void {
    if (this._disposedResources.has(scope))
      return
    this._disposedResources.add(scope)
    const disposal = scope.destroy()
    this._resourceDisposals.add(disposal)
    void disposal.then((result) => {
      this._cleanupErrors.push(...result.errors)
      this._resourceDisposals.delete(disposal)
    })
  }

  private clearRequestFonts(request: RenderRequest): void {
    request.clearFonts()
    for (const cause of request.cleanupErrors.splice(0)) {
      this._cleanupErrors.push({ owner: { pluginId: 'viewer', installationId: 'viewer', contributionId: `render:${request.id}:fonts` }, phase: 'consumer', cause })
    }
  }

  private resolveZoom(schema: DocumentSchema, host?: ViewerHost): number {
    const scale = schema.page.scale
    if (scale == null || scale === 'auto')
      return 1

    if (typeof scale === 'number')
      return scale

    const container = host?.mount
    if (!container)
      return 1

    const pxFactor = 96 / (UNIT_FACTOR[schema.unit] ?? 25.4)
    const pageWidthPx = schema.page.width * pxFactor
    const pageHeightPx = schema.page.height * pxFactor

    if (scale === 'fit-width' && pageWidthPx > 0) {
      return container.clientWidth / pageWidthPx
    }

    if (scale === 'fit-height' && pageHeightPx > 0) {
      return container.clientHeight / pageHeightPx
    }

    return 1
  }

  private applyViewportOffset(container: HTMLElement, schema: DocumentSchema): void {
    const ox = schema.page.offsetX ?? 0
    const oy = schema.page.offsetY ?? 0

    if (ox === 0 && oy === 0) {
      container.style.paddingLeft = ''
      container.style.paddingTop = ''
      return
    }

    const unit = schema.unit
    container.style.paddingLeft = `${ox}${unit}`
    container.style.paddingTop = `${oy}${unit}`
  }

  private emitDiagnostic(event: ViewerDiagnosticEvent, handler = this._diagnosticHandler, current = () => !this._destroyed): void {
    try {
      handler?.(event)
    }
    catch {
      // A notification callback cannot turn an already committed version into a failed candidate.
    }
    this._hooks.diagnosticsEmitted.call(event).catch(() => {
      if (current())
        this.emitDiagnosticHookError(handler)
    })
  }

  private emitTaskDiagnostic(
    event: ViewerDiagnosticEvent,
    onDiagnostic?: (event: ViewerDiagnosticEvent) => void,
    handler = this._diagnosticHandler,
  ): void {
    onDiagnostic?.(event)
    this.emitDiagnostic(event, handler)
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
    handler?: (event: ViewerDiagnosticEvent) => void,
    code = 'EXPORTER_ERROR',
  ): void {
    this.emitTaskDiagnostic({
      category: 'exporter',
      severity: 'error',
      code,
      message: `Exporter "${exporterId}" failed for format "${format || 'default'}": ${err instanceof Error ? err.message : String(err)}`,
      scope: 'exporter',
      cause: serializeCause(err),
    }, onDiagnostic, handler)
  }

  private emitDiagnosticHookError(handler = this._diagnosticHandler): void {
    if (this._emittingHookFailure)
      return
    this._emittingHookFailure = true
    try {
      handler?.({
        category: 'viewer',
        severity: 'warning',
        code: 'DIAGNOSTIC_HOOK_ERROR',
        message: 'diagnosticsEmitted hook failed',
        scope: 'hook',
      })
    }
    catch {
      // Diagnostic delivery is best effort when the receiving callback itself fails.
    }
    finally {
      this._emittingHookFailure = false
    }
  }
}

function toPagePlan(result: PaginationResult): PagePlan {
  return {
    mode: result.mode,
    pages: result.pages.map(page => ({
      index: page.index,
      width: page.width,
      height: page.height,
      elements: page.fragments.map(fragment => fragment.node),
      fragments: [...page.fragments],
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
