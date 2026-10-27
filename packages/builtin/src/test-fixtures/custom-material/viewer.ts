import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import { badgeModel } from './model'

export const badge: ViewerMaterial = {
  model: badgeModel,
  renderer: {
    createSession: (resources) => {
      const elements: HTMLElement[] = []
      resources.onDispose(async () => {
        await Promise.resolve()
        for (const element of elements)
          element.removeAttribute('data-badge-live')
      })
      return {
        render: (_node, context) => {
          const element = context.document.createElement('span')
          element.dataset.badgeLive = 'true'
          element.textContent = String(context.resolvedProps.label)
          elements.push(element)
          return { element }
        },
      }
    },
  },
}
