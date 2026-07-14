# Complex Material Case Studies

## table-data

Source files:

- `packages/materials/table/data/src/schema.ts`
- `packages/materials/table/data/src/designer.ts`
- `packages/materials/table/data/src/prop-schemas.ts`
- `packages/materials/table/data/src/viewer.ts`
- `packages/materials/table/data/src/layout.ts`
- `packages/materials/table/data/src/ai.ts`
- `packages/materials/table/kernel/src/geometry.ts`
- `packages/materials/table/kernel/src/commands.ts`
- `packages/materials/table/kernel/src/resize-adapter.ts`
- `packages/materials/table/kernel/src/measure.ts`

Key rules:

- Schema type is `table-data`.
- Node is a `TableNode` with `table.kind = 'data'`.
- Topology stores normalized column ratios and real rows only.
- Default rows are `header`, `repeat-template`, and `footer`.
- Header/footer visibility is stored on `node.table`, not `node.props`.
- Designer preview injects virtual placeholder rows after repeat-template, but those rows are display-only.
- Viewer expands the repeat-template row from runtime data.
- Runtime measurement owns final table height.
- Designer declares runtime height through `resolveControlPolicy()`: `height` is disabled and vertical outer resize handles are hidden.
- Cell-level binding uses `binding` for repeat-template cells and `staticBinding` for fixed cells.
- The Viewer layout facet includes table measurement, monotonic row break opportunities, and fragment contribution.

Designer complexity:

- `createTableDataExtension()` composes common table-kernel geometry, selection, keyboard nav, edit behavior, resize behavior, toolbar commands, and decorations.
- Hidden header/footer rows use a hidden mask so hit tests, keyboard navigation, placeholder geometry, and rendering agree.
- Row resize is disabled for table-data because runtime measurement owns height.
- Designer placeholder rows are display-only and must not expose a height-changing drag path.
- `datasourceDrop` rejects hidden rows and mismatched collection prefixes.
- `sectionFilter` hides element-level binding because binding belongs to cells.
- `prop-schemas.ts` uses custom commit for `showHeader` and `showFooter` because the fields live on `node.table` and must flush or exit active cell editing.

Viewer complexity:

- `measureTableData()` expands runtime rows and computes auto heights before layout/reflow/pagination.
- `renderTableData()` reuses measured layout through a WeakMap because the render node has the measured height.
- Empty arrays render a single placeholder row; they do not mutate Schema.
- Static rows resolve `staticBinding` and repeat rows resolve item-level `binding`.
- The table fragment adapter contributes the exact row range requested by core for `auto-sheets`, preserving instance identity and keeping source schema untouched.

What to copy:

- Reuse shared kernels when a material family has common editing logic.
- Keep preview-only Designer affordances outside Schema.
- Make hidden/virtual row semantics consistent across render, geometry, drop, keyboard behavior, and resize decoration.
- Keep row/column boundary handles in the shared table-kernel model, but gate them through material delegates.
- Put material-specific resize policy in delegates and cover the rules with pure helper tests.
- Use `resolveControlPolicy()` for outer Designer controls when runtime measurement owns height.
- Use custom property commits for non-props fields.
- Publish break opportunities and fragment contributions; core owns document page-break selection.

What not to copy blindly:

- Do not add table-level binding for repeat data; table-data intentionally stores absolute paths per repeat cell.
- Do not use table-data's measurement pattern for fixed-size materials.
- Do not create virtual rows in Schema to make Designer preview easier.
- Do not re-enable outer height resize or `H` panel edits for runtime-height table-data.

## table-kernel

`table-kernel` is not a single material. It is a shared implementation layer for `table-static` and `table-data`.

It owns:

- Table HTML rendering.
- Geometry and hit-testing.
- Cell selection type.
- Cell sub-property schema.
- Cell toolbar.
- Keyboard navigation and inline editing behavior.
- Table command behavior for insert, remove, merge, split, and alignment.
- Row and column resize behavior.
- Resize side-effect adapter.
- Measurement utilities.

Design lesson:

- Extract a kernel only when multiple materials share real editing semantics.
- Keep material-specific decisions in delegates, such as table kind, hidden-row mask, placeholder row count, unit, i18n, and node lookup.
- Kernel resize behavior should operate on rendered absolute sizes, normalize ratios before width math, clamp minimum row/column sizes, and then write back schema ratios/heights plus the material frame dimensions.
- Handle decoration and behavior must agree: if the decoration shows a right/bottom edge handle, behavior must accept the same index through `canResizeColumn` / `canResizeRow`.
- Virtual preview rows are represented outside Schema. Only schema-height materials should map preview-row gestures to a semantic row; runtime-height materials keep preview rows display-only.
- Let the kernel stay framework-agnostic except where Vue decorations are deliberately part of Designer UI.

## flow-row / flex-row

Key rules:

- Schema type is `flow-row`.
- Columns live in `node.props.columns`; column selection uses `flow-row.column`.
- Viewer can expand collection-bound data and `measureFlowRow()` computes runtime height.
- Designer declares fixed runtime height through `resolveControlPolicy()`, even when current sample content is static.
- Width remains editable so columns can reflow; height is runtime-owned.

Designer lessons:

- Use shared Designer control policy rather than checking `flow-row` in canvas or property-panel components.
- Disable `height` and hide vertical outer resize handles through policy.
- Keep column editing and column width gestures selection-scoped; changing columns must leave text input mode.
- Tests should assert the fixed policy and the runtime repeat detection helper separately if the helper remains exported for Viewer or AI use.

Viewer lessons:

- Measured runtime height participates in the page layout pipeline.
- In continuous paper, flow nodes after a taller flow-row may be pushed by `flow-y`.
- In fixed-position nodes, measurement changes size but the node does not trigger break constraints.

## chart-custom

Use as the custom ECharts reference:

- Schema type is `chart-custom`.
- Props store `optionCode`, `option`, and visual props such as `backgroundColor`.
- `optionCode` is JavaScript source text, not a function value. Keep Schema JSON-safe.
- Binding is ordinary: `binding.kind='ordinary'`, `primaryProp='option'`, and `formatEditor` exposes only `custom`.
- Bound option values may be objects or JSON strings. Viewer reads them from `context.resolvedModel.option`, prefers them when present, and falls back to `optionCode` when a binding has no value yet.
- Code-authored options support body and expression styles such as `return { ... }`, `({ ... })`, `(ctx) => ({ ... })`, and `function option(ctx) { ... }`.
- Option code is trusted template code. It is not a sandbox; failures become warning diagnostics and fall back to a visible default option.
- Designer registration keeps metadata synchronous and loads the heavy renderer through `lazyFactory`.
- Viewer registration is synchronous and renders SVG through `@easyink/material-chart-kernel/full`.
- `@easyink/material-chart-kernel` has a lightweight default entry for built-in chart types and a `./full` subpath for the complete ECharts package.

What to copy:

- Use ordinary binding for whole-object option projection when the data source already returns the material runtime configuration.
- Use `type: 'code'` prop schemas with editor sizing and JavaScript language for authored option source.
- Keep heavy Designer rendering behind `lazyFactory` while leaving catalog, binding, prop schemas, locale messages, and AI descriptor immediately available.
- Convert option execution and JSON parsing errors into diagnostics instead of throwing through Viewer render.

What not to copy blindly:

- Do not use JS source props for untrusted template imports.
- Do not hide material metadata in the lazy Designer chunk.
- Do not use `DataContractBinding` when the material wants one complete runtime option object rather than a target record model.

## svg-star

Source files:

- `packages/materials/svg/star/src/schema.ts`
- `packages/materials/svg/star/src/rendering.ts`
- `packages/materials/svg/star/src/designer.ts`
- `packages/materials/svg/star/src/viewer.ts`
- `packages/materials/svg/star/src/prop-schemas.ts`
- `packages/materials/svg/star/src/star.test.ts`

Key rules:

- Schema stores shape props: `fillColor`, `borderWidth`, `borderColor`, `starPoints`, `starInnerRatio`, `starRotation`.
- Rendering logic is shared by Designer and Viewer through `buildStarSvgMarkup()`.
- Geometry knows how to hit-test the inner-radius handle and map selected handles to document-space rects.
- Selection type is `svg-star.control`.
- Decoration renders handle UI and dispatches commands.
- Behavior handles `enter-edit`, handle selection, and drag adjustment.
- Continuous handle edits use `mergeKey`.
- `session.meta.starInnerRatio` keeps decoration feedback responsive while edits are active.

What to copy:

- Share pure rendering and geometry math between Designer and Viewer when possible.
- Keep handle adjustment as commands dispatched from decoration to behavior.
- Use `SelectionType.getPropertySchema()` for handle-specific properties.
- Clamp shape-specific numeric values in both property writes and pointer-derived updates.

What to improve when touching it:

- Some visible labels are hardcoded Chinese strings. For new work, add locale keys and use `context.t()` or schema labels with i18n keys.

## text

`text` is the clean simple-material baseline:

- Schema defaults are stable and visible.
- Designer displays binding labels as `{#label}` and placeholders through `context.t()`.
- Viewer renders resolved `content` with prefix/suffix.
- `measureText()` supports auto-height text behavior when text content changes size.
- Styles are shared through pure rendering helpers.
- `fontFamily` is a plain Schema string consumed by shared Designer/Viewer font loading; the material renderer only emits the CSS declaration.
- No deep editing is needed.

Copy this pattern for mostly fixed-size, props-bag-only materials.

## page-number

Use as the page-aware reference:

- `createPageNumberNode()` sets `placement: { mode: 'fixed' }` and `repeat: { scope: 'every-output-page' }`.
- The manifest sets `common.layout.pageRepeat='every-output-page'`, making default repetition explicit.
- Runtime removes it from layout inputs, replicates it after pagination, and injects `__pageNumber` and `__totalPages`.
- Rendering uses resolved runtime props, not schema-time page counts.
- Designer shows one editable source node and non-interactive repeat previews on other pages. It uses `renderContextSignal.page` to display real design-time page numbers for both source and preview instances, while keeping those values out of Schema.

Use this pattern for editable or data-bound watermarks, repeated headers, and repeated footers. Ensure repeated overlays do not influence flow, continuous-paper height, output page count, or source-node editability.
