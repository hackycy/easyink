# i18n, Validation, and Test Rules

## i18n Rules

Prefer locale keys over hardcoded labels for Designer-facing UI:

- Material catalog names: `materials.<material>.name`.
- Material property labels: `materials.<material>.property.*`.
- Material enum options: `materials.<material>.option.*`.
- Material placeholders: `materials.<material>.placeholder.*`.
- Material-local commands: `materials.<material>.action.*`.
- Datasource hints and rejection messages: `designer.dataSource.*`.
- Material command history labels: `materials.<material>.history.*`.
- Page behavior labels: `designer.property.placementMode`, `designer.property.keepTogether`, `designer.property.pageBreakBefore`, `designer.property.pageBreakAfter`, and `designer.property.repeatEveryPage` already live in shared prop schemas; reuse them instead of material-local duplicates.

Add material keys in the material package:

- `src/locale.ts`
- Pass the export as `localeMessages` on the Designer material entry, or include it in the material bundle registration.

`@easyink/locales` owns Designer common strings only: shared panels, page settings, data source UI, binding format UI, generic diagnostics, and generic history labels.

Material code can translate with:

- `context.t(key)` in material Designer extensions.
- `delegate.t(key)` inside table-kernel helpers.
- `store.t(key)` in Designer components.

Property schemas can store label keys directly because `PropertiesPanel.vue` resolves labels through the store. Same for enum option labels.

## i18n Review Checklist

- No new user-visible Chinese-only strings in built-in material registration unless intentionally not localized.
- New material panel catalog groups use `materials.catalog.<id>` labels registered through bundle locale messages.
- Decoration tooltips, material-local toolbar button titles, property titles, reject labels, placeholders, and history labels are localized.
- Page-aware or fragment-pagination diagnostics that surface to users are stable, translated where they are Designer-facing, and use Viewer diagnostics for runtime-only failures.
- `PropertyDescriptor.group` uses an existing group mapped by `GROUP_LABELS` in `PropertiesPanel.vue`, or the visible custom group text is intentional.
- History panel can display the command label. Prefer stable `materials.<material>.history.*` keys for material commands.
- Custom host-owned materials register their locale messages through `registerMaterialBundle()` instead of coupling them to `@easyink/locales`.

## AI Reminder

Read `references/ai-assistant-materials.md` when AI behavior matters. In short:

- Put `src/ai.ts` next to the material when it should be generated or selected by Assistant.
- Include `AIMaterialDescriptor.knowledge` when Assistant needs reliable material selection, binding, sizing, or scenario fitness.
- Register built-in descriptors through Designer `aiDescriptor`; `packages/builtin/src/ai.ts` is derived from the Designer bundle.
- Register custom material descriptors on the Designer material entry; Assistant gets them from the live store manifest.

Assistant reads canonical material types, binding rules, model properties, and optional AI descriptors from the live Designer material manifest. If a generated material should be available to Assistant but lacks a Designer `aiDescriptor`, selection and schema generation become weaker even when its manifest package and compiled-profile facets are otherwise correct.

## AI Review Smells

- AI descriptor mentions a prop that does not exist or omits required specialized schema rules.
- Descriptor binding says `single` or `multi` but `knowledge.bindingSpec.mode` says a different data shape.
- `knowledge.sizing.defaultSize` does not match the factory default size in mm.
- Custom material tries to update prompt text or a static AI list instead of registering Designer `aiDescriptor`.

## Tests to Add or Run

Choose focused tests based on risk:

- Default factory: creates stable type, visible size, defaults, and unit conversion.
- Designer render: subscribes to `nodeSignal` and escapes labels/content.
- Prop schema: custom `read`/`commit` writes the correct schema location and command.
- Deep editing: hit test, selection validation, property schema, behavior commands, keyboard navigation.
- Viewer render: returns a `ViewerRenderTree` or a capability-gated output, uses `context.resolvedModel`, and escapes user content.
- Viewer measure: runtime height/width, layout cache behavior, diagnostics.
- Fragment pagination: split behavior under `auto-sheets`, preservation of `sourceNodeId`, and no source schema mutation.
- Page-aware/repeat overlay: excluded from layout inputs, copied after pagination, receives `__pageNumber` and `__totalPages`.
- Datasource drop: accepted/rejected zones, collection prefix checks, cell binding shape, or data-contract target field mapping.
- Data-contract resolver: shared record collection, top-level array index alignment, source-scoped root resolution, invalid relation diagnostics.
- Profile admission: the built-in manifest package compiles with both required facets and admits the new material.

Useful commands:

- `pnpm test -- packages/materials/svg/star/src/star.test.ts`
- `pnpm test -- packages/materials/table/data/src/viewer.test.ts`
- `pnpm test -- packages/materials/table/kernel/src/geometry.test.ts`
- `pnpm build` for broad package integration when registration or package exports changed.

## Review Smells

- New material has Designer code but its manifest/profile package lacks a Viewer facet.
- New Viewer renderer manually resolves ordinary `node.bindings` instead of consuming `context.resolvedModel`.
- New data-contract material truncates `mappings.*.select.path` values or lacks relation resolver coverage in tests.
- New property label is a hardcoded string while neighboring schemas use locale keys.
- New deep-edit payload stores DOM or non-serializable values.
- New table-like material duplicates preview rows into Schema.
- New repeated/page-aware material changes page count or continuous-paper height.
- New material writes placement, break, or repeat semantics into `node.model` instead of `node.output`.
- Tests assert raw full HTML instead of stable semantic snippets where markup is generated.
