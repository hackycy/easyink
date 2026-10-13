# Designer extension implementation flow

1. Follow the actual `@easyink/assistant-designer-bridge` declaration for id, locale, commands and UI. Choose only the features needed by the task.
2. Export `DesignerExtension` from the package and select it through `<EasyInkDesigner :extensions="extensions" />` or `DesignerStore.create({ extensions, materials })`.
3. Components receive a required controlled `context` prop. `getProps(context)` supplies business values; UI state belongs to that Host or mount, never the Schema.
4. Commands preserve argument/result types. Call `context.executeCommand(command, args)` so the handler uses its owner's context.
5. Register listener cleanup through `onDispose`, observe `signal`, and release late results. Use host interaction methods for confirmation and file selection.
6. Validate UI mounting, locale fallback, simultaneous Hosts, close and awaited destroy. Validate user edits through undo/redo and preserve replacement/rollback behavior.

Executable author examples are maintained in [the public guide](../../../docs/advanced/contributions.md). Read the current package exports instead of copying an API list into this reference.
