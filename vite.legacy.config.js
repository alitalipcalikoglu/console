import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { serviceWorkerPlugin } from './ui/build/service-worker-plugin.js';

// Transitional M1 config for the production SPA. The canonical vite.config.ts belongs to
// SvelteKit; this file remains only until the legacy UI is removed in M8.
export default defineConfig({
  root: 'ui',
  base: '/',
  plugins: [svelte(), serviceWorkerPlugin()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
    sourcemap: false,
    manifest: true,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3004' },
  },
});
