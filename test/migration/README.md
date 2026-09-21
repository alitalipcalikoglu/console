# Console contract oracles

These tests preserve the observable security, API, streaming, frontend and process contracts gathered during the SvelteKit migration. They run against the canonical built adapter-node process over real HTTP; no compatibility server or framework injection is involved.

`openapi.yaml` remains API truth. The parity gate derives implementation operations directly from exported methods in `src/routes/**/+server.ts` and compares both directions: 122 paths and 156 operations. The frozen frontend fixture is regression evidence only; filesystem pages remain routing truth and must own all 34 browser URL patterns.

The suite retains intentional contract decisions: authenticated logout requires `x-console-request: 1`; SSR guards protected pages; unknown browser routes produce SvelteKit HTML 404 while unknown API routes produce JSON 404; inbound media `Range` is intentionally not forwarded; binary and QR responses remain `no-store`; navigations, authenticated HTML and APIs are never service-worker cached.

Fixtures and assertions must contain only deterministic test sentinels. Never add a real API key, cookie token, password hash, TOTP secret, encryption key, private key or local absolute path.
