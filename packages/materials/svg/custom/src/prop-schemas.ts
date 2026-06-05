import type { PropSchema } from '@easyink/core'

export const svgCustomDesignerPropSchemas: PropSchema[] = [
  { key: 'content', label: 'materials.svgCustom.property.content', type: 'textarea', group: 'content', editorOptions: { rows: 8, placeholder: '<svg viewBox="0 0 24 24">\n  <path d="..." />\n</svg>' } },
]
