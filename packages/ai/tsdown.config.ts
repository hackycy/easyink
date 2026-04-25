import { defineConfig } from 'tsdown'
import Vue from 'unplugin-vue/rolldown'

export default defineConfig({
  entry: ['src/index.ts'],
  deps: {
    skipNodeModulesBundle: true,
  },
  dts: {
    vue: true,
  },
  css: {
    fileName: 'index.css',
  },
  format: ['esm'],
  outExtensions: () => ({
    dts: '.d.mts',
    js: '.mjs',
  }),
  exports: true,
  publint: true,
  platform: 'neutral',
  plugins: [Vue({ isProduction: true })],
})
