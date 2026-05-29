import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/server.ts'],
  deps: {
    neverBundle: [/^node:/],
    skipNodeModulesBundle: true,
  },
  dts: true,
  format: ['esm'],
  outExtensions: () => ({
    dts: '.d.mts',
    js: '.mjs',
  }),
  exports: true,
  publint: true,
  platform: 'neutral',
})
