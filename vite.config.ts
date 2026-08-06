import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'chrome110',
    assetsInlineLimit: 0,
  },
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
  },
});
