import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/full.ts'],
  dts: true,
  exports: true,
  publint: true,
})
