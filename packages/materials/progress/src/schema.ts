import type { MaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const PROGRESS_TYPE = 'progress'

export type ProgressTextPosition = 'top' | 'bottom'

export interface ProgressProps {
  value: number
  progressHeight: number
  trackColor: string
  progressColor: string
  suffix: string
  showText: boolean
  textPosition: ProgressTextPosition
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  color: string
}

export const PROGRESS_DEFAULTS: ProgressProps = {
  value: 65,
  progressHeight: 4,
  trackColor: '#e5e7eb',
  progressColor: '#2f80ed',
  suffix: '%',
  showText: true,
  textPosition: 'top',
  fontSize: 4,
  fontFamily: '',
  fontWeight: 'bold',
  fontStyle: 'normal',
  color: '#1f2937',
}

export function createProgressNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (v: number) => convertUnit(v, 'mm', unit) : (v: number) => v
  const partialNode = partial ? { ...partial } : undefined
  const partialProps = (partial?.props ?? {}) as Partial<ProgressProps>

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('prog'),
    type: PROGRESS_TYPE,
    x: 0,
    y: 0,
    width: c(60),
    height: c(12),
    props: {
      ...PROGRESS_DEFAULTS,
      progressHeight: c(PROGRESS_DEFAULTS.progressHeight),
      fontSize: c(PROGRESS_DEFAULTS.fontSize),
      ...partialProps,
    },
    ...partialNode,
  }
}

export const PROGRESS_CAPABILITIES = {
  bindable: true,
  rotatable: true,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: false,
  keepAspectRatio: false,
}
