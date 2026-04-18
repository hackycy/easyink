import type { BehaviorContext, BehaviorEvent, BehaviorRegistration } from '@easyink/core'

/**
 * Dispatch a BehaviorEvent through a chain of registered behaviors (Koa-style).
 * Behaviors are filtered by selectionTypes and eventKinds, then sorted by priority.
 */
export function dispatchBehaviorEvent(
  event: BehaviorEvent,
  behaviors: BehaviorRegistration[],
  context: Omit<BehaviorContext, 'event' | 'meta'>,
): void {
  const currentSelection = context.selectionStore.selection
  const currentType = currentSelection?.type

  // Filter behaviors: match eventKinds and selectionTypes
  const applicable = behaviors.filter((b) => {
    if (b.eventKinds && !b.eventKinds.includes(event.kind))
      return false
    if (b.selectionTypes && (!currentType || !b.selectionTypes.includes(currentType)))
      return false
    return true
  })

  // Sort by priority (lower = earlier)
  applicable.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  // Build Koa-style chain
  const meta: Record<string, unknown> = {}
  const ctx: BehaviorContext = { ...context, event, meta }

  let index = 0
  const next = async (): Promise<void> => {
    if (index >= applicable.length)
      return
    const behavior = applicable[index++]!
    await behavior.middleware(ctx, next)
  }

  // Fire and forget (behaviors are synchronous in practice for pointer/key events)
  next().catch((err) => {
    console.error('[EasyInk] Behavior middleware error:', err)
  })
}
