import type { ChartCategoryValuePoint } from '@easyink/material-chart-kernel'
import type { MaterialNode } from '@easyink/schema'
import type { ChartPieProps } from './schema'
import { resolveMaterialDataContract } from '@easyink/core'

export const CHART_PIE_DATA_CONTRACT = {
  version: 3,
  model: {
    kind: 'tabular',
    fields: {
      category: {
        labelKey: 'materials.chartPie.data.category',
        type: 'string',
        required: true,
        format: 'display',
      },
      value: {
        labelKey: 'materials.chartPie.data.value',
        type: 'number',
        required: true,
        format: 'raw',
      },
      color: {
        labelKey: 'materials.chartPie.data.color',
        type: 'string',
        required: false,
        format: 'display',
      },
    },
  },
} as const

export interface ChartPieResolvedData {
  data: ChartCategoryValuePoint[]
  diagnostics: ChartPieDataDiagnostic[]
  mode: 'contract' | 'empty'
}

export interface ChartPieDataDiagnostic {
  code: string
  message: string
  severity: 'warning'
  fieldId?: string
  cause?: unknown
}

export function resolveChartPieRuntimeData(
  node: MaterialNode,
  _props: ChartPieProps,
  runtimeData: Record<string, unknown>,
): ChartPieResolvedData {
  const resolution = resolveMaterialDataContract(CHART_PIE_DATA_CONTRACT, node.binding, runtimeData)
  const diagnostics: ChartPieDataDiagnostic[] = [...resolution.diagnostics]
  const data = resolution.records
    .map((record, index) => readPointFromTargetRecord(record, index))
    .filter((point): point is ChartCategoryValuePoint => !!point)

  if (data.length === 0 && resolution.records.length > 0) {
    diagnostics.push({
      code: 'CHART_PIE_NO_VALID_POINTS',
      severity: 'warning',
      message: 'Chart pie data contract resolved no valid numeric points.',
    })
  }

  return {
    data,
    diagnostics,
    mode: data.length > 0 ? 'contract' : 'empty',
  }
}

function readPointFromTargetRecord(record: Record<string, unknown>, index: number): ChartCategoryValuePoint | null {
  const value = typeof record.value === 'number' && Number.isFinite(record.value)
    ? record.value
    : undefined
  if (value === undefined)
    return null
  const category = record.category
  const color = readColor(record.color)
  return {
    label: category == null || category === '' ? `Item ${index + 1}` : String(category),
    value,
    ...(color ? { color } : {}),
  }
}

function readColor(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const color = value.trim()
  return isSafeCssColor(color) ? color : undefined
}

function isSafeCssColor(value: string): boolean {
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value))
    return true
  if (/^(?:rgb|rgba|hsl|hsla)\([0-9\s,%.+-]+\)$/i.test(value))
    return true
  return /^[a-z]+$/i.test(value)
}
