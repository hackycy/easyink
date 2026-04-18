import type { BehaviorContext, BehaviorRegistration, Selection } from '../editing-session'

/**
 * Framework-level selection middleware.
 * On pointer-down, performs hitTest via materialGeometry and updates the selection store.
 */
export function selectionMiddleware(): BehaviorRegistration {
  return {
    id: 'framework.selection',
    eventKinds: ['pointer-down'],
    priority: -100,
    middleware: async (ctx: BehaviorContext, next) => {
      if (ctx.event.kind !== 'pointer-down') {
        await next()
        return
      }

      const { point } = ctx.event
      const localPoint = ctx.geometry.canvasToLocal(point, ctx.node)
      const hit = ctx.materialGeometry.hitTest(localPoint, ctx.node) as Selection | null

      if (hit) {
        ctx.selectionStore.set(hit)
      }

      await next()
    },
  }
}
