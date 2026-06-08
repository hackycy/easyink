import type { PropSchema } from '@easyink/core'

export const chartCustomDesignerPropSchemas: PropSchema[] = [
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
      placeholder: 'return {\n  series: [{ type: "bar", data: [1, 2, 3] }]\n}',
    },
  },
  { key: 'backgroundColor', label: 'designer.property.background', type: 'color', group: 'appearance' },
]
