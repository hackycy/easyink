import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'material-model': 'src/material-model.ts',
    'viewer': 'src/viewer-material.ts',
    'index': 'src/index.ts',
    'ai': 'src/ai.ts',
    'designer-material': 'src/designer-material.ts',
    'locale': 'src/locale.ts',
    'prop-schemas': 'src/prop-schemas.ts',
    'schema': 'src/schema.ts',
  },
  dts: true,
  deps: {
    onlyBundle: false,
  },
  exports: true,
  publint: true,
})
