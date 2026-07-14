# Material Development Flow

## Built-In Material Package Shape

Follow existing packages such as `packages/materials/rect`, `packages/materials/text`, `packages/materials/page-number`, `packages/materials/svg/star`, `packages/materials/flow-row`, and `packages/materials/table/data`.

Typical files:

- `package.json`: package name, workspace deps, optional Vue peer dependency when Designer code imports Vue, and subpath exports for lazy-loaded entries such as `./designer`, `./schema`, `./prop-schemas`, `./locale`, or `./viewer`.
- `tsdown.config.ts`: `entry: ['src/index.ts']` plus any public subpath entries, `dts: true`, `exports: true`, `publint: true`.
- `src/schema.ts`: type constant, model interface, defaults, capabilities, schema migration, and `createXNode()`.
- `src/designer.ts`: `createXExtension(context)`.
- `src/viewer.ts`: `ViewerRenderTree` rendering plus an optional pure layout adapter.
- `src/prop-schemas.ts`: material-owned property panel additions when needed.
- `src/ai.ts`: `AIMaterialDescriptor` plus optional `knowledge` for Assistant generation, material selection, binding, sizing, and scenario fit.
- `src/index.ts`: export public symbols.
- `src/*.test.ts`: focused tests for rendering, defaults, deep editing, measure, pagination, and schema behavior.

## Schema Factory Rules

In `schema.ts`:

- Export a canonical `TYPE` string and do not rename it after release.
- Use `generateId(prefix)` from `@easyink/shared` for IDs.
- Use `convertUnit(value, 'mm', unit)` when defaults are authored in mm and `unit` may differ.
- Merge defaults before the partial model, and do not let `partial.model` accidentally overwrite the entire node before canonicalization.
- Default nodes must be visible without external data.
- Capabilities must match actual behavior. Do not mark binding, resizing, rotation, slots, repetition, or aspect-lock support optimistically.
- Do not add material-local condition constants or default `condition` registrations. Conditional rendering is enabled by default for all materials with `remove` and `reserve`; only declare `condition: false` or a narrowed `hiddenEffects` override when the default behavior is wrong.
- Use `output.placement`, `output.break`, and `output.repeat` for node-level page behavior. Do not add page behavior fields under the material model.

Pattern:

```ts
export const X_TYPE = 'x'

export interface XModel {
  content: string
}

export const X_DEFAULTS: XModel = {
  content: 'Preview',
}

export function createXNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const partialModel = (partial?.model ?? {}) as Partial<XModel>
  const partialNode = partial ? { ...partial } : undefined
  if (partialNode)
    delete partialNode.model

  return canonicalizeMaterialNode(X_TYPE, {
    id: generateId('x'),
    type: X_TYPE,
    x: 0,
    y: 0,
    width: c(80),
    height: c(20),
    model: { ...X_DEFAULTS, ...partialModel },
    ...partialNode,
  })
}
```

For page overlays such as page numbers, defaults may set:

```ts
const overlayDefaults = {
  output: {
    visibility: 'include',
    placement: { mode: 'fixed' },
    repeat: { scope: 'every-output-page' },
  },
}
```

Only do this when the material is intentionally a post-pagination overlay. Editable or data-bound headers, footers, and watermarks can also use `repeat.scope`, but they should still behave like one editable source node in Designer.

## Designer Rendering Rules

Use `renderContent(nodeSignal, container, renderContextSignal?)`:

- Render immediately.
- Subscribe to `nodeSignal` so property changes update the canvas.
- Subscribe to `renderContextSignal` only when the material needs Designer-owned transient context, such as page-aware source/repeat preview page numbers.
- Return the unsubscribe and any cleanup for DOM listeners or gestures.
- Escape user-controlled values with `escapeHtml()` or use real DOM text APIs.
- Use `context.t(key)` for placeholders and labels.
- Use Designer placeholders for empty content when needed, but keep defaults Viewer-renderable.

Simple materials can set `container.innerHTML`. Complex materials can create Vue decorations or DOM manually, but cleanup must be deterministic.

Designer coordinates and design-time page context come through framework-owned surface planning. Material code should use material-local coordinates in geometry and datasource drop protocols, and should not convert output page plans or `renderContextSignal` values back into schema coordinates or persisted model state.

For heavyweight Designer renderers, keep only the extension factory behind `lazyFactory`. Keep binding ports, property descriptors, locale messages, AI descriptor, catalog entries, default node, and Viewer facet in the manifest before profile compilation so Designer panels, Viewer activation, and Assistant manifest are complete before the renderer chunk loads.

For font-bearing materials:

- Use `node.model.fontFamily` for the normal element font field when possible, and publish the path through schema-adapter resource introspection.
- Let the property panel `font` editor own catalog display, load button state, preview suppression, and commit-time `ensureFontLoaded()`.
- Designer renderers may set `font-family` from the current prop to reflect the selected family, but they should not inject font CSS or call the host font provider.
- If a deep-edit sub-property exposes a font field, define it as `type: 'font'` through `SelectionType.getPropertySchema()` so the same loading and commit guard applies.

## Viewer Rendering Rules

Build a `ViewerRenderTree` with `viewerText()`, `viewerElement()`, and `viewerFragment()`:

- Read `context.resolvedModel` for ordinary element bindings.
- For structured data materials, declare ports and the data contract in the manifest, persist mappings in `node.bindings`, and consume the already resolved `context.resolvedModel` in layout and render.
- The committed renderer passes the exact frozen runtime model, layout plan, and fragment plan for the instance.
- Put runtime strings in `viewerText()`; raw HTML strings are not a Viewer output.
- Keep Viewer output print/export stable because print and export reuse the Viewer result.
- Add `MaterialViewerLayoutFacet.measure(request)` only when runtime content changes physical size.
- Publish monotonic break opportunities and a fragment adapter only when measured content can split across `auto-sheets`.

The layout facet runs before document layout and pagination. It returns frozen document-unit facts without mutating source Schema; `render()` consumes the exact committed plan and fragment.

Font-dependent Viewer behavior:

- Viewer reaches terminal font readiness before `MaterialViewerLayoutFacet.measure(request)` and `render()`, so text measurement can assume requested fonts have been attempted.
- Material layout measurement must still tolerate browser font metrics when a font failed to load.
- Material `render()` should emit only the `font-family` declaration needed for its own content. Page-level inheritance is handled by the Viewer page root from `schema.page.font`.
- If a material stores fonts in nested model data, publish those paths from schema-adapter resource introspection and test terminal readiness before measurement and render.

## Page Layout and Behavior Rules

New material work should respect the orthogonal page behavior fields:

- `page.pageModel` describes media.
- `page.layout` describes how elements enter document coordinates.
- `page.reflow` describes whether measured flow elements move along Y.
- `page.pagination` describes how document coordinates become output sheets.

Do not implement material-specific page planning. Materials may provide:

- stable document geometry,
- optional runtime `measure()` results,
- optional break opportunities and fragment adapter for splittable content,
- optional manifest `common.layout.pageRepeat` default repetition,
- and node-level `placement`, `break`, or `repeat` defaults.

The Viewer owns layout, pagination, page overlay cloning, page number context, and `ViewerPageMetrics`.

`page.layers` is not a material behavior field. It stores page-level render layers, currently text watermarks, and is resolved through `@easyink/core` page-layer helpers. New materials should not write `page.layers` unless the task is explicitly about whole-page, non-element, non-editable, non-bindable rendering; editable or data-bound repeated visuals belong in `schema.elements[]` with `repeat.scope='every-output-page'`.

## Designer Control Policy Rules

`capabilities` are coarse static declarations. Use `MaterialDesignerExtension.resolveControlPolicy()` for node-specific or material-specific Designer controls.

Use a control policy when:

- runtime data or `MaterialViewerLayoutFacet.measure(request)` owns an element dimension,
- a material should keep width editable but make height runtime-controlled,
- a property panel field or group should be disabled/hidden by material state,
- or an internal kernel behavior must follow the same allow/deny rule as the visible handle.

Runtime-height pattern:

```ts
const RUNTIME_HEIGHT_CONTROL_POLICY = {
  geometry: {
    height: { state: 'disabled', reason: 'designer.reason.runtimeHeight' },
  },
  resize: {
    height: { state: 'hidden', reason: 'designer.reason.runtimeHeight' },
  },
}
```

Then return it from `resolveControlPolicy()` and also guard any behavior that would mutate height. For table-like kernels, expose delegate hooks such as `canResizeRow()` / `canResizeColumn()` and make decoration visibility and command execution use the same delegate.

`table-data` and `flow-row` are runtime-height examples: Designer may allow horizontal width changes, but vertical outer handles and the `H` geometry field must be unavailable. Do not solve this with one-off checks in `CanvasWorkspace.vue` or `PropertiesPanel.vue`.

## Property Panel Rules

Use `PropertyDescriptor` entries for simple `node.model` fields:

- `string`, `text`, `textarea`, `number`, `color`, `switch`, `enum`, `font`, `image`, etc.
- Nested model values can use dotted keys such as `typography.fontSize` with a model accessor.
- Labels should be i18n keys.
- Group names should be one of the groups mapped in `PropertiesPanel.vue` or an intentionally visible custom group.
- For `code` or `textarea` properties whose value is commonly authored in a local text file, declare `editorOptions.valueInput = { kind: 'text-file', id, source, accept, pickTitle, maxBytes }`. For image or asset URL properties, use `{ kind: 'asset-url', id, source, accept, pickTitle }`. The shared `PropSchemaEditor` calls Designer's interaction bridge and commits the returned property value. Do not add material-local `<input type="file">` controls, and do not persist file names, local paths, `File` objects, picker state, or import state in Schema.
- For JavaScript authoring properties such as custom ECharts option code, use `type: 'code'` with `editorOptions.language = 'javascript'`, editor height/dialog sizing, and localized labels/placeholders. Store source strings only. Treat execution as trusted template code, not a sandbox, and turn failures into diagnostics plus stable placeholder output.

For font properties:

- Use `type: 'font'` instead of a string enum or free text field when the value should be selected from the host font catalog.
- Keep the normal model key as `fontFamily` when possible, and publish its path from schema-adapter resource introspection.
- Do not implement custom font preload logic in material-local property editors. The shared property panel prevents preview writes for font fields, loads the family on commit, and rolls back when loading fails.
- The empty string means default/inherited font. Do not replace it with a hardcoded browser font unless the material intentionally owns that default.

Material package `src/prop-schemas.ts` files own the full Designer property schema list for that material. `@easyink/prop-schemas` only provides shared option arrays and `createLayoutBehaviorPropSchemas()`; it must not know built-in material types or return material-specific schema lists.

Base layout behavior props are appended by `PropertiesPanel.vue` through `createLayoutBehaviorPropSchemas({ page })`. Do not duplicate placement, break, or repeat controls in material packages unless the material has a truly different sub-selection UI.

Use an explicit `PropertyAccessor` when the property is outside the normal model path or has side effects. `table-data` `showHeader` and `showFooter` are the model example: their accessors update `/model/bands`, `/bindings`, and `/slots` together and return selection-rebase hints through the editing transaction.

Use `requestPropertyPanel()` or `SelectionType.getPropertySchema()` when:

- The property applies to a sub-selection.
- A write touches multiple fields.
- The editor is context-aware or temporary.
- The data path is not a normal model path.

## Built-In Registry Checklist

For a new built-in material:

1. Create the package under `packages/materials/...`.
2. Ensure `pnpm-workspace.yaml` already includes the path pattern. SVG subpackages belong under `packages/materials/svg/*`.
3. Add package dependency to `packages/builtin/package.json`.
4. Export one complete manifest containing the common contract and Designer, Viewer, and optional AI facets.
5. Import that manifest into `packages/builtin/src/index.ts` and add it to `builtinAllMaterialPackage`; add it to `builtinBasicMaterialPackage` only when it belongs in the reduced set.
6. Keep `getBuiltinMaterialPackage()` and `compileBuiltinMaterialProfile()` behavior aligned across the root, `/all`, `/basic`, and `/none` public entry points. The none package remains empty.
7. Leave `condition` omitted unless this material explicitly opts out or narrows hidden effects; do not register the framework default.
8. If Designer rendering is heavy, use `lazyFactory` for the Designer extension chunk only; keep the Viewer facet and all common metadata in the manifest before compiling the immutable profile.
9. Put the material-local AI descriptor in the manifest AI facet. `packages/builtin/src/ai.ts` derives descriptors from `builtinAllMaterialPackage`; do not hand-maintain a second list.
10. Add `src/locale.ts` in the material package and expose it through the manifest Designer facet. Keep `@easyink/locales` for Designer common strings only.
11. Declare catalog group and order metadata in the manifest Designer facet. If you add a new group id, include `materials.catalog.<id>` in the material locale messages.
12. Update tests or snapshots affected by built-in type lists, catalog grouping, lazy registration, root/subpath exports, package-size boundaries, condition overrides, or binding format tabs. Include a root-entry check when aliases or registration helpers change so consumers are not forced onto unpublished source subpaths.
13. Run focused package tests and then broader validation when registration, descriptors, or shared Designer/Viewer behavior changed.

## Export and Print Compatibility

Every material change should be checked through Viewer because both export and print consume Viewer output:

- Exporters read `.ei-viewer-page` DOM and `renderedPages`; they should not reinterpret material schema or rerun material layout.
- Print drivers read `ViewerPrintContext.container`, `renderedPages`, `ViewerPageMetrics`, and print policy; they should not recalculate page layout.
- If a material depends on fonts, runtime data, page-aware output state, measured height, or fragment pagination, verify those are reflected in Viewer DOM before debugging exporter or printer code.
- For formal print paths, confirm material dimensions are stable in the schema unit and convert to the print system unit at the driver boundary.

If export/print fails for a custom material, first confirm its manifest was admitted by the compiled Viewer profile, then inspect render output, page plan shape, and rendered page metrics. Only then inspect exporter or driver bridge logic.

## Custom Host Checklist

For a host-owned custom material outside built-ins:

- Register Designer through `setupStore`.
- Publish the Viewer facet in the same manifest, include it in an external `MaterialPackageRegistration`, and compile the host profile before creating Viewer.
- Keep the same `type` string in both.
- Ship the default-node factory, Designer factory, Viewer extension, icons, prop schemas, and any host locale messages together.
- Verify templates using that `type` cannot reach Viewer without the host registration.
- If the host exposes page behavior UI, reuse the core schema fields `placement`, `break`, and `repeat`.

## Common Failure Signals

- Designer changes do not repaint: `renderContent()` did not subscribe to `nodeSignal`.
- Viewer shows `[material unavailable]`: profile or document admission quarantined the type because its manifest/facet was unavailable or invalid.
- Bound values do not change: renderer reads defaults instead of `context.resolvedModel`, or `viewer.open({ data })` does not match the admitted port mapping.
- Page-aware content changes page count: repeated nodes were included in layout/pagination inputs.
- Page numbers are missing: the manifest lacks `common.layout.pageRepeat='every-output-page'` or the renderer reads schema-time counts instead of the committed runtime model.
- Break rules do nothing: the page does not use `auto-sheets`, the node is fixed-position, or the node does not write behavior through `placement`, `break`, and `repeat`.
- Undo groups every pointer move separately: continuous operations need a stable `mergeKey`.
- Property panel writes to the wrong location: the descriptor needs an explicit accessor, not the default model accessor.
- Resize breaks internals: implement a `MaterialResizeAdapter` or control policy.
- Export or print output differs from preview: the material may rely on design-only DOM, unmeasured runtime size, a missing admitted Viewer facet, bad page overlay handling, or non-printable external resources.
- Custom print driver size is wrong: driver skipped unit conversion or ignored print policy and rendered page metrics.
