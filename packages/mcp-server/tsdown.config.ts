import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/server.ts'],
  dts: true,
  exports: true,
  publint: true,
})
