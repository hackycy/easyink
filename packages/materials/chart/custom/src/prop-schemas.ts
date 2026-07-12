import type { PropertyDescriptor } from '@easyink/core'
import { CHART_CUSTOM_DEFAULT_OPTION_CODE } from './schema'

export const chartCustomDesignerPropSchemas: PropertyDescriptor[] = [
  {
    key: 'optionCode',
    label: 'materials.chartCustom.property.optionCode',
    type: 'code',
    group: 'content',
    visible: props => props.__hasBinding !== true,
    editorOptions: {
      language: 'javascript',
      rows: 8,
      editorHeight: 520,
      dialogWidth: 920,
      placeholder: CHART_CUSTOM_DEFAULT_OPTION_CODE,
    },
  },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
]
