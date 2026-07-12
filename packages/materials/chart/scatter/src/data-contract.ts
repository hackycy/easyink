import type { ChartScatterPoint } from '@easyink/material-chart-kernel'
import type { MaterialNode } from '@easyink/schema'
import type { ChartScatterProps } from './schema'
import { resolveMaterialDataContract } from '@easyink/core'

export const CHART_SCATTER_DATA_CONTRACT = {
  version: 3,
  model: {
    kind: 'tabular',
    fields: {
      x: {
        labelKey: 'materials.chartScatter.data.x',
        type: 'number',
        required: true,
        format: 'raw',
      },
      y: {
        labelKey: 'materials.chartScatter.data.y',
        type: 'number',
        required: true,
        format: 'raw',
      },
      label: {
        labelKey: 'materials.chartScatter.data.label',
        type: 'string',
        required: false,
        format: 'display',
      },
      color: {
        labelKey: 'materials.chartScatter.data.color',
        type: 'string',
        required: false,
        format: 'display',
      },
    },
  },
} as const

export interface ChartScatterResolvedData {
  data: ChartScatterPoint[]
  diagnostics: ChartScatterDataDiagnostic[]
  mode: 'contract' | 'empty'
}

export interface ChartScatterDataDiagnostic {
  code: string
  message: string
  severity: 'warning'
  fieldId?: string
  cause?: unknown
}

export function resolveChartScatterRuntimeData(
  node: MaterialNode,
  _props: ChartScatterProps,
  runtimeData: Record<string, unknown>,
): ChartScatterResolvedData {
  const resolution = resolveMaterialDataContract(CHART_SCATTER_DATA_CONTRACT, node.bindings.value, runtimeData)
  const diagnostics: ChartScatterDataDiagnostic[] = [...resolution.diagnostics]
  const data = resolution.records
    .map((record, index) => readPointFromTargetRecord(record, index))
    .filter((point): point is ChartScatterPoint => !!point)

  if (data.length === 0 && resolution.records.length > 0) {
    diagnostics.push({
      code: 'CHART_SCATTER_NO_VALID_POINTS',
      severity: 'warning',
      message: 'Chart scatter data contract resolved no valid numeric points.',
    })
  }

  return {
    data,
    diagnostics,
    mode: data.length > 0 ? 'contract' : 'empty',
  }
}

function readPointFromTargetRecord(record: Record<string, unknown>, index: number): ChartScatterPoint | null {
  const x = typeof record.x === 'number' && Number.isFinite(record.x)
    ? record.x
    : undefined
  const y = typeof record.y === 'number' && Number.isFinite(record.y)
    ? record.y
    : undefined
  if (x === undefined || y === undefined)
    return null

  const label = record.label == null || record.label === '' ? `Point ${index + 1}` : String(record.label)
  const color = readColor(record.color)
  return {
    x,
    y,
    label,
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
