import type { AdaptableMaterialNode, SchemaMigration } from '@easyink/core'
import type { BindingRef, MaterialNode, TableTypography } from '@easyink/schema'
import { canonicalizeMaterialNode } from '@easyink/schema'
import { convertUnit, generateId } from '@easyink/shared'

export const FLOW_ROW_TYPE = 'flow-row'

export type FlowRowWrapMode = 'inline' | 'block'

export interface FlowColumnDef {
  id: string
  ratio: number
  textAlign: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  content?: string
  wrapMode: FlowRowWrapMode
  bindingPort?: string
}

export interface FlowRowProps {
  columns: FlowColumnDef[]
  gap: number
  paddingX: number
  paddingY: number
  typography: TableTypography
  backgroundColor: string
}

export const FLOW_ROW_TYPOGRAPHY_DEFAULTS: TableTypography = {
  fontFamily: '',
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
  { id: 'default-1', ratio: 0.44, textAlign: 'left', verticalAlign: 'middle', wrapMode: 'block', content: '商品名称' },
  { id: 'default-2', ratio: 0.12, textAlign: 'center', verticalAlign: 'middle', wrapMode: 'inline', content: '1' },
  { id: 'default-3', ratio: 0.20, textAlign: 'right', verticalAlign: 'middle', wrapMode: 'inline', content: '12.00' },
  { id: 'default-4', ratio: 0.24, textAlign: 'right', verticalAlign: 'middle', wrapMode: 'inline', content: '12.00' },
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

export function cloneFlowColumns(columns: readonly FlowColumnDef[]): FlowColumnDef[] {
  return columns.map((column, index) => ({
    id: column.id || `default-${index + 1}`,
    ratio: column.ratio,
    textAlign: column.textAlign,
    ...(column.verticalAlign !== undefined ? { verticalAlign: column.verticalAlign } : {}),
    ...(column.content !== undefined ? { content: column.content } : {}),
    wrapMode: column.wrapMode,
    ...(column.bindingPort !== undefined ? { bindingPort: column.bindingPort } : {}),
  }))
}

interface LegacyFlowColumn extends Partial<FlowColumnDef> {
  binding?: BindingRef
}

export const migrateFlowRowModelV0ToV1: SchemaMigration = {
  from: 0,
  to: 1,
  migrate(node: AdaptableMaterialNode): AdaptableMaterialNode {
    const source = node.model as Partial<FlowRowProps> & { padding?: number, columns?: LegacyFlowColumn[] }
    const { padding, columns: sourceColumns, ...sourceModel } = source
    const bindings = { ...node.bindings }
    const columns = (sourceColumns ?? FLOW_ROW_DEFAULT_COLUMNS).map((column, index): FlowColumnDef => {
      const id = typeof column.id === 'string' && column.id ? column.id : `default-${index + 1}`
      const bindingPort = typeof column.bindingPort === 'string' && column.bindingPort
        ? column.bindingPort
        : column.binding ? `column:${id}:value` : undefined
      if (bindingPort && column.binding)
        bindings[bindingPort] = { ...column.binding }
      return {
        id,
        ratio: typeof column.ratio === 'number' ? column.ratio : 1,
        textAlign: column.textAlign ?? 'left',
        ...(column.verticalAlign !== undefined ? { verticalAlign: column.verticalAlign } : {}),
        ...(column.content !== undefined ? { content: column.content } : {}),
        wrapMode: column.wrapMode ?? 'inline',
        ...(bindingPort ? { bindingPort } : {}),
      }
    })
    return {
      ...node,
      modelVersion: 1,
      model: {
        ...sourceModel,
        columns,
        paddingX: source.paddingX ?? padding ?? FLOW_ROW_DEFAULTS.paddingX,
        paddingY: source.paddingY ?? padding ?? FLOW_ROW_DEFAULTS.paddingY,
      },
      bindings,
    }
  },
}

export function createFlowRowNode(partial?: Partial<MaterialNode>, unit?: string): MaterialNode {
  const c = unit && unit !== 'mm' ? (value: number) => convertUnit(value, 'mm', unit) : (value: number) => value
  const partialNode = partial ? { ...partial } : undefined
  const rawPartialProps = (partial?.model ?? {}) as Partial<FlowRowProps>
  const { padding: _legacyPadding, ...partialModel } = rawPartialProps as Partial<FlowRowProps> & { padding?: number }
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
    delete partialNode.model

  return canonicalizeMaterialNode(FLOW_ROW_TYPE, {
    id: generateId('fr'),
    type: FLOW_ROW_TYPE,
    x: 0,
    y: 0,
    width: c(72),
    height: c(26.3),
    model: {
      ...defaultProps,
      ...partialModel,
      typography: {
        ...defaultProps.typography,
        ...(partialModel.typography ?? {}),
      },
      columns: cloneFlowColumns(partialModel.columns ?? FLOW_ROW_DEFAULT_COLUMNS),
      paddingX: partialModel.paddingX ?? defaultProps.paddingX,
      paddingY: partialModel.paddingY ?? defaultProps.paddingY,
      backgroundColor: partialModel.backgroundColor ?? FLOW_ROW_DEFAULTS.backgroundColor,
    },
    ...partialNode,
  })
}
