import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 8532,
    host: '0.0.0.0',
  },
  plugins: [vue()],
})
