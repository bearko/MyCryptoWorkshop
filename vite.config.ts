import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any sub-path (GitHub Pages, static hosting).
  base: './',
  build: { assetsInlineLimit: 0 },
});
