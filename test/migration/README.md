# Console migration oracles

These tests freeze observable behavior of the v1.1.0 Fastify Console before its SvelteKit
migration. They are test oracles, not production configuration and not an API source of truth.
The canonical API remains `openapi.yaml`; current implementation truth remains the real server
source. The route parity test derives both sides instead of carrying a third route registry.

New acceptance tests use a real TCP listener and HTTP requests. When SvelteKit replaces Fastify,
the server adapter in `helpers.js` may change while the behavioral assertions remain.

M5 completes derivational implementation ownership: the filesystem supplies all 156 operations
and legacy Fastify supplies zero migration-owned operations, while its compatibility copies remain
until M8. `scripts/verify-sveltekit-m5.mjs` exercises raw upload backpressure, bounded streaming,
binary response filtering and stream cancellation against the real adapter-node build; it does
not call Fastify.

M6 makes the SvelteKit filesystem the canonical browser router for all 34 frozen URL patterns.
The authenticated route-group layout performs the server-known session decision before rendering,
while operational data loading and polling still begin after hydration. The derivational route
test maps the frozen M0 fixture to real `src/routes/**/+page.svelte` files, and
`scripts/verify-sveltekit-m6.mjs` checks all 34 direct loads plus role, redirect, 404, logout and
M5 browser-integration contracts against adapter-node. The unchanged `ui/` application, its
custom router and SPA entry remain compatibility evidence only and are scheduled for M8 removal;
canonical SvelteKit code does not import them or require their fallback/runtime.

Intentional migration deltas, which must not be mistaken for accidental drift:

- M0 deliberately retains proof that legacy Fastify logout accepts no CSRF header. M3's native
  SvelteKit owner now requires `x-console-request: 1` when an authenticated session is logged out;
  `scripts/verify-sveltekit-auth.mjs` proves the corrected behavior and both pre-session exceptions.
- SvelteKit will SSR application routes. HTML bytes and the current `index.html` SPA fallback are
  not compatibility contracts; status, access outcome and visible route identity are.
- The current PWA caches the SPA shell, including `/` and `/index.html`. The future service worker
  must not cache authenticated SSR HTML and will use a secret-free offline page instead.
- The current media byte proxy does not forward an inbound `Range` header. M0 freezes that fact;
  adding range support is a separate, explicit contract decision.
- The current common API `onSend` hook overwrites route-local `private, max-age=...` directives on
  media bytes and QR PNG responses. Their effective observable `Cache-Control` is `no-store`.

Fixtures and assertions must contain only deterministic test sentinels. Never add a real API key,
cookie token, password hash, TOTP secret, encryption key, private key or local absolute path.
