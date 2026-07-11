# Material Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one immutable, registry-first material platform that owns canonical node loading, shared semantics, runtime facet availability, safe rendering, property metadata, graph introspection, failure isolation, and automated conformance across Designer, Viewer, and Assistant.

**Architecture:** `@easyink/schema` owns only the canonical document and material-node envelope; `@easyink/core` owns versioned material manifests, compiled active profiles, deterministic schema adapters, graph introspection, and framework-neutral contracts. Designer, Viewer, and Assistant consume the same `CompiledMaterialProfile`, while the new `@easyink/browser-dom` package is the only layer allowed to turn `ViewerRenderTree` values into DOM.

**Tech Stack:** TypeScript 6, pnpm workspaces, Turbo, Vitest 4 with happy-dom, Vue 3 for Designer-only editor registration, tsdown.

---

## Scope And Execution Order

This is one dependency-ordered foundation project because every later surface depends on the same immutable manifest and node-loading boundary. Complete tasks in order; do not parallelize tasks that change the node envelope or profile API.

Included:

- Canonical `MaterialNode.model/modelVersion/slots/bindings/editorState/output` storage.
- Legacy input decoding into the canonical envelope; canonical output never writes `props`, `binding`, `children`, or root `table` fields.
- `MaterialManifest`, common semantic facets, `CompiledMaterialProfile`, and registry-first startup.
- Deterministic `SchemaAdapter` migration/normalization/validation/introspection stages.
- Structure, reference, resource, and binding discovery plus graph clone/rekey.
- Independently derived Designer-editable, Viewer-renderable, and AI-generatable sets.
- `PropertyDescriptor`, `PropertyAccessor`, and Designer `PropertyEditorRegistry`.
- Safe `ViewerRenderTree` DOM mounting through explicit browser capabilities.
- `FacetInstance` activation, disposal, failure quarantine, and diagnostics.
- Conformance tests for every active builtin manifest.

Excluded:

- `DocumentTransaction`, gesture routing, selection rebasing, and editing-session redesign.
- Viewer-wide layout, measurement, pagination, and fragment scheduling redesign.
- The private `TableModel`, topology engine, table layout kernel, legacy conversion internals, and table editing behaviors. The complex-table plan owns those implementations; this plan locks only their platform boundary: canonical v1 is direct `MaterialNode.model`, while a legacy v0 root table may temporarily decode to `model.table` before the table adapter converts it.

Prerequisite reading:

- `CLAUDE.md`
- `.github/architecture/05-schema-dsl.md`
- `.github/architecture/06-render-pipeline.md`
- `.github/architecture/09-plugin-system.md`
- `.github/architecture/11-element-system.md`
- `.github/architecture/17-schema-migration.md`
- `.github/architecture/21-security.md`
- `.github/architecture/23-contribution.md`
- `.github/architecture/25-ai-assistant.md`

Cross-plan order: complete this plan's Tasks 1-8 first, then execute complex-table Tasks 1-4 and 19 as the table-schema bootstrap. Resume this plan's Tasks 9-15 only after that bootstrap passes. Foundation Task 10 creates the initial table manifests; complex-table Task 20 completes them later, so Task 20 is not a foundation prerequisite. This removes circular ownership while keeping every checkpoint buildable.

## Locked Contracts

- `compileMaterialProfile({ id, engineVersion, packages })` is synchronous and returns a frozen active snapshot. Schema loading cannot begin without that snapshot.
- Bare material type IDs are reserved for host-marked builtin packages. An external package with host-declared namespace `acme` can only contribute `acme/<name>` types.
- Required packages are atomic and fail profile compilation on any manifest/API/engine/namespace error. Optional packages are also atomic, but a failure quarantines the entire package and records diagnostics without admitting any of its manifests.
- Every formal document material has a Viewer facet. `renderableTypes` contains all admitted Viewer materials; `editableTypes` is the intersection of Viewer and Designer facets; `generatableTypes` further requires `facets.ai.generation.enabled === true`. Designer-only node manifests and AI-enabled manifests outside those intersections fail package validation; non-document tools use Designer contributions instead of material manifests.
- Manifest common semantics are declared once. Runtime facets contain implementations, not duplicate capability declarations.
- `SchemaAdapter` functions are synchronous, deterministic, and independent of DOM, runtime data, locale, clocks, randomness, and network access.
- Adapter diagnostics use stable codes and RFC 6901 JSON Pointers.
- Material-specific `validateInput` runs on the safely decoded raw version before any migration; an error prevents migration execution.
- Migrations advance exactly one integer `modelVersion` at a time. Normalization is idempotent.
- Edit publication accepts the prior `nodeStates` sidecar plus affected node IDs. Untouched quarantined nodes remain readable and non-blocking, affected quarantined nodes are read-only, and deleting a quarantined node is allowed. History restore uses the exact target sidecar captured with the target schema so undo can restore a deleted quarantine without treating it as a new write.
- True child `MaterialNode` values live only in `node.slots`; material-private opaque structures stay in `node.model` and are exposed through introspection.
- Binding expressions live only in `node.bindings`. A private model may store a stable port-name string, but never an embedded binding object.
- Canonical serialization contains none of the legacy root fields `props`, `binding`, `children`, or `table`.
- `output.visibility` is the persisted static output policy (`include/remove/reserve`); conditional `whenHidden` remains independent. Legacy `hidden: true` becomes `editorState.hidden: true` plus `output.visibility: 'reserve'` and is never reused as the conditional reserve flag.
- Viewer material code returns `ViewerRenderTree`; it cannot return HTML strings or caller-created `HTMLElement` instances.
- One failed runtime facet quarantines only that `{ profileId, materialType, surface }` key. It does not mutate the profile or disable other surfaces.
- No runtime registration mutates an existing profile. Hosts compile a new profile snapshot to change the active material set.

## File Map

### Strict JSON Values

- Create `packages/shared/src/json-value.ts`: strict JSON validation and lossless recursive clone.
- Create `packages/shared/src/json-value.test.ts`: cycles, invalid values, unsafe keys, budgets, pointers, and clone isolation.
- Modify `packages/shared/src/index.ts`: export the JSON value contract.

### Schema Envelope

- Modify `packages/schema/src/types.ts`: canonical material node envelope, legacy input-only types, and named binding maps.
- Modify `packages/schema/src/defaults.ts`: preserve unresolved element input until profile-aware loading.
- Modify `packages/schema/src/codec.ts`: emit canonical envelopes and remove table-aware traversal/encoding branches.
- Modify `packages/schema/src/validation.ts`: validate canonical envelope fields and reject legacy fields from canonical documents.
- Modify `packages/schema/src/traversal.ts`: traverse `slots` only; remove table-cell special cases.
- Modify `packages/schema/src/index.ts`: export the new envelope and input types.
- Modify `packages/schema/src/defaults.test.ts`, `packages/schema/src/codec.test.ts`, `packages/schema/src/validation.test.ts`, and `packages/schema/src/traversal.test.ts`: envelope and canonical serialization coverage.

### Core Material Platform

- Create `packages/core/src/material-manifest.ts`: `MaterialManifest`, common semantic facet types, and manifest definition checks.
- Create `packages/core/src/material-manifest.test.ts`: manifest shape and one-source semantic tests.
- Create `packages/core/src/material-profile.ts`: immutable `CompiledMaterialProfile` compiler and surface sets.
- Create `packages/core/src/material-profile.test.ts`: duplicate, version, immutability, and set derivation tests.
- Create `packages/core/src/schema-adapter.ts`: `SchemaAdapter` algebra and profile-aware document loader.
- Create `packages/core/src/schema-adapter.test.ts`: phase ordering, migration, idempotence, quarantine, and JSON Pointer tests.
- Create `packages/core/src/material-introspection.ts`: slot addresses, graph walking, semantic discovery, clone, and rekey.
- Create `packages/core/src/material-introspection.test.ts`: nested slot, reference, resource, binding, and rekey tests.
- Create `packages/core/src/material-properties.ts`: `PropertyDescriptor`, `PropertyAccessor`, and path accessors.
- Create `packages/core/src/material-properties.test.ts`: access and descriptor validation tests.
- Create `packages/core/src/viewer-render-tree.ts`: safe, framework-neutral `ViewerRenderTree` algebra and builders.
- Create `packages/core/src/viewer-render-tree.test.ts`: immutable tree and limit validation tests.
- Create `packages/core/src/material-facet-host.ts`: `FacetInstance` lifecycle and quarantine host.
- Create `packages/core/src/material-facet-host.test.ts`: activation deduplication, disposal, and isolation tests.
- Create `packages/core/src/material-conformance.ts`: reusable manifest conformance runner.
- Create `packages/core/src/material-conformance.test.ts`: runner self-tests.
- Create `packages/core/src/testing/material-profile.ts`: standard `box` and `container` test manifests.
- Create `packages/core/src/testing.ts`: `@easyink/core/testing` entry point.
- Modify `packages/core/src/font.ts`, `packages/core/src/font.test.ts`: resource discovery through material introspection.
- Modify `packages/core/src/material-extension.ts`: replace `PropSchema` with property contracts and consume canonical node fields.
- Modify `packages/core/src/material-viewer.ts`: replace trusted HTML/element output with render trees.
- Modify `packages/core/src/index.ts`, `packages/core/package.json`, and `packages/core/tsdown.config.ts`: public exports and testing subpath.

### Safe Browser DOM

- Create `packages/browser-dom/package.json`, `packages/browser-dom/tsdown.config.ts`: new browser-only package.
- Create `packages/browser-dom/src/policy.ts`: DOM tag, attribute, URL, style, depth, and node-count policy.
- Create `packages/browser-dom/src/render-viewer-tree.ts`: capability-bound tree-to-DOM renderer.
- Create `packages/browser-dom/src/render-viewer-tree.test.ts`: injection, SVG sanitation, resource URL, and budget tests.
- Create `packages/browser-dom/src/index.ts`: public browser capability exports.

### Runtime Consumers

- Modify `packages/designer/src/runtime-config.ts`: accept a compiled profile or pre-bootstrap manifest list.
- Modify `packages/designer/src/types.ts`: expose profile-aware constructor/configuration types and remove `MaterialDefinition` duplication.
- Modify `packages/designer/src/store/designer-store.ts`: require/store `CompiledMaterialProfile` and load schema through it.
- Delete `packages/designer/src/store/material-registry.ts`: replace mutable definition storage with profile/facet-host lookups.
- Delete `packages/designer/src/materials/registry.ts`: remove post-construction material registration.
- Create `packages/designer/src/properties/property-editor-registry.ts`: Vue component registry keyed by editor ID.
- Create `packages/designer/src/properties/property-editor-registry.test.ts`: duplicate, unregister, and resolution tests.
- Modify `packages/designer/src/components/EasyInkDesigner.vue`: compile/receive the profile before constructing the store.
- Modify `packages/designer/src/components/PropertiesPanel.vue` and `packages/designer/src/components/PropSchemaEditor.vue`: descriptor/accessor/editor-registry consumption.
- Modify `packages/designer/src/interactions/clipboard-actions.ts` and `packages/designer/src/interactions/clipboard-actions.test.ts`: profile-aware clone/rekey.
- Modify `packages/designer/src/index.ts` and `packages/designer/package.json`: new public API and browser DOM dependency where needed.
- Modify `packages/viewer/src/runtime.ts`, `packages/viewer/src/types.ts`: require a profile before `open()` and use profile-aware loading.
- Delete `packages/viewer/src/material-registry.ts`: replace mutable renderer registration with profile/facet-host resolution.
- Modify `packages/viewer/src/render-surface.ts` and `packages/viewer/src/render-surface.test.ts`: mount `ViewerRenderTree` through `@easyink/browser-dom`.
- Modify `packages/viewer/src/index.ts` and `packages/viewer/package.json`: profile and browser DOM exports/dependencies.
- Modify `packages/schema-tools/src/datasource-aligner.ts` and `packages/schema-tools/src/generation-accuracy.test.ts`: binding discovery through the compiled profile.
- Modify `packages/assistant/designer-bridge/src/material-manifest.ts` and `packages/assistant/designer-bridge/src/material-manifest.test.ts`: project AI data from `CompiledMaterialProfile`, not `DesignerStore`.
- Modify `packages/assistant/capabilities/src/types.ts` and `packages/assistant/capabilities/src/schema.test.ts`: versioned portable AI projection.
- Modify `packages/assistant/designer-bridge/package.json` and `packages/assistant/capabilities/package.json`: workspace dependencies for common manifest types.

### Builtin Assembly And Migration

- Modify `packages/builtin/src/types.ts`, `packages/builtin/src/basic.ts`, `packages/builtin/src/all.ts`, `packages/builtin/src/none.ts`, and `packages/builtin/src/index.ts`: one manifest array per builtin set and profile compiler helpers.
- Delete `packages/builtin/src/designer.ts` and `packages/builtin/src/viewer.ts`: remove duplicate surface registries.
- Modify `packages/builtin/src/index.test.ts` and `packages/builtin/src/designer.test.ts`: one-source and set-derivation tests.
- Create `packages/builtin/src/conformance.test.ts`: run conformance over every builtin manifest.
- Modify the exact builtin material source paths enumerated in Tasks 9 and 10: consume the canonical envelope and render/property contracts.
- Modify the exact adjacent tests named in Tasks 9, 10, and 14: assert canonical default nodes and `ViewerRenderTree` output instead of root legacy fields or trusted HTML.

## Task 1: Canonical Material Node Envelope

**Files:**
- Create: `packages/shared/src/json-value.ts`
- Test: `packages/shared/src/json-value.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/schema/src/types.ts`
- Modify: `packages/schema/src/defaults.ts`
- Modify: `packages/schema/src/validation.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/src/defaults.test.ts`
- Test: `packages/schema/src/validation.test.ts`

- [ ] **Step 1: Write failing strict JSON boundary tests**

```ts
// packages/shared/src/json-value.test.ts
import { describe, expect, it } from 'vitest'
import { assertJsonValue, cloneJsonValue, JsonValueValidationError } from './json-value'

describe('strict JSON values', () => {
  it.each([undefined, () => 1, Symbol('x'), 1n, Number.NaN, Number.POSITIVE_INFINITY, new Date(), new Map()])('rejects non-JSON value %s', (value) => {
    expect(() => assertJsonValue({ nested: [value] })).toThrow(JsonValueValidationError)
  })

  it('reports cycles and unsafe keys with RFC 6901 paths', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => assertJsonValue(cyclic)).toThrowError(expect.objectContaining({ code: 'JSON_VALUE_CYCLE', path: '/self' }))
    expect(() => assertJsonValue(JSON.parse('{"safe":{"__proto__":1}}')))
      .toThrowError(expect.objectContaining({ code: 'JSON_VALUE_KEY_UNSAFE', path: '/safe/__proto__' }))
  })

  it('clones without sharing arrays or records and never drops values', () => {
    const input = { rows: [{ value: 1 }], nullable: null }
    const cloned = cloneJsonValue(input)
    expect(cloned).toEqual(input)
    expect(cloned).not.toBe(input)
    expect(cloned.rows).not.toBe(input.rows)
  })
})
```

- [ ] **Step 2: Run the JSON boundary test and verify it fails**

Run: `pnpm exec vitest run packages/shared/src/json-value.test.ts`

Expected: FAIL because the shared strict JSON contract does not exist.

- [ ] **Step 3: Implement lossless validation and cloning**

```ts
// packages/shared/src/json-value.ts
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonArray | JsonObject
export interface JsonArray extends Array<JsonValue> {}
export interface JsonObject { [key: string]: JsonValue }

export interface JsonValueValidationOptions {
  maxDepth?: number
  maxNodes?: number
  maxStringBytes?: number
}

export class JsonValueValidationError extends Error {
  constructor(readonly code: string, readonly path: `/${string}` | '', message: string) {
    super(message)
    this.name = 'JsonValueValidationError'
  }
}

export function assertJsonValue(value: unknown, options: JsonValueValidationOptions = {}): asserts value is JsonValue

export function cloneJsonValue<T extends JsonValue>(value: T, options: JsonValueValidationOptions = {}): T {
  assertJsonValue(value, options)
  return cloneValidated(value) as T
}
```

Implement both traversals iteratively with `WeakSet` cycle detection, default limits of depth 128, 100,000 nodes, and 4 MiB UTF-8 string content. Accept only primitives, arrays, and records whose prototype is `Object.prototype` or `null`; reject `undefined`, functions, symbols, `bigint`, non-finite numbers, accessors, sparse arrays, class instances, DOM values, and keys `__proto__`, `prototype`, or `constructor`. Use JSON Pointer escaping in every error. Clone records with `Object.create(null)` plus `Object.defineProperty` data entries so no setter can run. Do not use `structuredClone`, JSON stringify/parse, or silently filter a value.

- [ ] **Step 4: Write failing canonical-envelope tests**

```ts
// packages/schema/src/validation.test.ts
import { describe, expect, it } from 'vitest'
import { validateSchemaIssues } from './validation'

describe('canonical material envelope', () => {
  const base = {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 210, height: 297 },
    guides: { x: [], y: [] },
  }

  it('accepts model, slots, bindings, editorState, and output', () => {
    const issues = validateSchemaIssues({
      ...base,
      elements: [{
        id: 'container-1', type: 'container', x: 0, y: 0, width: 20, height: 20,
        modelVersion: 1,
        model: { tone: 'neutral' },
        slots: {
          content: [{ id: 'text-1', type: 'text', x: 1, y: 1, width: 10, height: 4, modelVersion: 1, model: { content: 'A' }, slots: {}, bindings: {}, output: { visibility: 'include' } }],
        },
        bindings: { value: { sourceId: 'orders', fieldPath: 'name' } },
        editorState: { name: 'Container', locked: false, hidden: false },
        output: { visibility: 'include', repeat: { scope: 'none' } },
      }],
    })
    expect(issues).toEqual([])
  })

  it.each(['props', 'binding', 'children', 'table'])('rejects legacy root field %s in a canonical document', (field) => {
    const node = {
      id: 'legacy-1', type: 'text', x: 0, y: 0, width: 10, height: 4,
      modelVersion: 1, model: {}, [field]: {},
    }
    expect(validateSchemaIssues({ ...base, elements: [node] }))
      .toContainEqual(expect.objectContaining({ code: 'schema.material.legacy-field', path: `/elements/0/${field}` }))
  })

  it('rejects non-JSON values instead of relying on serialization to drop them', () => {
    const node = {
      id: 'bad-1', type: 'text', x: 0, y: 0, width: 10, height: 4,
      modelVersion: 1, model: { content: undefined }, slots: {}, bindings: {}, output: { visibility: 'include' },
    }
    expect(validateSchemaIssues({ ...base, elements: [node] }))
      .toContainEqual(expect.objectContaining({ path: '/elements/0/model/content' }))
  })
})
```

- [ ] **Step 5: Run the envelope test and verify it fails**

Run: `pnpm exec vitest run packages/schema/src/validation.test.ts`

Expected: FAIL because `modelVersion`, `model`, `slots`, `bindings`, `editorState`, and `output` are not the canonical validator contract and legacy root fields are still accepted.

- [ ] **Step 6: Replace the public node shape with the canonical envelope**

```ts
// packages/schema/src/types.ts
export type MaterialBindingMap = Record<string, MaterialBinding>
export type MaterialSlotMap = Record<string, MaterialNode[]>

export interface MaterialEditorState {
  name?: string
  locked?: boolean
  hidden?: boolean
}

export interface MaterialOutput {
  visibility: 'include' | 'remove' | 'reserve'
  renderCondition?: RenderCondition
  print?: PrintBehavior
  placement?: NodePlacementConfig
  break?: NodeBreakConfig
  repeat?: NodeRepeatConfig
  animations?: AnimationSchema[]
}

export interface MaterialNode<TModel = Record<string, unknown>> {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  alpha?: number
  zIndex?: number
  modelVersion: number
  model: TModel
  slots: MaterialSlotMap
  bindings: MaterialBindingMap
  editorState?: MaterialEditorState
  output: MaterialOutput
  extensions?: Record<string, unknown>
  compat?: BenchmarkElementCompatState
}

export interface LegacyMaterialNodeInput extends Record<string, unknown> {
  id?: unknown
  type?: unknown
  props?: unknown
  binding?: unknown
  children?: unknown
  table?: unknown
}

export type MaterialNodeInput = MaterialNode | LegacyMaterialNodeInput

export function getNodeModel<TModel>(node: MaterialNode): TModel {
  return node.model as TModel
}

export function getNodeBinding(node: MaterialNode, port = 'value'): MaterialBinding | undefined {
  return node.bindings[port]
}
```

Update `DocumentSchemaInput.elements` to `MaterialNodeInput[]`, keep `DocumentSchema.elements` as `MaterialNode[]`, and remove `getNodeProps()` plus `TableNode`'s root `table` extension. `node.unit` is legacy input metadata only: canonical nodes use the single owning `DocumentSchema.unit` and never serialize a per-node unit. Keep material-private table type declarations temporarily type-only until Task 9 moves all runtime access under `model`.

- [ ] **Step 7: Add strict recursive envelope validation**

```ts
// packages/schema/src/validation.ts
const LEGACY_MATERIAL_FIELDS = ['props', 'binding', 'children', 'table'] as const

function validateMaterialNode(value: unknown, path: string, issues: SchemaValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push(createIssue(path, 'must be an object', 'schema.material.invalid'))
    return
  }
  try {
    assertJsonValue(value)
  }
  catch (error) {
    if (error instanceof JsonValueValidationError) {
      issues.push(createIssue(`${path}${error.path}`, error.message, `schema.material.json.${error.code.toLowerCase()}`))
      return
    }
    throw error
  }
  for (const field of LEGACY_MATERIAL_FIELDS) {
    if (field in value)
      issues.push(createIssue(`${path}/${field}`, 'is only accepted by the input migration boundary', 'schema.material.legacy-field'))
  }
  if (typeof value.id !== 'string' || value.id.length === 0)
    issues.push(createIssue(`${path}/id`, 'must be a non-empty string', 'schema.material.id.invalid'))
  if (typeof value.type !== 'string' || value.type.length === 0)
    issues.push(createIssue(`${path}/type`, 'must be a non-empty string', 'schema.material.type.invalid'))
  if (!Number.isInteger(value.modelVersion) || (value.modelVersion as number) < 0)
    issues.push(createIssue(`${path}/modelVersion`, 'must be a non-negative integer', 'schema.material.model-version.invalid'))
  if (!isObject(value.model))
    issues.push(createIssue(`${path}/model`, 'must be an object', 'schema.material.model.invalid'))
  if (!isObject(value.slots)) {
    issues.push(createIssue(`${path}/slots`, 'must be an object', 'schema.material.slots.invalid'))
  }
  else {
    for (const [slot, children] of Object.entries(value.slots)) {
      if (!Array.isArray(children)) {
        issues.push(createIssue(`${path}/slots/${escapePointer(slot)}`, 'must be an array', 'schema.material.slot.invalid'))
        continue
      }
      children.forEach((child, index) => validateMaterialNode(child, `${path}/slots/${escapePointer(slot)}/${index}`, issues))
    }
  }
  if (!isObject(value.bindings))
    issues.push(createIssue(`${path}/bindings`, 'must be an object', 'schema.material.bindings.invalid'))
  if (!isObject(value.output))
    issues.push(createIssue(`${path}/output`, 'must be an object', 'schema.material.output.invalid'))
  else if (value.output.visibility !== 'include' && value.output.visibility !== 'remove' && value.output.visibility !== 'reserve')
    issues.push(createIssue(`${path}/output/visibility`, 'must be include, remove, or reserve', 'schema.material.output.visibility.invalid'))
}
```

Call `validateMaterialNode(element, `/elements/${index}`, issues)` from the existing document validator. Convert every existing schema diagnostic path to an RFC 6901 JSON Pointer, escaping dynamic tokens with `~0`/`~1`. Validate the whole node against the strict JSON boundary first so cycles, accessors, sparse arrays, non-finite numbers, unsafe keys, and own `undefined` values cannot enter a canonical document. Then validate geometry, bindings, editor state, and output with their existing scalar/condition helpers; require `slots`, `bindings`, and `output.visibility`, but do not interpret material-private `model` semantics in `@easyink/schema`.

- [ ] **Step 8: Preserve unresolved input elements in document defaults**

```ts
// packages/schema/src/defaults.ts
export function normalizeDocumentInput(input?: DocumentSchemaInput | null): Omit<DocumentSchema, 'elements'> & { elements: MaterialNodeInput[] } {
  const fallback = createDefaultSchema()
  if (!isObject(input))
    return fallback
  return {
    ...fallback,
    ...input,
    version: fallback.version,
    unit: isUnitType(input.unit) ? input.unit : fallback.unit,
    page: normalizePage(input.page, fallback.page),
    guides: normalizeGuides(input.guides, fallback.guides),
    elements: Array.isArray(input.elements) ? input.elements : [],
    ...(Array.isArray(input.groups) ? { groups: input.groups } : {}),
  }
}
```

Keep `normalizeDocumentSchema()` as a canonical-only wrapper that calls `normalizeDocumentInput()`, validates all elements as `MaterialNode`, and throws when legacy fields remain. Runtime consumers switch to the profile-aware loader in Task 4.

- [ ] **Step 9: Run schema tests**

Run: `pnpm exec vitest run packages/shared/src/json-value.test.ts packages/schema/src/defaults.test.ts packages/schema/src/validation.test.ts`

Expected: PASS; canonical nodes validate recursively, legacy input remains readable only through `normalizeDocumentInput`, and canonical normalization rejects unresolved legacy nodes.

- [ ] **Step 10: Commit the JSON and envelope contracts**

```bash
git add packages/shared/src/json-value.ts packages/shared/src/json-value.test.ts packages/shared/src/index.ts packages/schema/src/types.ts packages/schema/src/defaults.ts packages/schema/src/validation.ts packages/schema/src/index.ts packages/schema/src/defaults.test.ts packages/schema/src/validation.test.ts
git commit -m "refactor(schema): define canonical material node envelope"
```

## Task 2: Versioned Manifest And Common Semantic Facets

**Files:**
- Create: `packages/core/src/material-manifest.ts`
- Modify: `packages/core/src/material-binding.ts`
- Modify: `packages/core/src/binding-format.ts`
- Test: `packages/core/src/binding-format.test.ts`
- Create: `packages/core/src/material-properties.ts`
- Create: `packages/core/src/material-introspection.ts`
- Create: `packages/core/src/schema-adapter.ts`
- Test: `packages/core/src/material-manifest.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing manifest contract tests**

```ts
// packages/core/src/material-manifest.test.ts
import { describe, expect, it } from 'vitest'
import { defineMaterialManifest } from './material-manifest'
import { recordSchemaAdapter } from './schema-adapter'

describe('defineMaterialManifest', () => {
  it('freezes one common semantic source and preserves independent facets', () => {
    const manifest = defineMaterialManifest({
      manifestVersion: 1,
      apiVersion: 1,
      engineRange: { min: '0.0.30', maxExclusive: '0.1.0' },
      type: 'box',
      modelVersion: 1,
      common: {
        nameKey: 'materials.box.name',
        category: 'layout',
        iconKey: 'box',
        defaultNode: { width: 20, height: 10, unit: 'mm', model: { color: '#fff' } },
        interaction: { rotatable: true, resizable: true },
        binding: { kind: 'none' },
        condition: { scope: 'node', hiddenEffects: ['remove'] },
        layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
        structure: { slots: [] },
        properties: [],
      },
      schemaAdapter: recordSchemaAdapter(1),
      facets: {
        designer: async () => ({ kind: 'designer' }),
        ai: {
          generation: {
            enabled: true,
            modelSchema: { type: 'object' },
            bindingShape: { type: 'object' },
            examples: [{ color: '#fff' }],
          },
        },
      },
    })

    expect(Object.isFrozen(manifest)).toBe(true)
    expect(manifest.common.layout.pageRepeat).toBe('none')
    expect(manifest.facets.viewer).toBeUndefined()
  })

  it('rejects an unversioned or mismatched adapter', () => {
    expect(() => defineMaterialManifest({
      manifestVersion: 1,
      apiVersion: 1,
      engineRange: { min: '0.0.30', maxExclusive: '0.1.0' },
      type: 'broken',
      modelVersion: 2,
      common: {} as never,
      schemaAdapter: { currentModelVersion: 1 } as never,
      facets: {},
    })).toThrowError('MATERIAL_ADAPTER_VERSION_MISMATCH')
  })
})
```

- [ ] **Step 2: Run the manifest test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/material-manifest.test.ts`

Expected: FAIL because the manifest and common semantic facet contracts do not exist.

- [ ] **Step 3: Define the dependency contracts used by the manifest**

```ts
// packages/core/src/material-properties.ts
import type { MaterialNode } from '@easyink/schema'
import type { PropSchemaType } from '@easyink/shared'
import type { JsonPointer } from './material-introspection'

export interface PropertyAccessor<T = unknown> {
  paths: readonly JsonPointer[]
  read: (node: MaterialNode) => T
  write: (draft: MaterialNode, value: T) => void
}

export interface PropertyDescriptor<T = unknown> {
  key: string
  label: string
  type: PropSchemaType
  group?: string
  default?: T
  enum?: readonly { label: string, value: T }[]
  min?: number
  max?: number
  step?: number
  nullable?: boolean
  editor?: string
  editorOptions?: Readonly<Record<string, unknown>>
  visible?: (model: Readonly<Record<string, unknown>>) => boolean
  disabled?: (model: Readonly<Record<string, unknown>>) => boolean
  accessor?: PropertyAccessor<T>
}
```

```ts
// packages/core/src/material-introspection.ts
import type { MaterialBinding, MaterialNode } from '@easyink/schema'

export type JsonPointer = `/${string}`
export type MaterialIdentityScope = 'document' | 'material'
export interface MaterialIdentityTarget { scope: MaterialIdentityScope; kind: string }
export interface MaterialIdentityEncoding { prefix?: string; suffix?: string }
export interface MaterialIdentitySlot { path: JsonPointer; location: 'value' | 'key'; encoding?: MaterialIdentityEncoding; value: string; target: MaterialIdentityTarget }
export interface MaterialStructureSlot { path: JsonPointer; slot: string; children: readonly MaterialNode[]; policyId: string; coordinateSpace: 'document' | 'owner' | 'slot'; layoutParticipation: 'independent' | 'owner'; reparent: 'allowed' | 'same-material' | 'forbidden' }
export interface MaterialReferenceSlot { path: JsonPointer; location: 'value' | 'key'; encoding?: MaterialIdentityEncoding; value: string; target: MaterialIdentityTarget; required: boolean }
export interface MaterialResourceSlot { path: JsonPointer; value: string; kind: 'asset' | 'font' }
export interface MaterialBindingSlot { path: JsonPointer; value: MaterialBinding; port: string }
export interface MaterialIntrospection { identities: readonly MaterialIdentitySlot[]; structures: readonly MaterialStructureSlot[]; references: readonly MaterialReferenceSlot[]; resources: readonly MaterialResourceSlot[]; bindings: readonly MaterialBindingSlot[] }
```

```ts
// packages/core/src/schema-adapter.ts
import type { MaterialNode, MaterialNodeInput, UnitType } from '@easyink/schema'
import type { MaterialIntrospection } from './material-introspection'

export interface SchemaAdapterContext { documentVersion: string; sourceUnit: UnitType; documentUnit: UnitType; materialType: string }
export interface MaterialSchemaIssue { code: string; severity: 'error' | 'warning'; path: `/${string}`; message: string }
export interface AdaptableMaterialNode extends Omit<MaterialNode, 'slots'> { slots?: Record<string, MaterialNodeInput[]> }
export interface SchemaMigration { from: number; to: number; migrate: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => AdaptableMaterialNode }
export interface SchemaAdapter {
  currentModelVersion: number
  modelUnitPolicy: 'independent' | 'convertible'
  migrations: readonly SchemaMigration[]
  validateInput: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => readonly MaterialSchemaIssue[]
  normalize: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => AdaptableMaterialNode
  validate: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => readonly MaterialSchemaIssue[]
  introspect: (node: MaterialNode, context: SchemaAdapterContext) => MaterialIntrospection
  convertModelUnits?: (model: Readonly<Record<string, unknown>>, from: UnitType, to: UnitType) => Record<string, unknown>
}

export function recordSchemaAdapter(currentModelVersion: number): SchemaAdapter {
  return {
    currentModelVersion,
    modelUnitPolicy: 'independent',
    migrations: Array.from({ length: currentModelVersion }, (_, from) => ({
      from,
      to: from + 1,
      migrate: (node: AdaptableMaterialNode) => ({ ...node, modelVersion: from + 1 }),
    })),
    validateInput: () => [],
    normalize: node => ({ ...node, model: { ...node.model } }),
    validate: () => [],
    introspect: () => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }),
  }
}
```

`modelUnitPolicy:'independent'` asserts that every number in the private model is dimensionless. A `convertible` adapter must provide `convertModelUnits`; core never recursively guesses which private numbers are lengths. Admission records legacy `node.unit ?? document.unit` as `sourceUnit`, migrates and normalizes in that source unit, converts the current model and envelope geometry once into `documentUnit`, removes `node.unit`, then runs final validation. Creation from a manifest follows the same path from `defaultNode.unit` to the requested document unit. Conformance tests require same-unit identity, no input mutation, strict JSON output, and A->B->A numeric stability; they also prove table `fr` weights and dimensionless values do not change while fixed tracks, row heights, padding, typography lengths, and border widths do.

- [ ] **Step 4: Define stable binding-port policies, then the versioned manifest and shared facet types**

```ts
// packages/core/src/material-binding.ts
export type MaterialBindingValueShape = 'scalar' | 'record' | 'record-array' | 'json'

export interface MaterialBindingPortPolicy {
  id: string
  key: { kind: 'exact' | 'prefix', value: string }
  role: 'semantic' | 'display'
  valueShape: MaterialBindingValueShape
  modelPath?: `/${string}`
  formatEditor: false | {
    tabs: readonly ['preset']
    presetTypes?: readonly BindingFormatPresetType[]
  }
}

export type MaterialBindingDefinition
  = | { kind: 'none' }
    | { kind: 'ports', ports: readonly MaterialBindingPortPolicy[], dataContract?: MaterialDataContract }
```

Exact and prefix policies must be non-overlapping and deterministic. `semantic` ports forbid display formatting and cover collections, identities, chart series, and other typed values; `display` ports may apply only allowlisted preset formatting. A port holds one scalar canonical `BindingExpression`; arrays and positional indices exist only in legacy admission input. Validate every actual binding key against exactly one policy, validate the resolved raw value against `valueShape`, and reject a manifest whose `modelPath` or format policy contradicts its role. Custom formatter source remains readable compatibility data but no active policy exposes a custom editor or executes it.

Delete `formatterCache`, `TrustedFormatter`, and `compileTrustedFormatter()` from `binding-format.ts`. When legacy `format.mode === 'custom'`, return the unformatted raw/fallback display string plus one `BINDING_FORMAT_CUSTOM_DISABLED` warning; never call `new Function`, `eval`, dynamic import, or a host callback. Replace the old custom-execution tests with one that installs a throwing source string, verifies it is not evaluated, and expects the stable disabled diagnostic. Add a source audit asserting `binding-format.ts` contains neither `new Function` nor `compileTrustedFormatter`.

```ts
// packages/core/src/material-manifest.ts
import type { JsonObject } from '@easyink/shared'
import type { MaterialNode, UnitType } from '@easyink/schema'
import type { MaterialBindingDefinition } from './material-binding'
import type { MaterialConditionCapability } from './condition'
import type { JsonPointer } from './material-introspection'
import type { PropertyDescriptor } from './material-properties'
import type { SchemaAdapter } from './schema-adapter'

export const MATERIAL_MANIFEST_VERSION = 1 as const
export const MATERIAL_API_VERSION = 1 as const
export type MaterialSurface = 'designer' | 'viewer' | 'ai'

export interface MaterialLayoutFacet {
  intrinsicSize: 'none' | 'width' | 'height' | 'both'
  fragmentation: 'none' | 'break-opportunities'
  pageRepeat: 'none' | 'every-output-page'
  overflow: 'visible' | 'clip'
}

export interface MaterialStructureSlotPolicy {
  id: string
  key: { kind: 'exact' | 'prefix', value: string }
  coordinateSpace: 'document' | 'owner' | 'slot'
  layoutParticipation: 'independent' | 'owner'
  reparent: 'allowed' | 'same-material' | 'forbidden'
}

export interface MaterialStructureFacet {
  slots: readonly MaterialStructureSlotPolicy[]
}

export interface MaterialDefaultNode {
  width: number
  height: number
  unit: UnitType
  model: Record<string, unknown>
  bindings?: MaterialNode['bindings']
  output?: Partial<MaterialNode['output']>
}

export interface MaterialCommonFacet {
  nameKey: string
  category: string
  iconKey: string
  defaultNode: MaterialDefaultNode
  interaction: {
    rotatable: boolean
    resizable: boolean
    keepAspectRatio?: boolean
    supportsAnimation?: boolean
    supportsUnionDrop?: boolean
  }
  binding: MaterialBindingDefinition
  condition?: MaterialConditionCapability
  layout: MaterialLayoutFacet
  structure: MaterialStructureFacet
  properties: readonly PropertyDescriptor[]
}

export interface MaterialAIFacet {
  generation: {
    enabled: boolean
    modelSchema?: JsonObject
    bindingShape?: JsonObject
    requiredModelPaths?: readonly JsonPointer[]
    examples: readonly JsonObject[]
  }
  descriptor?: JsonObject
}

export interface MaterialFacetActivationContext {
  profileId: string
  materialType: string
  surface: Exclude<MaterialSurface, 'ai'>
  services: unknown
}

export type MaterialFacetFactory<T> = (context: MaterialFacetActivationContext) => T | Promise<T>

export interface MaterialManifest<TDesigner = unknown, TViewer = unknown> {
  manifestVersion: typeof MATERIAL_MANIFEST_VERSION
  apiVersion: typeof MATERIAL_API_VERSION
  engineRange: { min: string, maxExclusive: string }
  type: string
  modelVersion: number
  common: MaterialCommonFacet
  schemaAdapter: SchemaAdapter
  facets: {
    designer?: MaterialFacetFactory<TDesigner>
    viewer?: MaterialFacetFactory<TViewer>
    ai?: MaterialAIFacet
  }
}

export function defineMaterialManifest<TDesigner, TViewer>(manifest: MaterialManifest<TDesigner, TViewer>): MaterialManifest<TDesigner, TViewer> {
  if (manifest.manifestVersion !== MATERIAL_MANIFEST_VERSION)
    throw new Error('MATERIAL_MANIFEST_VERSION_UNSUPPORTED')
  if (manifest.apiVersion !== MATERIAL_API_VERSION)
    throw new Error('MATERIAL_API_VERSION_UNSUPPORTED')
  if (manifest.modelVersion !== manifest.schemaAdapter.currentModelVersion)
    throw new Error('MATERIAL_ADAPTER_VERSION_MISMATCH')
  return deepFreezeManifest(manifest)
}
```

Implement `deepFreezeManifest()` as a cycle-detecting recursive freeze over arrays and plain records. Preserve function identities and reject cyclic manifest data with `MATERIAL_MANIFEST_CYCLE`; do not use `structuredClone`.

- [ ] **Step 5: Add manifest validation edge cases**

```ts
// packages/core/src/material-manifest.test.ts
it.each(['', ' box', 'box ', 'Box', 'acme/', '/invoice', 'acme/invoice/line'])('rejects malformed type id %j', (type) => {
  expect(() => defineMaterialManifest(validManifest({ type }))).toThrowError('MATERIAL_TYPE_INVALID')
})

it('requires an explicit AI generation opt-in without changing the portable field names', () => {
  const manifest = defineMaterialManifest(validManifest({
    facets: { ai: { generation: { enabled: false, examples: [] } } },
  }))
  expect(manifest.facets.ai?.generation.enabled).toBe(false)
})

it('keeps global fragmentation ownership in core', () => {
  const input = validManifest()
  input.common.layout.fragmentation = 'material-owned' as never
  expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_FRAGMENTATION_INVALID')
})
```

Use the manifest-level type rule `/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/`; package compilation applies the stronger builtin/external namespace rule. Validate a strict `x.y.z` engine range with `min < maxExclusive`, non-empty name/category/icon keys, positive default dimensions, integer model versions, unique property keys, unique structure policy IDs, and exact/prefix slot key values. Validate `requiredModelPaths` as model-relative RFC 6901 pointers and pass every supplied `modelSchema`, `bindingShape`, example, and descriptor through `assertJsonValue()`. Task 13 adds the conditional completeness rule for enabled generation without renaming any field.

- [ ] **Step 6: Run and commit the manifest contract**

Run: `pnpm exec vitest run packages/core/src/material-manifest.test.ts packages/core/src/binding-format.test.ts`

Expected: PASS; invalid manifests fail with stable error codes and valid manifests are recursively frozen.

```bash
git add packages/core/src/material-manifest.ts packages/core/src/material-binding.ts packages/core/src/binding-format.ts packages/core/src/binding-format.test.ts packages/core/src/material-properties.ts packages/core/src/material-introspection.ts packages/core/src/schema-adapter.ts packages/core/src/material-manifest.test.ts packages/core/src/index.ts
git commit -m "feat(core): add versioned material manifest contract"
```

## Task 3: Immutable Compiled Active Profile

**Files:**
- Create: `packages/core/src/material-profile.ts`
- Test: `packages/core/src/material-profile.test.ts`
- Create: `packages/core/src/testing/material-profile.ts`
- Create: `packages/core/src/testing.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/tsdown.config.ts`

- [ ] **Step 1: Write failing profile compilation tests**

```ts
// packages/core/src/material-profile.test.ts
import { describe, expect, it } from 'vitest'
import { createTestMaterialManifest } from './testing/material-profile'
import { compileMaterialProfile, MaterialProfileCompileError } from './material-profile'

describe('compileMaterialProfile', () => {
  it('derives independent surface sets', () => {
    const editable = createTestMaterialManifest({ type: 'editable', designer: true, viewer: true })
    const printable = createTestMaterialManifest({ type: 'printable', viewer: true })
    const generated = createTestMaterialManifest({ type: 'generated', designer: true, viewer: true, ai: true })
    const profile = compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [{ packageId: '@easyink/test', kind: 'builtin', required: true, manifests: [editable, printable, generated] }],
    })

    expect([...profile.editableTypes]).toEqual(['editable', 'generated'])
    expect([...profile.renderableTypes]).toEqual(['editable', 'generated', 'printable'])
    expect([...profile.generatableTypes]).toEqual(['generated'])
    expect(profile.getManifest('printable')).toBe(printable)
  })

  it('rejects duplicate types without last-write-wins behavior', () => {
    const first = createTestMaterialManifest({ type: 'text' })
    const second = createTestMaterialManifest({ type: 'text' })
    expect(() => compileMaterialProfile({
      id: 'test',
      engineVersion: '0.0.30',
      packages: [{ packageId: '@easyink/test', kind: 'builtin', required: true, manifests: [first, second] }],
    }))
      .toThrowError(new MaterialProfileCompileError('MATERIAL_TYPE_DUPLICATE', 'text'))
  })

  it.each([
    createTestMaterialManifest({ type: 'designer-only', designer: true, viewer: false }),
    createTestMaterialManifest({ type: 'ai-without-editor', viewer: true, ai: true }),
  ])('rejects a document manifest that cannot complete its declared surfaces', (manifest) => {
    expect(() => compileMaterialProfile({
      id: 'test', engineVersion: '0.0.30',
      packages: [{ packageId: '@easyink/test', kind: 'builtin', required: true, manifests: [manifest] }],
    })).toThrowError(expect.objectContaining({ code: 'MATERIAL_SURFACE_INCOMPLETE' }))
  })

  it.each([
    { type: 'invoice', namespace: 'acme', code: 'MATERIAL_EXTERNAL_BARE_TYPE' },
    { type: 'other/invoice', namespace: 'acme', code: 'MATERIAL_NAMESPACE_MISMATCH' },
  ])('rejects external namespace violations atomically', ({ type, namespace, code }) => {
    const manifest = createTestMaterialManifest({ type })
    expect(() => compileMaterialProfile({
      id: 'test', engineVersion: '0.0.30',
      packages: [{ packageId: '@acme/invoice', kind: 'external', namespace, required: true, manifests: [manifest] }],
    })).toThrowError(expect.objectContaining({ code }))
  })

  it('accepts acme/invoice and quarantines an entire broken optional package', () => {
    const acme = createTestMaterialManifest({ type: 'acme/invoice' })
    const validSibling = createTestMaterialManifest({ type: 'other/valid' })
    const wrongNamespace = createTestMaterialManifest({ type: 'wrong/broken' })
    const profile = compileMaterialProfile({
      id: 'test', engineVersion: '0.0.30',
      packages: [
        { packageId: '@acme/invoice', kind: 'external', namespace: 'acme', required: true, manifests: [acme] },
        { packageId: '@other/widgets', kind: 'external', namespace: 'other', required: false, manifests: [validSibling, wrongNamespace] },
      ],
    })
    expect(profile.materialTypes).toEqual(['acme/invoice'])
    expect(profile.quarantinedPackages).toEqual(['@other/widgets'])
  })
})
```

- [ ] **Step 2: Run the profile test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/material-profile.test.ts`

Expected: FAIL because profile compilation and test fixtures do not exist.

- [ ] **Step 3: Implement the immutable profile API**

```ts
// packages/core/src/material-profile.ts
import type { MaterialManifest, MaterialSurface } from './material-manifest'
import type { MaterialNode, UnitType } from '@easyink/schema'

export const EASYINK_ENGINE_VERSION = '0.0.30' as const

export interface SchemaAdmissionBudget {
  maxJsonNodes: number
  maxStringBytes: number
  maxMaterialNodes: number
  maxDepth: number
}

export interface CompiledMaterialProfile {
  readonly id: string
  readonly engineVersion: string
  readonly materialTypes: readonly string[]
  readonly editableTypes: ReadonlySet<string>
  readonly renderableTypes: ReadonlySet<string>
  readonly generatableTypes: ReadonlySet<string>
  readonly quarantinedPackages: readonly string[]
  readonly diagnostics: readonly MaterialProfileDiagnostic[]
  readonly admissionBudget: Readonly<SchemaAdmissionBudget>
  getManifest: (type: string) => MaterialManifest | undefined
  hasSurface: (type: string, surface: MaterialSurface) => boolean
  createNode: (type: string, input?: Partial<MaterialNode>, unit?: UnitType) => MaterialNode
}

export interface CompileMaterialProfileInput {
  id: string
  engineVersion: string
  packages: readonly MaterialPackageRegistration[]
  admissionBudget?: Partial<SchemaAdmissionBudget>
}

export interface MaterialPackageRegistration {
  packageId: string
  kind: 'builtin' | 'external'
  namespace?: string
  required: boolean
  manifests: readonly MaterialManifest[]
}

export interface MaterialProfileDiagnostic {
  code: string
  severity: 'error' | 'warning'
  packageId: string
  materialType?: string
  message: string
}

export class MaterialProfileCompileError extends Error {
  constructor(readonly code: string, readonly materialType?: string, readonly packageId?: string) {
    super([code, packageId, materialType].filter(Boolean).join(': '))
    this.name = 'MaterialProfileCompileError'
  }
}

export function compileMaterialProfile(input: CompileMaterialProfileInput): CompiledMaterialProfile {
  if (!input.id.trim())
    throw new MaterialProfileCompileError('MATERIAL_PROFILE_ID_INVALID')

  assertEngineVersion(input.engineVersion)
  const manifests = new Map<string, MaterialManifest>()
  const diagnostics: MaterialProfileDiagnostic[] = []
  const quarantinedPackages: string[] = []
  const required = input.packages.filter(pkg => pkg.required).sort(byPackageId)
  const optional = input.packages.filter(pkg => !pkg.required).sort(byPackageId)

  for (const pkg of [...required, ...optional]) {
    const issue = validatePackageAtomically(pkg, input.engineVersion, manifests)
    if (issue) {
      if (pkg.required)
        throw new MaterialProfileCompileError(issue.code, issue.materialType, pkg.packageId)
      quarantinedPackages.push(pkg.packageId)
      diagnostics.push({ ...issue, severity: 'warning', packageId: pkg.packageId })
      continue
    }
    for (const manifest of pkg.manifests)
      manifests.set(manifest.type, manifest)
  }

  const materialTypes = Object.freeze([...manifests.keys()].sort())
  const editable = materialTypes.filter(type => manifests.get(type)?.facets.viewer && manifests.get(type)?.facets.designer)
  const renderable = materialTypes.filter(type => manifests.get(type)?.facets.viewer)
  const generatable = materialTypes.filter(type => editable.includes(type) && renderable.includes(type) && manifests.get(type)?.facets.ai?.generation.enabled === true)

  return Object.freeze({
    id: input.id,
    engineVersion: input.engineVersion,
    materialTypes,
    editableTypes: readonlySet(editable),
    renderableTypes: readonlySet(renderable),
    generatableTypes: readonlySet(generatable),
    quarantinedPackages: Object.freeze(quarantinedPackages),
    diagnostics: Object.freeze(diagnostics),
    getManifest: (type: string) => manifests.get(type),
    hasSurface: (type: string, surface: MaterialSurface) => surface === 'designer'
      ? editable.includes(type)
      : surface === 'viewer'
        ? renderable.includes(type)
        : generatable.includes(type),
    createNode: (type, input, unit) => createNodeFromManifest(requireManifest(manifests, type), input, unit),
  })
}
```

Validate host overrides against absolute ceilings and freeze the effective budget into the profile. `loadDocumentWithProfile()` applies one cumulative iterative budget to the complete untrusted input before any migration, adapter, or introspection; budgets never reset per node. A document-wide overflow aborts admission with a structured fatal diagnostic because traversing further would defeat the limit. Add a test where many individually small nodes exceed the aggregate limit. The same host policy supplies Viewer inline-data node/byte limits; large collections use the schema-external prepared cursor capability instead of weakening document JSON limits.

Implement `validatePackageAtomically()` without mutating `manifests`: validate package ID uniqueness, manifest/API version, engine range, duplicate types, collisions, and surface completeness first. Every admitted manifest requires `facets.viewer`; `facets.designer` without Viewer and `ai.generation.enabled` without both Viewer and Designer produce `MATERIAL_SURFACE_INCOMPLETE`. For `kind: 'builtin'`, require every type to be bare. For `kind: 'external'`, require a host-declared namespace matching `/^[a-z][a-z0-9-]*$/` and every type to begin with `${namespace}/`. Process required packages first and optional packages by `packageId`, making optional conflicts deterministic. Implement strict three-part semantic-version comparison locally; prerelease/build syntax is outside this contract.

Implement `readonlySet()` with a closure exposing `has`, `values`, `keys`, `entries`, `forEach`, `size`, and `[Symbol.iterator]`; do not return a mutable `Set` cast to `ReadonlySet`.

Implement `createNodeFromManifest()` by converting default envelope width/height from `defaultNode.unit` to the requested document unit and invoking the adapter's `convertModelUnits` only when `modelUnitPolicy==='convertible'`; never recurse over opaque model numbers. Merge explicit input geometry/model/bindings/output, force manifest type/version, then normalize and validate in the requested unit. Materialize `slots: {}`, `bindings: {}`, and `output: { visibility: 'include' }`. Use `generateId(type)` only when no ID is provided; conformance passes a fixed ID and verifies the returned canonical node has no `unit` key.

- [ ] **Step 4: Add standard test manifests and the public testing entry**

```ts
// packages/core/src/testing/material-profile.ts
import type { MaterialAIFacet, MaterialFacetFactory, MaterialManifest, MaterialStructureSlotPolicy } from '../material-manifest'
import type { SchemaAdapter } from '../schema-adapter'
import { defineMaterialManifest } from '../material-manifest'
import { compileMaterialProfile } from '../material-profile'
import { recordSchemaAdapter } from '../schema-adapter'

export function createTestMaterialManifest(options: {
  type: string
  slots?: readonly MaterialStructureSlotPolicy[]
  schemaAdapter?: SchemaAdapter
  designer?: boolean | MaterialFacetFactory<unknown>
  viewer?: boolean | MaterialFacetFactory<unknown>
  ai?: boolean | MaterialAIFacet
}): MaterialManifest {
  return defineMaterialManifest({
    manifestVersion: 1,
    apiVersion: 1,
    engineRange: { min: '0.0.30', maxExclusive: '0.1.0' },
    type: options.type,
    modelVersion: options.schemaAdapter?.currentModelVersion ?? 1,
    common: {
      nameKey: `materials.${options.type}.name`, category: 'test', iconKey: 'box',
      defaultNode: { width: 10, height: 10, unit: 'mm', model: {} },
      interaction: { rotatable: true, resizable: true },
      binding: { kind: 'none' },
      layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
      structure: { slots: options.slots ?? [] },
      properties: [],
    },
    schemaAdapter: options.schemaAdapter ?? recordSchemaAdapter(1),
    facets: {
      designer: typeof options.designer === 'function' ? options.designer : options.designer ? async () => ({}) : undefined,
      viewer: typeof options.viewer === 'function' ? options.viewer : options.viewer === false ? undefined : async () => ({}),
      ai: typeof options.ai === 'object'
        ? options.ai
        : options.ai
          ? {
              generation: {
                enabled: true,
                modelSchema: { type: 'object' },
                bindingShape: { type: 'object' },
                examples: [{ value: 'example' }],
              },
            }
          : undefined,
    },
  })
}

export function createTestCompiledMaterialProfile(manifests: readonly MaterialManifest[] = []) {
  const defaults = manifests.length > 0 ? manifests : [
    createTestMaterialManifest({ type: 'box' }),
    createTestMaterialManifest({
      type: 'container',
      slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
    }),
  ]
  return compileMaterialProfile({
    id: 'test',
    engineVersion: '0.0.30',
    packages: [{ packageId: '@easyink/test', kind: 'builtin', required: true, manifests: defaults }],
  })
}
```

Export both helpers from `packages/core/src/testing.ts`, add `src/testing.ts` to the tsdown entries, and add a typed `./testing` export in `packages/core/package.json`.

- [ ] **Step 5: Verify immutability and public exports**

Run: `pnpm exec vitest run packages/core/src/material-profile.test.ts`

Expected: PASS; mutation APIs are absent, order is deterministic, duplicate types fail, and surface sets are independent.

Run: `pnpm --filter @easyink/core build`

Expected: PASS with `dist/index.mjs`, `dist/index.d.mts`, `dist/testing.mjs`, and `dist/testing.d.mts` generated.

- [ ] **Step 6: Commit profile bootstrap**

```bash
git add packages/core/src/material-profile.ts packages/core/src/material-profile.test.ts packages/core/src/testing/material-profile.ts packages/core/src/testing.ts packages/core/src/index.ts packages/core/package.json packages/core/tsdown.config.ts
git commit -m "feat(core): compile immutable active material profiles"
```

## Task 4: Schema Adapter Stage Algebra And Registry-First Loading

**Files:**
- Modify: `packages/core/src/schema-adapter.ts`
- Create: `packages/core/src/schema-adapter.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/schema/src/codec.ts`
- Modify: `packages/schema/src/codec.test.ts`

- [ ] **Step 1: Write a failing phase-order and migration test**

```ts
// packages/core/src/schema-adapter.test.ts
import type { SchemaAdapter } from './schema-adapter'
import { describe, expect, it, vi } from 'vitest'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'
import { loadDocumentWithProfile } from './schema-adapter'

describe('loadDocumentWithProfile', () => {
  it('runs envelope, resolve, input validation, one-step migrations, normalize, current validation, and introspection in order', () => {
    const phases: string[] = []
    const adapter: SchemaAdapter = {
      currentModelVersion: 2,
      migrations: [
        { from: 0, to: 1, migrate: node => (phases.push('migrate:0-1'), { ...node, modelVersion: 1, model: { ...node.model, count: Number(node.model.count ?? 0) } }) },
        { from: 1, to: 2, migrate: node => (phases.push('migrate:1-2'), { ...node, modelVersion: 2, model: { ...node.model, label: String(node.model.label ?? '') } }) },
      ],
      validateInput: () => (phases.push('validate-input'), []),
      normalize: node => (phases.push('normalize'), { ...node, model: { ...node.model, label: String(node.model.label).trim() } }),
      validate: () => (phases.push('validate'), []),
      introspect: () => (phases.push('introspect'), { identities: [], structures: [], references: [], resources: [], bindings: [] }),
    }
    const manifest = createTestMaterialManifest({ type: 'counter', schemaAdapter: adapter })
    const profile = createTestCompiledMaterialProfile([manifest])

    const result = loadDocumentWithProfile({
      unit: 'mm',
      page: { mode: 'fixed', width: 100, height: 100 },
      elements: [{ id: 'c1', type: 'counter', x: 0, y: 0, width: 10, height: 10, props: { count: '2', label: ' A ' } }],
    }, profile)

    expect(phases).toEqual(['validate-input', 'migrate:0-1', 'migrate:1-2', 'normalize', 'validate', 'introspect'])
    expect(result.schema.elements[0]).toMatchObject({ modelVersion: 2, model: { count: 2, label: 'A' } })
    expect(JSON.stringify(result.schema)).not.toMatch(/"(?:props|binding|children|table)"\s*:/)
  })
})
```

- [ ] **Step 2: Run the adapter test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/schema-adapter.test.ts`

Expected: FAIL because profile-aware document loading has not been implemented.

- [ ] **Step 3: Implement result, diagnostic, and stage contracts**

```ts
// packages/core/src/schema-adapter.ts
import type { DocumentSchema, DocumentSchemaInput, MaterialNode, MaterialNodeInput } from '@easyink/schema'
import type { CompiledMaterialProfile } from './material-profile'
import { normalizeDocumentInput } from '@easyink/schema'

export type SchemaAdapterStage = 'envelope' | 'resolve' | 'validate-input' | 'migrate' | 'normalize' | 'validate' | 'introspect' | 'graph'

export interface MaterialLoadDiagnostic {
  code: string
  severity: 'error' | 'warning'
  path: `/${string}`
  stage: SchemaAdapterStage
  materialType?: string
  nodeId?: string
  message: string
  cause?: { name?: string, message: string }
}

export interface MaterialDocumentLoadResult {
  schema: DocumentSchema
  diagnostics: readonly MaterialLoadDiagnostic[]
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
}

export interface MaterialNodeLoadState {
  status: 'ready' | 'quarantined'
  code?: string
  stage?: SchemaAdapterStage
  diagnostics: readonly MaterialLoadDiagnostic[]
}

export type MaterialDocumentValidationOptions =
  | {
      mode?: 'edit'
      baselineNodeStates?: ReadonlyMap<string, MaterialNodeLoadState>
      affectedNodeIds?: 'all' | ReadonlySet<string>
    }
  | {
      mode: 'history-restore'
      targetNodeStates: ReadonlyMap<string, MaterialNodeLoadState>
    }

export interface MaterialDocumentValidationReport {
  valid: boolean
  diagnostics: readonly MaterialLoadDiagnostic[]
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
}

export function loadDocumentWithProfile(input: DocumentSchemaInput | null | undefined, profile: CompiledMaterialProfile): MaterialDocumentLoadResult {
  const envelope = normalizeDocumentInput(input)
  const diagnostics: MaterialLoadDiagnostic[] = []
  const nodeStates = new Map<string, MaterialNodeLoadState>()
  const elements = envelope.elements.map((node, index) => loadNode(node, `/${escapePointer('elements')}/${index}`, envelope, profile, diagnostics, nodeStates))
  return {
    schema: { ...envelope, elements },
    diagnostics: Object.freeze(diagnostics),
    nodeStates: readonlyMap(nodeStates),
  }
}
```

`readonlyMap()` must expose the read-only `Map` interface through a closure rather than returning a mutable `Map` cast. Quarantine status is sidecar runtime state; never write it or load diagnostics into `MaterialNode.editorState`, `model`, `extensions`, or serialized schema output.

Implement and export the pure publication validator in the same file:

```ts
export function validateDocumentWithProfile(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile,
  options: MaterialDocumentValidationOptions = {},
): MaterialDocumentValidationReport {
  const diagnostics = validateCanonicalEnvelope(schema)
  const nodeStates = new Map<string, MaterialNodeLoadState>()
  const adapterExcludedNodeIds = new Set<string>()

  if (options.mode === 'history-restore') {
    restoreHistoryNodeStates(schema, options.targetNodeStates, nodeStates, adapterExcludedNodeIds, diagnostics)
  }
  else {
    const baselineNodeStates = options.baselineNodeStates ?? emptyReadonlyMap()
    const affectedNodeIds = options.affectedNodeIds ?? 'all'
    walkCanonicalNodes(schema, (node, path) => {
      const affected = affectedNodeIds === 'all' || affectedNodeIds.has(node.id)
      const baseline = baselineNodeStates.get(node.id)

      if (!affected && baseline) {
        nodeStates.set(node.id, baseline)
        if (baseline.status === 'quarantined')
          adapterExcludedNodeIds.add(node.id)
        return
      }

      if (affected && baseline?.status === 'quarantined') {
        appendNodeReadOnlyDiagnostic(node, path, diagnostics)
        nodeStates.set(node.id, baseline)
        adapterExcludedNodeIds.add(node.id)
        return
      }

      validateCurrentNodeWithoutAdmission(node, path, profile, diagnostics, nodeStates)
      if (nodeStates.get(node.id)?.status === 'quarantined') {
        adapterExcludedNodeIds.add(node.id)
        if (affected)
          appendNodeReadOnlyDiagnostic(node, path, diagnostics)
      }
    })
  }

  diagnostics.push(...validateMaterialGraph(schema, profile, { adapterExcludedNodeIds }))
  return {
    valid: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
    diagnostics: Object.freeze(diagnostics),
    nodeStates: readonlyMap(nodeStates),
  }
}

function restoreHistoryNodeStates(
  schema: DocumentSchema,
  targetNodeStates: ReadonlyMap<string, MaterialNodeLoadState>,
  nodeStates: Map<string, MaterialNodeLoadState>,
  adapterExcludedNodeIds: Set<string>,
  diagnostics: MaterialLoadDiagnostic[],
): void {
  const liveIds = new Set<string>()
  walkCanonicalNodes(schema, (node, path) => {
    liveIds.add(node.id)
    const target = targetNodeStates.get(node.id)
    if (!target) {
      const diagnostic = appendHistoryStateMismatch(node.id, path, diagnostics)
      nodeStates.set(node.id, Object.freeze({
        status: 'quarantined', code: diagnostic.code, stage: diagnostic.stage,
        diagnostics: Object.freeze([diagnostic]),
      }))
      adapterExcludedNodeIds.add(node.id)
      return
    }
    nodeStates.set(node.id, target)
    if (target.status === 'quarantined')
      adapterExcludedNodeIds.add(node.id)
  })
  for (const targetId of targetNodeStates.keys()) {
    if (!liveIds.has(targetId))
      appendHistoryStateMismatch(targetId, '/', diagnostics)
  }
}
```

`validateCurrentNodeWithoutAdmission()` calls only manifest resolution, current-version checks, `adapter.validate()`, and `adapter.introspect()`. It must never call `validateInput`, migrations, or normalization and must never modify the passed schema. It records either a ready or quarantined state. `appendNodeReadOnlyDiagnostic()` emits stable error code `MATERIAL_NODE_READ_ONLY` without changing the preserved state. The top-level validation diagnostics contain only current publication checks; untouched baseline quarantine diagnostics remain nested in their copied `MaterialNodeLoadState`, so they stay observable without making an unrelated edit invalid. `appendHistoryStateMismatch()` emits `MATERIAL_HISTORY_NODE_STATE_MISMATCH` at stage `graph`; history restore never falls back to re-admission or accepts a partial target sidecar.

`validateMaterialGraph()` initially covers duplicate node IDs and slot ownership; Task 5 extends it to typed identities, references, and structure policies. Core envelope validation, canonical slot traversal, and duplicate standard `/id` identity checks always include every live node. For `adapterExcludedNodeIds`, graph walking retains the standard node identity and traverses canonical slots, but skips manifest lookup, slot-policy enforcement, adapter introspection, property-derived resources, and private identity/reference/binding checks owned by that quarantined node. A healthy reference to its standard node ID can still resolve. Baseline entries for IDs absent from the candidate schema are not copied, so deleting a quarantined node is valid. Before returning, assert that every live unique node ID has one state; the report always replaces the prior sidecar as a complete snapshot and is never merged as a touched-only map.

`affectedNodeIds` is an internal publication-boundary input, not trusted command metadata. The caller derives candidates from private patches and before/after stable indices: include every added or removed ID, every node whose own serialized envelope/model differs, every owner/slot change, and every surviving sibling whose relative order changes. Numeric index drift caused only by another sibling's insertion/deletion is not a write to that node. A UI command's declared targets may widen this set but may never narrow it. Consequently, moving or reordering an opaque quarantined node is a write and fails with `MATERIAL_NODE_READ_ONLY`; removing it remains allowed.

`loadNode()` must execute these operations in this exact order:

```ts
const canonical = decodeNodeEnvelope(input, path, diagnostics)
const manifest = profile.getManifest(canonical.type)
if (!manifest) {
  appendLoadDiagnostic(diagnostics, canonical, path, 'resolve', 'MATERIAL_TYPE_UNKNOWN', 'Unknown material type')
  return quarantineNode(canonical, path, diagnostics, nodeStates)
}

const context: SchemaAdapterContext = {
  documentVersion: document.version,
  sourceUnit: readLegacySourceUnit(input) ?? document.unit,
  documentUnit: document.unit,
  materialType: canonical.type,
}

const inputIssues = manifest.schemaAdapter.validateInput(cloneAdaptableNode(canonical), context)
appendAdapterIssues(inputIssues, canonical, path, diagnostics, 'validate-input')
if (inputIssues.some(issue => issue.severity === 'error'))
  return quarantineNode(canonical, path, diagnostics, nodeStates)

const migration = runMigrations(canonical, manifest.schemaAdapter, context, path, diagnostics)
if (!migration.ok)
  return quarantineNode(migration.node as MaterialNode, path, diagnostics, nodeStates)

let node = migration.node
node = assertAllowedAdapterMutation(node, manifest.schemaAdapter.normalize(cloneAdaptableNode(node), context), path, diagnostics)
if (context.sourceUnit !== context.documentUnit) {
  node = convertCanonicalEnvelopeGeometry(node, context.sourceUnit, context.documentUnit)
  if (manifest.schemaAdapter.modelUnitPolicy === 'convertible') {
    node = { ...node, model: manifest.schemaAdapter.convertModelUnits!(
      cloneJsonRecord(node.model), context.sourceUnit, context.documentUnit,
    ) }
  }
}
node = { ...node, modelVersion: manifest.modelVersion }
const issues = manifest.schemaAdapter.validate(cloneAdaptableNode(node), context)
appendAdapterIssues(issues, node, path, diagnostics, 'validate')
node = { ...node, slots: loadSlots(node.slots, path, document, profile, diagnostics, nodeStates) }
manifest.schemaAdapter.introspect(node as MaterialNode, context)
if (hasMaterialErrors(diagnostics, node.id))
  return quarantineNode(node as MaterialNode, path, diagnostics, nodeStates)
recordReadyNode(node as MaterialNode, path, diagnostics, nodeStates)
return node as MaterialNode
```

Catch each adapter call separately, serialize only the thrown value's safe `name` and `message`, emit `MATERIAL_ADAPTER_THROW` at the current stage, and keep the last lossless node. Never continue to a later material phase after a thrown phase or a missing migration edge. `assertAllowedAdapterMutation()` permits `model`, `modelVersion`, `slots`, and `bindings`, plus only the adapter's profile/type-owned key under `compat.materials`; `editorState` and `output` remain exclusively core-owned. A change to ID, type, geometry, z-order, extensions, another compat namespace, editor state, or output emits `MATERIAL_ADAPTER_ENVELOPE_MUTATION` and quarantines that node. Tests cover a table-v0 compat payload as the positive case and cross-namespace/output mutation as failures.

Core standard-slot recursion is independent of material success. Immediately after envelope decoding, recursively admit every canonical/legacy child in `slots` even when the owner type is unknown, future-versioned, or its adapter throws; only owner-private introspection and slot-policy checks are skipped. Thus every live child receives one sidecar state, duplicate standard node IDs are still detected, and a healthy child under an unchanged quarantined owner remains editable. `quarantineNode()` and `recordReadyNode()` update only the sidecar map and return/preserve the canonical node; neither helper adds a property to the node. A quarantine state's primary `code/stage` comes from the first error diagnostic for that exact node, never from a preceding warning; its frozen diagnostic list still retains both.

- [ ] **Step 4: Decode legacy fields losslessly at the only compatibility boundary**

```ts
// packages/core/src/schema-adapter.ts
const LEGACY_COMMON_KEYS = new Set([
  'id', 'type', 'name', 'unit', 'x', 'y', 'width', 'height', 'rotation', 'alpha', 'zIndex',
  'hidden', 'locked', 'renderCondition', 'print', 'placement', 'break', 'repeat', 'animations',
  'props', 'binding', 'children', 'table', 'model', 'modelVersion', 'slots', 'bindings', 'editorState', 'output',
  'diagnostics', 'extensions', 'compat',
])

function decodeNodeEnvelope(input: MaterialNodeInput, path: `/${string}`, diagnostics: MaterialLoadDiagnostic[]): MaterialNode {
  const raw = assertInputRecord(input, path, diagnostics)
  const hasCanonicalModel = isRecord(raw.model) && Number.isInteger(raw.modelVersion)
  const model: Record<string, unknown> = hasCanonicalModel ? cloneJsonRecord(raw.model) : cloneJsonRecord(isRecord(raw.props) ? raw.props : {})

  if ('diagnostics' in raw) {
    diagnostics.push({
      code: 'MATERIAL_LEGACY_DIAGNOSTICS_IGNORED',
      severity: 'warning',
      path: `${path}/diagnostics`,
      stage: 'envelope',
      materialType: typeof raw.type === 'string' ? raw.type : undefined,
      nodeId: typeof raw.id === 'string' ? raw.id : undefined,
      message: 'Legacy persisted diagnostics were ignored; load diagnostics are runtime sidecar state',
    })
  }

  if (!hasCanonicalModel) {
    for (const [key, value] of Object.entries(raw)) {
      if (!LEGACY_COMMON_KEYS.has(key))
        model[key] = cloneJsonValue(value)
    }
    if ('table' in raw)
      model.table = cloneJsonValue(raw.table)
  }

  const legacyHidden = raw.hidden === true
  const output = isRecord(raw.output) ? cloneJsonRecord(raw.output) : {}
  const rotation = optionalFinite(raw.rotation)
  const alpha = optionalFinite(raw.alpha)
  const zIndex = optionalFinite(raw.zIndex)
  return {
    id: requireString(raw.id, `${path}/id`),
    type: requireString(raw.type, `${path}/type`),
    x: finiteOr(raw.x, 0), y: finiteOr(raw.y, 0), width: positiveOr(raw.width, 1), height: positiveOr(raw.height, 1),
    ...(rotation === undefined ? {} : { rotation }),
    ...(alpha === undefined ? {} : { alpha }),
    ...(zIndex === undefined ? {} : { zIndex }),
    modelVersion: hasCanonicalModel ? raw.modelVersion as number : 0,
    model,
    slots: decodeSlots(raw.slots, raw.children),
    bindings: decodeBindings(raw.bindings, raw.binding),
    editorState: {
      ...(isRecord(raw.editorState) ? cloneJsonRecord(raw.editorState) : {}),
      ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
      ...(typeof raw.locked === 'boolean' ? { locked: raw.locked } : {}),
      ...(typeof raw.hidden === 'boolean' ? { hidden: raw.hidden } : {}),
    },
    output: {
      ...output,
      visibility: readVisibility(output.visibility) ?? (legacyHidden ? 'reserve' : 'include'),
      ...(isRecord(raw.renderCondition) ? { renderCondition: cloneJsonValue(raw.renderCondition) as never } : {}),
      ...(typeof raw.print === 'string' ? { print: raw.print as never } : {}),
      ...(isRecord(raw.placement) ? { placement: cloneJsonValue(raw.placement) as never } : {}),
      ...(isRecord(raw.break) ? { break: cloneJsonValue(raw.break) as never } : {}),
      ...(isRecord(raw.repeat) ? { repeat: cloneJsonValue(raw.repeat) as never } : {}),
      ...(Array.isArray(raw.animations) ? { animations: cloneJsonValue(raw.animations) as never } : {}),
    },
    ...(isRecord(raw.extensions) ? { extensions: cloneJsonRecord(raw.extensions) } : {}),
    ...(isRecord(raw.compat) ? { compat: cloneBenchmarkCompat(raw.compat) } : {}),
  }
}
```

`decodeBindings()` maps legacy `binding` to the canonical `value` port and otherwise returns `{}`. Legacy positional arrays/`bindIndex` are decoded here only and fanned out through the manifest's stable exact/prefix port policies; no canonical API receives an index. `decodeSlots()` maps legacy `children` to `default` and otherwise returns `{}`. Preserve a valid legacy `raw.unit` only in the admission frame as `sourceUnit`; never copy it to the canonical node. The legacy root `diagnostics` key is recognized only so it cannot leak into `model`; its contents are never trusted, cloned, or persisted, and the warning above is the only sidecar trace. Use `@easyink/shared` `cloneJsonValue()` for every other untrusted value and translate `JsonValueValidationError` to `MATERIAL_MODEL_NOT_JSON` without losing its JSON Pointer or code. `cloneJsonRecord()` is a narrowing wrapper that additionally requires the cloned root to be a record; `cloneBenchmarkCompat()` uses it and validates the known compat shape. Optional canonical keys are omitted rather than written with `undefined`. Do not create a second JSON clone implementation.

- [ ] **Step 5: Enforce one-step migration paths and stable JSON Pointers**

```ts
type MigrationRunResult =
  | { ok: true, node: AdaptableMaterialNode }
  | { ok: false, node: AdaptableMaterialNode }

function runMigrations(node: AdaptableMaterialNode, adapter: SchemaAdapter, context: SchemaAdapterContext, path: `/${string}`, diagnostics: MaterialLoadDiagnostic[]): MigrationRunResult {
  let version = node.modelVersion
  let current = cloneAdaptableNode(node)
  while (version < adapter.currentModelVersion) {
    const migration = adapter.migrations.find(item => item.from === version && item.to === version + 1)
    if (!migration) {
      appendLoadDiagnostic(diagnostics, current, `${path}/modelVersion`, 'migrate', 'MATERIAL_MIGRATION_PATH_MISSING', `Missing migration ${version} -> ${version + 1}`)
      return { ok: false, node: current }
    }
    current = assertAllowedAdapterMutation(current, migration.migrate(cloneAdaptableNode(current), context), path, diagnostics)
    version = migration.to
    current.modelVersion = version
  }
  if (version > adapter.currentModelVersion) {
    appendLoadDiagnostic(diagnostics, current, `${path}/modelVersion`, 'migrate', 'MATERIAL_MODEL_VERSION_NEWER', 'Node model version is newer than the active adapter')
    return { ok: false, node: current }
  }
  return { ok: true, node: { ...current, modelVersion: version } }
}

function escapePointer(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}
```

Validate migrations at manifest definition time: unique `from`, `to === from + 1`, no edge above `currentModelVersion`, and a complete path from 0 to current for manifests that opt into legacy input. Adapter issue paths are node-relative and must begin with `/model`, `/slots`, `/bindings`, `/editorState`, or `/output`; prefix them with the document node path and reject malformed paths with `MATERIAL_DIAGNOSTIC_PATH_INVALID`.

- [ ] **Step 6: Make benchmark codec output unresolved input and canonical encoding explicit**

Change `decodeBenchmarkInput()` to return `DocumentSchemaInput`, preserve material-specific unknown keys in the legacy input object, and remove `decodeTableExtensions()`/`migrateBandsToRowRole()` calls from the global codec. `encodeToBenchmark()` accepts only canonical `DocumentSchema`; encode generic geometry plus `model` as benchmark `props`, `bindings.value` as `bind`, and `slots.default` as `children`. A material-specific exporter must use profile introspection for richer formats.

```ts
// packages/schema/src/codec.test.ts
it('does not embed table knowledge in the global codec', () => {
  const decoded = decodeBenchmarkInput({
    page: { width: 100, height: 100 },
    elements: [{ id: 't1', type: 'table-data', left: 0, top: 0, width: 20, height: 10, props: {}, table: { rows: [] } }],
  })
  expect(decoded.elements?.[0]).toMatchObject({ type: 'table-data', table: { rows: [] } })
})
```

- [ ] **Step 7: Test baseline-aware affected-node validation without admission side effects**

```ts
it('validates touched adapters plus the complete graph without normalize or migrate', () => {
  const normalize = vi.fn(node => node)
  const migrate = vi.fn(node => ({ ...node, modelVersion: 1 }))
  const validate = vi.fn(() => [])
  const adapter: SchemaAdapter = {
    currentModelVersion: 1,
    migrations: [{ from: 0, to: 1, migrate }],
    validateInput: () => [], normalize, validate,
    introspect: () => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }),
  }
  const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box', schemaAdapter: adapter })])
  const a = profile.createNode('box', { id: 'duplicate' })
  const b = profile.createNode('box', { id: 'duplicate' })
  normalize.mockClear()
  validate.mockClear()

  const report = validateDocumentWithProfile(schemaWith(a, b), profile, { affectedNodeIds: new Set(['duplicate']) })
  expect(report.valid).toBe(false)
  expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_NODE_ID_DUPLICATE', stage: 'graph' }))
  expect(validate).toHaveBeenCalled()
  expect(normalize).not.toHaveBeenCalled()
  expect(migrate).not.toHaveBeenCalled()
})

it('allows a healthy edit beside an untouched unknown node and preserves the complete sidecar', () => {
  const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
  const loaded = loadDocumentWithProfile(schemaWith(
    { id: 'unknown-1', type: 'vendor/missing', props: { opaque: 1 } },
    { id: 'box-1', type: 'box', props: { value: 1 } },
  ), profile)
  const unknown = loaded.schema.elements[0]!
  const box = loaded.schema.elements[1]!

  const report = validateDocumentWithProfile(
    schemaWith(unknown, { ...box, model: { value: 2 } }),
    profile,
    { baselineNodeStates: loaded.nodeStates, affectedNodeIds: new Set(['box-1']) },
  )

  expect(report.valid).toBe(true)
  expect(report.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'MATERIAL_TYPE_UNKNOWN' }))
  expect(report.nodeStates.size).toBe(2)
  expect(report.nodeStates.get('unknown-1')).toBe(loaded.nodeStates.get('unknown-1'))
  expect(report.nodeStates.get('unknown-1')?.status).toBe('quarantined')
  expect(report.nodeStates.get('box-1')?.status).toBe('ready')
})

it('rejects writes to quarantine but permits deleting it', () => {
  const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
  const loaded = loadDocumentWithProfile(schemaWith(
    { id: 'unknown-1', type: 'vendor/missing', props: { opaque: 1 } },
    { id: 'box-1', type: 'box', props: {} },
  ), profile)
  const [unknown, box] = loaded.schema.elements

  const edited = validateDocumentWithProfile(
    schemaWith({ ...unknown!, model: { opaque: 2 } }, box!),
    profile,
    { baselineNodeStates: loaded.nodeStates, affectedNodeIds: new Set(['unknown-1']) },
  )
  expect(edited.valid).toBe(false)
  expect(edited.diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_NODE_READ_ONLY', nodeId: 'unknown-1' }))

  const deleted = validateDocumentWithProfile(
    schemaWith(box!),
    profile,
    { baselineNodeStates: loaded.nodeStates, affectedNodeIds: new Set(['unknown-1']) },
  )
  expect(deleted.valid).toBe(true)
  expect(deleted.nodeStates.has('unknown-1')).toBe(false)

  const restoredByUndo = validateDocumentWithProfile(
    loaded.schema,
    profile,
    { mode: 'history-restore', targetNodeStates: loaded.nodeStates },
  )
  expect(restoredByUndo.valid).toBe(true)
  expect(restoredByUndo.nodeStates.get('unknown-1')).toBe(loaded.nodeStates.get('unknown-1'))
})
```

Add a second adapter-spy test with two distinct node IDs and `affectedNodeIds` containing one ID; assert only that adapter instance runs current validation while global reference checks still inspect both ready nodes. Also assert baseline state objects are copied only for live, unaffected IDs and the returned map exposes no mutation methods.

- [ ] **Step 8: Test unknown types, thrown phases, gaps, and legacy hidden migration**

```ts
it('quarantines one unknown node and preserves its model', () => {
  const result = loadDocumentWithProfile(schemaWith({ id: 'x', type: 'missing', props: { payload: 1 }, hidden: true }), createTestCompiledMaterialProfile())
  expect(result.schema.elements[0]).toMatchObject({ model: { payload: 1 }, editorState: { hidden: true }, output: { visibility: 'reserve' } })
  expect(result.nodeStates.get('x')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_TYPE_UNKNOWN', stage: 'resolve' })
  expect(result.diagnostics[0]).toMatchObject({ code: 'MATERIAL_TYPE_UNKNOWN', path: '/elements/0', stage: 'resolve' })
})

it('does not run migration when raw material input violates its version precondition', () => {
  const migrate = vi.fn(node => ({ ...node, modelVersion: 1 }))
  const adapter: SchemaAdapter = {
    currentModelVersion: 1,
    migrations: [{ from: 0, to: 1, migrate }],
    validateInput: node => Array.isArray(node.model.rows)
      ? []
      : [{ code: 'TABLE_INPUT_ROWS_INVALID', severity: 'error', path: '/model/rows', message: 'rows must be an array' }],
    normalize: node => node,
    validate: () => [],
    introspect: () => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }),
  }
  const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'guarded', schemaAdapter: adapter })])
  const result = loadDocumentWithProfile(schemaWith({ id: 'g1', type: 'guarded', props: { rows: { constructor: 'poison' } } }), profile)
  expect(migrate).not.toHaveBeenCalled()
  expect(result.nodeStates.get('g1')).toMatchObject({ status: 'quarantined', code: 'TABLE_INPUT_ROWS_INVALID', stage: 'validate-input' })
})

it('keeps legacy persisted diagnostics in the load sidecar only', () => {
  const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
  const result = loadDocumentWithProfile(schemaWith({
    id: 'b1', type: 'box', props: {}, diagnostics: [{ code: 'old-diagnostic', message: 'do not persist' }],
  }), profile)

  expect(result.diagnostics).toContainEqual(expect.objectContaining({
    code: 'MATERIAL_LEGACY_DIAGNOSTICS_IGNORED', path: '/elements/0/diagnostics', stage: 'envelope',
  }))
  expect(result.schema.elements[0]).not.toHaveProperty('diagnostics')
  expect(result.schema.elements[0]).not.toHaveProperty('editorState.diagnostics')
  expect(JSON.stringify(result.schema)).not.toContain('old-diagnostic')
})
```

Add separate tests for migration gaps, future versions, normalize throws, validation errors, introspection throws, invalid JSON values, escaped pointer segments, and a valid canonical node that remains byte-equivalent after a second load.

- [ ] **Step 9: Run and commit profile-aware loading**

Run: `pnpm exec vitest run packages/core/src/schema-adapter.test.ts packages/schema/src/codec.test.ts`

Expected: PASS; the fixed phase order is observable, legacy input becomes canonical exactly once, failures are isolated with stable paths, and the global codec has no table branch.

```bash
git add packages/core/src/schema-adapter.ts packages/core/src/schema-adapter.test.ts packages/core/src/material-introspection.ts packages/core/src/index.ts packages/schema/src/codec.ts packages/schema/src/codec.test.ts
git commit -m "feat(core): load schemas through material adapters"
```

## Task 5: Structure And Semantic Introspection With Clone/Rekey

**Files:**
- Modify: `packages/core/src/material-introspection.ts`
- Create: `packages/core/src/material-introspection.test.ts`
- Modify: `packages/core/src/font.ts`
- Modify: `packages/core/src/font.test.ts`
- Modify: `packages/schema/src/traversal.ts`
- Modify: `packages/schema/src/traversal.test.ts`
- Modify: `packages/designer/src/interactions/clipboard-actions.ts`
- Modify: `packages/designer/src/interactions/clipboard-actions.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing graph address and rekey tests**

```ts
// packages/core/src/material-introspection.test.ts
import { describe, expect, it } from 'vitest'
import { createTestCompiledMaterialProfile } from './testing/material-profile'
import { cloneMaterialGraph, walkMaterialNodes } from './material-introspection'

describe('material graph introspection', () => {
  it('walks canonical slots with stable addresses', () => {
    const profile = createTestCompiledMaterialProfile()
    const child = profile.createNode('box', { id: 'child' })
    const root = profile.createNode('container', { id: 'root', slots: { content: [child] } })
    const schema = schemaWith(root)
    const seen: string[] = []
    walkMaterialNodes(schema, profile, (_node, address) => seen.push(formatMaterialNodeAddress(address)))
    expect(seen).toEqual(['root', 'root/slots/content/0:child'])
  })

  it('rekeys references across multiple selected roots', () => {
    const profile = profileWithReferenceAdapter()
    const first = profile.createNode('reference-box', { id: 'a', model: { peerId: 'b' } })
    const second = profile.createNode('reference-box', { id: 'b', model: { peerId: 'a' } })
    const result = cloneMaterialGraph([first, second], profile, { createIdentity: identity => `copy-${identity.value}` })
    expect(result.roots.map(node => node.id)).toEqual(['copy-a', 'copy-b'])
    expect(result.roots.map(node => node.model.peerId)).toEqual(['copy-b', 'copy-a'])
  })
})
```

- [ ] **Step 2: Run the graph test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/material-introspection.test.ts`

Expected: FAIL because addresses, profile-aware walking, and graph clone/rekey do not exist.

- [ ] **Step 3: Lock graph address and visitor signatures**

```ts
// packages/core/src/material-introspection.ts
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { CompiledMaterialProfile } from './material-profile'

export interface MaterialSlotAddress {
  ownerNodeId: string
  slot: string
  index: number
}

export interface MaterialNodeAddress {
  nodeId: string
  ancestors: readonly MaterialSlotAddress[]
}

export type MaterialNodeVisitor = (
  node: MaterialNode,
  address: MaterialNodeAddress,
  introspection: MaterialIntrospection,
) => void

export function walkMaterialNodes(schema: DocumentSchema, profile: CompiledMaterialProfile, visitor: MaterialNodeVisitor): void {
  schema.elements.forEach((node, index) => walkNode(node, { nodeId: node.id, ancestors: [] }, profile, visitor, `/elements/${index}`))
}

export interface MaterialGraphValidationOptions {
  adapterExcludedNodeIds?: ReadonlySet<string>
}

export function validateMaterialGraph(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile,
  options: MaterialGraphValidationOptions = {},
): MaterialLoadDiagnostic[]
```

`walkNode()` merges standard envelope introspection with adapter introspection before invoking the visitor. Standard identity is `/id` with target `{ scope: 'document', kind: 'node' }`; standard structure entries come from `node.slots`; standard binding entries come from `node.bindings`. An adapter may explicitly declare a custom binding path/port already present in that standard set; core coalesces an exactly equal declaration and rejects a mismatched duplicate. Manifest properties of type `font` and `image` contribute standard font/asset resources at their declared accessor paths. Match every actual slot key to exactly one `MaterialStructureSlotPolicy`; unmatched or multiply matched slots produce graph diagnostics and are not silently assigned policy. `validateMaterialGraph()` checks unique document/node identities for every node, then checks material identity definitions, slot ownership, required references, reference target kind/scope, and introspection path/value consistency. Nodes in `adapterExcludedNodeIds` contribute only standard node identity and canonical slot traversal; their manifest-owned semantics are not evaluated.

For reparent consumers, `same-material` means source owner `type` equals target owner `type`, even when they are different node instances. Both source and target policies participate: either `forbidden` rejects; either `same-material` requires equal owner types; two `allowed` policies permit cross-material moves. Reordering within the same slot is not reparenting.

- [ ] **Step 4: Implement JSON Pointer reads/writes and strict introspection checks**

```ts
export function readPointer(root: unknown, pointer: JsonPointer): unknown
export function writePointer(root: unknown, pointer: JsonPointer, value: unknown): void
export function removePointer(root: unknown, pointer: JsonPointer): void

export function inspectMaterialNode(node: MaterialNode, profile: CompiledMaterialProfile): {
  introspection: MaterialIntrospection
  diagnostics: readonly MaterialGraphDiagnostic[]
}
```

Implement RFC 6901 token decoding (`~0`, `~1`), reject `__proto__`, `prototype`, and `constructor`, and reject any adapter entry whose declared `value` does not equal the value at its path. Require structure paths under `/slots`, binding paths strictly under `/bindings`, and reference/resource paths under `/model`, `/bindings`, or `/slots`. A binding expression anywhere under `/model` is a conformance failure; model data may contain only a stable string port reference whose target exists in `node.bindings`. Reject duplicate semantic paths within one kind except the exact standard/custom binding coalescing rule above.

- [ ] **Step 5: Implement multi-root clone/rekey and the single-root wrapper**

```ts
export interface CloneMaterialGraphOptions {
  createIdentity: (identity: MaterialIdentity, address: MaterialNodeAddress) => string
}

export interface MaterialIdentity {
  ownerNodeId: string
  scope: MaterialIdentityScope
  kind: string
  value: string
}

export type MaterialIdentityKey = string & { readonly __materialIdentityKey: unique symbol }
export function formatMaterialIdentityKey(identity: MaterialIdentity): MaterialIdentityKey

export interface CloneMaterialGraphResult {
  roots: MaterialNode[]
  identityMap: ReadonlyMap<MaterialIdentityKey, string>
  diagnostics: readonly MaterialGraphDiagnostic[]
}

export function cloneMaterialGraph(roots: readonly MaterialNode[], profile: CompiledMaterialProfile, options: CloneMaterialGraphOptions): CloneMaterialGraphResult

export function cloneMaterialSubgraph(root: MaterialNode, profile: CompiledMaterialProfile, options: CloneMaterialGraphOptions) {
  const result = cloneMaterialGraph([root], profile, options)
  return { root: result.roots[0], identityMap: result.identityMap, diagnostics: result.diagnostics }
}

export function admitMaterialGraph(
  roots: readonly unknown[],
  profile: CompiledMaterialProfile,
  budget?: Partial<SchemaAdmissionBudget>,
): Readonly<{
  roots: readonly MaterialNode[]
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  diagnostics: readonly MaterialLoadDiagnostic[]
}>
```

Clone JSON values recursively, then collect every standard node identity plus every adapter-declared material identity before rewriting anything. A document identity key is `{ scope, kind, value }`; a material-scoped key additionally includes `ownerNodeId`. Reject duplicate source keys and duplicate generated values within the same scope/kind/owner, build the complete identity map, rewrite all identity locations, and then rewrite only references whose declared target key exists. For `location: 'key'`, verify and rebuild the object key using its declared `encoding.prefix/suffix`; core never infers embedded IDs from strings. Preserve external references and emit `MATERIAL_REFERENCE_EXTERNAL`; never rewrite resource IDs, datasource IDs, field paths, or undeclared strings.

`admitMaterialGraph()` is the detached-root equivalent of document admission used by clipboard/import. It applies one cumulative profile-capped budget, core envelope decoding, adapter phases, recursive standard slots, and complete graph validation before returning closure-backed sidecars. Unknown/future/quarantined roots remain extractable in its result but callers must not pass them to `cloneMaterialGraph`; the standard paste helper rejects them atomically. Add tests proving byte/node limits run before adapter invocation and invalid roots cannot reach introspection.

Add a private-identity test whose adapter exposes `table.row`, `table.column`, `table.cell`, `table.band`, `table.merge`, and a `cell:<id>` slot-key reference. Assert every identity and reference changes exactly once while cell content remains attached to its rekeyed slot. This fixture proves table adapters can extend clone/rekey without core knowing table JSON fields.

- [ ] **Step 6: Replace schema traversal and clipboard root-only ID replacement**

Make `packages/schema/src/traversal.ts` recurse only through `Object.values(node.slots)`; remove table-cell access. Keep its profile-free helpers for schema-only callers, but use `walkMaterialNodes()` wherever semantic introspection is required.

```ts
// packages/designer/src/interactions/clipboard-actions.ts
function cloneForClipboard(nodes: readonly MaterialNode[]): MaterialNode[] {
  return cloneMaterialGraph(nodes, store.materialProfile, {
    createIdentity: identity => identity.value,
  }).roots
}

function cloneForPaste(nodes: readonly MaterialNode[]): MaterialNode[] {
  return cloneMaterialGraph(nodes, store.materialProfile, {
    createIdentity: identity => generateId(identity.kind.replaceAll('.', '-')),
  }).roots.map(node => ({ ...node, x: node.x + pasteOffset(), y: node.y + pasteOffset() }))
}
```

Use one `cloneMaterialGraph()` call for the complete selection, both for duplicate and paste, so cross-root references share one ID map.

- [ ] **Step 7: Route font discovery through resource slots**

```ts
// packages/core/src/font.ts
export function collectFontFamilies(schema: DocumentSchema, profile: CompiledMaterialProfile): Set<string> {
  const families = new Set<string>()
  walkMaterialNodes(schema, profile, (_node, _address, introspection) => {
    for (const resource of introspection.resources) {
      if (resource.kind === 'font' && resource.value.trim())
        families.add(resource.value.trim())
    }
  })
  if (schema.page.font?.trim())
    families.add(schema.page.font.trim())
  return families
}
```

Add a fixture whose font is at `/model/cells/byId/c1/typography/fontFamily`; assert it is found without a table branch. Update every `collectFontFamilies` call to pass the active profile.

- [ ] **Step 8: Run graph, traversal, font, and clipboard tests**

Run: `pnpm exec vitest run packages/core/src/material-introspection.test.ts packages/core/src/font.test.ts packages/schema/src/traversal.test.ts packages/designer/src/interactions/clipboard-actions.test.ts`

Expected: PASS; nested slots are visited once, private semantic paths are verified, cross-root references rekey, external references remain stable, and fonts are discovered through adapters.

- [ ] **Step 9: Commit graph introspection**

```bash
git add packages/core/src/material-introspection.ts packages/core/src/material-introspection.test.ts packages/core/src/font.ts packages/core/src/font.test.ts packages/core/src/index.ts packages/schema/src/traversal.ts packages/schema/src/traversal.test.ts packages/designer/src/interactions/clipboard-actions.ts packages/designer/src/interactions/clipboard-actions.test.ts
git commit -m "feat(core): introspect and rekey material graphs"
```

## Task 6: Property Descriptor And Accessor Contracts

**Files:**
- Modify: `packages/core/src/material-properties.ts`
- Create: `packages/core/src/material-properties.test.ts`
- Modify: `packages/core/src/material-extension.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/prop-schemas/src/index.ts`
- Modify: `packages/prop-schemas/src/index.test.ts`

- [ ] **Step 1: Write failing accessor tests**

```ts
// packages/core/src/material-properties.test.ts
import { describe, expect, it } from 'vitest'
import { createModelPropertyAccessor, validatePropertyDescriptors } from './material-properties'

describe('PropertyAccessor', () => {
  it('reads and writes a nested model path without owning transaction behavior', () => {
    const accessor = createModelPropertyAccessor<string>('/typography/fontFamily')
    const node = nodeWithModel({ typography: { fontFamily: 'Inter' } })
    expect(accessor.read(node)).toBe('Inter')
    accessor.write(node, 'Noto Sans')
    expect(node.model).toEqual({ typography: { fontFamily: 'Noto Sans' } })
  })

  it('rejects duplicate keys and unsafe accessor paths', () => {
    expect(validatePropertyDescriptors([
      descriptor('font', '/typography/fontFamily'),
      descriptor('font', '/__proto__/polluted'),
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PROPERTY_KEY_DUPLICATE' }),
      expect.objectContaining({ code: 'PROPERTY_ACCESSOR_PATH_UNSAFE' }),
    ]))
  })
})
```

- [ ] **Step 2: Run the property test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/material-properties.test.ts`

Expected: FAIL because path accessors and descriptor validation do not exist.

- [ ] **Step 3: Finalize descriptors and pure accessors**

```ts
// packages/core/src/material-properties.ts
export interface PropertyAccessor<T = unknown> {
  read: (node: MaterialNode) => T
  write: (draft: MaterialNode, value: T) => void
  paths: readonly JsonPointer[]
}

export function createModelPropertyAccessor<T>(path: JsonPointer): PropertyAccessor<T> {
  assertSafeModelPointer(path)
  const fullPath = `/model${path}` as JsonPointer
  return {
    paths: Object.freeze([fullPath]),
    read: node => readPointer(node, fullPath) as T,
    write: (draft, value) => writePointer(draft, fullPath, value),
  }
}

export function resolvePropertyAccessor(descriptor: PropertyDescriptor): PropertyAccessor {
  return descriptor.accessor ?? createModelPropertyAccessor(`/${escapePointer(descriptor.key)}`)
}
```

Keep editor metadata declarative. Every `paths` entry is a canonical node-relative RFC 6901 pointer such as `/model/fontFamily` or `/output/placement`; multi-field accessors list every writable path. `PropertyAccessor.write()` only mutates the draft supplied by the current command/transaction layer; it cannot emit commands, access DOM, end editing sessions, or register side effects. Conformance compares generated patches with `paths` and fails an accessor that writes outside its declaration.

- [ ] **Step 4: Replace `PropSchema` in core with the new public names**

Move `PropSchemaEditorOptions` to `PropertyEditorOptions`, change `PropSchemaLike` to `PropertyDescriptorLike`, and update `SubPropertySchema.schemas`/`PropertyPanelOverlay.schemas` to `PropertyDescriptorLike[]`. Remove `PropSchema.read` and `PropSchema.commit`; material-specific reads/writes use one `PropertyAccessor` object. Keep `PropertyPanelOverlay.readValue/writeValue` because it represents an active sub-selection adapter rather than a node property declaration.

```ts
// packages/core/src/material-extension.ts
export interface PropertyPanelOverlay {
  id: string
  title?: string
  descriptors: PropertyDescriptorLike[]
  readValue: (key: string) => unknown
  writeValue: (key: string, value: unknown) => void
  binding?: MaterialBinding | null
  clearBinding?: (port: string) => void
}
```

- [ ] **Step 5: Convert shared property helpers**

Change `@easyink/prop-schemas` imports and return types from `PropSchema` to `PropertyDescriptor`. Layout behavior descriptors use explicit accessors for `/output/placement`, `/output/break`, and `/output/repeat`; material model descriptors use the default model-key accessor.

```ts
const placementAccessor: PropertyAccessor = {
  paths: Object.freeze(['/output/placement']),
  read: node => node.output.placement?.mode ?? 'flow',
  write: (node, value) => {
    node.output = { ...node.output, placement: { ...node.output.placement, mode: value as 'fixed' | 'flow' } }
  },
}
```

- [ ] **Step 6: Run and commit property contracts**

Run: `pnpm exec vitest run packages/core/src/material-properties.test.ts packages/prop-schemas/src/index.test.ts`

Expected: PASS; path access is prototype-safe, descriptors are unique, and property writes contain no command or UI behavior.

```bash
git add packages/core/src/material-properties.ts packages/core/src/material-properties.test.ts packages/core/src/material-extension.ts packages/core/src/index.ts packages/prop-schemas/src/index.ts packages/prop-schemas/src/index.test.ts
git commit -m "refactor(core): separate property descriptors and accessors"
```

## Task 7: Safe Viewer Render Trees And Browser DOM Capability

**Files:**
- Modify: `packages/core/src/viewer-render-tree.ts`
- Create: `packages/core/src/viewer-render-tree.test.ts`
- Modify: `packages/core/src/material-viewer.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/browser-dom/package.json`
- Create: `packages/browser-dom/tsdown.config.ts`
- Create: `packages/browser-dom/src/policy.ts`
- Create: `packages/browser-dom/src/render-viewer-tree.ts`
- Create: `packages/browser-dom/src/render-viewer-tree.test.ts`
- Create: `packages/browser-dom/src/index.ts`

- [ ] **Step 1: Write failing render-tree algebra tests**

```ts
// packages/core/src/viewer-render-tree.test.ts
import { describe, expect, it } from 'vitest'
import { viewerElement, viewerFragment, viewerImperativeDom, viewerText, VIEWER_TREE_ABSOLUTE_MAX_NODES } from './viewer-render-tree'

describe('ViewerRenderTree', () => {
  it('builds recursively frozen semantic output', () => {
    const tree = viewerElement('table', {}, [
      viewerElement('tbody', {}, [viewerElement('tr', {}, [viewerElement('td', {}, [viewerText('<paid>')])])]),
    ])
    expect(Object.isFrozen(tree)).toBe(true)
    expect(Object.isFrozen(tree.children)).toBe(true)
    expect(tree.children[0].kind).toBe('element')
  })

  it('uses the same 50k absolute budget as Viewer', () => {
    expect(VIEWER_TREE_ABSOLUTE_MAX_NODES).toBe(50_000)
  })

  it('requires an imperative mount disposer', () => {
    const tree = viewerImperativeDom('chart', () => undefined as never)
    expect(() => tree.mount({ element: document.createElement('div'), render: () => ({ dispose() {} }) }))
      .toThrowError('VIEWER_IMPERATIVE_DISPOSER_REQUIRED')
  })

  it('flattens fragments without accepting arbitrary objects', () => {
    expect(() => viewerFragment([{ kind: 'component' } as never])).toThrowError('VIEWER_TREE_KIND_INVALID')
  })
})
```

- [ ] **Step 2: Run the core tree test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/viewer-render-tree.test.ts`

Expected: FAIL because render-tree types and builders do not exist.

- [ ] **Step 3: Implement the framework-neutral tree algebra**

```ts
// packages/core/src/viewer-render-tree.ts
declare const sanitizedMarkupBrand: unique symbol
export interface SanitizedMarkup { readonly [sanitizedMarkupBrand]: true }

export const VIEWER_TREE_ABSOLUTE_MAX_NODES = 50_000
export type ViewerRenderTree = ViewerRenderText | ViewerRenderElement | ViewerRenderFragment | ViewerRenderSanitizedMarkup | ViewerImperativeDomCapability

export interface ViewerRenderText { kind: 'text'; value: string }
export interface ViewerRenderElement {
  kind: 'element'
  tag: string
  namespace?: 'html' | 'svg'
  attributes?: Readonly<Record<string, string | number | boolean>>
  style?: Readonly<Record<string, string | number>>
  children?: readonly ViewerRenderTree[]
}
export interface ViewerRenderFragment { kind: 'fragment'; children: readonly ViewerRenderTree[] }
export interface ViewerRenderSanitizedMarkup { kind: 'sanitized-markup'; value: SanitizedMarkup }
export interface ViewerImperativeHost {
  readonly element: HTMLElement
  render: (tree: ViewerRenderTree, options?: { maxNodes?: number }) => { dispose: () => void }
}
export type ViewerImperativeDisposer = () => void
export interface ViewerImperativeDomCapability {
  kind: 'imperative-dom'
  capability: string
  mount: (host: ViewerImperativeHost) => ViewerImperativeDisposer
}

export function viewerText(value: unknown): ViewerRenderText {
  return Object.freeze({ kind: 'text', value: String(value ?? '') })
}

export function viewerElement(
  tag: string,
  options: Omit<ViewerRenderElement, 'kind' | 'tag' | 'children'> = {},
  children: readonly ViewerRenderTree[] = [],
): ViewerRenderElement {
  assertViewerRenderTree(children)
  return Object.freeze({ kind: 'element', tag, ...freezeElementOptions(options), children: Object.freeze([...children]) })
}

export function viewerFragment(children: readonly ViewerRenderTree[]): ViewerRenderFragment {
  assertViewerRenderTree(children)
  return Object.freeze({ kind: 'fragment', children: Object.freeze([...children]) })
}

export function viewerSanitizedMarkup(value: SanitizedMarkup): ViewerRenderSanitizedMarkup {
  return Object.freeze({ kind: 'sanitized-markup', value })
}

export function viewerImperativeDom(capability: string, mount: ViewerImperativeDomCapability['mount']): ViewerImperativeDomCapability {
  if (!capability.trim())
    throw new Error('VIEWER_IMPERATIVE_CAPABILITY_INVALID')
  return Object.freeze({ kind: 'imperative-dom', capability, mount })
}
```

`viewerImperativeDom()` wraps the callback so the first mount call must return a function or throws `VIEWER_IMPERATIVE_DISPOSER_REQUIRED`. `assertViewerRenderTree(tree, { maxNodes })` is iterative and cycle-aware. It rejects unknown kinds, cycles, non-finite numeric values, and budgets outside `1..VIEWER_TREE_ABSOLUTE_MAX_NODES`; depth 128, 128 attributes per element, and 1 MiB total text are absolute limits. Builder functions shallow-freeze nodes; the full assertion runs once at the browser capability boundary.

- [ ] **Step 4: Replace trusted HTML and HTMLElement viewer outputs**

```ts
// packages/core/src/material-viewer.ts
export interface ViewerRenderOutput {
  tree: ViewerRenderTree
}

export interface ViewerRenderCapabilities {
  sanitizeMarkup: (input: { format: 'svg', source: string }) => SanitizedMarkup
}

export interface ViewerRenderContext {
  data: Record<string, unknown>
  resolvedModel: Record<string, unknown>
  pageIndex: number
  unit: string
  zoom: number
  capabilities: ViewerRenderCapabilities
  reportDiagnostic?: (diagnostic: BindingFormatDiagnostic & { nodeId?: string }) => void
}

export interface MaterialViewerFacet {
  extension: MaterialViewerExtension
  capabilities: {
    sanitizedMarkup?: boolean
    imperativeDom?: readonly string[]
  }
}

export interface MaterialViewerExtension {
  render: (node: MaterialNode, context: ViewerRenderContext) => ViewerRenderOutput
}
```

Remove `TrustedViewerHtml`, `trustedViewerHtml()`, `readTrustedViewerHtml()`, `ViewerRenderOutput.html`, `ViewerRenderOutput.element`, and viewer-side `pageAware`. Page repetition is declared once at `manifest.common.layout.pageRepeat`.

- [ ] **Step 5: Create the browser-only package and write failing security tests**

```json
// packages/browser-dom/package.json
{
  "name": "@easyink/browser-dom",
  "type": "module",
  "version": "0.0.30",
  "description": "Capability-bound safe DOM rendering for EasyInk browser runtimes",
  "license": "MIT",
  "publishConfig": { "access": "public" },
  "sideEffects": false,
  "exports": { ".": "./dist/index.mjs", "./package.json": "./package.json" },
  "types": "./dist/index.d.mts",
  "files": ["dist"],
  "scripts": { "build": "tsdown", "dev": "tsdown --watch" },
  "dependencies": { "@easyink/core": "workspace:*" }
}
```

```ts
// packages/browser-dom/src/render-viewer-tree.test.ts
import { describe, expect, it, vi } from 'vitest'
import { viewerElement, viewerImperativeDom, viewerSanitizedMarkup, viewerText } from '@easyink/core'
import { createBrowserDomCapabilities, renderViewerTree, ViewerTreePolicyError } from './render-viewer-tree'

describe('renderViewerTree', () => {
  it('uses text nodes rather than parsing text content', () => {
    const host = document.createElement('div')
    renderViewerTree(host, viewerElement('div', {}, [viewerText('<img src=x onerror=alert(1)>')]), { maxNodes: 50_000 })
    expect(host.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(host.querySelector('img')).toBeNull()
  })

  it.each([
    viewerElement('img', { attributes: { src: 'javascript:alert(1)' } }),
    viewerElement('div', { attributes: { onclick: 'alert(1)' } }),
    viewerElement('div', { style: { 'background-image': 'url(javascript:alert(1))' } }),
    viewerElement('div', { style: { 'unknown-property': 'red' } }),
  ])('rejects unsafe tree input', (tree) => {
    expect(() => renderViewerTree(document.createElement('div'), tree)).toThrow(ViewerTreePolicyError)
  })

  it('only admits markup tokens minted by the active sanitizer capability', () => {
    const capabilities = createBrowserDomCapabilities({ document })
    expect(() => capabilities.sanitizeMarkup({ format: 'svg', source: '<svg><script>alert(1)</script></svg>' })).toThrow(ViewerTreePolicyError)
    const token = capabilities.sanitizeMarkup({ format: 'svg', source: '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>' })
    const host = document.createElement('div')
    renderViewerTree(host, viewerSanitizedMarkup(token), { capabilities, maxNodes: 50_000 })
    expect(host.querySelector('svg path')).not.toBeNull()
    expect(() => renderViewerTree(host, viewerSanitizedMarkup({} as never), { capabilities })).toThrowError('SANITIZED_MARKUP_TOKEN_INVALID')
  })

  it('gates imperative DOM and always owns its disposer', () => {
    const dispose = vi.fn()
    const tree = viewerImperativeDom('chart', ({ element }) => {
      element.appendChild(document.createElement('canvas'))
      return dispose
    })
    expect(() => renderViewerTree(document.createElement('div'), tree)).toThrowError('IMPERATIVE_DOM_CAPABILITY_DENIED')
    const capabilities = createBrowserDomCapabilities({ document, imperativeDom: ['chart'] })
    const mount = renderViewerTree(document.createElement('div'), tree, { capabilities })
    mount.dispose()
    mount.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('returns an idempotent mount disposer', () => {
    const host = document.createElement('div')
    const mount = renderViewerTree(host, viewerText('ok'))
    mount.dispose()
    mount.dispose()
    expect(host.childNodes).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run the browser test and verify it fails**

Run: `pnpm exec vitest run packages/browser-dom/src/render-viewer-tree.test.ts`

Expected: FAIL because the browser DOM capability does not exist.

- [ ] **Step 7: Define the explicit DOM policy**

```ts
// packages/browser-dom/src/policy.ts
export interface ViewerTreePolicy {
  htmlTags: ReadonlySet<string>
  svgTags: ReadonlySet<string>
  globalAttributes: ReadonlySet<string>
  urlAttributes: ReadonlySet<string>
  cssProperties: ReadonlySet<string>
  maxDepth: number
  maxAttributesPerElement: number
  maxTextBytes: number
  allowUrl: (value: string, attribute: string) => boolean
}

export const DEFAULT_VIEWER_TREE_POLICY: ViewerTreePolicy = createViewerTreePolicy({
  htmlTags: ['div', 'span', 'p', 'br', 'img', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'],
  svgTags: ['svg', 'g', 'defs', 'clipPath', 'linearGradient', 'radialGradient', 'stop', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'image'],
  globalAttributes: ['id', 'class', 'role', 'aria-label', 'aria-describedby', 'aria-hidden', 'title', 'alt', 'width', 'height', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'transform', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'colspan', 'rowspan', 'scope', 'headers'],
  urlAttributes: ['src', 'href', 'xlink:href'],
  cssProperties: ['display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'left', 'top', 'right', 'bottom', 'overflow', 'opacity', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'vertical-align', 'white-space', 'word-break', 'overflow-wrap', 'direction', 'object-fit', 'border', 'border-width', 'border-color', 'border-style', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'border-collapse', 'border-spacing', 'table-layout', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin', 'gap', 'grid-template-columns', 'grid-template-rows', 'flex', 'flex-direction', 'align-items', 'justify-content', 'transform', 'transform-origin'],
})
```

`allowUrl()` accepts relative URLs and `http:`, `https:`, `blob:`, and image-only `data:` URLs. Reject control characters, protocol-relative URLs when the host has no base URL, `javascript:`, `vbscript:`, non-image `data:`, SVG `foreignObject`, every tag not in the allowlist, all attributes beginning with `on`, `style` attributes, and CSS values containing `url(`, `expression(`, `@import`, or backslash-obfuscated equivalents. Tree style keys and the policy allowlist are kebab-case only. `table-layout`, `border-collapse`, and `border-spacing` control DOM presentation only; the table layout plan remains the source of truth for resolved border-conflict geometry and emits the concrete per-edge styles consumed by the tree.

- [ ] **Step 8: Implement the single tree-to-DOM capability**

```ts
// packages/browser-dom/src/render-viewer-tree.ts
import type { ViewerRenderTree } from '@easyink/core'
import { DEFAULT_VIEWER_TREE_POLICY } from './policy'

export interface BrowserDomCapabilities extends ViewerRenderCapabilities {
  readonly imperativeDom: ReadonlySet<string>
}

export interface CreateBrowserDomCapabilitiesOptions {
  document: Document
  policy?: ViewerTreePolicy
  imperativeDom?: readonly string[]
}

export function createBrowserDomCapabilities(options: CreateBrowserDomCapabilitiesOptions): BrowserDomCapabilities

export interface ViewerTreeRenderOptions {
  document?: Document
  policy?: ViewerTreePolicy
  capabilities?: BrowserDomCapabilities
  maxNodes?: number
}

export interface ViewerTreeMount {
  readonly nodes: readonly Node[]
  dispose: () => void
}

export function renderViewerTree(host: HTMLElement, tree: ViewerRenderTree, options: ViewerTreeRenderOptions = {}): ViewerTreeMount {
  const doc = options.document ?? host.ownerDocument
  const policy = options.policy ?? DEFAULT_VIEWER_TREE_POLICY
  const maxNodes = options.maxNodes ?? VIEWER_TREE_ABSOLUTE_MAX_NODES
  assertViewerRenderTree(tree, { maxNodes })
  const nodes = buildNodes(doc, tree, policy, options.capabilities, maxNodes)
  host.replaceChildren(...nodes)
  let disposed = false
  return Object.freeze({
    nodes: Object.freeze([...nodes]),
    dispose() {
      if (disposed)
        return
      disposed = true
      for (const node of nodes) {
        if (node.parentNode === host)
          host.removeChild(node)
      }
    },
  })
}
```

`createBrowserDomCapabilities({ document, policy?, imperativeDom? })` owns a module-private `WeakMap<SanitizedMarkup, SanitizedSvgTree>`. `sanitizeMarkup()` parses SVG with `DOMParser`, rejects parser errors, non-`svg` roots, or any disallowed tag/attribute/URL/style, rebuilds a policy-approved internal tree, and returns only an opaque token. `renderViewerTree()` rejects tokens absent from that exact capability map.

Build normal trees with `createElement`, `createElementNS`, `createTextNode`, `setAttribute`, and `style.setProperty`; never assign `innerHTML`. For `imperative-dom`, require the capability string in `capabilities.imperativeDom`, create a dedicated child host, expose only `{ element, render }`, require a disposer, and add it to the parent mount's reverse-order idempotent disposal list. Validate `maxNodes` against the single exported absolute limit; nested `host.render()` calls share the remaining budget rather than resetting it.

- [ ] **Step 9: Run core/browser tests and build the package**

Run: `pnpm exec vitest run packages/core/src/viewer-render-tree.test.ts packages/browser-dom/src/render-viewer-tree.test.ts`

Expected: PASS; text remains text, unsafe markup/URLs/styles fail closed, semantic table/SVG nodes render, and disposal is idempotent.

Run: `pnpm --filter @easyink/browser-dom build`

Expected: PASS with declarations and ESM output.

- [ ] **Step 10: Commit the safe render capability**

```bash
git add packages/core/src/viewer-render-tree.ts packages/core/src/viewer-render-tree.test.ts packages/core/src/material-viewer.ts packages/core/src/index.ts packages/browser-dom/package.json packages/browser-dom/tsdown.config.ts packages/browser-dom/src/policy.ts packages/browser-dom/src/render-viewer-tree.ts packages/browser-dom/src/render-viewer-tree.test.ts packages/browser-dom/src/index.ts
git commit -m "feat(browser-dom): safely mount viewer render trees"
```

## Task 8: Runtime Facet Lifecycle And Quarantine

**Files:**
- Create: `packages/core/src/material-facet-host.ts`
- Create: `packages/core/src/material-facet-host.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing lifecycle isolation tests**

```ts
// packages/core/src/material-facet-host.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'
import { MaterialFacetHost } from './material-facet-host'

describe('MaterialFacetHost', () => {
  it('deduplicates concurrent activation and disposes once', async () => {
    const dispose = vi.fn()
    const factory = vi.fn(async () => ({ dispose }))
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'chart', viewer: factory })])
    const host = new MaterialFacetHost()
    const [a, b] = await Promise.all([host.activate(profile, 'chart', 'viewer'), host.activate(profile, 'chart', 'viewer')])
    expect(a).toBe(b)
    expect(factory).toHaveBeenCalledTimes(1)
    await a.dispose()
    await a.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('quarantines only the failing surface of one material', async () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'broken', designer: true, viewer: async () => { throw new Error('boom') } }),
      createTestMaterialManifest({ type: 'healthy', viewer: true }),
    ])
    const host = new MaterialFacetHost()
    expect((await host.activate(profile, 'broken', 'viewer')).state).toBe('quarantined')
    expect((await host.activate(profile, 'broken', 'designer')).state).toBe('active')
    expect((await host.activate(profile, 'healthy', 'viewer')).state).toBe('active')
  })
})
```

- [ ] **Step 2: Run the lifecycle test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/material-facet-host.test.ts`

Expected: FAIL because facet instances and the lifecycle host do not exist.

- [ ] **Step 3: Define stable instance states and diagnostics**

```ts
// packages/core/src/material-facet-host.ts
import type { CompiledMaterialProfile } from './material-profile'

export type RuntimeMaterialSurface = 'designer' | 'viewer'
export type FacetState = 'active' | 'quarantined' | 'disposed'

export interface FacetDiagnostic {
  code: 'MATERIAL_FACET_NOT_DECLARED' | 'MATERIAL_FACET_ACTIVATION_FAILED' | 'MATERIAL_FACET_DISPOSE_FAILED'
  severity: 'error' | 'warning'
  profileId: string
  materialType: string
  surface: RuntimeMaterialSurface
  message: string
  cause?: { name?: string, message: string }
}

export interface FacetInstance<T = unknown> {
  readonly profile: CompiledMaterialProfile
  readonly materialType: string
  readonly surface: RuntimeMaterialSurface
  readonly state: FacetState
  readonly value?: T
  readonly diagnostic?: FacetDiagnostic
  dispose: () => Promise<void>
}
```

- [ ] **Step 4: Implement activation deduplication and profile-scoped quarantine**

```ts
export class MaterialFacetHost {
  private readonly profiles = new WeakMap<CompiledMaterialProfile, Map<string, Promise<FacetInstance>>>()
  private readonly instances = new WeakMap<CompiledMaterialProfile, Map<string, FacetInstance>>()
  private readonly active = new Set<FacetInstance>()

  constructor(private readonly options: {
    getActivationServices?: (profile: CompiledMaterialProfile, materialType: string, surface: RuntimeMaterialSurface) => unknown
  } = {}) {}

  activate<T>(profile: CompiledMaterialProfile, materialType: string, surface: RuntimeMaterialSurface): Promise<FacetInstance<T>> {
    const cache = getProfileCache(this.profiles, profile)
    const key = `${surface}:${materialType}`
    const existing = cache.get(key)
    if (existing)
      return existing as Promise<FacetInstance<T>>
    const pending = this.activateOne<T>(profile, materialType, surface, cache, key)
    cache.set(key, pending)
    return pending
  }

  peek<T>(profile: CompiledMaterialProfile, materialType: string, surface: RuntimeMaterialSurface): FacetInstance<T> | undefined {
    return this.instances.get(profile)?.get(`${surface}:${materialType}`) as FacetInstance<T> | undefined
  }

  async dispose(): Promise<readonly FacetDiagnostic[]> {
    const diagnostics: FacetDiagnostic[] = []
    for (const instance of [...this.active]) {
      try { await instance.dispose() }
      catch (error) { diagnostics.push(disposeDiagnostic(instance, error)) }
    }
    return Object.freeze(diagnostics)
  }
}
```

`activateOne()` resolves the manifest and surface factory, invokes it once with identifiers plus `services: options.getActivationServices?.(...)`, records the settled instance for `peek()`, and accepts a value whose optional `dispose()` method is called by the instance disposer. Factory failure returns a cached quarantined instance; it never rejects to a runtime render loop. Disposing an active instance is idempotent, removes it from the pending/instance cache and active set, and allows a deliberate later reactivation. A quarantined instance remains cached for that exact profile object; only compiling a new profile object permits retry.

- [ ] **Step 5: Add missing-facet, disposal-failure, and new-profile retry tests**

```ts
it('does not retry quarantine until a new profile snapshot is supplied', async () => {
  const factory = vi.fn(async () => { throw new Error('broken') })
  const manifest = createTestMaterialManifest({ type: 'chart', viewer: factory })
  const host = new MaterialFacetHost()
  await host.activate(createTestCompiledMaterialProfile([manifest]), 'chart', 'viewer')
  const secondProfile = createTestCompiledMaterialProfile([manifest])
  await host.activate(secondProfile, 'chart', 'viewer')
  expect(factory).toHaveBeenCalledTimes(2)
})
```

Assert missing facets return `MATERIAL_FACET_NOT_DECLARED`, thrown primitive values are serialized safely, and one failing `dispose()` does not prevent remaining instances from disposal.

- [ ] **Step 6: Run and commit facet lifecycle**

Run: `pnpm exec vitest run packages/core/src/material-facet-host.test.ts`

Expected: PASS; activation is exactly-once per key, quarantine is surface-local, disposal is idempotent, and a new profile can retry.

```bash
git add packages/core/src/material-facet-host.ts packages/core/src/material-facet-host.test.ts packages/core/src/index.ts
git commit -m "feat(core): isolate material facet lifecycle failures"
```

## Task 9: Migrate Builtin Nodes To The Canonical Envelope

**Files:**
- Create: `packages/builtin/src/node-envelope.test.ts`
- Modify: `packages/schema/src/types.ts`
- Modify: `packages/core/src/selection.ts`, `packages/core/src/condition.ts`, `packages/core/src/layout-plan.ts`, `packages/core/src/page-planner.ts`, `packages/core/src/commands/data.ts`, `packages/core/src/commands/document.ts`, and `packages/core/src/commands/helpers.ts`.
- Test: `packages/core/src/selection.test.ts`, `packages/core/src/condition.test.ts`, `packages/core/src/page-planner.test.ts`, and `packages/core/src/command.test.ts`.
- Modify: `packages/materials/barcode/src/schema.ts`, `packages/materials/ellipse/src/schema.ts`, `packages/materials/flow-row/src/schema.ts`, `packages/materials/image/src/schema.ts`, `packages/materials/line/src/schema.ts`, `packages/materials/page-number/src/schema.ts`, `packages/materials/progress/src/schema.ts`, `packages/materials/qrcode/src/schema.ts`, `packages/materials/rating/src/schema.ts`, `packages/materials/rect/src/schema.ts`, `packages/materials/ring-progress/src/schema.ts`, `packages/materials/signature/src/schema.ts`, and `packages/materials/text/src/schema.ts`.
- Modify: `packages/materials/svg/custom/src/schema.ts`, `packages/materials/svg/heart/src/schema.ts`, and `packages/materials/svg/star/src/schema.ts`.
- Modify: `packages/materials/chart/bar/src/schema.ts`, `packages/materials/chart/custom/src/schema.ts`, `packages/materials/chart/gauge/src/schema.ts`, `packages/materials/chart/line/src/schema.ts`, `packages/materials/chart/pie/src/schema.ts`, `packages/materials/chart/radar/src/schema.ts`, and `packages/materials/chart/scatter/src/schema.ts`.
- Modify: `packages/materials/table/static/src/schema.ts`, `packages/materials/table/data/src/schema.ts`, `packages/materials/table/kernel/src/schema.ts`, `packages/materials/table/kernel/src/types.ts`, `packages/materials/table/kernel/src/commands.ts`, `packages/materials/table/kernel/src/resize-adapter.ts`, `packages/materials/table/kernel/src/editing/geometry.ts`, and `packages/materials/table/kernel/src/editing/behaviors.ts`.
- Modify: `packages/materials/barcode/src/designer.ts`, `packages/materials/ellipse/src/designer.ts`, `packages/materials/flow-row/src/designer.ts`, `packages/materials/image/src/designer.ts`, `packages/materials/line/src/designer.ts`, `packages/materials/page-number/src/designer.ts`, `packages/materials/progress/src/designer.ts`, `packages/materials/qrcode/src/designer.ts`, `packages/materials/rating/src/designer.ts`, `packages/materials/rect/src/designer.ts`, `packages/materials/ring-progress/src/designer.ts`, `packages/materials/signature/src/designer.ts`, and `packages/materials/text/src/designer.ts`.
- Modify: `packages/materials/svg/custom/src/designer.ts`, `packages/materials/svg/heart/src/designer.ts`, `packages/materials/svg/star/src/designer.ts`, `packages/materials/chart/custom/src/designer.ts`, `packages/materials/table/static/src/designer.ts`, and `packages/materials/table/data/src/designer.ts`.
- Modify: `packages/materials/flow-row/src/rendering.ts`, `packages/materials/page-number/src/rendering.ts`, `packages/materials/progress/src/rendering.ts`, `packages/materials/rating/src/rendering.ts`, `packages/materials/ring-progress/src/rendering.ts`, `packages/materials/signature/src/rendering.ts`, `packages/materials/text/src/rendering.ts`, `packages/materials/svg/custom/src/rendering.ts`, `packages/materials/svg/heart/src/rendering.ts`, and `packages/materials/svg/star/src/rendering.ts`.
- Modify: `packages/materials/text/src/layout.ts`, `packages/materials/table/data/src/layout.ts`, `packages/materials/chart/bar/src/data-contract.ts`, `packages/materials/chart/gauge/src/data-contract.ts`, `packages/materials/chart/line/src/data-contract.ts`, `packages/materials/chart/pie/src/data-contract.ts`, `packages/materials/chart/radar/src/data-contract.ts`, and `packages/materials/chart/scatter/src/data-contract.ts`.
- Modify: `packages/materials/barcode/src/prop-schemas.ts`, `packages/materials/ellipse/src/prop-schemas.ts`, `packages/materials/flow-row/src/prop-schemas.ts`, `packages/materials/image/src/prop-schemas.ts`, `packages/materials/line/src/prop-schemas.ts`, `packages/materials/page-number/src/prop-schemas.ts`, `packages/materials/progress/src/prop-schemas.ts`, `packages/materials/qrcode/src/prop-schemas.ts`, `packages/materials/rating/src/prop-schemas.ts`, `packages/materials/rect/src/prop-schemas.ts`, `packages/materials/ring-progress/src/prop-schemas.ts`, `packages/materials/signature/src/prop-schemas.ts`, and `packages/materials/text/src/prop-schemas.ts`.
- Modify: `packages/materials/svg/custom/src/prop-schemas.ts`, `packages/materials/svg/heart/src/prop-schemas.ts`, `packages/materials/svg/star/src/prop-schemas.ts`, `packages/materials/chart/bar/src/prop-schemas.ts`, `packages/materials/chart/custom/src/prop-schemas.ts`, `packages/materials/chart/gauge/src/prop-schemas.ts`, `packages/materials/chart/line/src/prop-schemas.ts`, `packages/materials/chart/pie/src/prop-schemas.ts`, `packages/materials/chart/radar/src/prop-schemas.ts`, `packages/materials/chart/scatter/src/prop-schemas.ts`, `packages/materials/table/static/src/prop-schemas.ts`, and `packages/materials/table/data/src/prop-schemas.ts`.

- [ ] **Step 1: Write a failing builtin default-node envelope test**

```ts
// packages/builtin/src/node-envelope.test.ts
import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createBarcodeNode } from '@easyink/material-barcode'
import { createChartBarNode } from '@easyink/material-chart-bar'
import { createChartCustomNode } from '@easyink/material-chart-custom'
import { createChartGaugeNode } from '@easyink/material-chart-gauge'
import { createChartLineNode } from '@easyink/material-chart-line'
import { createChartPieNode } from '@easyink/material-chart-pie'
import { createChartRadarNode } from '@easyink/material-chart-radar'
import { createChartScatterNode } from '@easyink/material-chart-scatter'
import { createEllipseNode } from '@easyink/material-ellipse'
import { createFlowRowNode } from '@easyink/material-flow-row'
import { createImageNode } from '@easyink/material-image'
import { createLineNode } from '@easyink/material-line'
import { createPageNumberNode } from '@easyink/material-page-number'
import { createProgressNode } from '@easyink/material-progress'
import { createQrcodeNode } from '@easyink/material-qrcode'
import { createRatingNode } from '@easyink/material-rating'
import { createRectNode } from '@easyink/material-rect'
import { createRingProgressNode } from '@easyink/material-ring-progress'
import { createSignatureNode } from '@easyink/material-signature'
import { createSvgCustomNode } from '@easyink/material-svg-custom'
import { createSvgHeartNode } from '@easyink/material-svg-heart'
import { createSvgStarNode } from '@easyink/material-svg-star'
import { createTableDataNode } from '@easyink/material-table-data'
import { createTableStaticNode } from '@easyink/material-table-static'
import { createTextNode } from '@easyink/material-text'

const factories = [
  createBarcodeNode, createChartBarNode, createChartCustomNode, createChartGaugeNode, createChartLineNode,
  createChartPieNode, createChartRadarNode, createChartScatterNode, createEllipseNode, createFlowRowNode,
  createImageNode, createLineNode, createPageNumberNode, createProgressNode, createQrcodeNode, createRatingNode,
  createRectNode, createRingProgressNode, createSignatureNode, createSvgCustomNode, createSvgHeartNode,
  createSvgStarNode, createTableDataNode, createTableStaticNode, createTextNode,
]

describe('builtin default node envelopes', () => {
  it.each(factories)('$name returns only canonical root fields', (factory) => {
    const node = factory({ id: `test-${factory.name}` })
    assertCanonical(node)
  })
})

function assertCanonical(node: MaterialNode): void {
  expect(node.modelVersion).toBeGreaterThan(0)
  expect(node.model).toBeTypeOf('object')
  expect(node.slots).toBeTypeOf('object')
  expect(node.bindings).toBeTypeOf('object')
  expect(node.output.visibility).toBe('include')
  for (const key of ['props', 'binding', 'children', 'table'])
    expect(Object.hasOwn(node, key)).toBe(false)
  for (const children of Object.values(node.slots))
    children.forEach(assertCanonical)
}
```

- [ ] **Step 2: Run the default-node test and verify it fails**

Run: `pnpm exec vitest run packages/builtin/src/node-envelope.test.ts`

Expected: FAIL because builtin factories still write legacy root fields.

- [ ] **Step 3: Add canonical read helpers and rename model commands**

```ts
// packages/schema/src/types.ts
export function getNodeModel<TModel>(node: MaterialNode): TModel {
  return node.model as TModel
}

export function getNodeBinding(node: MaterialNode, port = 'value'): MaterialBinding | undefined {
  return node.bindings[port]
}

export function getDefaultMaterialSlot(node: MaterialNode): MaterialNode[] {
  return node.slots.default ?? []
}

export function isNodeEditorHidden(node: MaterialNode): boolean {
  return node.editorState?.hidden === true
}
```

Rename `UpdateMaterialPropsCommand` to `UpdateMaterialModelCommand` and make it write `node.model`. Replace `UpdateMaterialMetaCommand` with `UpdateMaterialEditorStateCommand` for `name/locked/hidden` and `UpdateMaterialOutputCommand` for output visibility/print/placement/break/repeat/animations. `UpdateRenderConditionCommand` writes `node.output.renderCondition`; binding commands read/write `node.bindings.value`. Preserve existing undo/redo tests with canonical before/after assertions.

- [ ] **Step 4: Convert one simple factory completely, then apply the exact envelope pattern to simple materials**

```ts
// packages/materials/text/src/schema.ts
export function createTextNode(partial: Partial<MaterialNode> = {}, unit?: string): MaterialNode<TextProps> {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const {
    type: _type, modelVersion: _version, model: inputModel, slots = {}, bindings = {},
    editorState, output, ...envelope
  } = partial
  const model = (inputModel ?? {}) as Partial<TextProps>
  return {
    id: generateId('text'), x: 0, y: 0, width: c(80), height: c(20),
    ...envelope,
    type: TEXT_TYPE,
    modelVersion: 1,
    model: {
      ...TEXT_DEFAULTS,
      fontSize: c(TEXT_DEFAULTS.fontSize),
      letterSpacing: c(TEXT_DEFAULTS.letterSpacing),
      ...model,
      wrapMode: model.wrapMode ?? TEXT_DEFAULTS.wrapMode,
    },
    slots,
    bindings,
    ...(editorState ? { editorState } : {}),
    output: { visibility: 'include', ...output },
  }
}
```

Apply this complete destructuring/merge order to barcode, ellipse, image, line, page-number, progress, qrcode, rating, rect, ring-progress, signature, SVG, and chart factories. Model version 1 means the current canonical material model shape after root-field relocation; unit conversion remains exactly where the old factory applied it. Remove `TextProps.autoWrap` and `FlowRowProps.padding` from current types/defaults. Their version-0 migrations derive `wrapMode` and `paddingX/paddingY` before deleting the legacy keys. Replace `getNodeProps<T>()` calls with `getNodeModel<T>()` and delete the old helper after the repository scan is clean.

- [ ] **Step 5: Convert root behavior, binding, and structure reads**

Use these exact mappings throughout core, material, Designer, and Viewer source:

```ts
node.props                         -> node.model
node.binding                       -> getNodeBinding(node)
node.children                      -> node.slots.default
node.locked                        -> node.editorState?.locked
node.hidden                        -> node.editorState?.hidden
node.renderCondition               -> node.output.renderCondition
node.print                         -> node.output.print
node.placement                     -> node.output.placement
node.break                         -> node.output.break
node.repeat                        -> node.output.repeat
node.animations                    -> node.output.animations
```

Do not use broad `.props` replacement because Vue component props and AI property descriptors are unrelated. Update source paths listed in this task and let TypeScript identify additional `MaterialNode` reads.

- [ ] **Step 6: Relocate the current table payload without redesigning it**

```ts
// packages/materials/table/kernel/src/schema.ts
import type { TableModel } from './model'

export function getTableMaterialModel(node: MaterialNode): TableModel {
  return getNodeModel<TableModel>(node)
}
```

Both table factories return `modelVersion: 1` and install the `TableModel` value directly as `node.model`; there is no v1 `model.table` wrapper and no root `table`. Validation and property paths therefore begin at `/model/bands`, `/model/columns`, `/model/merges`, `/model/style`, and `/model/data`. The legacy decoder in Task 4 may temporarily place an old root `table` at `model.table` only while `modelVersion === 0`; the table 0-to-1 adapter must unwrap and convert it. The source updates listed in this task replace root table reads with `getTableMaterialModel()` but take their private model, topology, selection, and pagination behavior from the complex-table tasks named in the cross-plan order above; do not introduce a second transitional v1 shape here.

- [ ] **Step 7: Convert flow-row private bindings and all property descriptors**

```ts
// packages/materials/flow-row/src/schema.ts
export interface FlowColumnDef {
  id: string
  ratio: number
  textAlign: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  content?: string
  wrapMode: 'inline' | 'block'
  bindingPort?: string
}
```

Flow-row binding ports are migrated in Task 10. Each v1 column has a material-scoped `id` plus optional `bindingPort`; it contains no `binding` object. Default columns use deterministic `default-0...default-n` IDs because material scope includes the owner node ID; newly inserted columns and ports use the host identity allocator outside the deterministic adapter. The adapter moves each expression to `node.bindings[bindingPort]`, and Viewer/schema tools resolve or discover it through that canonical port without special-casing private binding shapes. Dynamic column property editors use one accessor whose paths are `/model/columns/<index>/bindingPort` and `/bindings/<escaped-port>`; its write operation allocates/removes the canonical port atomically. Convert every material `PropSchema[]` export to `PropertyDescriptor[]`; simple keys use default model access, nested typography keys use `createModelPropertyAccessor('/typography/...')`, and table visibility descriptors use explicit `/model/bands/...` accessors. Remove descriptor `commit` callbacks and leave lifecycle/transaction behavior in the existing editing layer.

- [ ] **Step 8: Run focused tests and scan for forbidden root access**

Run: `pnpm exec vitest run packages/builtin/src/node-envelope.test.ts packages/core/src/command.test.ts packages/core/src/condition.test.ts packages/materials/table/kernel/src/commands.test.ts`

Expected: PASS; all defaults are canonical and command undo/redo updates the new locations.

Run: `rg -n "\b(node|el|element|material)\.(props|binding|children|table|hidden|locked|renderCondition|print|placement|break|repeat|animations)\b|getNodeProps|UpdateMaterialPropsCommand" packages --glob "*.ts" --glob "*.vue"`

Expected: no output. References such as Vue `props`, descriptor `properties`, and `manifest.common.binding` do not match this guard.

- [ ] **Step 9: Build schema, core, and all material packages**

Run: `pnpm --filter @easyink/schema build`

Expected: PASS.

Run: `pnpm --filter @easyink/core build`

Expected: PASS.

Run: `pnpm --filter "@easyink/material-*" build`

Expected: PASS; no material package relies on removed root fields.

- [ ] **Step 10: Commit canonical builtin nodes**

```bash
git add packages/schema packages/core packages/materials packages/builtin/src/node-envelope.test.ts
git commit -m "refactor(materials): migrate builtins to canonical node envelopes"
```

## Task 10: One Manifest Per Material And Safe Viewer Output

**Files:**
- Modify: `packages/core/src/material-extension.ts` and `packages/core/src/material-viewer.ts`: concrete facet value types.
- Create: `packages/materials/barcode/src/manifest.ts`, `packages/materials/ellipse/src/manifest.ts`, `packages/materials/flow-row/src/manifest.ts`, `packages/materials/image/src/manifest.ts`, `packages/materials/line/src/manifest.ts`, `packages/materials/page-number/src/manifest.ts`, `packages/materials/progress/src/manifest.ts`, `packages/materials/qrcode/src/manifest.ts`, `packages/materials/rating/src/manifest.ts`, `packages/materials/rect/src/manifest.ts`, `packages/materials/ring-progress/src/manifest.ts`, `packages/materials/signature/src/manifest.ts`, and `packages/materials/text/src/manifest.ts`.
- Create: `packages/materials/svg/custom/src/manifest.ts`, `packages/materials/svg/heart/src/manifest.ts`, and `packages/materials/svg/star/src/manifest.ts`.
- Create: `packages/materials/chart/bar/src/manifest.ts`, `packages/materials/chart/custom/src/manifest.ts`, `packages/materials/chart/gauge/src/manifest.ts`, `packages/materials/chart/line/src/manifest.ts`, `packages/materials/chart/pie/src/manifest.ts`, `packages/materials/chart/radar/src/manifest.ts`, and `packages/materials/chart/scatter/src/manifest.ts`.
- Create: `packages/materials/table/static/src/manifest.ts` and `packages/materials/table/data/src/manifest.ts`.
- Create: `packages/materials/text/src/schema-adapter.ts` and `packages/materials/flow-row/src/schema-adapter.ts`.
- Test: `packages/materials/text/src/schema-adapter.test.ts` and `packages/materials/flow-row/src/schema-adapter.test.ts`.
- Modify: `packages/materials/barcode/src/index.ts`, `packages/materials/ellipse/src/index.ts`, `packages/materials/flow-row/src/index.ts`, `packages/materials/image/src/index.ts`, `packages/materials/line/src/index.ts`, `packages/materials/page-number/src/index.ts`, `packages/materials/progress/src/index.ts`, `packages/materials/qrcode/src/index.ts`, `packages/materials/rating/src/index.ts`, `packages/materials/rect/src/index.ts`, `packages/materials/ring-progress/src/index.ts`, `packages/materials/signature/src/index.ts`, and `packages/materials/text/src/index.ts`.
- Modify: `packages/materials/svg/custom/src/index.ts`, `packages/materials/svg/heart/src/index.ts`, `packages/materials/svg/star/src/index.ts`, `packages/materials/chart/bar/src/index.ts`, `packages/materials/chart/custom/src/index.ts`, `packages/materials/chart/gauge/src/index.ts`, `packages/materials/chart/line/src/index.ts`, `packages/materials/chart/pie/src/index.ts`, `packages/materials/chart/radar/src/index.ts`, `packages/materials/chart/scatter/src/index.ts`, `packages/materials/table/static/src/index.ts`, and `packages/materials/table/data/src/index.ts`.
- Modify: `packages/materials/barcode/src/viewer.ts`, `packages/materials/ellipse/src/viewer.ts`, `packages/materials/flow-row/src/viewer.ts`, `packages/materials/image/src/viewer.ts`, `packages/materials/line/src/viewer.ts`, `packages/materials/page-number/src/viewer.ts`, `packages/materials/progress/src/viewer.ts`, `packages/materials/qrcode/src/viewer.ts`, `packages/materials/rating/src/viewer.ts`, `packages/materials/rect/src/viewer.ts`, `packages/materials/ring-progress/src/viewer.ts`, `packages/materials/signature/src/viewer.ts`, and `packages/materials/text/src/viewer.ts`.
- Modify: `packages/materials/svg/custom/src/viewer.ts`, `packages/materials/svg/heart/src/viewer.ts`, `packages/materials/svg/star/src/viewer.ts`, `packages/materials/chart/bar/src/viewer.ts`, `packages/materials/chart/custom/src/viewer.ts`, `packages/materials/chart/gauge/src/viewer.ts`, `packages/materials/chart/line/src/viewer.ts`, `packages/materials/chart/pie/src/viewer.ts`, `packages/materials/chart/radar/src/viewer.ts`, `packages/materials/chart/scatter/src/viewer.ts`, `packages/materials/table/static/src/viewer.ts`, and `packages/materials/table/data/src/viewer.ts`.
- Create: `packages/materials/image/src/viewer.test.ts` and `packages/materials/chart/bar/src/viewer.test.ts`.
- Modify: `packages/materials/barcode/src/ai.ts`, `packages/materials/ellipse/src/ai.ts`, `packages/materials/flow-row/src/ai.ts`, `packages/materials/image/src/ai.ts`, `packages/materials/line/src/ai.ts`, `packages/materials/page-number/src/ai.ts`, `packages/materials/progress/src/ai.ts`, `packages/materials/qrcode/src/ai.ts`, `packages/materials/rating/src/ai.ts`, `packages/materials/rect/src/ai.ts`, `packages/materials/ring-progress/src/ai.ts`, `packages/materials/signature/src/ai.ts`, and `packages/materials/text/src/ai.ts`.
- Modify: `packages/materials/svg/custom/src/ai.ts`, `packages/materials/svg/heart/src/ai.ts`, `packages/materials/svg/star/src/ai.ts`, `packages/materials/chart/bar/src/ai.ts`, `packages/materials/chart/custom/src/ai.ts`, `packages/materials/chart/gauge/src/ai.ts`, `packages/materials/chart/line/src/ai.ts`, `packages/materials/chart/pie/src/ai.ts`, `packages/materials/chart/radar/src/ai.ts`, `packages/materials/chart/scatter/src/ai.ts`, `packages/materials/table/static/src/ai.ts`, and `packages/materials/table/data/src/ai.ts`.
- Modify: `packages/materials/barcode/src/viewer.test.ts`, `packages/materials/chart/custom/src/viewer.test.ts`, `packages/materials/flow-row/src/viewer.test.ts`, `packages/materials/line/src/viewer.test.ts`, `packages/materials/progress/src/viewer.test.ts`, `packages/materials/qrcode/src/viewer.test.ts`, `packages/materials/rating/src/viewer.test.ts`, `packages/materials/ring-progress/src/viewer.test.ts`, `packages/materials/table/data/src/viewer.test.ts`, `packages/materials/table/static/src/viewer.test.ts`, `packages/materials/text/src/viewer.test.ts`, `packages/materials/ellipse/src/ellipse.test.ts`, `packages/materials/svg/custom/src/sanitize.test.ts`, `packages/materials/svg/heart/src/heart.test.ts`, and `packages/materials/svg/star/src/star.test.ts`.
- Modify: `packages/builtin/src/types.ts`, `packages/builtin/src/basic.ts`, `packages/builtin/src/all.ts`, `packages/builtin/src/none.ts`, `packages/builtin/src/index.ts`, `packages/builtin/src/index.test.ts`, and `packages/builtin/src/designer.test.ts`.
- Delete: `packages/builtin/src/designer.ts`, `packages/builtin/src/viewer.ts`, and `packages/builtin/src/bindings.ts` after binding declarations move into manifests.

- [ ] **Step 1: Write failing package-local manifest and builtin-set tests**

```ts
// packages/builtin/src/index.test.ts
import { describe, expect, it } from 'vitest'
import {
  builtinAllMaterialPackage,
  builtinBasicMaterialPackage,
  builtinNoneMaterialPackage,
  compileBuiltinMaterialProfile,
} from './index'

describe('builtin material packages', () => {
  it('uses one manifest object per type across all surfaces', () => {
    const all = builtinAllMaterialPackage.manifests
    expect(new Set(all.map(manifest => manifest.type)).size).toBe(all.length)
    expect(all.every(manifest => manifest.facets.viewer)).toBe(true)
    expect(all.filter(manifest => manifest.facets.ai?.generation.enabled).every(manifest => manifest.facets.designer)).toBe(true)
  })

  it('compiles basic, all, and none through the same package boundary', () => {
    expect(compileBuiltinMaterialProfile('basic').materialTypes).toEqual(builtinBasicMaterialPackage.manifests.map(item => item.type).sort())
    expect(compileBuiltinMaterialProfile('all').materialTypes).toEqual(builtinAllMaterialPackage.manifests.map(item => item.type).sort())
    expect(compileBuiltinMaterialProfile('none').materialTypes).toEqual([])
    expect(builtinNoneMaterialPackage.manifests).toEqual([])
  })
})
```

- [ ] **Step 2: Run the builtin test and verify it fails**

Run: `pnpm exec vitest run packages/builtin/src/index.test.ts`

Expected: FAIL because builtin sets still assemble separate Designer and Viewer registrations.

- [ ] **Step 3: Create a complete package-local manifest for text**

First add the framework-neutral facet value to `packages/core/src/material-extension.ts`:

```ts
export interface MaterialDesignerFacet {
  extension: MaterialDesignerExtension
  catalog: { group: string, order: number }
  localeMessages?: {
    messages?: Record<string, unknown>
    locales?: Record<string, Record<string, unknown>>
  }
}
```

```ts
// packages/materials/text/src/manifest.ts
import type { MaterialDesignerFacet, MaterialExtensionContext, MaterialViewerFacet } from '@easyink/core'
import { createModelPropertyAccessor, defineMaterialManifest } from '@easyink/core'
import { TEXT_CONDITION, TEXT_DEFAULTS, TEXT_TYPE } from './schema'
import { createTextExtension } from './designer'
import { textAIMaterialDescriptor } from './ai'
import { textLocaleMessages } from './locale'
import { textDesignerPropSchemas } from './prop-schemas'
import { textSchemaAdapter } from './schema-adapter'
import { renderText } from './viewer'

export const textMaterialManifest = defineMaterialManifest<MaterialDesignerFacet, MaterialViewerFacet>({
  manifestVersion: 1,
  apiVersion: 1,
  engineRange: { min: '0.0.30', maxExclusive: '0.1.0' },
  type: TEXT_TYPE,
  modelVersion: 1,
  common: {
    nameKey: 'materials.text.name', category: 'basic', iconKey: 'text',
    defaultNode: { width: 80, height: 20, unit: 'mm', model: { ...TEXT_DEFAULTS } },
    interaction: { rotatable: true, resizable: true, supportsAnimation: true, supportsUnionDrop: true },
    binding: {
      kind: 'ports',
      ports: [{
        id: 'value', key: { kind: 'exact', value: 'value' }, role: 'display', valueShape: 'scalar',
        modelPath: '/model/content', formatEditor: { tabs: ['preset'] },
      }],
    },
    condition: TEXT_CONDITION,
    layout: { intrinsicSize: 'height', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
    structure: { slots: [] },
    properties: textDesignerPropSchemas.map(descriptor => descriptor.key === 'fontFamily'
      ? { ...descriptor, accessor: createModelPropertyAccessor('/fontFamily') }
      : descriptor),
  },
  schemaAdapter: textSchemaAdapter,
  facets: {
    designer: context => ({
      extension: createTextExtension(context.services as MaterialExtensionContext),
      catalog: { group: 'basic', order: 10 },
      localeMessages: textLocaleMessages,
    }),
    viewer: () => ({ extension: { render: renderText }, capabilities: {} }),
    ai: {
      generation: {
        enabled: true,
        modelSchema: {
          type: 'object',
          required: ['content'],
          properties: { content: { type: 'string' } },
          additionalProperties: true,
        },
        bindingShape: {
          type: 'object',
          properties: { value: { type: 'object' } },
          additionalProperties: false,
        },
        requiredModelPaths: ['/content'],
        examples: [{ ...TEXT_DEFAULTS, content: 'Example' }],
      },
      descriptor: textAIMaterialDescriptor,
    },
  },
})
```

`MaterialDesignerFacet` is a core framework-neutral object containing `extension`, catalog metadata, and locale messages; it contains no Vue component. Designer resolves `common.iconKey` through a host icon resolver. Keep `textDesignerPropSchemas` exported during this task only if other package tests import it; the manifest common facet is the runtime source.

- [ ] **Step 4: Define every builtin manifest with explicit semantics**

Create the remaining package-local files with these locked declarations:

| Manifest types | Category | Binding | Layout distinctions |
| --- | --- | --- | --- |
| `image`, `barcode`, `qrcode`, `progress`, `rating`, `ring-progress` | `basic` | existing ordinary definition moved from builtin | no fragmentation; ring-progress keeps aspect ratio |
| `line`, `rect`, `ellipse`, `signature`, `svg-star`, `svg-heart` | `basic` or `svg` | `none` | no intrinsic measure; no page repeat |
| `svg-custom` | `svg` | display scalar with preset formatting only | Viewer requires sanitized markup |
| `flow-row` | `data` | custom, introspected column bindings | intrinsic height, no global fragment implementation in this project |
| `table-static`, `table-data` | `data` | custom, introspected cell binding ports | static table declares `none`; data table declares `break-opportunities`; current model remains V1 |
| `chart-bar`, `chart-line`, `chart-pie`, `chart-radar`, `chart-scatter`, `chart-gauge` | `chart` | existing data-contract definition | sanitized SVG, fixed intrinsic size |
| `chart-custom` | `chart` | semantic chart data plus preset-only display ports | sanitized SVG, fixed intrinsic size |
| `page-number` | `utility` | `none` | `pageRepeat: 'every-output-page'`; this is the only source of page repetition |
| `text` | `basic` | ordinary | intrinsic height |

Every manifest supplies an explicit AI generation opt-in; descriptor presence alone does not enable generation. Each enabled generation block supplies a JSON `modelSchema`, a JSON `bindingShape`, one or more current-model examples, and model-relative `requiredModelPaths`. Each example must normalize and validate through that manifest's adapter. Every default model is the same JSON value used by its factory. Every material model version is 1 in this foundation.

Update every `ai.ts` path enumerated above to describe canonical `model`, `bindings`, and `slots` names. Remove legacy `props`, root `binding`, text `autoWrap`, flow-row `padding`/column `binding`, and table `topology.cells` guidance. Text knowledge names `wrapMode`; flow-row knowledge names `bindingPort` plus canonical port values; table knowledge names direct `/model/bands` and `/bindings` structures. The descriptor itself must pass `assertJsonValue()` and agree with the manifest generation schema/example.

`fragmentation: 'break-opportunities'` means the material can report legal break offsets and fragment ranges to the separate Viewer layout contract; it never transfers scheduling, pagination, or global fragment ownership out of core. This foundation records that semantic declaration but leaves the measure/break/range API to the Viewer layout plan.

- [ ] **Step 5: Implement explicit text, flow-row, and table adapters without global special cases**

```ts
// packages/materials/text/src/schema-adapter.ts
export const textSchemaAdapter: SchemaAdapter = {
  currentModelVersion: 1,
  migrations: [{
    from: 0,
    to: 1,
    migrate(node) {
      const { autoWrap, ...model } = node.model
      const wrapMode = model.wrapMode === 'wrap' || model.wrapMode === 'nowrap' || model.wrapMode === 'anywhere'
        ? model.wrapMode
        : autoWrap === false ? 'nowrap' : 'anywhere'
      return { ...node, modelVersion: 1, model: { ...model, wrapMode } }
    },
  }],
  validateInput: validateTextInputByVersion,
  normalize: node => ({ ...node, model: normalizeTextModelV1(node.model) }),
  validate: validateTextV1Node,
  introspect(node) {
    const fontFamily = typeof node.model.fontFamily === 'string' ? node.model.fontFamily : ''
    return {
      identities: [], structures: [], references: [], bindings: [],
      resources: fontFamily ? [{ path: '/model/fontFamily', value: fontFamily, kind: 'font' }] : [],
    }
  },
}
```

`validateTextInputByVersion()` accepts version 0 with optional boolean `autoWrap` and version 1 with only `wrapMode: 'wrap' | 'nowrap' | 'anywhere'`; other versions or conflicting invalid values return stable node-relative issues. Refactor the current `resolveTextProps()` rules into `normalizeTextModelV1()`: clone `TEXT_DEFAULTS` plus input, retain an already valid `wrapMode`, remove `autoWrap`, and apply the existing finite-number, enum, minimum, and nullable-height normalization exactly once. `validateTextV1Node()` rejects any remaining `/model/autoWrap` key.

```ts
// packages/materials/flow-row/src/schema-adapter.ts
export const flowRowSchemaAdapter: SchemaAdapter = {
  currentModelVersion: 1,
  migrations: [{
    from: 0,
    to: 1,
    migrate(node) {
      const { padding, ...model } = node.model
      const legacyPadding = typeof padding === 'number' && Number.isFinite(padding) ? padding : undefined
      const bindings = { ...node.bindings }
      const columns = Array.isArray(model.columns)
        ? model.columns.map((value, index) => {
            const column = value as Record<string, unknown>
            const { binding, ...layout } = column
            const id = typeof column.id === 'string' && column.id ? column.id : `legacy-${index}`
            const bindingPort = typeof column.bindingPort === 'string' && column.bindingPort
              ? column.bindingPort
              : binding ? `flow-port:legacy-${index}` : undefined
            if (bindingPort && binding)
              bindings[bindingPort] = cloneMaterialBinding(binding)
            return { ...layout, id, ...(bindingPort ? { bindingPort } : {}) }
          })
        : model.columns
      return {
        ...node,
        modelVersion: 1,
        bindings,
        model: {
          ...model,
          columns,
          paddingX: typeof model.paddingX === 'number' ? model.paddingX : legacyPadding ?? FLOW_ROW_DEFAULTS.paddingX,
          paddingY: typeof model.paddingY === 'number' ? model.paddingY : legacyPadding ?? FLOW_ROW_DEFAULTS.paddingY,
        },
      }
    },
  }],
  validateInput: validateFlowRowInputByVersion,
  normalize: node => ({ ...node, model: normalizeFlowRowModelV1(node.model) }),
  validate: validateFlowRowV1Node,
  introspect(node) {
    const model = node.model as unknown as FlowRowProps
    const boundColumns = model.columns.flatMap((column, index) => {
      const port = column.bindingPort
      const binding = port ? node.bindings[port] : undefined
      return port && binding ? [{ column, index, port, binding }] : []
    })
    return {
      identities: [
        ...model.columns.map((column, index) => ({
          path: `/model/columns/${index}/id`, location: 'value', value: column.id,
          target: { scope: 'material', kind: 'flow-row.column' },
        })),
        ...boundColumns.map(({ port }) => ({
          path: `/bindings/${escapePointer(port)}`,
          location: 'key', value: port,
          target: { scope: 'material', kind: 'flow-row.binding-port' },
        })),
      ],
      structures: [],
      references: boundColumns.map(({ index, port }) => ({
        path: `/model/columns/${index}/bindingPort`, location: 'value', value: port,
        target: { scope: 'material', kind: 'flow-row.binding-port' }, required: true,
      })),
      resources: model.typography.fontFamily
        ? [{ path: '/model/typography/fontFamily', value: model.typography.fontFamily, kind: 'font' }]
        : [],
      bindings: boundColumns.map(({ binding, port }) => ({
        path: `/bindings/${escapePointer(port)}`,
        value: binding,
        port,
      })),
    }
  },
}
```

`validateFlowRowInputByVersion()` accepts version 0 with optional finite `padding` and optional column `binding`, and version 1 with finite `paddingX/paddingY`, stable unique column IDs, and optional string `bindingPort`. `normalizeFlowRowModelV1()` applies the existing column, typography, gap, padding, and background defaults, preserves each column's `id/bindingPort`, and never retains `padding` or `binding`. `validateFlowRowV1Node()` rejects `/model/padding` and every `/model/columns/<index>/binding`, requires each referenced `/bindings/<escaped-port>` to exist, and rejects orphan custom `flow-port:*` ports. Viewer resolves a column with `column.bindingPort ? node.bindings[column.bindingPort] : undefined`; the custom property accessor writes that same location. Add migration tests asserting `autoWrap: false -> wrapMode: 'nowrap'`, `autoWrap: true -> wrapMode: 'anywhere'`, `padding: 3 -> paddingX: 3, paddingY: 3`, explicit axis values win over legacy padding, a legacy column binding moves to `bindings['flow-port:legacy-0']` with only its port string left in the model, clone/rekey changes both that binding key and its model reference once, all legacy keys are deleted, and a second load is byte-equivalent.

`packages/materials/flow-row/src/manifest.ts` imports and uses `flowRowSchemaAdapter`; neither text nor flow-row may fall back to `recordSchemaAdapter(1)`. The two adapter tests import their package-local adapter modules directly; migration helpers remain private.

```ts
// packages/materials/table/kernel/src/schema-adapter.ts (cross-plan adapter excerpt)
export const tableSchemaAdapter: SchemaAdapter = {
  currentModelVersion: 1,
  migrations: [{
    from: 0,
    to: 1,
    migrate(node) {
      const legacyTable = readLegacyTableV0(node.model.table)
      const converted = convertLegacyTableV0ToV1(node, legacyTable)
      return {
        ...node,
        modelVersion: 1,
        model: converted.model,
        slots: converted.slots,
        bindings: converted.bindings,
        compat: converted.compat,
      }
    },
  }],
  validateInput: validateTableInputByVersion,
  normalize: normalizeTableV1Node,
  validate: validateTableV1Node,
  introspect: introspectTableV1Node,
}
```

`readLegacyTableV0()` is callable only for `modelVersion: 0` and is the sole reader of temporary `model.table`. `convertLegacyTableV0ToV1()` returns a direct `TableModel` whose first validation anchor is `/model/bands`; it moves hosted cell nodes to `slots['cell:<cellId>']`, moves bindings to canonical ports, and preserves the raw v0 record only under the declared compat passthrough. `validateTableV1Node()` rejects `/model/table`. `introspectTableV1Node()` declares direct `/model/columns`, `/model/bands`, `/model/merges`, and cell/band/row identities, keyed references, `cell:<id>` slot-key references with prefix encoding, nested node/font/asset/binding resources, and actual structure slots. Neither adapter imports schema-tools, Designer, Viewer, data, DOM, or locale.

Both `packages/materials/table/static/src/manifest.ts` and `packages/materials/table/data/src/manifest.ts` import this one `tableSchemaAdapter`; neither defines a local adapter or another v1 representation.

- [ ] **Step 6: Convert simple Viewer material output to semantic trees**

```ts
// packages/materials/image/src/viewer.ts
export function renderImage(node: MaterialNode, context: ViewerRenderContext): ViewerRenderOutput {
  const model = getNodeModel<ImageProps>(node)
  const frameStyle = {
    width: '100%', height: '100%', 'box-sizing': 'border-box',
    'background-color': model.backgroundColor || 'transparent',
    border: model.borderWidth ? `${model.borderWidth}${context.unit} ${model.borderType} ${model.borderColor}` : 'none',
  }
  return {
    tree: viewerElement('div', { style: frameStyle }, model.src
      ? [viewerElement('img', { attributes: { src: model.src, alt: model.alt }, style: { width: '100%', height: '100%', display: 'block', 'object-fit': model.fit } })]
      : [viewerText('[Image]')]),
  }
}
```

Text, progress, rating, line, rect, ellipse, ring progress, page number, and decorative SVG materials build text/HTML/SVG namespace nodes directly. Dynamic values always go through `viewerText` or attributes; no renderer concatenates them into markup.

- [ ] **Step 7: Convert generated SVG through the sanitizer capability**

```ts
// chart viewer pattern
const svgSource = renderEChartsSvg(option, widthPx, heightPx)
const sanitized = context.capabilities.sanitizeMarkup({ format: 'svg', source: svgSource })
return {
  tree: viewerElement('div', { style: { width: '100%', height: '100%', overflow: 'hidden' } }, [
    viewerSanitizedMarkup(sanitized),
  ]),
}
```

Barcode, QR code, chart, signature, and custom SVG use `viewerSanitizedMarkup()` only after the browser capability mints a token. Their Viewer facets declare `capabilities.sanitizedMarkup: true`. No material imports `@easyink/browser-dom`; the capability arrives through `ViewerRenderContext`.

- [ ] **Step 8: Emit semantic table trees**

Change the current table kernel Viewer renderer to produce `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, and `td` nodes with `scope`, stable `id`, `headers`, `rowspan`, and `colspan` attributes. Cell strings use `viewerText`; hosted children use their independently rendered slot output. Keep current row generation and pagination behavior unchanged; the later table project replaces its private layout plan.

- [ ] **Step 9: Assemble builtin packages atomically**

```ts
// packages/builtin/src/index.ts
export const builtinBasicMaterialPackage: MaterialPackageRegistration = Object.freeze({
  packageId: '@easyink/builtin-basic', kind: 'builtin', required: true,
  manifests: Object.freeze([textMaterialManifest, imageMaterialManifest, barcodeMaterialManifest, qrcodeMaterialManifest, lineMaterialManifest, rectMaterialManifest, ellipseMaterialManifest, tableStaticMaterialManifest, tableDataMaterialManifest, flowRowMaterialManifest, ringProgressMaterialManifest, progressMaterialManifest, ratingMaterialManifest, svgCustomMaterialManifest, svgStarMaterialManifest, svgHeartMaterialManifest, pageNumberMaterialManifest]),
})

export const builtinAllMaterialPackage: MaterialPackageRegistration = Object.freeze({
  packageId: '@easyink/builtin-all', kind: 'builtin', required: true,
  manifests: Object.freeze([...builtinBasicMaterialPackage.manifests, signatureMaterialManifest, chartBarMaterialManifest, chartLineMaterialManifest, chartPieMaterialManifest, chartRadarMaterialManifest, chartScatterMaterialManifest, chartGaugeMaterialManifest, chartCustomMaterialManifest]),
})

export const builtinNoneMaterialPackage: MaterialPackageRegistration = Object.freeze({
  packageId: '@easyink/builtin-none', kind: 'builtin', required: true, manifests: Object.freeze([]),
})

export function getBuiltinMaterialPackage(set: 'basic' | 'all' | 'none'): MaterialPackageRegistration {
  return set === 'all' ? builtinAllMaterialPackage : set === 'basic' ? builtinBasicMaterialPackage : builtinNoneMaterialPackage
}

export function compileBuiltinMaterialProfile(set: 'basic' | 'all' | 'none', engineVersion = EASYINK_ENGINE_VERSION): CompiledMaterialProfile {
  return compileMaterialProfile({ id: `builtin:${set}`, engineVersion, packages: [getBuiltinMaterialPackage(set)] })
}
```

Export builtin `iconKey -> Component` and catalog-group label maps separately for Designer host services; they are UI implementations, not manifest semantics. Delete the old Designer/Viewer bundle arrays and registrar callbacks.

- [ ] **Step 10: Run material render and builtin assembly tests**

Run: `pnpm exec vitest run packages/builtin/src/index.test.ts packages/materials/text/src/schema-adapter.test.ts packages/materials/flow-row/src/schema-adapter.test.ts packages/materials/text/src/viewer.test.ts packages/materials/image/src/viewer.test.ts packages/materials/table/static/src/viewer.test.ts packages/materials/table/data/src/viewer.test.ts packages/materials/chart/bar/src/viewer.test.ts packages/materials/svg/custom/src/sanitize.test.ts`

Expected: PASS; all output is semantic or capability-sanitized, and every builtin set compiles from one manifest source.

Run: `rg -n "trustedViewerHtml|readTrustedViewerHtml|\.innerHTML\s*=|html:\s*" packages/materials --glob "viewer.ts"`

Expected: no output.

- [ ] **Step 11: Build and commit unified manifests**

Run: `pnpm --filter @easyink/builtin build`

Expected: PASS with package-local manifests exported and no dependency on deleted surface bundle files.

```bash
git add packages/materials packages/builtin
git commit -m "feat(materials): unify builtin manifests and viewer trees"
```

## Task 11: Registry-First Designer And Property Editor Registry

**Files:**
- Modify: `packages/designer/src/runtime-config.ts`
- Modify: `packages/designer/src/types.ts`
- Modify: `packages/designer/src/store/designer-store.ts`
- Modify: `packages/designer/src/store/designer-store.test.ts`
- Delete: `packages/designer/src/store/material-registry.ts`
- Delete: `packages/designer/src/materials/registry.ts`
- Create: `packages/designer/src/properties/property-editor-registry.ts`
- Create: `packages/designer/src/properties/property-editor-registry.test.ts`
- Modify: `packages/designer/src/components/EasyInkDesigner.vue`
- Modify: `packages/designer/src/components/MaterialPanel.vue`
- Modify: `packages/designer/src/components/CanvasElementContent.vue`
- Modify: `packages/designer/src/components/PropertiesPanel.vue`
- Modify: `packages/designer/src/components/PropSchemaEditor.vue`
- Modify: `packages/designer/src/components/prop-schema-editor.test.ts`
- Modify: `packages/designer/src/index.ts`
- Modify: `packages/designer/package.json`

- [ ] **Step 1: Write failing registry-first Designer tests**

```ts
// packages/designer/src/store/designer-store.test.ts
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'

it('loads schema with the compiled profile during construction', () => {
  const phases: string[] = []
  const manifest = createTestMaterialManifest({ type: 'box', schemaAdapter: tracingAdapter(phases) })
  const profile = createTestCompiledMaterialProfile([manifest])
  const store = new DesignerStore({
    profile,
    schema: schemaInputWith({ id: 'b1', type: 'box', props: { value: 1 } }),
  })
  expect(phases).toEqual(['validate-input', 'migrate', 'normalize', 'validate', 'introspect'])
  expect(store.schema.elements[0]).toMatchObject({ modelVersion: 1, model: { value: 1 }, slots: {}, bindings: {} })
  expect(store.materialProfile).toBe(profile)
})

it('cannot mutate the active material set after construction', () => {
  const store = new DesignerStore({ profile: createTestCompiledMaterialProfile(), schema: undefined })
  expect('registerMaterial' in store).toBe(false)
  expect(() => (store.materialProfile.materialTypes as string[]).push('other')).toThrow()
})
```

- [ ] **Step 2: Run the store test and verify it fails**

Run: `pnpm exec vitest run packages/designer/src/store/designer-store.test.ts`

Expected: FAIL because the store still normalizes schema before registering mutable bundles.

- [ ] **Step 3: Replace bundle config with pre-bootstrap profile/package config**

```ts
// packages/designer/src/runtime-config.ts
export interface DesignerMaterialConfig {
  profile?: CompiledMaterialProfile
  packages?: readonly MaterialPackageRegistration[]
  engineVersion?: string
  icons?: Readonly<Record<string, Component>>
}

export function resolveDesignerMaterialProfile(config: DesignerMaterialConfig | undefined): CompiledMaterialProfile {
  if (config?.profile && config.packages)
    throw new Error('DESIGNER_MATERIAL_PROFILE_CONFIG_CONFLICT')
  if (config?.profile)
    return config.profile
  return compileMaterialProfile({
    id: 'designer',
    engineVersion: config?.engineVersion ?? EASYINK_ENGINE_VERSION,
    packages: config?.packages ?? [],
  })
}
```

`runtimeConfig.materials.packages` is the only dynamic input and is compiled synchronously. Remove `bundles`. `setupStore` remains for non-material host setup and cannot add a material.

- [ ] **Step 4: Compile the profile before store construction**

```ts
// packages/designer/src/components/EasyInkDesigner.vue
const materialProfile = resolveDesignerMaterialProfile(props.runtimeConfig?.materials)
const store = reactive(new DesignerStore({
  profile: materialProfile,
  schema: props.schema,
  preferenceProvider: props.preferenceProvider,
  interactionProvider: props.interactionProvider,
  runtimeConfig: props.runtimeConfig,
})) as DesignerStore
```

Delete `registerRuntimeMaterialBundles()` and every call to `registerMaterialBundle()`. Profile replacement requires remounting Designer with a new immutable profile; a live store never swaps profiles.

- [ ] **Step 5: Make schema and sidecar replacement atomic in DesignerStore**

```ts
export interface DesignerStoreOptions {
  profile: CompiledMaterialProfile
  schema?: DocumentSchemaInput
  preferenceProvider?: PreferenceProvider
  interactionProvider?: DesignerInteractionProvider
  runtimeConfig?: DesignerRuntimeConfig
}

export class DesignerStore {
  readonly materialProfile: CompiledMaterialProfile
  private _materialLoadDiagnostics: readonly MaterialLoadDiagnostic[] = []
  private _materialNodeStates: ReadonlyMap<string, MaterialNodeLoadState> = emptyReadonlyMap()

  constructor(options: DesignerStoreOptions) {
    this.materialProfile = options.profile
    const loaded = loadDocumentWithProfile(options.schema, this.materialProfile)
    this._schema = loaded.schema
    this._materialLoadDiagnostics = loaded.diagnostics
    this._materialNodeStates = loaded.nodeStates
    // initialize existing non-material services with options
  }

  get materialLoadDiagnostics() { return this._materialLoadDiagnostics }
  get materialNodeStates() { return this._materialNodeStates }
  getMaterialNodeState(nodeId: string) { return this._materialNodeStates.get(nodeId) }

  setSchema(input?: DocumentSchemaInput): void {
    const loaded = loadDocumentWithProfile(input, this.materialProfile)
    this._schema = loaded.schema
    this._materialLoadDiagnostics = loaded.diagnostics
    this._materialNodeStates = loaded.nodeStates
  }

  publishSchemaCandidate(candidate: DocumentSchema, affectedNodeIds: ReadonlySet<string>): MaterialDocumentValidationReport {
    const report = validateDocumentWithProfile(candidate, this.materialProfile, {
      mode: 'edit',
      baselineNodeStates: this._materialNodeStates,
      affectedNodeIds,
    })
    if (!report.valid)
      return report
    this._schema = candidate
    this._materialLoadDiagnostics = report.diagnostics
    this._materialNodeStates = report.nodeStates
    return report
  }

  restoreSchemaFromHistory(candidate: DocumentSchema, targetNodeStates: ReadonlyMap<string, MaterialNodeLoadState>): MaterialDocumentValidationReport {
    const report = validateDocumentWithProfile(candidate, this.materialProfile, {
      mode: 'history-restore', targetNodeStates,
    })
    if (!report.valid)
      return report
    this._schema = candidate
    this._materialLoadDiagnostics = report.diagnostics
    this._materialNodeStates = report.nodeStates
    return report
  }
}
```

Map current top-level diagnostics plus each live `MaterialNodeLoadState.diagnostics` into the existing DebugPanel diagnostics channel with stable `(code, path, nodeId)` deduplication, but keep the immutable material sidecar authoritative. Saving serializes only `store.schema`.

`publishSchemaCandidate()` and `restoreSchemaFromHistory()` are the exact store boundary consumed by the separate document-transaction project excluded from this plan. That project must compute `affectedNodeIds` from before/candidate canonical graphs, never assign a touched-only map, and capture immutable before/after schema snapshots plus complete before/after `nodeStates` in each internal history entry. Undo/redo supplies the corresponding target pair, so undo can restore a deleted quarantined node without treating it as a new edit. A failed publication leaves schema, sidecar, command cursor, and redo stack unchanged. `setSchema()` remains a fresh admission boundary and clears history; this foundation does not redesign existing in-place command execution.

Extend `packages/designer/src/store/designer-store.test.ts` with the core baseline scenario: load one unknown node and one `box`, publish a `box` model change, assert success plus both returned states, reject an attempted unknown-node move with `MATERIAL_NODE_READ_ONLY`, allow deleting it, then restore the captured before schema/state through history mode. Assert save output never contains node states or diagnostics.

- [ ] **Step 6: Replace mutable registries with profile/facet-host lookups**

Construct one `MaterialFacetHost` in `DesignerStore` with activation services containing `createMaterialExtensionContext(store)`, the property editor registry, locale registration, and icon resolution. Export:

```ts
activateDesignerFacet(type: string): Promise<FacetInstance<MaterialDesignerFacet>>
peekDesignerFacet(type: string): FacetInstance<MaterialDesignerFacet> | undefined
getMaterialManifest(type: string): MaterialManifest | undefined
listEditableMaterialManifests(): MaterialManifest[]
```

`listEditableMaterialManifests()` iterates `profile.editableTypes`; Viewer-only materials never appear in the palette. `MaterialPanel` uses `manifest.common.nameKey/category/iconKey` and calls `profile.createNode(type, undefined, schema.unit)` on drop. `CanvasElementContent` awaits `activateDesignerFacet()`, mounts only an active extension, shows a deterministic loading state while pending, and shows a diagnostic sentinel for quarantined/missing facets. Always dispose the mounted extension cleanup when node/type/component unmounts.

- [ ] **Step 7: Write failing property editor registry tests**

```ts
// packages/designer/src/properties/property-editor-registry.test.ts
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { PropertyEditorRegistry } from './property-editor-registry'

it('registers by stable ID and never overwrites another owner', () => {
  const registry = new PropertyEditorRegistry()
  const first = defineComponent({ name: 'FirstEditor' })
  const second = defineComponent({ name: 'SecondEditor' })
  const unregister = registry.register({ id: 'acme/money', ownerPackageId: '@acme/fields', component: first })
  expect(registry.resolve('acme/money')).toBe(first)
  expect(() => registry.register({ id: 'acme/money', ownerPackageId: '@other/fields', component: second }))
    .toThrowError('PROPERTY_EDITOR_DUPLICATE')
  unregister()
  expect(registry.resolve('acme/money')).toBeUndefined()
})
```

- [ ] **Step 8: Implement `PropertyEditorRegistry`**

```ts
// packages/designer/src/properties/property-editor-registry.ts
export interface PropertyEditorRegistration {
  id: string
  ownerPackageId: string
  component: Component
}

export class PropertyEditorRegistry {
  private readonly entries = new Map<string, PropertyEditorRegistration>()

  register(registration: PropertyEditorRegistration): () => void {
    if (!/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(registration.id))
      throw new Error('PROPERTY_EDITOR_ID_INVALID')
    if (this.entries.has(registration.id))
      throw new Error('PROPERTY_EDITOR_DUPLICATE')
    this.entries.set(registration.id, { ...registration, component: markRaw(registration.component) })
    return () => {
      if (this.entries.get(registration.id)?.component === registration.component)
        this.entries.delete(registration.id)
    }
  }

  resolve(id: string): Component | undefined {
    return this.entries.get(id)?.component
  }
}
```

Builtin scalar editors remain intrinsic `PropSchemaEditor` branches. An explicit `descriptor.editor` resolves through this registry; unknown IDs render a diagnostic editor, not a generic text input. Remove overlay-local `editors` maps so one runtime registry owns editor identity.

- [ ] **Step 9: Route property reads/writes through accessors**

```ts
function readProperty(node: MaterialNode, descriptor: PropertyDescriptor): unknown {
  return resolvePropertyAccessor(descriptor).read(node) ?? descriptor.default
}

function commitProperty(node: MaterialNode, descriptor: PropertyDescriptor, value: unknown): void {
  const accessor = resolvePropertyAccessor(descriptor)
  store.materialTransaction.run(node.id, draft => accessor.write(draft, value), {
    mergeKey: `property:${node.id}:${descriptor.key}`,
    label: `Edit ${descriptor.key}`,
  })
}
```

`materialTransaction` is the existing `createTransactionService()` stored once on DesignerStore; this project does not redesign its semantics. Preview uses a cloned snapshot plus accessor paths, and rollback restores only the declared paths. The document-transaction project later replaces this implementation without changing descriptors.

- [ ] **Step 10: Run Designer tests and typecheck**

Run: `pnpm exec vitest run packages/designer/src/store/designer-store.test.ts packages/designer/src/properties/property-editor-registry.test.ts packages/designer/src/components/prop-schema-editor.test.ts packages/designer/src/interactions/clipboard-actions.test.ts`

Expected: PASS; profile compilation precedes schema admission, mutable registration is absent, editor IDs are stable, and clone/rekey uses the profile.

Run: `pnpm --filter @easyink/designer typecheck`

Expected: PASS.

- [ ] **Step 11: Commit Designer bootstrap**

```bash
git add packages/designer
git commit -m "refactor(designer): bootstrap from compiled material profiles"
```

## Task 12: Registry-First Viewer And Facet-Hosted Rendering

**Files:**
- Create: `packages/viewer/src/material-runtime.ts`
- Create: `packages/viewer/src/material-runtime.test.ts`
- Modify: `packages/viewer/src/runtime.ts`
- Modify: `packages/viewer/src/runtime.audit.test.ts`
- Modify: `packages/viewer/src/types.ts`
- Delete: `packages/viewer/src/material-registry.ts`
- Modify: `packages/viewer/src/binding-projector.ts`
- Modify: `packages/viewer/src/binding-projector.test.ts`
- Modify: `packages/viewer/src/render-surface.ts`
- Modify: `packages/viewer/src/render-surface.test.ts`
- Modify: `packages/viewer/src/index.ts`
- Modify: `packages/viewer/package.json`

- [ ] **Step 1: Write failing Viewer bootstrap and quarantine tests**

```ts
// packages/viewer/src/material-runtime.test.ts
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { ProfileMaterialRuntime } from './material-runtime'

it('activates Viewer facets from the profile and isolates failure', async () => {
  const profile = createTestCompiledMaterialProfile([
    createTestMaterialManifest({ type: 'good', viewer: () => viewerFacet(viewerText('good')) }),
    createTestMaterialManifest({ type: 'bad', viewer: async () => { throw new Error('broken viewer') } }),
  ])
  const runtime = new ProfileMaterialRuntime(profile)
  await runtime.prepare(['good', 'bad'])
  expect(runtime.get('good')?.state).toBe('active')
  expect(runtime.get('bad')?.state).toBe('quarantined')
  expect(runtime.render(node('bad'), renderContext()).tree).toMatchObject({ kind: 'element', attributes: { role: 'alert' } })
})
```

- [ ] **Step 2: Run the material runtime test and verify it fails**

Run: `pnpm exec vitest run packages/viewer/src/material-runtime.test.ts`

Expected: FAIL because Viewer still owns a mutable renderer map.

- [ ] **Step 3: Require the profile and browser capability policy in Viewer options**

```ts
// packages/viewer/src/types.ts
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
}

export interface ViewerOpenInput {
  schema: DocumentSchemaInput
  data?: Record<string, unknown>
  onDiagnostic?: (event: ViewerDiagnosticEvent) => void
}
```

Validate `browserDom.maxNodes` in `1..VIEWER_TREE_ABSOLUTE_MAX_NODES` and default it to 50,000. Viewer creates one `BrowserDomCapabilities` from the actual host document; it never accepts caller-minted sanitized tokens.

- [ ] **Step 4: Implement `ProfileMaterialRuntime` on the public facet host**

```ts
// packages/viewer/src/material-runtime.ts
export class ProfileMaterialRuntime {
  private readonly facets: MaterialFacetHost

  constructor(
    readonly profile: CompiledMaterialProfile,
    getServices: () => ViewerRenderCapabilities | undefined = () => undefined,
  ) {
    this.facets = new MaterialFacetHost({ getActivationServices: () => getServices() })
  }

  async prepare(types: Iterable<string>): Promise<void> {
    await Promise.all([...new Set(types)].map(type => this.facets.activate<MaterialViewerFacet>(this.profile, type, 'viewer')))
  }

  get(type: string): FacetInstance<MaterialViewerFacet> | undefined {
    return this.facets.peek(this.profile, type, 'viewer')
  }

  render(node: MaterialNode, context: ViewerRenderContext): ViewerRenderOutput {
    const instance = this.get(node.type)
    return instance?.state === 'active' && instance.value
      ? instance.value.extension.render(node, context)
      : renderMaterialSentinel(node, instance?.diagnostic)
  }

  dispose() { return this.facets.dispose() }
}
```

Read binding, condition, layout, and repetition from `profile.getManifest(type)?.common`; do not cache duplicate semantic maps. Material measurement, layout plans, and fragment pagination are added by the separate Viewer layout runtime project, not by this foundation extension.

- [ ] **Step 5: Load schema before any runtime pipeline stage and prepare facets before use**

```ts
// packages/viewer/src/runtime.ts open()
const loaded = loadDocumentWithProfile(input.schema, this._profile)
this._schema = loaded.schema
this._materialLoadDiagnostics = loaded.diagnostics
this._materialNodeStates = loaded.nodeStates
await this._materials.prepare(collectMaterialTypes(this._schema))
```

This replaces `normalizeDocumentSchema()` and mutable `registerMaterial()`. Emit load/profile/facet diagnostics before binding/measure/render. A node quarantined by admission or Viewer activation uses the safe sentinel and does not enter its material extension.

- [ ] **Step 6: Read bindings and page repetition from the shared contracts**

Update root binding projection to iterate `node.bindings` and `manifest.common.binding`. Update nested discovery callers to use `inspectMaterialNode()`. Replace `_pageAwareTypes` and Viewer extension `pageAware` with `manifest.common.layout.pageRepeat === 'every-output-page'`. Pass `profile` to `collectFontFamilies()`.

- [ ] **Step 7: Mount every output through the single browser DOM function**

```ts
// packages/viewer/src/render-surface.ts
const output = materials.render(node, context)
const mount = renderViewerTree(contentElement, output.tree, {
  document: options.document,
  policy: options.browserDom.policy,
  capabilities: options.browserDom.capabilities,
  maxNodes: options.browserDom.maxNodes,
})
pageDisposers.push(mount.dispose)
```

Dispose prior page mounts before rerender, then in reverse order on runtime destroy. Remove templates, `innerHTML`, trusted HTML readers, and direct material `HTMLElement` insertion. Intersect a facet's declared `imperativeDom` names with host-enabled names before mounting; undeclared or host-disabled capabilities fail closed.

- [ ] **Step 8: Run Viewer tests**

Run: `pnpm exec vitest run packages/viewer/src/material-runtime.test.ts packages/viewer/src/binding-projector.test.ts packages/viewer/src/render-surface.test.ts packages/viewer/src/runtime.audit.test.ts packages/viewer/src/runtime.print.test.ts`

Expected: PASS; profile admission precedes binding/measure, unsafe output has no alternate DOM path, and one bad facet does not stop other materials.

- [ ] **Step 9: Build and commit Viewer integration**

Run: `pnpm --filter @easyink/viewer build`

Expected: PASS.

```bash
git add packages/viewer
git commit -m "refactor(viewer): render compiled profile facets"
```

## Task 13: Portable Assistant Projection And Generic Schema Tools

**Files:**
- Modify: `packages/core/src/material-manifest.ts`
- Modify: `packages/assistant/capabilities/src/types.ts`
- Modify: `packages/assistant/capabilities/src/schema.test.ts`
- Modify: `packages/assistant/designer-bridge/src/material-manifest.ts`
- Modify: `packages/assistant/designer-bridge/src/material-manifest.test.ts`
- Modify: `packages/assistant/designer-bridge/src/contribution.ts`
- Modify: `packages/assistant/designer-bridge/package.json`
- Modify: `packages/assistant/material-knowledge/src/from-manifest.ts`
- Modify: `packages/assistant/material-knowledge/src/from-manifest.test.ts`
- Modify: `packages/schema-tools/src/datasource-aligner.ts`
- Modify: `packages/schema-tools/src/generation-accuracy.ts`
- Modify: `packages/schema-tools/src/generation-accuracy.test.ts`
- Modify: `packages/assistant/capabilities/src/validation.ts`

- [ ] **Step 1: Enforce completeness of the portable AI generation contract**

```ts
// packages/core/src/material-manifest.ts
function validateMaterialAIFacet(ai: MaterialAIFacet): void {
  assertJsonValue(ai.generation.modelSchema ?? null)
  assertJsonValue(ai.generation.bindingShape ?? null)
  assertJsonValue(ai.generation.examples)
  if (ai.descriptor)
    assertJsonValue(ai.descriptor)
  for (const path of ai.generation.requiredModelPaths ?? [])
    assertModelRelativeJsonPointer(path)

  if (!ai.generation.enabled)
    return
  if (!ai.generation.modelSchema)
    throw new Error('MATERIAL_AI_MODEL_SCHEMA_REQUIRED')
  if (!ai.generation.bindingShape)
    throw new Error('MATERIAL_AI_BINDING_SHAPE_REQUIRED')
  if (ai.generation.examples.length === 0)
    throw new Error('MATERIAL_AI_EXAMPLE_REQUIRED')
  for (const [index, example] of ai.generation.examples.entries()) {
    for (const path of ai.generation.requiredModelPaths ?? []) {
      if (!jsonPointerExists(example, path))
        throw new Error(`MATERIAL_AI_REQUIRED_PATH_MISSING:${index}:${path}`)
    }
  }
}
```

Task 2 already defines the final field names and JSON types. This step makes conditional completeness executable: enabled generation requires `modelSchema`, `bindingShape`, at least one example, and every `requiredModelPaths` pointer to resolve in every example. Disabled AI facets can retain descriptive knowledge but never enter `generatableTypes`. `defineMaterialManifest()` invokes this validator before freezing, and the conformance gate still runs each example through normalization and current-version validation.

- [ ] **Step 2: Write failing profile-based Assistant projection tests**

```ts
// packages/assistant/designer-bridge/src/material-manifest.test.ts
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { createAssistantMaterialManifest } from './material-manifest'

it('projects only the editable-renderable-ai intersection', () => {
  const profile = createTestCompiledMaterialProfile([
    createTestMaterialManifest({ type: 'full', designer: true, viewer: true, ai: true }),
    createTestMaterialManifest({ type: 'viewer-only', viewer: true }),
  ])
  const projected = createAssistantMaterialManifest(profile)
  expect(projected.version).toBe(1)
  expect(projected.profileId).toBe('test')
  expect(projected.materials.map(item => item.type)).toEqual(['full'])
  expect(() => JSON.stringify(projected)).not.toThrow()
})
```

- [ ] **Step 3: Run the projection test and verify it fails**

Run: `pnpm exec vitest run packages/assistant/designer-bridge/src/material-manifest.test.ts`

Expected: FAIL because the bridge still reads `DesignerStore.listMaterials()` and strips functions ad hoc.

- [ ] **Step 4: Define the versioned portable projection**

```ts
// packages/assistant/capabilities/src/types.ts
export interface AssistantMaterialManifest {
  version: 1
  profileId: string
  engineVersion: string
  materials: AssistantMaterialManifestEntry[]
}

export interface AssistantMaterialManifestEntry {
  type: string
  modelVersion: number
  common: {
    nameKey: string
    category: string
    defaultNode: MaterialDefaultNode
    interaction: MaterialCommonFacet['interaction']
    binding: AssistantMaterialBindingDefinition
    layout: MaterialLayoutFacet
    structure: MaterialStructureFacet
    properties: AssistantMaterialProp[]
  }
  generation: MaterialAIFacet['generation']
  descriptor?: JsonObject
}
```

Update Zod schemas with `.strict()` at every object boundary and `version: z.literal(1)`. Property projection omits `accessor`, `visible`, and `disabled` functions but keeps `accessor.paths` as `targetPaths` so the remote generator understands canonical locations.

- [ ] **Step 5: Project from the compiled profile without generic function stripping**

```ts
// packages/assistant/designer-bridge/src/material-manifest.ts
export function createAssistantMaterialManifest(profile: CompiledMaterialProfile): AssistantMaterialManifest {
  return {
    version: 1,
    profileId: profile.id,
    engineVersion: profile.engineVersion,
    materials: [...profile.generatableTypes].map((type) => {
      const manifest = requireMaterialManifest(profile, type)
      return {
        type,
        modelVersion: manifest.modelVersion,
        common: projectCommonFacet(manifest.common),
        generation: cloneJsonValue(manifest.facets.ai!.generation),
        ...(manifest.facets.ai!.descriptor
          ? { descriptor: cloneJsonValue(manifest.facets.ai!.descriptor) }
          : {}),
      }
    }),
  }
}
```

Delete the recursive `toSerializable()` function. Projection is an explicit field allowlist; `cloneJsonValue()` guarantees lossless portability. `createAssistantContribution()` reads `ctx.store.materialProfile`, so newly compiled profiles require remount rather than hidden live registration.

- [ ] **Step 6: Replace table-specific binding discovery in schema tools**

```ts
// packages/schema-tools/src/datasource-aligner.ts
export function collectDocumentBindingSlots(schema: DocumentSchema, profile: CompiledMaterialProfile): MaterialBindingSlot[] {
  const slots: MaterialBindingSlot[] = []
  walkMaterialNodes(schema, profile, (_node, _address, introspection) => slots.push(...introspection.bindings))
  return slots
}
```

Use the collected slot path/value for datasource alignment and writeback. Remove `table-static`, `table-data`, `topology.cells`, and flow-row branches. Remote Assistant validation uses the portable `generation.bindingShape`; final local admission and `validateDocumentWithProfile()` remain authoritative.

- [ ] **Step 7: Validate generated output locally against the active profile**

Change Assistant apply/validation entry points that have a Designer context to run `loadDocumentWithProfile(result.schema, profile)`, followed by `validateDocumentWithProfile()`. Surface diagnostics using their stable code/path. Do not repair an opaque private model by guessing fields; send its declared generation schema and diagnostics back to the repair stage.

- [ ] **Step 8: Run Assistant and schema-tools tests**

Run: `pnpm exec vitest run packages/assistant/designer-bridge/src/material-manifest.test.ts packages/assistant/capabilities/src/schema.test.ts packages/assistant/material-knowledge/src/from-manifest.test.ts packages/schema-tools/src/generation-accuracy.test.ts`

Expected: PASS; projection is versioned/JSON-only, only fully supported materials are generated, and binding discovery contains no table branch.

- [ ] **Step 9: Commit portable AI projection**

```bash
git add packages/assistant packages/schema-tools packages/core/src/material-manifest.ts
git commit -m "refactor(assistant): project generation contracts from profiles"
```

## Task 14: Automated Material Conformance Gate

**Files:**
- Create: `packages/core/src/material-conformance.ts`
- Create: `packages/core/src/material-conformance.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/builtin/src/conformance.test.ts`
- Modify: `packages/builtin/package.json`

- [ ] **Step 1: Write failing conformance-runner self-tests**

```ts
// packages/core/src/material-conformance.test.ts
import { describe, expect, it } from 'vitest'
import { createTestMaterialManifest } from './testing/material-profile'
import { runMaterialConformance } from './material-conformance'

it('reports normalize drift, invalid defaults, and undeclared property writes', async () => {
  let count = 0
  const manifest = createTestMaterialManifest({
    type: 'broken',
    schemaAdapter: {
      currentModelVersion: 1,
      migrations: [{ from: 0, to: 1, migrate: node => ({ ...node, modelVersion: 1 }) }],
      validateInput: () => [],
      normalize: node => ({ ...node, model: { ...node.model, count: count++ } }),
      validate: () => [{ code: 'BROKEN_DEFAULT', severity: 'error', path: '/model', message: 'invalid' }],
      introspect: () => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }),
    },
  })
  const report = await runMaterialConformance(manifest)
  expect(report.valid).toBe(false)
  expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
    'CONFORMANCE_NORMALIZE_NOT_IDEMPOTENT',
    'CONFORMANCE_DEFAULT_INVALID',
  ]))
})
```

- [ ] **Step 2: Run the self-test and verify it fails**

Run: `pnpm exec vitest run packages/core/src/material-conformance.test.ts`

Expected: FAIL because the conformance runner does not exist.

- [ ] **Step 3: Define the reusable report and runtime hooks**

```ts
// packages/core/src/material-conformance.ts
export interface MaterialConformanceIssue {
  code: string
  path: `/${string}` | ''
  message: string
}

export interface MaterialConformanceOptions {
  createRenderCapabilities?: (facet: MaterialViewerFacet) => ViewerRenderCapabilities
  mountViewerTree?: (tree: ViewerRenderTree, facet: MaterialViewerFacet) => { dispose: () => void }
}

export interface MaterialConformanceReport {
  materialType: string
  valid: boolean
  issues: readonly MaterialConformanceIssue[]
}

export async function runMaterialConformance(
  manifest: MaterialManifest,
  options: MaterialConformanceOptions = {},
): Promise<MaterialConformanceReport>

export async function assertMaterialConformance(manifest: MaterialManifest, options: MaterialConformanceOptions = {}): Promise<void> {
  const report = await runMaterialConformance(manifest, options)
  if (!report.valid)
    throw new Error(report.issues.map(issue => `${issue.code} ${issue.path}: ${issue.message}`).join('\n'))
}
```

- [ ] **Step 4: Implement deterministic contract checks**

For each manifest, the runner performs these checks with fixed IDs and units:

1. Manifest/API/engine/type/property/slot-policy validation succeeds.
2. `profile.createNode(type, { id: 'conformance-root' })` yields canonical JSON with required empty maps/output defaults.
3. Default creation, adapter input validation, migration, normalization, current validation, introspection, and canonical serialization complete without loss.
4. Normalization called twice yields byte-equivalent JSON and does not mutate either input.
5. Every migration edge is one step, deterministic, input-preserving outside declared adapter fields, and reaches current version.
6. Every introspection pointer resolves to its declared value; identities/references use valid scopes/kinds/encodings.
7. `cloneMaterialSubgraph()` rekeys node and material identities once, leaves external/resources/bindings intact, and the clone validates.
8. Every property accessor path is safe; writing the current value changes no undeclared path.
9. Common default model, portable default node, required model paths, and every AI example normalize and validate under the same adapter.
10. Surface completeness holds: Viewer required, Designer optional, AI enabled only with both.
11. Viewer facet activation returns `MaterialViewerFacet`; rendering returns a valid tree within the 50,000-node absolute limit.
12. When `mountViewerTree` is supplied, the tree mounts and its disposer succeeds twice. Sanitized markup and imperative DOM therefore pass the real browser capability policy.

Use `cloneJsonValue()` and stable key ordering for comparisons. Catch each check independently so one material produces a complete issue list.

- [ ] **Step 5: Add the builtin gate using the real browser capability**

```ts
// packages/builtin/src/conformance.test.ts
import type { BrowserDomCapabilities } from '@easyink/browser-dom'
import { assertMaterialConformance } from '@easyink/core'
import { createBrowserDomCapabilities, renderViewerTree } from '@easyink/browser-dom'
import { describe, it } from 'vitest'
import { builtinAllMaterialPackage } from './index'

describe('builtin material conformance', () => {
  for (const manifest of builtinAllMaterialPackage.manifests) {
    it(manifest.type, async () => {
      let capabilities: BrowserDomCapabilities | undefined
      await assertMaterialConformance(manifest, {
        createRenderCapabilities: (facet) => {
          capabilities = createBrowserDomCapabilities({
            document,
            imperativeDom: facet.capabilities.imperativeDom ?? [],
          })
          return capabilities
        },
        mountViewerTree: (tree) => {
          if (!capabilities)
            throw new Error('CONFORMANCE_RENDER_CAPABILITIES_MISSING')
          const host = document.createElement('div')
          return renderViewerTree(host, tree, {
            capabilities,
            maxNodes: 50_000,
          })
        },
      })
    })
  }
})
```

`runMaterialConformance()` activates the Viewer facet before calling `createRenderCapabilities(facet)`, then uses that returned capability object for the render context and passes the same facet/tree to `mountViewerTree()`. This keeps the tested imperative capability set equal to the manifest declaration and avoids a second activation.

- [ ] **Step 6: Run the conformance gate**

Run: `pnpm exec vitest run packages/core/src/material-conformance.test.ts packages/builtin/src/conformance.test.ts`

Expected: PASS for the runner self-tests and every builtin manifest; a failure names the material, stable code, and JSON Pointer.

- [ ] **Step 7: Commit conformance enforcement**

```bash
git add packages/core/src/material-conformance.ts packages/core/src/material-conformance.test.ts packages/core/src/index.ts packages/builtin/src/conformance.test.ts packages/builtin/package.json
git commit -m "test(materials): enforce cross-surface conformance"
```

## Task 15: Architecture Documentation And Full Repository Gate

**Files:**
- Modify: `.github/architecture/05-schema-dsl.md`
- Modify: `.github/architecture/06-render-pipeline.md`
- Modify: `.github/architecture/09-plugin-system.md`
- Modify: `.github/architecture/11-element-system.md`
- Modify: `.github/architecture/17-schema-migration.md`
- Modify: `.github/architecture/19-testing.md`
- Modify: `.github/architecture/21-security.md`
- Modify: `.github/architecture/25-ai-assistant.md`
- Modify: `packages/core/README.md`
- Modify: `packages/builtin/README.md`
- Modify: `packages/designer/README.md`
- Modify: `packages/viewer/README.md`

- [ ] **Step 1: Update architecture contracts with executable names**

Run: `rg -n "MaterialDefinition|material-registry|TrustedViewerHtml|node\.props|node\.binding|node\.children|node\.table|new Function" .github/architecture packages/core/README.md packages/builtin/README.md packages/designer/README.md packages/viewer/README.md`

Expected: FAIL before the documentation edit by listing every stale contract that this task removes; fixture-only legacy names must be explicitly identified.

Document the exact public contracts from this plan:

```text
compileMaterialProfile({ id, engineVersion, packages }) -> CompiledMaterialProfile
loadDocumentWithProfile(input, profile) -> { schema, diagnostics, nodeStates }
validateDocumentWithProfile(schema, profile, { mode?: 'edit', baselineNodeStates?, affectedNodeIds? }) -> validation report
validateDocumentWithProfile(schema, profile, { mode: 'history-restore', targetNodeStates }) -> validation report
walkMaterialNodes(schema, profile, visitor)
cloneMaterialGraph(roots, profile, { createIdentity })
MaterialFacetHost.activate/peek/dispose
renderViewerTree(host, tree, { capabilities, maxNodes }) -> ViewerTreeMount
createAssistantMaterialManifest(profile) -> portable version 1 projection
```

Include the phase order, required canonical empty maps, edit/history sidecar quarantine modes, package namespace/atomic rules, surface intersections, identity scopes, binding-port-only private models, direct v1 `TableModel`, `break-opportunities` with core-owned scheduling, property accessor paths, sanitized markup token flow, imperative capability disposal, and conformance gate. Remove the old mutable registration, root props/table traversal, trusted HTML, and Designer-derived AI manifest descriptions.

- [ ] **Step 2: Run forbidden-pattern scans**

Run: `rg -n "registerMaterialBundle|registerMaterial\(|TrustedViewerHtml|trustedViewerHtml|readTrustedViewerHtml|getNodeProps|UpdateMaterialPropsCommand" packages`

Expected: no output.

Run: `rg -n "\b(node|el|element|material)\.(props|binding|children|table|hidden|locked|renderCondition|print|placement|break|repeat|animations)\b" packages --glob "*.ts" --glob "*.vue"`

Expected: no output.

Run: `rg -n "table-(static|data)|topology\.cells" packages/schema packages/schema-tools/src/datasource-aligner.ts packages/core/src/font.ts packages/schema/src/traversal.ts`

Expected: no output.

Run: `rg -n "material-owned" packages .github/architecture --glob "!*.test.ts"`

Expected: no output; manifests use only `none` or `break-opportunities`.

Run: `rg -n "\bprops\.|\bnode\.binding\b|autoWrap|topology\.cells" packages/materials --glob "ai.ts"`

Expected: no output; portable AI knowledge uses canonical model, binding-port, and direct table-band terminology.

- [ ] **Step 3: Run focused and full tests**

Run: `pnpm exec vitest run packages/shared/src/json-value.test.ts packages/schema/src packages/core/src packages/browser-dom/src packages/builtin/src/conformance.test.ts packages/designer/src/store/designer-store.test.ts packages/viewer/src`

Expected: PASS.

Run: `pnpm test`

Expected: PASS for the complete workspace test suite.

- [ ] **Step 4: Run repository quality gates in required order**

Run: `pnpm build`

Expected: PASS.

Run: `pnpm lint`

Expected: PASS with no new warnings or errors.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit documentation and final integration**

```bash
git add .github/architecture packages/core/README.md packages/builtin/README.md packages/designer/README.md packages/viewer/README.md
git commit -m "docs(architecture): publish material platform contracts"
```

## Completion Criteria

- A schema cannot be loaded before a valid `CompiledMaterialProfile` exists.
- Required and optional packages obey namespace, engine/API compatibility, and atomic admission rules.
- Canonical documents contain only the new material envelope and serialize no runtime quarantine state.
- Untouched quarantine sidecars survive healthy edits, quarantine writes are rejected, deletion is allowed, and history restore uses the captured target sidecar.
- Every material input is raw-validated before migration and current-validated after normalization.
- All child nodes, identities, references, resources, and bindings are discoverable without core table branches.
- Binding expressions persist only under `node.bindings`; private models contain port-name references only.
- Multi-root copy/paste rekeys node and private material identities in one mapping pass.
- Designer and Viewer use one profile and one facet lifecycle implementation.
- AI generation contains only editable, renderable, explicitly enabled materials and remains JSON-portable.
- Browser output enters DOM only through `renderViewerTree`; raw markup and imperative mounts require explicit capabilities.
- `break-opportunities` never transfers pagination or fragment scheduling ownership out of core.
- All builtin manifests pass the same automated conformance suite.
- Full build, lint, typecheck, and tests pass.
