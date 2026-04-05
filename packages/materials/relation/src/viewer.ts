import type { MaterialNode } from '@easyink/schema'
import type { RelationProps } from './schema'

export function renderRelation(node: MaterialNode) {
  const props = node.props as unknown as RelationProps

  return {
    html: `<div style="
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    ">[Relation: ${props.relationType}]</div>`,
  }
}
