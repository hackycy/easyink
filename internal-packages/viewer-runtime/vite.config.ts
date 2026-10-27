import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const entry = fileURLToPath(new URL('./src/main.ts', import.meta.url))

export default defineConfig({
  plugins: [{
    name: 'runtime-module-graph',
    generateBundle(_options, bundle) {
      const modules = [...new Set(Object.values(bundle).filter(chunk => chunk.type === 'chunk').flatMap(chunk => Object.entries(chunk.modules).filter(([, module]) => module.renderedLength > 0).map(([id]) => id.replaceAll('\\', '/'))))].sort()
      this.emitFile({ type: 'asset', fileName: 'module-graph.json', source: JSON.stringify(modules, null, 2) })
    },
  }],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist/runtime/easyink-viewer/assets',
    emptyOutDir: true,
    target: 'chrome83',
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
