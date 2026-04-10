import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/svg-strings.ts'],
  dts: true,
  exports: true,
  publint: true,
})
