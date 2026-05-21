---
name: easyink-material-dev
description: EasyInk material development workflow and review guide. Use when implementing, extending, debugging, or reviewing EasyInk built-in or custom materials that add or change a Schema-saved visual element across MaterialNode shape, createDefaultNode defaults, registerMaterialBundle wiring, Designer and Viewer parity, orthogonal page layout behavior, page-aware overlays, fragment pagination, runtime measurement, table-data or svg-star style deep editing, datasource binding, AI material descriptors, tests, and i18n.
---

# EasyInk Material Dev

Use this skill to work on EasyInk materials as complete system features, not isolated render functions. A material must line up across Schema, Designer registration and editing, Viewer rendering and measurement, page layout behavior, catalog exposure, data binding, AI descriptors, tests, and i18n.

If the request adds a panel, command, diagnostic subscription, host workflow, or toolbar action around existing elements without adding/changing a Schema-saved visual element, use `$easyink-contribution-dev` instead.

## First Read

Start with the local repo, not memory. Prefer these files:

- `CLAUDE.md` for project coding rules: no `structuredClone`, no Unicode emoji, workspace deps, and `pnpm build`, `pnpm lint`, `pnpm typecheck` in order for broad validation.
- `.github/architecture/24-page-layout-orthogonal-system.md` for the current page model, layout, reflow, pagination, page overlay, and editor surface rules.
- `docs/advanced/custom-materials.md` for the public custom material contract.
- `docs/advanced/schema.md` for `DocumentSchemaInput` normalization, page layers, and persistent schema fields.
- `docs/advanced/exporters.md` and `docs/advanced/print-drivers.md` when output must be validated through export or print paths.
- `packages/schema/src/types.ts`, `packages/schema/src/defaults.ts`, and `packages/schema/src/compat.ts` for `MaterialNode`, binding, page layer defaults, and legacy `stack` migration.
- `packages/core/src/material-extension.ts` and `packages/core/src/material-viewer.ts` for Designer and Viewer extension contracts.
- `packages/core/src/layout-strategy.ts`, `packages/core/src/reflow-engine.ts`, `packages/core/src/pagination-engine.ts`, and `packages/core/src/editor-surface-plan.ts` for runtime layout and edit-surface behavior.
- `packages/designer/src/materials/registry.ts`, `packages/prop-schemas/src/index.ts`, and `packages/designer/src/components/PropertiesPanel.vue` for registration and page behavior property schemas.
- `packages/viewer/src/runtime.ts`, `packages/viewer/src/render-surface.ts`, and `packages/viewer/src/material-registry.ts` for binding projection, measurement, pagination, repeated overlays, and renderer dispatch.
- `packages/builtin/src/designer.ts`, `packages/builtin/src/viewer.ts`, and `packages/builtin/src/ai.ts` for built-in registration.
- `packages/materials/text`, `packages/materials/rect`, and `packages/materials/image` for simple fixed-size patterns.
- `packages/materials/page-number` for page-aware repeated overlays.
- `packages/materials/flow-row` for runtime-height flow/flex behavior.
- `packages/materials/table-data` and `packages/materials/table-kernel` for datasource drop, cell sub-properties, runtime measurement, fragment pagination, and resize side effects.
- `packages/materials/svg/star` for shape-specific deep editing.

## Workflow

1. Confirm this is a material change. Create or extend a material only when a Schema node, Designer interaction, and Viewer render path are all affected.
2. Define stable schema identity first: `TYPE`, props interface, defaults, capabilities, and `createXNode(partial?, unit?)`. Default nodes must render visibly without runtime data.
3. Normalize page assumptions. Legal `page.mode` values are `fixed`, `continuous`, and `label`; `stack` is legacy input migrated by `@easyink/schema`. New behavior should read `page.pageModel`, `page.layout`, `page.reflow`, and `page.pagination`, not add another `page.mode` branch.
4. Keep node coordinates semantic. `MaterialNode.x/y/width/height` are document coordinates; measurement, reflow, pagination, repeated overlays, and Designer projection must not silently write runtime output plans back into source schema.
5. Decide material page behavior deliberately. Use `node.placement` for flow/fixed positioning, `node.break` for auto-sheets pagination constraints, and `node.repeat.scope='every-output-page'` or Viewer `pageAware` for post-pagination overlays. Repeated/page-aware nodes must not influence flow, document height, or page count, and they do not run in `label-sheets`.
6. If the material can split across `auto-sheets`, implement `fragmentPaginator`. It should produce virtual fragments with `sourceNodeId` preserved and avoid mutating source schema.
7. Implement Designer rendering with `renderContent(nodeSignal, container)`. Render immediately, subscribe to `nodeSignal`, escape user-controlled strings or use real DOM, and return deterministic cleanup.
8. Implement Viewer rendering with `trustedViewerHtml()` or an `HTMLElement`. Read ordinary runtime binding results from `context.resolvedProps`; add `measure()` only when runtime content changes physical size; use `getRenderSize()` only when wrapper size must differ from schema geometry.
9. If Viewer `measure()` or runtime data owns a dimension, add `MaterialDesignerExtension.resolveControlPolicy()` so Designer hides/disables matching geometry fields and outer resize handles. Guard behavior/deep-edit entry points that could mutate the blocked dimension.
10. Register both sides. Built-ins go through `packages/builtin/src/designer.ts` and `packages/builtin/src/viewer.ts`; custom hosts register through `setupStore` and `viewer.registerMaterial()`. A Designer-only material renders `[Unknown: type]` in Viewer.
11. Add `propSchemas` only for simple props-bag fields. Use custom `read` and `commit`, `requestPropertyPanel()`, or `SelectionType.getPropertySchema()` when a property lives outside `node.props` or changes multiple fields.
12. Use shared layout behavior props instead of material-local duplicates. `createLayoutBehaviorPropSchemas()` owns placement, break, and repeat UI visibility based on page strategy.
13. Add deep editing only for meaningful sub-element selection. Define `MaterialGeometry`, JSON-safe namespaced `SelectionType`, behavior middleware, decorations, and `tx.run()` mutations with stable history labels and merge keys.
14. Keep inline editors selection-scoped. Changing a cell, column, handle, or internal region must drop input mode back to selection highlight and require a fresh explicit edit entry.
15. For material-local inline toolbars, render commands only. Prefer compact icon tools with localized `title` tooltips; anchor the toolbar to the material frame top-left outside the border unless a local interaction requires otherwise.
16. Add datasource logic at the right layer. Whole-element binding uses `node.binding`; table-like internal binding owns `datasourceDrop` and cell-level `binding` or `staticBinding`.
17. Add i18n keys for visible labels, tooltips, property labels, reject reasons, history labels, placeholders, and material-local toolbar actions. Prefer `context.t()` and `store.t()` over hardcoded strings.
18. Update AI descriptors when the material is built in or should be generated by MCP/AI flows. Then run or check `packages/mcp-server/config/materials.json` with the MCP material commands.
19. Test the smallest useful surface: schema defaults, Designer refresh or deep behavior, control policy, page behavior props, repeated overlay behavior, fragment pagination, Viewer render or measure, binding projection, registration fallout, AI config, and i18n.

## Reference Files

Load only the reference needed for the current task:

- `references/architecture.md`: material system boundaries, current page layout pipeline, Designer/Viewer contracts, and registration.
- `references/development-flow.md`: built-in and custom material implementation checklist.
- `references/deep-editing.md`: editing session, geometry, selection, behavior, decoration, overlay, inline editor, and resize rules.
- `references/binding-viewer.md`: binding projection, runtime measurement, fragment pagination, page-aware overlays, trusted HTML, export, and print boundaries.
- `references/i18n-ai-tests.md`: i18n, AI descriptors, MCP materials config, validation, and test rules.
- `references/case-studies.md`: distilled rules from `table-data`, `table-kernel`, `flow-row`, `svg-star`, `text`, and `page-number`.

## Hard Rules

- Keep Schema serializable and stable. Do not store DOM nodes, functions, transient selections, virtual preview rows, measured caches, runtime fragments, output pages, or preview-only data in Schema.
- Normalize loose host input with `normalizeDocumentSchema()` before relying on required schema fields.
- Do not introduce `stack` as a legal page mode in new code. Treat it only as compat input migrated to `continuous + continuous-paper + stack-flow + flow-y + none`.
- Do not branch material behavior solely on `page.mode` when a page layer has the actual semantics. Use page model, layout, reflow, and pagination strategy.
- Designer and Viewer must both know the material type.
- Use `convertUnit()` inside default-node factories when default physical sizes are authored in mm.
- Escape all user-controlled strings before HTML interpolation. Viewer HTML must be wrapped with `trustedViewerHtml()`.
- Use `context.resolvedProps` or `node.props` after Viewer projection; do not hand-resolve ordinary `node.binding` inside material renderers.
- Use `tx.run()` for deep-edit mutations so history, patches, and undo work. Use `mergeKey` for continuous drag/resize edits.
- Keep selection payloads JSON-safe and namespaced, such as `table.cell` or `svg-star.control`.
- Bind inline input/editor session meta to the current sub-selection.
- Runtime-height materials must declare a Designer control policy and must not expose any outer or internal path that mutates runtime-owned height.
- Preview-only rows remain outside Schema. If a runtime-height material shows Designer preview rows, keep them display-only.
- Material-local toolbars should be compact command toolbars, not identity badges.
- Repeated/page-aware overlays are post-pagination page overlays. They must not affect flow, document height, page count, label sheets, or source-node editability.
- For table-like deep editing, decoration visibility and behavior execution must share the same delegate rules for row/column resize affordances.
- Add or reuse locale keys for anything user-visible in Designer UI, including property labels and history labels.
- Exporters and print drivers must consume Viewer-rendered pages and `ViewerPageMetrics`; do not reimplement material layout in those layers.
