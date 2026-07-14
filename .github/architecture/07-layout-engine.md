# 7. Layout And Pagination

Layout is a staged, immutable projection. Designer and Viewer share the core `MaterialLayoutPlan`, `MaterialFragmentPlan`, `LayoutConstraints`, and `createLayoutConstraintKey()` contract. A material may expose the same pure layout adapter object on both facets; Designer authoring preview does not activate Viewer rendering or create Viewer runtime records.

## 7.1 Stages and ownership

```text
frozen effective output state
  -> runtime model and scope resolution
  -> declared resource readiness
  -> MeasureService with shared constraint keys
  -> material layout plans
  -> document layout/reflow
  -> core pagination
  -> repeated page overlays
  -> committed page and fragment plans
```

Schema remains persisted input throughout this sequence. Runtime models, measured geometry, slot ownership, fragment plans, repeated overlays, and output decisions are separate frozen facts.

## 7.2 Material contribution

A material layout adapter may measure content and publish ordered break opportunities. It does not own a paginator, choose a document page, mint an output fragment identity, or place a fragment. Nested slot layouts use explicit frozen instance-key mappings; consumers never parse concatenated instance ids.

Designer and Viewer construct identical constraint keys from available width, available height, document unit, and writing mode. Resource revision, profile identity, mode, material type, instance, node, document, data, and constraints participate in the relevant cache keys so a cached plan is never reused across a changed dependency.

## 7.3 Core page breaking

Core selects every page break from the material's monotonic break opportunities. For a requested `[startBlockOffset, endBlockOffset]` range, the fragment adapter must consume that exact forward range. Core rejects zero-progress, backward, overlapping, out-of-range, or identity-mismatched contributions. Indexed selection keeps break lookup bounded as break-opportunity counts grow.

`fixed-sheets`, `auto-sheets`, and `none` remain document policies. `auto-sheets` applies break-before, break-after, keep-together, and material break opportunities. `fixed-sheets` preserves declared sheet placement and diagnoses incompatible break requests. `none` produces continuous output rather than material-owned pages.

Repeated elements with `pageRepeat = 'every-output-page'` are excluded from content flow and added as overlays after core pagination. Page context such as page number and total pages is projected into the repeated runtime model, not written into Schema.

## 7.4 Visibility and authoring state

`output.visibility` and conditional `include`, `reserve`, or `remove` are Viewer runtime output states. They are orthogonal to Designer-only `editorState.hidden`:

- `include` measures, lays out, and paints.
- `reserve` measures and lays out but does not paint.
- `remove` does not measure, lay out, or paint.

`editorState.hidden` may remain in Designer authoring UI, but it has no effect on Viewer effective output, measure, layout, pagination, or paint. In particular, `reserve` is not implemented by setting a hidden field on a copied Schema node.

## 7.5 Diagnostics and quarantine

Admission, runtime-model, measure, fragment, and render failures publish stable diagnostics and safe quarantined facts. The node is not dropped. Default geometry preserves document progress, and failing material code is not re-entered for the quarantined generation. Host limits govern runtime rows, layout facts, fragment work, and render trees; reservations fail before an over-limit allocation.
