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
- Keep `compat` fields as compatibility state, not the primary home for new material semantics.

## Orthogonal Page System

Legal `PageMode` values are `fixed` and `continuous`.

Current semantics come from four page layers:

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
- Do not add new behavior branches keyed only on `page.mode`; use the layer that owns the semantic decision.
- `page-planner.ts` is a compatibility facade. New runtime behavior should go through `runLayoutPipeline()` and `runPagination()`.

## Node Layout Behavior

Node-level behavior lives outside material-specific props:

- `node.placement.mode='flow'`: participates in `flow-y` reflow.
- `node.placement.mode='fixed'`: keeps original document coordinates and ignores break constraints.
- `node.break.keepTogether/before/after`: applies during `auto-sheets` pagination for flow nodes.
- `node.repeat.scope='every-output-page'`: copied after pagination to every output page; does not affect page count or continuous-paper height.

Old `node.props.layoutMode`, `keepTogether`, `pageBreakBefore`, and `pageBreakAfter` are read only as compatibility fallbacks. New writes should use `placement`, `break`, and `repeat` through `UpdateMaterialBehaviorCommand`.

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
- Font failures emit Viewer diagnostics with `scope: 'font'`, but rendering continues with browser fallback fonts.

Material code should only store and render font family names. It should not call `FontProvider`, create `FontManager`, inject `@font-face`, or serialize font sources.

## Viewer Contract

The Viewer contract is in `packages/core/src/material-viewer.ts`.

Implement `MaterialViewerExtension` with:

- `render(node, context)`: return `{ html: trustedViewerHtml(...) }` or `{ element }`.
- `measure(node, context)`: optional pre-layout sizing for content-driven dimensions.
- `getRenderSize(node, context)`: optional wrapper size override.
- `fragmentPaginator`: optional split logic for fragments that can cross `auto-sheets`.
- `pageAware`: default repeated overlay behavior for materials such as page numbers.

Viewer runtime stages:

1. Normalize/validate schema and load fonts.
2. Resolve ordinary bindings into `resolvedPropsMap`; data-contract materials resolve their target records inside their Viewer renderer with `resolveMaterialDataContract()`.
3. Run material `measure()` with resolved props applied to a temporary node.
4. Exclude repeated/page-aware nodes from layout inputs.
5. Run `runLayoutPipeline()` and `runPagination()`.
6. Copy repeated/page-aware elements into each output page and inject `__pageNumber` / `__totalPages`.
7. Render DOM through `MaterialRendererRegistry`.
8. Cache `ViewerPageMetrics` for print/export.

## Registration

Custom material hosts:

- Designer: call `registerMaterialBundle(store, bundle)` inside `EasyInkDesigner` `setupStore`.
- Viewer: call `viewer.registerMaterial(type, extension)`.

Built-in materials:

- Add package imports and entries in `packages/builtin/src/designer.ts`.
- Add Viewer registration in `packages/builtin/src/viewer.ts`.
- Add AI descriptor import and entry in `packages/builtin/src/ai.ts` when generation should know it.
- Add `@easyink/material-x` dependency to `packages/builtin/package.json`.

## Catalog and Capabilities

`DesignerMaterialRegistration` defines:

- `type`: stable Schema identity.
- `name`: display label or i18n key.
- `icon`: Vue icon component.
- `category`: primary material category.
- `capabilities`: controls binding, rotation, resizing, children, animation, union drop, page-aware, multi-binding, and aspect lock.
- `dataContract`: optional target data model for structured datasource materials. When present, Designer writes `node.binding.kind='data-contract'` mappings instead of ordinary whole-element `BindingRef`.
- `createDefaultNode`: default schema factory.
- `factory`: Designer extension factory.
- `propSchemas`: material-owned property schemas appended to base entries from `@easyink/prop-schemas`.
- `sectionFilter`: hide or show property panel sections.

`quickMaterialTypes` creates quick toolbar entries. `groupedCatalog` creates grouped catalog entries for data, chart, svg, and utility groups.

## Contribution Boundary

If the request is to add a button, panel, command, diagnostic subscription, or host workflow around existing Designer behavior, switch to `$easyink-contribution-dev` instead of continuing material development.
