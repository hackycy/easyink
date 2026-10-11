import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', viewer: 'src/viewer.ts', locale: 'src/locale.ts' },
  dts: true,
  exports: true,
  publint: true,
})
