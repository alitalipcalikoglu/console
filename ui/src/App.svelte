<script>
  import Shell from './lib/components/Shell.svelte';
  import Toasts from './lib/components/Toasts.svelte';
  import { router } from './lib/router.svelte.js';
  import { session } from './lib/session.svelte.js';
  import { services } from './lib/services.svelte.js';
  import { pwa } from './lib/pwa.svelte.js';
  import { toasts } from './lib/toast.svelte.js';
  import { t } from './lib/i18n.svelte.js';
  import Login from './pages/Login.svelte';
  import Overview from './pages/Overview.svelte';
  import Messages from './pages/notify/Messages.svelte';
  import MessageDetail from './pages/notify/MessageDetail.svelte';
  import Users from './pages/auth/Users.svelte';
  import UserDetail from './pages/auth/UserDetail.svelte';
  import Files from './pages/media/Files.svelte';
  import FileDetail from './pages/media/FileDetail.svelte';
  import Gateway from './pages/gateway/Gateway.svelte';
  import Audit from './pages/Audit.svelte';
  import Admins from './pages/Admins.svelte';
  import Account from './pages/Account.svelte';
  import NotFound from './pages/NotFound.svelte';

  const match = $derived(router.match);
  const signedIn = $derived(session.admin !== null);

  $effect(() => { pwa.init(); session.load(); });
  // Route guard: unauthenticated → login; authenticated on /login → home.
  $effect(() => {
    if (!session.loaded) return;
    if (!signedIn && router.path !== '/login') router.go('/login', { replace: true });
    if (signedIn && router.path === '/login') router.go('/', { replace: true });
  });
  // Load the service list once signed in. No background polling: each service is probed only
  // when its card or page is opened, or when the admin presses its own refresh button.
  $effect(() => {
    if (!signedIn) { services.reset(); return; }
    services.load().catch((e) => toasts.error(e));
  });
  $effect(() => {
    if (pwa.updateReady) toasts.info(t('common.updateAvailable'), { sticky: true, action: { label: t('common.reload'), run: () => pwa.applyUpdate() } });
  });
</script>

<svelte:document onclick={router.link} />

{#if !session.loaded}
  <div style="display:grid;place-items:center;min-height:100dvh"><div class="skeleton" style="width:200px;height:20px"></div></div>
{:else if !signedIn}
  <Login />
{:else}
  <Shell>
    {#key match.pattern + JSON.stringify(match.params)}
      {#if match.pattern === '/'}<Overview />
      {:else if match.pattern === '/notify/:sid'}<Messages sid={match.params.sid} />
      {:else if match.pattern === '/notify/:sid/messages/:id'}<MessageDetail sid={match.params.sid} id={match.params.id} />
      {:else if match.pattern === '/auth/:sid'}<Users sid={match.params.sid} />
      {:else if match.pattern === '/auth/:sid/users/:id'}<UserDetail sid={match.params.sid} id={match.params.id} />
      {:else if match.pattern === '/media/:sid'}<Files sid={match.params.sid} />
      {:else if match.pattern === '/media/:sid/files/:id'}<FileDetail sid={match.params.sid} id={match.params.id} />
      {:else if match.pattern === '/gateway/:sid'}<Gateway sid={match.params.sid} />
      {:else if match.pattern === '/audit'}<Audit />
      {:else if match.pattern === '/admins'}<Admins />
      {:else if match.pattern === '/account'}<Account />
      {:else}<NotFound />
      {/if}
    {/key}
  </Shell>
{/if}
<Toasts />
