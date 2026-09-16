<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import RankedList from '../../lib/components/RankedList.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Stat from '../../lib/components/Stat.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Time from '../../lib/components/Time.svelte';
  import LoadMore from '../../lib/components/LoadMore.svelte';
  import ServiceTabs from '../../lib/components/ServiceTabs.svelte';
  import AutoRefresh from '../../lib/components/AutoRefresh.svelte';
  import PollStats from '../../lib/components/PollStats.svelte';
  import CopyButton from '../../lib/components/CopyButton.svelte';
  import LinkForm from './LinkForm.svelte';
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
  $effect(() => service.subscribe(() => Promise.all([list.load(), summary.load(), overview.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  const DAYS = 7;
  const STATUSES = ['', 'active', 'disabled', 'expired', 'exhausted'];
  let status = $state(router.query.get('status') ?? '');
  let q = $state(router.query.get('q') ?? '');
  let tag = $state(router.query.get('tag') ?? '');
  /** @type {any[]} */ let items = $state([]);
  /** @type {string|null} */ let cursor = $state(null);
  let more = $state(false);
  const qs = (/** @type {string|null} */ c) => { const p = new URLSearchParams({ limit: '50' }); if (status) p.set('status', status); if (q.trim()) p.set('q', q.trim()); if (tag.trim()) p.set('tag', tag.trim().toLowerCase()); if (c) p.set('cursor', c); return p.toString(); };
  const summary = new Resource(() => api.get(`/services/${sid}/status`));
  const overview = new Resource(() => api.get(`/services/${sid}/shortlink/stats?days=${DAYS}`));
  const list = new Resource(async () => {
    const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/shortlink/links?${qs(null)}`));
    items = r.items; cursor = r.nextCursor; return r;
  });
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  $effect(() => { status; q; tag; clearTimeout(timer); timer = setTimeout(() => { router.setQuery({ status, q, tag }); list.load(); }, 300); return () => clearTimeout(timer); });
  $effect(() => { summary.load(); overview.load(); });
  async function loadMore() {
    more = true;
    try { const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/shortlink/links?${qs(cursor)}`)); items = [...items, ...r.items]; cursor = r.nextCursor; }
    catch (e) { toasts.error(e); } finally { more = false; }
  }
  let createOpen = $state(false);
  let busy = $state(false);
  /** @param {any} body */
  async function create(body) {
    busy = true;
    try { const r = /** @type {any} */ (await api.post(`/services/${sid}/shortlink/links`, body)); toasts.ok(t('sl.created', { code: r.link.code })); createOpen = false; router.go(`/shortlink/${sid}/links/${r.link.code}`); }
    catch (e) { toasts.error(e); } finally { busy = false; }
  }
  const svc = $derived(services.get(sid));
  const m = $derived(summary.data?.summary);
  const o = $derived(/** @type {any} */ (overview.data));
  /** @param {string} u */
  const host = (u) => { try { return new URL(u).hostname; } catch { return u; } };
</script>

<Page title={svc?.label ?? t('sl.title')} desc={t('sl.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    {#if session.isAdmin}<button class="btn primary" onclick={() => { createOpen = true; }} aria-label={t('sl.create')} title={t('sl.create')}><Icon name="plus" size={16} /><span class="hide-m"> {t('sl.create')}</span></button>{/if}
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="shortlink" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:20px">
    <Stat label={t('sl.activeLinks')} value={fmt.int(m?.activeLinks)} sub={m?.inactiveLinks != null ? `${t('sl.inactiveLinks')}: ${fmt.int(m.inactiveLinks)}` : undefined} />
    <Stat label={t('sl.clicks')} value={fmt.int(m?.clicks)} sub={m?.clicksLastHour != null ? `${t('sl.clicksLastHour')}: ${fmt.int(m.clicksLastHour)}` : undefined} />
    <Stat label={t('sl.clicksWindow', { d: DAYS })} value={fmt.int(o?.clicksInWindow)} />
    {#if m?.uptimeSec != null}<Stat label={t('overview.uptime')} value={fmt.duration(m.uptimeSec)} />{/if}
  </div>

  {#if o?.topLinks?.length}
    <div class="card" style="margin-bottom:20px"><div class="card-body">
      <h3 class="subhead">{t('sl.topLinks')} · {t('sl.clicksWindow', { d: DAYS })}</h3>
      <RankedList items={o.topLinks.map((/** @type {any} */ l) => ({ id: l.code, label: l.code, mono: true, sub: host(l.url), value: fmt.int(l.clicks), href: `/shortlink/${sid}/links/${l.code}` }))} />
    </div></div>
  {/if}

  <Panel title={t('sl.links')} flush>
    {#snippet aside()}
      <div class="seg">{#each STATUSES as s (s)}<button aria-pressed={status === s} onclick={() => { status = s; }}>{s ? t(`sl.${s}`) : t('common.all')}</button>{/each}</div>
      <input class="input" style="width:min(240px,100%)" type="search" placeholder={t('sl.search')} bind:value={q} />
      <input class="input" style="width:min(140px,100%)" type="search" placeholder={t('sl.tag')} bind:value={tag} />
    {/snippet}
      {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
      {:else if list.loading && !items.length}<Skeleton rows={6} />
      {:else if !items.length}<Empty icon="link" title={t('sl.emptyTitle')} desc={t('sl.emptyDesc')} />
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('sl.slug')}</th><th>{t('sl.url')}</th><th>{t('sl.status')}</th><th class="num">{t('sl.clicks')}</th><th class="hide-m">{t('sl.tags')}</th><th class="hide-m">{t('sl.lastClick')}</th><th class="hide-m">{t('common.created')}</th></tr></thead>
          <tbody>
            {#each items as l (l.code)}
              <tr class="clickable" onclick={() => router.go(`/shortlink/${sid}/links/${l.code}`)}>
                <td><span class="row" style="gap:4px"><code>{l.code}</code><span onclick={(e) => e.stopPropagation()} role="presentation"><CopyButton text={l.shortUrl} /></span></span></td>
                <td class="truncate small" style="max-width:260px" title={l.url}>{l.url.replace(/^https?:\/\//, '')}</td>
                <td><StatusBadge status={l.status} label={t(`sl.${l.status}`)} /></td>
                <td class="num">{fmt.int(l.clicks)}{#if l.maxClicks != null}<span class="faint xs"> / {fmt.int(l.maxClicks)}</span>{/if}</td>
                <td class="hide-m"><span class="row wrap" style="gap:4px">{#each l.tags as tg (tg)}<span class="badge plain">{tg}</span>{/each}</span></td>
                <td class="hide-m small">{#if l.lastClickAt}<Time value={l.lastClickAt} />{:else}<span class="faint">{t('sl.never')}</span>{/if}</td>
                <td class="hide-m small"><Time value={l.createdAt} /></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        <LoadMore {cursor} busy={more} onmore={loadMore} />
      {/if}
  </Panel>
</Page>

<LinkForm open={createOpen} title={t('sl.create')} submitLabel={t('sl.create')} {busy} onsubmit={create} onclose={() => { createOpen = false; }} />
