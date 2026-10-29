# Contribution Case Studies

## Review Panel Shape

Use this shape for template review, compliance, or preflight features:

- Contribution owns panel visibility and review result cache.
- Command starts or toggles the review workflow.
- Panel reads `store.schema` and displays findings.
- If accepting a finding changes the template, call public store APIs and verify undo behavior.
- Diagnostics can be subscribed and merged into the review view, but should remain separate from persisted Schema.

## Asset Panel Shape

Use this shape for image, icon, template, or external asset browsers:

- Contribution owns the selected remote asset and loading/error state.
- Panel handles browsing, search, and selection.
- Command or panel action applies an asset to the selected existing element.
- If applying the asset creates a new visual element, stop and reassess whether part of the work belongs in `$easyink-material-dev`.

## Diagnostic Bridge Shape

Use this shape for logging, toasts, and observability:

- Subscribe with `ctx.onDiagnostic()`.
- Forward entries to host logging, Sentry/APM, or a notification service.
- Treat font diagnostics as observability or host-configuration feedback; the fix is usually `fontProvider` data or font file access, not a Contribution-side reload.
- Register cleanup with `ctx.onDispose()`.
- Do not mutate Schema from passive diagnostic subscriptions unless the user explicitly triggers a repair action.
