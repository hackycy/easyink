# EasyInk Contribution Architecture

## Boundary

Contribution work extends Designer capabilities without introducing a new Schema-saved visual element.

Use Contribution for:

- Panels: AI assistant, review inspector, asset browser, audit log.
- Toolbar actions: explicit buttons that trigger commands or open panels.
- Commands: reusable cross-entry actions with typed args and results.
- Diagnostic subscriptions: forwarding Designer recoverable errors to host observability.
- Host-owned business state: workflow state, filters, review status, asset selections, and external service sessions.

Use material development instead when the feature needs a new `MaterialNode`, `createDefaultNode()`, Designer material registration, Viewer renderer, material binding behavior, material measure logic, or deep editing for a Schema element.

## Runtime Chain

```text
host app
  -> <EasyInkDesigner :contributions="[...]"
                      :interaction-provider="..." />
  -> ContributionRegistry.activate(contributions, store)
  -> contribution.activate(ctx)
  -> registerPanel / registerToolbarAction / registerCommand / confirm / onDiagnostic
  -> Designer renders toolbar actions and Teleport panels
  -> user interactions call commands or panel handlers
  -> Designer unmount disposes contribution resources
```

## State Ownership

- Schema state: `DocumentSchema`, `MaterialNode`, bindings, page setup, and persisted template content.
- Designer workbench state: selection, panels, zoom, layout preferences, diagnostics, and undoable template edits.
- Contribution state: panel open/closed flags, host workflow progress, remote query results, subscriptions, and temporary review/asset/AI state.

Contribution state should not be stored in Schema unless it is genuinely template content that must round-trip through import/export and affect Viewer output.

## Integration Points

`ContributionContext` exposes:

- `store`: the active `DesignerStore`.
- `registerPanel(panel)`: add a Vue panel rendered through Teleport.
- `registerToolbarAction(action)`: add a top toolbar action.
- `registerCommand(command)`: add a reusable command handler.
- `executeCommand(id, args?)`: invoke a registered command.
- `confirm(request)`: ask the host-controlled `interactionProvider` for user consent before destructive actions.
- `onDiagnostic(fn)`: subscribe to Designer diagnostics.
- `onDispose(fn)`: register cleanup for unmount, remount, and HMR.

`ContributionRegistry` uses shallow reactive descriptor lists and `markRaw()` so Vue component definitions are not proxied.

## User Confirmation Boundary

Contribution code should not call browser-native confirmation APIs or bind itself to a specific dialog implementation. Use `ctx.confirm()` with a stable request id and a payload that describes the affected template state. The host decides whether to show a modal, run a permission check, write an audit event, or return immediately.

Designer-owned destructive actions use the same bridge, with ids such as `designer.template.new`, `designer.template.clear`, and `designer.page.deleteWithElements`.

## Lifecycle

Register all contribution abilities inside `activate(ctx)`. The registry clears panels, toolbar actions, commands, diagnostic subscriptions, and registered disposers on `dispose()`.

Use `ctx.onDispose()` for:

- window or document event listeners
- intervals and timeouts
- external observability or data subscriptions
- WebSocket or SSE clients
- in-memory state that should reset on Designer unmount

Do not assume a contribution lives for the entire page session. Embedded designers, route changes, and HMR can mount and unmount repeatedly.
