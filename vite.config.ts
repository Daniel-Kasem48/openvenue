import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  root: 'apps/web',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5188,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.PORT ?? 3188}`, changeOrigin: false },
    },
  },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});
