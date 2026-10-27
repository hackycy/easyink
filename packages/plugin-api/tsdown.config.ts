import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/material.ts', 'src/designer.ts', 'src/viewer.ts', 'src/ui.ts'],
  dts: true,
  exports: true,
  publint: true,
})
