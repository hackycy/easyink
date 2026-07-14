import type {
  CompiledMaterialProfile,
  LayoutConstraints,
  LayoutDocument,
  MaterialFragmentAdapter,
  MaterialFragmentPlan,
  MaterialLayoutBudgetToken,
  MaterialLayoutFactKind,
  MaterialLayoutPlan,
  MaterialMeasureRequest,
  MaterialMeasureScheduler,
  MaterialNodeLoadState,
  MaterialRenderBudgetToken,
  MaterialRenderNodeKind,
  MaterialRuntimeScope,
  MaterialSlotInstancePlan,
  MaterialTextMeasureInput,
  MaterialTextMeasureResult,
  MeasureService,
  PaginationResult,
} from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import type { EffectiveOutputState } from './effective-output-state'
import type { ProfileMaterialRuntime } from './material-runtime'
import type { PreparedCollectionBudget, PreparedCollectionProvider } from './prepared-collections'
import type { ResolvedRuntimeModel, RuntimeModelResolutionCache } from './runtime-model-resolver'
import type { ViewerPerformanceBudget } from './types'
import {
  commitMaterialFragment,
  createLayoutConstraintKey,
  createNonFragmentingMaterialPlans,
  freezeMaterialFragmentPlan,
  freezeMaterialLayoutPlan,
  planRepeatedOverlays,
  runLayoutPipeline,
  runPagination,
  VIEWER_TREE_ABSOLUTE_MAX_NODES,
  walkMaterialNodes,
} from '@easyink/core'
import { assertJsonValue, cloneJsonValue, deepFreezeJsonValue } from '@easyink/shared'
import { createMaterialBindingResolver, createMaterialDisplayBindingResolver } from './binding-projector'
import { resolveEffectiveOutputStates } from './effective-output-state'
import { createMaterialCollectionOpener } from './prepared-collections'
import { createReadonlyMap } from './readonly-map'
import { resolveRuntimeModelInstance, resolveRuntimeModels } from './runtime-model-resolver'

export const DEFAULT_VIEWER_PERFORMANCE_BUDGET: Readonly<ViewerPerformanceBudget> = Object.freeze({
  measureCacheEntries: 512,
  maxMeasureInFlight: 8,
  pageDomOverscan: 1,
  maxInlineDataNodes: 100_000,
  maxInlineDataStringBytes: 4 * 1024 * 1024,
  maxRuntimeRows: 100_000,
  maxLayoutFactsPerMaterial: 500_000,
  maxRenderTreeNodesPerMaterial: 50_000,
})

interface RuntimeBudgetDiagnostic {
  readonly code: string
  readonly detail: unknown
}

interface MaterialBudgetIdentity {
  readonly instanceKey: string
  readonly nodeId: string
  readonly documentRevision: number
  readonly dataRevision: number
}

interface MaterialLayoutBudgetFailure {
  readonly error: Error
  readonly diagnostic: RuntimeBudgetDiagnostic
}

const materialLayoutBudgetFailures = new WeakMap<MaterialLayoutBudgetToken, MaterialLayoutBudgetFailure>()

export interface LayoutRuntimeInput {
  readonly document: DocumentSchema
  readonly nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  readonly documentRevision: number
  readonly data: Readonly<Record<string, unknown>>
  readonly dataRevision: number
  readonly reportDiagnostic?: (diagnostic: unknown) => void
}

export interface RuntimeMaterialInstancePlan {
  readonly instanceKey: string
  readonly nodeId: string
  readonly node: Readonly<MaterialNode>
  readonly scopeKey: string
  readonly scopeData: Readonly<Record<string, unknown>>
  readonly status: ResolvedRuntimeModel['status']
  readonly diagnostic?: unknown
  readonly resolvedModel: Readonly<Record<string, unknown>>
  readonly layoutPlan: MaterialLayoutPlan
  readonly embeddedFragmentPlan?: MaterialFragmentPlan
  readonly slotChildren: Readonly<Record<string, readonly string[]>>
}

export interface MeasuredMaterialSet {
  readonly plans: ReadonlyMap<string, MaterialLayoutPlan>
  readonly instances: ReadonlyMap<string, RuntimeMaterialInstancePlan>
}

export interface CommittedPagePlan {
  readonly documentRevision: number
  readonly dataRevision: number
  readonly resourceRevision: number
  readonly pages: readonly PaginationResult['pages'][number][]
  readonly outputStates: ReadonlyMap<string, EffectiveOutputState>
  readonly runtimeInstances: ReadonlyMap<string, RuntimeMaterialInstancePlan>
  readonly diagnostics: readonly unknown[]
}

export interface LayoutRuntimeDependencies {
  readonly resolveEffectiveOutput: (input: LayoutRuntimeInput) => ReadonlyMap<string, EffectiveOutputState>
  readonly resolveRuntimeModels: (input: LayoutRuntimeInput & {
    readonly outputStates: ReadonlyMap<string, EffectiveOutputState>
  }) => Promise<ReadonlyMap<string, ResolvedRuntimeModel>>
  readonly prepareResources: (input: LayoutRuntimeInput & {
    readonly runtimeModels: ReadonlyMap<string, ResolvedRuntimeModel>
    readonly outputStates: ReadonlyMap<string, EffectiveOutputState>
  }, signal: AbortSignal) => Promise<number>
  readonly measureNodes: (input: LayoutRuntimeInput & {
    readonly runtimeModels: ReadonlyMap<string, ResolvedRuntimeModel>
    readonly outputStates: ReadonlyMap<string, EffectiveOutputState>
    readonly resourceRevision: number
  }, signal: AbortSignal) => Promise<MeasuredMaterialSet>
  readonly layoutDocument: (document: DocumentSchema, plans: ReadonlyMap<string, MaterialLayoutPlan>) => LayoutDocument
  readonly paginateDocument: (
    document: DocumentSchema,
    layout: LayoutDocument,
    plans: ReadonlyMap<string, MaterialLayoutPlan>,
    outputStates: ReadonlyMap<string, EffectiveOutputState>,
  ) => PaginationResult
}

export interface MaterialMeasurementBudget extends PreparedCollectionBudget {}

export interface MaterialMeasureNodesDependencies {
  readonly profile: CompiledMaterialProfile
  readonly materials: ProfileMaterialRuntime
  readonly measureService: MeasureService
  readonly runtimeModelCache: RuntimeModelResolutionCache
  readonly scheduler: MaterialMeasureScheduler
  readonly textMeasure: (
    input: MaterialTextMeasureInput,
    resourceRevision: number,
    signal: AbortSignal,
  ) => Promise<MaterialTextMeasureResult>
  readonly budget: MaterialMeasurementBudget
  readonly preparedCollections?: PreparedCollectionProvider
  readonly reportDiagnostic: (diagnostic: unknown) => void
}

export interface DefaultLayoutRuntimeDependencies extends MaterialMeasureNodesDependencies {
  readonly prepareResources: LayoutRuntimeDependencies['prepareResources']
}

export type MaterialMeasureNodes = LayoutRuntimeDependencies['measureNodes'] & Readonly<{
  readonly clear: () => void
  readonly dispose: () => Promise<void>
}>

interface MeasuredInstanceTree {
  readonly plan: MaterialLayoutPlan
  readonly instance: RuntimeMaterialInstancePlan
  readonly entries: readonly Readonly<{
    instanceKey: string
    plan: MaterialLayoutPlan
    instance: RuntimeMaterialInstancePlan
  }>[]
}

interface CachedMeasuredArtifact {
  readonly own: MeasuredInstanceTree['entries'][number]
  readonly descendants: readonly Readonly<{
    instanceKey: string
    plan: WeakRef<MaterialLayoutPlan>
    instance: WeakRef<RuntimeMaterialInstancePlan>
  }>[]
}

export function createLayoutRuntime(deps: LayoutRuntimeDependencies): Readonly<{
  plan: (input: LayoutRuntimeInput, signal: AbortSignal) => Promise<CommittedPagePlan>
}> {
  return Object.freeze({
    async plan(input: LayoutRuntimeInput, signal: AbortSignal): Promise<CommittedPagePlan> {
      assertRevision(input.documentRevision)
      assertRevision(input.dataRevision)
      throwIfAborted(signal)

      const outputStates = deps.resolveEffectiveOutput(input)
      throwIfAborted(signal)
      const runtimeModels = await deps.resolveRuntimeModels({ ...input, outputStates })
      throwIfAborted(signal)
      const resourceRevision = await deps.prepareResources({ ...input, runtimeModels, outputStates }, signal)
      throwIfAborted(signal)
      assertRevision(resourceRevision)
      const measured = await deps.measureNodes({ ...input, runtimeModels, outputStates, resourceRevision }, signal)
      throwIfAborted(signal)
      const layout = deps.layoutDocument(input.document, measured.plans)
      throwIfAborted(signal)
      const pagination = deps.paginateDocument(input.document, layout, measured.plans, outputStates)
      throwIfAborted(signal)

      return Object.freeze({
        documentRevision: input.documentRevision,
        dataRevision: input.dataRevision,
        resourceRevision,
        pages: freezeCommittedPages(pagination.pages),
        outputStates: freezeOutputStates(outputStates),
        runtimeInstances: freezeRuntimeInstances(measured.instances),
        diagnostics: freezeDiagnosticCopies(mergeStageDiagnostics(layout.diagnostics, pagination.diagnostics)),
      })
    },
  })
}

export function createMaterialMeasureNodes(
  deps: MaterialMeasureNodesDependencies,
): MaterialMeasureNodes {
  assertMeasurementDependencies(deps)
  let artifacts = new WeakMap<MaterialLayoutPlan, CachedMeasuredArtifact>()
  let disposed = false

  const measureNodes = async (input: Parameters<LayoutRuntimeDependencies['measureNodes']>[0], signal: AbortSignal): Promise<MeasuredMaterialSet> => {
    if (disposed)
      throw new Error('MATERIAL_MEASURE_RUNTIME_DISPOSED')
    throwIfAborted(signal)
    const scope: MaterialRuntimeScope = Object.freeze({
      key: 'document',
      data: copyAndFreezeRecord(input.data),
    })
    const roots = input.document.elements.filter(node => input.outputStates.get(node.id)?.shouldMeasure === true)
    const trees = await deps.scheduler.mapOrdered(roots, async (node) => {
      const model = input.runtimeModels.get(node.id)
      if (!model)
        throw new Error('MATERIAL_RUNTIME_MODEL_REQUIRED')
      const constraints: LayoutConstraints = Object.freeze({
        availableWidth: node.width,
        availableHeight: input.document.page.height,
        unit: input.document.unit,
        writingMode: 'horizontal-tb',
      })
      return measureInstance({
        deps,
        input,
        node,
        instanceKey: model.instanceKey,
        scope,
        model,
        constraints,
        signal,
        ancestorNodeIds: new Set(),
        artifacts,
        artifactRetryAvailable: true,
      })
    }, signal)
    throwIfAborted(signal)

    const plans = new Map<string, MaterialLayoutPlan>()
    const instances = new Map<string, RuntimeMaterialInstancePlan>()
    for (const tree of trees) {
      for (const entry of tree.entries) {
        plans.set(entry.instanceKey, entry.plan)
        instances.set(entry.instanceKey, entry.instance)
      }
    }
    return Object.freeze({
      plans: createReadonlyMap(plans),
      instances: createReadonlyMap(instances),
    })
  }

  return Object.freeze(Object.assign(measureNodes, {
    clear(): void {
      deps.measureService.clear()
      artifacts = new WeakMap()
    },
    async dispose(): Promise<void> {
      if (disposed)
        return
      disposed = true
      deps.measureService.clear()
      artifacts = new WeakMap()
    },
  }))
}

export function createDefaultLayoutRuntime(
  deps: DefaultLayoutRuntimeDependencies,
): ReturnType<typeof createLayoutRuntime> & Readonly<{ clear: () => void, dispose: () => Promise<void> }> {
  const measureNodes = createMaterialMeasureNodes(deps)
  const runtime = createLayoutRuntime({
    resolveEffectiveOutput: input => resolveEffectiveOutputStates(
      input.document.elements,
      input.data as Record<string, unknown>,
      deps.profile,
    ),
    resolveRuntimeModels: async (input) => {
      const nodes = flattenMeasurableNodes(input.document.elements, input.outputStates)
      return resolveRuntimeModels({
        nodes,
        data: input.data,
        dataRevision: input.dataRevision,
        nodeRevisions: new Map(nodes.map(node => [node.id, input.documentRevision])),
        nodeStates: input.nodeStates,
        outputStates: input.outputStates,
        profile: deps.profile,
        materials: deps.materials,
        cache: deps.runtimeModelCache,
        reportDiagnostic: input.reportDiagnostic ?? deps.reportDiagnostic,
      })
    },
    prepareResources: deps.prepareResources,
    measureNodes,
    layoutDocument: (document, plans) => runLayoutPipeline(withoutRepeatedRoots(document, deps.profile), { plans }),
    paginateDocument: (document, layout, _plans, outputStates) => {
      const flowDocument = withoutRepeatedRoots(document, deps.profile)
      const hasPaintableRepeated = document.elements.some(node => (
        deps.profile.getManifest(node.type)?.common.layout.pageRepeat === 'every-output-page'
        && outputStates.get(node.id)?.shouldPaint === true
      ))
      return runPagination(flowDocument, layout, {
        originalSchema: flowDocument,
        resolveFragmentAdapter: fragment => deps.materials.getFragmentAdapter(fragment.node.type),
        ...(hasPaintableRepeated ? { retainBlankPage: () => true } : {}),
      })
    },
  })
  return Object.freeze({
    async plan(input: LayoutRuntimeInput, signal: AbortSignal) {
      const committed = await runtime.plan(input, signal)
      throwIfAborted(signal)
      return commitRepeatedPageInstances(input, committed, deps.profile)
    },
    clear: measureNodes.clear,
    async dispose() {
      try {
        await measureNodes.dispose()
      }
      finally {
        deps.runtimeModelCache.dispose()
      }
    },
  })
}

async function measureInstance(context: {
  readonly deps: MaterialMeasureNodesDependencies
  readonly input: Parameters<LayoutRuntimeDependencies['measureNodes']>[0]
  readonly node: MaterialNode
  readonly instanceKey: string
  readonly scope: MaterialRuntimeScope
  readonly model: ResolvedRuntimeModel
  readonly constraints: LayoutConstraints
  readonly signal: AbortSignal
  readonly ancestorNodeIds: ReadonlySet<string>
  readonly artifacts: WeakMap<MaterialLayoutPlan, CachedMeasuredArtifact>
  readonly artifactRetryAvailable: boolean
}): Promise<MeasuredInstanceTree> {
  const { deps, input, node, instanceKey, scope, model, constraints, signal } = context
  const reportDiagnostic = input.reportDiagnostic ?? deps.reportDiagnostic
  throwIfAborted(signal)
  if (context.ancestorNodeIds.has(node.id))
    throw new Error('MATERIAL_SLOT_MEASURE_CYCLE')
  const ancestorNodeIds = new Set(context.ancestorNodeIds)
  ancestorNodeIds.add(node.id)
  const nodeSnapshot = copyAndFreezeJson(node) as unknown as Readonly<MaterialNode>
  const resolvedModel = copyAndFreezeRecord(model.value)
  const manifest = deps.profile.getManifest(node.type)
  const constraintKey = createLayoutConstraintKey(constraints)
  if (!manifest) {
    const fallback = createNonFragmentingMaterialPlans({
      instanceKey,
      nodeId: node.id,
      nodeRevision: model.nodeRevision,
      constraintKey,
      pageIndex: 0,
      borderBox: { x: node.x, y: node.y, width: node.width, height: node.height },
      fragmentBox: { x: node.x, y: node.y, width: node.width, height: node.height },
    })
    const instance: RuntimeMaterialInstancePlan = Object.freeze({
      instanceKey,
      nodeId: node.id,
      node: nodeSnapshot,
      scopeKey: scope.key,
      scopeData: scope.data,
      status: 'quarantined',
      ...(model.diagnostic === undefined ? {} : { diagnostic: copyAndFreezeJson(model.diagnostic) }),
      resolvedModel,
      layoutPlan: fallback.layoutPlan,
      embeddedFragmentPlan: fallback.fragmentPlan,
      slotChildren: Object.freeze({}),
    })
    const ownEntry = Object.freeze({ instanceKey, plan: fallback.layoutPlan, instance })
    return Object.freeze({
      plan: fallback.layoutPlan,
      instance,
      entries: Object.freeze([ownEntry]),
    })
  }
  const descendants: MeasuredInstanceTree['entries'][number][] = []
  const slotChildren: Record<string, readonly string[]> = {}
  let embeddedFragmentPlan: MaterialFragmentPlan | undefined
  let fragmentAdapter: MaterialFragmentAdapter | undefined
  let callbackRan = false

  if (model.status === 'quarantined' && model.diagnostic?.code === 'MATERIAL_BINDING_SCOPE_INVALID')
    deps.measureService.invalidateNode(node.id)

  const nodeController = createLinkedAbortController(signal)
  let budgetFailure: RuntimeBudgetDiagnostic | undefined
  let layoutBudget: MaterialLayoutBudgetToken | undefined
  let plan: MaterialLayoutPlan
  try {
    plan = await deps.measureService.measure({
      mode: 'authoritative',
      profile: deps.profile,
      materialType: node.type,
      instanceKey,
      nodeId: node.id,
      nodeRevision: model.nodeRevision,
      dataRevision: input.dataRevision,
      resourceRevision: input.resourceRevision,
      constraintKey,
      signal: nodeController.signal,
      measure: async (measureSignal) => {
        callbackRan = true
        const reportBudgetDiagnostic = (diagnostic: RuntimeBudgetDiagnostic): void => {
          budgetFailure = diagnostic
          nodeController.abort(new Error(diagnostic.code))
          reportDiagnostic(diagnostic)
        }
        const budget = createMaterialLayoutBudgetToken({
          instanceKey,
          nodeId: node.id,
          documentRevision: input.documentRevision,
          dataRevision: input.dataRevision,
          maxRuntimeRows: deps.budget.maxRuntimeRows,
          maxLayoutFacts: deps.budget.maxLayoutFacts,
          signal: measureSignal,
          reportDiagnostic: reportBudgetDiagnostic,
        })
        layoutBudget = budget
        const resolveBinding = createMaterialBindingResolver({
          node: nodeSnapshot,
          bindingDefinition: manifest.common.binding,
          baseScope: scope,
          reportDiagnostic,
        })
        const formatBinding = createMaterialDisplayBindingResolver({
          node: nodeSnapshot,
          bindingDefinition: manifest.common.binding,
          baseScope: scope,
          reportDiagnostic,
        })
        const collections = createMaterialCollectionOpener({
          node: nodeSnapshot,
          dataRevision: input.dataRevision,
          resolveBinding,
          provider: deps.preparedCollections,
          budget: deps.budget,
          reportDiagnostic,
        })
        try {
          const facet = deps.materials.get(node.type)
          const customMeasure = model.status === 'ready' && facet?.state === 'active'
            ? facet.value?.layout?.measure
            : undefined
          if (!customMeasure) {
            const fallback = createNonFragmentingMaterialPlans({
              instanceKey,
              nodeId: node.id,
              nodeRevision: model.nodeRevision,
              constraintKey,
              pageIndex: 0,
              borderBox: { x: node.x, y: node.y, width: node.width, height: node.height },
              fragmentBox: { x: node.x, y: node.y, width: node.width, height: node.height },
            })
            embeddedFragmentPlan = fallback.fragmentPlan
            return fallback.layoutPlan
          }

          fragmentAdapter = facet?.value?.layout?.fragment

          const measuredPlan = await customMeasure(Object.freeze({
            mode: 'authoritative',
            instanceKey,
            node: nodeSnapshot,
            scope,
            resolvedModel,
            nodeRevision: model.nodeRevision,
            dataRevision: input.dataRevision,
            resourceRevision: input.resourceRevision,
            constraints,
            signal: measureSignal,
            budget,
            resolveBinding,
            formatBinding,
            openCollection: collections.open,
            schedule: deps.scheduler,
            measureText: (text: MaterialTextMeasureInput) => deps.textMeasure(text, input.resourceRevision, measureSignal),
            measureSlot: async (
              slotInput: Parameters<MaterialMeasureRequest['measureSlot']>[0],
              slotSignal: AbortSignal,
            ): Promise<MaterialSlotInstancePlan> => {
              throwIfAborted(measureSignal)
              throwIfAborted(slotSignal)
              if (slotSignal !== measureSignal)
                throw new Error('MATERIAL_SLOT_MEASURE_SIGNAL_MISMATCH')
              const children = (node.slots[slotInput.slot] ?? [])
                .filter(child => input.outputStates.get(child.id)?.shouldMeasure === true)
              const slotInstanceKey = JSON.stringify([
                'material-slot',
                instanceKey,
                slotInput.slot,
                slotInput.scope.key,
              ])
              const childTrees = await deps.scheduler.mapOrdered(children, async (child, index) => {
                const childInstanceKey = JSON.stringify([
                  'material-slot-child',
                  slotInstanceKey,
                  index,
                  child.id,
                ])
                const childModel = resolveRuntimeModelInstance({
                  instanceKey: childInstanceKey,
                  scope: slotInput.scope,
                  node: child,
                  dataRevision: input.dataRevision,
                  nodeRevision: input.documentRevision,
                  admissionState: input.nodeStates.get(child.id),
                  cache: deps.runtimeModelCache,
                  materials: deps.materials,
                  reportDiagnostic,
                })
                return measureInstance({
                  deps,
                  input,
                  node: child,
                  instanceKey: childInstanceKey,
                  scope: slotInput.scope,
                  model: childModel,
                  constraints: slotInput.constraints,
                  signal: measureSignal,
                  ancestorNodeIds,
                  artifacts: context.artifacts,
                  artifactRetryAvailable: true,
                })
              }, measureSignal)
              for (const childTree of childTrees)
                descendants.push(...childTree.entries)
              slotChildren[slotInstanceKey] = Object.freeze(childTrees.map(tree => tree.instance.instanceKey))
              return Object.freeze({
                instanceKey: slotInstanceKey,
                contentBounds: unionPlanBounds(childTrees.map(tree => tree.plan)),
                childPlans: Object.freeze(childTrees.map(tree => tree.plan)),
              })
            },
          }))
          throwMaterialLayoutBudgetFailure(budget)
          throwIfAborted(signal)
          const observed = auditMaterialLayoutPlan(measuredPlan, {
            maxRuntimeRows: deps.budget.maxRuntimeRows,
            maxLayoutFacts: deps.budget.maxLayoutFacts,
          })
          const accepted = enforceRuntimeBudget({
            instanceKey,
            nodeId: node.id,
            documentRevision: input.documentRevision,
            dataRevision: input.dataRevision,
            observedRows: observed.runtimeRows,
            observedLayoutFacts: observed.layoutFacts,
            observedRenderTreeNodes: 0,
            budget: {
              ...DEFAULT_VIEWER_PERFORMANCE_BUDGET,
              maxRuntimeRows: deps.budget.maxRuntimeRows,
              maxLayoutFactsPerMaterial: deps.budget.maxLayoutFacts,
            },
            reportDiagnostic: reportBudgetDiagnostic,
          })
          if (!accepted)
            throw new Error(budgetFailure?.code ?? 'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED')
          return measuredPlan
        }
        finally {
          await collections.dispose()
        }
      },
    }) as MaterialLayoutPlan
  }
  catch (error) {
    const stickyFailure = layoutBudget ? readMaterialLayoutBudgetFailure(layoutBudget) : undefined
    const diagnostic = stickyFailure?.diagnostic ?? budgetFailure
    if (!diagnostic || (!stickyFailure && !isRuntimeBudgetExceeded(error)))
      throw error
    return createBudgetQuarantinedTree({
      instanceKey,
      node,
      nodeSnapshot,
      model,
      scope,
      resolvedModel,
      constraintKey,
      diagnostic,
    })
  }
  finally {
    nodeController.dispose()
  }
  const committedPlan = plan
  if (!callbackRan) {
    const cached = materializeArtifact(context.artifacts.get(committedPlan), context.deps.measureService)
    if (cached)
      return cached
    if (!context.artifactRetryAvailable)
      throw new Error('MATERIAL_MEASURE_SUBTREE_ARTIFACT_STALE')
    context.deps.measureService.invalidateNode(node.id)
    return measureInstance({ ...context, artifactRetryAvailable: false })
  }
  throwIfAborted(signal)
  embeddedFragmentPlan ??= createFullRangeEmbeddedFragment(committedPlan, fragmentAdapter)
  const instance: RuntimeMaterialInstancePlan = Object.freeze({
    instanceKey,
    nodeId: node.id,
    node: nodeSnapshot,
    scopeKey: scope.key,
    scopeData: scope.data,
    status: model.status,
    ...(model.diagnostic === undefined ? {} : { diagnostic: copyAndFreezeJson(model.diagnostic) }),
    resolvedModel,
    layoutPlan: committedPlan,
    ...(embeddedFragmentPlan === undefined ? {} : { embeddedFragmentPlan }),
    slotChildren: freezeSlotChildren(slotChildren),
  })
  const ownEntry = Object.freeze({ instanceKey, plan: committedPlan, instance })
  const tree = Object.freeze({
    plan: committedPlan,
    instance,
    entries: Object.freeze([ownEntry, ...descendants]),
  })
  context.artifacts.set(committedPlan, createCachedArtifact(tree))
  return tree
}

function createFullRangeEmbeddedFragment(
  plan: MaterialLayoutPlan,
  adapter: MaterialFragmentAdapter | undefined,
): MaterialFragmentPlan {
  if (plan.borderBox.height === 0) {
    return createNonFragmentingMaterialPlans({
      instanceKey: plan.instanceKey,
      nodeId: plan.nodeId,
      nodeRevision: plan.nodeRevision,
      constraintKey: plan.constraintKey,
      pageIndex: 0,
      borderBox: plan.borderBox,
      contentBox: plan.contentBox,
      fragmentBox: plan.borderBox,
    }).fragmentPlan
  }
  const request = Object.freeze({
    plan,
    startBlockOffset: 0,
    endBlockOffset: plan.borderBox.height,
    availableHeight: plan.borderBox.height,
    pageIndex: 0,
  })
  const contribution = adapter?.createFragment(request) ?? Object.freeze({
    inlineSize: plan.borderBox.width,
    blockSize: plan.borderBox.height,
    consumedRange: Object.freeze({
      startBlockOffset: 0,
      endBlockOffset: plan.borderBox.height,
    }),
    diagnostics: Object.freeze([]),
  })
  return commitMaterialFragment(request, contribution, {
    x: plan.borderBox.x,
    y: plan.borderBox.y,
  })
}

function createCachedArtifact(tree: MeasuredInstanceTree): CachedMeasuredArtifact {
  const [own, ...descendants] = tree.entries
  return Object.freeze({
    own: own!,
    descendants: Object.freeze(descendants.map(entry => Object.freeze({
      instanceKey: entry.instanceKey,
      plan: new WeakRef(entry.plan),
      instance: new WeakRef(entry.instance),
    }))),
  })
}

function materializeArtifact(
  artifact: CachedMeasuredArtifact | undefined,
  measureService: MeasureService,
): MeasuredInstanceTree | undefined {
  if (!artifact || !measureService.hasCachedPlan(artifact.own.plan))
    return undefined
  const entries: MeasuredInstanceTree['entries'][number][] = [artifact.own]
  for (const weak of artifact.descendants) {
    const plan = weak.plan.deref()
    const instance = weak.instance.deref()
    if (!plan || !instance || instance.layoutPlan !== plan || !measureService.hasCachedPlan(plan))
      return undefined
    entries.push(Object.freeze({ instanceKey: weak.instanceKey, plan, instance }))
  }
  return Object.freeze({
    plan: artifact.own.plan,
    instance: artifact.own.instance,
    entries: Object.freeze(entries),
  })
}

function unionPlanBounds(plans: readonly MaterialLayoutPlan[]): Readonly<{ x: number, y: number, width: number, height: number }> {
  if (plans.length === 0)
    return Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const plan of plans) {
    left = Math.min(left, plan.borderBox.x)
    top = Math.min(top, plan.borderBox.y)
    right = Math.max(right, plan.borderBox.x + plan.borderBox.width)
    bottom = Math.max(bottom, plan.borderBox.y + plan.borderBox.height)
  }
  return Object.freeze({ x: left, y: top, width: right - left, height: bottom - top })
}

export function createMaterialLayoutBudgetToken(input: {
  readonly instanceKey: string
  readonly nodeId: string
  readonly documentRevision: number
  readonly dataRevision: number
  readonly maxRuntimeRows: number
  readonly maxLayoutFacts: number
  readonly signal: AbortSignal
  readonly reportDiagnostic: (diagnostic: RuntimeBudgetDiagnostic) => void
}): MaterialLayoutBudgetToken {
  if (![input.maxRuntimeRows, input.maxLayoutFacts].every(isPositiveSafeInteger))
    throw new RangeError('MATERIAL_LAYOUT_BUDGET_LIMIT_INVALID')
  assertBudgetIdentity(input)
  let runtimeRowsUsed = 0
  let layoutFactsUsed = 0
  let token!: MaterialLayoutBudgetToken
  const reserve = (kind: 'rows' | MaterialLayoutFactKind, count: number): void => {
    const stickyFailure = readMaterialLayoutBudgetFailure(token)
    if (stickyFailure)
      throw stickyFailure.error
    throwIfAborted(input.signal)
    assertLayoutReserveCount(count)
    const rows = kind === 'rows'
    const used = rows ? runtimeRowsUsed : layoutFactsUsed
    const limit = rows ? input.maxRuntimeRows : input.maxLayoutFacts
    if (count > limit - used) {
      const code = rows
        ? 'VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED'
        : 'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED'
      const diagnostic: RuntimeBudgetDiagnostic = Object.freeze({
        code,
        detail: Object.freeze({
          instanceKey: input.instanceKey,
          nodeId: input.nodeId,
          documentRevision: input.documentRevision,
          dataRevision: input.dataRevision,
          kind,
          used,
          requested: count,
          limit,
        }),
      })
      const failure = Object.freeze({ error: new Error(code), diagnostic })
      materialLayoutBudgetFailures.set(token, failure)
      safeReportDiagnostic(input.reportDiagnostic, diagnostic)
      throw failure.error
    }
    if (rows)
      runtimeRowsUsed += count
    else
      layoutFactsUsed += count
  }
  token = Object.freeze({
    maxRuntimeRows: input.maxRuntimeRows,
    maxLayoutFacts: input.maxLayoutFacts,
    get runtimeRowsUsed() { return runtimeRowsUsed },
    get layoutFactsUsed() { return layoutFactsUsed },
    reserveRuntimeRows(count: number): void {
      reserve('rows', count)
    },
    reserveLayoutFacts(kind: MaterialLayoutFactKind, count: number): void {
      const stickyFailure = readMaterialLayoutBudgetFailure(token)
      if (stickyFailure)
        throw stickyFailure.error
      if (!['row', 'cell', 'edge', 'slot', 'box', 'custom'].includes(kind))
        throw new Error('MATERIAL_LAYOUT_FACT_KIND_INVALID')
      reserve(kind, count)
    },
  })
  return token
}

function readMaterialLayoutBudgetFailure(
  token: MaterialLayoutBudgetToken,
): MaterialLayoutBudgetFailure | undefined {
  return materialLayoutBudgetFailures.get(token)
}

function throwMaterialLayoutBudgetFailure(token: MaterialLayoutBudgetToken): void {
  const failure = readMaterialLayoutBudgetFailure(token)
  if (failure)
    throw failure.error
}

export function createMaterialRenderBudgetToken(input: MaterialBudgetIdentity & {
  readonly maxNodes: number
  readonly signal: AbortSignal
  readonly reportDiagnostic: (diagnostic: RuntimeBudgetDiagnostic) => void
}): MaterialRenderBudgetToken {
  if (!isPositiveSafeInteger(input.maxNodes) || input.maxNodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
    throw new RangeError('MATERIAL_RENDER_BUDGET_LIMIT_INVALID')
  assertBudgetIdentity(input)
  let nodesUsed = 0
  return Object.freeze({
    maxNodes: input.maxNodes,
    get nodesUsed() { return nodesUsed },
    reserveNodes(kind: MaterialRenderNodeKind, count: number): void {
      throwIfAborted(input.signal)
      if (!['element', 'text', 'fragment', 'markup', 'imperative'].includes(kind))
        throw new Error('MATERIAL_RENDER_NODE_KIND_INVALID')
      assertRenderReserveCount(count)
      if (count > input.maxNodes - nodesUsed) {
        const code = 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED'
        safeReportDiagnostic(input.reportDiagnostic, {
          code,
          detail: {
            instanceKey: input.instanceKey,
            nodeId: input.nodeId,
            documentRevision: input.documentRevision,
            dataRevision: input.dataRevision,
            kind,
            used: nodesUsed,
            requested: count,
            limit: input.maxNodes,
          },
        })
        throw new Error(code)
      }
      nodesUsed += count
    },
  })
}

export function enforceRuntimeBudget(input: MaterialBudgetIdentity & {
  readonly observedRows: number
  readonly observedLayoutFacts: number
  readonly observedRenderTreeNodes: number
  readonly budget: ViewerPerformanceBudget
  readonly reportDiagnostic: (diagnostic: RuntimeBudgetDiagnostic) => void
}): boolean {
  assertBudgetIdentity(input)
  if (![input.observedRows, input.observedLayoutFacts, input.observedRenderTreeNodes].every(isNonNegativeSafeInteger))
    throw new RangeError('VIEWER_RUNTIME_BUDGET_OBSERVED_INVALID')
  assertViewerPerformanceBudget(input.budget)
  const checks = [
    ['VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED', input.observedRows, input.budget.maxRuntimeRows],
    ['VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED', input.observedLayoutFacts, input.budget.maxLayoutFactsPerMaterial],
    ['VIEWER_RENDER_TREE_BUDGET_EXCEEDED', input.observedRenderTreeNodes, input.budget.maxRenderTreeNodesPerMaterial],
  ] as const
  for (const [code, observed, limit] of checks) {
    if (observed <= limit)
      continue
    safeReportDiagnostic(input.reportDiagnostic, {
      code,
      detail: {
        instanceKey: input.instanceKey,
        nodeId: input.nodeId,
        documentRevision: input.documentRevision,
        dataRevision: input.dataRevision,
        limit,
        observed,
      },
    })
    return false
  }
  return true
}

function auditMaterialLayoutPlan(
  plan: MaterialLayoutPlan<unknown>,
  limits: Readonly<{ maxRuntimeRows: number, maxLayoutFacts: number }>,
): Readonly<{ runtimeRows: number, layoutFacts: number }> {
  let runtimeRows = 0
  let layoutFacts = plan.slotBoxes.length + plan.breakOpportunities.length
  if (layoutFacts > limits.maxLayoutFacts || plan.payload === undefined)
    return Object.freeze({ runtimeRows, layoutFacts })

  const factArrayKeys = new Set([
    'rows',
    'cells',
    'edges',
    'edgeSegments',
    'boxes',
    'facts',
    'slotBoxes',
    'breakOpportunities',
  ])
  const countedFactValues = new WeakSet<object>()
  const countedRows = new WeakSet<object>()
  const expanded = new WeakSet<object>()
  const stack: unknown[] = [plan.payload]
  while (stack.length > 0) {
    const value = stack.pop()!
    if (typeof value !== 'object' || value === null || expanded.has(value))
      continue
    expanded.add(value)
    if (Array.isArray(value)) {
      const length = readAuditArrayLength(value)
      for (let index = length - 1; index >= 0; index--) {
        const child = readAuditDataProperty(value, String(index))
        if (child.found)
          stack.push(child.value)
      }
      continue
    }
    for (const [childKey, child] of readAuditDataEntries(value)) {
      if (typeof child === 'object' && child !== null) {
        const semanticCount = Array.isArray(child) ? readAuditArrayLength(child) : 1
        if (childKey === 'rows' && !countedRows.has(child)) {
          countedRows.add(child)
          runtimeRows += semanticCount
        }
        if (factArrayKeys.has(childKey) && !countedFactValues.has(child)) {
          countedFactValues.add(child)
          layoutFacts += semanticCount
        }
      }
      if (runtimeRows > limits.maxRuntimeRows || layoutFacts > limits.maxLayoutFacts)
        break
      stack.push(child)
    }
    if (runtimeRows > limits.maxRuntimeRows || layoutFacts > limits.maxLayoutFacts)
      break
  }
  return Object.freeze({ runtimeRows, layoutFacts })
}

function readAuditArrayLength(value: readonly unknown[]): number {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'length')
    return descriptor && 'value' in descriptor && Number.isSafeInteger(descriptor.value) && descriptor.value >= 0
      ? descriptor.value as number
      : 0
  }
  catch {
    return 0
  }
}

function readAuditDataProperty(
  value: object,
  key: string,
): Readonly<{ found: true, value: unknown }> | Readonly<{ found: false }> {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor?.enumerable === true && 'value' in descriptor
      ? Object.freeze({ found: true, value: descriptor.value })
      : Object.freeze({ found: false })
  }
  catch {
    return Object.freeze({ found: false })
  }
}

function readAuditDataEntries(value: object): ReadonlyArray<readonly [string, unknown]> {
  let keys: string[]
  try {
    keys = Object.keys(value)
  }
  catch {
    return []
  }
  const entries: Array<readonly [string, unknown]> = []
  for (const key of keys) {
    const child = readAuditDataProperty(value, key)
    if (child.found)
      entries.push([key, child.value])
  }
  return entries
}

function createBudgetQuarantinedTree(input: {
  readonly instanceKey: string
  readonly node: MaterialNode
  readonly nodeSnapshot: Readonly<MaterialNode>
  readonly model: ResolvedRuntimeModel
  readonly scope: MaterialRuntimeScope
  readonly resolvedModel: Readonly<Record<string, unknown>>
  readonly constraintKey: string
  readonly diagnostic: RuntimeBudgetDiagnostic
}): MeasuredInstanceTree {
  const fallback = createNonFragmentingMaterialPlans({
    instanceKey: input.instanceKey,
    nodeId: input.node.id,
    nodeRevision: input.model.nodeRevision,
    constraintKey: input.constraintKey,
    pageIndex: 0,
    borderBox: {
      x: input.node.x,
      y: input.node.y,
      width: input.node.width,
      height: input.node.height,
    },
    fragmentBox: {
      x: input.node.x,
      y: input.node.y,
      width: input.node.width,
      height: input.node.height,
    },
  })
  const instance: RuntimeMaterialInstancePlan = Object.freeze({
    instanceKey: input.instanceKey,
    nodeId: input.node.id,
    node: input.nodeSnapshot,
    scopeKey: input.scope.key,
    scopeData: input.scope.data,
    status: 'quarantined',
    diagnostic: copyAndFreezeJson(input.diagnostic),
    resolvedModel: input.resolvedModel,
    layoutPlan: fallback.layoutPlan,
    embeddedFragmentPlan: fallback.fragmentPlan,
    slotChildren: Object.freeze({}),
  })
  const own = Object.freeze({ instanceKey: input.instanceKey, plan: fallback.layoutPlan, instance })
  return Object.freeze({
    plan: fallback.layoutPlan,
    instance,
    entries: Object.freeze([own]),
  })
}

function isRuntimeBudgetExceeded(error: unknown): boolean {
  return error instanceof Error && [
    'VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED',
    'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED',
    'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
  ].includes(error.message)
}

interface LinkedAbortController {
  readonly signal: AbortSignal
  readonly abort: (reason?: unknown) => void
  readonly dispose: () => void
}

function createLinkedAbortController(parent: AbortSignal): LinkedAbortController {
  const controller = new AbortController()
  const onAbort = (): void => controller.abort(parent.reason)
  if (parent.aborted)
    controller.abort(parent.reason)
  else
    parent.addEventListener('abort', onAbort, { once: true })
  return Object.freeze({
    signal: controller.signal,
    abort: (reason?: unknown) => controller.abort(reason),
    dispose: () => parent.removeEventListener('abort', onAbort),
  })
}

export function assertViewerPerformanceBudget(budget: ViewerPerformanceBudget): void {
  const positiveLimits = [
    budget.measureCacheEntries,
    budget.maxMeasureInFlight,
    budget.maxInlineDataNodes,
    budget.maxInlineDataStringBytes,
    budget.maxRuntimeRows,
    budget.maxLayoutFactsPerMaterial,
  ]
  if (!positiveLimits.every(isPositiveSafeInteger)
    || !isNonNegativeSafeInteger(budget.pageDomOverscan)
    || !isPositiveSafeInteger(budget.maxRenderTreeNodesPerMaterial)
    || budget.maxRenderTreeNodesPerMaterial > VIEWER_TREE_ABSOLUTE_MAX_NODES) {
    throw new RangeError('VIEWER_PERFORMANCE_BUDGET_INVALID')
  }
}

function withoutRepeatedRoots(
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
): DocumentSchema {
  const elements = document.elements.filter(node =>
    profile.getManifest(node.type)?.common.layout.pageRepeat !== 'every-output-page',
  )
  return elements.length === document.elements.length
    ? document
    : Object.freeze({ ...document, elements })
}

function commitRepeatedPageInstances(
  input: LayoutRuntimeInput,
  plan: CommittedPagePlan,
  profile: CompiledMaterialProfile,
): CommittedPagePlan {
  if (plan.pages.length === 0)
    return plan
  const repeatedById = new Map(input.document.elements
    .filter(node => profile.getManifest(node.type)?.common.layout.pageRepeat === 'every-output-page')
    .map(node => [node.id, node]))
  if (repeatedById.size === 0)
    return plan
  const paintableNodeIds = new Set([...repeatedById.keys()]
    .filter(nodeId => plan.outputStates.get(nodeId)?.shouldPaint === true))
  const placements = planRepeatedOverlays({
    nodes: [...repeatedById.values()],
    profile,
    pageCount: plan.pages.length,
    paintableNodeIds,
    occupiedNodeIds: collectMaterialGraphNodeIds(input.document, profile),
    occupiedInstanceKeys: plan.runtimeInstances.keys(),
    occupiedFragmentIds: collectCommittedFragmentIds(plan),
  })
  if (placements.length === 0)
    return plan

  const instances = new Map(plan.runtimeInstances)
  const outputStates = new Map(plan.outputStates)
  const fragmentsByPage = plan.pages.map(page => [...page.fragments])
  for (const placement of placements) {
    const sourceNode = repeatedById.get(placement.nodeId)
    const page = plan.pages[placement.pageIndex]
    if (!sourceNode || !page)
      continue
    const committedSource = plan.runtimeInstances.get(sourceNode.id)
    const source = committedSource?.node.type === sourceNode.type
      ? committedSource
      : createQuarantinedRepeatedSource(input, sourceNode)
    const sourceFragment = source.embeddedFragmentPlan
    if (!sourceFragment)
      continue
    const localY = resolveRepeatedElementLocalY(source.node, page.height)
    const y = page.yOffset + localY
    const node = copyAndFreezeJson(copyDefinedJsonValue({
      ...definedProperties(source.node as unknown as Record<string, unknown>),
      id: placement.virtualNodeId,
      y,
    })) as unknown as Readonly<MaterialNode>
    const layoutPlan = freezeMaterialLayoutPlan({
      ...source.layoutPlan,
      instanceKey: placement.virtualInstanceKey,
      nodeId: placement.virtualNodeId,
      borderBox: { ...source.layoutPlan.borderBox, y },
      contentBox: { ...source.layoutPlan.contentBox, y },
    })
    const fragmentPlan = freezeMaterialFragmentPlan({
      ...sourceFragment,
      id: placement.virtualFragmentId,
      sourceInstanceKey: placement.virtualInstanceKey,
      sourceNodeId: placement.virtualNodeId,
      box: { ...sourceFragment.box, y },
    })
    const resolvedModel = copyAndFreezeRecord({
      ...source.resolvedModel,
      __pageNumber: page.index + 1,
      __totalPages: plan.pages.length,
    })
    const instance: RuntimeMaterialInstancePlan = Object.freeze({
      ...source,
      instanceKey: placement.virtualInstanceKey,
      nodeId: placement.virtualNodeId,
      node,
      resolvedModel,
      layoutPlan,
      embeddedFragmentPlan: fragmentPlan,
    })
    if (instances.has(placement.virtualInstanceKey))
      throw new Error('VIEWER_REPEATED_INSTANCE_IDENTITY_COLLISION')
    instances.set(placement.virtualInstanceKey, instance)
    const sourceOutput = plan.outputStates.get(sourceNode.id)
    if (sourceOutput)
      outputStates.set(placement.virtualNodeId, sourceOutput)
    fragmentsByPage[placement.pageIndex]!.push(Object.freeze({ node, plan: layoutPlan, fragmentPlan }))
  }
  const pages = plan.pages.map((page, index) => Object.freeze({
    ...page,
    fragments: Object.freeze(fragmentsByPage[index]!),
  }))
  return Object.freeze({
    ...plan,
    pages: Object.freeze(pages),
    outputStates: createReadonlyMap(outputStates),
    runtimeInstances: createReadonlyMap(instances),
  })
}

function collectCommittedFragmentIds(plan: CommittedPagePlan): ReadonlySet<string> {
  const fragmentIds = new Set<string>()
  for (const page of plan.pages) {
    for (const fragment of page.fragments) {
      if (fragment.fragmentPlan)
        fragmentIds.add(fragment.fragmentPlan.id)
    }
  }
  for (const instance of plan.runtimeInstances.values()) {
    if (instance.embeddedFragmentPlan)
      fragmentIds.add(instance.embeddedFragmentPlan.id)
  }
  return fragmentIds
}

function collectMaterialGraphNodeIds(
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
): ReadonlySet<string> {
  const nodeIds = new Set<string>()
  walkMaterialNodes(document, profile, node => nodeIds.add(node.id))
  return nodeIds
}

function createQuarantinedRepeatedSource(
  input: LayoutRuntimeInput,
  sourceNode: MaterialNode,
): RuntimeMaterialInstancePlan {
  const facts = createNonFragmentingMaterialPlans({
    instanceKey: sourceNode.id,
    nodeId: sourceNode.id,
    nodeRevision: input.documentRevision,
    constraintKey: createLayoutConstraintKey({
      availableWidth: sourceNode.width,
      availableHeight: input.document.page.height,
      unit: input.document.unit,
      writingMode: 'horizontal-tb',
    }),
    pageIndex: 0,
    borderBox: { x: sourceNode.x, y: sourceNode.y, width: sourceNode.width, height: sourceNode.height },
    fragmentBox: { x: sourceNode.x, y: sourceNode.y, width: sourceNode.width, height: sourceNode.height },
  })
  return Object.freeze({
    instanceKey: sourceNode.id,
    nodeId: sourceNode.id,
    node: copyAndFreezeJson(sourceNode) as unknown as Readonly<MaterialNode>,
    scopeKey: 'document',
    scopeData: input.data,
    status: 'quarantined',
    diagnostic: Object.freeze({ code: 'MATERIAL_NODE_QUARANTINED' }),
    resolvedModel: copyAndFreezeRecord(sourceNode.model),
    layoutPlan: facts.layoutPlan,
    embeddedFragmentPlan: facts.fragmentPlan,
    slotChildren: Object.freeze({}),
  })
}

function resolveRepeatedElementLocalY(node: Readonly<MaterialNode>, pageHeight: number): number {
  if (pageHeight <= 0)
    return node.y
  const localY = node.y % pageHeight
  return localY < 0 ? localY + pageHeight : localY
}

function definedProperties(source: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined))
}

function copyDefinedJsonValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(copyDefinedJsonValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, copyDefinedJsonValue(child)]))
  }
  return value
}

export function flattenMeasurableNodes(
  roots: readonly MaterialNode[],
  outputStates: ReadonlyMap<string, EffectiveOutputState>,
): MaterialNode[] {
  const result: MaterialNode[] = []
  const visit = (node: MaterialNode): void => {
    if (outputStates.get(node.id)?.shouldMeasure !== true)
      return
    result.push(node)
    for (const children of Object.values(node.slots)) {
      for (const child of children)
        visit(child)
    }
  }
  for (const root of roots)
    visit(root)
  return result
}

function assertMeasurementDependencies(deps: MaterialMeasureNodesDependencies): void {
  if (deps.materials.profile !== deps.profile || deps.runtimeModelCache.profile !== deps.profile)
    throw new Error('MATERIAL_MEASURE_PROFILE_MISMATCH')
  if (!Object.values(deps.budget).every(isPositiveSafeInteger))
    throw new Error('MATERIAL_MEASURE_BUDGET_INVALID')
}

function assertLayoutReserveCount(count: number): void {
  if (!isNonNegativeSafeInteger(count))
    throw new RangeError('MATERIAL_LAYOUT_BUDGET_COUNT_INVALID')
}

function assertRenderReserveCount(count: number): void {
  if (!isNonNegativeSafeInteger(count))
    throw new RangeError('MATERIAL_RENDER_BUDGET_COUNT_INVALID')
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function assertBudgetIdentity(identity: MaterialBudgetIdentity): void {
  if (typeof identity.instanceKey !== 'string' || identity.instanceKey.length === 0
    || typeof identity.nodeId !== 'string' || identity.nodeId.length === 0
    || !isNonNegativeSafeInteger(identity.documentRevision)
    || !isNonNegativeSafeInteger(identity.dataRevision)) {
    throw new RangeError('MATERIAL_BUDGET_IDENTITY_INVALID')
  }
}

function safeReportDiagnostic(
  reportDiagnostic: (diagnostic: RuntimeBudgetDiagnostic) => void,
  diagnostic: RuntimeBudgetDiagnostic,
): void {
  try {
    reportDiagnostic(diagnostic)
  }
  catch {
    // Diagnostics observers cannot alter budget control flow.
  }
}

function freezeCommittedPages(pages: PaginationResult['pages']): readonly PaginationResult['pages'][number][] {
  return Object.freeze(pages.map(page => Object.freeze({
    index: page.index,
    sheetIndex: page.sheetIndex,
    width: page.width,
    height: page.height,
    yOffset: page.yOffset,
    fragments: Object.freeze(page.fragments.map(fragment => Object.freeze({
      node: copyAndFreezeJson(fragment.node) as unknown as Readonly<MaterialNode>,
      plan: freezeMaterialLayoutPlan(fragment.plan),
      ...(fragment.fragmentPlan === undefined ? {} : { fragmentPlan: freezeMaterialFragmentPlan(fragment.fragmentPlan) }),
    }))),
    pageContext: Object.freeze({ ...page.pageContext }),
  })))
}

function freezeOutputStates(source: ReadonlyMap<string, EffectiveOutputState>): ReadonlyMap<string, EffectiveOutputState> {
  return createReadonlyMap(new Map([...source].map(([key, value]) => [key, Object.freeze({ ...value })])))
}

function freezeRuntimeInstances(
  source: ReadonlyMap<string, RuntimeMaterialInstancePlan>,
): ReadonlyMap<string, RuntimeMaterialInstancePlan> {
  return createReadonlyMap(new Map([...source].map(([key, instance]) => [key, Object.freeze({
    instanceKey: instance.instanceKey,
    nodeId: instance.nodeId,
    node: copyAndFreezeJson(instance.node) as unknown as Readonly<MaterialNode>,
    scopeKey: instance.scopeKey,
    scopeData: copyAndFreezeRecord(instance.scopeData),
    status: instance.status,
    ...(instance.diagnostic === undefined ? {} : { diagnostic: copyAndFreezeJson(instance.diagnostic) }),
    resolvedModel: copyAndFreezeRecord(instance.resolvedModel),
    layoutPlan: freezeMaterialLayoutPlan(instance.layoutPlan),
    ...(instance.embeddedFragmentPlan === undefined
      ? {}
      : { embeddedFragmentPlan: freezeMaterialFragmentPlan(instance.embeddedFragmentPlan) }),
    slotChildren: freezeSlotChildren(instance.slotChildren),
  })])))
}

function freezeSlotChildren(
  source: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(source).map(([slotInstanceKey, childInstanceKeys]) => [
      slotInstanceKey,
      Object.freeze([...childInstanceKeys]),
    ]),
  ))
}

function freezeDiagnosticCopies(diagnostics: readonly unknown[]): readonly unknown[] {
  try {
    return Object.freeze(diagnostics.map(copyAndFreezeJson))
  }
  catch {
    throw new Error('LAYOUT_RUNTIME_DIAGNOSTIC_INVALID')
  }
}

function mergeStageDiagnostics(layout: readonly unknown[], pagination: readonly unknown[]): readonly unknown[] {
  const layoutReferences = new Set(layout)
  return [...layout, ...pagination.filter(diagnostic => !layoutReferences.has(diagnostic))]
}

function copyAndFreezeRecord(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const copied = copyAndFreezeJson(value)
  if (copied === null || typeof copied !== 'object' || Array.isArray(copied))
    throw new Error('LAYOUT_RUNTIME_RECORD_INVALID')
  return copied as Readonly<Record<string, unknown>>
}

function copyAndFreezeJson(value: unknown): JsonValue {
  assertJsonValue(value)
  return deepFreezeJsonValue(cloneJsonValue(value))
}

function assertRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('LAYOUT_RUNTIME_REVISION_INVALID')
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}
