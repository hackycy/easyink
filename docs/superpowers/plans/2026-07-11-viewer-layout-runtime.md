# Viewer Layout Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, cancellable Viewer layout pipeline in which `MeasureService` produces the shared `MaterialLayoutPlan`, core owns pagination, and the browser DOM adapter renders only committed plans.

**Architecture:** Viewer startup consumes the frozen `CompiledMaterialProfile` produced by the material-platform plan, then processes one immutable render task through runtime-model resolution, resource readiness, measurement, document layout, pagination, and paint. Every cache key contains explicit document, node, data, resource, and constraint revisions; material facets provide measurement facts and break opportunities but never paginate the document or mutate persisted Schema.

**Tech Stack:** TypeScript, Vitest, happy-dom, Vue-independent core services, browser DOM/SVG, pnpm workspace, Turbo.

---

## Dependencies And Boundaries

Execute this plan after [Material Platform Foundation](./2026-07-11-material-platform-foundation.md). It consumes these public contracts from that plan without redefining them:

- `CompiledMaterialProfile`
- `MaterialNode.model`, `modelVersion`, `slots`, and `bindings`
- `SchemaAdapter` semantic binding/resource enumeration
- `ViewerRenderTree`, opaque `SanitizedMarkup`, `ProfileMaterialRuntime`, `MaterialFacetHost`, and `FacetInstance`
- node-level quarantine and structured diagnostics

The [Complex Report Table](./2026-07-11-complex-report-table.md) plan implements the table-specific measure adapter, the generic Designer authoring-preview host that consumes `MaterialDesignerFacet.layout`, lazy runtime rows, and break opportunities on top of the contracts created here. This plan defines the shared request contract but does not implement table topology or Designer canvas integration.

The host owns data acquisition. `ViewerRuntime.open()` and `updateData()` receive prepared data and create a new `dataRevision`; neither Viewer nor a material facet fetches business data.

The canonical unit set is `mm | pt | px | inch`, matching `packages/shared/src/types.ts` and the existing conversion tables. CSS/device-pixel rounding occurs only in the DOM adapter; plans and hit-testing retain document-unit floating-point values.

Locked runtime rules for every task below:

- The foundation-created `ProfileMaterialRuntime` owns the Viewer's one `MaterialFacetHost`. It activates `MaterialViewerFacet` values and this plan extends their contracts; no layout stage creates a second registry, facet cache, or disposal path.
- A `FacetInstance` is profile-scoped and survives page virtualization. Per-page rendering disposes only tree mounts or imperative render mounts; `ViewerRuntime.destroy()` disposes the facet host.
- `remove` nodes never measure, lay out, or paint; `reserve` nodes measure and lay out but do not paint; `include` nodes do all three. Designer-only `editorState.hidden` never changes Viewer output.
- Core owns a monotonic consumed-block cursor. A material can expose legal break boundaries and render a core-requested range, but cannot choose a page, repeat its header, or return its own continuation token.
- Requested and committed Viewer inputs are separate. A document/data/resource revision becomes public as committed only after the matching generation finishes and paints; failed or superseded work cannot advance committed revisions.
- Every layout-affecting font and asset reaches a ready-or-failed terminal state before authoritative measurement. Terminal-state changes advance one monotonic `resourceRevision`.

## File Map

**Create:**

- `packages/core/src/material-layout-plan.ts` - shared immutable layout-plan and fragmentation contracts.
- `packages/core/src/material-layout-plan.test.ts` - plan validation and deterministic constraint-key tests.
- `packages/core/src/measure-service.ts` - resource-aware measurement orchestration and bounded cache.
- `packages/core/src/measure-service.test.ts` - cache, abort, diagnostic, and revision tests.
- `packages/viewer/src/resource-readiness.ts` - declared font/asset terminal-state orchestration.
- `packages/viewer/src/resource-readiness.test.ts` - readiness, failure, abort, and resource-revision tests.
- `packages/browser-dom/src/measure-text.ts` - document-unit browser text measurement with bounded revision-keyed caching.
- `packages/browser-dom/src/measure-text.test.ts` - CSS mapping, cleanup, cache, revision, and abort tests.
- `packages/viewer/src/render-task.ts` - render-generation ownership and stale-result suppression.
- `packages/viewer/src/render-task.test.ts` - cancellation and generation tests.
- `packages/viewer/src/runtime-model-resolver.ts` - profile-driven binding projection into read-only runtime models.
- `packages/viewer/src/readonly-map.ts` - closure-backed immutable map publication helper.
- `packages/viewer/src/runtime-model-resolver.test.ts` - binding scope, data revision, and isolation tests.
- `packages/viewer/src/effective-output-state.ts` - immutable include/remove/reserve resolution.
- `packages/viewer/src/effective-output-state.test.ts` - authoring/runtime separation and inherited-state tests.
- `packages/viewer/src/layout-runtime.ts` - staged prepare/measure/layout/paginate orchestration.
- `packages/viewer/src/prepared-collections.ts` - host datasource/inline-array collection opener and cursor ownership.
- `packages/viewer/src/measure-scheduler.ts` - cancellable bounded ordered measurement pool.
- `packages/viewer/src/layout-runtime.test.ts` - stage ordering, font readiness, and abort tests.
- `packages/viewer/src/page-dom-virtualizer.ts` - interactive whole-page DOM retention policy.
- `packages/viewer/src/page-dom-virtualizer.test.ts` - placeholder sizing and print materialization tests.
- `packages/viewer/src/runtime.performance.test.ts` - cancellation, memory-shape, and cache-budget regression tests.

**Modify:**

- `packages/core/src/material-viewer.ts` - replace direct measure/render coupling with plan and adapter contracts.
- `packages/core/src/material-extension.ts` - expose the same pure layout adapter on Designer facets for authoring previews.
- `packages/core/src/layout-plan.ts` - make document fragments reference material plans instead of mutated nodes.
- `packages/core/src/layout-strategy.ts` - consume measured boxes without changing Schema.
- `packages/core/src/pagination-engine.ts` - choose material break opportunities and enforce progress.
- `packages/core/src/pagination-engine.test.ts` - global pagination ownership and overflow behavior.
- `packages/core/src/page-layers.ts` and `packages/core/src/page-layers.test.ts` - manifest-driven output-page overlays.
- `packages/core/src/font.ts` - expose deterministic resource revisions and readiness.
- `packages/core/src/font.test.ts` - resource-revision tests.
- `packages/browser-dom/src/index.ts` - export browser text measurement.
- `packages/browser-dom/package.json` - declare the `@easyink/shared` workspace dependency used for canonical unit conversion.
- `packages/core/src/index.ts` - export new public contracts.
- `packages/viewer/src/font-loader.ts` - prepare all enumerated font resources before authoritative measure.
- `packages/viewer/src/material-runtime.ts` - expose active profile facets to binding, layout, fragment, and render stages without another host.
- `packages/viewer/src/render-surface.ts` - render committed plans through `@easyink/browser-dom` and controlled imperative mounts.
- `packages/viewer/src/render-surface.test.ts` - output visibility and committed-plan tests.
- `packages/viewer/src/runtime.ts` - bootstrap profile first and delegate to cancellable layout runtime.
- `packages/viewer/src/runtime.audit.test.ts` - pipeline and quarantine integration tests.
- `packages/viewer/src/types.ts` - public input revisions and performance-budget options.
- `packages/viewer/src/index.ts` - public exports.
- `.github/architecture/06-render-pipeline.md` - document the implemented staged pipeline.
- `.github/architecture/07-layout-engine.md` - document `MaterialLayoutPlan` ownership.
- `.github/architecture/20-performance.md` - document cache keys and budgets.

**Delete:**

- `packages/viewer/src/conditional-schema.ts` and `packages/viewer/src/conditional-schema.test.ts` - Schema-cloning condition path superseded by immutable effective output state.

### Task 1: Define The Immutable Material Layout Contract

**Files:**
- Create: `packages/core/src/material-layout-plan.ts`
- Create: `packages/core/src/material-layout-plan.test.ts`
- Modify: `packages/core/src/material-viewer.ts`
- Modify: `packages/core/src/material-extension.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from 'vitest'
import { createLayoutConstraintKey, freezeMaterialLayoutPlan, validateMaterialLayoutPlan } from './material-layout-plan'

describe('material layout plan', () => {
  it('builds a stable key from all layout constraints', () => {
    expect(createLayoutConstraintKey({
      availableWidth: 210,
      availableHeight: 297,
      unit: 'mm',
      writingMode: 'horizontal-tb',
    })).toBe('210:297:mm:horizontal-tb')
  })

  it('rejects non-finite geometry, duplicate slot instances, and unordered break offsets', () => {
    expect(validateMaterialLayoutPlan({
      instanceKey: 'n1',
      nodeId: 'n1',
      nodeRevision: -1,
      constraintKey: '',
      borderBox: { x: 0, y: 0, width: Number.NaN, height: 20 },
      contentBox: { x: 0, y: 0, width: 10, height: 20 },
      slotBoxes: [
        { slotId: 'content', slotInstanceKey: 'slot-1', box: { x: 0, y: 0, width: 10, height: 10 }, ownership: 'managed', clip: true },
        { slotId: 'content', slotInstanceKey: 'slot-1', box: { x: 0, y: 10, width: 10, height: 10 }, ownership: 'managed', clip: true },
      ],
      breakOpportunities: [
        { id: 'b2', blockOffset: 10, penalty: 0 },
        { id: 'b2', blockOffset: 5, penalty: Number.NaN },
      ],
      diagnostics: [],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LAYOUT_PLAN_NON_FINITE_BOX' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_IDENTITY_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_SLOT_INSTANCE_DUPLICATE' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_INVALID' }),
      expect.objectContaining({ code: 'LAYOUT_PLAN_BREAK_ORDER' }),
    ]))
  })

  it('publishes a recursively frozen copy of material facts', () => {
    const source = {
      instanceKey: 'n1', nodeId: 'n1', nodeRevision: 3,
      constraintKey: '210:297:mm:horizontal-tb',
      borderBox: { x: 0, y: 0, width: 10, height: 20 },
      contentBox: { x: 0, y: 0, width: 10, height: 20 },
      slotBoxes: [{ slotId: 'content', slotInstanceKey: 'slot-1', box: { x: 0, y: 0, width: 10, height: 20 }, ownership: 'managed' as const, clip: true }],
      breakOpportunities: [{ id: 'b1', blockOffset: 10, penalty: 0 }],
      diagnostics: [],
      payload: { rows: [{ id: 'r1' }] },
    }
    const published = freezeMaterialLayoutPlan(source)
    expect(published).not.toBe(source)
    expect(Object.isFrozen(published)).toBe(true)
    expect(Object.isFrozen(published.slotBoxes[0]?.box)).toBe(true)
    expect(Object.isFrozen((published.payload as { rows: unknown[] }).rows)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `pnpm exec vitest run packages/core/src/material-layout-plan.test.ts --dom`

Expected: FAIL because `./material-layout-plan` does not exist.

- [ ] **Step 3: Add the complete public data contract and validator**

```ts
import type { Rect } from './geometry'
import type { MaterialNode } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import { assertJsonValue } from '@easyink/shared'

export interface LayoutConstraints {
  availableWidth: number
  availableHeight: number
  unit: 'mm' | 'pt' | 'px' | 'inch'
  writingMode: 'horizontal-tb'
}

export interface LayoutPlanDiagnostic {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  instanceKey: string
  nodeId: string
  detail?: JsonValue
}

export interface MaterialSlotBox {
  slotId: string
  slotInstanceKey: string
  box: Rect
  ownership: 'free' | 'managed'
  clip: boolean
}

export interface MaterialBreakOpportunity {
  id: string
  blockOffset: number
  penalty: number
}

export interface MaterialLayoutPlan<TPayload = JsonValue> {
  instanceKey: string
  nodeId: string
  nodeRevision: number
  constraintKey: string
  borderBox: Rect
  contentBox: Rect
  slotBoxes: readonly MaterialSlotBox[]
  breakOpportunities: readonly MaterialBreakOpportunity[]
  diagnostics: readonly LayoutPlanDiagnostic[]
  payload?: TPayload
}

export interface MaterialFragmentRequest {
  plan: MaterialLayoutPlan
  startBlockOffset: number
  endBlockOffset: number
  availableHeight: number
  pageIndex: number
}

export interface MaterialFragmentPlan {
  id: string
  sourceInstanceKey: string
  sourceNodeId: string
  box: Rect
  consumedRange: Readonly<{ startBlockOffset: number, endBlockOffset: number }>
  renderPayload?: JsonValue
  diagnostics: readonly LayoutPlanDiagnostic[]
}

export interface MaterialFragmentContribution {
  inlineSize: number
  blockSize: number
  consumedRange: Readonly<{ startBlockOffset: number, endBlockOffset: number }>
  renderPayload?: JsonValue
  diagnostics: readonly LayoutPlanDiagnostic[]
}

export interface MaterialFragmentAdapter {
  createFragment: (request: MaterialFragmentRequest) => MaterialFragmentContribution
}

export interface MaterialTextMeasureInput {
  text: string
  availableWidth: number
  unit: LayoutConstraints['unit']
  style: Readonly<{
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
  width: number
  height: number
}

export interface MaterialMeasureRequest {
  mode: 'authoritative' | 'authoring-preview'
  instanceKey: string
  node: Readonly<MaterialNode>
  scope: MaterialRuntimeScope
  resolvedModel: Readonly<Record<string, unknown>>
  nodeRevision: number
  dataRevision: number
  resourceRevision: number
  constraints: LayoutConstraints
  signal: AbortSignal
  budget: MaterialLayoutBudgetToken
  resolveBinding: MaterialBindingResolver
  formatBinding: MaterialDisplayBindingResolver
  openCollection: MaterialCollectionOpener
  schedule: MaterialMeasureScheduler
  measureText: (input: MaterialTextMeasureInput) => Promise<MaterialTextMeasureResult>
  measureSlot: (input: {
    slot: string
    scope: MaterialRuntimeScope
    constraints: LayoutConstraints
  }, signal: AbortSignal) => Promise<MaterialSlotInstancePlan>
}

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

export type MaterialBindingResolver = (
  port: string,
  scope?: MaterialRuntimeScope,
) => MaterialBindingResolution

export type MaterialDisplayBindingResolver = (
  port: string,
  scope?: MaterialRuntimeScope,
) => Readonly<{ status: 'unbound' | 'missing' | 'invalid' } | { status: 'resolved', text: string }>

export interface MaterialCollectionCursor {
  readonly declaredRowCount?: number
  readonly keyMultiplicity: ReadonlyMap<string, number> | 'unknown'
  readNext: (limit: number, signal: AbortSignal) => Promise<Readonly<{ records: readonly Readonly<Record<string, unknown>>[], done: boolean }>>
  close: () => void | Promise<void>
}

export type MaterialCollectionOpener = (
  port: string,
  scope: MaterialRuntimeScope,
  signal: AbortSignal,
) => Promise<Readonly<{ status: 'unbound' | 'missing' | 'invalid' } | { status: 'opened', cursor: MaterialCollectionCursor }>>

export interface MaterialMeasureScheduler {
  readonly maxInFlight: number
  mapOrdered<T, R>(items: readonly T[], worker: (item: T, index: number, signal: AbortSignal) => Promise<R>, signal: AbortSignal): Promise<readonly R[]>
}

export type MaterialLayoutFactKind = 'row' | 'cell' | 'edge' | 'slot' | 'box' | 'custom'

export interface MaterialLayoutBudgetToken {
  readonly maxRuntimeRows: number
  readonly maxLayoutFacts: number
  readonly runtimeRowsUsed: number
  readonly layoutFactsUsed: number
  reserveRuntimeRows: (count: number) => void
  reserveLayoutFacts: (kind: MaterialLayoutFactKind, count: number) => void
}

export type MaterialRenderNodeKind = 'element' | 'text' | 'fragment' | 'markup' | 'imperative'

export interface MaterialRenderBudgetToken {
  readonly maxNodes: number
  readonly nodesUsed: number
  reserveNodes: (kind: MaterialRenderNodeKind, count: number) => void
}

export interface MaterialSlotInstancePlan {
  instanceKey: string
  contentBounds: Rect
  childPlans: readonly MaterialLayoutPlan[]
}

export interface MaterialViewerLayoutFacet {
  resolveRuntimeModel?: (
    node: Readonly<MaterialNode>,
    scope: MaterialRuntimeScope,
    resolveBinding: MaterialBindingResolver,
    reportDiagnostic: (diagnostic: unknown) => void,
  ) => Readonly<Record<string, unknown>>
  measure?: (request: MaterialMeasureRequest) => Promise<MaterialLayoutPlan>
  fragment?: MaterialFragmentAdapter
}

export function createLayoutConstraintKey(input: LayoutConstraints): string {
  return [input.availableWidth, input.availableHeight, input.unit, input.writingMode].join(':')
}

export function validateMaterialLayoutPlan(plan: MaterialLayoutPlan): LayoutPlanDiagnostic[] {
  const diagnostics: LayoutPlanDiagnostic[] = []
  if (!plan.instanceKey || !plan.nodeId || !plan.constraintKey
    || !Number.isSafeInteger(plan.nodeRevision) || plan.nodeRevision < 0) {
    diagnostics.push({
      code: 'LAYOUT_PLAN_IDENTITY_INVALID', severity: 'error',
      message: 'Layout identity, revision, and constraint key must be present and valid.',
      instanceKey: plan.instanceKey, nodeId: plan.nodeId,
    })
  }
  try {
    if (plan.payload !== undefined)
      assertJsonValue(plan.payload)
  }
  catch {
    diagnostics.push({
      code: 'LAYOUT_PLAN_PAYLOAD_NOT_JSON', severity: 'error',
      message: 'Layout payload must be a strict JSON value.',
      instanceKey: plan.instanceKey, nodeId: plan.nodeId,
    })
  }
  for (const [name, box] of [['borderBox', plan.borderBox], ['contentBox', plan.contentBox]] as const) {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width < 0 || box.height < 0) {
      diagnostics.push({
        code: 'LAYOUT_PLAN_NON_FINITE_BOX',
        severity: 'error',
        message: `${name} contains a non-finite value or negative size.`,
        instanceKey: plan.instanceKey,
        nodeId: plan.nodeId,
        detail: { name, values: [box.x, box.y, box.width, box.height].map(String) },
      })
    }
  }
  const slotInstanceKeys = new Set<string>()
  for (const slot of plan.slotBoxes) {
    if (!slot.slotId || !slot.slotInstanceKey || slotInstanceKeys.has(slot.slotInstanceKey)) {
      diagnostics.push({
        code: 'LAYOUT_PLAN_SLOT_INSTANCE_DUPLICATE', severity: 'error',
        message: 'Each measured slot instance must have non-empty IDs and appear exactly once in a material plan.',
        instanceKey: plan.instanceKey, nodeId: plan.nodeId,
        detail: { slotId: slot.slotId, slotInstanceKey: slot.slotInstanceKey },
      })
    }
    slotInstanceKeys.add(slot.slotInstanceKey)
    if (![slot.box.x, slot.box.y, slot.box.width, slot.box.height].every(Number.isFinite)
      || slot.box.width < 0 || slot.box.height < 0) {
      diagnostics.push({
        code: 'LAYOUT_PLAN_SLOT_BOX_INVALID', severity: 'error',
        message: 'A measured slot box must contain finite coordinates and non-negative dimensions.',
        instanceKey: plan.instanceKey, nodeId: plan.nodeId,
        detail: { slotId: slot.slotId, slotInstanceKey: slot.slotInstanceKey },
      })
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
      diagnostics.push({
        code: 'LAYOUT_PLAN_DIAGNOSTIC_INVALID', severity: 'error',
        message: 'Layout diagnostics must match plan identity and contain strict JSON detail.',
        instanceKey: plan.instanceKey, nodeId: plan.nodeId,
      })
    }
  }
  let previous = -Infinity
  const breakIds = new Set<string>()
  for (const opportunity of plan.breakOpportunities) {
    if (!opportunity.id || breakIds.has(opportunity.id)
      || !Number.isFinite(opportunity.penalty) || opportunity.penalty < 0) {
      diagnostics.push({
        code: 'LAYOUT_PLAN_BREAK_INVALID', severity: 'error',
        message: 'Break IDs must be unique and penalties must be finite non-negative values.',
        instanceKey: plan.instanceKey, nodeId: plan.nodeId,
        detail: { id: opportunity.id, penalty: String(opportunity.penalty) },
      })
    }
    breakIds.add(opportunity.id)
    if (!Number.isFinite(opportunity.blockOffset) || opportunity.blockOffset <= previous
      || opportunity.blockOffset <= 0 || opportunity.blockOffset >= plan.borderBox.height) {
      diagnostics.push({
        code: 'LAYOUT_PLAN_BREAK_ORDER',
        severity: 'error',
        message: 'Internal break opportunities must have finite, strictly increasing offsets inside the border box.',
        instanceKey: plan.instanceKey,
        nodeId: plan.nodeId,
        detail: { id: opportunity.id, blockOffset: String(opportunity.blockOffset) },
      })
    }
    previous = opportunity.blockOffset
  }
  return diagnostics
}

export function freezeMaterialLayoutPlan<TPayload = JsonValue>(
  plan: MaterialLayoutPlan<TPayload>,
): MaterialLayoutPlan<TPayload> {
  if (plan.payload !== undefined)
    assertJsonValue(plan.payload)
  const payload = plan.payload === undefined ? {} : { payload: freezeJson(plan.payload) }
  return Object.freeze({
    ...plan,
    borderBox: Object.freeze({ ...plan.borderBox }),
    contentBox: Object.freeze({ ...plan.contentBox }),
    slotBoxes: Object.freeze(plan.slotBoxes.map(slot => Object.freeze({
      ...slot,
      box: Object.freeze({ ...slot.box }),
    }))),
    breakOpportunities: Object.freeze(plan.breakOpportunities.map(item => Object.freeze({ ...item }))),
    diagnostics: Object.freeze(plan.diagnostics.map(item => Object.freeze({
      ...item,
      ...(item.detail === undefined ? {} : { detail: freezeJson(item.detail) }),
    }))),
    ...payload,
  })
}

export function freezeMaterialFragmentPlan(plan: MaterialFragmentPlan): MaterialFragmentPlan {
  if (plan.renderPayload !== undefined)
    assertJsonValue(plan.renderPayload)
  return Object.freeze({
    ...plan,
    box: Object.freeze({ ...plan.box }),
    consumedRange: Object.freeze({ ...plan.consumedRange }),
    ...(plan.renderPayload === undefined ? {} : { renderPayload: freezeJson(plan.renderPayload) }),
    diagnostics: Object.freeze(plan.diagnostics.map(item => Object.freeze({
      ...item,
      ...(item.detail === undefined ? {} : { detail: freezeJson(item.detail) }),
    }))),
  })
}

function freezeJson<T>(value: T): T {
  if (Array.isArray(value))
    return Object.freeze(value.map(freezeJson)) as T
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, freezeJson(child)]),
    )) as T
  }
  return value
}
```

```ts
// additions in packages/core/src/material-viewer.ts
export interface MaterialViewerFacet {
  extension: MaterialViewerExtension
  layout?: MaterialViewerLayoutFacet
  capabilities: {
    sanitizedMarkup?: boolean
    imperativeDom?: readonly string[]
  }
}

// addition in packages/core/src/material-extension.ts
export interface MaterialDesignerFacet {
  extension: MaterialDesignerExtension
  catalog: { group: string, order: number }
  localeMessages?: {
    messages?: Record<string, unknown>
    locales?: Record<string, Record<string, unknown>>
  }
  layout?: MaterialViewerLayoutFacet
}

export interface ViewerRenderContext {
  data: Readonly<Record<string, unknown>>
  resolvedModel: Readonly<Record<string, unknown>>
  instanceKey: string
  layoutPlan: MaterialLayoutPlan
  fragmentPlan: MaterialFragmentPlan
  renderSlot: (slotInstanceKey: string) => ViewerRenderTree
  renderBudget: MaterialRenderBudgetToken
  pageIndex: number
  unit: string
  zoom: number
  capabilities: ViewerRenderCapabilities
  reportDiagnostic?: (diagnostic: BindingFormatDiagnostic & { nodeId?: string }) => void
}
```

The border-box end is an implicit terminal boundary and is not repeated in `breakOpportunities`. Freeze isolated copies of every nested box/list/payload before publication; never freeze caller-owned model objects. Within one data revision, `MaterialRuntimeScope.key` uniquely identifies its complete current/parent scope chain; core rejects cyclic chains, repeated keys with different data, or depth beyond 32. `MaterialFragmentAdapter.createFragment()` returns only a contribution and must consume exactly the requested range. It supplies local inline/block size, never page coordinates; core rejects a mismatch, mints identity/source, and derives final page `box` from trusted document placement plus the page cursor. Material code cannot spoof identity, position, a continuation token, repeat, or rewind output.

Expose the same optional pure adapter on both runtime facets: `MaterialViewerFacet.layout?: MaterialViewerLayoutFacet` and `MaterialDesignerFacet.layout?: MaterialViewerLayoutFacet`. Viewer sends `mode:'authoritative'`; Designer sends `mode:'authoring-preview'`, marks provisional resource revisions, and never activates the Viewer facet. A material package exports one adapter object for both facets, and conformance compares geometry for identical model/scope/constraints. When `layout` is absent, core builds a non-fragmenting plan from canonical node geometry and creates only the full range. Materials never return pages. `resolveBinding()` returns a raw discriminated result and never formats semantic values; `formatBinding()` is the only preset display path. Unbound ports are distinct from bound-but-missing/invalid values. `openCollection()` first uses the host-owned prepared datasource capability and may fall back to a budgeted inline JSON array; its cursor is schema-external, cancellable, and closed exactly once. The host performs sorting, filtering, joins, and aggregates. `schedule.mapOrdered()` is a host-owned bounded pool: callers reserve budgets before queueing, no new work starts after abort/first failure, and output order remains stable. Core also injects `measureText()` after resource readiness and a per-instance budget. `measureSlot` mints a stable runtime instance key from parent instance, slot, and `scope.key`; it resolves child runtime models once, recursively enters the same service, and detects cycles. `renderSlot` references only committed measured instances, so paint never rebinds or expands records.

Export every new type and function from `packages/core/src/index.ts`.

- [ ] **Step 4: Run the focused tests**

Run: `pnpm exec vitest run packages/core/src/material-layout-plan.test.ts --dom`

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit the contract**

```bash
git add packages/core/src/material-layout-plan.ts packages/core/src/material-layout-plan.test.ts packages/core/src/material-viewer.ts packages/core/src/material-extension.ts packages/core/src/index.ts
git commit -m "feat(core): define material layout plans"
```

### Task 2: Implement Revision-Keyed MeasureService

**Files:**
- Create: `packages/core/src/measure-service.ts`
- Create: `packages/core/src/measure-service.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for cache identity, abort, and invalid plans**

```ts
import type { MaterialLayoutPlan } from './material-layout-plan'
import { describe, expect, it, vi } from 'vitest'
import { MeasureService } from './measure-service'

function plan(nodeRevision: number): MaterialLayoutPlan {
  return {
    instanceKey: 'n1',
    nodeId: 'n1',
    nodeRevision,
    constraintKey: '100:200:mm:horizontal-tb',
    borderBox: { x: 0, y: 0, width: 100, height: 20 },
    contentBox: { x: 0, y: 0, width: 100, height: 20 },
    slotBoxes: [],
    breakOpportunities: [],
    diagnostics: [],
  }
}

describe('MeasureService', () => {
  it('reuses only an exact dependency key', async () => {
    const measure = vi.fn(async () => plan(1))
    const service = new MeasureService({ maxEntries: 8 })
    const profile = {} as never
    const request = {
      profile, materialType: 'text', instanceKey: 'n1', nodeId: 'n1', nodeRevision: 1, dataRevision: 2,
      resourceRevision: 3, constraintKey: '100:200:mm:horizontal-tb', measure,
    }
    await service.measure(request)
    await service.measure(request)
    await service.measure({ ...request, dataRevision: 4 })
    await service.measure({ ...request, profile: {} as never })
    expect(measure).toHaveBeenCalledTimes(3)
  })

  it('does not cache an aborted request', async () => {
    const controller = new AbortController()
    controller.abort()
    const service = new MeasureService({ maxEntries: 8 })
    await expect(service.measure({
      profile: {} as never, materialType: 'text', instanceKey: 'n1', nodeId: 'n1', nodeRevision: 1, dataRevision: 1,
      resourceRevision: 1, constraintKey: 'k', signal: controller.signal,
      measure: async () => plan(1),
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(service.size).toBe(0)
  })
})

it('separates surface mode and delimiter-like identity components', async () => {
  const service = new MeasureService({ maxEntries: 8 })
  const preview = vi.fn(async () => plan('preview'))
  const authoritative = vi.fn(async () => plan('authoritative'))
  await service.measure(request({ mode: 'authoring-preview', instanceKey: 'a|b', nodeId: 'c', measure: preview }))
  await service.measure(request({ mode: 'authoritative', instanceKey: 'a', nodeId: 'b|c', measure: authoritative }))
  expect(preview).toHaveBeenCalledOnce()
  expect(authoritative).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `pnpm exec vitest run packages/core/src/measure-service.test.ts --dom`

Expected: FAIL because `MeasureService` is not exported.

- [ ] **Step 3: Implement the bounded service**

```ts
import type { MaterialLayoutPlan } from './material-layout-plan'
import type { CompiledMaterialProfile } from './material-profile'
import { freezeMaterialLayoutPlan, validateMaterialLayoutPlan } from './material-layout-plan'

export interface MeasureRequest {
  mode: 'authoritative' | 'authoring-preview'
  profile: CompiledMaterialProfile
  materialType: string
  instanceKey: string
  nodeId: string
  nodeRevision: number
  dataRevision: number
  resourceRevision: number
  constraintKey: string
  signal?: AbortSignal
  measure: (signal: AbortSignal) => Promise<MaterialLayoutPlan>
}

export class MeasureService {
  private readonly cache = new Map<string, { nodeId: string, plan: MaterialLayoutPlan }>()
  private readonly profileTokens = new WeakMap<CompiledMaterialProfile, number>()
  private nextProfileToken = 1
  private readonly maxEntries: number

  constructor(options: { maxEntries: number }) {
    this.maxEntries = Math.max(1, options.maxEntries)
  }

  get size(): number {
    return this.cache.size
  }

  async measure(request: MeasureRequest): Promise<MaterialLayoutPlan> {
    throwIfAborted(request.signal)
    const key = createMeasureKey(request, this.profileToken(request.profile))
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return cached.plan
    }
    const local = new AbortController()
    const unlink = linkAbort(request.signal, local)
    try {
      const measured = await request.measure(local.signal)
      throwIfAborted(local.signal)
      const errors = validateMaterialLayoutPlan(measured).filter(item => item.severity === 'error')
      if (measured.instanceKey !== request.instanceKey || measured.nodeId !== request.nodeId
        || measured.nodeRevision !== request.nodeRevision
        || measured.constraintKey !== request.constraintKey) {
        throw new Error('MEASURE_RESULT_IDENTITY_MISMATCH')
      }
      if (errors.length > 0)
        throw new Error(errors.map(item => item.code).join(','))
      const result = freezeMaterialLayoutPlan(measured)
      this.cache.set(key, { nodeId: request.nodeId, plan: result })
      while (this.cache.size > this.maxEntries)
        this.cache.delete(this.cache.keys().next().value as string)
      return result
    }
    finally {
      unlink()
    }
  }

  invalidateNode(nodeId: string): void {
    for (const [key, entry] of this.cache) {
      if (entry.nodeId === nodeId)
        this.cache.delete(key)
    }
  }

  clear(): void {
    this.cache.clear()
  }

  private profileToken(profile: CompiledMaterialProfile): number {
    const existing = this.profileTokens.get(profile)
    if (existing)
      return existing
    const created = this.nextProfileToken++
    this.profileTokens.set(profile, created)
    return created
  }
}

function createMeasureKey(request: MeasureRequest, profileToken: number): string {
  return JSON.stringify([profileToken, request.mode, request.materialType, request.instanceKey, request.nodeId,
    request.nodeRevision, request.dataRevision, request.resourceRevision, request.constraintKey])
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException('The operation was aborted.', 'AbortError')
}

function linkAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source)
    return () => {}
  const abort = () => target.abort(source.reason)
  source.addEventListener('abort', abort, { once: true })
  return () => source.removeEventListener('abort', abort)
}
```

Export the service from `packages/core/src/index.ts`.

- [ ] **Step 4: Run core tests**

Run: `pnpm exec vitest run packages/core/src/measure-service.test.ts packages/core/src/material-layout-plan.test.ts --dom`

Expected: PASS with no unhandled rejection.

- [ ] **Step 5: Commit the service**

```bash
git add packages/core/src/measure-service.ts packages/core/src/measure-service.test.ts packages/core/src/index.ts
git commit -m "feat(core): add deterministic measure service"
```

### Task 3: Make Declared Resource Readiness Part Of Measurement Revisions

**Files:**
- Modify: `packages/core/src/font.ts`
- Modify: `packages/core/src/font.test.ts`
- Create: `packages/viewer/src/resource-readiness.ts`
- Create: `packages/viewer/src/resource-readiness.test.ts`
- Modify: `packages/viewer/src/font-loader.ts`
- Create: `packages/browser-dom/src/measure-text.ts`
- Create: `packages/browser-dom/src/measure-text.test.ts`
- Modify: `packages/browser-dom/src/index.ts`
- Modify: `packages/browser-dom/package.json`

- [ ] **Step 1: Add failing resource-revision tests**

```ts
it('increments resourceRevision only when font readiness changes', async () => {
  const manager = new FontManager({
    listFonts: async () => [{
      family: 'Invoice Sans',
      displayName: 'Invoice Sans',
      weights: ['400'],
      styles: ['normal'],
      source: 'system',
    }],
    loadFont: async () => ({ type: 'system' }),
  })
  expect(manager.resourceRevision).toBe(0)
  await manager.loadFont('Invoice Sans')
  expect(manager.resourceRevision).toBe(1)
  await manager.loadFont('Invoice Sans')
  expect(manager.resourceRevision).toBe(1)
})

it('waits for assets and treats failure as a terminal revision change', async () => {
  const resources = createResourceReadinessCoordinator({
    prepareFont: async () => ({ state: 'ready' as const }),
    prepareAsset: async id => ({ state: id === 'missing' ? 'failed' as const : 'ready' as const }),
  })
  const result = await resources.prepare([
    { kind: 'font', value: 'Invoice Sans' },
    { kind: 'asset', value: 'missing' },
  ], new AbortController().signal)
  expect(result.resourceRevision).toBe(2)
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'VIEWER_ASSET_PREPARE_FAILED' }))
  const repeated = await resources.prepare([
    { kind: 'asset', value: 'missing' },
  ], new AbortController().signal)
  expect(repeated.resourceRevision).toBe(2)
  expect(repeated.diagnostics).toContainEqual(expect.objectContaining({ code: 'VIEWER_ASSET_PREPARE_FAILED' }))
})
```

```ts
// packages/browser-dom/src/measure-text.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserTextMeasureService } from './measure-text'

describe('BrowserTextMeasureService', () => {
  afterEach(() => vi.restoreAllMocks())

  it('measures text in document units and invalidates its cache by resource revision', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 96, height: 24 } as DOMRect)
    const measure = new BrowserTextMeasureService(document, { maxEntries: 8 })
    const input = {
      text: 'Invoice', availableWidth: 25.4, unit: 'mm' as const,
      style: {
        fontFamily: 'Invoice Sans', fontSize: 4, lineHeight: 1.5,
        whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const,
      },
    }
    expect(await measure.measure(input, 1, new AbortController().signal))
      .toEqual({ width: 25.4, height: 6.35 })
    await measure.measure(input, 1, new AbortController().signal)
    await measure.measure(input, 2, new AbortController().signal)
    expect(rect).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
  })

  it('rejects an aborted measurement without mounting a probe', async () => {
    const controller = new AbortController()
    controller.abort()
    const measure = new BrowserTextMeasureService(document, { maxEntries: 8 })
    await expect(measure.measure({
      text: 'Invoice', availableWidth: 100, unit: 'px',
      style: {
        fontFamily: 'sans-serif', fontSize: 12, lineHeight: 1.2,
        whiteSpace: 'normal', overflowWrap: 'normal',
      },
    }, 1, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(document.querySelector('[data-easyink-text-measure]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm exec vitest run packages/core/src/font.test.ts packages/viewer/src/resource-readiness.test.ts packages/browser-dom/src/measure-text.test.ts --dom`

Expected: FAIL because terminal resource revisions, the readiness coordinator, and browser text measurement do not exist.

- [ ] **Step 3: Add monotonic readiness tracking**

Add `private _resourceRevision = 0`, a getter, and increment it when a font cache entry changes into either terminal state (`ready` or `failed`) or when a failed entry later becomes ready:

```ts
get resourceRevision(): number {
  return this._resourceRevision
}

private markTerminal(key: string, next: { state: 'ready', source: FontSource } | { state: 'failed', error: string }): FontSource | undefined {
  const previous = this._cache.get(key)
  this._cache.set(key, next)
  if (previous?.state !== next.state)
    this._resourceRevision++
  return next.state === 'ready' ? next.source : undefined
}
```

Route system-font success, loaded-font success, and terminal failure through `markTerminal`. Implement `resource-readiness.ts` as an abort-aware coordinator over the profile-introspected `MaterialResourceSlot[]`; deduplicate `{kind,value}`, prepare unique resources concurrently, collect outcomes in input-key order, reject stale aborted work, and increment one coordinator revision only for first terminal transitions. A failed resource remains a terminal entry, emits the same stable diagnostic on every plan that depends on it, and uses the material's declared fallback dimensions/font, so it still unblocks authoritative measurement. Pass the coordinator's exact revision into every measure request. Runtime-data assets that are not declared by adapter introspection are paint-only and must use manifest-declared fallback geometry; a material cannot make authoritative dimensions depend on an undeclared resource.

```ts
// packages/viewer/src/resource-readiness.ts
type Resource = { kind: 'font' | 'asset', value: string }
type Terminal = { state: 'ready' | 'failed', message?: string }

export function createResourceReadinessCoordinator(deps: {
  prepareFont: (value: string, signal: AbortSignal) => Promise<Terminal>
  prepareAsset: (value: string, signal: AbortSignal) => Promise<Terminal>
}) {
  const terminal = new Map<string, Terminal>()
  let resourceRevision = 0
  return {
    async prepare(resources: readonly Resource[], signal: AbortSignal) {
      const diagnostics: Array<{ code: string, resource: Resource, message?: string }> = []
      const unique = [...new Map(resources.map(resource => [`${resource.kind}:${resource.value}`, resource])).values()]
      const outcomes = await Promise.all(unique.map(async (resource) => {
        const key = `${resource.kind}:${resource.value}`
        const existing = terminal.get(key)
        if (existing)
          return { resource, result: existing }
        if (signal.aborted)
          throw new DOMException('The operation was aborted.', 'AbortError')
        let result: Terminal
        try {
          result = await (resource.kind === 'font'
            ? deps.prepareFont(resource.value, signal)
            : deps.prepareAsset(resource.value, signal))
        }
        catch (cause) {
          if (signal.aborted)
            throw cause
          result = { state: 'failed', message: cause instanceof Error ? cause.message : String(cause) }
        }
        if (signal.aborted)
          throw new DOMException('The operation was aborted.', 'AbortError')
        terminal.set(key, result)
        resourceRevision++
        return { resource, result }
      }))
      for (const { resource, result } of outcomes) {
        if (result.state === 'failed') {
          diagnostics.push({
            code: resource.kind === 'font' ? 'VIEWER_FONT_PREPARE_FAILED' : 'VIEWER_ASSET_PREPARE_FAILED',
            resource,
            message: result.message,
          })
        }
      }
      return Object.freeze({ resourceRevision, diagnostics: Object.freeze(diagnostics) })
    },
  }
}
```

Implement the browser measurement capability with the same CSS wrapping contract used by semantic Viewer trees:

```ts
// packages/browser-dom/src/measure-text.ts
import type { MaterialTextMeasureInput, MaterialTextMeasureResult } from '@easyink/core'
import { convertUnit } from '@easyink/shared'

export class BrowserTextMeasureService {
  private readonly cache = new Map<string, MaterialTextMeasureResult>()

  constructor(
    private readonly document: Document,
    private readonly options: { maxEntries: number },
  ) {}

  measure(
    input: MaterialTextMeasureInput,
    resourceRevision: number,
    signal: AbortSignal,
  ): Promise<MaterialTextMeasureResult> {
    if (signal.aborted)
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
    const key = textMeasureKey(input, resourceRevision)
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return Promise.resolve(cached)
    }
    if (input.text.length === 0)
      return Promise.resolve(Object.freeze({ width: 0, height: 0 }))
    const element = this.document.createElement('div')
    element.dataset.easyinkTextMeasure = ''
    element.textContent = input.text
    element.style.position = 'fixed'
    element.style.left = '-100000px'
    element.style.top = '0'
    element.style.visibility = 'hidden'
    element.style.pointerEvents = 'none'
    element.style.contain = 'layout style paint'
    element.style.boxSizing = 'border-box'
    element.style.width = `${convertUnit(input.availableWidth, input.unit, 'px')}px`
    element.style.fontFamily = input.style.fontFamily
    element.style.fontSize = `${convertUnit(input.style.fontSize, input.unit, 'px')}px`
    element.style.fontWeight = String(input.style.fontWeight ?? 'normal')
    element.style.fontStyle = input.style.fontStyle ?? 'normal'
    element.style.lineHeight = String(input.style.lineHeight)
    element.style.letterSpacing = `${convertUnit(input.style.letterSpacing ?? 0, input.unit, 'px')}px`
    element.style.whiteSpace = input.style.whiteSpace
    element.style.overflowWrap = input.style.overflowWrap
    const parent = this.document.body ?? this.document.documentElement
    parent.appendChild(element)
    try {
      if (signal.aborted)
        throw new DOMException('The operation was aborted.', 'AbortError')
      const rect = element.getBoundingClientRect()
      const result = Object.freeze({
        width: convertUnit(rect.width, 'px', input.unit),
        height: convertUnit(rect.height, 'px', input.unit),
      })
      this.cache.set(key, result)
      while (this.cache.size > Math.max(1, this.options.maxEntries))
        this.cache.delete(this.cache.keys().next().value as string)
      return Promise.resolve(result)
    }
    finally {
      element.remove()
    }
  }

  clear(): void {
    this.cache.clear()
  }
}

function textMeasureKey(input: MaterialTextMeasureInput, resourceRevision: number): string {
  const values = [
    resourceRevision, input.unit, input.availableWidth, input.text,
    input.style.fontFamily, input.style.fontSize, input.style.fontWeight ?? 'normal',
    input.style.fontStyle ?? 'normal', input.style.lineHeight, input.style.letterSpacing ?? 0,
    input.style.whiteSpace, input.style.overflowWrap,
  ]
  return JSON.stringify(values)
}
```

Export `BrowserTextMeasureService` from `packages/browser-dom/src/index.ts`, add `"@easyink/shared": "workspace:*"` to `packages/browser-dom/package.json`, and construct one bounded service per Viewer runtime. `measureNodes()` injects `input => textMeasure.measure(input, resourceRevision, signal)` into every `MaterialMeasureRequest`; it never accepts a table-specific measurement service. Clear its cache during Viewer destruction.

- [ ] **Step 4: Run font and Viewer font tests**

Run: `pnpm exec vitest run packages/core/src/font.test.ts packages/viewer/src/resource-readiness.test.ts packages/browser-dom/src/measure-text.test.ts packages/viewer/src/runtime.audit.test.ts --dom`

Expected: PASS; existing font-failure diagnostics remain present.

- [ ] **Step 5: Commit font revision tracking**

```bash
git add packages/core/src/font.ts packages/core/src/font.test.ts packages/viewer/src/resource-readiness.ts packages/viewer/src/resource-readiness.test.ts packages/viewer/src/font-loader.ts packages/browser-dom/src/measure-text.ts packages/browser-dom/src/measure-text.test.ts packages/browser-dom/src/index.ts packages/browser-dom/package.json
git commit -m "feat(viewer): version terminal measurement resources"
```

### Task 4: Add Render Task Cancellation And Stale-Result Suppression

**Files:**
- Create: `packages/viewer/src/render-task.ts`
- Create: `packages/viewer/src/render-task.test.ts`

- [ ] **Step 1: Write the failing generation tests**

```ts
import { describe, expect, it } from 'vitest'
import { RenderTaskCoordinator } from './render-task'

describe('RenderTaskCoordinator', () => {
  it('aborts the previous generation and accepts only the current result', () => {
    const tasks = new RenderTaskCoordinator()
    const first = tasks.begin()
    const second = tasks.begin()
    expect(first.signal.aborted).toBe(true)
    expect(tasks.isCurrent(first.generation)).toBe(false)
    expect(tasks.isCurrent(second.generation)).toBe(true)
  })

  it('aborts the current task on dispose', () => {
    const tasks = new RenderTaskCoordinator()
    const task = tasks.begin()
    tasks.dispose()
    expect(task.signal.aborted).toBe(true)
    expect(() => tasks.begin()).toThrow('disposed')
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm exec vitest run packages/viewer/src/render-task.test.ts --dom`

Expected: FAIL because `RenderTaskCoordinator` does not exist.

- [ ] **Step 3: Implement the coordinator**

```ts
export interface RenderTaskToken {
  generation: number
  signal: AbortSignal
}

export class RenderTaskCoordinator {
  private generation = 0
  private controller: AbortController | null = null
  private disposed = false

  begin(): RenderTaskToken {
    if (this.disposed)
      throw new Error('RenderTaskCoordinator is disposed')
    this.controller?.abort('superseded')
    this.controller = new AbortController()
    return { generation: ++this.generation, signal: this.controller.signal }
  }

  isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation && this.controller?.signal.aborted === false
  }

  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    this.controller?.abort('disposed')
    this.controller = null
  }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `pnpm exec vitest run packages/viewer/src/render-task.test.ts --dom`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit cancellation ownership**

```bash
git add packages/viewer/src/render-task.ts packages/viewer/src/render-task.test.ts
git commit -m "feat(viewer): coordinate cancellable render tasks"
```

### Task 5: Resolve Effective Output And Immutable Runtime Models Once

**Files:**
- Create: `packages/viewer/src/runtime-model-resolver.ts`
- Create: `packages/viewer/src/runtime-model-resolver.test.ts`
- Create: `packages/viewer/src/effective-output-state.ts`
- Create: `packages/viewer/src/effective-output-state.test.ts`
- Create: `packages/viewer/src/readonly-map.ts`
- Create: `packages/viewer/src/readonly-map.test.ts`
- Modify: `packages/viewer/src/binding-projector.ts`
- Modify: `packages/core/src/condition.ts`
- Modify: `packages/core/src/material-viewer.ts`

- [ ] **Step 1: Write a failing profile-driven resolution test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { resolveEffectiveOutputStates } from './effective-output-state'
import { ProfileMaterialRuntime } from './material-runtime'
import { resolveRuntimeModels } from './runtime-model-resolver'

describe('resolveRuntimeModels', () => {
  it('activates through the shared facet host and freezes each result', async () => {
    const resolveRuntimeModel = vi.fn(() => ({ title: 'INV-1' }))
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'invoice',
      viewer: async () => ({
        extension: { render: vi.fn() },
        layout: { resolveRuntimeModel },
        capabilities: {},
      }),
    })])
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    const result = await resolveRuntimeModels({
      nodes: [profile.createNode('invoice', { id: 'n1' })],
      data: { invoice: { number: 'INV-1' } },
      dataRevision: 7,
      nodeRevisions: new Map([['n1', 11]]),
      nodeStates: new Map(),
      outputStates: new Map([['n1', { visibility: 'include', shouldMeasure: true, shouldPaint: true }]]),
      profile,
      materials,
      reportDiagnostic: vi.fn(),
    })
    expect(resolveRuntimeModel).toHaveBeenCalledTimes(1)
    expect(result.get('n1')).toMatchObject({ nodeId: 'n1', dataRevision: 7, value: { title: 'INV-1' } })
    expect(Object.isFrozen(result.get('n1')?.value)).toBe(true)
  })

  it('quarantines a projection failure without dropping the runtime instance', async () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'invoice',
      viewer: async () => ({
        extension: { render: vi.fn() },
        layout: { resolveRuntimeModel: () => { throw new Error('bad projection') } },
        capabilities: {},
      }),
    })])
    const materials = new ProfileMaterialRuntime(profile)
    await materials.prepare(['invoice'])
    const result = await resolveRuntimeModels({
      nodes: [profile.createNode('invoice', { id: 'n1' })], data: {}, dataRevision: 1,
      nodeRevisions: new Map([['n1', 1]]), nodeStates: new Map(),
      outputStates: new Map([['n1', { visibility: 'include', shouldMeasure: true, shouldPaint: true }]]),
      profile, materials, reportDiagnostic: vi.fn(),
    })
    expect(result.get('n1')).toMatchObject({ instanceKey: 'n1', status: 'quarantined' })
  })
})

it('keeps editor hidden state out of Viewer output and applies remove/reserve explicitly', () => {
  const profile = createTestCompiledMaterialProfile()
  const include = profile.createNode('box', {
    id: 'include', editorState: { hidden: true }, output: { visibility: 'include' },
  })
  const reserve = profile.createNode('box', { id: 'reserve', output: { visibility: 'reserve' } })
  const states = resolveEffectiveOutputStates([include, reserve], {}, profile)
  expect(states.get('include')).toMatchObject({ visibility: 'include', shouldMeasure: true, shouldPaint: true })
  expect(states.get('reserve')).toMatchObject({ visibility: 'reserve', shouldMeasure: true, shouldPaint: false })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm exec vitest run packages/viewer/src/runtime-model-resolver.test.ts --dom`

Expected: FAIL because the resolver module is missing.

- [ ] **Step 3: Implement one-pass runtime-model resolution**

```ts
// packages/viewer/src/readonly-map.ts
export function createReadonlyMap<K, V>(source: Map<K, V>): ReadonlyMap<K, V> {
  let view: ReadonlyMap<K, V>
  view = Object.freeze({
    [Symbol.toStringTag]: 'ReadonlyMap',
    get size() { return source.size },
    has: (key: K) => source.has(key),
    get: (key: K) => source.get(key),
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    forEach: (callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) =>
      source.forEach((value, key) => callback.call(thisArg, value, key, view)),
    [Symbol.iterator]: () => source[Symbol.iterator](),
  })
  return view
}

// packages/viewer/src/readonly-map.test.ts
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createReadonlyMap } from './readonly-map'

describe('createReadonlyMap', () => {
  it('exposes iteration without exposing mutation methods', () => {
    const view = createReadonlyMap(new Map([['a', 1]]))
    expect([...view]).toEqual([['a', 1]])
    expect('set' in view).toBe(false)
    expect('delete' in view).toBe(false)
    expect(Object.isFrozen(view)).toBe(true)
    expectTypeOf(view).toEqualTypeOf<ReadonlyMap<string, number>>()
  })
})

// packages/viewer/src/runtime-model-resolver.ts
import type { CompiledMaterialProfile, FacetInstance, MaterialNodeLoadState, MaterialRuntimeScope, MaterialViewerFacet } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { assertJsonValue } from '@easyink/shared'
import { createMaterialBindingResolver, projectMaterialRuntimeModel } from './binding-projector'
import { createReadonlyMap } from './readonly-map'
import type { EffectiveOutputState } from './effective-output-state'
import type { ProfileMaterialRuntime } from './material-runtime'

export interface ResolvedRuntimeModel {
  instanceKey: string
  nodeId: string
  scopeKey: string
  nodeRevision: number
  dataRevision: number
  status: 'ready' | 'quarantined'
  diagnostic?: unknown
  value: Readonly<Record<string, unknown>>
}

export interface RuntimeModelResolutionCache {
  readonly profile: CompiledMaterialProfile
  readonly entries: Map<string, ResolvedRuntimeModel>
  readonly maxEntries: number
}

export function createRuntimeModelResolutionCache(
  profile: CompiledMaterialProfile,
  maxEntries = 512,
): RuntimeModelResolutionCache {
  if (!Number.isInteger(maxEntries) || maxEntries < 1)
    throw new Error('RUNTIME_MODEL_CACHE_LIMIT_INVALID')
  return { profile, entries: new Map(), maxEntries }
}

export function resolveRuntimeModelInstance(input: {
  instanceKey: string
  scope: MaterialRuntimeScope
  node: MaterialNode
  dataRevision: number
  nodeRevision: number
  admissionState?: MaterialNodeLoadState
  cache: RuntimeModelResolutionCache
  materials: ProfileMaterialRuntime
  reportDiagnostic: (diagnostic: unknown) => void
}): ResolvedRuntimeModel {
  const key = JSON.stringify([input.instanceKey, input.node.id, input.nodeRevision, input.scope.key, input.dataRevision])
  const cached = input.cache.entries.get(key)
  if (cached) {
    input.cache.entries.delete(key)
    input.cache.entries.set(key, cached)
    return cached
  }
  const instance = input.materials.get(input.node.type) as FacetInstance<MaterialViewerFacet> | undefined
  if (input.admissionState?.status === 'quarantined' || instance?.state !== 'active' || !instance.value) {
    const diagnostic = input.admissionState?.diagnostics[0]
      ?? instance?.diagnostic
      ?? { code: 'VIEWER_FACET_UNAVAILABLE', nodeId: input.node.id }
    input.reportDiagnostic(diagnostic)
    const quarantined = Object.freeze({
      instanceKey: input.instanceKey, nodeId: input.node.id, scopeKey: input.scope.key,
      nodeRevision: input.nodeRevision, dataRevision: input.dataRevision,
      status: 'quarantined' as const, diagnostic, value: Object.freeze({}),
    })
    cacheRuntimeModel(input.cache, key, quarantined)
    return quarantined
  }
  try {
    const manifest = input.cache.profile.getManifest(input.node.type)!
    const resolveBinding = createMaterialBindingResolver({
      node: input.node,
      baseScope: input.scope,
      reportDiagnostic: input.reportDiagnostic,
    })
    const value = instance.value.layout?.resolveRuntimeModel
      ? instance.value.layout.resolveRuntimeModel(input.node, input.scope, resolveBinding, input.reportDiagnostic)
      : projectMaterialRuntimeModel(input.node, manifest.common.binding, resolveBinding, input.reportDiagnostic)
    assertJsonValue(value)
    const frozen = copyAndFreezeJson(value)
    if (!frozen || typeof frozen !== 'object' || Array.isArray(frozen))
      throw new TypeError('RUNTIME_MODEL_RECORD_REQUIRED')
    const resolved = Object.freeze({
      instanceKey: input.instanceKey,
      nodeId: input.node.id,
      scopeKey: input.scope.key,
      nodeRevision: input.nodeRevision,
      dataRevision: input.dataRevision,
      status: 'ready' as const,
      value: frozen,
    })
    cacheRuntimeModel(input.cache, key, resolved)
    return resolved
  }
  catch (cause) {
    const diagnostic = Object.freeze({
      code: 'RUNTIME_MODEL_RESOLVE_FAILED',
      nodeId: input.node.id,
      message: cause instanceof Error ? cause.message : String(cause),
    })
    input.reportDiagnostic(diagnostic)
    const quarantined = Object.freeze({
      instanceKey: input.instanceKey, nodeId: input.node.id, scopeKey: input.scope.key,
      nodeRevision: input.nodeRevision, dataRevision: input.dataRevision,
      status: 'quarantined' as const, diagnostic, value: Object.freeze({}),
    })
    cacheRuntimeModel(input.cache, key, quarantined)
    return quarantined
  }
}

export async function resolveRuntimeModels(input: {
  nodes: readonly MaterialNode[]
  data: Readonly<Record<string, unknown>>
  dataRevision: number
  nodeRevisions: ReadonlyMap<string, number>
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  outputStates: ReadonlyMap<string, EffectiveOutputState>
  profile: CompiledMaterialProfile
  materials: ProfileMaterialRuntime
  cache?: RuntimeModelResolutionCache
  reportDiagnostic: (diagnostic: unknown) => void
}): Promise<ReadonlyMap<string, ResolvedRuntimeModel>> {
  const cache = input.cache ?? createRuntimeModelResolutionCache(input.profile)
  if (cache.profile !== input.profile)
    throw new Error('RUNTIME_MODEL_CACHE_PROFILE_MISMATCH')
  const models = new Map<string, ResolvedRuntimeModel>()
  for (const node of input.nodes) {
    if (input.outputStates.get(node.id)?.shouldMeasure !== true)
      continue
    const resolved = resolveRuntimeModelInstance({
      instanceKey: node.id,
      scope: Object.freeze({ key: 'document', data: input.data }),
      node,
      dataRevision: input.dataRevision,
      nodeRevision: input.nodeRevisions.get(node.id) ?? 0,
      admissionState: input.nodeStates.get(node.id),
      cache,
      materials: input.materials,
      reportDiagnostic: input.reportDiagnostic,
    })
    models.set(resolved.instanceKey, resolved)
  }
  return createReadonlyMap(models)
}

function copyAndFreezeJson<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value))
    return value
  if (Array.isArray(value))
    return Object.freeze(value.map(copyAndFreezeJson)) as T
  return Object.freeze(Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, copyAndFreezeJson(child)]),
  )) as T
}

function cacheRuntimeModel(
  cache: RuntimeModelResolutionCache,
  key: string,
  value: ResolvedRuntimeModel,
): void {
  cache.entries.set(key, value)
  while (cache.entries.size > cache.maxEntries)
    cache.entries.delete(cache.entries.keys().next().value as string)
}
```

Use `MaterialViewerFacet.layout.resolveRuntimeModel?` as a pure, synchronous projection hook; it receives no DOM, clock, network, or mutation capability. `projectMaterialRuntimeModel()` is the default implementation driven by manifest port policies and adapter-declared binding slots. Key the bounded LRU resolver cache by an injective JSON tuple containing exact profile object token, `instanceKey`, node ID/revision, scope key, and data revision. One cache belongs to one active render task, uses the host's `measureCacheEntries` limit (not the layout-fact limit), is reused by nested `measureSlot`, and is cleared when the task ends. The separately retained committed runtime-instance registry counts against layout facts. Return closure-backed read-only maps; never cast or freeze a mutable `Map`. Add collision and eviction tests. Root nodes use `instanceKey=node.id` and scope `document`; nested calls reuse the resolver. Activation failures remain cached/quarantined, and this resolver never disposes a shared facet instance.

In `binding-projector.ts`, export the one port resolver used by default projection and layout facets:

```ts
export function createMaterialBindingResolver(input: {
  node: Readonly<MaterialNode>
  baseScope: MaterialRuntimeScope
  reportDiagnostic: (diagnostic: unknown) => void
}): MaterialBindingResolver {
  return (port, scope = input.baseScope) => {
    const binding = input.node.bindings[port]
    if (!binding)
      return Object.freeze({ status: 'unbound' })
    if (isDataContractBinding(binding)) {
      input.reportDiagnostic({ code: 'MATERIAL_BINDING_PORT_KIND_UNSUPPORTED', nodeId: input.node.id, port })
      return Object.freeze({ status: 'invalid', code: 'MATERIAL_BINDING_PORT_KIND_UNSUPPORTED' })
    }
    let cursor: MaterialRuntimeScope | undefined = scope
    const seen = new Set<MaterialRuntimeScope>()
    let resolved: unknown
    while (cursor && resolved === undefined) {
      if (seen.has(cursor) || seen.size >= 32) {
        input.reportDiagnostic({ code: 'MATERIAL_BINDING_SCOPE_INVALID', nodeId: input.node.id, port })
        break
      }
      seen.add(cursor)
      resolved = resolveBindingValue(binding, cursor.data)
      cursor = cursor.parent
    }
    if (resolved === undefined)
      return Object.freeze({ status: 'missing' })
    try {
      assertJsonValue(resolved)
      return Object.freeze({ status: 'resolved', value: copyAndFreezeJson(resolved) })
    }
    catch {
      input.reportDiagnostic({ code: 'MATERIAL_BINDING_RESULT_NOT_JSON', nodeId: input.node.id, port })
      return Object.freeze({ status: 'invalid', code: 'MATERIAL_BINDING_RESULT_NOT_JSON' })
    }
  }
}

export function createMaterialDisplayBindingResolver(
  input: Parameters<typeof createMaterialBindingResolver>[0],
): MaterialDisplayBindingResolver {
  const raw = createMaterialBindingResolver(input)
  return (port, scope = input.baseScope) => {
    const result = raw(port, scope)
    if (result.status !== 'resolved') return result
    const binding = input.node.bindings[port]!
    const formatted = formatBindingDisplayValue(result.value, binding, { data: scope.data })
    formatted.diagnostics.forEach(input.reportDiagnostic)
    return Object.freeze({ status: 'resolved', text: formatted.value })
  }
}
```

Import `isDataContractBinding` from `@easyink/schema`, the preset-only display formatter from `@easyink/core`, and `assertJsonValue` from `@easyink/shared`. Validate each port against the compiled manifest policy before evaluation: semantic collection/key ports call only the raw resolver and display ports alone may call the formatter. Legacy custom source produces `BINDING_FORMAT_CUSTOM_DISABLED` and is never executed. Legacy arrays and `bindIndex` have already been fanned out during admission. No table, chart, or material-type branch belongs here. Tests prove unbound/missing/invalid/resolved remain distinct and prefix/suffix/presets cannot turn a collection or identity key into display text.

Implement `resolveEffectiveOutputStates()` without cloning or mutating Schema. Read the persisted base from `node.output.visibility`, evaluate `node.output.renderCondition` through the common manifest condition capability, and combine states with `remove > reserve > include` precedence. Return frozen entries containing `visibility`, `shouldMeasure`, and `shouldPaint`; ignore `node.editorState.hidden`. Update `condition.ts` to read the canonical output field and remove its old `node.hidden` shortcut.

```ts
// packages/viewer/src/effective-output-state.ts
import type { CompiledMaterialProfile } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { resolveConditionalNode, resolveMaterialConditionCapability } from '@easyink/core'
import { createReadonlyMap } from './readonly-map'

export interface EffectiveOutputState {
  visibility: 'include' | 'remove' | 'reserve'
  shouldMeasure: boolean
  shouldPaint: boolean
}

export function resolveEffectiveOutputStates(
  nodes: readonly MaterialNode[],
  data: Record<string, unknown>,
  profile: CompiledMaterialProfile,
): ReadonlyMap<string, EffectiveOutputState> {
  const result = new Map<string, EffectiveOutputState>()
  const visit = (node: MaterialNode, inherited: EffectiveOutputState['visibility']) => {
    const capability = resolveMaterialConditionCapability(profile.getManifest(node.type)?.common.condition)
    const requested = capability && node.output.renderCondition
      ? resolveConditionalNode(node, data).state
      : 'include'
    const allowed = requested === 'include' || capability?.hiddenEffects.includes(requested) ? requested : 'include'
    const own = node.output.visibility === 'remove' || allowed === 'remove'
      ? 'remove'
      : node.output.visibility === 'reserve' || allowed === 'reserve' ? 'reserve' : 'include'
    const visibility = inherited === 'remove' || own === 'remove'
      ? 'remove'
      : inherited === 'reserve' || own === 'reserve' ? 'reserve' : 'include'
    result.set(node.id, Object.freeze({
      visibility,
      shouldMeasure: visibility !== 'remove',
      shouldPaint: visibility === 'include',
    }))
    for (const children of Object.values(node.slots))
      children.forEach(child => visit(child, visibility))
  }
  nodes.forEach(node => visit(node, 'include'))
  return createReadonlyMap(result)
}
```

Keep the source map closure-private; do not cast or return a mutable `Map` as `ReadonlyMap`.

- [ ] **Step 4: Run binding tests**

Run: `pnpm exec vitest run packages/viewer/src/readonly-map.test.ts packages/viewer/src/runtime-model-resolver.test.ts packages/viewer/src/effective-output-state.test.ts packages/viewer/src/binding-projector.test.ts packages/core/src/condition.test.ts --dom`

Expected: PASS; no test reaches into table-private Schema.

- [ ] **Step 5: Commit runtime-model resolution**

```bash
git add packages/viewer/src/readonly-map.ts packages/viewer/src/readonly-map.test.ts packages/viewer/src/runtime-model-resolver.ts packages/viewer/src/runtime-model-resolver.test.ts packages/viewer/src/effective-output-state.ts packages/viewer/src/effective-output-state.test.ts packages/viewer/src/binding-projector.ts packages/core/src/condition.ts packages/core/src/condition.test.ts packages/core/src/material-viewer.ts
git commit -m "refactor(viewer): resolve output and runtime models once"
```

### Task 6: Build The Staged Layout Runtime

**Files:**
- Create: `packages/viewer/src/layout-runtime.ts`
- Create: `packages/viewer/src/layout-runtime.test.ts`
- Create: `packages/viewer/src/prepared-collections.ts`
- Create: `packages/viewer/src/prepared-collections.test.ts`
- Create: `packages/viewer/src/measure-scheduler.ts`
- Create: `packages/viewer/src/measure-scheduler.test.ts`
- Modify: `packages/core/src/layout-plan.ts`
- Modify: `packages/core/src/layout-strategy.ts`

- [ ] **Step 1: Write a failing stage-order test**

```ts
it('prepares resources before measure and paginates after every plan resolves', async () => {
  const calls: string[] = []
  const runtime = createLayoutRuntime({
    resolveEffectiveOutput: () => { calls.push('output'); return new Map() },
    prepareResources: async () => { calls.push('resources'); return 4 },
    resolveRuntimeModels: async () => { calls.push('bindings'); return new Map() },
    measureNodes: async () => { calls.push('measure'); return { plans: new Map(), instances: new Map() } },
    layoutDocument: () => {
      calls.push('layout')
      return { width: 210, height: 297, fragments: [], diagnostics: [] }
    },
    paginateDocument: () => {
      calls.push('paginate')
      return { mode: 'fixed', pages: [], diagnostics: [] }
    },
  })
  await runtime.plan({
    document: {
      version: '2.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 210, height: 297 },
      guides: { x: [], y: [] },
      elements: [],
    },
    nodeStates: new Map(),
    documentRevision: 1,
    data: {},
    dataRevision: 1,
  }, new AbortController().signal)
  expect(calls).toEqual(['output', 'bindings', 'resources', 'measure', 'layout', 'paginate'])
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm exec vitest run packages/viewer/src/layout-runtime.test.ts --dom`

Expected: FAIL because `createLayoutRuntime` does not exist.

- [ ] **Step 3: Implement the explicit pipeline**

```ts
import type {
  LayoutDocument, MaterialFragmentPlan, MaterialLayoutBudgetToken, MaterialLayoutFactKind,
  MaterialLayoutPlan, MaterialNodeLoadState, MaterialRenderBudgetToken, MaterialRenderNodeKind, PaginationResult,
} from '@easyink/core'
import { VIEWER_TREE_ABSOLUTE_MAX_NODES } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { ResolvedRuntimeModel } from './runtime-model-resolver'
import type { EffectiveOutputState } from './effective-output-state'

export interface LayoutRuntimeInput {
  document: DocumentSchema
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  documentRevision: number
  data: Readonly<Record<string, unknown>>
  dataRevision: number
}

export interface CommittedPagePlan {
  documentRevision: number
  dataRevision: number
  resourceRevision: number
  pages: PaginationResult['pages']
  outputStates: ReadonlyMap<string, EffectiveOutputState>
  runtimeInstances: ReadonlyMap<string, RuntimeMaterialInstancePlan>
  diagnostics: readonly unknown[]
}

export interface RuntimeMaterialInstancePlan {
  instanceKey: string
  nodeId: string
  node: Readonly<MaterialNode>
  scopeKey: string
  scopeData: Readonly<Record<string, unknown>>
  status: ResolvedRuntimeModel['status']
  diagnostic?: unknown
  resolvedModel: Readonly<Record<string, unknown>>
  layoutPlan: MaterialLayoutPlan
  embeddedFragmentPlan?: MaterialFragmentPlan
}

export interface MeasuredMaterialSet {
  plans: ReadonlyMap<string, MaterialLayoutPlan>
  instances: ReadonlyMap<string, RuntimeMaterialInstancePlan>
}

export interface LayoutRuntimeDependencies {
  resolveEffectiveOutput: (input: LayoutRuntimeInput) => ReadonlyMap<string, EffectiveOutputState>
  resolveRuntimeModels: (input: LayoutRuntimeInput & {
    outputStates: ReadonlyMap<string, EffectiveOutputState>
  }) => Promise<ReadonlyMap<string, ResolvedRuntimeModel>>
  prepareResources: (input: LayoutRuntimeInput & {
    runtimeModels: ReadonlyMap<string, ResolvedRuntimeModel>
    outputStates: ReadonlyMap<string, EffectiveOutputState>
  }, signal: AbortSignal) => Promise<number>
  measureNodes: (input: LayoutRuntimeInput & {
    runtimeModels: ReadonlyMap<string, ResolvedRuntimeModel>
    outputStates: ReadonlyMap<string, EffectiveOutputState>
    resourceRevision: number
  }, signal: AbortSignal) => Promise<MeasuredMaterialSet>
  layoutDocument: (
    document: DocumentSchema,
    plans: ReadonlyMap<string, MaterialLayoutPlan>,
  ) => LayoutDocument
  paginateDocument: (
    document: DocumentSchema,
    layout: LayoutDocument,
    plans: ReadonlyMap<string, MaterialLayoutPlan>,
  ) => PaginationResult
}

export function createLayoutRuntime(deps: LayoutRuntimeDependencies) {
  return {
    async plan(input: LayoutRuntimeInput, signal: AbortSignal): Promise<CommittedPagePlan> {
      throwIfAborted(signal)
      const outputStates = deps.resolveEffectiveOutput(input)
      const runtimeModels = await deps.resolveRuntimeModels({ ...input, outputStates })
      throwIfAborted(signal)
      const resourceRevision = await deps.prepareResources({ ...input, runtimeModels, outputStates }, signal)
      throwIfAborted(signal)
      const measured = await deps.measureNodes({
        ...input,
        runtimeModels,
        outputStates,
        resourceRevision,
      }, signal)
      throwIfAborted(signal)
      const materialPlans = measured.plans
      const layoutDocument = deps.layoutDocument(input.document, materialPlans)
      const pagePlan = deps.paginateDocument(input.document, layoutDocument, materialPlans)
      return Object.freeze({
        documentRevision: input.documentRevision,
        dataRevision: input.dataRevision,
        resourceRevision,
        pages: freezeCommittedPages(pagePlan.pages),
        outputStates: createReadonlyMap(new Map(outputStates)),
        runtimeInstances: createReadonlyMap(new Map([...measured.instances].map(([key, value]) => [key, freezeRuntimeInstanceCopy(value)]))),
        diagnostics: freezeDiagnosticCopies([...layoutDocument.diagnostics, ...pagePlan.diagnostics]),
      })
    },
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw new DOMException('The operation was aborted.', 'AbortError')
}
```

`freezeCommittedPages`, `freezeRuntimeInstanceCopy`, and `freezeDiagnosticCopies` rebuild every retained plain object/array before recursive freezing and reject non-JSON diagnostic detail. `scopeData` and `resolvedModel` are isolated frozen copies; layout/fragment plans use their dedicated copy-and-freeze helpers. Closure-backed map views are the only maps published. Tests attempt `set`, nested array mutation, source-object mutation after planning, and mutation of a caller-owned table model; none can alter the committed plan and the caller model remains unfrozen.

Change `LayoutFragment` in `layout-plan.ts` to contain `plan: MaterialLayoutPlan` and a read-only source node reference. Update layout strategies to use `plan.borderBox.height`; never assign measured width or height back to `MaterialNode`.

Before runtime-model resolution, flatten only branches whose inherited `EffectiveOutputState.shouldMeasure` is true. A removed owner removes its entire slot subtree; a reserved owner forces descendants to reserve. Rendering later consults the same frozen state map and never recomputes conditions.

Implement `measureNodes()` by reading the already-active `MaterialViewerFacet` from `ProfileMaterialRuntime`. Call `facet.layout.measure(request)` when present and the runtime model status is `ready`; otherwise create the core default geometry plan, preserving space for a quarantined sentinel without entering material code. Every Viewer request sets `mode:'authoritative'` and receives `createMaterialBindingResolver({ node, baseScope: scope, reportDiagnostic })`, the shared revision-keyed browser `measureText`, a fresh per-instance `createMaterialLayoutBudgetToken()` using host limits, and the core-owned `measureSlot`; facets never receive a table-specific service or their own default budget. Route both default and custom plans through `MeasureService` with the exact profile object, instance key, node revision, data revision, terminal resource revision, and constraint key. Nested `measureSlot` calls use the same service, abort signal, and `RuntimeModelResolutionCache`, but each nested material instance receives its own budget token; each returned `MaterialSlotInstancePlan.contentBounds` is the union of its committed child plan border boxes.

Create one `createBoundedMeasureScheduler(maxInFlight)` per runtime. Its `mapOrdered` starts at most `maxInFlight` workers, stores results by input index, observes abort before every dequeue, and after the first rejection starts no further item while awaiting/settling already-started work. Tests assert max in-flight, stable output order, first-error behavior, and cancellation visit counts rather than wall-clock timing.

`createMaterialCollectionOpener()` first asks the trusted host `PreparedCollectionProvider` using the canonical binding/source handle; if unavailable, it accepts only a raw resolver result whose status is `resolved` and value is a record array within the data-node/byte budget. `unbound` returns a quiet empty status; bound missing/invalid returns a diagnostic status. Validate declared counts, per-chunk records, key-index token/byte limits, monotonic completion, and the effective minimum of data/row/fact budgets before exposing a chunk. Wrap `close()` with an exactly-once async guard and invoke it on done, abort, validation failure, measure failure, supersession, and runtime destruction. Provider functions/cursors never enter Schema, runtime scope JSON, layout payloads, or caches.

- [ ] **Step 4: Run layout and reflow tests**

Run: `pnpm exec vitest run packages/viewer/src/layout-runtime.test.ts packages/core/src/page-planner.test.ts packages/core/src/reflow-engine.test.ts --dom`

Expected: PASS; tests assert the input document remains deeply equal to its pre-layout snapshot.

- [ ] **Step 5: Commit the staged runtime**

```bash
git add packages/viewer/src/layout-runtime.ts packages/viewer/src/layout-runtime.test.ts packages/viewer/src/prepared-collections.ts packages/viewer/src/prepared-collections.test.ts packages/viewer/src/measure-scheduler.ts packages/viewer/src/measure-scheduler.test.ts packages/core/src/layout-plan.ts packages/core/src/layout-strategy.ts
git commit -m "feat(viewer): stage deterministic layout planning"
```

### Task 7: Move All Page Breaking Into Core Pagination

**Files:**
- Modify: `packages/core/src/pagination-engine.ts`
- Modify: `packages/core/src/pagination-engine.test.ts`
- Modify: `packages/core/src/material-viewer.ts`
- Modify: `packages/core/src/page-layers.ts`
- Modify: `packages/core/src/page-layers.test.ts`

- [ ] **Step 1: Add failing pagination ownership tests**

```ts
it('selects from the remaining range and prefers the later offset on a penalty tie', () => {
  const selected = chooseBreak({
    instanceKey: 'table-1',
    nodeId: 'table-1',
    nodeRevision: 1,
    constraintKey: '100:100:mm:horizontal-tb',
    borderBox: { x: 0, y: 0, width: 100, height: 140 },
    contentBox: { x: 0, y: 0, width: 100, height: 140 },
    slotBoxes: [],
    breakOpportunities: [
      { id: 'row-1', blockOffset: 40, penalty: 1 },
      { id: 'row-2', blockOffset: 80, penalty: 0 },
      { id: 'row-3', blockOffset: 90, penalty: 0 },
      { id: 'row-4', blockOffset: 120, penalty: 0 },
    ],
    diagnostics: [],
  }, 40, 60)
  expect(selected?.id).toBe('row-3')
})

it('rejects a fragment that does not consume exactly the range core requested', () => {
  const request = { startBlockOffset: 40, endBlockOffset: 90 }
  expect(fragmentRangeMadeProgress(request, { startBlockOffset: 40, endBlockOffset: 40 })).toBe(false)
  expect(fragmentRangeMadeProgress(request, { startBlockOffset: 40, endBlockOffset: 90 })).toBe(true)
})

it('mints committed identity from the runtime instance instead of trusting material output', () => {
  const plan = {
    instanceKey: 'repeat:1', nodeId: 'template-node', nodeRevision: 1, constraintKey: 'k',
    borderBox: { x: 0, y: 0, width: 10, height: 20 },
    contentBox: { x: 0, y: 0, width: 10, height: 20 }, slotBoxes: [], breakOpportunities: [], diagnostics: [],
  }
  const contribution = {
    inlineSize: 10, blockSize: 20,
    consumedRange: { startBlockOffset: 0, endBlockOffset: 20 }, diagnostics: [],
  }
  const first = commitMaterialFragment({
    plan, startBlockOffset: 0, endBlockOffset: 20, availableHeight: 20, pageIndex: 0,
  }, contribution, { x: 4, y: 6 })
  const second = commitMaterialFragment({
    plan: { ...plan, instanceKey: 'repeat:2' },
    startBlockOffset: 0, endBlockOffset: 20, availableHeight: 20, pageIndex: 0,
  }, contribution, { x: 4, y: 6 })
  expect(first).toMatchObject({ sourceInstanceKey: 'repeat:1', sourceNodeId: 'template-node' })
  expect(first.id).not.toBe(second.id)
})

it('derives output-page repeats only from the compiled manifest', () => {
  const profile = {
    getManifest: () => ({ common: { layout: { pageRepeat: 'every-output-page' } } }),
  } as never
  expect(planRepeatedOverlays({
    nodes: [{ id: 'p1', type: 'page-number' }] as never,
    profile,
    pageCount: 3,
    paintableNodeIds: new Set(['p1']),
  })).toEqual([
    { nodeId: 'p1', pageIndex: 0 },
    { nodeId: 'p1', pageIndex: 1 },
    { nodeId: 'p1', pageIndex: 2 },
  ])
})
```

- [ ] **Step 2: Run pagination tests and verify failure**

Run: `pnpm exec vitest run packages/core/src/pagination-engine.test.ts --dom`

Expected: FAIL because pagination still delegates an entire page split to `FragmentPaginator`.

- [ ] **Step 3: Replace `FragmentPaginator` with break selection plus fragment creation**

Implement core selection as a pure function:

Import `MaterialFragmentContribution`, `MaterialFragmentPlan`, `MaterialFragmentRequest`, `MaterialLayoutPlan`, and `MaterialBreakOpportunity` plus `freezeMaterialFragmentPlan` from `material-layout-plan.ts`; material adapters never receive the commit helper.

```ts
export function chooseBreak(
  plan: MaterialLayoutPlan,
  startBlockOffset: number,
  availableHeight: number,
): MaterialBreakOpportunity | { id: '$end', blockOffset: number, penalty: number } | undefined {
  const limit = startBlockOffset + availableHeight
  if (plan.borderBox.height <= limit)
    return { id: '$end', blockOffset: plan.borderBox.height, penalty: 0 }
  let chosen: MaterialBreakOpportunity | undefined
  for (const candidate of plan.breakOpportunities) {
    if (candidate.blockOffset <= startBlockOffset)
      continue
    if (candidate.blockOffset > limit)
      break
    if (!chosen || candidate.penalty < chosen.penalty ||
      (candidate.penalty === chosen.penalty && candidate.blockOffset > chosen.blockOffset)) {
      chosen = candidate
    }
  }
  return chosen
}

export function fragmentRangeMadeProgress(
  requested: { startBlockOffset: number, endBlockOffset: number },
  returned: { startBlockOffset: number, endBlockOffset: number },
): boolean {
  return returned.startBlockOffset === requested.startBlockOffset
    && returned.endBlockOffset === requested.endBlockOffset
    && returned.endBlockOffset > returned.startBlockOffset
}

export function commitMaterialFragment(
  request: MaterialFragmentRequest,
  contribution: MaterialFragmentContribution,
  placement: Readonly<{ x: number, y: number }>,
): MaterialFragmentPlan {
  if (!fragmentRangeMadeProgress(request, contribution.consumedRange))
    throw new Error('MATERIAL_FRAGMENT_RANGE_MISMATCH')
  const expectedHeight = request.endBlockOffset - request.startBlockOffset
  if (![placement.x, placement.y, contribution.inlineSize, contribution.blockSize].every(Number.isFinite)
    || Math.abs(contribution.inlineSize - request.plan.borderBox.width) > 1e-9
    || Math.abs(contribution.blockSize - expectedHeight) > 1e-9) {
    throw new Error('MATERIAL_FRAGMENT_BOX_INVALID')
  }
  if (contribution.diagnostics.some(item =>
    item.instanceKey !== request.plan.instanceKey || item.nodeId !== request.plan.nodeId)) {
    throw new Error('MATERIAL_FRAGMENT_DIAGNOSTIC_IDENTITY_MISMATCH')
  }
  const instance = `${request.plan.instanceKey.length}:${request.plan.instanceKey}`
  return freezeMaterialFragmentPlan({
    id: `fragment:${instance}:${request.pageIndex}:${request.startBlockOffset}:${request.endBlockOffset}`,
    sourceInstanceKey: request.plan.instanceKey,
    sourceNodeId: request.plan.nodeId,
    box: { x: placement.x, y: placement.y, width: contribution.inlineSize, height: contribution.blockSize },
    consumedRange: contribution.consumedRange,
    ...(contribution.renderPayload === undefined ? {} : { renderPayload: contribution.renderPayload }),
    diagnostics: contribution.diagnostics,
  })
}
```

```ts
// packages/core/src/page-layers.ts
import type { MaterialNode } from '@easyink/schema'
import type { CompiledMaterialProfile } from './material-profile'

export function planRepeatedOverlays(input: {
  nodes: readonly MaterialNode[]
  profile: CompiledMaterialProfile
  pageCount: number
  paintableNodeIds: ReadonlySet<string>
}): readonly { nodeId: string, pageIndex: number }[] {
  const overlays: Array<{ nodeId: string, pageIndex: number }> = []
  for (const node of input.nodes) {
    if (!input.paintableNodeIds.has(node.id))
      continue
    if (input.profile.getManifest(node.type)?.common.layout.pageRepeat !== 'every-output-page')
      continue
    for (let pageIndex = 0; pageIndex < input.pageCount; pageIndex++)
      overlays.push(Object.freeze({ nodeId: node.id, pageIndex }))
  }
  return Object.freeze(overlays)
}
```

Core owns `startBlockOffset`, chooses `endBlockOffset`, calls the active fragment adapter, and passes its contribution plus core-computed page placement through `commitMaterialFragment()`. The helper validates exact range and local size, mints identity/source/final box, and rejects any legacy contribution containing `box`, source identity, or page fields. Add a nonzero-start test proving the second fragment is placed once at the page cursor rather than adding `startBlockOffset` again. When no internal break fits, core selects the first later boundary/end, emits `MATERIAL_FRAGMENT_OVERFLOW`, and advances monotonically.

During document layout, nodes declared `every-output-page` are assigned to the overlay layer and excluded from ordinary flow/fixed content, preventing a duplicate first-page placement. After page count is final, `planRepeatedOverlays()` reads only `manifest.common.layout.pageRepeat`. It produces immutable `(nodeId,pageIndex)` placements for paintable nodes and never calls a legacy `pageAware` flag or material paginator.

- [ ] **Step 4: Run all core pagination tests**

Run: `pnpm exec vitest run packages/core/src/pagination-engine.test.ts packages/core/src/page-planner.test.ts packages/core/src/page-layers.test.ts --dom`

Expected: PASS; no material test constructs output pages directly.

- [ ] **Step 5: Commit global pagination ownership**

```bash
git add packages/core/src/pagination-engine.ts packages/core/src/pagination-engine.test.ts packages/core/src/material-viewer.ts packages/core/src/page-layers.ts packages/core/src/page-layers.test.ts
git commit -m "refactor(core): own all document pagination"
```

### Task 8: Mount Committed Trees Through The Browser DOM Capability

**Files:**
- Modify: `packages/viewer/src/render-surface.ts`
- Modify: `packages/viewer/src/render-surface.test.ts`

- [ ] **Step 1: Write failing render-surface integration tests**

```ts
import { viewerElement, viewerText } from '@easyink/core'
import { mountMaterialTree } from './render-surface'

it('mounts a committed tree as text through browser-dom', () => {
  const host = document.createElement('div')
  const dispose = mountMaterialTree({
    host,
    tree: viewerElement('div', {}, [viewerText('<img src=x onerror=alert(1)>')]),
    maxNodes: 100,
  })
  expect(host.textContent).toContain('<img src=x onerror=alert(1)>')
  expect(host.querySelector('img')).toBeNull()
  dispose()
  expect(host.childNodes).toHaveLength(0)
})

it('allows defensive repeated disposal without stale DOM', () => {
  const host = document.createElement('div')
  const dispose = mountMaterialTree({
    host,
    tree: viewerElement('span', {}, [viewerText('value')]),
    maxNodes: 100,
  })
  dispose()
  dispose()
  expect(host.childNodes).toHaveLength(0)
})

it('keeps the previous committed root when a new mount fails', async () => {
  const host = document.createElement('div')
  host.textContent = 'previous'
  const surface = new RenderSurface(host)
  await expect(surface.commitAtomically(async (detached) => {
    detached.textContent = 'next'
    throw new Error('mount failed')
  }, new AbortController().signal))
    .rejects.toThrow('mount failed')
  expect(host.textContent).toBe('previous')
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm exec vitest run packages/viewer/src/render-surface.test.ts --dom`

Expected: FAIL because `mountMaterialTree` and render-surface disposal ownership do not exist.

- [ ] **Step 3: Delegate DOM creation to `@easyink/browser-dom`**

```ts
import type { ViewerRenderTree } from '@easyink/core'
import type { BrowserDomCapabilities } from '@easyink/browser-dom'
import { renderViewerTree } from '@easyink/browser-dom'

export function mountMaterialTree(input: {
  host: HTMLElement
  tree: ViewerRenderTree
  maxNodes: number
  capabilities?: BrowserDomCapabilities
}): () => void {
  const mount = renderViewerTree(input.host, input.tree, {
    capabilities: input.capabilities,
    maxNodes: input.maxNodes,
  })
  return () => {
    mount.dispose()
    input.host.replaceChildren()
  }
}
```

`RenderSurface` stores every returned render-mount disposer by page and node, invokes it before replacing a committed plan, and invokes all remaining mount disposers on surface shutdown. It never disposes a shared `FacetInstance`. Route a manifest-declared and host-granted `imperative-dom` output through the controlled mount host defined by the material-platform plan, require an idempotent mount disposer, and register that disposer in the same per-page collection. Opaque `SanitizedMarkup` can only be created by the browser capability before it enters a render tree; raw strings never reach the markup node constructor.

Build each `ViewerRenderContext` from `CommittedPagePlan.runtimeInstances.get(fragment.sourceInstanceKey)`. Its `data` is that instance's frozen `scopeData`; its `resolvedModel` and `layoutPlan` come from the registry, while `fragmentPlan` is the current committed page fragment. Core creates one `MaterialRenderBudgetToken` from the effective minimum of browser and Viewer limits before entering the root extension; every recursive `renderSlot()` shares that token, so parent plus nested trees fail before their first over-limit allocation. Material builders reserve their own tree nodes; core reserves slot wrappers and diagnostic sentinels. The browser boundary still counts the completed tree independently and rejects an under-reported result. A quarantined runtime model renders the foundation diagnostic sentinel and never enters the material extension. `renderSlot(slotInstanceKey)` resolves only entries in the same committed registry, uses the child's prebuilt full-range `embeddedFragmentPlan`, recursively renders those committed facts, and detects render cycles. An absent/foreign key emits `VIEWER_SLOT_INSTANCE_MISSING` and returns a safe diagnostic tree.

Implement `commitAtomically(build, signal)` by passing `build` a detached root, collecting the mount disposers it returns, and checking `AbortSignal` after each synchronous tree or imperative mount and after every awaited build stage. `ViewerImperativeDomCapability.mount` must establish capture-ready DOM and return its disposer synchronously; background work remains owned by the profile-scoped facet and must be cancellable through that facet's disposer. On failure/abort, dispose only the new mounts and leave the current root/disposer set untouched. On success, swap roots once, then dispose the prior mounts. This is the only render-surface method used immediately before Viewer advances committed revisions.

- [ ] **Step 4: Run render tests**

Run: `pnpm exec vitest run packages/browser-dom/src packages/viewer/src/render-surface.test.ts --dom`

Expected: PASS; searching `packages/viewer/src/render-surface.ts` for `innerHTML` returns no matches.

- [ ] **Step 5: Commit render-surface ownership**

```bash
git add packages/viewer/src/render-surface.ts packages/viewer/src/render-surface.test.ts
git commit -m "refactor(viewer): mount committed viewer trees"
```

### Task 9: Virtualize Interactive Pages Without Changing Print Output

**Files:**
- Create: `packages/viewer/src/page-dom-virtualizer.ts`
- Create: `packages/viewer/src/page-dom-virtualizer.test.ts`
- Modify: `packages/viewer/src/render-surface.ts`

- [ ] **Step 1: Write failing retention-policy tests**

```ts
import { describe, expect, it } from 'vitest'
import { selectRetainedPages } from './page-dom-virtualizer'

describe('selectRetainedPages', () => {
  it('keeps visible pages plus overscan in interactive mode', () => {
    expect(selectRetainedPages({ pageCount: 10, firstVisible: 4, lastVisible: 5, overscan: 1, mode: 'interactive' }))
      .toEqual(new Set([3, 4, 5, 6]))
  })

  it('keeps every page for print and export', () => {
    expect(selectRetainedPages({ pageCount: 4, firstVisible: 2, lastVisible: 2, overscan: 1, mode: 'print' }))
      .toEqual(new Set([0, 1, 2, 3]))
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm exec vitest run packages/viewer/src/page-dom-virtualizer.test.ts --dom`

Expected: FAIL because the virtualizer module does not exist.

- [ ] **Step 3: Implement deterministic page retention**

```ts
export function selectRetainedPages(input: {
  pageCount: number
  firstVisible: number
  lastVisible: number
  overscan: number
  mode: 'interactive' | 'print' | 'export'
}): ReadonlySet<number> {
  if (input.mode !== 'interactive')
    return new Set(Array.from({ length: input.pageCount }, (_, index) => index))
  const start = Math.max(0, input.firstVisible - input.overscan)
  const end = Math.min(input.pageCount - 1, input.lastVisible + input.overscan)
  return new Set(Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index))
}

export interface VirtualPageEntry {
  index: number
  widthPx: number
  heightPx: number
  wrapper: HTMLElement
  mount: () => () => void
}

export class PageDomVirtualizer {
  private readonly entries = new Map<number, VirtualPageEntry>()
  private readonly mounted = new Map<number, () => void>()
  private mode: 'interactive' | 'print' | 'export' = 'interactive'

  register(entry: VirtualPageEntry): void {
    entry.wrapper.style.width = `${entry.widthPx}px`
    entry.wrapper.style.height = `${entry.heightPx}px`
    this.entries.set(entry.index, entry)
  }

  setMode(mode: 'interactive' | 'print' | 'export'): void {
    this.mode = mode
  }

  materializeAll(mode: 'print' | 'export'): void {
    this.setMode(mode)
    this.updateVisible(0, Math.max(0, this.entries.size - 1), 0)
  }

  updateVisible(firstVisible: number, lastVisible: number, overscan: number): void {
    const retained = selectRetainedPages({
      pageCount: this.entries.size,
      firstVisible,
      lastVisible,
      overscan,
      mode: this.mode,
    })
    for (const [index, entry] of this.entries) {
      if (retained.has(index) && !this.mounted.has(index)) {
        this.mounted.set(index, entry.mount())
      }
      else if (!retained.has(index)) {
        this.unmount(index, entry)
      }
    }
  }

  dispose(): void {
    for (const [index, entry] of this.entries)
      this.unmount(index, entry)
    this.entries.clear()
  }

  private unmount(index: number, entry: VirtualPageEntry): void {
    this.mounted.get(index)?.()
    this.mounted.delete(index)
    entry.wrapper.replaceChildren()
  }
}
```

In `render-surface.ts`, use `IntersectionObserver` when available to call `updateVisible`; fall back to retaining every page when it is unavailable. Each `mount` closure rebuilds from the immutable committed page plan and returns a disposer for only the tree/imperative mounts created for that page. Wrap both print and export in `withMaterializedPages(mode, action)`: switch mode, materialize every page, run/await the action, and restore the previous interactive retention in `finally`. Materialization is complete on return because imperative mounts are synchronously capture-ready and all declared resources settled before measurement. Shared facet instances stay active until runtime destruction.

- [ ] **Step 4: Run virtualizer and print tests**

Run: `pnpm exec vitest run packages/viewer/src/page-dom-virtualizer.test.ts packages/viewer/src/runtime.print.test.ts --dom`

Expected: PASS; print tests observe material DOM for every output page.

- [ ] **Step 5: Commit page virtualization**

```bash
git add packages/viewer/src/page-dom-virtualizer.ts packages/viewer/src/page-dom-virtualizer.test.ts packages/viewer/src/render-surface.ts
git commit -m "feat(viewer): virtualize interactive page dom"
```

### Task 10: Integrate The Runtime With Registry-First Bootstrap

**Files:**
- Modify: `packages/viewer/src/runtime.ts`
- Modify: `packages/viewer/src/material-runtime.ts`
- Modify: `packages/viewer/src/types.ts`
- Modify: `packages/viewer/src/index.ts`
- Modify: `packages/viewer/src/runtime.audit.test.ts`

- [ ] **Step 1: Add failing bootstrap, revision, and cancellation tests**

```ts
import type { ViewerOptions } from './types'
import { createTestCompiledMaterialProfile } from '@easyink/core/testing'
import { createViewer } from './index'

it('requires a compiled profile before accepting a document', async () => {
  expect(() => createViewer({ container: document.createElement('div') } as ViewerOptions))
    .toThrow('MATERIAL_PROFILE_REQUIRED')
})

it('accepts only monotonic explicit data revisions', async () => {
  const viewer = createViewer({
    container: document.createElement('div'),
    profile: createTestCompiledMaterialProfile([]),
  })
  await viewer.open({
    schema: {
      version: '2.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 210, height: 297 },
      guides: { x: [], y: [] },
      elements: [],
    },
    data: {},
    dataRevision: 1,
  })
  await viewer.updateData({}, { dataRevision: 3 })
  expect(viewer.currentRevisions).toMatchObject({ dataRevision: 3 })
  await expect(viewer.updateData({}, { dataRevision: 2 })).rejects.toThrow('DATA_REVISION_NOT_MONOTONIC')
})
```

- [ ] **Step 2: Run runtime audit tests and verify failure**

Run: `pnpm exec vitest run packages/viewer/src/runtime.audit.test.ts --dom`

Expected: FAIL because profile and data revisions are not public inputs.

- [ ] **Step 3: Replace the monolithic render method with task orchestration**

Update public types:

```ts
export interface ViewerOptions {
  profile: CompiledMaterialProfile
  mode?: DocumentSchema['page']['mode']
  container?: HTMLElement
  host?: ViewerHost
  iframe?: HTMLIFrameElement
  fontProvider?: FontProvider
  browserDom?: {
    policy?: ViewerTreePolicy
    imperativeDom?: readonly string[]
    maxNodes?: number
  }
  performanceBudget?: ViewerPerformanceBudget
  preparedCollections?: PreparedCollectionProvider
}

export interface ViewerOpenInput {
  schema: DocumentSchemaInput
  documentRevision?: number
  data?: Record<string, unknown>
  dataRevision?: number
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
}

export interface ViewerDataUpdateOptions {
  dataRevision?: number
}

export interface ViewerRevisionSnapshot {
  documentRevision: number
  dataRevision: number
  resourceRevision: number
}

export interface ViewerPerformanceBudget {
  measureCacheEntries: number
  maxMeasureInFlight: number
  pageDomOverscan: number
  maxInlineDataNodes: number
  maxInlineDataStringBytes: number
  maxRuntimeRows: number
  maxLayoutFactsPerMaterial: number
  maxRenderTreeNodesPerMaterial: number
}
```

`PreparedCollectionProvider` is a trusted host capability keyed by the canonical binding/source handle and data revision. It may open cursors but is never stored in `ViewerOpenInput.data`, Schema, runtime scope JSON, or layout payloads. Validate inline `data` cumulatively against `maxInlineDataNodes/maxInlineDataStringBytes` before publishing a requested revision; a failed update leaves committed data/revision untouched. Validate every budget as a positive safe integer and cap host overrides at documented absolute ceilings.

In `ViewerRuntime`, compile no registry during `open`; accept only `options.profile`, run the profile-owned document admission pipeline, and use these revision/task methods:

```ts
private readonly tasks = new RenderTaskCoordinator()
private readonly materials: ProfileMaterialRuntime
private requested: ViewerInputState = initialViewerInputState()
private committed: ViewerInputState = initialViewerInputState()
private committedResourceRevision = 0

get currentRevisions(): ViewerRevisionSnapshot {
  return {
    documentRevision: this.committed.documentRevision,
    dataRevision: this.committed.dataRevision,
    resourceRevision: this.committedResourceRevision,
  }
}

private requireNextRevision(explicit: number | undefined, current: number, code: string): number {
  const next = explicit ?? current + 1
  if (!Number.isInteger(next) || next <= current)
    throw new Error(code)
  return next
}

async updateData(data: Record<string, unknown>, options: ViewerDataUpdateOptions = {}): Promise<void> {
  this.ensureNotDestroyed()
  const dataRevision = this.requireNextRevision(
    options.dataRevision,
    this.requested.dataRevision,
    'DATA_REVISION_NOT_MONOTONIC',
  )
  const candidate = Object.freeze({
    ...this.requested,
    data: freezeJsonValue({ ...data }) as Readonly<Record<string, unknown>>,
    dataRevision,
  })
  this.requested = candidate
  await this.planAndPaint(candidate)
}

private async planAndPaint(candidate: ViewerInputState): Promise<void> {
  const task = this.tasks.begin()
  const committed = await this.layoutRuntime.plan({
    document: candidate.document,
    nodeStates: candidate.nodeStates,
    documentRevision: candidate.documentRevision,
    data: candidate.data,
    dataRevision: candidate.dataRevision,
  }, task.signal)
  if (!this.tasks.isCurrent(task.generation))
    return
  await this.renderSurface.commitAtomically(
    detached => this.renderCommittedPlan(detached, committed, task.signal),
    task.signal,
  )
  if (!this.tasks.isCurrent(task.generation))
    return
  this.committed = candidate
  this.committedResourceRevision = committed.resourceRevision
}

function freezeJsonValue(value: unknown): unknown {
  assertJsonValue(value)
  if (Array.isArray(value))
    return Object.freeze(value.map(freezeJsonValue))
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeJsonValue(child)]),
    ))
  }
  return value
}
```

Define `ViewerInputState` with admitted canonical `document`, immutable `nodeStates`, immutable data, and document/data revisions. At admission, create a node-revision map for every root/nested slot node; v1 safely assigns the candidate `documentRevision` to each node, so data-only updates reuse measures and any document update invalidates them all. The constructor throws `MATERIAL_PROFILE_REQUIRED` when `options.profile` is missing, creates browser capabilities internally from `options.browserDom`, and constructs exactly one foundation `ProfileMaterialRuntime`. `open()` calls `loadDocumentWithProfile(input.schema, profile)`, then `materials.prepare()` for the admitted material types before layout, creates a candidate with revisions monotonic against the latest requested input, and schedules it without changing committed state. `RenderSurface.commitAtomically()` builds in a detached root and swaps only after all awaited build stages and synchronously capture-ready mounts succeed. `destroy()` aborts the task, disposes render mounts, awaits `materials.dispose()`, clears bounded caches/resource state, and removes page DOM. No second `MaterialFacetHost` or `MaterialRendererRegistry` exists.

- [ ] **Step 4: Run all Viewer tests and typecheck**

Run: `pnpm exec vitest run packages/viewer/src --dom`

Expected: PASS.

Run: `pnpm -F @easyink/viewer build`

Expected: exit code 0 with `dist/index.mjs` and declarations generated.

- [ ] **Step 5: Commit Viewer integration**

```bash
git add packages/viewer/src/runtime.ts packages/viewer/src/material-runtime.ts packages/viewer/src/types.ts packages/viewer/src/index.ts packages/viewer/src/runtime.audit.test.ts
git commit -m "refactor(viewer): run against compiled material profiles"
```

### Task 11: Add Performance Budgets And Cancellation Diagnostics

**Files:**
- Create: `packages/viewer/src/runtime.performance.test.ts`
- Modify: `packages/viewer/src/layout-runtime.ts`
- Modify: `packages/viewer/src/types.ts`

- [ ] **Step 1: Write deterministic budget tests**

```ts
import { createMaterialLayoutBudgetToken, createMaterialRenderBudgetToken, enforceRuntimeBudget } from './layout-runtime'

it('rejects work before allocating beyond the configured row budget', () => {
  const diagnostics: Array<{ code: string, detail: unknown }> = []
  const accepted = enforceRuntimeBudget({
    nodeId: 'table-1',
    documentRevision: 4,
    dataRevision: 7,
    observedRows: 100_001,
    observedLayoutFacts: 0,
    observedRenderTreeNodes: 0,
    budget: {
      measureCacheEntries: 256,
      maxMeasureInFlight: 8, maxInlineDataNodes: 100_000, maxInlineDataStringBytes: 4_194_304,
      pageDomOverscan: 1,
      maxRuntimeRows: 100_000,
      maxLayoutFactsPerMaterial: 500_000,
      maxRenderTreeNodesPerMaterial: 50_000,
    },
    reportDiagnostic: diagnostic => diagnostics.push(diagnostic),
  })
  expect(accepted).toBe(false)
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED' }))
})

it('rejects a material before retaining its first over-budget layout fact', () => {
  const diagnostics: Array<{ code: string, detail: unknown }> = []
  expect(enforceRuntimeBudget({
    nodeId: 'table-1', documentRevision: 4, dataRevision: 7,
    observedRows: 25_000, observedLayoutFacts: 500_001, observedRenderTreeNodes: 0,
    budget: {
      measureCacheEntries: 256, maxMeasureInFlight: 8, maxInlineDataNodes: 100_000,
      maxInlineDataStringBytes: 4_194_304, pageDomOverscan: 1, maxRuntimeRows: 100_000,
      maxLayoutFactsPerMaterial: 500_000, maxRenderTreeNodesPerMaterial: 50_000,
    },
    reportDiagnostic: diagnostic => diagnostics.push(diagnostic),
  })).toBe(false)
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED' }))
})

it('keeps reservation counters unchanged when the next chunk exceeds a host limit', () => {
  const token = createMaterialLayoutBudgetToken({
    instanceKey: 'table-1', nodeId: 'table-1', documentRevision: 4, dataRevision: 7,
    maxRuntimeRows: 2, maxLayoutFacts: 4,
    signal: new AbortController().signal, reportDiagnostic: () => {},
  })
  token.reserveRuntimeRows(2)
  token.reserveLayoutFacts('cell', 4)
  expect(() => token.reserveRuntimeRows(1)).toThrow('VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED')
  expect(() => token.reserveLayoutFacts('edge', 1)).toThrow('VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED')
  expect(token.runtimeRowsUsed).toBe(2)
  expect(token.layoutFactsUsed).toBe(4)
})

it('shares one pre-allocation render-node budget across nested slot trees', () => {
  const token = createMaterialRenderBudgetToken({
    maxNodes: 3, signal: new AbortController().signal, reportDiagnostic: () => {},
  })
  token.reserveNodes('element', 2)
  token.reserveNodes('text', 1)
  expect(() => token.reserveNodes('element', 1)).toThrow('VIEWER_RENDER_TREE_BUDGET_EXCEEDED')
  expect(token.nodesUsed).toBe(3)
})
```

- [ ] **Step 2: Run the performance test and verify failure**

Run: `pnpm exec vitest run packages/viewer/src/runtime.performance.test.ts --dom`

Expected: FAIL because budget enforcement is not implemented.

- [ ] **Step 3: Enforce finite work before allocation**

Create one reservation token before entering each material facet and retain the final audit before render-tree publication. A facet must reserve row and layout-fact counts before allocation; core independently checks returned public facts and render-tree nodes. On overflow, cancel only the affected node task, quarantine that node for the current revision, preserve its source node, and emit a diagnostic containing `limit`, `observed`, `nodeId`/`instanceKey`, `documentRevision`, and `dataRevision`. Use these defaults:

```ts
export const DEFAULT_VIEWER_PERFORMANCE_BUDGET: ViewerPerformanceBudget = Object.freeze({
  measureCacheEntries: 512,
  maxMeasureInFlight: 8,
  pageDomOverscan: 1,
  maxInlineDataNodes: 100_000,
  maxInlineDataStringBytes: 4 * 1024 * 1024,
  maxRuntimeRows: 100_000,
  maxLayoutFactsPerMaterial: 500_000,
  maxRenderTreeNodesPerMaterial: 50_000,
})

export function createMaterialLayoutBudgetToken(input: {
  instanceKey: string
  nodeId: string
  documentRevision: number
  dataRevision: number
  maxRuntimeRows: number
  maxLayoutFacts: number
  signal: AbortSignal
  reportDiagnostic: (diagnostic: { code: string, detail: unknown }) => void
}): MaterialLayoutBudgetToken {
  if (![input.maxRuntimeRows, input.maxLayoutFacts].every(value => Number.isSafeInteger(value) && value > 0))
    throw new RangeError('MATERIAL_LAYOUT_BUDGET_LIMIT_INVALID')
  let runtimeRowsUsed = 0
  let layoutFactsUsed = 0
  const reserve = (kind: 'rows' | MaterialLayoutFactKind, count: number) => {
    if (input.signal.aborted)
      throw new DOMException('The operation was aborted.', 'AbortError')
    if (!Number.isInteger(count) || count < 0)
      throw new RangeError('MATERIAL_LAYOUT_BUDGET_COUNT_INVALID')
    const rows = kind === 'rows'
    const used = rows ? runtimeRowsUsed : layoutFactsUsed
    const limit = rows ? input.maxRuntimeRows : input.maxLayoutFacts
    if (used + count > limit) {
      const code = rows ? 'VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED' : 'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED'
      input.reportDiagnostic({
        code,
        detail: {
          instanceKey: input.instanceKey, nodeId: input.nodeId,
          documentRevision: input.documentRevision, dataRevision: input.dataRevision,
          kind, used, requested: count, limit,
        },
      })
      throw new Error(code)
    }
    if (rows)
      runtimeRowsUsed += count
    else
      layoutFactsUsed += count
  }
  return Object.freeze({
    maxRuntimeRows: input.maxRuntimeRows,
    maxLayoutFacts: input.maxLayoutFacts,
    get runtimeRowsUsed() { return runtimeRowsUsed },
    get layoutFactsUsed() { return layoutFactsUsed },
    reserveRuntimeRows: (count: number) => reserve('rows', count),
    reserveLayoutFacts: (kind: MaterialLayoutFactKind, count: number) => reserve(kind, count),
  })
}

export function createMaterialRenderBudgetToken(input: {
  maxNodes: number
  signal: AbortSignal
  reportDiagnostic: (diagnostic: { code: string, detail: unknown }) => void
}): MaterialRenderBudgetToken {
  if (!Number.isSafeInteger(input.maxNodes) || input.maxNodes < 1 || input.maxNodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
    throw new RangeError('MATERIAL_RENDER_BUDGET_LIMIT_INVALID')
  let nodesUsed = 0
  return Object.freeze({
    maxNodes: input.maxNodes,
    get nodesUsed() { return nodesUsed },
    reserveNodes(kind: MaterialRenderNodeKind, count: number) {
      if (input.signal.aborted)
        throw new DOMException('The operation was aborted.', 'AbortError')
      if (!Number.isInteger(count) || count < 0)
        throw new RangeError('MATERIAL_RENDER_BUDGET_COUNT_INVALID')
      if (nodesUsed + count > input.maxNodes) {
        input.reportDiagnostic({
          code: 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
          detail: { kind, used: nodesUsed, requested: count, limit: input.maxNodes },
        })
        throw new Error('VIEWER_RENDER_TREE_BUDGET_EXCEEDED')
      }
      nodesUsed += count
    },
  })
}

export function enforceRuntimeBudget(input: {
  nodeId: string
  documentRevision: number
  dataRevision: number
  observedRows: number
  observedLayoutFacts: number
  observedRenderTreeNodes: number
  budget: ViewerPerformanceBudget
  reportDiagnostic: (diagnostic: { code: string, detail: unknown }) => void
}): boolean {
  if (input.observedRows > input.budget.maxRuntimeRows) {
    input.reportDiagnostic({
      code: 'VIEWER_RUNTIME_ROW_BUDGET_EXCEEDED',
      detail: {
        nodeId: input.nodeId,
        documentRevision: input.documentRevision,
        dataRevision: input.dataRevision,
        limit: input.budget.maxRuntimeRows,
        observed: input.observedRows,
      },
    })
    return false
  }
  if (input.observedLayoutFacts > input.budget.maxLayoutFactsPerMaterial) {
    input.reportDiagnostic({
      code: 'VIEWER_LAYOUT_FACT_BUDGET_EXCEEDED',
      detail: {
        nodeId: input.nodeId,
        documentRevision: input.documentRevision,
        dataRevision: input.dataRevision,
        limit: input.budget.maxLayoutFactsPerMaterial,
        observed: input.observedLayoutFacts,
      },
    })
    return false
  }
  if (input.observedRenderTreeNodes > input.budget.maxRenderTreeNodesPerMaterial) {
    input.reportDiagnostic({
      code: 'VIEWER_RENDER_TREE_BUDGET_EXCEEDED',
      detail: {
        nodeId: input.nodeId,
        documentRevision: input.documentRevision,
        dataRevision: input.dataRevision,
        limit: input.budget.maxRenderTreeNodesPerMaterial,
        observed: input.observedRenderTreeNodes,
      },
    })
    return false
  }
  return true
}
```

The performance test must assert bounded cache entry counts, reject a plan before retaining its 500,001st layout fact, and prove that aborting a superseded 100,000-row plan completes within 100ms under Vitest fake timers. A layout fact is one retained row, cell, edge segment, slot box, or equivalent material-owned geometry record; material facets report the next total before growing their arrays. Wall-clock throughput benchmarks belong in a non-blocking `pnpm perf` suite added by the complex-table plan.

Validate `measureCacheEntries`, `maxMeasureInFlight`, inline data node/string-byte limits, `maxRuntimeRows`, and `maxLayoutFactsPerMaterial` as positive safe integers and `pageDomOverscan` as non-negative. Validate both browser/material render limits in `1..VIEWER_TREE_ABSOLUTE_MAX_NODES`; the effective render limit is their minimum. The effective repeated-data capacity is the minimum of inline-data (when used), row, layout-fact, and render limits; 100,000 rows is a defensive ceiling, not a guaranteed target.

- [ ] **Step 4: Run performance and audit tests**

Run: `pnpm exec vitest run packages/viewer/src/runtime.performance.test.ts packages/viewer/src/runtime.audit.test.ts --dom`

Expected: PASS with no process-level unhandled rejection.

- [ ] **Step 5: Commit resource budgets**

```bash
git add packages/viewer/src/runtime.performance.test.ts packages/viewer/src/layout-runtime.ts packages/viewer/src/types.ts
git commit -m "feat(viewer): enforce render performance budgets"
```

### Task 12: Remove Legacy Runtime Paths And Update Architecture

**Files:**
- Modify: `packages/core/src/material-viewer.ts`
- Modify: `packages/viewer/src/binding-projector.ts`
- Delete: `packages/viewer/src/conditional-schema.ts`
- Delete: `packages/viewer/src/conditional-schema.test.ts`
- Modify: `.github/architecture/06-render-pipeline.md`
- Modify: `.github/architecture/07-layout-engine.md`
- Modify: `.github/architecture/20-performance.md`

- [ ] **Step 1: Add an architecture guard test**

Create or extend `packages/viewer/src/runtime.audit.test.ts` with these source-level assertions:

```ts
import { readFileSync } from 'node:fs'

it('contains no legacy raw-html or pre-profile normalization path', () => {
  const materialViewer = readFileSync(new URL('../../core/src/material-viewer.ts', import.meta.url), 'utf8')
  const renderSurface = readFileSync(new URL('./render-surface.ts', import.meta.url), 'utf8')
  const outputState = readFileSync(new URL('./effective-output-state.ts', import.meta.url), 'utf8')
  const runtime = readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8')

  expect(materialViewer).not.toContain('TrustedViewerHtml')
  expect(renderSurface).not.toContain('innerHTML')
  expect(outputState).not.toContain('editorState.hidden')
  expect(outputState).not.toMatch(/\.hidden\b/)
  expect(runtime.indexOf('admitDocument(')).toBeGreaterThan(-1)
  expect(runtime.indexOf('normalizeDocumentSchema(')).toBe(-1)
})
```

- [ ] **Step 2: Run the guard test and verify it catches remaining legacy paths**

Run: `pnpm exec vitest run packages/viewer/src/runtime.audit.test.ts --dom`

Expected: FAIL with the exact remaining legacy import or call site in the assertion message.

- [ ] **Step 3: Remove legacy paths and document the final pipeline**

Document this exact sequence in `06-render-pipeline.md`:

```text
compiled profile -> document admission -> effective output -> facet activation/runtime model resolution
-> resource readiness -> MeasureService -> MaterialLayoutPlan -> document layout -> core pagination
-> page overlays -> ViewerRenderTree/imperative host -> browser DOM
```

Document explicit dependency keys and budgets in `20-performance.md`. Replace the old material-owned `FragmentPaginator` section in `07-layout-engine.md` with break opportunities selected by core. State that `output.visibility` is orthogonal to `editorState.hidden`, and conditional `reserve` is a runtime layout state rather than a Schema mutation.

- [ ] **Step 4: Run the complete verification matrix**

Run: `pnpm exec vitest run packages/core/src packages/viewer/src --dom`

Expected: PASS.

Run: `pnpm build`

Expected: exit code 0. Stop and fix this gate before continuing.

Run: `pnpm lint`

Expected: exit code 0 with no new lint errors.

Run: `pnpm typecheck`

Expected: exit code 0.

Run these three repository gates strictly in the written order; do not combine or parallelize them.

- [ ] **Step 5: Commit runtime cleanup and documentation**

```bash
git add packages/core/src packages/viewer/src .github/architecture/06-render-pipeline.md .github/architecture/07-layout-engine.md .github/architecture/20-performance.md
git commit -m "docs(architecture): finalize viewer layout runtime"
```

## Completion Gate

The plan is complete only when all of these statements are demonstrably true:

- Designer and Viewer consume the same `MaterialLayoutPlan` types and constraint keys.
- A material can expose the same pure layout adapter object on Designer and Viewer facets; authoring-preview mode never activates Viewer rendering or expands runtime records.
- No authoritative measure occurs before declared fonts/assets reach a terminal ready-or-failed state.
- No measure, layout, fragment, or render path mutates persisted Schema.
- Core selects every document page break and rejects any material fragment that does not consume the exact requested monotonic range.
- Superseded render generations cannot update DOM, diagnostics, or committed caches.
- Requested revisions do not become committed revisions until an atomic render-root swap succeeds.
- Exactly one `MaterialFacetHost` owns Viewer facet activation/quarantine/disposal; page virtualization never disposes shared facets.
- Admission/facet/runtime-model failures publish a quarantined runtime instance with default geometry and a safe sentinel; they never drop the node or enter failing material code.
- `remove`, `reserve`, and `include` use one frozen effective-state map, and `editorState.hidden` has no Viewer effect.
- Viewer output uses `ViewerRenderTree`, `SanitizedMarkup`, or an explicitly granted `imperative-dom` host; raw HTML strings are absent from the public contract.
- Interactive page virtualization changes DOM retention only, never measurement or pagination.
- Print/export materializes all committed pages.
- All caches are bounded and keyed by explicit revisions.
- Runtime-row and layout-fact reservations fail before over-limit allocation, using the host's limits rather than material-local defaults.
- `mm`, `pt`, `px`, and `inch` pass the same layout/pagination test matrix.
