# Extensible Material Architecture Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace EasyInk's fragmented material registration, hard-coded complex models, and duplicated layout/editing paths with a versioned material platform that safely supports trusted host-installed materials and complex report tables.

**Architecture:** A registry-first bootstrap compiles one immutable `CompiledMaterialProfile` shared by Schema admission, Designer, Viewer, and Assistant. Canonical documents contain only a generic node envelope; material adapters own private models while core owns slots, bindings, transactions, layout orchestration, pagination, diagnostics, and stable addressing.

**Tech Stack:** TypeScript, Vue 3 Designer, browser DOM/SVG Viewer, Vitest/happy-dom, mutative during migration, pnpm workspaces, Turbo, VitePress architecture documentation.

---

## Source Plans

The detailed plans are executed in dependency phases rather than whole-file order:

1. Execute [Material Platform Foundation](./2026-07-11-material-platform-foundation.md) Tasks 1-8 to establish the canonical envelope, manifest/profile, adapter, introspection, safe render-tree, and facet-host contracts.
2. Execute [Complex Report Table](./2026-07-11-complex-report-table.md) Tasks 1-4 and 19 to establish the direct `TableModel`, topology/merge invariants, strict table adapter, and legacy v0-to-v1 migration required by the builtin cutover.
3. Resume Material Platform Foundation Tasks 9-15 to migrate all builtins, compile registry-first surfaces, and pass platform conformance.
4. Execute [Document Transaction And Editing](./2026-07-11-document-transaction-editing.md) and [Viewer Layout Runtime](./2026-07-11-viewer-layout-runtime.md) in parallel after Phase 3 passes.
5. Resume Complex Report Table Tasks 5-18 and 20-23 after both Phase 4 plans pass, then run this roadmap's cross-profile release gate.

Do not move table Task 20 into Phase 2: foundation Task 10 creates the initial table manifests, while table Task 20 completes those manifests with the later layout, editing, and Viewer facets. This ordering keeps every checkpoint buildable without duplicating ownership.

## Agreed Product Boundary

- Stable extension boundary: trusted npm/pnpm packages installed by the host and registered during initialization.
- Not supported in this release: remote URL packages, runtime hot install/uninstall, untrusted package sandboxing, or template-supplied JavaScript execution.
- Built-ins use the same manifest contract as external packages.
- EasyInk reserves bare material IDs such as `text` and `table-data`; external packages use `namespace/name`.
- A formal document material must have a `SchemaAdapter` and a Viewer facet for the host's required target. A material is creatable in Designer only when its Designer facet is active as well.
- Viewer v1 supports `browser-dom`, including DOM and SVG. Other render targets require separate future facets.
- Complex tables are report/document tables, not spreadsheets. Formula graphs, fill handles, frozen panes, spreadsheet sorting/filtering UI, and cross-table calculation are excluded.
- Viewer receives prepared runtime data from the host. Datasource discovery and field-tree UI remain Designer concerns.
- Runtime collaboration is single-writer with local undo. Transaction envelopes retain stable IDs, actor metadata, and base revisions, but this release does not implement OT or CRDT.

## Canonical Contract Decisions

### Identity And Versions

- `DocumentSchema.version` versions the document envelope.
- `MaterialManifest.apiVersion` and `engineRange` version the runtime contract.
- `MaterialNode.modelVersion` versions only the owning material's model.
- Stable documents and built-in models are long-lived assets with continuous migrations or explicit read-only diagnostics.
- Runtime APIs follow SemVer and guarantee compatibility only within a major.
- Documents persist material ID and model version, not npm patch versions.

### Registry And Bootstrap

- Compile and freeze `CompiledMaterialProfile` before parsing a document into an editable/renderable canonical snapshot.
- Publish the profile atomically; active sessions cannot add, remove, or replace manifests.
- Built-in and host-required package failures abort bootstrap. Host-optional package failures quarantine the entire package.
- Common semantic declarations live once in `MaterialManifest`; Designer, Viewer, and Assistant projections cannot redefine binding, condition, slot, repeat, layout, or pagination semantics.
- The compiled profile exposes explicit `editable`, `renderable`, and `generatable` material sets. A formal document material must be renderable; `editable` is the Designer/Viewer intersection, and `generatable` is the Designer/Viewer/AI-opt-in intersection.
- Viewer-only materials remain admissible for read-only/open-and-render workflows. A Designer-only manifest cannot become a creatable document material.
- `MaterialFacetHost` is the sole runtime lifecycle owner. It activates each `(profile object, material type, surface)` once, quarantines failures at that exact surface, and disposes profile-scoped facet instances when the owning Designer/Viewer runtime closes.

### Generic Node Envelope

The canonical node contains core-owned fields only:

```ts
interface MaterialNode {
  id: string
  type: string
  modelVersion: number
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  alpha?: number
  zIndex?: number
  model: Record<string, JsonValue>
  slots: Record<string, MaterialNode[]>
  bindings: Record<string, BindingExpression>
  editorState?: { name?: string; hidden?: boolean; locked?: boolean }
  output: {
    visibility: 'include' | 'remove' | 'reserve'
    renderCondition?: RenderCondition
    print?: PrintBehavior
    placement?: NodePlacementConfig
    break?: NodeBreakConfig
    repeat?: NodeRepeatConfig
    animations?: AnimationSchema[]
  }
  extensions?: Record<string, JsonValue>
  compat?: Record<string, JsonValue>
}
```

- `model` is the only material-private persisted entry.
- `slots` is the only child-material container; old `children` and table cell `elements` are legacy input fields only.
- `bindings` is the only persisted binding-expression entry; material models may hold stable port references but cannot hide executable binding expressions in `model`.
- Each canonical binding port holds one scalar `BindingExpression`. Legacy positional arrays/`bindIndex` are decoded only at admission and fanned out into manifest-defined stable ports; runtime and property APIs never expose positional binding indices.
- Manifest binding-port policies declare exact/prefix port identity, semantic value shape, and whether display formatting is allowed. Runtime resolution distinguishes `unbound`, `missing`, `invalid`, and `resolved`; collection keys and identity values consume raw JSON, while visible text invokes a separate preset-formatting capability. Legacy custom formatter source is preserved only as compatibility data, never executed.
- Root nodes use document coordinates. Slot policies explicitly choose owner-local or slot-local coordinates; complex cell slots use the padded slot content box as their local origin. Core composes affine transforms and reparenting applies the inverse destination-slot world matrix.
- Slot descriptors declare coordinate space, free/managed geometry ownership, clipping, accepted capabilities/types, cardinality, data-context policy, and reparent policy.
- Managed layout results remain derived and never write geometry back to Schema.
- `editorState.hidden` and `locked` affect authoring only. `output.visibility` and conditional runtime state affect Viewer/print/export.
- Legacy `hidden: true` migrates to `editorState.hidden=true` plus `output.visibility='reserve'` to preserve current effective behavior.
- `slots`, `bindings`, and `output` are always present in an admitted canonical snapshot, normalized to `{}`, `{}`, and `{ visibility: 'include' }` when omitted by input.
- Load diagnostics and quarantine status live in `MaterialDocumentLoadResult.nodeStates`, keyed by node ID. They are never written into `editorState`, `model`, `extensions`, `compat`, or serialized Schema.

### Schema Adapter

Admission order is fixed:

```text
compile profile -> parse document envelope -> migrate document version
-> validate core node envelopes -> validate raw material model
-> migrate model version step by step -> normalize current model once
-> validate canonical model -> enumerate slots/references/resources/bindings
-> validate the complete document graph -> publish immutable snapshot
```

- Migration and normalization are deterministic pure functions independent of DOM, time, randomness, locale, runtime data, and selection.
- Core converts only envelope geometry. A material adapter explicitly declares a unit-independent model or supplies a pure `convertModelUnits` implementation for its opaque model; conformance verifies same-unit identity, JSON safety, no input mutation, and round-trip stability.
- Normalize is idempotent; validate never repairs.
- Diagnostics have stable codes, node IDs, and RFC 6901 JSON Pointer paths.
- Adapter-provided binding/slot renames are declarative mappings applied by core.
- Unknown material IDs and future model versions remain losslessly serializable and read-only.
- An unchanged quarantined node does not block edits to healthy nodes. Its sidecar state is carried forward, mutation is rejected as `MATERIAL_NODE_READ_ONLY`, and explicit deletion remains allowed.
- Migration marks the in-memory document `needsSave`; storage is updated only on a normal user save.
- Load, import, paste, and create normalize. Ordinary transactions validate touched nodes without silently normalizing unrelated fields.

### Semantic Introspection And Rekeying

- Adapters enumerate material-private identities, structural child slots, typed references, binding slots, fonts, images, and external assets through typed semantic descriptors.
- Core does not recursively guess meaning from arbitrary JSON keys.
- Clone/paste/import first allocate a complete scoped identity map for node IDs and material-private IDs, then rewrite declared identity/reference values and object keys exactly once.
- A copied subtree cannot retain duplicate child IDs, merge IDs, slot IDs, or dangling internal references.
- `createDefaultNode`, generation seeds, and AI examples must all normalize, validate, round-trip through JSON, and produce equivalent canonical models.

## Runtime And Rendering Decisions

- Designer and Viewer share `MaterialLayoutPlan` as the geometry and measurement fact source; they do not share rendering implementation.
- Designer and Viewer facets may reference the same pure layout adapter. Viewer requests authoritative layout; Designer requests an explicitly provisional authoring preview and never activates Viewer rendering or expands table runtime records.
- Persisted `node.id` identifies a template node, while core-minted `instanceKey` identifies each root or repeated scoped runtime occurrence. Slot geometry and render lookup use `slotInstanceKey`, never a reusable template slot ID.
- A uniform `MeasureService` performs deterministic measurement only after every adapter-declared layout-affecting font/asset reaches a ready-or-failed terminal state. Runtime-data assets not declared as measurement dependencies are paint-only and use manifest fallback geometry.
- `MeasureService` is bound to the exact compiled profile object. Cache keys additionally include node/model revision, data revision, terminal resource revision, units, available dimensions, and pagination constraints.
- Core exclusively chooses global page breaks and owns the monotonic consumed-block cursor. Materials provide ordered break opportunities and create the exact fragment range requested by core; they cannot choose or repeat global pages.
- Material fragment contributions contain only the exact consumed source range, local size, render payload, and diagnostics. Core mints fragment identity and final page coordinates, so an extension cannot spoof page placement or double-apply a source offset.
- No authoritative layout, pagination, or rendering result writes into persisted Schema.
- Viewer default output is a core-rendered, allowlisted `ViewerRenderTree` that distinguishes text from markup.
- Rich text and SVG first pass through a browser capability that produces opaque `SanitizedMarkup`; render trees never accept a raw markup string. Trusted installed packages may declare and the host may explicitly grant `imperative-dom` for chart/canvas mounting, with one idempotent disposer per mount.
- Page DOM disposal releases render mounts only. Shared material facet instances remain owned by `MaterialFacetHost` until the Viewer runtime is destroyed.
- Runtime condition evaluation produces an immutable effective output state: `remove` skips measure/layout/paint, `reserve` participates in measure/layout but skips paint, and `include` does all three. `editorState.hidden` is ignored by Viewer.
- Template model and runtime data never become executable code. Legacy code fields are preserved but not executed and produce a diagnostic.
- Small prepared data may arrive as budgeted JSON. Large repeated collections use a host-owned, schema-external, cancellable collection capability keyed by the binding/source contract; the host supplies declared counts, complete key multiplicity when requested, and ordered chunks, while sorting, filtering, joins, and aggregates remain database/host responsibilities. Every cursor closes exactly once.
- Core supplies a cancellable bounded measurement scheduler. Facets reserve row/fact budgets before queueing work, cap in-flight measurement, stop starting work after the first failure/abort, and merge results in stable source order.
- Viewer iframe isolates output styles; it is not described as a sandbox for trusted installed package code.
- `mm`, `pt`, `px`, and `inch` are canonical units across Schema, codec, Assistant, layout, and tests.

## Editing And Transaction Decisions

- `DocumentTransactionEngine` is the only persisted write path.
- One transaction may change document fields, multiple roots, nested slots, bindings, and material topology atomically.
- Transactions mutate an isolated draft, validate before publication, replace the snapshot once, increment revision, and emit one `DocumentChangeSet`.
- History stores data change sets rather than executable command closures.
- Each committed transaction is one undo item by default. Continuous input coalesces only when operation type, session path, target IDs, property path, selection lineage, and barrier generation match with no intervening structural operation.
- Pointer-driven previews use `PreviewTransaction`; committed Schema remains unchanged until pointerup/commit.
- Preview publication derives affected stable node IDs from private patches and before/after indices, validates patch scope plus lightweight preview invariants, and reuses revision-keyed indices. The final commit alone runs the complete affected-node and graph gate; public change sets still expose no patches.
- `GestureCoordinator` owns raw pointer arbitration, capture, cancellation, cursor, and autoscroll. One pointer sequence has one exclusive owner.
- Deep editing uses `EditingSessionPath`; Escape exits one nested frame at a time.
- Table and material selections use stable IDs. Index coordinates are derived, never authoritative.
- Selection is local UI state, not document history. Transactions may carry local forward/inverse selection hints that are validated and rebased after commit/undo/redo.
- Recursive JSON-value validation replaces stringify/parse checks for selection and event payloads.
- A framework-neutral contextual-property provider may derive stable descriptors/accessors and mixed/read-only state from a frozen node, `EditingSessionPath`, and stable JSON selection. The host's one property editor/preview controller remains the only renderer and writer for cell, row, column, band, chart-series, and future nested contexts.

## Complex Report Table Decisions

- `table-static` and `table-data` remain independent materials sharing `table-kernel`.
- Row, column, cell, merge, and band entities have stable IDs and are modified only through `TableTopologyEngine`.
- Topology planning receives a host identity allocator and returns stable-ID deltas plus removal effects. Transactions apply those deltas at precise draft paths so patches/history scale with affected rows/cells rather than replacing the complete model; band insert/remove/reorder is first-class for multi-row header/footer design.
- Cells use mutually exclusive `text | materials` modes. Text is Unicode plain text with line breaks; HTML and editor deltas are not stored in text.
- Materials-mode cells may contain multiple free-layout slot children, clipped to the padded content box by default.
- Merging is lossless: covered cells retain IDs and payloads in inactive state; split restores them exactly.
- `table-data` has multi-row header/footer bands and one detail repeat template. It has no group/subtotal bands in this release.
- The repeat-template height is a minimum; every runtime record may grow independently after measurement.
- Empty collections produce zero detail rows. Invalid collections diagnose and use the same zero-row layout.
- Header renders once at table start and footer once at table end. Continuation pages do not repeat header.
- Header/footer groups are internally indivisible. For a non-empty collection, no break is exposed between the header and first detail or between the last detail and footer; an over-tall combined boundary emits one atomic overflow diagnostic instead of producing an orphan header/footer.
- Detail rows never split across pages; a row taller than an empty page produces an overflow diagnostic.
- Optional `detailKey` supplies stable runtime row identity. When configured, a datasource cursor provides a complete lightweight key-multiplicity index before exposing the first record chunk; missing/invalid/duplicate/unproven keys diagnose and use data-revision-local index/occurrence identity from first exposure. When `detailKey` is not configured, revision-local index identity is normal and emits no diagnostic.
- Designer edits the repeat template, never a persisted per-record override.
- Designer virtualizes static-table cells by viewport; data-table Designer does not expand runtime records.
- Designer geometry, hit testing, selection, and drop targeting share a revision-keyed spatial index with binary row lookup and explicit crossing-merge intervals; scrolling never scans every cell.
- Viewer reads runtime rows in cancellable bounded chunks but completes authoritative measurement before atomic publication so pagination and total-page output remain deterministic. The 100,000-row setting is an absolute defensive ceiling, not a guaranteed supported size; the effective limit is the minimum of data-node/byte, row, layout-fact, and render budgets.

## Remaining Decisions Resolved By Engineering Judgment

These choices complete branches that are technical consequences of the agreed architecture:

- Canonical table columns support `fixed` and `fr` tracks with optional min/max; content-driven `auto` is excluded because it requires scanning all runtime records before widths stabilize.
- Cell box model precedence is `cell > row > column > band > table`; padding participates in measurement.
- Shared border conflicts resolve once in `MaterialLayoutPlan`; higher specificity wins, then top/left owner wins ties. DOM border-collapse is not normative.
- Text uses `overflow-wrap:anywhere` without implicit ellipsis. Materials are clipped unless an explicit slot overflow policy permits paint overflow; overflow never expands table width implicitly.
- Direction supports `auto | ltr | rtl` with logical start/end alignment. Vertical writing mode is excluded.
- Reparent is one atomic stable-ID operation. Free slots preserve world pose by recomputing local transform; managed slots use insertion semantics. Public placement uses stable sibling anchors (`beforeNodeId`, `afterNodeId`, or `atEnd`), while numeric array indices remain an internal derived detail.
- Multi-selection cannot span different active slots. Table multi-region selection remains supported inside one table.
- Table focus uses roving focus/`aria-activedescendant`. Grid-mode Arrow/Home/End/Page navigation, Shift extension, Ctrl/Cmd+A, Delete/Backspace, copy/paste, Tab/Shift+Tab, Enter/F2, Escape, RTL mapping, and IME precedence are one table-driven state machine; Tab never adds rows implicitly.
- Clipboard writes EasyInk JSON MIME, sanitized `text/html`, and TSV. Only internal JSON preserves bindings/styles/child materials and all child IDs are rekeyed. Pasting does not implicitly add rows or columns.
- Datasource drop uses explicit intents for collection, field, and region mapping; field-path shape is not used to guess intent.
- Structural row/column insert, delete, and reorder are explicit ID-based operations with stable sibling anchors. Text edit, paste, and datasource drop cannot silently change topology.
- Global address ambiguity such as duplicate node IDs rejects document admission. A single invalid material node is preserved and quarantined with the same diagnostic code in Designer and Viewer.
- Viewer tables emit semantic `caption/thead/tbody/tfoot/th/td` markup with header associations. Designer grids expose stable row/column counts and forced-colors-safe selection states.
- Fonts must settle before authoritative Viewer pagination. Designer may show a provisional plan identified by a provisional resource revision.
- Layout plans support cancellable chunked collection providers. DOM-only measurement remains on the main thread; pure chunks may move to a worker without changing contracts.
- Fragment plans retain range-to-row/cell/edge indices so each page selects its own facts in `O(log N + fragment facts)` rather than rescanning the full table per page.
- Default Viewer hard limits are 100,000 runtime rows, 500,000 retained layout facts per material instance, 50,000 render-tree nodes per material, 512 measure-cache entries, and one page of DOM overscan. Core injects reservation tokens so facets fail before allocating beyond row/fact limits; exceeding a hard limit quarantines the affected node for that revision with a structured diagnostic.

## Migration Strategy

- Legacy codecs continue accepting `props`, `binding`, `children`, `table`, and table cell `elements` as input.
- Canonical in-memory and newly serialized documents contain only the new envelope after Plan 1 completes.
- Convert built-ins in dependency order: primitive visual materials, text/image/data materials, charts/SVG/signature, layout containers, then tables.
- Temporary compatibility accessors may exist inside an individual commit to keep the workspace buildable, but every plan's completion gate removes the accessors it introduced.
- Do not persist a feature flag or dual canonical model. Compatibility is an admission/codec concern.
- Unknown legacy fields remain under explicit compat payloads until their owning adapter consumes them.

## Execution Tasks

### Task 1: Complete The Platform And Table-Schema Bootstrap

**Files:** See [Material Platform Foundation](./2026-07-11-material-platform-foundation.md) and the bootstrap tasks in [Complex Report Table](./2026-07-11-complex-report-table.md).

- [ ] **Step 1: Execute foundation Tasks 1-8 using TDD**
- [ ] **Step 2: Execute complex-table bootstrap Tasks 1-4 and 19 using TDD**
- [ ] **Step 3: Resume and execute foundation Tasks 9-15 using TDD**
- [ ] **Step 4: Run `pnpm exec vitest run packages/schema/src packages/schema-tools/src packages/builtin/src packages/assistant --dom`**

Expected: PASS.

- [ ] **Step 5: Run the repository quality gates in the required order**

Run: `pnpm build`

Expected: exit code 0. Stop and fix this gate before continuing.

Run: `pnpm lint`

Expected: exit code 0 with no new lint errors. Stop and fix this gate before continuing.

Run: `pnpm typecheck`

Expected: exit code 0. Do not reorder or parallelize these three gates.

- [ ] **Step 6: Verify no canonical public type exposes `props`, `binding`, `children`, or `table`**

Run: `rg -n "props:|binding\?:|children\?:|table\?:" packages/schema/src/types.ts`

Expected: no matches in canonical `MaterialNode`; legacy input types may match in separately named codec files.

- [ ] **Step 7: Verify the foundation checkpoint is clean**

```bash
git status --short
```

Expected: no output.

### Task 2: Complete Transaction And Editing Core

**Files:** See [Document Transaction And Editing](./2026-07-11-document-transaction-editing.md).

- [ ] **Step 1: Execute every checked task in the transaction/editing plan using TDD**
- [ ] **Step 2: Run `pnpm exec vitest run packages/core/src packages/designer/src/editing packages/designer/src/interactions --dom`**

Expected: PASS.

- [ ] **Step 3: Search for live-Schema preview writes**

Run: `rg -n "Direct mutation for preview|node!\.(x|y|width|height) =|store\.schema\.[A-Za-z0-9_.]+ =" packages/designer/src`

Expected: no preview or gesture path writes committed Schema directly.

- [ ] **Step 4: Run `pnpm -F @easyink/designer typecheck`**

Expected: exit code 0.

- [ ] **Step 5: Verify the editing-core checkpoint is clean**

```bash
git status --short
```

Expected: no output.

### Task 3: Complete Viewer Layout Runtime

**Files:** See [Viewer Layout Runtime](./2026-07-11-viewer-layout-runtime.md).

- [ ] **Step 1: Execute every checked task in the Viewer runtime plan using TDD**
- [ ] **Step 2: Run `pnpm exec vitest run packages/core/src packages/viewer/src --dom`**

Expected: PASS.

- [ ] **Step 3: Verify raw HTML and material-owned global pagination are gone**

Run: `rg -n "TrustedViewerHtml|innerHTML|FragmentPaginator" packages/core/src packages/viewer/src`

Expected: no public material-rendering or pagination contract matches; test fixtures may use `innerHTML` only when verifying rejection.

- [ ] **Step 4: Build core, then Viewer**

Run: `pnpm -F @easyink/core build`

Expected: exit code 0 before continuing.

Run: `pnpm -F @easyink/viewer build`

Expected: exit code 0.

- [ ] **Step 5: Verify the Viewer runtime checkpoint is clean**

```bash
git status --short
```

Expected: no output.

### Task 4: Complete Complex Report Table

**Files:** See [Complex Report Table](./2026-07-11-complex-report-table.md).

- [ ] **Step 1: Execute table Tasks 5-18 and 20-23 using TDD; Tasks 1-4 and 19 already passed in the foundation bootstrap phase**
- [ ] **Step 2: Run `pnpm exec vitest run packages/materials/table packages/viewer/src packages/designer/src --dom`**

Expected: PASS.

- [ ] **Step 3: Run table invariant fuzz tests with a fixed replay seed**

Run: `pnpm exec vitest run packages/materials/table/kernel/src/topology-engine.fuzz.test.ts --dom`

Expected: PASS; the test hard-codes replay seed `20260711`, and failure output prints the seed and complete operation sequence.

- [ ] **Step 4: Run the table performance suite**

Run: `pnpm exec vitest run packages/materials/table/kernel/src/table.performance.test.ts --dom`

Expected: PASS within the budgets encoded in the test.

- [ ] **Step 5: Verify the table checkpoint is clean**

```bash
git status --short
```

Expected: no output.

### Task 5: Run Cross-Profile Conformance And Update Architecture

**Files:**
- Modify: `.github/architecture/03-monorepo-structure.md`
- Modify: `.github/architecture/04-layered-architecture.md`
- Modify: `.github/architecture/05-schema-dsl.md`
- Modify: `.github/architecture/06-render-pipeline.md`
- Modify: `.github/architecture/07-layout-engine.md`
- Modify: `.github/architecture/08-datasource.md`
- Modify: `.github/architecture/09-plugin-system.md`
- Modify: `.github/architecture/10-designer-interaction.md`
- Modify: `.github/architecture/11-element-system.md`
- Modify: `.github/architecture/12-command-undo-redo.md`
- Modify: `.github/architecture/13-unit-system.md`
- Modify: `.github/architecture/17-schema-migration.md`
- Modify: `.github/architecture/19-testing.md`
- Modify: `.github/architecture/20-performance.md`
- Modify: `.github/architecture/21-security.md`
- Modify: `.github/architecture/22-editing-behavior.md`
- Modify: `.github/architecture/25-ai-assistant.md`
- Modify: `.github/architecture/26-conditional-rendering.md`

- [ ] **Step 1: Run the manifest/profile conformance suite**

Run: `pnpm exec vitest run packages/builtin/src packages/schema-tools/src packages/assistant packages/materials --dom`

Expected: PASS for default creation, normalize idempotence, model migration, JSON round-trip, clone/rekey, semantic-slot rewrite, Designer/Viewer projection equality, generation examples, pagination progress, and facet disposal.

- [ ] **Step 2: Run the complete workspace test suite**

Run: `pnpm test`

Expected: exit code 0.

- [ ] **Step 3: Rewrite architecture chapters to describe only implemented contracts**

Remove old FSM, external deep-edit drag handles, `PropertyPanelOverlay`, table hard-coding in Schema/core, `children`, `props`, `node.table`, Designer-only vs runtime `hidden` ambiguity, custom template JavaScript execution, material-owned global pagination, and stringify/parse JSON-safety claims. Link every public contract to its owning source file and conformance test.

- [ ] **Step 4: Build documentation, then run the final repository gate**

Run: `pnpm docs:build`

Expected: exit code 0 with no dead internal links from the modified architecture chapters.

Run: `pnpm build`

Expected: exit code 0. Stop and fix this gate before continuing.

Run: `pnpm lint`

Expected: exit code 0 with no new lint errors. Stop and fix this gate before continuing.

Run: `pnpm typecheck`

Expected: exit code 0. The final repository quality gate is strictly sequential: `build` -> `lint` -> `typecheck`; do not reorder or parallelize it.

- [ ] **Step 5: Commit the architecture cutover**

```bash
git add .github/architecture packages docs/superpowers/plans
git commit -m "docs(architecture): adopt extensible material platform"
```

## Final Release Gate

Do not freeze the public manifest ABI or publish a stable major until all conditions hold:

- Every built-in manifest passes the conformance suite.
- Designer, Viewer, and Assistant use one compiled profile and expose consistent material sets.
- Default nodes, AI seeds, and examples all normalize and validate.
- Clone/rekey tests prove no duplicate IDs or dangling references across nested slots.
- Designer/Viewer differential tests agree on `MaterialLayoutPlan` geometry within the documented floating-point tolerance.
- Topology fuzz tests preserve table invariants after every operation and inverse operation.
- Facet cancellation/disposal tests show no stale DOM, listener, timer, worker, or cache writes.
- Security tests reject raw HTML, event attributes, unsafe URLs, and template code execution.
- Accessibility tests cover semantic Viewer tables, Designer grid focus, keyboard navigation, IME, and forced-colors state.
- Performance tests enforce finite row/tree/cache limits and cancellation latency.
- Legacy documents round-trip without data loss, and incompatible nodes remain extractable in read-only quarantine.
