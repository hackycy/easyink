import type { PropSchema } from '@easyink/core'

export const svgCustomDesignerPropSchemas: PropSchema[] = [
  {
    key: 'content',
    label: 'materials.svgCustom.property.content',
    type: 'code',
    group: 'content',
    editorOptions: {
      language: 'html',
      rows: 8,
      editorHeight: 460,
      placeholder: '<svg viewBox="0 0 24 24">\n  <path d="..." />\n</svg>',
      valueInput: {
        kind: 'text-file',
        id: 'designer.svgCustom.importFile',
        source: 'svg-custom-content',
        accept: ['.svg', 'image/svg+xml'],
        pickTitle: 'materials.svgCustom.action.importFile',
        maxBytes: 262144,
      },
    },
  },
]
