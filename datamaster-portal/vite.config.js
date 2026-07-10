import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' => funciona no GitHub Pages em qualquer subcaminho (usamos HashRouter)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: false },
});
