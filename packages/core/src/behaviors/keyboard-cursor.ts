import type { BehaviorRegistration } from '../editing-session'

/**
 * Framework-level keyboard cursor middleware.
 * Handles Escape to exit session. Materials override specific keys in their own behaviors.
 */
export function keyboardCursorMiddleware(): BehaviorRegistration {
  return {
    id: 'framework.keyboard-cursor',
    eventKinds: ['key-down'],
    priority: 100,
    middleware: async (ctx, next) => {
      if (ctx.event.kind !== 'key-down') {
        await next()
        return
      }

      const { key } = ctx.event

      // Escape: let it fall through to the workbench fallback (CanvasWorkspace.handleKeyDown)
      // which calls editingSession.exit(). Do NOT preventDefault here.
      if (key === 'Escape') {
        return
      }

      await next()
    },
  }
}
