import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'
import { normalizeRatingCharacter } from './rendering'

export const RATING_TYPE = 'rating'

export interface RatingProps {
  value: number
  character: string
  characterCount: number
  characterSize: number
  activeColor: string
  backgroundColor: string
}

export const RATING_DEFAULTS: RatingProps = {
  value: 65,
  character: '★',
  characterCount: 5,
  characterSize: 6,
  activeColor: '#f59e0b',
  backgroundColor: '#d1d5db',
}

export function createRatingNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const partialProps = (partial?.props ?? {}) as Partial<RatingProps>

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('rate'),
    type: RATING_TYPE,
    x: 0,
    y: 0,
    width: c(36),
    height: c(8),
    props: {
      ...RATING_DEFAULTS,
      characterSize: c(RATING_DEFAULTS.characterSize),
      ...partialProps,
      character: normalizeRatingCharacter(partialProps.character ?? RATING_DEFAULTS.character),
    },
    ...partialNode,
  }
}

export const RATING_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
  keepAspectRatio: false,
}
