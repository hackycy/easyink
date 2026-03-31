import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  css: {
    fileName: 'theme.css',
  },
  exports: true,
  publint: true,
  external: ['vue', '@easyink/core', '@easyink/shared'],
})
