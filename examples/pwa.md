# Installing as an app and updates

## Install

- **Android / Chrome, Edge**: the sidebar shows **Install as app** when the browser allows it; or use the browser menu → Install.
- **iPhone / iPad**: Safari → Share → Add to Home Screen. The console opens full screen with its own icon.
- **Desktop Chrome / Edge**: install icon in the address bar.

Installed or not, the same URL and session are used.

## Offline

The service worker precaches the app shell (HTML, JS, CSS, icons). Without network the console still opens and shows the last screen's layout; API calls fail and the header shows an **offline** badge. Nothing from `/api` is ever cached, so you never see stale data presented as fresh.

## Updates

After a deployment the service worker downloads the new bundle in the background and shows "A new version is ready" with a **Reload** button. Reloading switches to the new version immediately. The worker also checks for updates once an hour while the app is open.

Hashed asset files are served with a one-year immutable cache; `index.html`, `sw.js` and the manifest are always revalidated, so a deploy is visible on the next load.

## Theme and language

**Account → Appearance**: System / Light / Dark; the header moon/sun button toggles too. **Language**: Türkçe / English; strings switch instantly and the choice is remembered per browser. Dates, numbers and relative times follow the chosen language.

## Keyboard

`/` focuses the user search on the Auth page, `Escape` closes dialogs, every control is reachable with Tab and shows a focus ring.
