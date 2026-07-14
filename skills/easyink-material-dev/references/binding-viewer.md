# Binding, Viewer, Measurement, Fragment Pagination, and Page-Aware Rules

## Font Loading

Viewer reaches terminal resource readiness before measurement, layout, pagination, and DOM rendering.

The chain is:

1. Each admitted material's schema adapter publishes font and asset references through manifest resource introspection.
2. Viewer combines those declarations with the page font and sends the bounded set to its resource-readiness coordinator.
3. The coordinator prepares fonts through `FontManager` and the Viewer host target, prepares assets through the host adapter, and records a terminal result for every declared resource.
4. Viewer publishes the resulting `resourceRevision` to `MeasureService`; measurement and committed layout depend on that revision.
5. Font failures produce Viewer diagnostics and terminal failed resource facts, while rendering can continue with browser font behavior.

Rules for material developers:

- Store font references as family strings in the material model, or inherit from `schema.page.font`.
- Render CSS from `context.resolvedModel.fontFamily` only after escaping or via DOM style APIs.
- Do not call `FontProvider` or `FontManager` from material `render()` or layout measurement.
- Do not serialize font URLs, `ArrayBuffer`s, loaded/error status, style elements, or generated `@font-face` text into Schema.
- Publish every material-owned font or asset path from the schema adapter's `introspect()` result so Viewer can prepare it before measurement.
- Font load diagnostics are warnings. Materials should still render with browser font behavior when a font is unavailable.

## Binding Projection

Ordinary element binding is handled by the profile runtime before material layout or render:

1. The compiled profile supplies the material's binding-port policy.
2. The runtime binding resolver validates port kind, scope, JSON shape, and format policy.
3. `projectMaterialRuntimeModel()` copies the admitted model and projects display ports into declared model paths.
4. Layout and render consume the same frozen model as `context.resolvedModel`.

For standard materials, do not manually walk `context.data` in `render()`. Read `context.resolvedModel` after the Viewer pipeline has projected bindings.

Ordinary binding can project structured values, not only scalar display text. A chart material can declare an object-shaped port and consume the projected value from `context.resolvedModel`. If the material executes JavaScript source to build that object, document it as trusted template code and report failures as material diagnostics.

Primary binding defaults:

- `text` maps binding 0 to `content`.
- `image` maps binding 0 to `src`.
- `barcode` and `qrcode` map binding 0 to `value`.
- Unknown types default to `content`.

Multi-binding requires explicit mapping in `binding-projector.ts` unless the material owns a custom schema such as table cell bindings.

## Material Data Contract

Use `DataContractBinding` when a material consumes a structured target model instead of projecting one field into one model path. Chart-like materials are the reference case: `MaterialManifest.common.binding` declares `kind: 'ports'`, a `dataContract`, and its semantic port, while the matching entry in `node.bindings` stores mappings from source paths to target fields.

The contract describes the target model:

```ts
const DATA_CONTRACT = {
  version: 3,
  model: {
    kind: 'tabular',
    fields: {
      category: { labelKey: 'materials.chart.data.category', type: 'string', required: true, format: 'display' },
      value: { labelKey: 'materials.chart.data.value', type: 'number', required: true, format: 'raw' },
    },
  },
} as const
```

The binding stores source mappings:

```ts
const binding = {
  kind: 'data-contract',
  mappings: {
    category: { sourceId: 'report', select: { path: 'monthlySales/month' } },
    value: { sourceId: 'report', select: { path: 'monthlySales/revenue' } },
  },
  relation: { kind: 'auto' },
} as const
```

Viewer rendering rules for data-contract materials:

- Declare the data contract and semantic port in `MaterialManifest.common.binding`.
- Store source-to-target mappings in the matching `node.bindings` port.
- Let profile admission and the runtime binding resolver validate and resolve the mapping before layout/render.
- Consume the resulting frozen target model through `context.resolvedModel` and report only material-specific diagnostics from the renderer.
- Keep visual options in `node.model`; keep source-to-target data mappings in `node.bindings`.
- Preserve full `mapping.select.path` values in Schema. If the resolver needs a collection parent or leaf path, derive it temporarily.

Relation resolver rules:

- Shared paths such as `monthlySales/month` and `monthlySales/revenue` resolve as record collection data.
- Top-level arrays such as `category` and `values` resolve by index.
- `data[sourceId]` is used only when the complete path or its parent collection resolves there; otherwise the resolver falls back to the global data root.
- `relation.kind='auto'` is the normal choice for resolver-derived record or index alignment.

## Datasource Drop

If whole-element binding is enough, rely on default Designer behavior.

Implement `datasourceDrop` when the material owns internal drop zones:

- `onDragOver(field, point, node)` returns accepted or rejected zone descriptors in material-local coordinates.
- `onDrop(field, point, node)` commits binding via `context.tx.run()`.
- Use `context.t()` for rejection labels.
- Validate row, cell, source, and collection relationships before committing.

`table-data` uses this pattern to bind fields into cells. It rejects hidden rows and rejects repeat-template fields from a different collection prefix than existing repeat-template cells.

Materials whose `MaterialManifest.common.binding` uses `kind: 'ports'` with a `dataContract` usually do not need a custom `datasourceDrop` just to bind whole-element data. Designer fills unbound target fields in contract order on canvas drop and exposes a MaterialDataBindingEditor for dropping a field onto a specific target field. The Designer should not reject different collections for data-contract mappings; the resolver owns runtime relation diagnostics.

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

Empty or non-array data renders a single placeholder row, not a schema mutation.

## Measurement

Implement `async MaterialViewerLayoutFacet.measure(request)` only when runtime content can change dimensions. Good examples:

- data table expands to N runtime rows,
- rich text expands with wrapped content,
- custom nested material grows based on children,
- flow/flex row reflows columns from runtime data.

For fixed-size materials, omit the layout facet measurement function.

The asynchronous layout facet runs through `MeasureService` after binding projection and terminal resource readiness. It returns a frozen `MaterialLayoutPlan`; core document layout and pagination consume that committed plan rather than invoking material layout again during paint.

When implementing a measured material:

- Do not mutate the source node or runtime model from `measure(request)`.
- Honor `request.signal` and reserve rows and layout facts through `request.budget` before publishing them.
- Return a frozen `MaterialLayoutPlan` containing border/content boxes, diagnostics, optional break opportunities, and bounded payload facts needed by render.
- Use the request's measurement services, publish diagnostics in the returned plan, and let the runtime forward that committed diagnostic path; do not create a separate paint-time channel.
- Ensure `render()` consumes the committed layout and fragment facts produced from the same plan.
- Add a Designer control policy when measurement owns width or height.
- Test the relevant page strategy: `flow-y` reflow, `none` continuous output, `fixed-sheets`, or `auto-sheets`.

`table-data` measurement is the runtime source of truth:

- `tableDataViewerLayout.measure()` resolves visible runtime rows, computes baseline row heights, and publishes break opportunities plus frozen payload facts.
- `renderTableData()` consumes the committed runtime model and fragment payload; no sync-measure compatibility cache mutates or keys off Schema objects.
- `MeasureService` owns the bounded dependency-keyed cache.

## Fragment Contribution

Publish monotonic break opportunities and a fragment adapter when a material can split itself across `auto-sheets`. Core selects the page break and asks the adapter to contribute the exact requested range.

Rules:

- Preserve the requested instance and node identity.
- Consume the exact forward range selected by core.
- Do not mutate the source table model, source rows, or source `MaterialNode` geometry in Schema.
- Keep measurement, break opportunities, and fragment contribution consistent.

`table-data` is the current reference: it splits expanded rows, repeats header rows on following pages, and keeps footer rows with the remaining fragment.

## Viewer Output

Viewer output is a budgeted render tree:

```ts
return {
  tree: viewerElement('div', {}, [viewerText(text)]),
}
```

Raw HTML strings are not part of the contract. Use an opaque `SanitizedMarkup` token for declared markup capabilities, or an explicitly granted imperative host when a library must own DOM.

## Page-Aware and Repeated Overlays

Declare post-pagination repetition with manifest `common.layout.pageRepeat='every-output-page'`.

Viewer behavior:

- Repeated elements are excluded from layout/reflow/pagination inputs.
- They are copied into every output page after pagination.
- Runtime instances receive collision-free identities and page-context models.
- In `fixed-sheets + blankPolicy='remove'`, visible repeated overlays can retain an otherwise blank page.

Material renderers should read page runtime values from `context.resolvedModel`. Do not compute page counts from schema counts or output DOM.

Designer behavior:

- The source repeated node remains the only interactive node.
- Repeat previews on other visual pages are non-interactive.
- Preview clones must not participate in selection, snapping, drag, resize, or command history.

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

- A missing or unadmitted material type is quarantined during profile/document admission and renders `[material unavailable]`.
- Render errors produce a warning diagnostic and quarantine only the current committed plan/node behind stable placeholder output.
- Measurement diagnostics flow through the committed layout plan; render never falls back to synchronous remeasurement or an uncommitted original-size result.
- Layout/reflow/pagination diagnostics are emitted as Viewer diagnostics.

Tests should assert these recovery paths when adding risky runtime behavior.
