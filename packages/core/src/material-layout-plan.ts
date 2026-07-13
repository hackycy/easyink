import type { MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import type { Rect } from './geometry'
import { assertJsonValue, cloneJsonValue, deepFreezeJsonValue } from '@easyink/shared'

export interface LayoutConstraints {
  readonly availableWidth: number
  readonly availableHeight: number
  readonly unit: 'mm' | 'pt' | 'px' | 'inch'
  readonly writingMode: 'horizontal-tb'
}

export interface LayoutPlanDiagnostic {
  readonly code: string
  readonly severity: 'info' | 'warning' | 'error'
  readonly message: string
  readonly instanceKey: string
  readonly nodeId: string
  readonly detail?: JsonValue
}

export interface MaterialSlotBox {
  readonly slotId: string
  readonly slotInstanceKey: string
  readonly box: Readonly<Rect>
  readonly ownership: 'free' | 'managed'
  readonly clip: boolean
}

export interface MaterialBreakOpportunity {
  readonly id: string
  readonly blockOffset: number
  readonly penalty: number
}

export interface MaterialLayoutPlan<TPayload = JsonValue> {
  readonly instanceKey: string
  readonly nodeId: string
  readonly nodeRevision: number
  readonly constraintKey: string
  readonly borderBox: Readonly<Rect>
  readonly contentBox: Readonly<Rect>
  readonly slotBoxes: readonly MaterialSlotBox[]
  readonly breakOpportunities: readonly MaterialBreakOpportunity[]
  readonly diagnostics: readonly LayoutPlanDiagnostic[]
  readonly payload?: TPayload
}

export interface NonFragmentingMaterialPlansInput {
  readonly instanceKey: string
  readonly nodeId: string
  readonly nodeRevision: number
  readonly constraintKey: string
  readonly pageIndex: number
  readonly borderBox: Readonly<Rect>
  readonly contentBox?: Readonly<Rect>
  readonly fragmentBox: Readonly<Rect>
}

export interface NonFragmentingMaterialPlans {
  readonly layoutPlan: MaterialLayoutPlan
  readonly fragmentPlan: MaterialFragmentPlan
}

export interface MaterialFragmentRequest {
  readonly plan: MaterialLayoutPlan
  readonly startBlockOffset: number
  readonly endBlockOffset: number
  readonly availableHeight: number
  readonly pageIndex: number
}

export interface MaterialFragmentPlan {
  readonly id: string
  readonly sourceInstanceKey: string
  readonly sourceNodeId: string
  readonly box: Readonly<Rect>
  readonly consumedRange: Readonly<{
    startBlockOffset: number
    endBlockOffset: number
  }>
  readonly renderPayload?: JsonValue
  readonly diagnostics: readonly LayoutPlanDiagnostic[]
}

/**
 * Material-owned fragment facts. Core owns fragment identity, page placement, and continuation.
 */
export interface MaterialFragmentContribution {
  readonly inlineSize: number
  readonly blockSize: number
  readonly consumedRange: Readonly<{
    startBlockOffset: number
    endBlockOffset: number
  }>
  readonly renderPayload?: JsonValue
  readonly diagnostics: readonly LayoutPlanDiagnostic[]
}

export interface MaterialFragmentAdapter {
  readonly createFragment: (request: MaterialFragmentRequest) => MaterialFragmentContribution
}

export interface MaterialTextMeasureInput {
  readonly text: string
  readonly availableWidth: number
  readonly unit: LayoutConstraints['unit']
  readonly style: Readonly<{
    fontFamily: string
    fontSize: number
    fontWeight?: string | number
    fontStyle?: 'normal' | 'italic' | 'oblique'
    lineHeight: number
    letterSpacing?: number
    whiteSpace: 'normal' | 'pre-wrap'
    overflowWrap: 'normal' | 'anywhere'
  }>
}

export interface MaterialTextMeasureResult {
  readonly width: number
  readonly height: number
}

/**
 * Within one data revision, key uniquely identifies the complete current/parent scope chain.
 * Core rejects cycles, conflicting data for a repeated key, and chains deeper than 32 scopes.
 */
export interface MaterialRuntimeScope {
  readonly key: string
  readonly data: Readonly<Record<string, unknown>>
  readonly parent?: MaterialRuntimeScope
}

export type MaterialBindingResolution
  = | Readonly<{ status: 'unbound' }>
    | Readonly<{ status: 'missing' }>
    | Readonly<{ status: 'invalid', code: string }>
    | Readonly<{ status: 'resolved', value: JsonValue }>

/** Returns raw semantic values. Display formatting is exclusively handled by formatBinding. */
export type MaterialBindingResolver = (
  port: string,
  scope?: MaterialRuntimeScope,
) => MaterialBindingResolution

export type MaterialDisplayBindingResolver = (
  port: string,
  scope?: MaterialRuntimeScope,
) => Readonly<
  | { status: 'unbound' | 'missing' | 'invalid' }
  | { status: 'resolved', text: string }
>

export interface MaterialCollectionCursor {
  readonly declaredRowCount?: number
  readonly keyMultiplicity: ReadonlyMap<string, number> | 'unknown'
  readonly readNext: (
    limit: number,
    signal: AbortSignal,
  ) => Promise<Readonly<{
    records: readonly Readonly<Record<string, unknown>>[]
    done: boolean
  }>>
  readonly close: () => void | Promise<void>
}

export type MaterialCollectionOpener = (
  port: string,
  scope: MaterialRuntimeScope,
  signal: AbortSignal,
) => Promise<Readonly<
  | { status: 'unbound' | 'missing' | 'invalid' }
  | { status: 'opened', cursor: MaterialCollectionCursor }
>>

export interface MaterialMeasureScheduler {
  readonly maxInFlight: number
  readonly mapOrdered: <T, R>(
    items: readonly T[],
    worker: (item: T, index: number, signal: AbortSignal) => Promise<R>,
    signal: AbortSignal,
  ) => Promise<readonly R[]>
}

export type MaterialLayoutFactKind = 'row' | 'cell' | 'edge' | 'slot' | 'box' | 'custom'

export interface MaterialLayoutBudgetToken {
  readonly maxRuntimeRows: number
  readonly maxLayoutFacts: number
  readonly runtimeRowsUsed: number
  readonly layoutFactsUsed: number
  readonly reserveRuntimeRows: (count: number) => void
  readonly reserveLayoutFacts: (kind: MaterialLayoutFactKind, count: number) => void
}

export type MaterialRenderNodeKind = 'element' | 'text' | 'fragment' | 'markup' | 'imperative'

export interface MaterialRenderBudgetToken {
  readonly maxNodes: number
  readonly nodesUsed: number
  readonly reserveNodes: (kind: MaterialRenderNodeKind, count: number) => void
}

export interface MaterialSlotInstancePlan {
  readonly instanceKey: string
  readonly contentBounds: Readonly<Rect>
  readonly childPlans: readonly MaterialLayoutPlan[]
}

export interface MaterialMeasureRequest {
  readonly mode: 'authoritative' | 'authoring-preview'
  readonly instanceKey: string
  readonly node: Readonly<MaterialNode>
  readonly scope: MaterialRuntimeScope
  readonly resolvedModel: Readonly<Record<string, unknown>>
  readonly nodeRevision: number
  readonly dataRevision: number
  readonly resourceRevision: number
  readonly constraints: LayoutConstraints
  readonly signal: AbortSignal
  readonly budget: MaterialLayoutBudgetToken
  readonly resolveBinding: MaterialBindingResolver
  readonly formatBinding: MaterialDisplayBindingResolver
  readonly openCollection: MaterialCollectionOpener
  readonly schedule: MaterialMeasureScheduler
  readonly measureText: (input: MaterialTextMeasureInput) => Promise<MaterialTextMeasureResult>
  readonly measureSlot: (
    input: Readonly<{
      slot: string
      scope: MaterialRuntimeScope
      constraints: LayoutConstraints
    }>,
    signal: AbortSignal,
  ) => Promise<MaterialSlotInstancePlan>
}

/** Pure material measurement/fragmentation adapter. It never returns pages. */
export interface MaterialViewerLayoutFacet {
  readonly resolveRuntimeModel?: (
    node: Readonly<MaterialNode>,
    scope: MaterialRuntimeScope,
    resolveBinding: MaterialBindingResolver,
    reportDiagnostic: (diagnostic: unknown) => void,
  ) => Readonly<Record<string, unknown>>
  readonly measure?: (request: MaterialMeasureRequest) => Promise<MaterialLayoutPlan>
  readonly fragment?: MaterialFragmentAdapter
}

export function createLayoutConstraintKey(input: LayoutConstraints): string {
  return [input.availableWidth, input.availableHeight, input.unit, input.writingMode].join(':')
}

/** Builds core-owned fallback facts for materials without a layout adapter. */
export function createNonFragmentingMaterialPlans(
  input: NonFragmentingMaterialPlansInput,
): NonFragmentingMaterialPlans {
  const diagnostics = Object.freeze([]) as readonly LayoutPlanDiagnostic[]
  const layoutPlan = freezeMaterialLayoutPlan({
    instanceKey: input.instanceKey,
    nodeId: input.nodeId,
    nodeRevision: input.nodeRevision,
    constraintKey: input.constraintKey,
    borderBox: input.borderBox,
    contentBox: input.contentBox ?? input.borderBox,
    slotBoxes: Object.freeze([]),
    breakOpportunities: Object.freeze([]),
    diagnostics,
  })
  const fragmentPlan = freezeMaterialFragmentPlan({
    id: JSON.stringify([
      'material-fragment',
      input.instanceKey,
      input.pageIndex,
      0,
      input.borderBox.height,
    ]),
    sourceInstanceKey: input.instanceKey,
    sourceNodeId: input.nodeId,
    box: input.fragmentBox,
    consumedRange: {
      startBlockOffset: 0,
      endBlockOffset: input.borderBox.height,
    },
    diagnostics,
  })

  return Object.freeze({ layoutPlan, fragmentPlan })
}

export function validateMaterialLayoutPlan<TPayload>(plan: MaterialLayoutPlan<TPayload>): LayoutPlanDiagnostic[] {
  const diagnostics: LayoutPlanDiagnostic[] = []

  if (!plan.instanceKey || !plan.nodeId || !plan.constraintKey
    || !Number.isSafeInteger(plan.nodeRevision) || plan.nodeRevision < 0) {
    diagnostics.push(createDiagnostic(
      plan,
      'LAYOUT_PLAN_IDENTITY_INVALID',
      'Layout identity, revision, and constraint key must be present and valid.',
    ))
  }

  try {
    if (plan.payload !== undefined)
      assertJsonValue(plan.payload)
  }
  catch {
    diagnostics.push(createDiagnostic(
      plan,
      'LAYOUT_PLAN_PAYLOAD_NOT_JSON',
      'Layout payload must be a strict JSON value.',
    ))
  }

  validateBox(plan, diagnostics, 'borderBox', plan.borderBox)
  validateBox(plan, diagnostics, 'contentBox', plan.contentBox)

  const slotInstanceKeys = new Set<string>()
  for (const slot of plan.slotBoxes) {
    if (!slot.slotId || !slot.slotInstanceKey || slotInstanceKeys.has(slot.slotInstanceKey)) {
      diagnostics.push(createDiagnostic(
        plan,
        'LAYOUT_PLAN_SLOT_INSTANCE_DUPLICATE',
        'Each measured slot instance must have non-empty IDs and appear exactly once in a material plan.',
        { slotId: slot.slotId, slotInstanceKey: slot.slotInstanceKey },
      ))
    }
    slotInstanceKeys.add(slot.slotInstanceKey)

    if (!isValidBox(slot.box)) {
      diagnostics.push(createDiagnostic(
        plan,
        'LAYOUT_PLAN_SLOT_BOX_INVALID',
        'A measured slot box must contain finite coordinates and non-negative dimensions.',
        { slotId: slot.slotId, slotInstanceKey: slot.slotInstanceKey },
      ))
    }
  }

  for (const diagnostic of plan.diagnostics) {
    try {
      if (diagnostic.detail !== undefined)
        assertJsonValue(diagnostic.detail)
      if (diagnostic.instanceKey !== plan.instanceKey || diagnostic.nodeId !== plan.nodeId)
        throw new Error('identity mismatch')
    }
    catch {
      diagnostics.push(createDiagnostic(
        plan,
        'LAYOUT_PLAN_DIAGNOSTIC_INVALID',
        'Layout diagnostics must match plan identity and contain strict JSON detail.',
      ))
    }
  }

  let previous = Number.NEGATIVE_INFINITY
  const breakIds = new Set<string>()
  for (const opportunity of plan.breakOpportunities) {
    if (!opportunity.id || breakIds.has(opportunity.id)
      || !Number.isFinite(opportunity.penalty) || opportunity.penalty < 0) {
      diagnostics.push(createDiagnostic(
        plan,
        'LAYOUT_PLAN_BREAK_INVALID',
        'Break IDs must be unique and penalties must be finite non-negative values.',
        { id: opportunity.id, penalty: String(opportunity.penalty) },
      ))
    }
    breakIds.add(opportunity.id)

    if (!Number.isFinite(opportunity.blockOffset) || opportunity.blockOffset <= previous
      || opportunity.blockOffset <= 0 || opportunity.blockOffset >= plan.borderBox.height) {
      diagnostics.push(createDiagnostic(
        plan,
        'LAYOUT_PLAN_BREAK_ORDER',
        'Internal break opportunities must have finite, strictly increasing offsets inside the border box.',
        { id: opportunity.id, blockOffset: String(opportunity.blockOffset) },
      ))
    }
    previous = opportunity.blockOffset
  }

  return diagnostics
}

export function freezeMaterialLayoutPlan<TPayload = JsonValue>(
  plan: MaterialLayoutPlan<TPayload>,
): MaterialLayoutPlan<TPayload> {
  assertDiagnosticDetails(plan.diagnostics)
  const payload = plan.payload === undefined
    ? {}
    : { payload: cloneAndFreezePersistedValue(plan.payload) }

  return Object.freeze({
    ...plan,
    borderBox: Object.freeze({ ...plan.borderBox }),
    contentBox: Object.freeze({ ...plan.contentBox }),
    slotBoxes: Object.freeze(plan.slotBoxes.map(slot => Object.freeze({
      ...slot,
      box: Object.freeze({ ...slot.box }),
    }))),
    breakOpportunities: Object.freeze(plan.breakOpportunities.map(item => Object.freeze({ ...item }))),
    diagnostics: freezeDiagnostics(plan.diagnostics),
    ...payload,
  }) as MaterialLayoutPlan<TPayload>
}

export function freezeMaterialFragmentPlan(plan: MaterialFragmentPlan): MaterialFragmentPlan {
  assertDiagnosticDetails(plan.diagnostics)
  const renderPayload = plan.renderPayload === undefined
    ? {}
    : { renderPayload: cloneAndFreezeJson(plan.renderPayload) }

  return Object.freeze({
    ...plan,
    box: Object.freeze({ ...plan.box }),
    consumedRange: Object.freeze({ ...plan.consumedRange }),
    ...renderPayload,
    diagnostics: freezeDiagnostics(plan.diagnostics),
  })
}

function validateBox(
  plan: Pick<MaterialLayoutPlan, 'instanceKey' | 'nodeId'>,
  diagnostics: LayoutPlanDiagnostic[],
  name: 'borderBox' | 'contentBox',
  box: Readonly<Rect>,
): void {
  if (isValidBox(box))
    return

  diagnostics.push(createDiagnostic(
    plan,
    'LAYOUT_PLAN_NON_FINITE_BOX',
    `${name} contains a non-finite value or negative size.`,
    { name, values: [box.x, box.y, box.width, box.height].map(String) },
  ))
}

function isValidBox(box: Readonly<Rect>): boolean {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && box.width >= 0
    && box.height >= 0
}

function createDiagnostic(
  plan: Pick<MaterialLayoutPlan, 'instanceKey' | 'nodeId'>,
  code: string,
  message: string,
  detail?: JsonValue,
): LayoutPlanDiagnostic {
  return {
    code,
    severity: 'error',
    message,
    instanceKey: plan.instanceKey,
    nodeId: plan.nodeId,
    ...(detail === undefined ? {} : { detail }),
  }
}

function assertDiagnosticDetails(diagnostics: readonly LayoutPlanDiagnostic[]): void {
  for (const diagnostic of diagnostics) {
    if (diagnostic.detail !== undefined)
      assertJsonValue(diagnostic.detail)
  }
}

function freezeDiagnostics(diagnostics: readonly LayoutPlanDiagnostic[]): readonly LayoutPlanDiagnostic[] {
  return Object.freeze(diagnostics.map(diagnostic => Object.freeze({
    ...diagnostic,
    ...(diagnostic.detail === undefined ? {} : { detail: cloneAndFreezeJson(diagnostic.detail) }),
  })))
}

function cloneAndFreezeJson<T extends JsonValue>(value: T): T {
  return deepFreezeJsonValue(cloneJsonValue(value))
}

function cloneAndFreezePersistedValue<T>(value: T): T {
  assertJsonValue(value)
  return cloneAndFreezeJson(value) as unknown as T
}
