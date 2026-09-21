import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: { runes: true },
  kit: {
    adapter: adapter(),
    csp: {
      mode: 'nonce',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:'],
        'connect-src': ['self'],
        'font-src': ['self'],
        'object-src': ['none'],
        'frame-ancestors': ['none'],
        'base-uri': ['none'],
        'form-action': ['self'],
      },
    },
  },
};
