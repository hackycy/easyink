# Designer extension architecture

The authoritative contract and examples are [architecture chapter 23](../../../.github/architecture/23-contribution.md) and [public guide](../../../docs/advanced/contributions.md). Each Designer has one plugin-runtime Host. Complete materials and independent extension declarations are fixed before creation; the framework consumes immutable registry views.

Five UI features are toolbar, overlay, window, canvas and material properties. Framework-provided context is injected last, so business props cannot overwrite permissions. Callback and component contexts are short scopes. Host destroy invalidates work synchronously and returns a shared cleanup Promise.
