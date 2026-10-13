import type { MaterialModel } from '@easyink/plugin-api/material'

export const badgeModel: MaterialModel = {
  type: 'vendor/badge',
  binding: { kind: 'ordinary', primaryProp: 'label', formatEditor: { tabs: ['custom'], defaultTab: 'custom' } },
  capabilities: { resizable: true },
  createDefaultNode: input => ({ id: 'badge', type: 'vendor/badge', x: 0, y: 0, width: 30, height: 10, ...input, props: { label: 'Badge', ...input?.props } }),
}
