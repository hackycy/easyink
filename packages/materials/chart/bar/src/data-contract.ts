import type { ChartCategoryValuePoint } from '@easyink/material-chart-kernel'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { ChartBarProps } from './schema'
import {
  extractCollectionPath,
  getMaterialDataSlot,
  resolveBindingValue,
  resolveFieldFromRecord,
  resolveMaterialDataContract,
} from '@easyink/core'
import { normalizeCategoryValueData } from '@easyink/material-chart-kernel'
import { FIELD_PATH_SEPARATOR } from '@easyink/shared'

export const CHART_BAR_DATA_CONTRACT = {
  version: 1,
  slots: [
    { id: 'category', label: '分类字段', required: true, kind: 'field', scope: 'series', bindIndex: 0 },
    { id: 'value', label: '数值字段', required: true, kind: 'field', scope: 'series', valueType: 'number', bindIndex: 1 },
  ],
} as const

export interface ChartBarResolvedData {
  data: ChartCategoryValuePoint[]
  diagnostics: ChartBarDataDiagnostic[]
  mode: 'contract' | 'legacy' | 'empty'
}

export interface ChartBarDataDiagnostic {
  code: string
  message: string
  severity: 'warning'
  slotId?: string
  cause?: unknown
}

export function resolveChartBarRuntimeData(
  node: MaterialNode,
  props: ChartBarProps,
  runtimeData: Record<string, unknown>,
): ChartBarResolvedData {
  if (!hasChartBarContractBinding(node.binding)) {
    const legacyData = readLegacyRuntimeData(props)
    return {
      data: legacyData === undefined ? [] : normalizeCategoryValueData(legacyData, []),
      diagnostics: [],
      mode: legacyData === undefined ? 'empty' : 'legacy',
    }
  }

  const resolution = resolveMaterialDataContract(CHART_BAR_DATA_CONTRACT, node.binding, runtimeData)
  const categorySlot = getMaterialDataSlot(resolution, 'category')
  const valueSlot = getMaterialDataSlot(resolution, 'value')

  const diagnostics: ChartBarDataDiagnostic[] = [...resolution.diagnostics]
  const categoryBinding = categorySlot?.binding
  const valueBinding = valueSlot?.binding
  if (!categoryBinding || !valueBinding)
    return { data: [], diagnostics, mode: 'contract' }

  if (categoryBinding.sourceId !== valueBinding.sourceId) {
    diagnostics.push({
      code: 'CHART_BAR_SOURCE_MISMATCH',
      severity: 'warning',
      message: 'Chart bar category and value fields must come from the same data source.',
    })
    return { data: [], diagnostics, mode: 'contract' }
  }

  const collectionPath = extractCollectionPath([categoryBinding.fieldPath, valueBinding.fieldPath])
  if (!collectionPath) {
    diagnostics.push({
      code: 'CHART_BAR_FIELD_SCOPE_MISMATCH',
      severity: 'warning',
      message: 'Chart bar category and value fields must share the same inferred collection path.',
    })
    return { data: [], diagnostics, mode: 'contract' }
  }

  const collection = resolveBindingValue({ sourceId: categoryBinding.sourceId, fieldPath: collectionPath }, runtimeData)
  if (!Array.isArray(collection)) {
    diagnostics.push({
      code: 'CHART_BAR_COLLECTION_NOT_ARRAY',
      severity: 'warning',
      message: 'Chart bar inferred collection path must resolve to an array.',
    })
    return { data: [], diagnostics, mode: 'contract' }
  }

  const categoryPath = toLeafPath(categoryBinding.fieldPath, collectionPath)
  const valuePath = toLeafPath(valueBinding.fieldPath, collectionPath)

  const points = collection
    .map((record, index) => readPointFromRecord(record, categoryPath, valuePath, index))
    .filter((point): point is ChartCategoryValuePoint => !!point)

  if (points.length === 0 && collection.length > 0) {
    diagnostics.push({
      code: 'CHART_BAR_NO_VALID_POINTS',
      severity: 'warning',
      message: 'Chart bar data contract resolved no valid numeric points.',
    })
  }

  return { data: points, diagnostics, mode: 'contract' }
}

export function hasChartBarContractBinding(bindings: BindingRef | BindingRef[] | undefined): boolean {
  const refs = normalizeBindings(bindings)
  return refs.length > 1 || refs.some(ref => ref.bindIndex !== undefined)
}

function readPointFromRecord(record: unknown, categoryPath: string, valuePath: string, index: number): ChartCategoryValuePoint | null {
  if (!isRecord(record))
    return null
  const value = toFiniteNumber(resolveFieldFromRecord(valuePath, record))
  if (value === undefined)
    return null
  const label = resolveFieldFromRecord(categoryPath, record)
  return {
    label: label == null || label === '' ? `Item ${index + 1}` : String(label),
    value,
  }
}

function readLegacyRuntimeData(props: ChartBarProps): unknown {
  const maybeResolved = props as ChartBarProps & { content?: unknown, data?: unknown }
  return maybeResolved.content ?? maybeResolved.data
}

function toFiniteNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function normalizeBindings(bindings: BindingRef | BindingRef[] | undefined): BindingRef[] {
  if (!bindings)
    return []
  return Array.isArray(bindings) ? bindings : [bindings]
}

function toLeafPath(fieldPath: string, collectionPath: string): string {
  const prefix = `${collectionPath}${FIELD_PATH_SEPARATOR}`
  return fieldPath.startsWith(prefix) ? fieldPath.slice(prefix.length) : fieldPath
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
