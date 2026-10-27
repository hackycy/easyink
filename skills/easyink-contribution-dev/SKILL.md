---
name: easyink-contribution-dev
description: EasyInk Designer contribution development workflow and review guide. Use when implementing, extending, debugging, or reviewing EasyInk Designer extensions that do not add a new material type, especially Contribution objects, custom panels, toolbar actions, commands, diagnostic subscriptions, host-owned business state, AI panels, review panels, asset panels, and other Designer capability extensions.
---

# EasyInk Designer Extension Dev

Use complete `DesignerExtension` declarations for panels, toolbar actions, workbench windows, canvas adornments and typed commands. Material property UI belongs to a complete material. Read the touched extension and [public author guide](../../docs/advanced/contributions.md) before changing behavior.

1. Choose the capability owner: a complete material or independent extension. Declare a stable extension id and capability ids in `@easyink/plugin-api/ui`.
2. Read `packages/plugin-api/src/{designer,ui,resources}.ts` and the real `packages/assistant/designer-bridge/src/contribution.ts` example. Declare commands, locale and UI directly; application creation chooses `extensions` once.
3. Use the callback/context prop supplied by the framework. Queries return read-only snapshots; edits go through tx, typed commands or controlled document operations. Properties use `MaterialPropertiesContext`, independent UI uses `DesignerContext`.
4. Attach listeners, subscriptions and async work to `signal` and `onDispose`. UI scopes end on unmount; owner state must isolate simultaneous Hosts. Retain the host close Promise and await cleanup in tests.
5. Use `confirm`, `pickAsset` and `pickFileText` for user interaction. Keep files, components, DOM and transient state out of Schema. Preserve ordinary command undo and document-replacement semantics.
6. Verify actual position, sorting, context permissions, multi-instance isolation, local UI failure and awaited resource disposal. Then run repository build, lint and typecheck in order.

References are consulted only for the relevant branch: [architecture](references/architecture.md), [implementation flow](references/development-flow.md), and [Assistant](../../.github/architecture/25-ai-assistant.md).
