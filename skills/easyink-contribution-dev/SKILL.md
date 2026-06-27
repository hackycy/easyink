---
name: easyink-contribution-dev
description: EasyInk Designer contribution development workflow and review guide. Use when implementing, extending, debugging, or reviewing EasyInk Designer extensions that do not add a new material type, especially Contribution objects, custom panels, toolbar actions, commands, diagnostic subscriptions, host-owned business state, AI panels, review panels, asset panels, and other Designer capability extensions.
---

# EasyInk Contribution Dev

Use this skill to extend EasyInk Designer behavior without adding a new Schema-saved visual element. Contribution work injects host/business capabilities into the Designer through panels, toolbar actions, commands, and diagnostic subscriptions.

If the request adds or changes a visual element that must be saved in `schema.elements[]`, use `$easyink-material-dev` instead.

## First Read

Start with the local repo, not memory. Prefer these files:

- `docs/advanced/contributions.md` for the public Contribution contract and examples.
- `docs/designer/index.md` for `EasyInkDesigner` props, especially `contributions`, `interactionProvider`, and host capability props such as `fontProvider`.
- `docs/designer/fonts.md` when a contribution observes font diagnostics or coordinates host font configuration. Font loading itself is Designer/Viewer-owned, not Contribution-owned.
- `packages/designer/src/contributions/types.ts` for `Contribution`, `ContributionContext`, `PanelDescriptor`, `ToolbarActionDescriptor`, and `Command`.
- `packages/designer/src/contributions/contribution-registry.ts` for lifecycle, duplicate-id behavior, command dispatch, and disposal.
- `packages/designer/src/interactions/interaction-service.ts` for the host-controlled confirmation bridge.
- `packages/designer/src/components/EasyInkDesigner.vue` for activation, panel Teleport mounting, and unmount disposal.
- `packages/designer/src/components/TopBarB.vue` for toolbar action rendering and click dispatch.
- `packages/assistant/designer-bridge/src/contribution.ts` for a real contribution with command, toolbar action, panel state, reactive props, and async Vue panel loading.

## Workflow

1. Confirm this is not material work. Contribution is right for buttons, panels, commands, diagnostic forwarding, host workflows, and AI/review/assets panels that operate around existing Designer state.
2. Define stable ids for the contribution and every registered panel, toolbar action, and command. Use namespaced ids such as `audit.openPanel` or `asset.panel`.
3. Register capabilities only inside `activate(ctx)`. Keep setup predictable and let `ContributionRegistry` own registration and disposal.
4. Put reusable behavior behind `registerCommand()`. Toolbar actions and panels should call `ctx.executeCommand()` when they need the same action.
5. Use `registerToolbarAction()` only for explicit triggers. Keep real workflow logic in commands, panel components, or host services.
6. Use `registerPanel()` for long-lived UI such as AI assistants, review inspectors, asset browsers, and audit panels. Pass Vue components and stable props; prefer `defineAsyncComponent()` for heavier panels.
7. Keep host-owned state in the contribution closure, Vue component state, or a host service. Do not serialize panel visibility, temporary review results, external subscriptions, or business workflow state into `MaterialNode` or `DocumentSchema`.
8. Use `ctx.store` through public Designer store APIs. Read schema, selection, diagnostics, and workbench state as needed, but avoid depending on private internals.
9. Use `ctx.confirm()` for contribution-owned destructive actions that need user consent. Let the host `interactionProvider` decide the UI, permission, audit, or bypass behavior.
10. Use `ctx.onDiagnostic()` for observability bridges, toasts, logs, Sentry/APM, or review panels that need recoverable Designer errors, including `source: 'font'` warnings from failed Designer font loads.
11. Register every external listener, timer, subscription, or temporary resource with `ctx.onDispose()` cleanup.
12. Test activation, duplicate id behavior when relevant, command execution, toolbar click wiring, panel props/state, confirmation branching, diagnostic unsubscribe, and unmount cleanup.

## Reference Files

Load only the reference needed for the current task:

- `references/architecture.md`: Contribution boundaries, state ownership, lifecycle, and Designer integration points.
- `references/development-flow.md`: implementation patterns for commands, toolbar actions, panels, diagnostics, host state, i18n, and tests.
- `references/case-studies.md`: distilled lessons from the AI contribution and common extension shapes.

## Hard Rules

- Do not add a new material type, `MaterialNode`, Viewer renderer, or `createDefaultNode()` from this skill. Use `$easyink-material-dev` for that.
- Do not store transient contribution state in Schema. Schema is for template content; contribution state belongs to the contribution, panel, host, or preference layer.
- Do not register panels, toolbar actions, or commands outside `activate(ctx)`.
- Do not put complex business logic directly in a toolbar `onClick`; call a command or panel-owned action.
- Do not call browser-native confirmation APIs from a contribution. Use `ctx.confirm()` so host apps keep control of destructive UX.
- Do not implement a parallel font loading/injection pipeline from a contribution. Host font catalogs belong in `EasyInkDesigner.fontProvider`; material font fields and Viewer output are handled by the shared font chain.
- Do not ignore returned unsubscriptions. Register cleanup with `ctx.onDispose()`.
- Keep descriptor ids unique and stable. Duplicate panel, toolbar action, or command ids throw.
- Prefer locale keys for visible labels and tooltips when the contribution is shipped as part of EasyInk.
- Avoid forking Designer internals for host workflows. Use Contribution until the feature truly changes core Designer behavior.
