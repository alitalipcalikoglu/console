import { mount } from 'svelte';
import App from './App.svelte';
import { services } from './lib/services.svelte.js';
import { visibility } from './lib/visibility.svelte.js';
import './app.css';

mount(App, { target: /** @type {HTMLElement} */ (document.getElementById('app')) });

// Read-only debugging handle (no secrets live in these stores): inspect state from the devtools console.
Object.defineProperty(window, '__console', { value: Object.freeze({ services, visibility }), enumerable: false });
