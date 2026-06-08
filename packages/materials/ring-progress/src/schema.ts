import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const RING_PROGRESS_TYPE = 'ring-progress'

export interface RingProgressProps {
  value: number
  progressWidth: number
  trackColor: string
  progressColor: string
  suffix: string
  showText: boolean
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  color: string
}

export const RING_PROGRESS_DEFAULTS: RingProgressProps = {
  value: 65,
  progressWidth: 3,
  trackColor: '#e5e7eb',
  progressColor: '#2f80ed',
  suffix: '%',
  showText: true,
  fontSize: 5,
  fontFamily: '',
  fontWeight: 'bold',
  fontStyle: 'normal',
  color: '#1f2937',
}

export function createRingProgressNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const partialNode = partial ? { ...partial } : undefined
  const partialProps = (partial?.props ?? {}) as Partial<RingProgressProps>

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('ringp'),
    type: RING_PROGRESS_TYPE,
    x: 0,
    y: 0,
    width: c(36),
    height: c(36),
    props: {
      ...RING_PROGRESS_DEFAULTS,
      progressWidth: c(RING_PROGRESS_DEFAULTS.progressWidth),
      fontSize: c(RING_PROGRESS_DEFAULTS.fontSize),
      ...partialProps,
    },
    ...partialNode,
  }
}

export const RING_PROGRESS_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
  keepAspectRatio: true,
}
