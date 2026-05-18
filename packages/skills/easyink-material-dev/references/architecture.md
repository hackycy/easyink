# EasyInk Material Architecture

## Core Chain

Material work spans this chain:

```text
Designer material catalog
  -> createDefaultNode(partial?, unit?)
  -> schema.elements[]
  -> MaterialDesignerExtension.renderContent()
  -> viewer.open({ schema, data })
  -> Viewer binding projection and measure pass
  -> MaterialViewerExtension.render()
  -> print and export reuse Viewer DOM
```

If one link is missing, the failure mode is usually direct: no Designer registration means it cannot be dragged in; no Viewer registration means `[Unknown: type]`; no stable default node means drag and auto-create paths produce blank or invalid templates.

## State Boundaries

- Schema state lives in `DocumentSchema` and `MaterialNode`: persistent, undoable, imported/exported.
- Workbench state lives in Designer store: panels, zoom, selection, window layout, user preferences.
- Runtime state lives in Viewer and editing sessions: resolved props, page plan, font state, transient handles, drag gestures.

Do not move transient runtime details into Schema. Examples to keep out of Schema: active cell selection, pointer gesture state, virtual preview rows, handle positions, measured layout caches, DOM refs, and active editing metadata.

## Schema Input and Normalization

Host apps may pass a loose `DocumentSchemaInput` into Designer. Required top-level fields, `page`, `guides`, and `elements` may be missing. The framework fills them with `normalizeDocumentSchema()`, and internal Designer, Viewer, autosave, print, and export flows should operate on a complete `DocumentSchema`.

Rules:

- Normalize before assuming `schema.page`, `schema.guides`, and `schema.elements` are complete.
- Use schema validation for complete internal schemas, not as a replacement for input normalization.
- Preserve `DocumentSchema.extensions` and `MaterialNode.extensions` for host/plugin-owned serializable data.
- Keep `compat` fields as compatibility state, not the primary home for new material semantics.

## Schema Shape

Use `packages/schema/src/types.ts` as source of truth:

- `MaterialNode` stores `id`, `type`, geometry, `props`, optional `binding`, `children`, `extensions`, and animation or print metadata.
- `BindingRef` stores datasource identity and `fieldPath`, plus optional format and `bindIndex`.
- `TableNode` adds `table: TableSchema`.
- `TableDataSchema` uses `kind: 'data'`, `topology`, `layout`, and optional `showHeader` or `showFooter`.
- `TableCellSchema.binding` is for `table-data` repeat-template cells.
- `TableCellSchema.staticBinding` is for fixed cells such as table-static cells or table-data header/footer cells.

Page-mode implications:

- `fixed`: absolute positioning on fixed pages.
- `stack`: Viewer may measure content and flow elements by Y position.
- `label`: page-aware replication is not applied; label layout derives sheet dimensions from label cell width/height plus rows, columns, and gaps.

## Designer Contract

The Designer material contract is in `packages/core/src/material-extension.ts`.

Implement `MaterialDesignerExtension` with:

- `renderContent(nodeSignal, container)`: mount the design-time content and subscribe to node changes.
- `datasourceDrop`: optional material-owned drag/drop binding logic.
- `geometry`: optional deep-edit hit testing and selection rectangle mapping.
- `selectionTypes`: optional sub-selection schema and payload validation.
- `behaviors`: optional middleware chain for pointer, key, drop, paste, and command events.
- `decorations`: optional Vue decorations for handles, guides, toolbars, or overlays.
- `resize`: optional material-private side effects during element resize.
- `resolveControlPolicy`: optional design-time policy for hiding/disabling geometry inputs, resize handles, or property fields when a material owns its runtime dimension or other controls.

`MaterialExtensionContext` provides `getSchema`, `getNode`, `getBindingLabel`, `commitCommand`, `tx`, `requestPropertyPanel`, event bus methods, zoom/page DOM access, and `t(key)`.

Use `resolveControlPolicy()` when a material has a runtime-owned dimension or other state that should not be edited through the outer Designer chrome. This is the canonical place to say:

- hide or disable `width` / `height` inputs in the Properties panel,
- hide or disable the matching outer resize handles,
- and keep behavior handlers from reintroducing a blocked resize path.

Good examples:

- `table-data` owns runtime height through measured repeat rows and hides vertical outer resizing.
- `flow-row` / flex-row declares runtime height as a fixed Designer policy so width can reflow columns while height stays Viewer-measured.

## Viewer Contract

The Viewer contract is in `packages/core/src/material-viewer.ts`.

Implement `MaterialViewerExtension` with:

- `render(node, context)`: return `{ html: trustedViewerHtml(...) }` or `{ element }`.
- `measure(node, context)`: optional pre-page-plan sizing for content-driven dimensions.
- `getRenderSize(node, context)`: optional wrapper size override.
- `pageAware`: replicate this material to every page with `__pageNumber` and `__totalPages`.

The Viewer pipeline validates schema, resolves bindings, runs `measure()`, creates a page plan, handles page-aware replication, and then calls each material renderer through `MaterialRendererRegistry`.

## Registration

Custom material hosts:

- Designer: call `registerMaterialBundle(store, bundle)` inside `EasyInkDesigner` `setupStore`.
- Viewer: call `viewer.registerMaterial(type, extension)`.

Built-in materials:

- Add package imports and entries in `packages/builtin/src/designer.ts`.
- Add Viewer registration in `packages/builtin/src/viewer.ts`.
- Add AI descriptor import and entry in `packages/builtin/src/ai.ts`.
- Add `@easyink/material-x` dependency to `packages/builtin/package.json`.

## Contribution Boundary

If the request is to add a button, panel, command, diagnostic subscription, or host workflow around existing Designer behavior, switch to `$easyink-contribution-dev` instead of continuing material development.

## Catalog and Capabilities

`DesignerMaterialRegistration` defines:

- `type`: stable Schema identity.
- `name`: display label or i18n key.
- `icon`: Vue icon component.
- `category`: primary material category.
- `capabilities`: controls binding, rotation, resizing, children, animation, union drop, page-aware, multi-binding, aspect lock.
- `createDefaultNode`: default schema factory.
- `factory`: Designer extension factory.
- `propSchemas`: material-owned property schemas appended to base registry.
- `sectionFilter`: hide or show property panel sections.

`quickMaterialTypes` creates quick toolbar entries. `groupedCatalog` creates grouped catalog entries for data, chart, svg, and utility groups.
