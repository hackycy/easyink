import type { EChartsOption } from '@easyink/material-chart-kernel/full'
import type { MaterialNode } from '@easyink/schema'
import type { ChartCustomProps } from './schema'
import { echarts } from '@easyink/material-chart-kernel/full'
import { deepClone } from '@easyink/shared'
import { CHART_CUSTOM_DEFAULTS } from './schema'

const DEFAULT_OPTION: EChartsOption = {
  tooltip: {},
  xAxis: { type: 'category', data: ['A', 'B', 'C'] },
  yAxis: { type: 'value' },
  series: [{ type: 'bar', data: [12, 20, 15] }],
}

export interface ChartCustomOptionContext {
  data: Record<string, unknown>
  boundOption?: unknown
  hasBinding?: boolean
  props: ChartCustomProps
  node: MaterialNode
  width: number
  height: number
  unit: string
  echarts: typeof echarts
}

export interface ChartCustomOptionDiagnostic {
  code: string
  message: string
  severity: 'warning'
  cause?: unknown
}

export interface ChartCustomOptionResult {
  option: EChartsOption
  diagnostics: ChartCustomOptionDiagnostic[]
}

type OptionFactory = (ctx: ChartCustomOptionContext) => unknown

const codeCache = new Map<string, OptionFactory>()

export function resolveChartCustomOption(
  propsInput: Partial<ChartCustomProps>,
  context: Omit<ChartCustomOptionContext, 'props' | 'echarts'> & { props?: Partial<ChartCustomProps> },
): ChartCustomOptionResult {
  const props = resolveChartCustomProps({ ...propsInput, ...context.props })
  const diagnostics: ChartCustomOptionDiagnostic[] = []
  const raw = context.hasBinding && context.boundOption != null
    ? context.boundOption
    : runOptionCode(props.optionCode, { ...context, props, echarts }, diagnostics)
  const option = normalizeOption(raw, diagnostics)
  return { option: option ?? deepClone(DEFAULT_OPTION), diagnostics }
}

export function resolveChartCustomProps(props: Partial<ChartCustomProps>): ChartCustomProps {
  return {
    optionCode: typeof props.optionCode === 'string' ? props.optionCode : CHART_CUSTOM_DEFAULTS.optionCode,
    option: props.option ?? CHART_CUSTOM_DEFAULTS.option,
    backgroundColor: typeof props.backgroundColor === 'string' ? props.backgroundColor : CHART_CUSTOM_DEFAULTS.backgroundColor,
  }
}

function runOptionCode(source: string, context: ChartCustomOptionContext, diagnostics: ChartCustomOptionDiagnostic[]): unknown {
  const trimmed = source.trim()
  if (!trimmed)
    return {}

  try {
    const factory = compileOptionCode(trimmed)
    const value = factory(context)
    return typeof value === 'function'
      ? (value as OptionFactory)(context)
      : value
  }
  catch (err) {
    diagnostics.push({
      code: 'CHART_CUSTOM_OPTION_CODE_FAILED',
      severity: 'warning',
      message: err instanceof Error ? err.message : String(err),
      cause: toDiagnosticCause(err),
    })
    return {}
  }
}

function compileOptionCode(source: string): OptionFactory {
  const cached = codeCache.get(source)
  if (cached)
    return cached

  const factory = isFunctionBodySource(source)
    ? createBodyFactory(source)
    : createExpressionFactory(source)
  codeCache.set(source, factory)
  return factory
}

function isFunctionBodySource(source: string): boolean {
  return /^(?:return\b|function\s+option\b|const\b|let\b|var\b)/.test(source)
}

function createBodyFactory(source: string): OptionFactory {
  // eslint-disable-next-line no-new-func -- Trusted material option source; documented as non-sandboxed.
  const fn = new Function(
    'window',
    'document',
    'globalThis',
    'fetch',
    'XMLHttpRequest',
    'localStorage',
    'sessionStorage',
    'ctx',
    'echarts',
    `"use strict";\n${source}\n;if (typeof option === "function") return option;\nif (typeof option !== "undefined") return option;`,
  )
  return ctx => fn(undefined, undefined, undefined, undefined, undefined, undefined, undefined, ctx, echarts)
}

function createExpressionFactory(source: string): OptionFactory {
  // eslint-disable-next-line no-new-func -- Trusted material option source; documented as non-sandboxed.
  const fn = new Function(
    'window',
    'document',
    'globalThis',
    'fetch',
    'XMLHttpRequest',
    'localStorage',
    'sessionStorage',
    'ctx',
    'echarts',
    `"use strict"; return (${source});`,
  )
  return ctx => fn(undefined, undefined, undefined, undefined, undefined, undefined, undefined, ctx, echarts)
}

function normalizeOption(raw: unknown, diagnostics: ChartCustomOptionDiagnostic[]): EChartsOption | null {
  const parsed = typeof raw === 'string' ? parseOptionJson(raw, diagnostics) : raw
  if (!isRecord(parsed)) {
    diagnostics.push({
      code: 'CHART_CUSTOM_OPTION_INVALID',
      severity: 'warning',
      message: 'Custom ECharts option must resolve to an object.',
    })
    return null
  }
  return deepClone(parsed) as EChartsOption
}

function parseOptionJson(source: string, diagnostics: ChartCustomOptionDiagnostic[]): unknown {
  try {
    return JSON.parse(source)
  }
  catch (err) {
    diagnostics.push({
      code: 'CHART_CUSTOM_OPTION_JSON_FAILED',
      severity: 'warning',
      message: err instanceof Error ? err.message : String(err),
      cause: toDiagnosticCause(err),
    })
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toDiagnosticCause(err: unknown): unknown {
  if (!(err instanceof Error))
    return err
  return { name: err.name, message: err.message, stack: err.stack }
}
