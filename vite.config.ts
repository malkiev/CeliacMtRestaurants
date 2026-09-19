import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Keep MapLibre's ES module intact during local dependency optimization.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: { open: process.env.OPEN_BROWSER === '1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787', '/photos': 'http://127.0.0.1:8787' } },
  build: { outDir: 'dist/client', manifest: true },
});
