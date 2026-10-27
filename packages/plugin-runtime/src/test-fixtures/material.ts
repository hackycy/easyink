import type { DesignerMaterial } from '@easyink/plugin-api/designer'
import type { MaterialModel } from '@easyink/plugin-api/material'
import type { ViewerMaterial } from '@easyink/plugin-api/viewer'

export function model(type: string): MaterialModel {
  return {
    type,
    binding: { kind: 'none' },
    createDefaultNode: () => ({ id: `${type}-node`, type, x: 0, y: 0, width: 20, height: 10, rotation: 0, props: {} }),
  }
}

export function viewerMaterial(type: string): ViewerMaterial {
  return { model: model(type), renderer: { render: (_node, context) => ({ element: context.document.createElement('span') }) } }
}

export function designerMaterial(type: string): DesignerMaterial {
  return { model: model(type), renderer: () => ({ renderContent: () => () => {} }) }
}
