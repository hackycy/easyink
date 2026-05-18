import type { BindingRef, MaterialNode, TableTypography } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const FLOW_ROW_TYPE = 'flow-row'

export type FlowRowWrapMode = 'inline' | 'block'

export interface FlowColumnDef {
  ratio: number
  textAlign: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  binding?: BindingRef
  content?: string
  wrapMode: FlowRowWrapMode
}

export interface FlowRowProps {
  columns: FlowColumnDef[]
  gap: number
  paddingX: number
  paddingY: number
  /** @deprecated Use paddingX and paddingY. Kept for older schemas. */
  padding?: number
  typography: TableTypography
  backgroundColor: string
}

export const FLOW_ROW_TYPOGRAPHY_DEFAULTS: TableTypography = {
  fontSize: 3.18,
  color: '#000000',
  fontWeight: 'normal',
  fontStyle: 'normal',
  lineHeight: 1.2,
  letterSpacing: 0,
  textAlign: 'left',
  verticalAlign: 'top',
}

export const FLOW_ROW_DEFAULT_COLUMNS: FlowColumnDef[] = [
  { ratio: 0.44, textAlign: 'left', verticalAlign: 'middle', wrapMode: 'block', content: '商品名称' },
  { ratio: 0.12, textAlign: 'center', verticalAlign: 'middle', wrapMode: 'inline', content: '1' },
  { ratio: 0.20, textAlign: 'right', verticalAlign: 'middle', wrapMode: 'inline', content: '12.00' },
  { ratio: 0.24, textAlign: 'right', verticalAlign: 'middle', wrapMode: 'inline', content: '12.00' },
]

export const FLOW_ROW_DEFAULTS: FlowRowProps = {
  columns: FLOW_ROW_DEFAULT_COLUMNS,
  gap: 1,
  paddingX: 1,
  paddingY: 1,
  typography: { ...FLOW_ROW_TYPOGRAPHY_DEFAULTS },
  backgroundColor: '',
}

export const FLOW_ROW_CAPABILITIES = {
  bindable: true,
  rotatable: false,
  resizable: true,
  supportsChildren: false,
  supportsAnimation: false,
  supportsUnionDrop: false,
  multiBinding: true,
}

export function cloneFlowColumns(columns: FlowColumnDef[]): FlowColumnDef[] {
  return columns.map(column => ({
    ...column,
    binding: column.binding ? { ...column.binding } : undefined,
  }))
}

export function createFlowRowNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const rawPartialProps = (partial?.props ?? {}) as Partial<FlowRowProps>
  const { padding: legacyPadding, ...partialProps } = rawPartialProps
  const defaultProps: FlowRowProps = {
    ...FLOW_ROW_DEFAULTS,
    gap: c(FLOW_ROW_DEFAULTS.gap),
    paddingX: c(FLOW_ROW_DEFAULTS.paddingX),
    paddingY: c(FLOW_ROW_DEFAULTS.paddingY),
    typography: {
      ...FLOW_ROW_TYPOGRAPHY_DEFAULTS,
      fontSize: c(FLOW_ROW_TYPOGRAPHY_DEFAULTS.fontSize),
      letterSpacing: c(FLOW_ROW_TYPOGRAPHY_DEFAULTS.letterSpacing),
    },
    columns: cloneFlowColumns(FLOW_ROW_DEFAULT_COLUMNS),
  }

  if (partialNode)
    delete partialNode.props

  return {
    id: generateId('fr'),
    type: FLOW_ROW_TYPE,
    x: 0,
    y: 0,
    width: c(72),
    height: c(26.3),
    props: {
      ...defaultProps,
      ...partialProps,
      typography: {
        ...defaultProps.typography,
        ...(partialProps.typography ?? {}),
      },
      columns: cloneFlowColumns(partialProps.columns ?? FLOW_ROW_DEFAULT_COLUMNS),
      paddingX: partialProps.paddingX ?? legacyPadding ?? defaultProps.paddingX,
      paddingY: partialProps.paddingY ?? legacyPadding ?? defaultProps.paddingY,
      backgroundColor: partialProps.backgroundColor ?? FLOW_ROW_DEFAULTS.backgroundColor,
    },
    ...partialNode,
  }
}
