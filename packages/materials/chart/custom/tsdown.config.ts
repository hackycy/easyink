import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/ai.ts',
    'src/designer.ts',
    'src/locale.ts',
    'src/prop-schemas.ts',
    'src/schema.ts',
    'src/viewer.ts',
  ],
  dts: true,
  deps: {
    onlyBundle: false,
  },
  exports: true,
  publint: true,
})
