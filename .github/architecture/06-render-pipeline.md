# 6. Viewer Render Pipeline

Viewer consumes one immutable `CompiledMaterialProfile`. The same profile boundary governs document loading, material admission, facet activation, layout, and rendering. Viewer never copies a Designer registry and never accepts a mutable runtime registry.

## 6.1 Authoritative sequence

The only production sequence is:

```text
compiled profile -> document admission -> effective output -> facet activation/runtime model resolution
-> resource readiness -> MeasureService -> MaterialLayoutPlan -> document layout -> core pagination
-> page overlays -> ViewerRenderTree/imperative host -> browser DOM
```

`loadDocumentWithProfile()` performs document admission and publishes canonical Schema plus node admission states. Quarantined or missing nodes remain represented by safe runtime instances; later stages do not call their material code.

Effective output is a frozen runtime map. Binding projection resolves the profile-declared port policy into a runtime model without changing Schema. Declared fonts and assets reach a terminal ready-or-failed state before authoritative measure. Material layout adapters return `MaterialLayoutPlan` facts and break opportunities; core owns document layout, page-break selection, fragment identity, placement, and page overlays.

## 6.2 Requested and committed state

Each open or data update creates a requested revision. Requested document, data, and resource revisions become committed only after layout completes and `RenderSurface` atomically swaps a fully built root into the host. A failed, aborted, or superseded generation disposes candidate mounts and cannot publish DOM, diagnostics, cache entries, or committed revisions. Cleanup failures from the previous root are reported after the successful replacement is already committed.

Exactly one `ProfileMaterialRuntime`, backed by one Viewer `MaterialFacetHost`, owns Viewer facet activation, quarantine, and disposal for the profile. Individual pages and material mounts do not own shared facets.

## 6.3 Output boundary

Materials return `ViewerRenderTree`. Text and elements use the core tree constructors and are checked against depth, node, attribute, style, and text budgets. A material cannot return a raw HTML string and the public contract has no trusted-HTML wrapper.

Markup is accepted only as an opaque `SanitizedMarkup` token created and consumed by the same browser capability scope. Imperative DOM requires the same named `imperative-dom` capability in both the Viewer facet and the host policy, and every mount returns a deterministic disposer.

## 6.4 Virtualization, print, and export

Interactive virtualization changes only which committed page DOM nodes are retained. It never changes resource readiness, measurement, layout, pagination, page identity, or shared facet lifetime. Print and export take a committed reader lease and materialize every committed page for the duration of the operation, then restore the interactive retention set.

Implementation entry points are `packages/viewer/src/runtime.ts`, `packages/viewer/src/layout-runtime.ts`, `packages/viewer/src/render-surface.ts`, and `packages/browser-dom/src/render-viewer-tree.ts`.
