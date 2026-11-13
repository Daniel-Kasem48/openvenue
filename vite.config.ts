import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  server: {
    port: 5188,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3188', changeOrigin: false } },
  },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});
