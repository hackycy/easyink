# Deep Editing Rules

Use deep editing when the user edits sub-elements inside one material: table cells, SVG handles, internal anchors, shape control points, or material-local regions. Do not add deep editing for ordinary whole-element selection.

## Core Pieces

Deep editing uses these contracts from `packages/core/src/editing-session.ts` and `packages/core/src/material-extension.ts`:

- `MaterialGeometry`: content layout, hit testing, and selection-to-rectangle mapping.
- `SelectionType<T>`: payload validation, sub-property schema, selection rectangle mapping.
- `BehaviorRegistration`: middleware for pointer, keyboard, drop, paste, or command events.
- `SelectionDecorationDef`: Vue component rendered by `SelectionOverlay`.
- `TransactionAPI`: `tx.run()` and `tx.batch()` for undoable schema mutations.
- `EditingSessionRef`: active node, current selection, reactive metadata, dispatch, `setMeta()`, `clearMeta()`, and `setSelectionScopedMeta()`.

## Geometry Contract

`MaterialGeometry` must follow coordinate conventions:

- `getContentLayout()` and `resolveLocation()` return document/page coordinates.
- `hitTest(point, node)` receives material-local coordinates.
- Use `GeometryService.documentToLocal()` and `localToDocument()` when pointer or handle positions cross spaces.
- Include transforms when needed. For shape handles like `svg-star`, local handle positions are converted through rotation and scale before overlay placement.

Hit tests should return `null` for inert regions. Table-data returns `null` for virtual placeholder rows so preview-only rows are not editable.

## Selection Contract

Selection payloads must be JSON-safe and deterministic:

- Good: `{ row: 1, col: 2 }`, `{ handle: 'inner-radius', index: 0 }`.
- Bad: DOM node, function, class instance, PointerEvent, reactive ref.

Selection type IDs must be namespaced. Examples:

- `table.cell`
- `svg-star.control`

Implement `validate(payload)` for any payload shape that may come from restore, keyboard navigation, or middleware.

## Behaviors

Behaviors are Koa-style middleware:

- Use `eventKinds` to narrow input types.
- Use `selectionTypes` when a behavior only applies to sub-selections.
- Use `priority` to order framework and material behavior.
- Call `next()` when the event is not consumed.
- Stop DOM defaults where needed for keyboard navigation or pointer gestures.
- Mutate Schema through `ctx.tx.run()` only.

Framework helpers:

- `selectionMiddleware()` performs pointer hit-testing and updates selection.
- `keyboardCursorMiddleware()` lets Escape exit editing through the workbench fallback.
- `undoBoundaryMiddleware()` helps selection changes become natural history boundaries.

## History and Transactions

Use `tx.run(nodeId, draft => { ... }, options)`:

- `label`: use an i18n history key such as `designer.history.updateTableCell`.
- `mergeKey`: use for continuous drag or resize, such as `svg-star:inner-radius` or `resize-col-2`.
- `mergeWindowMs`: tune only when the default window is wrong.

Do not directly mutate the store from a decoration or toolbar. Decorations should dispatch commands to the session; behavior middleware should own schema mutation.

## Decorations

Use decorations for visual handles, guides, inline toolbars, and overlays:

- Register `decorations` on the material extension.
- Filter by `selectionTypes`.
- Keep rendering layer intentional: `below-content`, `above-content`, or `above-handles`.
- Component props include `{ rects, selection, node, session, unit }`.
- Use `session.dispatch()` to send commands and `session.setMeta()` for transient UI state shared with the decoration.

`svg-star` uses a decoration to render inner-radius handles and dispatches `svg-star.adjust-handle` while dragging. The behavior converts screen coordinates to material-local points and writes `starInnerRatio`.

## Sub-Property Schemas

Use `SelectionType.getPropertySchema()` when selected sub-elements need properties:

- Return a `SubPropertySchema`.
- Implement `read(key)` from the current node state.
- Implement `write(key, value, tx)` using `tx.run()`.
- Provide `binding`, `clearBinding`, and `updateBindingFormat` when the sub-selection owns binding.
- Use locale keys in `title` and labels.

`table-kernel/src/editing/cell-property.ts` is the model. It reads and writes cell typography, padding, border, and binding. It chooses `binding` for repeat-template rows and `staticBinding` for fixed rows.

## Inline Editors and Ephemeral Panels

Use `session.meta` or `SurfacesAPI.requestPanel()` for transient editor UI. Keep actual committed content in Schema.

Inline text/input mode is selection-scoped, not material-scoped. When an editor belongs to a selected sub-element, store its meta with `session.setSelectionScopedMeta(key, value, ctx.selection)`, not plain `setMeta()`. If the user selects another cell/column/handle and later clicks back, the material must show only the selection highlight; entering input mode again requires a fresh double-click, `Enter`, or `F2`.

Required pattern:

- Enter input mode from a behavior command or keyboard event after a valid sub-selection exists.
- Store editor identity with `setSelectionScopedMeta`, for example `editingCell` or `editingColumn`.
- Clear it with `session.clearMeta(key)` on commit or cancel.
- In the decoration component, remember the active edit target separately from the reactive selection before showing the input. Commit/cancel against that remembered target, because the component may be reused after selection changes.
- Let selection changes invalidate editor meta centrally; do not add click-path patches such as "if clicked previous cell then clear input" in individual handlers.

Use plain `setMeta()` only for transient state that intentionally survives sub-selection changes inside the same session, such as drag preview feedback for a shape handle.

For table cells:

- `Enter` or `F2` enters cell edit.
- `Delete` clears content text.
- `Tab` and arrow keys move between visible cells.
- `table-data` repeat-template cells cannot inline-edit content because they represent runtime data bindings.
- Runtime-height materials should not expose a height-changing sub-edit path in the Properties panel or drag handles. If a design-time preview row exists, it must stay display-only unless the material explicitly maps it back to a semantic row and still keeps the outer height locked.

For flow/flex row columns:

- Column input mode follows the same selection-scoped rule as table cells.
- Column resize/toolbar selection may update the selected column, but must not resurrect a previous textarea.

## Resize Side Effects

Use `MaterialResizeAdapter` when element resize must update material-private layout:

- `beginResize(node)` captures original private state.
- `applyResize(node, snapshot, params)` mutates private fields during preview.
- `commitResize(node, snapshot)` returns a side effect with deterministic `apply()` and `undo()`.

The table resize adapter scales visible row heights during vertical resize and freezes hidden header/footer rows so re-showing them preserves proportions. Materials that are runtime-height owned should not use this path for outer height changes.

For table-like internal resize:

- Treat resize handles as semantic boundaries, not only internal grid dividers. The last column's right edge is draggable, and every visible row's bottom edge can be draggable if the material delegate allows that row.
- Do not block visible header/footer rows by role. Hidden rows are the inert case; visible header, repeat-template, normal, and footer rows should use the same row-height path unless the material has an explicit product reason to opt out.
- If the material declares runtime height through `resolveControlPolicy()`, the outer row-height path is the explicit opt-out case.
- Use a pure row/column resize resolver when possible. It should start from currently rendered sizes, clamp to minimums, write back schema row heights or column ratios, and update the material frame when the resized edge changes the semantic table box.
- Preview-only rows must map to real schema rows only for materials that still own semantic row resize. In `table-data`, the current design is runtime-height locked: designer placeholder rows are display-only and do not expose a height-changing drag path.
- Keep handle visibility and resize execution under the same delegate rules. A visible handle that dispatches to a blocked behavior is a regression.

## Deep Editing Checklist

- Double-click enters editing; avoid pointerdown-only entry that steals normal selection/drag.
- Hit testing respects hidden rows, merged cells, handles, transforms, and preview-only regions.
- Selection payload validates.
- Property panel reflects sub-selection state.
- Keyboard behavior does not leak to canvas shortcuts while consumed.
- Inline editor mode is selection-scoped and disappears when the user selects a different sub-element.
- Returning to a previously edited sub-element shows highlight only until the user explicitly enters edit mode again.
- Resize handles include outer semantic boundaries where users expect size control, such as table last-column right borders and visible row bottom borders.
- Runtime-height materials should keep preview rows display-only and avoid any gesture that mutates preview-only structures into Schema.
- Drag/resize gestures clean up on unmount.
- Continuous edits have merge keys.
- Hiding/removing the selected sub-element exits or repairs the active session.
