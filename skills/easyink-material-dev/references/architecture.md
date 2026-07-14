# EasyInk Material Architecture

## Core Chain

Material work spans this chain:

```text
Designer material catalog
  -> createDefaultNode(partial?, unit?)
  -> schema.elements[]
  -> MaterialDesignerExtension.renderContent()
  -> compile immutable material profile
  -> document admission
  -> effective output state
  -> facet activation / runtime model resolution
  -> resource readiness
  -> MeasureService
  -> MaterialLayoutPlan
  -> document layout / core pagination
  -> page overlays
  -> ViewerRenderTree / imperative host
  -> browser DOM
  -> print and export reuse committed Viewer pages and metrics
```

If one link is missing, the failure mode is direct: no Designer registration means it cannot be dragged in; a manifest absent from the compiled Viewer profile is quarantined during admission; no stable default node means drag and auto-create paths produce blank or invalid templates.

## State Boundaries

- Schema state lives in `DocumentSchema` and `MaterialNode`: persistent, undoable, imported/exported.
- Workbench state lives in Designer store: panels, zoom, selection, window layout, preferences, and active sessions.
- Runtime state lives in Viewer and editing sessions: resolved models, measurements, layout fragments, output page plans, transient handles, drag gestures, DOM refs, and measured caches.
- Font runtime state lives in `FontManager`: provider catalog cache, in-flight loads, failures, loaded font sources, and injected style elements for a host `Document` or `ShadowRoot`.

Do not move transient runtime details into Schema. Examples to keep out of Schema: active cell selection, pointer gesture state, virtual preview rows, handle positions, measurement caches, output page fragments, repeated overlay clones, DOM refs, active editing metadata, font sources, font load states, and injected `@font-face` CSS.

## Schema Input and Admission

Viewer accepts `DocumentSchemaInput` only through `loadDocumentWithProfile(input, compiledProfile)`. This boundary canonicalizes and admits the document against the immutable compiled profile, then publishes a complete `DocumentSchema` plus node admission states. Viewer, print, and export consume that admitted canonical document; there is no pre-profile normalization path.

Rules:

- Compile the material profile before loading a Viewer document.
- Do not normalize Viewer input separately from profile-aware admission.
- Preserve `DocumentSchema.extensions` and `MaterialNode.extensions` for host/plugin-owned serializable data.
- New material semantics belong in explicit canonical schema fields, the material `model`, or namespaced `extensions`.

## Orthogonal Page System

Legal `PageMode` values are `fixed` and `continuous`.

Current page behavior semantics come from four orthogonal page fields:

- `page.pageModel.kind`: `paged-paper` or `continuous-paper`.
- `page.layout.strategy`: `absolute`, `stack-flow`, or `region-flow`.
- `page.reflow.strategy`: `none`, `measure-only`, or `flow-y`.
- `page.pagination.strategy`: `none`, `fixed-sheets`, or `auto-sheets`.

Default combinations:

- `fixed`: `paged-paper + absolute + measure-only + fixed-sheets`.
- `continuous`: `continuous-paper + stack-flow + flow-y + none`.

Material rules:

- `MaterialNode.x/y/width/height` are document coordinates, not output page or editor-surface coordinates.
- `MaterialViewerLayoutFacet`, document layout, core pagination, and repeated overlays publish runtime plans and fragments without writing results into source Schema.
- Do not add new behavior branches keyed only on `page.mode`; read the owning page strategy field: `page.pageModel`, `page.layout`, `page.reflow`, or `page.pagination`.
- New Viewer layout behavior should publish `MaterialLayoutPlan` facts through `MeasureService`; core owns document layout and pagination.

`page.layers` is separate from those behavior fields. It is a page-level render-layer array for non-element, non-editable, non-bindable page decorations such as text watermarks. It is resolved by `@easyink/core` into layer render plans and consumed by Designer/Viewer. Material code should not use `page.layers` as a material feature hook or custom extension point.

## Node Layout Behavior

Node-level behavior lives in `node.output`, outside the material model:

- `node.output.placement.mode='flow'`: participates in `flow-y` reflow.
- `node.output.placement.mode='fixed'`: keeps original document coordinates and ignores break constraints.
- `node.output.break.keepTogether/before/after`: applies during `auto-sheets` pagination for flow nodes.
- `node.output.repeat.scope='every-output-page'`: copied after pagination to every output page; does not affect page count or continuous-paper height.

Use `repeat.scope` for editable or data-bound headers, footers, page numbers, logos, and repeated watermarks. Use `page.layers` only for whole-page render layers that are not `MaterialNode`s and do not need selection, dragging, binding, or source-node editing.

Write page behavior through `output.placement`, `output.break`, and `output.repeat` with `UpdateMaterialBehaviorCommand`.

Designer exposes these behaviors through `createLayoutBehaviorPropSchemas()`:

- Placement appears when the page supports `stack-flow + flow-y`.
- Break rules appear only for `stack-flow + flow-y + auto-sheets`.
- Repeat appears for all supported pagination strategies.

## Designer Surface

Designer does not render a single page from `page.width/page.height`. It consumes `createEditorSurfacePlan(schema)`:

- `fixed-sheets`: multiple editable page surfaces with visual gaps; `yOffset` remains document-coordinate offset.
- `auto-sheets`: one continuous edit surface with fixed-page reference semantics; Viewer decides final output pages.
- `none` and continuous paper: one growing continuous canvas.

Coordinate projection must use:

- `projectDocumentPointToEditorSurface()`
- `projectEditorSurfacePointToDocument()`

Grid, guides, snapping, element overlays, repeat previews, rulers, and selection UI should all consume the same `EditorSurfacePlan`.

Repeated/page-aware nodes have one interactive source node in Designer. Additional page previews are visual-only; they must not participate in selection, drag, resize, snapping, command history, or schema writes. Designer may pass page preview data through `renderContextSignal`, but that context is display-only runtime state.

## Designer Contract

The Designer material contract is in `packages/core/src/material-extension.ts`.

Implement `MaterialDesignerExtension` with:

- `renderContent(nodeSignal, container, renderContextSignal?)`: mount the design-time content, subscribe to node changes, and optionally subscribe to transient Designer render context such as page-aware preview numbers.
- `datasourceDrop`: optional material-owned drag/drop binding logic.
- `geometry`: optional deep-edit hit testing and selection rectangle mapping.
- `selectionTypes`: optional sub-selection schema and payload validation.
- `behaviors`: optional middleware chain for pointer, key, drop, paste, and command events.
- `decorations`: optional Vue decorations for handles, guides, toolbars, or overlays.
- `resize`: optional material-private side effects during element resize.
- `resolveControlPolicy`: optional design-time policy for hiding/disabling geometry inputs, resize handles, or property fields when a material owns runtime dimensions or controls.

Use `resolveControlPolicy()` when a material has a runtime-owned dimension or state that should not be edited through outer Designer chrome. It should control both visible handles/fields and any behavior path that could perform the same mutation.

## Font Loading Contract

The public font contract is in `packages/core/src/font.ts`, with user-facing Designer guidance in `docs/designer/fonts.md`.

Host apps pass a `FontProvider` into Designer and Viewer:

- `listFonts()` returns display metadata for the FontPicker catalog.
- `loadFont(family, weight?, style?)` returns a URL or `ArrayBuffer` that can be used in `@font-face`; catalog entries with `source: 'system'` use browser/system fonts directly and do not call `loadFont()`.

Designer owns edit-time font loading:

- `EasyInkDesigner` passes `fontProvider` to `DesignerStore`.
- `DesignerStore` creates a `FontManager`, captures the host `Document` or `ShadowRoot` through `setFontTarget()`, and preloads fonts referenced by `schema.page.font` and schema-adapter paths such as `node.model.fontFamily`.
- Font properties use the `font` editor. Preview writes are skipped for font fields, and commits call `store.ensureFontLoaded({ family })` before writing Schema.
- Failed font loads do not commit the new font value. Designer diagnostics receive a `source: 'font'` warning.

Viewer owns output-time font loading:

- `ViewerRuntime` creates its own `FontManager` from `ViewerOptions.fontProvider`.
- Manifest schema-adapter introspection publishes material-owned font and asset references; Viewer combines them with the page font and prepares the bounded set through its resource-readiness coordinator.
- The coordinator publishes a terminal `resourceRevision` before `MeasureService` runs. Font failures emit Viewer diagnostics, increment terminal resource state, and still allow browser fallback rendering.

Material code should only store and render font family names. It should not call `FontProvider`, create `FontManager`, inject `@font-face`, or serialize font sources.

## Viewer Contract

The Viewer contract is in `packages/core/src/material-viewer.ts`.

Implement `MaterialViewerExtension` with:

- `render(node, context)`: return `{ tree: ViewerRenderTree }`.
- `MaterialViewerLayoutFacet.measure(request)`: optional authoritative sizing for content-driven dimensions.
- layout break opportunities and a fragment adapter: optional split contribution for `auto-sheets`; core selects the break.
- manifest `common.layout.pageRepeat`: default repeated overlay behavior for materials such as page numbers.

Viewer runtime stages:

1. Compile the immutable material profile and admit input through `loadDocumentWithProfile()`.
2. Resolve effective output state, activate Viewer facets, and publish frozen runtime models and scopes.
3. Reach terminal font and asset resource revisions.
4. Run `MeasureService`; layout facets publish `MaterialLayoutPlan` facts and optional fragment adapters.
5. Run document layout and core pagination; core selects break opportunities and owns page placement.
6. Add repeated elements as page overlays after pagination.
7. Render committed facts as `ViewerRenderTree` or through a capability-gated imperative host, then mount browser DOM.
8. Cache committed `ViewerPageMetrics` for print/export reader leases.

## Registration

Custom material hosts:

- Designer: pass the bundle through `runtimeConfig.materials.bundles`, or call `registerMaterialBundle(store, bundle)` inside `EasyInkDesigner` `setupStore`.
- Viewer: include the material manifest in the profile input and compile that profile before creating or opening the Viewer. Runtime activation comes only from the immutable compiled profile; there is no mutable Viewer material registry.
- Heavy Designer renderers may use `lazyFactory` on the Designer material entry. Keep material metadata synchronous; only the `MaterialDesignerExtension` factory should live in the lazy chunk.

Built-in materials:

- Export one complete material manifest from the material package, then add that manifest to the appropriate immutable package in `packages/builtin/src/index.ts`.
- Do not add default condition capability registrations. Conditional rendering is a framework default for all materials. Only set `condition: false` to opt out, or set a `hiddenEffects` override to narrow `remove/reserve` support.
- Keep the public `@easyink/builtin` export surface aligned. The root exports `builtinAllMaterialPackage`, `builtinBasicMaterialPackage`, `builtinNoneMaterialPackage`, `getBuiltinMaterialPackage()`, and `compileBuiltinMaterialProfile()`; `@easyink/builtin/all`, `/basic`, and `/none` each expose `builtinMaterialPackage` plus the profile compiler.
- `@easyink/builtin/all` contains every built-in manifest; `@easyink/builtin/basic` contains the reduced set; `@easyink/builtin/none` stays empty. Hosts compile the selected package before constructing Viewer.
- Add the material's AI descriptor to its manifest facet when generation should know it. Assistant consumes the admitted material manifest; do not add material-specific prompt rules.
- Add `@easyink/material-x` dependency to `packages/builtin/package.json`.

## Catalog and Capabilities

`MaterialManifest` defines the cross-surface contract:

- root `type`: stable Schema identity.
- `common.nameKey`, `common.iconKey`, and `common.category`: catalog metadata.
- `common.interaction`: rotation, resizing, aspect ratio, animation, and union-drop capabilities.
- `common.condition`: optional condition capability override. Omit it for the framework default; use `false` to opt out or a definition to narrow hidden effects.
- `common.binding`: either `kind: 'none'` or `kind: 'ports'` with exact, prefix, or model-derived port policies and an optional data contract.
- `common.defaultNode`: immutable default geometry, unit, model, bindings, and output state.
- `common.properties`: the complete material-owned property descriptor list.
- `facets.designer`: Designer extension factory plus catalog order and locale messages.
- `facets.viewer`: Viewer render extension, optional layout facet, and capability gates.
- `facets.ai`: generation declaration and optional descriptor consumed by Assistant.

`catalogs` creates material panel groups. Each group owns a stable `id`, a translatable `label`, optional ordering, and item entries. Register catalog label keys in the same bundle locale messages when the group is custom or when the host may omit the built-in bundle. A built-in material can be fully registered for Designer and Viewer but still be invisible in the material panel if its type is missing from every catalog group; add a regression test when introducing a new built-in material.

## Contribution Boundary

If the request is to add a button, panel, command, diagnostic subscription, or host workflow around existing Designer behavior, switch to `$easyink-contribution-dev` instead of continuing material development.
