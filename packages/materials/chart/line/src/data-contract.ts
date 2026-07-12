import type { ChartCategoryValuePoint } from '@easyink/material-chart-kernel'
import type { MaterialNode } from '@easyink/schema'
import type { ChartLineProps } from './schema'
import { resolveMaterialDataContract } from '@easyink/core'

export const CHART_LINE_DATA_CONTRACT = {
  version: 3,
  model: {
    kind: 'tabular',
    fields: {
      category: {
        labelKey: 'materials.chartLine.data.category',
        type: 'string',
        required: true,
        format: 'display',
      },
      value: {
        labelKey: 'materials.chartLine.data.value',
        type: 'number',
        required: true,
        format: 'raw',
      },
    },
  },
} as const

export interface ChartLineResolvedData {
  data: ChartCategoryValuePoint[]
  diagnostics: ChartLineDataDiagnostic[]
  mode: 'contract' | 'empty'
}

export interface ChartLineDataDiagnostic {
  code: string
  message: string
  severity: 'warning'
  fieldId?: string
  cause?: unknown
}

export function resolveChartLineRuntimeData(
  node: MaterialNode,
  _props: ChartLineProps,
  runtimeData: Record<string, unknown>,
): ChartLineResolvedData {
  const resolution = resolveMaterialDataContract(CHART_LINE_DATA_CONTRACT, node.bindings.value, runtimeData)
  const diagnostics: ChartLineDataDiagnostic[] = [...resolution.diagnostics]
  const data = resolution.records
    .map((record, index) => readPointFromTargetRecord(record, index))
    .filter((point): point is ChartCategoryValuePoint => !!point)

  if (data.length === 0 && resolution.records.length > 0) {
    diagnostics.push({
      code: 'CHART_LINE_NO_VALID_POINTS',
      severity: 'warning',
      message: 'Chart line data contract resolved no valid numeric points.',
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
  return {
    label: category == null || category === '' ? `Item ${index + 1}` : String(category),
    value,
  }
}
