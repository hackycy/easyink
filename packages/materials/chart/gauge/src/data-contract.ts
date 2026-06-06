import type { ChartGaugeValuePoint } from '@easyink/material-chart-kernel'
import type { MaterialNode } from '@easyink/schema'
import type { ChartGaugeProps } from './schema'
import { resolveMaterialDataContract } from '@easyink/core'

export const CHART_GAUGE_DATA_CONTRACT = {
  version: 3,
  model: {
    kind: 'tabular',
    fields: {
      value: {
        labelKey: 'materials.chartGauge.data.value',
        type: 'number',
        required: true,
        format: 'raw',
      },
      name: {
        labelKey: 'materials.chartGauge.data.name',
        type: 'string',
        required: false,
        format: 'display',
      },
      unit: {
        labelKey: 'materials.chartGauge.data.unit',
        type: 'string',
        required: false,
        format: 'display',
      },
      color: {
        labelKey: 'materials.chartGauge.data.color',
        type: 'string',
        required: false,
        format: 'display',
      },
    },
  },
} as const

export interface ChartGaugeResolvedData {
  data: ChartGaugeValuePoint[]
  diagnostics: ChartGaugeDataDiagnostic[]
  mode: 'contract' | 'empty'
}

export interface ChartGaugeDataDiagnostic {
  code: string
  message: string
  severity: 'warning'
  fieldId?: string
  cause?: unknown
}

export function resolveChartGaugeRuntimeData(
  node: MaterialNode,
  _props: ChartGaugeProps,
  runtimeData: Record<string, unknown>,
): ChartGaugeResolvedData {
  const resolution = resolveMaterialDataContract(CHART_GAUGE_DATA_CONTRACT, node.binding, runtimeData)
  const recordPoint = resolution.records
    .map(record => readPointFromTargetRecord(record))
    .find((point): point is ChartGaugeValuePoint => !!point)
  const scalarPoint = readPointFromScalarResolution(resolution.mappings)
  const data = recordPoint ? [recordPoint] : scalarPoint ? [scalarPoint] : []
  const diagnostics: ChartGaugeDataDiagnostic[] = scalarPoint && !recordPoint
    ? resolution.diagnostics.filter(diagnostic => diagnostic.code !== 'MATERIAL_DATA_RELATION_UNRESOLVED')
    : [...resolution.diagnostics]

  if (data.length === 0 && resolution.records.length > 0) {
    diagnostics.push({
      code: 'CHART_GAUGE_NO_VALID_POINTS',
      severity: 'warning',
      message: 'Chart gauge data contract resolved no valid numeric points.',
    })
  }

  return {
    data,
    diagnostics,
    mode: data.length > 0 ? 'contract' : 'empty',
  }
}

function readPointFromTargetRecord(record: Record<string, unknown>): ChartGaugeValuePoint | null {
  const value = typeof record.value === 'number' && Number.isFinite(record.value)
    ? record.value
    : undefined
  if (value === undefined)
    return null
  return {
    value,
    ...readOptionalText('name', record.name),
    ...readOptionalText('unit', record.unit),
    ...readOptionalColor(record.color),
  }
}

function readPointFromScalarResolution(mappings: Record<string, { value: unknown }>): ChartGaugeValuePoint | null {
  const value = readNumber(mappings.value?.value)
  if (value === undefined)
    return null
  return {
    value,
    ...readOptionalText('name', mappings.name?.value),
    ...readOptionalText('unit', mappings.unit?.value),
    ...readOptionalColor(mappings.color?.value),
  }
}

function readNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN
  return Number.isFinite(numeric) ? numeric : undefined
}

function readOptionalText(key: 'name' | 'unit', value: unknown): Partial<ChartGaugeValuePoint> {
  if (value == null || value === '')
    return {}
  return { [key]: String(value) }
}

function readOptionalColor(value: unknown): Partial<ChartGaugeValuePoint> {
  const color = readColor(value)
  return {
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
