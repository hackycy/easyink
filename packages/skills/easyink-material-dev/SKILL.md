---
name: easyink-material-dev
description: EasyInk material development and review guide. Use when implementing, extending, debugging, or reviewing built-in or custom EasyInk materials that add or change a Schema-saved visual element across MaterialNode shape, default-node factories, Designer registration/rendering/editing, Viewer registration/rendering/measurement, orthogonal page layout behavior, repeated overlays, fragment pagination, datasource binding, Assistant material knowledge, tests, and i18n.
---

# EasyInk Material Dev

Use this skill to work on EasyInk materials as complete system features, not isolated render functions. A material change is only done when Schema, Designer, Viewer, page behavior, binding, catalog exposure, Assistant knowledge, tests, and locale coverage still agree.

If the request adds a panel, command, diagnostic subscription, host workflow, or toolbar action around existing elements without adding/changing a Schema-saved visual element, use `$easyink-contribution-dev` instead.

## First Read

Start from the current repo, not memory. Always read the touched material package plus the closest existing material with the same behavior.

Core files:

- `CLAUDE.md` for project coding rules: no `structuredClone`, no Unicode emoji, workspace deps, and `pnpm build`, `pnpm lint`, `pnpm typecheck` in order for broad validation.
- `.github/architecture/24-page-layout-orthogonal-system.md` for the current page model, layout, reflow, pagination, page overlay, and editor surface rules.
- `docs/advanced/custom-materials.md` for the public custom material contract.
- `docs/advanced/schema.md` for `DocumentSchemaInput` normalization, page layers, and persistent schema fields.
- `packages/schema/src/types.ts`, `packages/schema/src/defaults.ts`, and `packages/schema/src/validation.ts` for `MaterialNode`, binding, page layer defaults, and schema validity rules.
- `packages/core/src/font.ts`, `packages/core/src/material-data-contract.ts`, and `packages/viewer/src/font-loader.ts` for `FontProvider`, `FontManager`, material data contract resolution, font collection, caching, and host-document `@font-face` injection.
- `packages/core/src/material-extension.ts` and `packages/core/src/material-viewer.ts` for Designer and Viewer extension contracts.
- `packages/core/src/layout-strategy.ts`, `packages/core/src/reflow-engine.ts`, `packages/core/src/pagination-engine.ts`, and `packages/core/src/editor-surface-plan.ts` for runtime layout and edit-surface behavior.
- `packages/designer/src/materials/registry.ts`, `packages/prop-schemas/src/index.ts`, and `packages/designer/src/components/PropertiesPanel.vue` for registration and page behavior property schemas.
- `packages/viewer/src/runtime.ts`, `packages/viewer/src/render-surface.ts`, and `packages/viewer/src/material-registry.ts` for ordinary binding projection, measurement, pagination, repeated overlays, and renderer dispatch.
- `packages/builtin/src/designer.ts`, `packages/builtin/src/viewer.ts`, and `packages/builtin/src/bindings.ts` for built-in registration.
- `packages/shared/src/ai-generation.ts`, `packages/assistant/designer-bridge/src/material-manifest.ts`, `packages/assistant/orchestrator/src/prompts.ts`, and `packages/assistant/material-knowledge/src/from-manifest.ts` for Assistant material knowledge flow. Do not add material-specific prompt rules to Assistant packages; Assistant uses the live material manifest to build a lightweight Material Router index, then expands only the selected manifest for layout/schema/repair prompts.

Task-specific references:

- `.github/architecture/05-schema-dsl.md`, `.github/architecture/06-render-pipeline.md`, `.github/architecture/08-datasource.md`, and `docs/designer/data-binding.md` when the material consumes datasource fields, especially `DataContractBinding`.
- `.github/architecture/25-ai-assistant.md` and `docs/advanced/contributions.md` when the material should be available to Assistant generation or custom-host AI flows.
- `docs/advanced/exporters.md` and `docs/advanced/print-drivers.md` when output must be validated through export or print paths.
- `docs/designer/fonts.md` when a material exposes `fontFamily`, page font, text measurement, or print/export output that depends on host-provided fonts.
- `packages/materials/text`, `packages/materials/rect`, and `packages/materials/image` for simple fixed-size and ordinary `BindingRef` patterns.
- `packages/materials/chart/bar` for material `binding.kind='data-contract'`, target data model mapping, relation resolver consumption, chart runtime diagnostics, and AI descriptor examples.
- `packages/materials/chart/custom` and `packages/materials/chart/kernel` for ordinary option binding, trusted JS option source handling, Designer lazy material loading, and full ECharts export boundaries.
- `packages/materials/page-number` for page-aware repeated overlays.
- `packages/materials/flow-row` for runtime-height flow/flex behavior.
- `packages/materials/table/data` and `packages/materials/table/kernel` for datasource drop, cell sub-properties, runtime measurement, fragment pagination, and resize side effects.
- `packages/materials/svg/star` for shape-specific deep editing.

## Workflow

1. Confirm this is a material change: a Schema node, Designer interaction or registration, and Viewer render path are affected.
2. Define schema identity first: canonical `TYPE`, props interface, defaults, capabilities, and `createXNode(partial?, unit?)`. Default nodes must be visible without runtime data.
3. Keep Schema serializable. Persistent semantics belong in `MaterialNode`, `node.props`, `node.binding`, `node.placement`, `node.break`, `node.repeat`, `node.table`, or `extensions`; runtime plans, DOM refs, preview rows, measurements, loaded fonts, and editing state do not.
4. Normalize page assumptions. Legal `page.mode` values are `fixed` and `continuous`, but new behavior should read the owning page strategy field: `page.pageModel`, `page.layout`, `page.reflow`, or `page.pagination`.
5. Keep node geometry semantic. `MaterialNode.x/y/width/height` are document coordinates; Designer projection, measurement, reflow, pagination, and overlay cloning must not silently write runtime output plans back to source schema.
6. Decide page behavior deliberately. Use `node.placement` for flow/fixed positioning, `node.break` for `auto-sheets` constraints, and `node.repeat.scope='every-output-page'` or Viewer `pageAware` only for post-pagination element overlays. Repeated/page-aware nodes must not affect flow, document height, or page count. Treat `page.layers` as a page-level render-layer boundary, not a material feature hook: use it only for whole-page, non-editable, non-bindable decorations such as text watermarks. Use ordinary elements plus `repeat.scope` for editable headers, footers, logos, page numbers, data-bound repeated content, or editable watermarks.
7. Implement Designer rendering with `renderContent(nodeSignal, container, renderContextSignal?)`: render immediately, subscribe to `nodeSignal`, optionally subscribe to transient render context, escape user-controlled strings or use DOM text APIs, and return deterministic cleanup.
8. Implement Viewer rendering with `trustedViewerHtml()` or an `HTMLElement`. Ordinary binding results are already projected into `context.resolvedProps` and the render node's props. `data-contract` materials must call `resolveMaterialDataContract(contract, node.binding, context.data ?? {})` and report diagnostics.
9. Add `measure()` only when runtime content changes physical size. Add `fragmentPaginator` only when the measured material can split across `auto-sheets`; preserve `sourceNodeId` and avoid source schema mutation.
10. If measurement or runtime data owns a dimension, return `MaterialDesignerExtension.resolveControlPolicy()` and also guard any deep-edit or behavior path that could mutate the blocked dimension.
11. Register both sides. Built-ins update `packages/builtin/src/designer.ts`, `packages/builtin/src/viewer.ts`, `packages/builtin/src/bindings.ts`, and `packages/builtin/package.json`. Custom hosts register Designer through `setupStore` and Viewer through `viewer.registerMaterial(type, binding, extension)`.
12. Expose catalog entries deliberately. Built-ins visible in the material panel must appear in `quickMaterialTypes` or `groupedCatalog`; Designer registration alone is not panel exposure. A Designer-only material renders `[Unknown: type]` in Viewer.
13. Keep heavyweight Designer rendering behind `lazyFactory` only. Material type, binding definition, prop schemas, locale messages, catalog metadata, default factory, and AI descriptor stay synchronous; Viewer registration stays synchronous.
14. Add `propSchemas` for simple props-bag fields. Use custom `read` and `commit`, `requestPropertyPanel()`, or `SelectionType.getPropertySchema()` when data lives outside `node.props` or a write touches multiple fields. Use `editorOptions.valueInput` for host/file input; do not store `File`, local paths, file names, picker state, or import state in Schema.
15. Use shared layout behavior props instead of material-local duplicates. `createLayoutBehaviorPropSchemas()` owns placement, break, and repeat UI visibility based on page strategy.
16. Add deep editing only for meaningful sub-element selection. Define `MaterialGeometry`, JSON-safe namespaced `SelectionType`, behavior middleware, decorations, and `tx.run()` mutations with stable history labels and merge keys. Inline editors must be selection-scoped.
17. Put datasource logic at the right layer. Whole-element prop binding uses ordinary `BindingRef` plus `binding.primaryProp`; table-like internal binding uses `binding.kind='custom'`, `datasourceDrop`, and cell-level `binding` or `staticBinding`; structured charts use `binding.kind='data-contract'` plus target-field mappings in `node.binding.kind='data-contract'`.
18. For font-bearing materials, expose a `font` prop schema for `node.props.fontFamily` or the relevant sub-property. Material renderers may emit `font-family` CSS from resolved props, but Designer and Viewer own `FontProvider` -> `FontManager` -> `@font-face`.
19. Add i18n keys for visible labels, tooltips, property labels, reject reasons, history labels, placeholders, and material-local toolbar actions. Prefer `context.t()` and `store.t()` over hardcoded strings.
20. Update material-local `src/ai.ts` when Assistant should generate or select the material. Register the descriptor as `aiDescriptor` on the Designer material entry; Assistant sees it through the live Designer material manifest, routes against lightweight descriptor knowledge first, and only loads detailed usage/schema rules when the material is selected.
21. Test the smallest useful surface: default factory, Designer repaint/deep behavior, control policy, page behavior props, repeated overlays, fragment pagination, Viewer render/measure, binding projection or data-contract resolution, font-dependent output, registration/catalog fallout, AI manifest, and i18n.

## Reference Files

Load only the reference needed for the current task:

- `references/architecture.md`: material system boundaries, current page layout pipeline, Designer/Viewer contracts, and registration.
- `references/development-flow.md`: built-in and custom material implementation checklist.
- `references/deep-editing.md`: editing session, geometry, selection, behavior, decoration, overlay, inline editor, and resize rules.
- `references/binding-viewer.md`: font loading, binding projection, runtime measurement, fragment pagination, page-aware overlays, trusted HTML, export, and print boundaries.
- `references/ai-assistant-materials.md`: Assistant manifest, `AIMaterialDescriptor.knowledge`, Material Router selection, selected-manifest prompt consumers, registry consumers, and custom material AI flow.
- `references/i18n-ai-tests.md`: i18n, validation, test rules, and brief AI review reminders.
- `references/case-studies.md`: distilled rules from `table-data`, `table-kernel`, `flow-row`, `svg-star`, `text`, and `page-number`.

## Hard Rules

- Keep Schema serializable and stable. Do not store DOM nodes, functions, transient selections, virtual preview rows, measured caches, runtime fragments, output pages, or preview-only data in Schema.
- Normalize loose host input with `normalizeDocumentSchema()` before relying on required schema fields.
- Use `continuous + continuous-paper + stack-flow + flow-y + none` for continuous paper templates.
- Do not branch material behavior solely on `page.mode`; read the owning page strategy field instead: `page.pageModel`, `page.layout`, `page.reflow`, or `page.pagination`.
- Designer and Viewer must both know the material type.
- Built-in materials that should be visible in the material panel must be present in `quickMaterialTypes` or `groupedCatalog`; test that catalog entries point to registered materials and that the expected panel group includes the new type.
- Use `convertUnit()` inside default-node factories when default physical sizes are authored in mm.
- Escape all user-controlled strings before HTML interpolation. Viewer HTML must be wrapped with `trustedViewerHtml()`.
- Use `context.resolvedProps` or `node.props` after Viewer projection; do not hand-resolve ordinary `node.binding` inside material renderers. The exception is `DataContractBinding`: structured materials consume it through `resolveMaterialDataContract()`, not through ad hoc `context.data` walking.
- For data-contract materials, contract describes the target data model and binding describes source mappings. Preserve complete `select.path` values and let the relation resolver infer shared records or index alignment.
- `binding.formatEditor` is a material capability declaration, not Schema data. Open `preset` only when the Viewer/runtime consumes preset formatting for that material; svg/custom and chart-like data-contract materials should generally expose only `custom`.
- `lazyFactory` is Designer-only and should only load the heavy `MaterialDesignerExtension`. Do not hide material type, binding definition, prop schemas, locale messages, catalog metadata, or AI descriptor behind the lazy chunk.
- If a material stores JS source in Schema, store source strings only, document it as trusted template code, convert runtime failures into diagnostics, and do not describe the implementation as a sandbox. Custom ECharts `optionCode` is the current reference.
- Use `tx.run()` for deep-edit mutations so history, patches, and undo work. Use `mergeKey` for continuous drag/resize edits.
- Keep selection payloads JSON-safe and namespaced, such as `table.cell` or `svg-star.control`.
- Bind inline input/editor session meta to the current sub-selection.
- Runtime-height materials must declare a Designer control policy and must not expose any outer or internal path that mutates runtime-owned height.
- Preview-only rows remain outside Schema. If a runtime-height material shows Designer preview rows, keep them display-only.
- Materials may store font family strings in Schema, but must not store font sources, `@font-face` CSS, loaded state, DOM style nodes, or provider results.
- Designer font edits must go through the property panel font flow so `ensureFontLoaded()` succeeds before the font value is committed to Schema.
- Viewer font loading happens before binding, measurement, layout, pagination, and DOM render. Material renderers should only emit `font-family` CSS from resolved props or inherited page font; they should not call `FontProvider` directly.
- Material-local toolbars should be compact command toolbars, not identity badges.
- Material Designer UI must not call browser-native confirmation APIs. Destructive host UX belongs behind Designer's interaction bridge or a Contribution-level workflow.
- Repeated/page-aware overlays are post-pagination page overlays. They must not affect flow, document height, page count, output sheets, or source-node editability.
- `page.layers` is a page-level render-layer array, not a `MaterialNode` extension point and not a material capability surface. Use `page.layers[]` only for whole-page, non-editable, non-bindable decorations such as text watermarks. Use ordinary elements plus `repeat.scope` for editable headers, footers, logos, page numbers, data-bound repeated content, or editable watermarks.
- For table-like deep editing, decoration visibility and behavior execution must share the same delegate rules for row/column resize affordances.
- Add or reuse locale keys for anything user-visible in Designer UI, including property labels and history labels.
- Assistant sees material capabilities, binding definitions, data-contract target fields, props, and AI descriptors through the current Designer store manifest. Register custom material `binding` and optional `aiDescriptor` on the Designer material entry.
- Keep AI descriptors honest: do not list props, binding modes, child support, default sizes, or scenario fitness that the Designer/Viewer implementation cannot satisfy.
- For data-contract materials, set descriptor `binding: 'data-contract'`, include mapping examples with `binding.kind='data-contract'`, and explain that relation mode is resolver-derived rather than a UI/schema mode.
- Exporters and print drivers must consume Viewer-rendered pages and `ViewerPageMetrics`; do not reimplement material layout in those layers.
