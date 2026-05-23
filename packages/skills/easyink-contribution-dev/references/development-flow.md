# Contribution Development Flow

## Package Shape

Host-owned contributions can live in the host app. Built-in EasyInk contributions should follow the AI package shape:

- `src/contribution.ts`: factory that returns a `Contribution`.
- `src/components/*.vue`: panel UI.
- `src/index.ts`: public exports.
- tests near the contribution or package surface when behavior is reusable.

Keep the contribution factory small. Put large UI and service logic in components or host services.

## Command Pattern

Commands are the stable invocation surface. Use them when an action may be called from a toolbar action, panel, shortcut, test, or another contribution.

```ts
ctx.registerCommand<{ templateId: string }, void>({
  id: 'review.openTemplate',
  handler: async (args, contributionCtx) => {
    const schema = contributionCtx.store.schema
    await openReview(args.templateId, schema)
  },
})
```

Rules:

- Namespace ids by feature.
- Keep args serializable when practical.
- Return a result only when another caller needs it.
- Throw meaningful errors; command execution already returns a Promise.

## Toolbar Action Pattern

Toolbar actions are entry points, not workflow containers.

```ts
ctx.registerToolbarAction({
  id: 'review.toggle',
  icon: IconSparkles,
  label: 'designer.review.title',
  onClick: () => {
    void ctx.executeCommand('review.togglePanel')
  },
})
```

Rules:

- Use a Vue component icon.
- Treat `label` as tooltip/accessibility text; prefer locale keys in shipped packages.
- Keep `onClick` thin.

## Panel Pattern

Panels are for workflows that need durable UI.

```ts
const ReviewPanel = defineAsyncComponent(() => import('./components/ReviewPanel.vue'))

export function createReviewContribution(): Contribution {
  const open = ref(false)

  return {
    id: 'easyink.review',
    activate(ctx) {
      ctx.registerCommand({
        id: 'review.togglePanel',
        handler: () => {
          open.value = !open.value
        },
      })

      ctx.registerPanel({
        id: 'review.panel',
        component: ReviewPanel,
        props: {
          get 'open'() {
            return open.value
          },
          'onUpdate:open': (next: boolean) => {
            open.value = next
          },
        },
      })

      ctx.onDispose(() => {
        open.value = false
      })
    },
  }
}
```

Rules:

- Prefer `defineAsyncComponent()` for heavy panels.
- Pass `store` implicitly through panel mounting; `EasyInkDesigner` adds it to panel props.
- Use getter props or refs when panel state must stay reactive across the descriptor boundary.
- Keep panel layout pointer-safe; the overlay root defaults to pointer-events none and mounted children receive pointer events.

## Diagnostics Pattern

Use diagnostics for host observability and review experiences.

```ts
const unsubscribe = ctx.onDiagnostic((entry) => {
  logger.warn('designer diagnostic', entry)
})

ctx.onDispose(unsubscribe)
```

The registry also auto-disposes diagnostic subscriptions, but explicitly registering returned cleanup keeps intent obvious and works for non-diagnostic subscriptions too.

Font loading failures surface through Designer diagnostics with `source: 'font'`. A contribution may forward them to logging, toast UI, or a review panel, but passive diagnostic handling should not mutate Schema or attempt to reload/inject fonts. Host font configuration belongs to `EasyInkDesigner.fontProvider`.

## Confirmation Pattern

Use `ctx.confirm()` for contribution-owned destructive actions. Keep the request id stable, localize visible text, and pass payload details that help the host make policy decisions.

```ts
ctx.registerCommand({
  id: 'review.applyFix',
  async handler(args, ctx) {
    const confirmed = await ctx.confirm({
      id: 'review.applyFix',
      title: ctx.store.t('designer.dialog.confirm'),
      message: 'Apply this fix to the current template?',
      severity: 'warning',
      payload: args,
    })

    if (confirmed) {
      // mutate template through store or commands here
    }
  },
})
```

Do not call browser-native confirmation APIs from contributions. Host apps may use `interactionProvider` to show their own dialog, run permission checks, add audit metadata, or cancel actions globally.

## Store Usage

Good contribution store usage:

- read current schema, selected elements, diagnostics, or workbench state
- call public store APIs such as `setSchema()`, `addElement()`, `updateElement()`, or `removeElement()`
- route undoable template edits through established store or command APIs

Risky store usage:

- mutating private fields directly
- replacing internal services
- bypassing `fontProvider` / `FontManager` by injecting font CSS from a contribution
- storing host workflow state inside `schema.extensions` just to preserve a panel session
- relying on DOM structure when a context API exists

## i18n

For EasyInk-shipped contributions, add locale keys for visible labels, toolbar tooltips, panel titles, empty states, and error messages. Host-only contributions may use host i18n, but should still avoid hardcoded mixed-language UI in shared packages.

## Testing

Choose the smallest useful surface:

- `ContributionRegistry` activation registers expected descriptors.
- Duplicate panel/action/command ids throw when relevant.
- `executeCommand()` invokes the command with args and context.
- Toolbar `onClick` calls the expected command.
- Panel props reflect closure state and update callbacks work.
- Confirmation-dependent commands call `ctx.confirm()` and branch on true/false.
- Diagnostic subscriptions receive entries and unsubscribe on dispose.
- `dispose()` clears descriptors and resets contribution state.

When a contribution mutates template content, also test the resulting Schema and undo behavior at the store level.
