import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../static/frontend'),
    emptyOutDir: true,
    // 生成 manifest，模板按 hash 引用，避免 main.js 被浏览器长期缓存看不到更新
    manifest: 'manifest.json',
    rollupOptions: {
      input: resolve(__dirname, 'src/main.jsx'),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  base: '/static/frontend/',
})
