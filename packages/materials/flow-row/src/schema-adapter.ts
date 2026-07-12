import type { AdaptableMaterialNode, BindingExpression, MaterialSchemaIssue, SchemaAdapter } from '@easyink/core'
import type { FlowColumnDef, FlowRowProps } from './schema'
import { FLOW_ROW_DEFAULTS, FLOW_ROW_TYPOGRAPHY_DEFAULTS } from './schema'

export const flowRowSchemaAdapter: SchemaAdapter = {
  currentModelVersion: 1,
  modelUnitPolicy: 'independent',
  migrations: [{
    from: 0,
    to: 1,
    migrate(node) {
      const { padding, ...model } = node.model as Record<string, unknown>
      const legacyPadding = finiteOrUndefined(padding)
      const bindings = { ...node.bindings } as Record<string, BindingExpression>
      const columns = Array.isArray(model.columns)
        ? model.columns.map((value, index) => migrateColumn(value, index, bindings))
        : model.columns
      return {
        ...node,
        modelVersion: 1,
        bindings,
        model: {
          ...model,
          columns,
          paddingX: finiteOrUndefined(model.paddingX) ?? legacyPadding ?? FLOW_ROW_DEFAULTS.paddingX,
          paddingY: finiteOrUndefined(model.paddingY) ?? legacyPadding ?? FLOW_ROW_DEFAULTS.paddingY,
        },
      }
    },
  }],
  validateInput: validateFlowRowInputByVersion,
  normalize: node => ({ ...node, model: normalizeFlowRowModelV1(node.model) as unknown as Record<string, unknown> }),
  validate: validateFlowRowV1Node,
  introspect(node) {
    const model = node.model as unknown as FlowRowProps
    const boundColumns = model.columns.flatMap((column, index) => {
      const port = column.bindingPort
      const binding = port ? node.bindings[port] as BindingExpression | undefined : undefined
      return port && binding ? [{ column, index, port, binding }] : []
    })
    return {
      identities: [
        ...model.columns.map((column, index) => ({
          path: `/model/columns/${index}/id` as const,
          location: 'value' as const,
          value: column.id,
          target: { scope: 'material' as const, kind: 'flow-row.column' },
        })),
        ...boundColumns.map(({ port }) => ({
          path: `/bindings/${escapePointer(port)}` as `/${string}`,
          location: 'key' as const,
          value: port,
          target: { scope: 'material' as const, kind: 'flow-row.binding-port' },
        })),
      ],
      structures: [],
      references: boundColumns.map(({ index, port }) => ({
        path: `/model/columns/${index}/bindingPort` as const,
        location: 'value' as const,
        value: port,
        target: { scope: 'material' as const, kind: 'flow-row.binding-port' },
        required: true,
      })),
      resources: model.typography.fontFamily
        ? [{ path: '/model/typography/fontFamily' as const, value: model.typography.fontFamily, kind: 'font' as const }]
        : [],
      bindings: boundColumns.map(({ binding, port }) => ({
        path: `/bindings/${escapePointer(port)}` as `/${string}`,
        value: binding,
        port,
      })),
    }
  },
}

export function normalizeFlowRowModelV1(input: Record<string, unknown>): FlowRowProps {
  const { padding: _padding, ...raw } = input
  const typography = isRecord(raw.typography) ? raw.typography : {}
  const sourceColumns = Array.isArray(raw.columns) && raw.columns.length > 0
    ? raw.columns
    : FLOW_ROW_DEFAULTS.columns
  return {
    columns: sourceColumns.map(normalizeColumn),
    gap: Math.max(0, finite(raw.gap, FLOW_ROW_DEFAULTS.gap)),
    paddingX: Math.max(0, finite(raw.paddingX, FLOW_ROW_DEFAULTS.paddingX)),
    paddingY: Math.max(0, finite(raw.paddingY, FLOW_ROW_DEFAULTS.paddingY)),
    typography: {
      ...FLOW_ROW_TYPOGRAPHY_DEFAULTS,
      ...typography,
      fontFamily: typeof typography.fontFamily === 'string' ? typography.fontFamily : FLOW_ROW_TYPOGRAPHY_DEFAULTS.fontFamily,
      fontSize: Math.max(0.1, finite(typography.fontSize, FLOW_ROW_TYPOGRAPHY_DEFAULTS.fontSize)),
      lineHeight: Math.max(0.1, finite(typography.lineHeight, FLOW_ROW_TYPOGRAPHY_DEFAULTS.lineHeight)),
      letterSpacing: finite(typography.letterSpacing, FLOW_ROW_TYPOGRAPHY_DEFAULTS.letterSpacing),
    },
    backgroundColor: typeof raw.backgroundColor === 'string' ? raw.backgroundColor : FLOW_ROW_DEFAULTS.backgroundColor,
  }
}

function migrateColumn(value: unknown, index: number, bindings: Record<string, BindingExpression>): Record<string, unknown> {
  const column = isRecord(value) ? value : {}
  const { binding, ...layout } = column
  const id = typeof column.id === 'string' && column.id ? column.id : `legacy-${index}`
  const requestedBindingPort = typeof column.bindingPort === 'string' && column.bindingPort
    ? column.bindingPort
    : isRecord(binding) ? `flow-port:legacy-${index}` : undefined
  const bindingPort = requestedBindingPort && isBinding(binding)
    ? allocateBindingPort(requestedBindingPort, binding, bindings)
    : requestedBindingPort
  if (bindingPort && isBinding(binding) && !Object.hasOwn(bindings, bindingPort))
    bindings[bindingPort] = cloneBinding(binding)
  return { ...layout, id, ...(bindingPort ? { bindingPort } : {}) }
}

function allocateBindingPort(
  requested: string,
  binding: BindingExpression,
  bindings: Record<string, BindingExpression>,
): string {
  let candidate = requested
  let suffix = 0
  while (Object.hasOwn(bindings, candidate)) {
    if (sameValue(bindings[candidate], binding))
      return candidate
    suffix += 1
    candidate = `${requested}:${suffix}`
  }
  return candidate
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right))
    return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]))
  }
  if (!isRecord(left) || !isRecord(right))
    return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]))
}

function normalizeColumn(value: unknown, index: number): FlowColumnDef {
  const column = isRecord(value) ? value : {}
  const id = typeof column.id === 'string' && column.id ? column.id : `default-${index}`
  return {
    id,
    ratio: Math.max(0.0001, finite(column.ratio, 1)),
    textAlign: column.textAlign === 'center' || column.textAlign === 'right' ? column.textAlign : 'left',
    verticalAlign: column.verticalAlign === 'top' || column.verticalAlign === 'bottom' ? column.verticalAlign : 'middle',
    content: typeof column.content === 'string' ? column.content : '',
    wrapMode: column.wrapMode === 'block' ? 'block' : 'inline',
    ...(typeof column.bindingPort === 'string' && column.bindingPort ? { bindingPort: column.bindingPort } : {}),
  }
}

function validateFlowRowInputByVersion(node: AdaptableMaterialNode): readonly MaterialSchemaIssue[] {
  if (node.modelVersion !== 0 && node.modelVersion !== 1)
    return [issue('FLOW_ROW_MODEL_VERSION_UNSUPPORTED', '/model', 'Flow-row modelVersion must be 0 or 1')]
  if (!isRecord(node.model))
    return [issue('FLOW_ROW_MODEL_INVALID', '/model', 'Flow-row model must be an object')]
  if (node.modelVersion === 0 && node.model.padding !== undefined && finiteOrUndefined(node.model.padding) === undefined)
    return [issue('FLOW_ROW_PADDING_INVALID', '/model/padding', 'Flow-row padding must be finite')]
  if (node.modelVersion === 1 && Object.hasOwn(node.model, 'padding'))
    return [issue('FLOW_ROW_PADDING_LEGACY', '/model/padding', 'Flow-row v1 does not allow padding')]
  for (const axis of ['paddingX', 'paddingY'] as const) {
    if (node.model[axis] !== undefined && finiteOrUndefined(node.model[axis]) === undefined)
      return [issue('FLOW_ROW_PADDING_INVALID', `/model/${axis}`, `Flow-row ${axis} must be finite`)]
  }
  if (!Array.isArray(node.model.columns))
    return []
  const ids = new Set<string>()
  for (const [index, value] of node.model.columns.entries()) {
    if (!isRecord(value))
      return [issue('FLOW_ROW_COLUMN_INVALID', `/model/columns/${index}`, 'Flow-row column must be an object')]
    if (node.modelVersion === 1 && Object.hasOwn(value, 'binding'))
      return [issue('FLOW_ROW_COLUMN_BINDING_LEGACY', `/model/columns/${index}/binding`, 'Flow-row v1 does not allow column binding')]
    if (node.modelVersion === 1) {
      if (typeof value.id !== 'string' || !value.id)
        return [issue('FLOW_ROW_COLUMN_ID_INVALID', `/model/columns/${index}/id`, 'Flow-row column id is required')]
      if (ids.has(value.id))
        return [issue('FLOW_ROW_COLUMN_ID_DUPLICATE', `/model/columns/${index}/id`, 'Flow-row column ids must be unique')]
      ids.add(value.id)
      if (value.bindingPort !== undefined && (typeof value.bindingPort !== 'string' || !value.bindingPort))
        return [issue('FLOW_ROW_BINDING_PORT_INVALID', `/model/columns/${index}/bindingPort`, 'Flow-row bindingPort must be a non-empty string')]
    }
  }
  return []
}

function validateFlowRowV1Node(node: AdaptableMaterialNode): readonly MaterialSchemaIssue[] {
  const issues = [...validateFlowRowInputByVersion(node)]
  if (issues.length > 0)
    return issues
  const referenced = new Set<string>()
  const columns = Array.isArray(node.model.columns) ? node.model.columns : []
  for (const [index, value] of columns.entries()) {
    if (!isRecord(value) || typeof value.bindingPort !== 'string' || !value.bindingPort)
      continue
    referenced.add(value.bindingPort)
    if (!Object.hasOwn(node.bindings, value.bindingPort))
      issues.push(issue('FLOW_ROW_BINDING_PORT_MISSING', `/model/columns/${index}/bindingPort`, 'Flow-row bindingPort must reference a binding'))
  }
  for (const port of Object.keys(node.bindings)) {
    if (port.startsWith('flow-port:') && !referenced.has(port))
      issues.push(issue('FLOW_ROW_BINDING_PORT_ORPHAN', `/bindings/${escapePointer(port)}`, 'Flow-row binding port is orphaned'))
  }
  return issues
}

function cloneBinding(binding: BindingExpression): BindingExpression {
  return {
    ...binding,
    ...(binding.format ? { format: { ...binding.format, ...(binding.format.preset ? { preset: { ...binding.format.preset } } : {}) } } : {}),
    ...(binding.extensions ? { extensions: { ...binding.extensions } } : {}),
  }
}

function isBinding(value: unknown): value is BindingExpression {
  return isRecord(value) && typeof value.sourceId === 'string' && typeof value.fieldPath === 'string'
}

function finite(value: unknown, fallback: number): number {
  return finiteOrUndefined(value) ?? fallback
}

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function issue(code: string, path: `/${string}`, message: string): MaterialSchemaIssue {
  return { code, severity: 'error', path, message }
}
