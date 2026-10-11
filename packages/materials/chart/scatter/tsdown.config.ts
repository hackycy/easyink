import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'material-model': 'src/material-model.ts',
    'viewer': 'src/viewer-material.ts',
  },
  dts: true,
  deps: {
    onlyBundle: false,
  },
  exports: true,
  publint: true,
})
