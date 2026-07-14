import type { BrowserDomCapabilities, RenderViewerTreeOptions, ViewerTreeMount, ViewerTreePolicy } from '@easyink/browser-dom'
import type { MaterialFragmentPlan, MaterialRenderBudgetToken, MaterialRenderNodeKind, ViewerRenderTree } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { CommittedPagePlan, RuntimeMaterialInstancePlan } from './layout-runtime'
import type { ProfileMaterialRuntime } from './material-runtime'
import type { ViewerDiagnosticEvent, ViewerRenderContext } from './types'
import { createBrowserDomCapabilities, createBrowserDomFallbackCapabilities, createBrowserDomHostMount, renderViewerTree } from '@easyink/browser-dom'
import { assertViewerRenderTree, VIEWER_TREE_ABSOLUTE_MAX_NODES, viewerFragment, viewerText } from '@easyink/core'
import { safeSummarizeThrown } from './safe-thrown'

const deniedRenderCapabilities: ViewerRenderContext['capabilities'] = Object.freeze({
  sanitizeMarkup() {
    throw new Error('VIEWER_SANITIZED_MARKUP_NOT_DECLARED')
  },
})

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

export type RenderSurfaceBuild = (
  root: HTMLElement,
  transaction: RenderSurfaceTransaction,
) => RenderSurfaceBuildResult | Promise<RenderSurfaceBuildResult>

export interface AtomicRenderSurfaceCommitResult {
  readonly root: HTMLElement
  readonly cleanupDiagnostics: readonly ViewerDiagnosticEvent[]
}

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
  private generation = 0
  private disposed = false
  private currentRoot?: HTMLElement
  private currentDisposers: RenderSurfaceDisposer[] = []

  constructor(host: HTMLElement) {
    this.host = host
  }

  async commitAtomically(build: RenderSurfaceBuild, signal: AbortSignal): Promise<AtomicRenderSurfaceCommitResult> {
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
    const previousChildren = [...this.host.childNodes]
    try {
      this.host.replaceChildren(root)
      checkpoint()
    }
    catch (error) {
      root.remove()
      const cleanupErrors = disposeRenderSurfaceDisposers(disposers)
      const restoreErrors: unknown[] = []
      try {
        this.host.replaceChildren(...previousChildren)
      }
      catch (restoreError) {
        restoreErrors.push(restoreError)
      }
      if (cleanupErrors.length > 0 || restoreErrors.length > 0)
        throw new AggregateError([error, ...cleanupErrors, ...restoreErrors], 'RENDER_SURFACE_COMMIT_FAILED')
      throw error
    }
    this.currentRoot = root
    this.currentDisposers = disposers
    oldRoot?.remove()
    const cleanupErrors = disposeRenderSurfaceDisposers(oldDisposers)
    return Object.freeze({
      root,
      cleanupDiagnostics: Object.freeze(cleanupErrors.map(cleanupErrorToDiagnostic)),
    })
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
}

function cleanupErrorToDiagnostic(error: unknown): ViewerDiagnosticEvent {
  const thrown = safeSummarizeThrown(error)
  return Object.freeze({
    category: 'viewer',
    severity: 'warning',
    code: 'MATERIAL_DISPOSE_ERROR',
    message: thrown.message,
    scope: 'material',
    cause: thrown.cause,
  })
}

export interface MountCommittedMaterialOptions {
  readonly committedPlan: Pick<CommittedPagePlan, 'documentRevision' | 'dataRevision' | 'runtimeInstances'>
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
  readonly snapshot: () => CommittedRenderBudgetSnapshot
  readonly restore: (snapshot: CommittedRenderBudgetSnapshot) => void
  readonly runWithIdentity: <T>(identity: CommittedRenderBudgetIdentity, callback: () => T) => T
  readonly reserveFor: (identity: CommittedRenderBudgetIdentity, kind: MaterialRenderNodeKind, count: number) => void
  readonly reserveFallback: (identity: CommittedRenderBudgetIdentity) => CommittedFallbackReservation | undefined
  readonly markCoreTree: <T extends ViewerRenderTree>(tree: T) => T
  readonly auditTree: (identity: CommittedRenderBudgetIdentity, tree: ViewerRenderTree, snapshot: CommittedRenderBudgetSnapshot) => void
}

interface CommittedRenderBudgetIdentity {
  readonly instanceKey: string
  readonly nodeId: string
}

interface CommittedRenderBudgetSnapshot {
  readonly sequence: number
  readonly totalNodesUsed: number
  readonly materialReportedNodes: number
  readonly coreReservedNodes: number
}

interface CommittedFallbackReservation {
  readonly consume: () => void
  readonly release: () => void
}

class RenderBudgetAuditExceeded extends Error {
  constructor(readonly observed: number) {
    super('VIEWER_RENDER_TREE_BUDGET_AUDIT_EXCEEDED')
  }
}

interface CommittedRenderBudgetReservation {
  readonly sequence: number
  readonly count: number
  readonly source: 'material' | 'core'
  active: boolean
}

interface CommittedRenderBudgetState {
  totalNodesUsed: number
  materialReportedNodes: number
  coreReservedNodes: number
  nextSequence: number
  readonly reservations: CommittedRenderBudgetReservation[]
  readonly coreTreeCredits: WeakMap<object, number>
  readonly coreTreeCreditBatches: CommittedCoreTreeCreditBatch[]
}

interface CommittedCoreTreeCreditBatch {
  readonly sequence: number
  readonly occurrences: readonly object[]
}

const committedRenderBudgetStates = new WeakMap<MaterialRenderBudgetToken, CommittedRenderBudgetState>()
const renderBudgetQuarantines = new WeakMap<object, Set<string>>()

export function mountCommittedMaterial(
  host: HTMLElement,
  input: MountCommittedMaterialOptions,
): ViewerTreeMount {
  const maxNodes = resolveCommittedNodeLimit(input.viewerMaxNodes, input.browserDom?.maxNodes)
  const state: CommittedMaterialRenderState = Object.freeze({
    input,
    maxNodes,
    renderBudget: createCommittedRenderBudget(maxNodes, input),
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
  fallbackReservation?: CommittedFallbackReservation,
): ViewerTreeMount {
  const { input } = state
  const instance = input.committedPlan.runtimeInstances.get(instanceKey)
  if (!instance || !hasCommittedIdentity(instanceKey, instance, fragmentPlan)) {
    reportCommittedDiagnostic(state, {
      code: 'VIEWER_MATERIAL_INSTANCE_IDENTITY_MISMATCH',
      message: `Committed material instance "${instanceKey}" is unavailable`,
      nodeId: instance?.nodeId ?? fragmentPlan.sourceNodeId,
    })
    return mountCommittedSentinel(host, state, '[material unavailable]', {
      instanceKey,
      nodeId: instance?.nodeId ?? fragmentPlan.sourceNodeId,
    }, fallbackReservation)
  }
  if (isRenderBudgetQuarantined(input.committedPlan, instanceKey))
    return mountCommittedSentinel(host, state, '[material unavailable]', instance, fallbackReservation)
  if (instance.status === 'quarantined') {
    reportCommittedDiagnostic(state, {
      code: 'VIEWER_MATERIAL_INSTANCE_QUARANTINED',
      message: `Committed material instance "${instanceKey}" is quarantined`,
      nodeId: instance.nodeId,
      detail: instance.diagnostic,
    })
    return mountCommittedSentinel(host, state, '[material quarantined]', instance, fallbackReservation)
  }
  if (ancestors.has(instanceKey)) {
    reportCommittedDiagnostic(state, {
      code: 'VIEWER_SLOT_INSTANCE_CYCLE',
      message: `Committed slot cycle reached instance "${instanceKey}"`,
      nodeId: instance.nodeId,
    })
    return mountCommittedSentinel(host, state, '[slot unavailable]', instance, fallbackReservation)
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
    tree = state.renderBudget.runWithIdentity(
      instance,
      () => input.materials.render(instance.node as MaterialNode<unknown>, context, true).tree,
    )
    const budgetFallback = mountCommittedRenderBudgetFallback(
      host,
      state,
      instance,
      budgetSnapshot,
      capabilities,
      fallbackReservation,
    )
    if (budgetFallback)
      return budgetFallback
    state.renderBudget.auditTree(instance, tree, budgetSnapshot)
  }
  catch (error) {
    const budgetFallback = mountCommittedRenderBudgetFallback(
      host,
      state,
      instance,
      budgetSnapshot,
      capabilities,
      fallbackReservation,
    )
    if (budgetFallback)
      return budgetFallback
    capabilities.dispose()
    state.renderBudget.restore(budgetSnapshot)
    reportCommittedFailure(state, 'VIEWER_MATERIAL_RENDER_ERROR', instance, error)
    return mountCommittedSentinel(host, state, '[material unavailable]', instance, fallbackReservation)
  }

  try {
    const mount = mountMaterialTree(host, tree, {
      document: host.ownerDocument,
      policy: input.browserDom?.policy,
      capabilities,
      maxNodes: state.maxNodes,
    })
    fallbackReservation?.release()
    return mount
  }
  catch (error) {
    state.renderBudget.restore(budgetSnapshot)
    reportCommittedFailure(state, 'VIEWER_MATERIAL_MOUNT_ERROR', instance, error)
    return mountCommittedSentinel(host, state, '[material unavailable]', instance, fallbackReservation)
  }
}

function mountCommittedRenderBudgetFallback(
  host: HTMLElement,
  state: CommittedMaterialRenderState,
  instance: RuntimeMaterialInstancePlan,
  budgetSnapshot: CommittedRenderBudgetSnapshot,
  capabilities: BrowserDomCapabilities,
  fallbackReservation?: CommittedFallbackReservation,
): ViewerTreeMount | undefined {
  if (!isRenderBudgetQuarantined(state.input.committedPlan, instance.instanceKey))
    return undefined
  capabilities.dispose()
  state.renderBudget.restore(budgetSnapshot)
  return mountCommittedSentinel(host, state, '[material unavailable]', instance, fallbackReservation)
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
    state.renderBudget.reserveFor(owner, 'fragment', 1)
    state.renderBudget.reserveFor(owner, 'text', 1)
    return state.renderBudget.markCoreTree(viewerFragment([viewerText('[slot unavailable]')]))
  }

  state.renderBudget.reserveFor(owner, 'fragment', 1)
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
      state.renderBudget.reserveFor(owner, 'text', 1)
      trees.push(viewerText('[slot unavailable]'))
      continue
    }
    if (!child || !child.embeddedFragmentPlan || !hasCommittedIdentity(childInstanceKey, child, child.embeddedFragmentPlan)) {
      reportSlotMissing(state, owner, slotInstanceKey, childInstanceKey)
      state.renderBudget.reserveFor(owner, 'text', 1)
      trees.push(viewerText('[slot unavailable]'))
      continue
    }
    const fallbackReservation = state.renderBudget.reserveFallback(child)
    if (!fallbackReservation)
      break
    if (isRenderBudgetQuarantined(state.input.committedPlan, childInstanceKey)) {
      fallbackReservation.consume()
      trees.push(viewerText('[material unavailable]'))
      continue
    }
    try {
      state.renderBudget.reserveFor(child, 'imperative', 1)
    }
    catch (error) {
      if (!isRenderBudgetExceeded(error))
        throw error
      fallbackReservation.consume()
      trees.push(viewerText('[material unavailable]'))
      continue
    }
    trees.push(createBrowserDomHostMount(ownerCapabilities, childHost => mountCommittedInstance(
      childHost,
      childInstanceKey,
      child.embeddedFragmentPlan!,
      state,
      ancestors,
      fallbackReservation,
    )))
  }
  return state.renderBudget.markCoreTree(viewerFragment(trees))
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
  identity: CommittedRenderBudgetIdentity,
  fallbackReservation?: CommittedFallbackReservation,
): ViewerTreeMount {
  const tree = viewerText(message)
  if (fallbackReservation)
    fallbackReservation.consume()
  else
    state.renderBudget.reserveFor(identity, 'text', 1)
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
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > VIEWER_TREE_ABSOLUTE_MAX_NODES))
      throw new Error('VIEWER_COMMITTED_RENDER_BUDGET_INVALID')
  }
  return Math.min(
    viewerLimit ?? VIEWER_TREE_ABSOLUTE_MAX_NODES,
    browserLimit ?? VIEWER_TREE_ABSOLUTE_MAX_NODES,
    VIEWER_TREE_ABSOLUTE_MAX_NODES,
  )
}

function createCommittedRenderBudget(
  maxNodes: number,
  input: MountCommittedMaterialOptions,
): CommittedRenderBudgetController {
  let currentIdentity: CommittedRenderBudgetIdentity | undefined
  let lastIdentity: CommittedRenderBudgetIdentity | undefined
  const state: CommittedRenderBudgetState = {
    totalNodesUsed: 0,
    materialReportedNodes: 0,
    coreReservedNodes: 0,
    nextSequence: 0,
    reservations: [],
    coreTreeCredits: new WeakMap(),
    coreTreeCreditBatches: [],
  }
  const reserve = (
    identity: CommittedRenderBudgetIdentity,
    kind: MaterialRenderNodeKind,
    count: number,
    source: CommittedRenderBudgetReservation['source'],
  ): CommittedRenderBudgetReservation | undefined => {
    if (!['element', 'text', 'fragment', 'markup', 'imperative'].includes(kind))
      throw new Error('VIEWER_RENDER_NODE_KIND_INVALID')
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error('VIEWER_RENDER_BUDGET_RESERVATION_INVALID')
    if (count > maxNodes - state.totalNodesUsed) {
      reportCommittedBudgetExceeded(input, identity, {
        kind,
        used: state.totalNodesUsed,
        requested: count,
        limit: maxNodes,
      })
      throw new Error('VIEWER_RENDER_TREE_BUDGET_EXCEEDED')
    }
    if (count === 0)
      return undefined
    const reservation: CommittedRenderBudgetReservation = {
      sequence: ++state.nextSequence,
      count,
      source,
      active: true,
    }
    state.reservations.push(reservation)
    state.totalNodesUsed += count
    if (source === 'material')
      state.materialReportedNodes += count
    else
      state.coreReservedNodes += count
    return reservation
  }
  const token: MaterialRenderBudgetToken = Object.freeze({
    maxNodes,
    get nodesUsed() {
      return readCommittedRenderBudgetState(token).totalNodesUsed
    },
    reserveNodes(kind: MaterialRenderNodeKind, count: number): void {
      const identity = currentIdentity ?? lastIdentity
      if (!identity)
        throw new Error('VIEWER_RENDER_BUDGET_IDENTITY_REQUIRED')
      reserve(identity, kind, count, 'material')
    },
  })
  committedRenderBudgetStates.set(token, state)
  return Object.freeze({
    token,
    snapshot: () => Object.freeze({
      sequence: state.nextSequence,
      totalNodesUsed: state.totalNodesUsed,
      materialReportedNodes: state.materialReportedNodes,
      coreReservedNodes: state.coreReservedNodes,
    }),
    restore(snapshot: CommittedRenderBudgetSnapshot): void {
      if (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 0
        || !Number.isSafeInteger(snapshot.totalNodesUsed) || snapshot.totalNodesUsed < 0
        || !Number.isSafeInteger(snapshot.materialReportedNodes) || snapshot.materialReportedNodes < 0
        || !Number.isSafeInteger(snapshot.coreReservedNodes) || snapshot.coreReservedNodes < 0
        || snapshot.totalNodesUsed !== snapshot.materialReportedNodes + snapshot.coreReservedNodes) {
        throw new Error('VIEWER_RENDER_BUDGET_SNAPSHOT_INVALID')
      }
      while (state.reservations.length > 0 && state.reservations.at(-1)!.sequence > snapshot.sequence) {
        const reservation = state.reservations.pop()!
        releaseCommittedRenderReservation(state, reservation)
      }
      discardCommittedCoreTreeCreditsAfter(state, snapshot.sequence)
    },
    runWithIdentity<T>(identity: CommittedRenderBudgetIdentity, callback: () => T): T {
      const previous = currentIdentity
      currentIdentity = identity
      lastIdentity = identity
      try {
        return callback()
      }
      finally {
        currentIdentity = previous
      }
    },
    reserveFor(identity: CommittedRenderBudgetIdentity, kind: MaterialRenderNodeKind, count: number): void {
      reserve(identity, kind, count, 'core')
    },
    reserveFallback(identity: CommittedRenderBudgetIdentity): CommittedFallbackReservation | undefined {
      let reservation: CommittedRenderBudgetReservation | undefined
      try {
        reservation = reserve(identity, 'text', 1, 'core')
      }
      catch (error) {
        if (isRenderBudgetExceeded(error))
          return undefined
        throw error
      }
      if (!reservation)
        throw new Error('VIEWER_RENDER_FALLBACK_RESERVATION_INVALID')
      let settled = false
      return Object.freeze({
        consume(): void {
          settled = true
        },
        release(): void {
          if (settled)
            return
          settled = true
          releaseCommittedRenderReservation(state, reservation)
        },
      })
    },
    markCoreTree<T extends ViewerRenderTree>(tree: T): T {
      const occurrences: object[] = []
      assertViewerRenderTree(tree, {
        maxNodes: VIEWER_TREE_ABSOLUTE_MAX_NODES,
        onVisitNode: (node) => {
          if (typeof node === 'object' && node !== null)
            occurrences.push(node)
        },
      })
      for (const node of occurrences)
        state.coreTreeCredits.set(node, (state.coreTreeCredits.get(node) ?? 0) + 1)
      state.coreTreeCreditBatches.push(Object.freeze({
        sequence: state.nextSequence,
        occurrences: Object.freeze(occurrences),
      }))
      return tree
    },
    auditTree(identity: CommittedRenderBudgetIdentity, tree: ViewerRenderTree, snapshot: CommittedRenderBudgetSnapshot): void {
      let observed = 0
      const consumedCoreTreeCredits = new WeakMap<object, number>()
      const materialReported = state.materialReportedNodes - snapshot.materialReportedNodes
      const proofLimit = materialReported + maxNodes - state.totalNodesUsed
      try {
        assertViewerRenderTree(tree, {
          maxNodes: VIEWER_TREE_ABSOLUTE_MAX_NODES,
          onVisitNode: (node) => {
            if (typeof node === 'object' && node !== null) {
              const consumed = consumedCoreTreeCredits.get(node) ?? 0
              const available = state.coreTreeCredits.get(node) ?? 0
              if (consumed < available) {
                consumedCoreTreeCredits.set(node, consumed + 1)
                return
              }
            }
            observed++
            if (observed > proofLimit)
              throw new RenderBudgetAuditExceeded(observed)
          },
        })
      }
      catch (error) {
        if (!(error instanceof RenderBudgetAuditExceeded))
          throw error
        reportCommittedBudgetExceeded(input, identity, {
          kind: 'fragment',
          used: state.totalNodesUsed,
          requested: Math.max(1, error.observed - materialReported),
          limit: maxNodes,
          observed: error.observed,
        })
        throw new Error('VIEWER_RENDER_TREE_BUDGET_EXCEEDED')
      }
      discardCommittedCoreTreeCreditsAfter(state, snapshot.sequence)
      const missing = observed - materialReported
      if (missing > 0)
        reserve(identity, 'fragment', missing, 'core')
    },
  })
}

function discardCommittedCoreTreeCreditsAfter(
  state: CommittedRenderBudgetState,
  sequence: number,
): void {
  while (state.coreTreeCreditBatches.length > 0 && state.coreTreeCreditBatches.at(-1)!.sequence > sequence) {
    const batch = state.coreTreeCreditBatches.pop()!
    for (const node of batch.occurrences) {
      const credits = state.coreTreeCredits.get(node)
      if (credits === undefined)
        throw new Error('VIEWER_RENDER_CORE_TREE_CREDIT_MISSING')
      if (credits === 1)
        state.coreTreeCredits.delete(node)
      else
        state.coreTreeCredits.set(node, credits - 1)
    }
  }
}

function readCommittedRenderBudgetState(token: MaterialRenderBudgetToken): CommittedRenderBudgetState {
  const state = committedRenderBudgetStates.get(token)
  if (!state)
    throw new Error('VIEWER_RENDER_BUDGET_STATE_MISSING')
  return state
}

function releaseCommittedRenderReservation(
  state: CommittedRenderBudgetState,
  reservation: CommittedRenderBudgetReservation,
): void {
  if (!reservation.active)
    return
  reservation.active = false
  state.totalNodesUsed -= reservation.count
  if (reservation.source === 'material')
    state.materialReportedNodes -= reservation.count
  else
    state.coreReservedNodes -= reservation.count
}

function reportCommittedBudgetExceeded(
  input: MountCommittedMaterialOptions,
  identity: CommittedRenderBudgetIdentity,
  detail: Readonly<{
    kind: MaterialRenderNodeKind
    used: number
    requested: number
    limit: number
    observed?: number
  }>,
): void {
  if (!markRenderBudgetQuarantined(input.committedPlan, identity.instanceKey))
    return
  input.diagnostics.push({
    category: 'viewer',
    severity: 'error',
    code: 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
    message: `Render tree budget exceeded for node "${identity.nodeId}"`,
    nodeId: identity.nodeId,
    scope: 'material',
    detail: {
      instanceKey: identity.instanceKey,
      nodeId: identity.nodeId,
      documentRevision: input.committedPlan.documentRevision,
      dataRevision: input.committedPlan.dataRevision,
      ...detail,
    },
  })
}

function markRenderBudgetQuarantined(plan: object, instanceKey: string): boolean {
  let quarantined = renderBudgetQuarantines.get(plan)
  if (!quarantined) {
    quarantined = new Set()
    renderBudgetQuarantines.set(plan, quarantined)
  }
  if (quarantined.has(instanceKey))
    return false
  quarantined.add(instanceKey)
  return true
}

function isRenderBudgetQuarantined(plan: object, instanceKey: string): boolean {
  return renderBudgetQuarantines.get(plan)?.has(instanceKey) === true
}

function isRenderBudgetExceeded(error: unknown): boolean {
  return error instanceof Error && error.message === 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED'
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
