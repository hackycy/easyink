import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/all/viewer.ts',
    'src/basic/viewer.ts',
    'src/all/designer.ts',
    'src/basic/designer.ts',
    'src/index.ts',
    'src/all.ts',
    'src/basic.ts',
    'src/none.ts',
  ],
  format: ['esm'],
  clean: true,
  dts: true,
  external: [
    /^@easyink\//,
  ],
})
