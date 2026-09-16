import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { serviceWorkerPlugin } from './ui/build/service-worker-plugin.js';

// UI lives in ./ui, builds to ./public which the Fastify server serves.
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
