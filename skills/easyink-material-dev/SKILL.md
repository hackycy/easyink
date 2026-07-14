---
name: easyink-material-dev
description: EasyInk material development and review guide. Use when implementing, extending, debugging, or reviewing built-in or custom EasyInk materials that add or change a Schema-saved visual element across MaterialNode shape, default-node factories, Designer authoring, compiled-profile facet activation, Viewer rendering/layout measurement, orthogonal page layout behavior, repeated overlays, fragment pagination, datasource binding, Assistant material knowledge, tests, and i18n.
---

# EasyInk Material Dev

Use this skill to work on EasyInk materials as complete system features, not isolated render functions. A material change is only done when Schema, Designer, Viewer, page behavior, binding, catalog exposure, Assistant knowledge, tests, and locale coverage still agree.

If the request adds a panel, command, diagnostic subscription, host workflow, or toolbar action around existing elements without adding/changing a Schema-saved visual element, use `$easyink-contribution-dev` instead.

## First Read

Start from the current repo, not memory. Always read the touched material package plus the closest existing material with the same behavior.

Core files:

- `CLAUDE.md` for project coding rules: no `structuredClone`, no Unicode emoji, workspace deps, and `pnpm build`, `pnpm lint`, `pnpm typecheck` in order for broad validation.
- `.github/architecture/24-page-layout-orthogonal-system.md` for the current page model, layout, reflow, pagination, page overlay, and editor surface rules.
- `.github/architecture/26-conditional-rendering.md` for the default material condition capability, `remove/reserve` semantics, and when a material may explicitly disable or narrow condition behavior.
- `docs/advanced/custom-materials.md` for the public custom material contract.
- `docs/advanced/schema.md` for `DocumentSchemaInput` normalization, page layers, and persistent schema fields.
- `packages/schema/src/types.ts`, `packages/schema/src/defaults.ts`, and `packages/schema/src/validation.ts` for `MaterialNode`, binding, page layer defaults, and schema validity rules.
- `packages/core/src/font.ts`, `packages/core/src/material-data-contract.ts`, and `packages/viewer/src/font-loader.ts` for `FontProvider`, `FontManager`, material data contract resolution, font collection, caching, and host-document `@font-face` injection.
- `packages/core/src/material-extension.ts` and `packages/core/src/material-viewer.ts` for Designer and Viewer extension contracts.
- `packages/core/src/layout-strategy.ts`, `packages/core/src/reflow-engine.ts`, `packages/core/src/pagination-engine.ts`, and `packages/core/src/editor-surface-plan.ts` for runtime layout and edit-surface behavior.
- `packages/core/src/material-profile.ts`, `packages/core/src/material-manifest.ts`, and `packages/prop-schemas/src/index.ts` for profile compilation, manifest contracts, and page behavior property schemas.
- `packages/viewer/src/runtime.ts`, `packages/viewer/src/render-surface.ts`, and `packages/viewer/src/material-runtime.ts` for profile admission, measurement, pagination, repeated overlays, and facet dispatch.
- `packages/builtin/src/index.ts`, `packages/builtin/src/all.ts`, `packages/builtin/src/basic.ts`, `packages/builtin/src/none.ts`, and `packages/builtin/package.json` for immutable built-in material packages and profile entry points.
- `packages/shared/src/ai-generation.ts`, `packages/assistant/designer-bridge/src/material-manifest.ts`, `packages/assistant/orchestrator/src/prompts.ts`, and `packages/assistant/material-knowledge/src/from-manifest.ts` for Assistant material knowledge flow. Do not add material-specific prompt rules to Assistant packages; Assistant uses the live material manifest to build a lightweight Material Router index, then expands only the selected manifest for layout/schema/repair prompts.

Task-specific references:

- `.github/architecture/05-schema-dsl.md`, `.github/architecture/06-render-pipeline.md`, `.github/architecture/08-datasource.md`, and `docs/designer/data-binding.md` when the material consumes datasource fields, especially `DataContractBinding`.
- `.github/architecture/25-ai-assistant.md` and `docs/advanced/contributions.md` when the material should be available to Assistant generation or custom-host AI flows.
- `docs/advanced/exporters.md` and `docs/advanced/print-drivers.md` when output must be validated through export or print paths.
- `docs/designer/fonts.md` when a material exposes `fontFamily`, page font, text measurement, or print/export output that depends on host-provided fonts.
- `packages/materials/text`, `packages/materials/rect`, and `packages/materials/image` for simple fixed-size and ordinary `BindingRef` patterns.
- `packages/materials/chart/bar` for manifest `common.binding.kind='ports'` with a data contract, target data model mapping, relation resolver consumption, chart runtime diagnostics, and AI descriptor examples.
- `packages/materials/chart/custom` and `packages/materials/chart/kernel` for ordinary option binding, trusted JS option source handling, Designer lazy material loading, and full ECharts export boundaries.
- `packages/materials/page-number` for page-aware repeated overlays.
- `packages/materials/flow-row` for runtime-height flow/flex behavior.
- `packages/materials/table/data` and `packages/materials/table/kernel` for datasource drop, cell sub-properties, runtime measurement, fragment pagination, and resize side effects.
- `packages/materials/svg/star` for shape-specific deep editing.

## Workflow

1. Confirm this is a material change: a Schema node, Designer interaction, and compiled-profile Viewer facet are affected.
2. Define schema identity first: canonical `TYPE`, model interface, defaults, capabilities, schema adapter version, and `createXNode(partial?, unit?)`. Default nodes must be visible without runtime data.
3. Keep Schema serializable. Persistent semantics belong in `MaterialNode` fields such as `model`, `bindings`, `output`, `slots`, and `extensions`; runtime plans, DOM refs, preview rows, measurements, loaded fonts, and editing state do not.
4. Normalize page assumptions. Legal `page.mode` values are `fixed` and `continuous`, but new behavior should read the owning page strategy field: `page.pageModel`, `page.layout`, `page.reflow`, or `page.pagination`.
5. Keep node geometry semantic. `MaterialNode.x/y/width/height` are document coordinates; Designer projection, measurement, reflow, pagination, and overlay cloning must not silently write runtime output plans back to source schema.
6. Decide page behavior deliberately. Use canonical output placement and break constraints for `auto-sheets`, and manifest `common.layout.pageRepeat='every-output-page'` only for post-pagination element overlays. Repeated nodes must not affect flow, document height, or page count. Treat `page.layers` as a page-level render-layer boundary, not a material feature hook.
7. Implement Designer rendering with `renderContent(nodeSignal, container, renderContextSignal?)`: render immediately, subscribe to `nodeSignal`, optionally subscribe to transient render context, escape user-controlled strings or use DOM text APIs, and return deterministic cleanup.
8. Implement Viewer rendering with `ViewerRenderTree`; use `SanitizedMarkup` or an explicitly granted imperative host only when required. Ordinary bindings are projected into the frozen `context.resolvedModel`. `data-contract` materials must resolve their declared contract through the runtime binding scope and report diagnostics.
9. Add a layout `measure()` adapter only when runtime content changes physical size. Publish monotonic break opportunities and a fragment adapter when content can split across `auto-sheets`; core owns page-break selection and fragment identity.
10. If measurement or runtime data owns a dimension, return `MaterialDesignerExtension.resolveControlPolicy()` and also guard any deep-edit or behavior path that could mutate the blocked dimension.
11. Do not register condition capability just to opt into ordinary conditional rendering. Every material defaults to condition support with `remove` and `reserve`; set `condition: false` only when the material must ignore `renderCondition`, or set `condition: { scope: 'node', hiddenEffects: [...] }` only to narrow allowed hidden effects.
12. Publish both surfaces in one material manifest. Built-ins add that manifest to the appropriate immutable package in `packages/builtin/src/index.ts`; keep the root and `./all`, `./basic`, `./none` profile entry points aligned. Custom hosts include external manifest packages in `compileMaterialProfile()` before creating Designer or Viewer runtimes; live runtimes do not mutate their profile.
13. Expose catalog entries deliberately. Built-ins visible in the material panel must appear in `catalogs` with a stable group `id`, translatable group `label`, optional `order`, and item entries. A Designer facet alone is not panel exposure. A type missing from the compiled profile, or missing an admitted Viewer facet, is quarantined during profile/document admission and renders `[material unavailable]`.
14. Keep heavyweight Designer rendering behind `lazyFactory` only. Material type, binding definition, property descriptors, locale messages, catalog metadata, default factory, AI descriptor, and Viewer facet stay in the manifest before immutable profile compilation.
15. Add `PropertyDescriptor` entries for simple model fields. Use an explicit accessor, `requestPropertyPanel()`, or `SelectionType.getPropertySchema()` when data lives outside `model` or a write touches multiple fields. Use `editorOptions.valueInput` for host/file input; do not store `File`, local paths, file names, picker state, or import state in Schema.
16. Use shared layout behavior descriptors instead of material-local duplicates. `createLayoutBehaviorPropSchemas()` owns placement, break, and repeat UI visibility based on page strategy.
17. Add deep editing only for meaningful sub-element selection. Define `MaterialGeometry`, JSON-safe namespaced `SelectionType`, behavior middleware, decorations, and `tx.run()` mutations with stable history labels and merge keys. Inline editors must be selection-scoped.
18. Put datasource logic at the right layer. Declare semantic ports and optional data contracts in the manifest; persist source mappings by port in `bindings`. Table-like internals may use `datasourceDrop` and cell-level bindings, while structured charts keep data-contract mappings under the manifest-declared semantic port.
19. For font-bearing materials, expose a `font` property descriptor for `model.fontFamily` or the relevant model sub-property. Material renderers may emit `font-family` CSS from `context.resolvedModel`, but Designer and Viewer own `FontProvider` -> `FontManager` -> `@font-face`.
20. Add i18n keys for visible labels, tooltips, property labels, reject reasons, history labels, placeholders, and material-local toolbar actions. Prefer `context.t()` and `store.t()` over hardcoded strings.
21. Update material-local `src/ai.ts` when Assistant should generate or select the material. Register the descriptor as `aiDescriptor` on the Designer material entry; Assistant sees it through the live Designer material manifest, routes against lightweight descriptor knowledge first, and only loads detailed usage/schema rules when the material is selected.
22. Test the smallest useful surface: default factory, Designer repaint/deep behavior, control policy, page behavior properties, repeated overlays, fragment pagination, Viewer render/measure, binding projection or data-contract resolution, font-dependent output, profile admission/facet activation, catalog fallout, AI manifest, and i18n.

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
- Authoring utilities may normalize loose input before use; Viewer input must go through `loadDocumentWithProfile()` with its compiled profile.
- Use `continuous + continuous-paper + stack-flow + flow-y + none` for continuous paper templates.
- Do not branch material behavior solely on `page.mode`; read the owning page strategy field instead: `page.pageModel`, `page.layout`, `page.reflow`, or `page.pagination`.
- The material manifest must package both required facets before profile compilation; document admission quarantines unavailable material types.
- Do not add `condition: DEFAULT_MATERIAL_CONDITION` or material-local `*_CONDITION` constants for ordinary materials. Conditional rendering is a framework default. Only declare `condition: false` or a narrowed `hiddenEffects` override when the default is wrong, and test Designer and Viewer behavior for that override.
- Built-in materials that should be visible in the material panel must be present in `catalogs`; test that catalog entries point to registered materials, the expected panel group includes the new type, and any new catalog label is registered in bundle locale messages.
- Use `convertUnit()` inside default-node factories when default physical sizes are authored in mm.
- Put user-controlled strings in `viewerText()` nodes. Viewer renderers cannot return raw HTML strings.
- Use `context.resolvedModel` after Viewer projection; do not hand-resolve ordinary bindings inside material renderers. Structured materials consume data through the declared runtime binding scope, not ad hoc `context.data` walking.
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
- Viewer font loading happens before binding, measurement, layout, pagination, and DOM render. Material renderers should only emit `font-family` CSS from the resolved model or inherited page font; they should not call `FontProvider` directly.
- Material-local toolbars should be compact command toolbars, not identity badges.
- Material Designer UI must not call browser-native confirmation APIs. Destructive host UX belongs behind Designer's interaction bridge or a Contribution-level workflow.
- Repeated/page-aware overlays are post-pagination page overlays. They must not affect flow, document height, page count, output sheets, or source-node editability.
- `page.layers` is a page-level render-layer array, not a `MaterialNode` extension point and not a material capability surface. Use `page.layers[]` only for whole-page, non-editable, non-bindable decorations such as text watermarks. Use ordinary elements plus `repeat.scope` for editable headers, footers, logos, page numbers, data-bound repeated content, or editable watermarks.
- For table-like deep editing, decoration visibility and behavior execution must share the same delegate rules for row/column resize affordances.
- Add or reuse locale keys for anything user-visible in Designer UI, including property labels and history labels.
- Assistant sees material capabilities, binding definitions, data-contract target fields, model properties, and AI descriptors through the current Designer store manifest. Register custom material binding metadata and optional `aiDescriptor` on the Designer material entry.
- Keep AI descriptors honest: do not list model properties, binding modes, child support, default sizes, or scenario fitness that the Designer/Viewer implementation cannot satisfy.
- For data-contract materials, set descriptor `binding: 'data-contract'`, include mapping examples with `binding.kind='data-contract'`, and explain that relation mode is resolver-derived rather than a UI/schema mode.
- Exporters and print drivers must consume Viewer-rendered pages and `ViewerPageMetrics`; do not reimplement material layout in those layers.
