import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
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
