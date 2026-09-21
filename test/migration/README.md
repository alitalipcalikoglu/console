# Console migration oracles

These tests freeze observable behavior of the v1.1.0 Fastify Console before its SvelteKit
migration. They are test oracles, not production configuration and not an API source of truth.
The canonical API remains `openapi.yaml`; current implementation truth remains the real server
source. The route parity test derives both sides instead of carrying a third route registry.

New acceptance tests use a real TCP listener and HTTP requests. When SvelteKit replaces Fastify,
the server adapter in `helpers.js` may change while the behavioral assertions remain.

M4 keeps the parity gate derivational: the filesystem supplies 152 owned operations and the
legacy source supplies only the four remaining migration-owned special-I/O operations (media raw
upload, media bytes, audit export and QR PNG). `scripts/verify-sveltekit-m4.mjs` exercises the real
adapter-node build with deterministic local downstream services; it does not call Fastify.

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
