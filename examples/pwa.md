# Installing as an app and updates

## Install

- **Android / Chrome, Edge**: the sidebar shows **Install as app** when the browser allows it; or use the browser menu → Install.
- **iPhone / iPad**: Safari → Share → Add to Home Screen. The console opens full screen with its own icon.
- **Desktop Chrome / Edge**: install icon in the address bar.

Installed or not, the same URL and session are used.

## Offline

The service worker caches only generated immutable JS/CSS assets plus public icons, the manifest and robots file. Navigations, authenticated SSR HTML and `/api` bypass the worker. Without network, protected screens are unavailable and the header's connectivity state can report **offline** once the app is already open; no previous protected HTML or API response is replayed.

## Updates

After a deployment the service worker downloads the new bundle in the background and shows "A new version is ready" with a **Reload** button. Reloading switches to the new version immediately. The worker also checks for updates once an hour while the app is open.

Hashed asset files are immutable; HTML and the service worker remain network-owned, so a deploy is visible on the next load. Upgrade activation also deletes caches created by the removed legacy SPA worker.

## Auto-refresh numbers

On a service page with auto-refresh on, a strip under the app bar shows *Setting*, *Effective interval*, *Average*, *Last*, *Runs*, *errors*, *coalesced* and ten bars (one per recent request, amber when a request took longer than the configured interval). "request in flight" means a run is happening now; the manual refresh button is disabled meanwhile so nothing overlaps.

## Theme and language

**Account → Appearance**: System / Light / Dark; the header moon/sun button toggles too. **Language**: Türkçe / English; strings switch instantly and the choice is remembered per browser. Dates, numbers and relative times follow the chosen language.

## Keyboard

`/` focuses the user search on the Auth page, `Escape` closes dialogs, every control is reachable with Tab and shows a focus ring.
