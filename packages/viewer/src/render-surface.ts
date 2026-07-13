import type { BrowserDomCapabilities, RenderViewerTreeOptions, ViewerTreeMount, ViewerTreePolicy } from '@easyink/browser-dom'
import type { LayoutConstraints, MaterialFragmentPlan, MaterialLayoutPlan, MaterialNodeLoadState, MaterialRenderBudgetToken, MaterialRenderNodeKind, PageLayerRenderPlan, PageLayerRenderPlanBuckets, PagePlanEntry, TextWatermarkPageLayerPlan, ViewerRenderTree } from '@easyink/core'
import type { MaterialNode, PageBackground, PageSchema } from '@easyink/schema'
import type { JsonValue, UnitType } from '@easyink/shared'
import type { CommittedPagePlan, RuntimeMaterialInstancePlan } from './layout-runtime'
import type { ProfileMaterialRuntime } from './material-runtime'
import type { ViewerDiagnosticEvent, ViewerRenderContext, ViewerRenderSize } from './types'
import { createBrowserDomCapabilities, createBrowserDomFallbackCapabilities, createBrowserDomHostMount, renderViewerTree, snapshotViewerTreePolicy } from '@easyink/browser-dom'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans, freezeMaterialFragmentPlan, freezeMaterialLayoutPlan, groupPageLayerPlansByPlacement, inspectMaterialNode, PAGE_CONTENT_LAYER_STACK_INDEX, resolvePageLayerPlans, resolvePageLayerStackIndex, VIEWER_TREE_ABSOLUTE_MAX_NODES, viewerElement, viewerFragment, viewerText } from '@easyink/core'
import { cloneJsonValue, deepFreezeJsonValue, UNIT_FACTOR } from '@easyink/shared'
import { PageDomVirtualizer } from './page-dom-virtualizer'
import { safeSummarizeThrown } from './safe-thrown'

const deniedRenderCapabilities: ViewerRenderContext['capabilities'] = Object.freeze({
  sanitizeMarkup() {
    throw new Error('VIEWER_SANITIZED_MARKUP_NOT_DECLARED')
  },
})

export interface RenderSurfaceOptions {
  container: HTMLElement
  document: Document
  zoom: number
  unit: string
  data: Record<string, unknown>
  resolvedPropsMap: Map<string, Record<string, unknown>>
  pageSchema: PageSchema
  nodeStates?: ReadonlyMap<string, MaterialNodeLoadState>
  browserDom?: {
    policy?: ViewerTreePolicy
    imperativeDom?: Iterable<string>
    maxNodes: number
  }
}

interface CommittedRenderSurfaceOptions {
  readonly document: Document
  readonly zoom: number
  readonly unit: string
  readonly data: Readonly<Record<string, unknown>>
  readonly pageSchema: PageSchema
  readonly nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  readonly browserDom?: {
    readonly policy?: ViewerTreePolicy
    readonly imperativeDom: readonly string[]
    readonly maxNodes: number
  }
}

export interface PageDOM {
  pageIndex: number
  element: HTMLElement
  dispose: (onError?: (error: unknown) => void) => void
}

export interface MountMaterialTreeOptions extends RenderViewerTreeOptions {
  readonly capabilities?: BrowserDomCapabilities
}

export type RenderSurfaceDisposer = (() => void) | Readonly<{ dispose: () => void }>
export type RenderSurfaceBuildResult = void | RenderSurfaceDisposer | readonly RenderSurfaceDisposer[]

export interface RenderSurfaceTransaction {
  readonly signal: AbortSignal
  readonly register: (disposer: RenderSurfaceDisposer) => void
  readonly checkpoint: () => void
}

export interface AtomicRenderSurfaceOptions {
  readonly onDiagnostic?: (diagnostic: ViewerDiagnosticEvent) => void
}

export type RenderSurfaceBuild = (
  root: HTMLElement,
  transaction: RenderSurfaceTransaction,
) => RenderSurfaceBuildResult | Promise<RenderSurfaceBuildResult>

export function mountMaterialTree(
  host: HTMLElement,
  tree: ViewerRenderTree,
  options: MountMaterialTreeOptions = {},
): ViewerTreeMount {
  const document = options.document ?? host.ownerDocument
  const capabilities = options.capabilities ?? createBrowserDomCapabilities({
    document,
    policy: options.policy,
    maxNodes: options.maxNodes,
  })
  try {
    const mount = renderViewerTree(host, tree, { ...options, document, capabilities })
    let disposed = false
    return Object.freeze({
      nodes: mount.nodes,
      dispose() {
        if (disposed)
          return
        disposed = true
        try {
          mount.dispose()
        }
        finally {
          capabilities.dispose()
        }
      },
    })
  }
  catch (error) {
    capabilities.dispose()
    throw error
  }
}

export class RenderSurface {
  readonly host: HTMLElement
  private readonly onDiagnostic?: AtomicRenderSurfaceOptions['onDiagnostic']
  private generation = 0
  private disposed = false
  private currentRoot?: HTMLElement
  private currentDisposers: RenderSurfaceDisposer[] = []

  constructor(host: HTMLElement, options: AtomicRenderSurfaceOptions = {}) {
    this.host = host
    this.onDiagnostic = options.onDiagnostic
  }

  async commitAtomically(build: RenderSurfaceBuild, signal: AbortSignal): Promise<HTMLElement> {
    if (this.disposed)
      throw new Error('RENDER_SURFACE_DISPOSED')
    const generation = ++this.generation
    const root = this.host.ownerDocument.createElement('div')
    root.setAttribute('data-render-surface-root', '')
    const disposers: RenderSurfaceDisposer[] = []
    const registered = new Set<RenderSurfaceDisposer>()
    let acceptingDisposers = true
    const checkpoint = (): void => {
      if (signal.aborted)
        throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
      if (this.disposed)
        throw new Error('RENDER_SURFACE_DISPOSED')
      if (generation !== this.generation)
        throw new Error('RENDER_SURFACE_COMMIT_SUPERSEDED')
    }
    const register = (disposer: RenderSurfaceDisposer): void => {
      if (!isRenderSurfaceDisposer(disposer))
        throw new TypeError('RENDER_SURFACE_DISPOSER_INVALID')
      if (!acceptingDisposers)
        throw new Error('RENDER_SURFACE_COMMIT_CLOSED')
      if (!registered.has(disposer)) {
        registered.add(disposer)
        disposers.push(disposer)
      }
      checkpoint()
    }
    const transaction: RenderSurfaceTransaction = Object.freeze({ signal, register, checkpoint })

    try {
      checkpoint()
      registerBuildResult(await build(root, transaction), registered, disposers)
      checkpoint()
    }
    catch (error) {
      acceptingDisposers = false
      root.remove()
      const cleanupErrors = disposeRenderSurfaceDisposers(disposers)
      if (cleanupErrors.length > 0)
        throw new AggregateError([error, ...cleanupErrors], 'RENDER_SURFACE_COMMIT_FAILED')
      throw error
    }

    acceptingDisposers = false
    const oldRoot = this.currentRoot
    const oldDisposers = this.currentDisposers
    try {
      this.host.replaceChildren(root)
    }
    catch (error) {
      root.remove()
      const cleanupErrors = disposeRenderSurfaceDisposers(disposers)
      if (cleanupErrors.length > 0)
        throw new AggregateError([error, ...cleanupErrors], 'RENDER_SURFACE_COMMIT_FAILED')
      throw error
    }
    this.currentRoot = root
    this.currentDisposers = disposers
    oldRoot?.remove()
    const cleanupErrors = disposeRenderSurfaceDisposers(oldDisposers)
    for (const error of cleanupErrors)
      this.reportCleanupError(error)
    return root
  }

  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    this.generation++
    const root = this.currentRoot
    const disposers = this.currentDisposers
    this.currentRoot = undefined
    this.currentDisposers = []
    root?.remove()
    const errors = disposeRenderSurfaceDisposers(disposers)
    if (errors.length > 0)
      throw new AggregateError(errors, 'RENDER_SURFACE_DISPOSE_FAILED')
  }

  private reportCleanupError(error: unknown): void {
    const thrown = safeSummarizeThrown(error)
    try {
      this.onDiagnostic?.(Object.freeze({
        category: 'viewer',
        severity: 'warning',
        code: 'MATERIAL_DISPOSE_ERROR',
        message: thrown.message,
        scope: 'material',
        cause: thrown.cause,
      }))
    }
    catch {
      // A diagnostic observer cannot invalidate an already committed root.
    }
  }
}

export interface MountCommittedMaterialOptions {
  readonly committedPlan: Pick<CommittedPagePlan, 'runtimeInstances'>
  readonly fragmentPlan: MaterialFragmentPlan
  readonly materials: ProfileMaterialRuntime
  readonly pageIndex: number
  readonly unit: string
  readonly zoom: number
  readonly viewerMaxNodes?: number
  readonly browserDom?: {
    readonly policy?: ViewerTreePolicy
    readonly imperativeDom?: Iterable<string>
    readonly maxNodes?: number
  }
  readonly diagnostics: ViewerDiagnosticEvent[]
}

interface CommittedMaterialRenderState {
  readonly input: MountCommittedMaterialOptions
  readonly maxNodes: number
  readonly renderBudget: CommittedRenderBudgetController
  readonly hostImperativeDom: ReadonlySet<string>
  readonly declaredSlotKeys: WeakMap<RuntimeMaterialInstancePlan, ReadonlySet<string>>
}

interface CommittedRenderBudgetController {
  readonly token: MaterialRenderBudgetToken
  readonly snapshot: () => number
  readonly restore: (snapshot: number) => void
}

export function mountCommittedMaterial(
  host: HTMLElement,
  input: MountCommittedMaterialOptions,
): ViewerTreeMount {
  const maxNodes = resolveCommittedNodeLimit(input.viewerMaxNodes, input.browserDom?.maxNodes)
  const state: CommittedMaterialRenderState = Object.freeze({
    input,
    maxNodes,
    renderBudget: createCommittedRenderBudget(maxNodes),
    hostImperativeDom: new Set(input.browserDom?.imperativeDom ?? []),
    declaredSlotKeys: new WeakMap<RuntimeMaterialInstancePlan, ReadonlySet<string>>(),
  })
  return mountCommittedInstance(
    host,
    input.fragmentPlan.sourceInstanceKey,
    input.fragmentPlan,
    state,
    new Set(),
  )
}

function mountCommittedInstance(
  host: HTMLElement,
  instanceKey: string,
  fragmentPlan: MaterialFragmentPlan,
  state: CommittedMaterialRenderState,
  ancestors: ReadonlySet<string>,
): ViewerTreeMount {
  const { input } = state
  const instance = input.committedPlan.runtimeInstances.get(instanceKey)
  if (!instance || !hasCommittedIdentity(instanceKey, instance, fragmentPlan)) {
    reportCommittedDiagnostic(state, {
      code: 'VIEWER_MATERIAL_INSTANCE_IDENTITY_MISMATCH',
      message: `Committed material instance "${instanceKey}" is unavailable`,
      nodeId: instance?.nodeId ?? fragmentPlan.sourceNodeId,
    })
    return mountCommittedSentinel(host, state, '[material unavailable]')
  }
  if (instance.status === 'quarantined') {
    reportCommittedDiagnostic(state, {
      code: 'VIEWER_MATERIAL_INSTANCE_QUARANTINED',
      message: `Committed material instance "${instanceKey}" is quarantined`,
      nodeId: instance.nodeId,
      detail: instance.diagnostic,
    })
    return mountCommittedSentinel(host, state, '[material quarantined]')
  }
  if (ancestors.has(instanceKey)) {
    reportCommittedDiagnostic(state, {
      code: 'VIEWER_SLOT_INSTANCE_CYCLE',
      message: `Committed slot cycle reached instance "${instanceKey}"`,
      nodeId: instance.nodeId,
    })
    return mountCommittedSentinel(host, state, '[slot unavailable]')
  }

  const facetCapabilities = input.materials.getCapabilities(instance.node.type)
  const budgetSnapshot = state.renderBudget.snapshot()
  const capabilities = createNodeCapabilities(
    host.ownerDocument,
    facetCapabilities,
    state.hostImperativeDom,
    input.browserDom?.policy,
    state.maxNodes,
  )
  const nextAncestors = new Set(ancestors)
  nextAncestors.add(instanceKey)
  const context: ViewerRenderContext = Object.freeze({
    data: instance.scopeData,
    resolvedModel: instance.resolvedModel,
    instanceKey: instance.instanceKey,
    layoutPlan: instance.layoutPlan,
    fragmentPlan,
    renderSlot: (slotInstanceKey: string) => renderCommittedSlot(
      instance,
      slotInstanceKey,
      capabilities,
      state,
      nextAncestors,
    ),
    renderBudget: state.renderBudget.token,
    pageIndex: input.pageIndex,
    unit: input.unit,
    zoom: input.zoom,
    capabilities: facetCapabilities?.sanitizedMarkup ? capabilities : deniedRenderCapabilities,
    reportDiagnostic: (diagnostic: Parameters<NonNullable<ViewerRenderContext['reportDiagnostic']>>[0]) => input.diagnostics.push({
      category: 'datasource',
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      nodeId: diagnostic.nodeId,
      scope: 'datasource',
      cause: diagnostic.cause,
    }),
  })

  let tree: ViewerRenderTree
  try {
    tree = input.materials.render(instance.node as MaterialNode<unknown>, context, true).tree
  }
  catch (error) {
    capabilities.dispose()
    state.renderBudget.restore(budgetSnapshot)
    reportCommittedFailure(state, 'VIEWER_MATERIAL_RENDER_ERROR', instance, error)
    return mountCommittedSentinel(host, state, '[material unavailable]')
  }

  try {
    return mountMaterialTree(host, tree, {
      document: host.ownerDocument,
      policy: input.browserDom?.policy,
      capabilities,
      maxNodes: state.maxNodes,
    })
  }
  catch (error) {
    state.renderBudget.restore(budgetSnapshot)
    reportCommittedFailure(state, 'VIEWER_MATERIAL_MOUNT_ERROR', instance, error)
    return mountCommittedSentinel(host, state, '[material unavailable]')
  }
}

function renderCommittedSlot(
  owner: RuntimeMaterialInstancePlan,
  slotInstanceKey: string,
  ownerCapabilities: BrowserDomCapabilities,
  state: CommittedMaterialRenderState,
  ancestors: ReadonlySet<string>,
): ViewerRenderTree {
  const declared = getDeclaredSlotKeys(owner, state).has(slotInstanceKey)
  const mapped = Object.hasOwn(owner.slotChildren, slotInstanceKey)
  if (!declared || !mapped) {
    reportSlotMissing(state, owner, slotInstanceKey)
    state.renderBudget.token.reserveNodes('fragment', 1)
    state.renderBudget.token.reserveNodes('text', 1)
    return viewerFragment([viewerText('[slot unavailable]')])
  }

  state.renderBudget.token.reserveNodes('fragment', 1)
  const trees: ViewerRenderTree[] = []
  for (const childInstanceKey of owner.slotChildren[slotInstanceKey]!) {
    const child = state.input.committedPlan.runtimeInstances.get(childInstanceKey)
    if (ancestors.has(childInstanceKey)) {
      reportCommittedDiagnostic(state, {
        code: 'VIEWER_SLOT_INSTANCE_CYCLE',
        message: `Committed slot "${slotInstanceKey}" cycles to instance "${childInstanceKey}"`,
        nodeId: owner.nodeId,
        detail: { slotInstanceKey, childInstanceKey },
      })
      state.renderBudget.token.reserveNodes('text', 1)
      trees.push(viewerText('[slot unavailable]'))
      continue
    }
    if (!child || !child.embeddedFragmentPlan || !hasCommittedIdentity(childInstanceKey, child, child.embeddedFragmentPlan)) {
      reportSlotMissing(state, owner, slotInstanceKey, childInstanceKey)
      state.renderBudget.token.reserveNodes('text', 1)
      trees.push(viewerText('[slot unavailable]'))
      continue
    }
    state.renderBudget.token.reserveNodes('imperative', 1)
    trees.push(createBrowserDomHostMount(ownerCapabilities, childHost => mountCommittedInstance(
      childHost,
      childInstanceKey,
      child.embeddedFragmentPlan!,
      state,
      ancestors,
    )))
  }
  return viewerFragment(trees)
}

function getDeclaredSlotKeys(
  owner: RuntimeMaterialInstancePlan,
  state: CommittedMaterialRenderState,
): ReadonlySet<string> {
  const cached = state.declaredSlotKeys.get(owner)
  if (cached)
    return cached
  const keys = new Set<string>()
  for (const slot of owner.layoutPlan.slotBoxes)
    keys.add(slot.slotInstanceKey)
  state.declaredSlotKeys.set(owner, keys)
  return keys
}

function mountCommittedSentinel(
  host: HTMLElement,
  state: CommittedMaterialRenderState,
  message: string,
): ViewerTreeMount {
  const tree = viewerText(message)
  state.renderBudget.token.reserveNodes('text', 1)
  const capabilities = createBrowserDomFallbackCapabilities({
    document: host.ownerDocument,
    policy: state.input.browserDom?.policy,
    maxNodes: state.maxNodes,
  }, tree)
  return mountMaterialTree(host, tree, {
    document: host.ownerDocument,
    capabilities,
    maxNodes: state.maxNodes,
  })
}

function hasCommittedIdentity(
  instanceKey: string,
  instance: RuntimeMaterialInstancePlan,
  fragmentPlan: MaterialFragmentPlan,
): boolean {
  return instance.instanceKey === instanceKey
    && instance.nodeId === instance.node.id
    && instance.layoutPlan.instanceKey === instanceKey
    && instance.layoutPlan.nodeId === instance.nodeId
    && fragmentPlan.sourceInstanceKey === instanceKey
    && fragmentPlan.sourceNodeId === instance.nodeId
}

function resolveCommittedNodeLimit(viewerLimit?: number, browserLimit?: number): number {
  for (const limit of [viewerLimit, browserLimit]) {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))
      throw new Error('VIEWER_COMMITTED_RENDER_BUDGET_INVALID')
  }
  return Math.min(
    viewerLimit ?? VIEWER_TREE_ABSOLUTE_MAX_NODES,
    browserLimit ?? VIEWER_TREE_ABSOLUTE_MAX_NODES,
    VIEWER_TREE_ABSOLUTE_MAX_NODES,
  )
}

function createCommittedRenderBudget(maxNodes: number): CommittedRenderBudgetController {
  let nodesUsed = 0
  const token: MaterialRenderBudgetToken = Object.freeze({
    maxNodes,
    get nodesUsed() {
      return nodesUsed
    },
    reserveNodes(kind: MaterialRenderNodeKind, count: number): void {
      if (!['element', 'text', 'fragment', 'markup', 'imperative'].includes(kind))
        throw new Error('VIEWER_RENDER_NODE_KIND_INVALID')
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error('VIEWER_RENDER_BUDGET_RESERVATION_INVALID')
      if (count > maxNodes - nodesUsed)
        throw new Error('VIEWER_RENDER_BUDGET_EXCEEDED')
      nodesUsed += count
    },
  })
  return Object.freeze({
    token,
    snapshot: () => nodesUsed,
    restore(snapshot: number): void {
      if (!Number.isSafeInteger(snapshot) || snapshot < 0 || snapshot > nodesUsed)
        throw new Error('VIEWER_RENDER_BUDGET_SNAPSHOT_INVALID')
      nodesUsed = snapshot
    },
  })
}

function reportSlotMissing(
  state: CommittedMaterialRenderState,
  owner: RuntimeMaterialInstancePlan,
  slotInstanceKey: string,
  childInstanceKey?: string,
): void {
  reportCommittedDiagnostic(state, {
    code: 'VIEWER_SLOT_INSTANCE_MISSING',
    message: childInstanceKey
      ? `Committed child "${childInstanceKey}" is unavailable for slot "${slotInstanceKey}"`
      : `Committed slot "${slotInstanceKey}" is unavailable`,
    nodeId: owner.nodeId,
    detail: { slotInstanceKey, ...(childInstanceKey ? { childInstanceKey } : {}) },
  })
}

function reportCommittedFailure(
  state: CommittedMaterialRenderState,
  code: string,
  instance: RuntimeMaterialInstancePlan,
  error: unknown,
): void {
  const thrown = safeSummarizeThrown(error)
  reportCommittedDiagnostic(state, {
    code,
    message: `${code} for node "${instance.nodeId}": ${thrown.message}`,
    nodeId: instance.nodeId,
    cause: thrown.cause,
  })
}

function reportCommittedDiagnostic(
  state: CommittedMaterialRenderState,
  diagnostic: Pick<ViewerDiagnosticEvent, 'code' | 'message'> & Partial<ViewerDiagnosticEvent>,
): void {
  state.input.diagnostics.push({
    category: 'viewer',
    severity: 'error',
    scope: 'material',
    ...diagnostic,
  })
}

function registerBuildResult(
  result: RenderSurfaceBuildResult,
  registered: Set<RenderSurfaceDisposer>,
  disposers: RenderSurfaceDisposer[],
): void {
  if (result === undefined)
    return
  const candidates = Array.isArray(result) ? result : [result as RenderSurfaceDisposer]
  let firstError: unknown
  for (const candidate of candidates) {
    try {
      if (!isRenderSurfaceDisposer(candidate)) {
        firstError ??= new TypeError('RENDER_SURFACE_DISPOSER_INVALID')
        continue
      }
      if (!registered.has(candidate)) {
        registered.add(candidate)
        disposers.push(candidate)
      }
    }
    catch (error) {
      firstError ??= error
    }
  }
  if (firstError)
    throw firstError
}

function isRenderSurfaceDisposer(value: unknown): value is RenderSurfaceDisposer {
  return typeof value === 'function'
    || (typeof value === 'object' && value !== null && typeof (value as { dispose?: unknown }).dispose === 'function')
}

function disposeRenderSurfaceDisposers(disposers: readonly RenderSurfaceDisposer[]): unknown[] {
  const errors: unknown[] = []
  for (let index = disposers.length - 1; index >= 0; index--) {
    try {
      const disposer = disposers[index]!
      if (typeof disposer === 'function')
        disposer()
      else
        disposer.dispose()
    }
    catch (error) {
      errors.push(error)
    }
  }
  return errors
}

/**
 * Render all pages into the container element.
 * Each page becomes a positioned div with child element wrappers inside.
 * All positioning uses CSS physical units (mm/pt/in) directly.
 * Zoom is applied via transform: scale() on each page element.
 */
export function renderPages(
  pages: PagePlanEntry[],
  materials: ProfileMaterialRuntime,
  options: RenderSurfaceOptions,
  diagnostics: ViewerDiagnosticEvent[],
  virtualizer?: PageDomVirtualizer,
): PageDOM[] {
  const { container } = options
  const committedPages = pages.map(snapshotPageEntry)
  const relevantNodeIds = collectRelevantNodeIds(committedPages)
  const committedResolvedProps = snapshotResolvedProps(relevantNodeIds, options.resolvedPropsMap)
  const committedOptions = snapshotRenderSurfaceOptions(options, relevantNodeIds)
  const { document, zoom, unit, browserDom } = committedOptions

  const pageDOMs: PageDOM[] = []
  const candidateFragment = document.createDocumentFragment()
  const pageLayerBucketsBySize = new Map<string, PageLayerRenderPlanBuckets>()
  const hostImperativeDom = new Set(browserDom?.imperativeDom ?? [])
  const pageVirtualizer = virtualizer ?? new PageDomVirtualizer({ createIntersectionObserver: null })
  const ownsVirtualizer = virtualizer === undefined
  const pageIndices = new Set<number>()
  const previousChildren = Object.freeze([...container.childNodes])
  let remainingPages = 0
  let swapStarted = false

  try {
    for (const page of committedPages) {
      if (pageIndices.has(page.index))
        throw new Error('PAGE_DOM_PAGE_INDEX_DUPLICATE')
      pageIndices.add(page.index)
      const stableWrapper = createVirtualPageWrapper(document, page)
      pageVirtualizer.register({
        index: page.index,
        widthPx: page.width * getPxFactorForLayout(unit) * zoom,
        heightPx: page.height * getPxFactorForLayout(unit) * zoom,
        wrapper: stableWrapper,
        mount: () => mountLegacyPage({
          page,
          stableWrapper,
          materials,
          options: committedOptions,
          resolvedPropsMap: committedResolvedProps,
          diagnostics,
          hostImperativeDom,
          pageLayerBucketsBySize,
        }),
      })
      remainingPages++
      let released = false
      pageDOMs.push({
        pageIndex: page.index,
        element: stableWrapper,
        dispose: (onError) => {
          if (released)
            return
          released = true
          const errors: unknown[] = []
          try {
            pageVirtualizer.unregister(page.index)
          }
          catch (error) {
            errors.push(error)
          }
          try {
            stableWrapper.remove()
          }
          catch (error) {
            errors.push(error)
          }
          remainingPages--
          if (ownsVirtualizer && remainingPages === 0) {
            try {
              pageVirtualizer.dispose()
            }
            catch (error) {
              errors.push(error)
            }
          }
          if (onError) {
            for (const error of errors)
              onError(error)
          }
          else if (errors.length > 0) {
            throw new AggregateError(errors, 'PAGE_DOM_PAGE_DISPOSE_FAILED')
          }
        },
      })
      candidateFragment.appendChild(stableWrapper)
    }
    if (ownsVirtualizer && remainingPages === 0)
      pageVirtualizer.dispose()
    swapStarted = true
    container.replaceChildren(candidateFragment)
  }
  catch (error) {
    const cleanupErrors: unknown[] = []
    for (let index = pageDOMs.length - 1; index >= 0; index--)
      pageDOMs[index]!.dispose(cleanupError => cleanupErrors.push(cleanupError))
    const restoreErrors: unknown[] = []
    if (swapStarted) {
      try {
        container.replaceChildren(...previousChildren)
      }
      catch (restoreError) {
        restoreErrors.push(restoreError)
      }
    }
    if (cleanupErrors.length > 0 || restoreErrors.length > 0)
      throw new AggregateError([error, ...cleanupErrors, ...restoreErrors], 'PAGE_DOM_RENDER_FAILED')
    throw error
  }

  return pageDOMs
}

interface LegacyPageMountInput {
  readonly page: PagePlanEntry
  readonly stableWrapper: HTMLElement
  readonly materials: ProfileMaterialRuntime
  readonly options: CommittedRenderSurfaceOptions
  readonly resolvedPropsMap: ReadonlyMap<string, Record<string, unknown>>
  readonly diagnostics: ViewerDiagnosticEvent[]
  readonly hostImperativeDom: ReadonlySet<string>
  readonly pageLayerBucketsBySize: Map<string, PageLayerRenderPlanBuckets>
}

function mountLegacyPage(input: LegacyPageMountInput): () => void {
  const { page, stableWrapper, materials, options, resolvedPropsMap, diagnostics, hostImperativeDom, pageLayerBucketsBySize } = input
  const { document, zoom, unit, data, pageSchema, nodeStates, browserDom } = options
  const { wrapper, pageEl } = createPageElement(document, page, pageSchema, unit, zoom)
  wrapper.style.margin = '0'
  const contentLayer = createContentLayer(document)
  const pageLayerBuckets = resolveCachedPageLayerBuckets(pageLayerBucketsBySize, pageSchema, page)
  const mounts: ViewerTreeMount[] = []
  try {
    appendPageLayers(document, pageEl, pageLayerBuckets.underContent, page, unit, diagnostics)
    pageEl.appendChild(contentLayer)
    const sorted = page.elements.map(node => ({
      node,
      fragment: page.fragments?.find(candidate => candidate.node === node || candidate.node.id === node.id),
    })).sort((a, b) => (a.node.zIndex ?? 0) - (b.node.zIndex ?? 0))

    for (const { node, fragment } of sorted) {
      if (node.editorState?.hidden)
        continue
      const resolved = resolvedPropsMap.get(node.id) ?? node.model as Record<string, unknown>
      const nodeForRender: MaterialNode<unknown> = { ...node, model: resolved }
      let capabilities: BrowserDomCapabilities | undefined
      try {
        const facetCapabilities = materials.getCapabilities(node.type)
        capabilities = createNodeCapabilities(document, facetCapabilities, hostImperativeDom, browserDom?.policy, browserDom?.maxNodes)
        const context = createLegacyRenderContext({
          node: nodeForRender,
          resolvedModel: resolved,
          instanceKey: fragment?.layoutPlan.instanceKey ?? node.id,
          layoutPlan: fragment?.layoutPlan,
          fragmentPlan: fragment?.fragmentPlan,
          fragmentBox: {
            x: node.x,
            y: node.y - page.yOffset,
            width: node.width,
            height: node.height,
          },
          pageIndex: page.index,
          unit,
          zoom,
          data,
          capabilities: facetCapabilities?.sanitizedMarkup ? capabilities : deniedRenderCapabilities,
          maxNodes: browserDom?.maxNodes,
          reportDiagnostic: diagnostic => diagnostics.push({
            category: 'datasource',
            severity: diagnostic.severity,
            code: diagnostic.code,
            message: diagnostic.message,
            nodeId: diagnostic.nodeId,
            scope: 'datasource',
            cause: diagnostic.cause,
          }),
        })
        const admitted = isNodeAdmitted(node, nodeStates)
        if (!admitted) {
          const sourceNodeId = readVirtualSourceNodeId(node)
          if (sourceNodeId) {
            diagnostics.push({
              category: 'viewer',
              severity: 'error',
              code: 'MATERIAL_REPEAT_QUARANTINED',
              message: `Repeated node "${sourceNodeId}" is quarantined on virtual node "${node.id}"`,
              nodeId: node.id,
              detail: { sourceNodeId, virtualNodeId: node.id },
              scope: 'material',
            })
          }
        }
        context.slotOutputs = admitted
          ? createSlotMountOutputs(nodeForRender, materials, context, capabilities, nodeStates, resolvedPropsMap, hostImperativeDom, browserDom, diagnostics)
          : undefined
        const renderContext: ViewerRenderContext = Object.freeze(context)
        const output = materials.render(nodeForRender, renderContext, admitted)
        const renderSize = admitted ? materials.getRenderSize(nodeForRender, renderContext) : { width: node.width, height: node.height }
        const elWrapper = createElementWrapper(document, nodeForRender, page, unit, renderSize, fragment?.fragmentPlan)
        const mount = renderViewerTree(elWrapper, output.tree, {
          document,
          capabilities,
          maxNodes: browserDom?.maxNodes,
        })
        mounts.push(withCapabilityDisposal(mount, capabilities))
        contentLayer.appendChild(elWrapper)
      }
      catch (error) {
        capabilities?.dispose()
        diagnostics.push(materialRenderDiagnostic(node, error))
        const fallbackWrapper = createElementWrapper(document, nodeForRender, page, unit, { width: node.width, height: node.height }, fragment?.fragmentPlan)
        fallbackWrapper.setAttribute('data-render-error', 'true')
        mounts.push(renderMaterialFallback(fallbackWrapper, node, browserDom, diagnostics))
        contentLayer.appendChild(fallbackWrapper)
      }
    }

    appendPageLayers(document, pageEl, pageLayerBuckets.overContent, page, unit, diagnostics)
    appendPageLayers(document, pageEl, pageLayerBuckets.top, page, unit, diagnostics)
    stableWrapper.appendChild(wrapper)
  }
  catch (error) {
    disposeMounts(mounts, () => {})
    wrapper.remove()
    throw error
  }

  let disposed = false
  return () => {
    if (disposed)
      return
    disposed = true
    const errors: unknown[] = []
    disposeMounts(mounts, error => errors.push(error))
    try {
      wrapper.remove()
    }
    catch (error) {
      errors.push(error)
    }
    if (errors.length > 0)
      throw new AggregateError(errors, 'PAGE_DOM_MOUNTS_DISPOSE_FAILED')
  }
}

function createVirtualPageWrapper(
  document: Document,
  page: Pick<PagePlanEntry, 'index'>,
): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'ei-viewer-page-slot'
  wrapper.setAttribute('data-page-slot-index', String(page.index))
  wrapper.style.margin = '0 auto 16px auto'
  wrapper.style.boxSizing = 'border-box'
  wrapper.style.position = 'relative'
  return wrapper
}

function snapshotPageEntry(page: PagePlanEntry): PagePlanEntry {
  if (!page || typeof page !== 'object')
    throw new TypeError('PAGE_DOM_PAGE_INVALID')
  const { index, width, height, yOffset, copyIndex, isBlank, elements: sourceElements, fragments: sourceFragments } = page
  if (!Number.isSafeInteger(index) || index < 0)
    throw new RangeError('PAGE_DOM_PAGE_INDEX_INVALID')
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(height) || height < 0)
    throw new RangeError('PAGE_DOM_DIMENSION_INVALID')
  if (!Number.isFinite(yOffset))
    throw new RangeError('PAGE_DOM_Y_OFFSET_INVALID')
  if (copyIndex !== undefined && (!Number.isSafeInteger(copyIndex) || copyIndex < 0))
    throw new RangeError('PAGE_DOM_COPY_INDEX_INVALID')
  if (isBlank !== undefined && typeof isBlank !== 'boolean')
    throw new TypeError('PAGE_DOM_IS_BLANK_INVALID')
  if (!Array.isArray(sourceElements))
    throw new TypeError('PAGE_DOM_ELEMENTS_INVALID')
  if (sourceFragments !== undefined && !Array.isArray(sourceFragments))
    throw new TypeError('PAGE_DOM_FRAGMENTS_INVALID')
  const nodesByReference = new WeakMap<MaterialNode<unknown>, MaterialNode<unknown>>()
  const nodesById = new Map<string, MaterialNode<unknown>>()
  const layoutsByReference = new WeakMap<MaterialLayoutPlan, MaterialLayoutPlan>()
  const fragmentsByReference = new WeakMap<MaterialFragmentPlan, MaterialFragmentPlan>()
  const snapshotNode = (node: MaterialNode<unknown>): MaterialNode<unknown> => {
    const existing = nodesByReference.get(node) ?? nodesById.get(node.id)
    if (existing) {
      nodesByReference.set(node, existing)
      return existing
    }
    const cloned = deepFreezeJsonValue(cloneJsonValue(node as unknown as JsonValue)) as unknown as MaterialNode<unknown>
    nodesByReference.set(node, cloned)
    nodesById.set(node.id, cloned)
    return cloned
  }
  const snapshotLayout = (plan: MaterialLayoutPlan): MaterialLayoutPlan => {
    const existing = layoutsByReference.get(plan)
    if (existing)
      return existing
    const frozen = freezeMaterialLayoutPlan(plan)
    layoutsByReference.set(plan, frozen)
    return frozen
  }
  const snapshotFragment = (plan: MaterialFragmentPlan): MaterialFragmentPlan => {
    const existing = fragmentsByReference.get(plan)
    if (existing)
      return existing
    const frozen = freezeMaterialFragmentPlan(plan)
    fragmentsByReference.set(plan, frozen)
    return frozen
  }
  const elements = Object.freeze(sourceElements.map(snapshotNode))
  const fragments = sourceFragments === undefined
    ? undefined
    : Object.freeze(sourceFragments.map(fragment => Object.freeze({
        node: snapshotNode(fragment.node),
        layoutPlan: snapshotLayout(fragment.layoutPlan),
        fragmentPlan: snapshotFragment(fragment.fragmentPlan),
      })))
  return Object.freeze({
    index,
    width,
    height,
    elements,
    ...(fragments === undefined ? {} : { fragments }),
    ...(isBlank === undefined ? {} : { isBlank }),
    ...(copyIndex === undefined ? {} : { copyIndex }),
    yOffset,
  }) as PagePlanEntry
}

function snapshotResolvedProps(
  relevantNodeIds: ReadonlySet<string>,
  source: ReadonlyMap<string, Record<string, unknown>>,
): ReadonlyMap<string, Record<string, unknown>> {
  const snapshot = new Map<string, Record<string, unknown>>()
  for (const nodeId of relevantNodeIds) {
    if (!source.has(nodeId))
      continue
    const cloned = deepFreezeJsonValue(cloneJsonValue(source.get(nodeId) as unknown as JsonValue))
    if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned))
      throw new TypeError('PAGE_DOM_RESOLVED_PROPS_INVALID')
    snapshot.set(nodeId, cloned as Record<string, unknown>)
  }
  return snapshot
}

function collectRelevantNodeIds(pages: readonly PagePlanEntry[]): ReadonlySet<string> {
  const relevantNodeIds = new Set<string>()
  const visit = (node: MaterialNode<unknown>): void => {
    if (relevantNodeIds.has(node.id))
      return
    relevantNodeIds.add(node.id)
    for (const children of Object.values(node.slots)) {
      for (const child of children)
        visit(child)
    }
  }
  for (const page of pages) {
    for (const node of page.elements)
      visit(node)
    for (const fragment of page.fragments ?? [])
      visit(fragment.node)
  }
  return relevantNodeIds
}

function snapshotRenderSurfaceOptions(
  options: RenderSurfaceOptions,
  relevantNodeIds: ReadonlySet<string>,
): CommittedRenderSurfaceOptions {
  if (!Number.isFinite(options.zoom) || options.zoom <= 0)
    throw new RangeError('PAGE_DOM_ZOOM_INVALID')
  resolveLayoutUnit(options.unit)
  const data = cloneAndFreezeRecord(options.data, 'PAGE_DOM_DATA_INVALID')
  const pageSchema = snapshotPageSchema(options.pageSchema)
  const nodeStates = new Map<string, MaterialNodeLoadState>()
  for (const nodeId of relevantNodeIds) {
    const state = options.nodeStates?.get(nodeId)
    if (!state)
      continue
    nodeStates.set(
      nodeId,
      deepFreezeJsonValue(cloneJsonValue(state as unknown as JsonValue)) as unknown as MaterialNodeLoadState,
    )
  }
  const browserDom = options.browserDom === undefined
    ? undefined
    : snapshotBrowserDomOptions(options.browserDom)
  return Object.freeze({
    document: options.document,
    zoom: options.zoom,
    unit: options.unit,
    data,
    pageSchema,
    nodeStates,
    ...(browserDom ? { browserDom } : {}),
  })
}

function snapshotPageSchema(source: PageSchema): PageSchema {
  const candidate: Record<string, unknown> = definedProperties({
    mode: source.mode,
    width: source.width,
    height: source.height,
    pages: source.pages,
    scale: source.scale,
    radius: source.radius,
    offsetX: source.offsetX,
    offsetY: source.offsetY,
    copies: source.copies,
    blankPolicy: source.blankPolicy,
    font: source.font,
  })
  if (source.grid !== undefined)
    candidate.grid = definedProperties({ ...source.grid })
  if (source.background !== undefined)
    candidate.background = definedProperties({ ...source.background })
  if (source.layers !== undefined)
    candidate.layers = source.layers.map(layer => definedProperties({ ...layer }))
  if (source.print !== undefined)
    candidate.print = definedProperties({ ...source.print })
  if (source.pageModel !== undefined) {
    candidate.pageModel = {
      kind: source.pageModel.kind,
      paper: definedProperties({ ...source.pageModel.paper }),
    }
  }
  if (source.layout !== undefined)
    candidate.layout = definedProperties({ ...source.layout })
  if (source.pagination !== undefined)
    candidate.pagination = definedProperties({ ...source.pagination })
  if (source.reflow !== undefined)
    candidate.reflow = definedProperties({ ...source.reflow })
  if (source.extensions !== undefined)
    candidate.extensions = source.extensions
  return deepFreezeJsonValue(cloneJsonValue(candidate as JsonValue)) as unknown as PageSchema
}

function definedProperties(source: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined))
}

function snapshotBrowserDomOptions(
  options: NonNullable<RenderSurfaceOptions['browserDom']>,
): NonNullable<CommittedRenderSurfaceOptions['browserDom']> {
  if (!Number.isSafeInteger(options.maxNodes) || options.maxNodes < 1 || options.maxNodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
    throw new RangeError('PAGE_DOM_MAX_NODES_INVALID')
  const imperativeDom = Object.freeze([...(options.imperativeDom ?? [])])
  if (!imperativeDom.every(value => typeof value === 'string'))
    throw new TypeError('PAGE_DOM_IMPERATIVE_DOM_INVALID')
  return Object.freeze({
    maxNodes: options.maxNodes,
    imperativeDom,
    ...(options.policy ? { policy: snapshotViewerTreePolicy(options.policy) } : {}),
  })
}

function cloneAndFreezeRecord(
  value: Readonly<Record<string, unknown>>,
  code: string,
): Readonly<Record<string, unknown>> {
  const cloned = deepFreezeJsonValue(cloneJsonValue(value as unknown as JsonValue))
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned))
    throw new TypeError(code)
  return cloned as Readonly<Record<string, unknown>>
}

function createSlotMountOutputs(
  owner: MaterialNode<unknown>,
  materials: ProfileMaterialRuntime,
  context: ViewerRenderContext,
  ownerCapabilities: BrowserDomCapabilities,
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>,
  resolvedPropsMap: ReadonlyMap<string, Record<string, unknown>>,
  hostImperativeDom: ReadonlySet<string>,
  browserDom: RenderSurfaceOptions['browserDom'],
  diagnostics: ViewerDiagnosticEvent[],
): Readonly<Record<string, readonly ReturnType<ProfileMaterialRuntime['render']>['tree'][]>> {
  const slots = new Map<string, MaterialNode<unknown>[]>()
  for (const structure of inspectMaterialNode(owner as MaterialNode, materials.profile, context.unit as UnitType).introspection.structures) {
    const children = slots.get(structure.slot) ?? []
    for (const child of structure.children) {
      if (!children.includes(child))
        children.push(child)
    }
    slots.set(structure.slot, children)
  }
  return Object.freeze(Object.fromEntries([...slots].map(([key, nodes]) => [
    key,
    Object.freeze(nodes.map(node => createBrowserDomHostMount(ownerCapabilities, host => mountSlotMaterial(
      host,
      node,
      materials,
      context,
      nodeStates,
      resolvedPropsMap,
      hostImperativeDom,
      browserDom,
      diagnostics,
    )))),
  ])))
}

function mountSlotMaterial(
  host: HTMLElement,
  node: MaterialNode<unknown>,
  materials: ProfileMaterialRuntime,
  parentContext: ViewerRenderContext,
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>,
  resolvedPropsMap: ReadonlyMap<string, Record<string, unknown>>,
  hostImperativeDom: ReadonlySet<string>,
  browserDom: RenderSurfaceOptions['browserDom'],
  diagnostics: ViewerDiagnosticEvent[],
): ViewerTreeMount {
  const facetCapabilities = materials.getCapabilities(node.type)
  const capabilities = createNodeCapabilities(host.ownerDocument, facetCapabilities, hostImperativeDom, browserDom?.policy, browserDom?.maxNodes)
  const admitted = isNodeAdmitted(node, nodeStates)
  const resolvedModel = resolvedPropsMap.get(node.id) ?? node.model as Record<string, unknown>
  const childContext = createLegacyRenderContext({
    node,
    resolvedModel,
    instanceKey: createNestedMaterialInstanceKey(parentContext.instanceKey, node.id),
    fragmentBox: {
      x: parentContext.fragmentPlan.box.x + node.x,
      y: parentContext.fragmentPlan.box.y + node.y,
      width: node.width,
      height: node.height,
    },
    pageIndex: parentContext.pageIndex,
    unit: parentContext.unit,
    zoom: parentContext.zoom,
    data: parentContext.data,
    capabilities: facetCapabilities?.sanitizedMarkup ? capabilities : deniedRenderCapabilities,
    maxNodes: browserDom?.maxNodes,
    reportDiagnostic: parentContext.reportDiagnostic,
  })
  const childForRender = { ...node, model: resolvedModel }
  try {
    childContext.slotOutputs = admitted
      ? createSlotMountOutputs(childForRender, materials, childContext, capabilities, nodeStates, resolvedPropsMap, hostImperativeDom, browserDom, diagnostics)
      : undefined
    const renderContext: ViewerRenderContext = Object.freeze(childContext)
    const output = materials.render(childForRender, renderContext, admitted)
    if (admitted)
      materials.getRenderSize(childForRender, renderContext)
    const mount = renderViewerTree(host, output.tree, {
      document: host.ownerDocument,
      capabilities,
      maxNodes: browserDom?.maxNodes,
    })
    return withCapabilityDisposal(mount, capabilities)
  }
  catch (error) {
    capabilities.dispose()
    diagnostics.push(materialRenderDiagnostic(node, error))
    host.setAttribute('data-render-error', 'true')
    host.setAttribute('data-element-id', node.id)
    return renderMaterialFallback(host, node, browserDom, diagnostics)
  }
}

function createNodeCapabilities(
  document: Document,
  facetCapabilities: ReturnType<ProfileMaterialRuntime['getCapabilities']>,
  hostImperativeDom: ReadonlySet<string>,
  policy?: ViewerTreePolicy,
  maxNodes?: number,
): BrowserDomCapabilities {
  return createBrowserDomCapabilities({
    document,
    policy,
    maxNodes,
    imperativeDom: facetCapabilities?.imperativeDom?.filter(capability => hostImperativeDom.has(capability)) ?? [],
  })
}

interface LegacyRenderContextInput {
  node: MaterialNode<unknown>
  resolvedModel: Record<string, unknown>
  instanceKey: string
  layoutPlan?: MaterialLayoutPlan
  fragmentPlan?: MaterialFragmentPlan
  fragmentBox: Readonly<{ x: number, y: number, width: number, height: number }>
  pageIndex: number
  unit: string
  zoom: number
  data: Readonly<Record<string, unknown>>
  capabilities: ViewerRenderContext['capabilities']
  maxNodes?: number
  reportDiagnostic?: ViewerRenderContext['reportDiagnostic']
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

function createNestedMaterialInstanceKey(parentInstanceKey: string, childNodeId: string): string {
  return JSON.stringify(['material-instance', parentInstanceKey, childNodeId])
}

function createLegacyRenderContext(input: LegacyRenderContextInput): Mutable<ViewerRenderContext> {
  const { node } = input
  const layoutUnit = resolveLayoutUnit(input.unit)
  const plans = input.layoutPlan && input.fragmentPlan
    ? { layoutPlan: input.layoutPlan, fragmentPlan: input.fragmentPlan }
    : createNonFragmentingMaterialPlans({
        instanceKey: input.instanceKey,
        nodeId: node.id,
        nodeRevision: node.modelVersion,
        constraintKey: createLayoutConstraintKey({
          availableWidth: node.width,
          availableHeight: node.height,
          unit: layoutUnit,
          writingMode: 'horizontal-tb',
        }),
        pageIndex: input.pageIndex,
        borderBox: { x: 0, y: 0, width: node.width, height: node.height },
        fragmentBox: input.fragmentBox,
      })
  const committedSlotInstanceKeys = new Set(plans.layoutPlan.slotBoxes.map(slot => slot.slotInstanceKey))
  const context: Mutable<ViewerRenderContext> = {
    data: input.data,
    resolvedModel: input.resolvedModel,
    instanceKey: input.instanceKey,
    layoutPlan: plans.layoutPlan,
    fragmentPlan: plans.fragmentPlan,
    renderSlot: slotInstanceKey => viewerFragment(
      committedSlotInstanceKeys.has(slotInstanceKey)
        ? context.slotOutputs?.[slotInstanceKey] ?? []
        : [],
    ),
    renderBudget: createRenderBudget(input.maxNodes),
    pageIndex: input.pageIndex,
    unit: input.unit,
    zoom: input.zoom,
    capabilities: input.capabilities,
    reportDiagnostic: input.reportDiagnostic,
  }
  return context
}

function createRenderBudget(configuredMaxNodes?: number): MaterialRenderBudgetToken {
  const configuredLimit = configuredMaxNodes !== undefined
    && Number.isSafeInteger(configuredMaxNodes)
    && configuredMaxNodes >= 0
    ? configuredMaxNodes
    : VIEWER_TREE_ABSOLUTE_MAX_NODES
  const maxNodes = Math.min(configuredLimit, VIEWER_TREE_ABSOLUTE_MAX_NODES)
  let nodesUsed = 0
  return Object.freeze({
    maxNodes,
    get nodesUsed() {
      return nodesUsed
    },
    reserveNodes(_kind: MaterialRenderNodeKind, count: number) {
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error('VIEWER_RENDER_BUDGET_RESERVATION_INVALID')
      if (nodesUsed + count > maxNodes)
        throw new Error('VIEWER_RENDER_BUDGET_EXCEEDED')
      nodesUsed += count
    },
  })
}

function resolveLayoutUnit(unit: string): LayoutConstraints['unit'] {
  if (unit === 'mm' || unit === 'pt' || unit === 'px' || unit === 'inch')
    return unit
  throw new Error(`VIEWER_LAYOUT_UNIT_UNSUPPORTED: ${unit}`)
}

function disposeMounts(mounts: readonly ViewerTreeMount[], onError?: (error: unknown) => void): void {
  let firstError: unknown
  for (let index = mounts.length - 1; index >= 0; index--) {
    try {
      mounts[index]!.dispose()
    }
    catch (error) {
      onError?.(error)
      firstError ??= error
    }
  }
  if (firstError && !onError)
    throw firstError
}

function withCapabilityDisposal(mount: ViewerTreeMount, capabilities: BrowserDomCapabilities): ViewerTreeMount {
  return Object.freeze({
    nodes: mount.nodes,
    dispose() {
      try {
        mount.dispose()
      }
      finally {
        capabilities.dispose()
      }
    },
  })
}

function renderMaterialFallback(
  host: HTMLElement,
  node: MaterialNode<unknown>,
  browserDom: RenderSurfaceOptions['browserDom'],
  diagnostics: ViewerDiagnosticEvent[],
): ViewerTreeMount {
  const fallbackTree = materialRenderFallbackTree(node)
  const capabilities = createBrowserDomFallbackCapabilities({
    document: host.ownerDocument,
    policy: browserDom?.policy,
    maxNodes: browserDom?.maxNodes,
  }, fallbackTree)
  try {
    const mount = renderViewerTree(host, fallbackTree, {
      document: host.ownerDocument,
      capabilities,
      maxNodes: browserDom?.maxNodes,
    })
    return withCapabilityDisposal(mount, capabilities)
  }
  catch (error) {
    capabilities.dispose()
    const thrown = safeSummarizeThrown(error)
    diagnostics.push({
      category: 'viewer',
      severity: 'error',
      code: 'MATERIAL_FALLBACK_BUDGET_EXHAUSTED',
      message: `Fallback for node "${node.id}" could not be rendered: ${thrown.message}`,
      nodeId: node.id,
      scope: 'material',
      cause: thrown.cause,
    })
    return Object.freeze({ nodes: Object.freeze([]), dispose() {} })
  }
}

function materialRenderDiagnostic(node: MaterialNode<unknown>, error: unknown): ViewerDiagnosticEvent {
  const thrown = safeSummarizeThrown(error)
  const sourceNodeId = readVirtualSourceNodeId(node)
  return {
    category: 'viewer',
    severity: 'error',
    code: 'MATERIAL_RENDER_ERROR',
    message: `MATERIAL_RENDER_ERROR for node "${node.id}": ${thrown.message}`,
    nodeId: node.id,
    ...(sourceNodeId ? { detail: { sourceNodeId, virtualNodeId: node.id } } : {}),
    scope: 'material',
    cause: thrown.cause,
  }
}

function isNodeAdmitted(node: MaterialNode<unknown>, nodeStates: ReadonlyMap<string, MaterialNodeLoadState>): boolean {
  const sourceNodeId = readVirtualSourceNodeId(node)
  const state = nodeStates.get(sourceNodeId ?? node.id)
  return sourceNodeId ? state?.status === 'ready' : state?.status !== 'quarantined'
}

function readVirtualSourceNodeId(node: MaterialNode<unknown>): string | undefined {
  const value = (node as MaterialNode<unknown> & { sourceNodeId?: unknown }).sourceNodeId
  return typeof value === 'string' ? value : undefined
}

function materialRenderFallbackTree(node: MaterialNode<unknown>) {
  return viewerElement('div', {
    attributes: { title: 'Render failed' },
    style: {
      'width': '100%',
      'height': '100%',
      'display': 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'background-color': '#fff3f3',
      'border': '1px dashed #ff4d4f',
      'color': '#ff4d4f',
      'font-size': '11px',
      'box-sizing': 'border-box',
    },
  }, [viewerText(`[${node.type}]`)])
}

function resolveCachedPageLayerBuckets(
  cache: Map<string, PageLayerRenderPlanBuckets>,
  pageSchema: PageSchema,
  page: Pick<PagePlanEntry, 'width' | 'height'>,
): PageLayerRenderPlanBuckets {
  const key = createPageSizeKey(page.width, page.height)
  const cached = cache.get(key)
  if (cached)
    return cached

  const buckets = groupPageLayerPlansByPlacement(resolvePageLayerPlans(pageSchema, {
    width: page.width,
    height: page.height,
  }))
  cache.set(key, buckets)
  return buckets
}

function appendPageLayers(
  document: Document,
  pageEl: HTMLElement,
  plans: PageLayerRenderPlan[],
  page: PagePlanEntry,
  unit: string,
  diagnostics: ViewerDiagnosticEvent[],
): void {
  if (plans.length === 0)
    return

  for (const plan of plans) {
    if (isTextWatermarkLayerPlan(plan))
      appendTextWatermarkLayer(document, pageEl, plan, page, unit, diagnostics)
  }
}

function appendTextWatermarkLayer(
  document: Document,
  pageEl: HTMLElement,
  plan: TextWatermarkPageLayerPlan,
  page: PagePlanEntry,
  unit: string,
  diagnostics: ViewerDiagnosticEvent[],
): void {
  const layer = document.createElement('div')
  layer.className = 'ei-viewer-page-layer ei-viewer-page-layer--watermark'
  layer.setAttribute('data-page-layer-id', plan.layer.id)
  layer.setAttribute('data-page-layer-kind', plan.layer.kind)
  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.zIndex = String(resolveViewerLayerZIndex(plan))
  layer.style.pointerEvents = 'none'
  layer.style.userSelect = 'none'
  layer.style.overflow = 'hidden'
  layer.style.color = plan.layer.color
  layer.style.opacity = String(plan.layer.opacity)

  for (const tile of plan.tiles) {
    const text = document.createElement('span')
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
      message: `Page ${page.index + 1} layer ${plan.layer.id} generated too many watermark tiles and was truncated.`,
      detail: { pageIndex: page.index, layerId: plan.layer.id, tileCount: plan.tiles.length },
    })
  }

  pageEl.appendChild(layer)
}

function isTextWatermarkLayerPlan(plan: PageLayerRenderPlan): plan is TextWatermarkPageLayerPlan {
  return plan.layer.kind === 'watermark' && plan.layer.type === 'text'
}

function resolveViewerLayerZIndex(plan: PageLayerRenderPlan): number {
  return resolvePageLayerStackIndex(plan)
}

function createContentLayer(document: Document): HTMLElement {
  const layer = document.createElement('div')
  layer.className = 'ei-viewer-content-layer'
  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.zIndex = String(PAGE_CONTENT_LAYER_STACK_INDEX)
  return layer
}

function createPageElement(
  document: Document,
  page: PagePlanEntry,
  pageSchema: PageSchema,
  unit: string,
  zoom: number,
): { wrapper: HTMLElement, pageEl: HTMLElement } {
  const pageEl = document.createElement('div')
  pageEl.className = 'ei-viewer-page'
  pageEl.setAttribute('data-page-index', String(page.index))
  pageEl.style.position = 'relative'
  pageEl.style.width = `${page.width}${unit}`
  pageEl.style.height = `${page.height}${unit}`
  pageEl.style.overflow = 'hidden'
  pageEl.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)'
  pageEl.style.boxSizing = 'border-box'
  if (pageSchema.font) {
    pageEl.style.fontFamily = pageSchema.font
  }

  // Background
  applyPageBackground(pageEl, pageSchema.background, unit)

  // Border radius
  if (pageSchema.radius) {
    pageEl.style.borderRadius = pageSchema.radius
  }

  // Zoom via transform: scale() — print CSS resets this to none
  if (zoom !== 1) {
    pageEl.style.transform = `scale(${zoom})`
    pageEl.style.transformOrigin = 'top left'
  }

  // Zoom wrapper: adjusts flow layout dimensions since transform doesn't affect flow.
  // Uses px because the parent container reports size in px (clientWidth/clientHeight).
  let wrapper: HTMLElement
  if (zoom !== 1) {
    wrapper = document.createElement('div')
    wrapper.className = 'ei-viewer-page-zoom'
    const pxFactor = getPxFactorForLayout(unit)
    wrapper.style.width = `${page.width * pxFactor * zoom}px`
    wrapper.style.height = `${page.height * pxFactor * zoom}px`
    wrapper.style.margin = '0 auto 16px auto'
    wrapper.style.overflow = 'hidden'
    wrapper.appendChild(pageEl)
  }
  else {
    wrapper = pageEl
    pageEl.style.margin = '0 auto 16px auto'
  }

  return { wrapper, pageEl }
}

function applyPageBackground(el: HTMLElement, bg: PageBackground | undefined, unit: string): void {
  if (!bg) {
    el.style.background = 'white'
    return
  }

  // Background color
  el.style.backgroundColor = bg.color || 'white'

  // Background image
  if (bg.image) {
    el.style.backgroundImage = `url(${JSON.stringify(bg.image)})`

    // Repeat mode -> CSS background-repeat + background-size
    const repeat = bg.repeat || 'none'
    if (repeat === 'full') {
      el.style.backgroundSize = '100% 100%'
      el.style.backgroundRepeat = 'no-repeat'
    }
    else {
      if (repeat === 'repeat') {
        el.style.backgroundRepeat = 'repeat'
      }
      else if (repeat === 'repeat-x') {
        el.style.backgroundRepeat = 'repeat-x'
      }
      else if (repeat === 'repeat-y') {
        el.style.backgroundRepeat = 'repeat-y'
      }
      else {
        el.style.backgroundRepeat = 'no-repeat'
      }

      // Explicit image dimensions in document units
      if (bg.width != null && bg.height != null) {
        el.style.backgroundSize = `${bg.width}${unit} ${bg.height}${unit}`
      }
      else if (bg.width != null) {
        el.style.backgroundSize = `${bg.width}${unit} auto`
      }
      else if (bg.height != null) {
        el.style.backgroundSize = `auto ${bg.height}${unit}`
      }
    }

    // Background position offset in document units
    if (bg.offsetX != null || bg.offsetY != null) {
      const x = bg.offsetX ?? 0
      const y = bg.offsetY ?? 0
      el.style.backgroundPosition = `${x}${unit} ${y}${unit}`
    }
  }
}

function createElementWrapper(
  document: Document,
  node: MaterialNode<unknown>,
  page: PagePlanEntry,
  unit: string,
  renderSize: ViewerRenderSize,
  fragmentPlan?: MaterialFragmentPlan,
): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'ei-viewer-element'
  wrapper.setAttribute('data-element-id', node.id)
  wrapper.setAttribute('data-element-type', node.type)

  // Compute position relative to page
  const box = fragmentPlan?.box
  const relativeY = (box?.y ?? node.y) - page.yOffset

  wrapper.style.position = 'absolute'
  wrapper.style.left = `${box?.x ?? node.x}${unit}`
  wrapper.style.top = `${relativeY}${unit}`
  wrapper.style.width = `${box?.width ?? renderSize.width}${unit}`
  wrapper.style.height = `${box?.height ?? renderSize.height}${unit}`
  wrapper.style.overflow = 'hidden'
  wrapper.style.zIndex = String(node.zIndex ?? 0)

  if (node.rotation) {
    wrapper.style.transform = `rotate(${node.rotation}deg)`
    wrapper.style.transformOrigin = 'center center'
  }

  if (node.alpha != null && node.alpha !== 1) {
    wrapper.style.opacity = String(node.alpha)
  }

  return wrapper
}

/**
 * CSS pixels per document unit. Only used for zoom wrapper flow layout,
 * NOT for content rendering. CSS reference: 96 dpi.
 */
function getPxFactorForLayout(unit: string): number {
  const factor = UNIT_FACTOR[unit]
  if (!factor)
    return 1
  return 96 / factor
}

function createPageSizeKey(width: number, height: number): string {
  return `${width}:${height}`
}
