import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const entry = fileURLToPath(new URL('./src/main.ts', import.meta.url))

export default defineConfig({
  build: {
    outDir: 'dist/runtime/easyink-viewer/assets',
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    cssCodeSplit: false,
    lib: {
      entry,
      formats: ['iife'],
      name: 'EasyInkRenderRuntime',
      fileName: () => 'viewer.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css'))
            return 'viewer.css'
          return '[name][extname]'
        },
      },
    },
  },
})
