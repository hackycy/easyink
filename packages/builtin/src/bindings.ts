import type { MaterialBindingDefinition } from '@easyink/core'
import { CHART_BAR_DATA_CONTRACT } from '@easyink/material-chart-bar'
import { CHART_LINE_DATA_CONTRACT } from '@easyink/material-chart-line'
import { CHART_PIE_DATA_CONTRACT } from '@easyink/material-chart-pie'

export const noMaterialBinding = { kind: 'none' } satisfies MaterialBindingDefinition
export const customMaterialBinding = { kind: 'custom' } satisfies MaterialBindingDefinition

export const textMaterialBinding = { kind: 'ordinary', primaryProp: 'content' } satisfies MaterialBindingDefinition
export const imageMaterialBinding = { kind: 'ordinary', primaryProp: 'src' } satisfies MaterialBindingDefinition
export const qrcodeMaterialBinding = { kind: 'ordinary', primaryProp: 'value' } satisfies MaterialBindingDefinition
export const barcodeMaterialBinding = {
  kind: 'ordinary',
  primaryProp: 'value',
  indexedProps: { 0: 'value', 1: 'format', 2: 'params' },
} satisfies MaterialBindingDefinition

export const chartBarMaterialBinding = {
  kind: 'data-contract',
  contract: CHART_BAR_DATA_CONTRACT,
} satisfies MaterialBindingDefinition

export const chartLineMaterialBinding = {
  kind: 'data-contract',
  contract: CHART_LINE_DATA_CONTRACT,
} satisfies MaterialBindingDefinition

export const chartPieMaterialBinding = {
  kind: 'data-contract',
  contract: CHART_PIE_DATA_CONTRACT,
} satisfies MaterialBindingDefinition
