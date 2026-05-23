# Binding, Viewer, Measurement, Fragment Pagination, and Page-Aware Rules

## Font Loading

Viewer loads fonts before ordinary runtime binding projection, measurement, layout, pagination, and DOM rendering.

The chain is:

1. `ViewerRuntime.render()` calls its font-loading stage.
2. `collectFontFamilies(schema)` collects `schema.page.font` and every traversed `node.props.fontFamily`.
3. `loadAndInjectFonts(families, fontManager, host.document)` calls `FontManager.ensureFontLoaded({ family }, target)`.
4. `FontManager` asks the host `FontProvider.loadFont()` for a URL or `ArrayBuffer`, caches the result, and injects one `@font-face` style per target and font key. Catalog entries with `source: 'system'` are treated as already loaded and skip this resource-loading step.
5. Viewer continues with binding projection, measurement, layout, pagination, and rendering.

Rules for material developers:

- Store font references as family strings, usually `node.props.fontFamily`, or inherit from `schema.page.font`.
- Render CSS such as `font-family:${escapeHtml(props.fontFamily)}` only after escaping or via DOM style APIs.
- Do not call `FontProvider`, `FontManager`, or `loadAndInjectFonts()` from material `render()` or `measure()`.
- Do not serialize font URLs, `ArrayBuffer`s, loaded/error status, style elements, or generated `@font-face` text into Schema.
- When adding a new font-bearing prop outside `node.props.fontFamily`, also update `collectFontFamilies()` or the schema traversal model so Viewer and Designer can preload it.
- Font load diagnostics are warnings. Materials should still render with CSS fallback behavior when a font is unavailable.

## Binding Projection

Ordinary element binding is handled by Viewer before material render:

1. `ViewerRuntime.resolveAllBindings()` calls `projectBindings(node, data)`.
2. `applyBindingsToProps(props, projected, node.type)` maps projected values into props.
3. `measure()` receives a temporary node whose `props` are already resolved.
4. `renderPages()` passes `context.resolvedProps` and a `nodeForRender` whose `props` are the resolved props.

For standard materials, do not manually walk `context.data` in `render()`. Read `context.resolvedProps` or `getNodeProps(node)` after the Viewer pipeline has projected props.

Primary binding defaults:

- `text` maps binding 0 to `content`.
- `image` maps binding 0 to `src`.
- `barcode` and `qrcode` map binding 0 to `value`.
- Unknown types default to `content`.

Multi-binding requires explicit mapping in `binding-projector.ts` unless the material owns a custom schema such as table cell bindings.

## Datasource Drop

If whole-element binding is enough, rely on default Designer behavior.

Implement `datasourceDrop` when the material owns internal drop zones:

- `onDragOver(field, point, node)` returns accepted or rejected zone descriptors in material-local coordinates.
- `onDrop(field, point, node)` commits binding via `context.tx.run()`.
- Use `context.t()` for rejection labels.
- Validate row, cell, source, and collection compatibility before committing.

`table-data` uses this pattern to bind fields into cells. It rejects hidden rows and rejects repeat-template fields from a different collection prefix than existing repeat-template cells.

## Table-Data Runtime Expansion

`table-data` is special:

- Schema stores real structural rows only: header, one repeat-template row, optional footer.
- Designer may render virtual preview rows after the repeat-template row, but those rows are not Schema rows.
- Repeat-template cells use `cell.binding` with absolute slash paths such as `items/name`.
- Header/footer or fixed cells use `cell.staticBinding`.
- All repeat-template bindings in the same row should share the same collection prefix.

Viewer expansion:

1. Collect repeat-template cell binding paths.
2. Derive collection path with `extractCollectionPath()`.
3. Resolve the collection from runtime data.
4. Clone one row per array item.
5. Resolve each cell leaf field against the item.
6. Format via `formatBindingDisplayValue()`.
7. Report diagnostics with `nodeId` when formatting fails.

Empty or non-array data renders a single fallback row, not a schema mutation.

## Measurement

Implement `measure()` only when runtime content can change dimensions. Good examples:

- data table expands to N runtime rows,
- rich text expands with wrapped content,
- container grows based on children,
- flow/flex row reflows columns from runtime data.

For fixed-size materials, omit `measure()`.

`measure()` runs after binding projection and before layout/reflow/pagination. Its result is used by `runLayoutPipeline()` to create measured fragments and by the Viewer render path to keep output in sync.

When implementing a measured material:

- Do not mutate the source schema object from `measure()`.
- Return document-unit width and height.
- Report diagnostics through `context.reportDiagnostic`.
- Ensure `render()` uses the same layout assumptions as `measure()`.
- Add a Designer control policy when measurement owns width or height.
- Test the relevant page strategy: `flow-y` reflow, `none` continuous output, `fixed-sheets`, or `auto-sheets`.

`table-data` measurement is the runtime source of truth:

- `measureTableData()` resolves visible runtime rows, computes baseline row heights from original schema height, runs auto-row-height calculation, caches the layout in a WeakMap keyed by `node.table`, and returns runtime height.
- `renderTableData()` reuses the cached layout because Viewer has already applied measured height to the render node.
- The cache is runtime-only and must not be serialized.

## Fragment Pagination

Use `fragmentPaginator` when a material can split itself across `auto-sheets`.

`FragmentPaginator.paginateFragment(input)` receives:

- the current `LayoutFragment`,
- available height on the output page,
- page context with `pageIndex`.

It returns:

- `currentPage`: the fragment to render on this page,
- optional `nextPage`: the remaining fragment,
- diagnostics.

Rules:

- Preserve `sourceNodeId` so diagnostics and renderer behavior still point to the original material.
- Create virtual fragments/nodes only for runtime planning.
- Do not mutate `node.table`, source rows, or source `MaterialNode` geometry in schema.
- Keep `measure()` and `fragmentPaginator` consistent: the measured height must describe the same content the paginator splits.

`table-data` is the current reference: it splits expanded rows, repeats header rows on following pages, and keeps footer rows with the remaining fragment.

## Trusted Viewer HTML

Viewer string output must be wrapped:

```ts
return {
  html: trustedViewerHtml(html),
}
```

Use `trustedViewerHtml(html, 'sanitized-rich-text')` only when the material has already sanitized or internally generated the rich markup. Escape all user-controlled strings with `escapeHtml()` before interpolation.

## Page-Aware and Repeated Overlays

There are two ways to request post-pagination repetition:

- Viewer extension `pageAware: true`, used for material defaults such as `page-number`.
- Schema field `node.repeat.scope='every-output-page'`, used when the user or factory explicitly repeats an element such as a header, footer, or watermark.

Viewer behavior:

- Repeated/page-aware elements are excluded from layout/reflow/pagination inputs.
- They are copied into every output page after pagination.
- Virtual IDs are generated as `originalId__p${page.index}`.
- Resolved props get `__pageNumber` and `__totalPages`.
- In `fixed-sheets + blankPolicy='remove'`, visible repeated overlays can retain an otherwise blank page.

Material renderers should read page-aware runtime values from `context.resolvedProps`. Do not compute page counts from schema `page.pages`, copy counts, or output DOM.

Designer behavior:

- The source repeated node remains the only interactive node.
- Repeat previews on other visual pages are non-interactive.
- Preview clones must not participate in selection, snapping, drag, resize, or command history.

## Render Size

Use `getRenderSize()` when wrapper dimensions should differ from schema `width` and `height`. This is uncommon; prefer normal width/height or `measure()` unless wrapper size must diverge at render time.

## Exporter and Print Driver Boundary

Export and print layers are downstream of Viewer:

- `ViewerExporter` bridges Viewer context to an export runtime or direct Blob result.
- `ExportFormatPlugin` should focus on format conversion, not Viewer layout semantics.
- `PrintDriver` bridges Viewer-rendered pages and print policy to a device, gateway, SDK, DOM printer, PDF pipeline, or WebSocket protocol.
- Both should use `context.container?.querySelectorAll('.ei-viewer-page')`, `context.renderedPages`, and `ViewerPageMetrics` when they need pages or dimensions.

Material developers should not add export-specific or print-specific rendering branches unless there is a deliberate Viewer output difference. Prefer making the normal Viewer DOM correct and printable.

Diagnostics and feedback matter in downstream validation:

- Export diagnostics should separate `viewer`, `exporter`, and runtime/plugin failures.
- Print drivers should call `onPhase`, `onProgress`, and `onDiagnostic` so material/render failures can be distinguished from device or protocol failures.
- Unit conversion belongs at the print-driver boundary; material schema sizes remain in document units.

## Viewer Failure Handling

Viewer wraps material render and measurement through diagnostic handling:

- Missing material type renders `[Unknown: type]`.
- Render errors produce a warning diagnostic and fallback placeholder.
- Measure errors are warnings and leave the original node size unchanged.
- Layout/reflow/pagination diagnostics are emitted as Viewer diagnostics.

Tests should assert these fallback paths when adding risky runtime behavior.
