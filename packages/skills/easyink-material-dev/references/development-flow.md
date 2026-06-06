# Material Development Flow

## Built-In Material Package Shape

Follow existing packages such as `packages/materials/rect`, `packages/materials/text`, `packages/materials/page-number`, `packages/materials/svg/star`, `packages/materials/flow-row`, and `packages/materials/table/data`.

Typical files:

- `package.json`: package name, workspace deps, optional Vue peer dependency when Designer code imports Vue.
- `tsdown.config.ts`: `entry: ['src/index.ts']`, `dts: true`, `exports: true`, `publint: true`.
- `src/schema.ts`: type constant, props interface, defaults, capabilities, `createXNode()`.
- `src/designer.ts`: `createXExtension(context)`.
- `src/viewer.ts`: render plus optional `measure()`, `getRenderSize()`, or `fragmentPaginator`.
- `src/prop-schemas.ts`: material-owned property panel additions when needed.
- `src/ai.ts`: `AIMaterialDescriptor` plus optional `knowledge` for Assistant generation and MCP material config.
- `src/index.ts`: export public symbols.
- `src/*.test.ts`: focused tests for rendering, defaults, deep editing, measure, pagination, and schema behavior.

## Schema Factory Rules

In `schema.ts`:

- Export a canonical `TYPE` string and do not rename it after release.
- Use `generateId(prefix)` from `@easyink/shared` for IDs.
- Use `convertUnit(value, 'mm', unit)` when defaults are authored in mm and `unit` may differ.
- Merge defaults before partial props, and do not let `partial.props` accidentally overwrite the entire node before you normalize it.
- Default nodes must be visible without external data.
- Capabilities must match actual behavior. Do not mark `bindable`, `multiBinding`, `resizable`, `rotatable`, `supportsChildren`, `pageAware`, or `aspectLock` optimistically.
- Use `placement`, `break`, and `repeat` for node-level page behavior. Do not add new page behavior fields under `node.props`.

Pattern:

```ts
export const X_TYPE = 'x'

export interface XProps {
  content: string
}

export const X_DEFAULTS: XProps = {
  content: 'Preview',
}

export function createXNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const partialProps = (partial?.props ?? {}) as Partial<XProps>
  const partialNode = partial ? { ...partial } : undefined
  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('x'),
    type: X_TYPE,
    x: 0,
    y: 0,
    width: c(80),
    height: c(20),
    props: { ...X_DEFAULTS, ...partialProps },
    ...partialNode,
  }
}
```

For page overlays such as page numbers, defaults may set:

```ts
const overlayDefaults = {
  placement: { mode: 'fixed' },
  repeat: { scope: 'every-output-page' },
}
```

Only do this when the material is intentionally a post-pagination overlay. Ordinary headers, footers, and watermarks can also use `repeat.scope`, but they should still behave like one editable source node in Designer.

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

Designer coordinates and design-time page context come through framework-owned surface planning. Material code should use material-local coordinates in geometry and datasource drop protocols, and should not convert output page plans or `renderContextSignal` values back into schema coordinates or persisted props.

For font-bearing materials:

- Use `node.props.fontFamily` for the normal element font field when possible, because Designer and Viewer already collect that path.
- Let the property panel `font` editor own catalog display, load button state, preview suppression, and commit-time `ensureFontLoaded()`.
- Designer renderers may set `font-family` from the current prop to reflect the selected family, but they should not inject font CSS or call the host font provider.
- If a deep-edit sub-property exposes a font field, define it as `type: 'font'` through `SelectionType.getPropertySchema()` so the same loading and commit guard applies.

## Viewer Rendering Rules

Use `trustedViewerHtml()` for strings:

- Read `context.resolvedProps` for ordinary element bindings.
- For structured data materials, read `node.binding` only through `resolveMaterialDataContract(contract, node.binding, context.data ?? {})`, report diagnostics, and map target records to the renderer's runtime data.
- `renderPages()` passes a `nodeForRender` whose `props` are already projected; direct `getNodeProps(node)` is acceptable when called through the Viewer pipeline, but `context.resolvedProps` communicates runtime intent better.
- Escape runtime strings before interpolation.
- Keep Viewer output print/export stable because print and export reuse the Viewer result.
- Add `measure()` only when runtime content changes physical size.
- Add `fragmentPaginator` only when an oversized measured fragment can be meaningfully split across `auto-sheets`.
- Use `getRenderSize()` only when the wrapper dimensions must differ from schema `width` and `height`.

`measure()` runs before layout/reflow/pagination. It should return document-unit size and must not mutate the source schema. `render()` must use the same layout assumptions as `measure()`.

Font-dependent Viewer behavior:

- Viewer loads and injects fonts before `measure()` and `render()`, so text measurement can assume requested fonts have been attempted.
- Material `measure()` must still tolerate browser fallback metrics when a font failed to load.
- Material `render()` should emit only the `font-family` declaration needed for its own content. Page-level inheritance is handled by the Viewer page root from `schema.page.font`.
- If a material stores fonts in nested data, add or update tests around `collectFontFamilies()` so preloading still happens before measurement and render.

## Page Layout and Behavior Rules

New material work should respect the orthogonal page layers:

- `page.pageModel` describes media.
- `page.layout` describes how elements enter document coordinates.
- `page.reflow` describes whether measured flow elements move along Y.
- `page.pagination` describes how document coordinates become output sheets.

Do not implement material-specific page planning. Materials may provide:

- stable document geometry,
- optional runtime `measure()` results,
- optional `fragmentPaginator` for splittable content,
- optional `pageAware` default repetition,
- and node-level `placement`, `break`, or `repeat` defaults.

The Viewer owns layout, pagination, page overlay cloning, page number context, and `ViewerPageMetrics`.

## Designer Control Policy Rules

`capabilities` are coarse static declarations. Use `MaterialDesignerExtension.resolveControlPolicy()` for node-specific or material-specific Designer controls.

Use a control policy when:

- runtime data or Viewer `measure()` owns an element dimension,
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

Use `propSchemas` for simple `node.props` fields:

- `string`, `text`, `textarea`, `number`, `color`, `switch`, `enum`, `font`, `image`, etc.
- Nested props can use dotted keys such as `typography.fontSize`.
- Labels should be i18n keys.
- Group names should be one of the groups mapped in `PropertiesPanel.vue` or an intentionally visible custom group.

For font properties:

- Use `type: 'font'` instead of a string enum or free text field when the value should be selected from the host font catalog.
- Keep the normal key as `fontFamily` when possible. `collectFontFamilies()` currently scans `schema.page.font` and `node.props.fontFamily`.
- Do not implement custom font preload logic in material-local property editors. The shared property panel prevents preview writes for font fields, loads the family on commit, and rolls back when loading fails.
- The empty string means default/inherited font. Do not replace it with a hardcoded browser font unless the material intentionally owns that default.

Material package `src/prop-schemas.ts` files own the full Designer property schema list for that material. `@easyink/prop-schemas` only provides shared option arrays and `createLayoutBehaviorPropSchemas()`; it must not know built-in material types or return material-specific schema lists.

Base layout behavior props are appended by `PropertiesPanel.vue` through `createLayoutBehaviorPropSchemas({ page })`. Do not duplicate placement, break, or repeat controls in material packages unless the material has a truly different sub-selection UI.

Use a custom `read` and `commit` when the property is outside `node.props` or has side effects. `table-data` `showHeader` and `showFooter` are the model example: they live on `node.table`, flush active edits, potentially exit an editing session, and execute `UpdateTableVisibilityCommand`.

Use `requestPropertyPanel()` or `SelectionType.getPropertySchema()` when:

- The property applies to a sub-selection.
- A write touches multiple fields.
- The editor is context-aware or temporary.
- The data path is not the normal props bag.

## Built-In Registry Checklist

For a new built-in material:

1. Create the package under `packages/materials/...`.
2. Ensure `pnpm-workspace.yaml` already includes the path pattern. SVG subpackages belong under `packages/materials/svg/*`.
3. Add package dependency to `packages/builtin/package.json`.
4. Import and register Designer entry in `packages/builtin/src/designer.ts`.
5. Import and register Viewer entry in `packages/builtin/src/viewer.ts`.
6. Pass the material-local AI descriptor as `aiDescriptor` in Designer registration. `packages/builtin/src/ai.ts` is derived from the Designer bundle; do not hand-maintain a second descriptor list.
7. Add `src/locale.ts` in the material package and pass it as `localeMessages` on the Designer material entry. Keep `@easyink/locales` for Designer common strings only.
8. Update tests or snapshots affected by built-in type lists.
9. Run focused package tests and then broader validation when registration, descriptors, or shared Designer/Viewer behavior changed.

## Export and Print Compatibility

Every material change should be checked through Viewer because both export and print consume Viewer output:

- Exporters read `.ei-viewer-page` DOM and `renderedPages`; they should not reinterpret material schema or rerun material layout.
- Print drivers read `ViewerPrintContext.container`, `renderedPages`, `ViewerPageMetrics`, and print policy; they should not recalculate page layout.
- If a material depends on fonts, runtime data, page-aware props, measured height, or fragment pagination, verify those are reflected in Viewer DOM before debugging exporter or printer code.
- For formal print paths, confirm material dimensions are stable in the schema unit and convert to the print system unit at the driver boundary.

If export/print fails for a custom material, first confirm Viewer registration, render output, page plan shape, and rendered page metrics. Only then inspect exporter or driver bridge logic.

## Custom Host Checklist

For a host-owned custom material outside built-ins:

- Register Designer through `setupStore`.
- Register Viewer through the created Viewer runtime.
- Keep the same `type` string in both.
- Ship the default-node factory, Designer factory, Viewer extension, icons, prop schemas, and any host locale messages together.
- Verify templates using that `type` cannot reach Viewer without the host registration.
- If the host exposes page behavior UI, reuse the core schema fields `placement`, `break`, and `repeat`.

## Common Failure Signals

- Designer changes do not repaint: `renderContent()` did not subscribe to `nodeSignal`.
- Viewer shows `[Unknown: type]`: Viewer registration is missing.
- Bound values do not change: renderer reads defaults instead of resolved props, or `viewer.open({ data })` data shape does not match `fieldPath`.
- Page-aware content changes page count: repeated nodes were included in layout/pagination inputs.
- Page numbers are missing: the material lacks `repeat.scope='every-output-page'`, Viewer `pageAware`, or reads schema-time counts instead of `__pageNumber` / `__totalPages`.
- Break rules do nothing: the page does not use `auto-sheets`, the node is fixed-position, or the behavior is still stored only in legacy props.
- Undo groups every pointer move separately: continuous operations need a stable `mergeKey`.
- Property panel writes to the wrong location: the schema needs custom `read` and `commit`, not a plain props-bag schema.
- Resize breaks internals: implement a `MaterialResizeAdapter` or control policy.
- Export or print output differs from preview: the material may rely on design-only DOM, unmeasured runtime size, missing Viewer registration, bad page overlay handling, or non-printable external resources.
- Custom print driver size is wrong: driver skipped unit conversion or ignored print policy and rendered page metrics.
