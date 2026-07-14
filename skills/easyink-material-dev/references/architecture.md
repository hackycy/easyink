# EasyInk Material Architecture

## Core Chain

Material work spans this chain:

```text
Designer material catalog
  -> createDefaultNode(partial?, unit?)
  -> schema.elements[]
  -> FontProvider / FontManager preload and injection for referenced page or element fonts
  -> MaterialDesignerExtension.renderContent()
  -> viewer.open({ schema, data })
  -> collectFontFamilies(schema) and loadAndInjectFonts() into the Viewer host document
  -> conditional schema resolution (default material capability unless explicitly disabled or narrowed)
  -> ordinary binding projection / material data contract resolution
  -> material measure()
  -> runLayoutPipeline()
  -> runPagination()
  -> repeated page overlays
  -> MaterialViewerExtension.render()
  -> print and export reuse Viewer DOM and metrics
```

If one link is missing, the failure mode is usually direct: no Designer registration means it cannot be dragged in; no Viewer registration means `[Unknown: type]`; no stable default node means drag and auto-create paths produce blank or invalid templates.

## State Boundaries

- Schema state lives in `DocumentSchema` and `MaterialNode`: persistent, undoable, imported/exported.
- Workbench state lives in Designer store: panels, zoom, selection, window layout, preferences, and active sessions.
- Runtime state lives in Viewer and editing sessions: resolved props, measurements, layout fragments, output page plans, transient handles, drag gestures, DOM refs, and measured caches.
- Font runtime state lives in `FontManager`: provider catalog cache, in-flight loads, failures, loaded font sources, and injected style elements for a host `Document` or `ShadowRoot`.

Do not move transient runtime details into Schema. Examples to keep out of Schema: active cell selection, pointer gesture state, virtual preview rows, handle positions, measurement caches, output page fragments, repeated overlay clones, DOM refs, active editing metadata, font sources, font load states, and injected `@font-face` CSS.

## Schema Input and Normalization

Host apps may pass a loose `DocumentSchemaInput` into Designer or Viewer. Required top-level fields, `page`, `guides`, and `elements` may be missing. The framework fills them with `normalizeDocumentSchema()`, and internal Designer, Viewer, autosave, print, and export flows should operate on a complete `DocumentSchema`.

Rules:

- Normalize before assuming `schema.page`, `schema.guides`, and `schema.elements` are complete.
- Use schema validation for complete internal schemas, not as a replacement for input normalization.
- Preserve `DocumentSchema.extensions` and `MaterialNode.extensions` for host/plugin-owned serializable data.
- New material semantics belong in explicit schema fields, material props, or namespaced `extensions`.

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
- `measure()`, reflow, pagination, and repeated overlays can create runtime nodes/fragments, but must not silently write those results into source schema.
- Do not add new behavior branches keyed only on `page.mode`; read the owning page strategy field: `page.pageModel`, `page.layout`, `page.reflow`, or `page.pagination`.
- New runtime behavior should go through `runLayoutPipeline()` and `runPagination()`.

`page.layers` is separate from those behavior fields. It is a page-level render-layer array for non-element, non-editable, non-bindable page decorations such as text watermarks. It is resolved by `@easyink/core` into layer render plans and consumed by Designer/Viewer. Material code should not use `page.layers` as a material feature hook or custom extension point.

## Node Layout Behavior

Node-level behavior lives outside material-specific props:

- `node.placement.mode='flow'`: participates in `flow-y` reflow.
- `node.placement.mode='fixed'`: keeps original document coordinates and ignores break constraints.
- `node.break.keepTogether/before/after`: applies during `auto-sheets` pagination for flow nodes.
- `node.repeat.scope='every-output-page'`: copied after pagination to every output page; does not affect page count or continuous-paper height.

Use `repeat.scope` for editable or data-bound headers, footers, page numbers, logos, and repeated watermarks. Use `page.layers` only for whole-page render layers that are not `MaterialNode`s and do not need selection, dragging, binding, or source-node editing.

Write page behavior through `placement`, `break`, and `repeat` with `UpdateMaterialBehaviorCommand`.

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
- `DesignerStore` creates a `FontManager`, captures the host `Document` or `ShadowRoot` through `setFontTarget()`, and preloads fonts referenced by `schema.page.font` and `node.props.fontFamily`.
- Font properties use the `font` editor. Preview writes are skipped for font fields, and commits call `store.ensureFontLoaded({ family })` before writing Schema.
- Failed font loads do not commit the new font value. Designer diagnostics receive a `source: 'font'` warning.

Viewer owns output-time font loading:

- `ViewerRuntime` creates its own `FontManager` from `ViewerOptions.fontProvider`.
- Before binding, measurement, layout, pagination, and DOM render, it calls `collectFontFamilies(schema)` and `loadAndInjectFonts()` for the Viewer host document.
- Font failures emit Viewer diagnostics with `scope: 'font'`, but rendering continues with browser font behavior.

Material code should only store and render font family names. It should not call `FontProvider`, create `FontManager`, inject `@font-face`, or serialize font sources.

## Viewer Contract

The Viewer contract is in `packages/core/src/material-viewer.ts`.

Implement `MaterialViewerExtension` with:

- `render(node, context)`: return `{ tree: ViewerRenderTree }`.
- `measure(node, context)`: optional pre-layout sizing for content-driven dimensions.
- `getRenderSize(node, context)`: optional wrapper size override.
- layout break opportunities and a fragment adapter: optional split contribution for `auto-sheets`; core selects the break.
- manifest `common.layout.pageRepeat`: default repeated overlay behavior for materials such as page numbers.

Viewer runtime stages:

1. Normalize/validate schema and load fonts.
2. Resolve bindings through the profile port policy into frozen runtime models and scopes.
3. Run material `measure()` with resolved props applied to a temporary node.
4. Exclude repeated/page-aware nodes from layout inputs.
5. Run `runLayoutPipeline()` and `runPagination()`.
6. Copy repeated/page-aware elements into each output page and inject `__pageNumber` / `__totalPages`.
7. Render DOM through `MaterialRendererRegistry`.
8. Cache `ViewerPageMetrics` for print/export.

## Registration

Custom material hosts:

- Designer: pass the bundle through `runtimeConfig.materials.bundles`, or call `registerMaterialBundle(store, bundle)` inside `EasyInkDesigner` `setupStore`.
- Viewer: call `viewer.registerMaterial(type, binding, extension)` with the same material type and binding definition that Designer uses.
- Heavy Designer renderers may use `lazyFactory` on the Designer material entry. Keep material metadata synchronous; only the `MaterialDesignerExtension` factory should live in the lazy chunk.

Built-in materials:

- Add package imports and entries in `packages/builtin/src/designer.ts`.
- Add Viewer registration in `packages/builtin/src/viewer.ts`.
- Do not add default condition capability registrations. Conditional rendering is a framework default for all materials. Only set `condition: false` to opt out, or set a `hiddenEffects` override to narrow `remove/reserve` support.
- Keep the public `@easyink/builtin` export surface aligned. `package.json` only exposes the root entry plus `./all`, `./basic`, `./none`, and `./package.json`; `src/designer.ts`, `src/viewer.ts`, and `src/bindings.ts` are internal sources, not public subpaths.
- Root exports should expose the all-set legacy aliases plus explicit all/basic/none bundle aliases and Viewer registration helpers. `@easyink/builtin/all` exposes every built-in material; `@easyink/builtin/basic` must only import the reduced set it registers; `@easyink/builtin/none` must stay empty.
- Add `aiDescriptor` to the Designer material registration when generation should know it. Assistant consumes the live Designer material manifest; do not add material-specific prompt rules.
- Add `@easyink/material-x` dependency to `packages/builtin/package.json`.

## Catalog and Capabilities

`DesignerMaterialRegistration` defines:

- `type`: stable Schema identity.
- `name`: display label or i18n key.
- `icon`: Vue icon component.
- `category`: primary material category.
- `capabilities`: controls binding, rotation, resizing, children, animation, union drop, page-aware, multi-binding, and aspect lock.
- `condition`: optional condition capability override. Omit it for normal materials; the framework default supports `remove` and `reserve`. Use `false` only to ignore `renderCondition`, or a definition only to narrow `hiddenEffects`.
- `binding`: material binding definition: `none`, `ordinary`, `custom`, or `data-contract`. Data-contract definitions include the target model contract and make Designer write `node.binding.kind='data-contract'` mappings instead of ordinary whole-element `BindingRef`.
- `createDefaultNode`: default schema factory.
- `factory`: synchronous Designer extension factory or a lightweight placeholder when `lazyFactory` is present.
- `lazyFactory`: optional async Designer factory loader for heavyweight renderers. Do not use it for Viewer registration or material metadata.
- `propSchemas`: the complete material-owned property schema list for the material. Use `@easyink/prop-schemas` only for shared option arrays and layout behavior helpers.
- `localeMessages`: material-owned Designer locale messages for catalog labels, property labels, material-local actions, placeholders, history labels, and data-contract labels.
- `sectionFilter`: hide or show property panel sections.

`catalogs` creates material panel groups. Each group owns a stable `id`, a translatable `label`, optional ordering, and item entries. Register catalog label keys in the same bundle locale messages when the group is custom or when the host may omit the built-in bundle. A built-in material can be fully registered for Designer and Viewer but still be invisible in the material panel if its type is missing from every catalog group; add a regression test when introducing a new built-in material.

## Contribution Boundary

If the request is to add a button, panel, command, diagnostic subscription, or host workflow around existing Designer behavior, switch to `$easyink-contribution-dev` instead of continuing material development.
