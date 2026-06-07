import type { PropSchema } from '@easyink/core'

export const chartCustomDesignerPropSchemas: PropSchema[] = [
  {
    key: 'optionMode',
    label: 'materials.chartCustom.property.optionMode',
    type: 'enum',
    group: 'content',
    enum: [
      { label: 'materials.chartCustom.optionMode.code', value: 'code' },
      { label: 'materials.chartCustom.optionMode.bound', value: 'bound' },
    ],
  },
  {
    key: 'optionCode',
    label: 'materials.chartCustom.property.optionCode',
    type: 'code',
    group: 'content',
    visible: props => props.optionMode !== 'bound',
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
