---
name: easyink-material-dev
description: EasyInk material development workflow and review guide. Use when implementing, extending, debugging, or reviewing EasyInk built-in or custom materials that add or change a Schema-saved visual element across MaterialNode shape, createDefaultNode defaults, registerMaterialBundle wiring, Designer and Viewer parity, orthogonal page layout behavior, page-aware overlays, fragment pagination, runtime measurement, table-data or svg-star style deep editing, datasource binding, Assistant material knowledge, tests, and i18n.
---

# EasyInk Material Dev

Use this skill to work on EasyInk materials as complete system features, not isolated render functions. A material must line up across Schema, Designer registration and editing, Viewer rendering and measurement, page layout behavior, catalog exposure, data binding, Assistant material knowledge, tests, and i18n.

If the request adds a panel, command, diagnostic subscription, host workflow, or toolbar action around existing elements without adding/changing a Schema-saved visual element, use `$easyink-contribution-dev` instead.

## First Read

Start with the local repo, not memory. Prefer these files:

- `CLAUDE.md` for project coding rules: no `structuredClone`, no Unicode emoji, workspace deps, and `pnpm build`, `pnpm lint`, `pnpm typecheck` in order for broad validation.
- `.github/architecture/24-page-layout-orthogonal-system.md` for the current page model, layout, reflow, pagination, page overlay, and editor surface rules.
- `docs/advanced/custom-materials.md` for the public custom material contract.
- `docs/advanced/schema.md` for `DocumentSchemaInput` normalization, page layers, and persistent schema fields.
- `.github/architecture/05-schema-dsl.md`, `.github/architecture/06-render-pipeline.md`, `.github/architecture/08-datasource.md`, and `docs/designer/data-binding.md` when the material consumes datasource fields, especially `DataContractBinding`.
- `.github/architecture/25-ai-assistant.md` and `docs/advanced/contributions.md` when the material should be available to Assistant generation or custom-host AI flows.
- `docs/advanced/exporters.md` and `docs/advanced/print-drivers.md` when output must be validated through export or print paths.
- `docs/designer/fonts.md` when a material exposes `fontFamily`, page font, text measurement, or print/export output that depends on host-provided fonts.
- `packages/schema/src/types.ts`, `packages/schema/src/defaults.ts`, and `packages/schema/src/validation.ts` for `MaterialNode`, binding, page layer defaults, and schema validity rules.
- `packages/core/src/font.ts`, `packages/core/src/material-data-contract.ts`, and `packages/viewer/src/font-loader.ts` for `FontProvider`, `FontManager`, material data contract resolution, font collection, caching, and host-document `@font-face` injection.
- `packages/core/src/material-extension.ts` and `packages/core/src/material-viewer.ts` for Designer and Viewer extension contracts.
- `packages/core/src/layout-strategy.ts`, `packages/core/src/reflow-engine.ts`, `packages/core/src/pagination-engine.ts`, and `packages/core/src/editor-surface-plan.ts` for runtime layout and edit-surface behavior.
- `packages/designer/src/materials/registry.ts`, `packages/prop-schemas/src/index.ts`, and `packages/designer/src/components/PropertiesPanel.vue` for registration and page behavior property schemas.
- `packages/viewer/src/runtime.ts`, `packages/viewer/src/render-surface.ts`, and `packages/viewer/src/material-registry.ts` for ordinary binding projection, measurement, pagination, repeated overlays, and renderer dispatch.
- `packages/builtin/src/designer.ts`, `packages/builtin/src/viewer.ts`, and `packages/builtin/src/bindings.ts` for built-in registration.
- `packages/shared/src/ai-generation.ts`, `packages/assistant/designer-bridge/src/material-manifest.ts`, and `packages/assistant/material-knowledge/src/from-manifest.ts` for Assistant material knowledge flow. Do not add material-specific prompt rules to Assistant packages; prompts consume the live material manifest.
- `packages/materials/text`, `packages/materials/rect`, and `packages/materials/image` for simple fixed-size and ordinary `BindingRef` patterns.
- `packages/materials/chart/bar` for material `binding.kind='data-contract'`, target data model mapping, relation resolver consumption, chart runtime diagnostics, and AI descriptor examples.
- `packages/materials/chart/custom` and `packages/materials/chart/kernel` for ordinary option binding, trusted JS option source handling, Designer lazy material loading, and full ECharts export boundaries.
- `packages/materials/page-number` for page-aware repeated overlays.
- `packages/materials/flow-row` for runtime-height flow/flex behavior.
- `packages/materials/table/data` and `packages/materials/table/kernel` for datasource drop, cell sub-properties, runtime measurement, fragment pagination, and resize side effects.
- `packages/materials/svg/star` for shape-specific deep editing.

## Workflow

1. Confirm this is a material change. Create or extend a material only when a Schema node, Designer interaction, and Viewer render path are all affected.
2. Define stable schema identity first: `TYPE`, props interface, defaults, capabilities, and `createXNode(partial?, unit?)`. Default nodes must render visibly without runtime data.
3. Normalize page assumptions. Legal `page.mode` values are `fixed` and `continuous`. New behavior should read `page.pageModel`, `page.layout`, `page.reflow`, and `page.pagination`, not add another `page.mode` branch.
4. Keep node coordinates semantic. `MaterialNode.x/y/width/height` are document coordinates; measurement, reflow, pagination, repeated overlays, and Designer projection must not silently write runtime output plans back into source schema.
5. Decide material page behavior deliberately. Use `node.placement` for flow/fixed positioning, `node.break` for auto-sheets pagination constraints, and `node.repeat.scope='every-output-page'` or Viewer `pageAware` for post-pagination overlays. Repeated/page-aware nodes must not influence flow, document height, or page count.
6. If the material can split across `auto-sheets`, implement `fragmentPaginator`. It should produce virtual fragments with `sourceNodeId` preserved and avoid mutating source schema.
7. Implement Designer rendering with `renderContent(nodeSignal, container, renderContextSignal?)`. Render immediately, subscribe to `nodeSignal`, escape user-controlled strings or use real DOM, and return deterministic cleanup. Subscribe to `renderContextSignal` only for Designer-owned transient context such as page-aware preview numbers; never persist it into Schema.
8. Implement Viewer rendering with `trustedViewerHtml()` or an `HTMLElement`. Read ordinary runtime binding results from `context.resolvedProps`. For `binding.kind='data-contract'` materials, call `resolveMaterialDataContract(contract, node.binding, context.data ?? {})`, report diagnostics, and project target records into the renderer's runtime shape. Add `measure()` only when runtime content changes physical size; use `getRenderSize()` only when wrapper size must differ from schema geometry.
9. If Viewer `measure()` or runtime data owns a dimension, add `MaterialDesignerExtension.resolveControlPolicy()` so Designer hides/disables matching geometry fields and outer resize handles. Guard behavior/deep-edit entry points that could mutate the blocked dimension.
10. Register both sides and expose the material in the catalog. Built-ins go through `packages/builtin/src/designer.ts` and `packages/builtin/src/viewer.ts`; custom hosts register through `setupStore` and `viewer.registerMaterial()`. For heavyweight Designer renderers, keep metadata synchronous and put only `MaterialDesignerExtension` loading behind `lazyFactory`; Viewer registration remains synchronous. For built-ins, adding a `DesignerMaterialRegistration` is not enough for the material panel: also add the material type to `quickMaterialTypes` or `groupedCatalog` as appropriate. A Designer-only material renders `[Unknown: type]` in Viewer; a Designer-registered material missing from the catalog will not appear in the material panel.
11. For text-like materials, expose font choice through a `font` prop schema for `node.props.fontFamily` or the relevant sub-property. Do not load or inject fonts inside material renderers; Designer and Viewer own the `FontProvider` -> `FontManager` -> `@font-face` chain.
12. Add `propSchemas` only for simple props-bag fields. Use custom `read` and `commit`, `requestPropertyPanel()`, or `SelectionType.getPropertySchema()` when a property lives outside `node.props` or changes multiple fields.
    For props that should be filled through a host/file interaction, declare `editorOptions.valueInput`, for example `{ kind: 'text-file', ... }` for local text file content or `{ kind: 'asset-url', ... }` for image/asset URLs. Let Designer's interaction bridge read or resolve the value; do not store `File`, local paths, file names, picker state, or import state in Schema, and do not implement material-local file inputs.
13. Use shared layout behavior props instead of material-local duplicates. `createLayoutBehaviorPropSchemas()` owns placement, break, and repeat UI visibility based on page strategy.
14. Add deep editing only for meaningful sub-element selection. Define `MaterialGeometry`, JSON-safe namespaced `SelectionType`, behavior middleware, decorations, and `tx.run()` mutations with stable history labels and merge keys.
15. Keep inline editors selection-scoped. Changing a cell, column, handle, or internal region must drop input mode back to selection highlight and require a fresh explicit edit entry.
16. For material-local inline toolbars, render commands only. Prefer compact icon tools with localized `title` tooltips; anchor the toolbar to the material frame top-left outside the border unless a local interaction requires otherwise.
17. Add datasource logic at the right layer. Every material registration declares `binding`: `none`, `ordinary`, `custom`, or `data-contract`. Whole-element prop binding uses ordinary `BindingRef` in `node.binding`, declares its target prop in `binding.primaryProp`, and declares `binding.formatEditor` for the supported format tabs; the projected value may be scalar or structured, such as a custom ECharts option object. Table-like internal binding owns `datasourceDrop` and cell-level `binding` or `staticBinding` and declares `binding.kind='custom'`; structured data materials declare `binding.kind='data-contract'` with a contract, declare `binding.formatEditor` or field-level `formatEditor`, and store `node.binding.kind='data-contract'` mappings from source paths to target model fields.
18. Add i18n keys for visible labels, tooltips, property labels, reject reasons, history labels, placeholders, and material-local toolbar actions. Prefer `context.t()` and `store.t()` over hardcoded strings.
19. Update material-local `src/ai.ts` when the material should be generated by Assistant. Include `knowledge` for Assistant selection, sizing, binding, composability, and scenario fitness. Built-ins register the descriptor in `packages/builtin/src/designer.ts` as `aiDescriptor`; Assistant sees it through the live Designer material manifest. Do not add material-specific prompt text to Assistant packages.
20. Test the smallest useful surface: schema defaults, Designer refresh or deep behavior, control policy, page behavior props, repeated overlay behavior, fragment pagination, Viewer render or measure, ordinary binding projection or data-contract resolution, font-dependent output, registration fallout, AI config, and i18n.

## Reference Files

Load only the reference needed for the current task:

- `references/architecture.md`: material system boundaries, current page layout pipeline, Designer/Viewer contracts, and registration.
- `references/development-flow.md`: built-in and custom material implementation checklist.
- `references/deep-editing.md`: editing session, geometry, selection, behavior, decoration, overlay, inline editor, and resize rules.
- `references/binding-viewer.md`: font loading, binding projection, runtime measurement, fragment pagination, page-aware overlays, trusted HTML, export, and print boundaries.
- `references/ai-assistant-materials.md`: Assistant manifest, `AIMaterialDescriptor.knowledge`, prompt/registry consumers, and custom material AI flow.
- `references/i18n-ai-tests.md`: i18n, validation, test rules, and brief AI review reminders.
- `references/case-studies.md`: distilled rules from `table-data`, `table-kernel`, `flow-row`, `svg-star`, `text`, and `page-number`.

## Hard Rules

- Keep Schema serializable and stable. Do not store DOM nodes, functions, transient selections, virtual preview rows, measured caches, runtime fragments, output pages, or preview-only data in Schema.
- Normalize loose host input with `normalizeDocumentSchema()` before relying on required schema fields.
- Use `continuous + continuous-paper + stack-flow + flow-y + none` for continuous paper templates.
- Do not branch material behavior solely on `page.mode` when a page layer has the actual semantics. Use page model, layout, reflow, and pagination strategy.
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
- For table-like deep editing, decoration visibility and behavior execution must share the same delegate rules for row/column resize affordances.
- Add or reuse locale keys for anything user-visible in Designer UI, including property labels and history labels.
- Assistant sees material capabilities, binding definitions, data-contract target fields, props, and AI descriptors through the current Designer store manifest. Register custom material `binding` and optional `aiDescriptor` on the Designer material entry.
- Keep AI descriptors honest: do not list props, binding modes, child support, default sizes, or scenario fitness that the Designer/Viewer implementation cannot satisfy.
- For data-contract materials, set descriptor `binding: 'data-contract'`, include mapping examples with `binding.kind='data-contract'`, and explain that relation mode is resolver-derived rather than a UI/schema mode.
- Exporters and print drivers must consume Viewer-rendered pages and `ViewerPageMetrics`; do not reimplement material layout in those layers.
