<script>
  import Page from '../../lib/components/Page.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Stat from '../../lib/components/Stat.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import Time from '../../lib/components/Time.svelte';
  import LoadMore from '../../lib/components/LoadMore.svelte';
  import ServiceTabs from '../../lib/components/ServiceTabs.svelte';
  import Dialog from '../../lib/components/Dialog.svelte';
  import AutoRefresh from '../../lib/components/AutoRefresh.svelte';
  import PollStats from '../../lib/components/PollStats.svelte';
  import { poller } from '../../lib/poller.svelte.js';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import { session } from '../../lib/session.svelte.js';
  import { services } from '../../lib/services.svelte.js';
  import { Fmt } from '../../lib/format.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  import { toasts } from '../../lib/toast.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => Promise.all([list.load(), summary.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  let q = $state(router.query.get('q') ?? '');
  /** @type {any[]} */ let items = $state([]);
  /** @type {string|null} */ let cursor = $state(null);
  let more = $state(false);
  const summary = new Resource(() => api.get(`/services/${sid}/status`));
  const list = new Resource(async () => {
    const email = q.trim();
    const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/auth/users?limit=50${email ? `&email=${encodeURIComponent(email)}` : ''}`));
    items = r.items; cursor = r.nextCursor; return r;
  });
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  $effect(() => { summary.load(); });
  $effect(() => { q; clearTimeout(timer); timer = setTimeout(() => { router.setQuery({ q }); list.load(); }, q ? 300 : 0); return () => clearTimeout(timer); });
  async function loadMore() {
    more = true;
    try { const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/auth/users?limit=50&cursor=${encodeURIComponent(cursor ?? '')}`)); items = [...items, ...r.items]; cursor = r.nextCursor; }
    catch (e) { toasts.error(e); } finally { more = false; }
  }
  let createOpen = $state(false);
  let busy = $state(false);
  let nEmail = $state(''); let nName = $state(''); let nPassword = $state('');
  async function create() {
    busy = true;
    try {
      const r = /** @type {any} */ (await api.post(`/services/${sid}/auth/users`, { email: nEmail.trim(), password: nPassword, ...(nName.trim() ? { name: nName.trim() } : {}) }));
      toasts.ok(t('auth.userCreated')); createOpen = false; nEmail = nName = nPassword = ''; router.go(`/auth/${sid}/users/${r.user.id}`);
    } catch (e) { toasts.error(e); } finally { busy = false; }
  }
  const svc = $derived(services.get(sid));
  const m = $derived(summary.data?.summary);
  /** @param {KeyboardEvent} e */
  function hotkey(e) { if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); document.getElementById('user-search')?.focus(); } }
</script>

<svelte:window onkeydown={hotkey} />

<Page title={svc?.label ?? t('auth.title')} desc={t('auth.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    {#if session.isAdmin}<button class="btn primary" onclick={() => { createOpen = true; }}><Icon name="plus" size={16} /> {t('auth.createUser')}</button>{/if}
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="auth" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:20px">
    <Stat label={t('auth.activeUsers')} value={fmt.int(m?.activeUsers)} />
    <Stat label={t('auth.disabledUsers')} value={fmt.int(m?.disabledUsers)} />
    <Stat label={t('auth.activeSessions')} value={fmt.int(m?.activeSessions)} />
  </div>
  <div class="card flush">
    <div class="card-head">
      <h2>{t('auth.users')}</h2>
      <div class="row" style="position:relative"><span style="position:absolute;left:10px;color:var(--text-3)"><Icon name="search" size={16} /></span><input id="user-search" class="input" style="padding-left:34px;width:min(320px,60vw)" type="search" placeholder="{t('auth.searchEmail')} (/)" bind:value={q} /></div>
    </div>
    <div class="card-body">
      {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
      {:else if list.loading && !items.length}<Skeleton rows={6} />
      {:else if !items.length}<Empty icon="users" title={t('auth.emptyTitle')} desc={t('auth.emptyDesc')} />
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('common.email')}</th><th>{t('common.name')}</th><th>{t('common.status')}</th><th>{t('auth.verified')}</th><th>{t('common.created')}</th></tr></thead>
          <tbody>
            {#each items as u (u.id)}
              <tr class="clickable" onclick={() => router.go(`/auth/${sid}/users/${u.id}`)}>
                <td class="mono small">{u.email}</td><td>{u.name ?? ''}</td>
                <td><StatusBadge status={u.lockedUntil ? 'locked' : u.status} label={u.lockedUntil ? t('auth.locked') : u.status} /></td>
                <td>{#if u.emailVerified}<span class="badge ok">{t('auth.verified')}</span>{:else}<span class="badge warn">{t('auth.unverified')}</span>{/if}</td>
                <td><Time value={u.createdAt} /></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        <LoadMore {cursor} busy={more} onmore={loadMore} />
      {/if}
    </div>
  </div>
</Page>

<Dialog open={createOpen} title={t('auth.createUser')} onclose={() => { createOpen = false; }}>
  <p class="small muted" style="margin-bottom:12px">{t('auth.createDesc')}</p>
  <form class="stack" onsubmit={(e) => { e.preventDefault(); create(); }}>
    <div class="field"><label for="ne">{t('common.email')}</label><input id="ne" class="input" type="email" bind:value={nEmail} required /></div>
    <div class="field"><label for="nn">{t('common.name')} <span class="faint">({t('common.optional')})</span></label><input id="nn" class="input" bind:value={nName} /></div>
    <div class="field"><label for="np">{t('common.password')}</label><input id="np" class="input" type="password" autocomplete="new-password" bind:value={nPassword} required minlength="10" /></div>
    <button type="submit" class="sr-only">ok</button>
  </form>
  {#snippet footer()}
    <button class="btn" onclick={() => { createOpen = false; }}>{t('common.cancel')}</button>
    <button class="btn primary" onclick={create} disabled={busy || !nEmail || !nPassword}>{t('auth.createUser')}</button>
  {/snippet}
</Dialog>
