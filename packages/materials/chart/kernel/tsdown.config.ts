import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { 'index': 'src/index.ts', 'viewer': 'src/viewer.ts', 'full': 'src/full.ts', 'full-viewer': 'src/full-viewer.ts' },
  dts: true,
  exports: true,
  publint: true,
})
