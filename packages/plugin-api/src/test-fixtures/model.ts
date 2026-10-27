import type { MaterialModel } from '@easyink/plugin-api/material'
import type { MaterialNode } from '@easyink/schema'

export const model: MaterialModel = {
  type: 'fixture',
  binding: { kind: 'none' },
  capabilities: { rotatable: true, resizable: true },
  condition: false,
  pageAware: false,
  createDefaultNode: (input = {}): MaterialNode => ({
    id: 'fixture-node',
    type: 'fixture',
    x: 0,
    y: 0,
    width: 20,
    height: 10,
    rotation: 0,
    props: {},
    ...input,
  }),
}
