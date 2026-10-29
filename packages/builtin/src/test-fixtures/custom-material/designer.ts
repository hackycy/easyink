import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import { badgeModel } from './model'

export const badge: DesignerMaterial = {
  model: badgeModel,
  renderer: (context) => {
    const mounts = new Set<HTMLElement>()
    context.onDispose(async () => {
      await Promise.resolve()
      for (const element of mounts)
        element.replaceChildren()
      mounts.clear()
    })
    return {
      renderContent: (signal, container) => {
        const update = () => {
          container.textContent = `${context.t('vendor.badge.name')}: ${signal.get().props.label}`
        }
        update()
        mounts.add(container)
        const unsubscribe = signal.subscribe(update)
        return () => {
          unsubscribe()
          mounts.delete(container)
          container.replaceChildren()
        }
      },
    }
  },
  properties: [{ key: 'label', label: 'vendor.badge.label', type: 'string' }],
  locale: { messages: { vendor: { badge: { name: 'Badge', label: 'Label', group: 'Vendor' } } } },
  ui: { palette: [
    { id: 'badge', label: 'vendor.badge.name', icon: { render: () => null }, group: { id: 'vendor', label: 'vendor.badge.group' }, order: 2 },
    { id: 'priority-badge', label: 'vendor.badge.name', icon: { render: () => null }, group: { id: 'vendor', label: 'vendor.badge.group' }, order: 1, createDefaultNode: input => badgeModel.createDefaultNode({ ...input, props: { label: 'Priority', ...input?.props } }) },
  ] },
}
