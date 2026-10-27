import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, host: true, proxy: { '/api': 'http://localhost:8787' } },
  preview: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
});
