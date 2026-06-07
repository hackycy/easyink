import type { MaterialBindingDefinition } from '@easyink/core'
import { CHART_BAR_DATA_CONTRACT } from '@easyink/material-chart-bar'
import { CHART_GAUGE_DATA_CONTRACT } from '@easyink/material-chart-gauge'
import { CHART_LINE_DATA_CONTRACT } from '@easyink/material-chart-line'
import { CHART_PIE_DATA_CONTRACT } from '@easyink/material-chart-pie'
import { CHART_RADAR_DATA_CONTRACT } from '@easyink/material-chart-radar'
import { CHART_SCATTER_DATA_CONTRACT } from '@easyink/material-chart-scatter'

export const noMaterialBinding = { kind: 'none' } satisfies MaterialBindingDefinition
export const customMaterialBinding = { kind: 'custom' } satisfies MaterialBindingDefinition

const presetAndCustomFormatEditor = {
  tabs: ['preset', 'custom'],
  defaultTab: 'preset',
} as const

const customOnlyFormatEditor = {
  tabs: ['custom'],
  defaultTab: 'custom',
} as const

export const textMaterialBinding = { kind: 'ordinary', primaryProp: 'content', formatEditor: presetAndCustomFormatEditor } satisfies MaterialBindingDefinition
export const imageMaterialBinding = { kind: 'ordinary', primaryProp: 'src', formatEditor: presetAndCustomFormatEditor } satisfies MaterialBindingDefinition
export const svgCustomMaterialBinding = { kind: 'ordinary', primaryProp: 'content', formatEditor: customOnlyFormatEditor } satisfies MaterialBindingDefinition
export const qrcodeMaterialBinding = { kind: 'ordinary', primaryProp: 'value', formatEditor: presetAndCustomFormatEditor } satisfies MaterialBindingDefinition
export const barcodeMaterialBinding = {
  kind: 'ordinary',
  primaryProp: 'value',
  indexedProps: { 0: 'value', 1: 'format', 2: 'params' },
  formatEditor: presetAndCustomFormatEditor,
} satisfies MaterialBindingDefinition

export const chartBarMaterialBinding = {
  kind: 'data-contract',
  contract: CHART_BAR_DATA_CONTRACT,
  formatEditor: customOnlyFormatEditor,
} satisfies MaterialBindingDefinition

export const chartGaugeMaterialBinding = {
  kind: 'data-contract',
  contract: CHART_GAUGE_DATA_CONTRACT,
  formatEditor: customOnlyFormatEditor,
} satisfies MaterialBindingDefinition

export const chartLineMaterialBinding = {
  kind: 'data-contract',
  contract: CHART_LINE_DATA_CONTRACT,
  formatEditor: customOnlyFormatEditor,
} satisfies MaterialBindingDefinition

export const chartPieMaterialBinding = {
  kind: 'data-contract',
  contract: CHART_PIE_DATA_CONTRACT,
  formatEditor: customOnlyFormatEditor,
} satisfies MaterialBindingDefinition

export const chartRadarMaterialBinding = {
  kind: 'data-contract',
  contract: CHART_RADAR_DATA_CONTRACT,
  formatEditor: customOnlyFormatEditor,
} satisfies MaterialBindingDefinition

export const chartScatterMaterialBinding = {
  kind: 'data-contract',
  contract: CHART_SCATTER_DATA_CONTRACT,
  formatEditor: customOnlyFormatEditor,
} satisfies MaterialBindingDefinition
