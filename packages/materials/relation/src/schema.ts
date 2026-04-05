import type { MaterialNode } from '@easyink/schema'
import { generateId } from '@easyink/shared'

export const RELATION_TYPE = 'relation'

export interface RelationProps {
  relationType: 'one-to-one' | 'one-to-many' | 'tree'
  sourceId: string
  targetId: string
  lineColor: string
  lineWidth: number
  lineType: 'solid' | 'dashed' | 'dotted'
}

export const RELATION_DEFAULTS: RelationProps = {
  relationType: 'one-to-one',
  sourceId: '',
  targetId: '',
  lineColor: '#000000',
  lineWidth: 1,
  lineType: 'solid',
}

export function createRelationNode(partial?: Partial<MaterialNode>): MaterialNode {
  return {
    id: generateId('relation'),
    type: RELATION_TYPE,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    props: { ...RELATION_DEFAULTS },
    ...partial,
  }
}

export const RELATION_CAPABILITIES = {
  bindable: true,
  rotatable: false,
  resizable: true,
  supportsChildren: true,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
}
