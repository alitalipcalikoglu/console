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
  import Dialog from '../../lib/components/Dialog.svelte';
  import AutoRefresh from '../../lib/components/AutoRefresh.svelte';
  import PollStats from '../../lib/components/PollStats.svelte';
  import { poller } from '../../lib/poller.svelte.js';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import { services } from '../../lib/services.svelte.js';
  import { Fmt } from '../../lib/format.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  import { toasts } from '../../lib/toast.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => Promise.all([list.load(), stats.load(), summary.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  const HOURS = 24;
  const OUTCOMES = ['', 'success', 'failure', 'denied'];
  /** Filter names as the audit service understands them; every one is also a URL query parameter. */
  const KEYS = /** @type {const} */ (['actionPrefix', 'outcome', 'source', 'actorType', 'actorId', 'targetType', 'targetId', 'requestId', 'ip', 'from', 'to']);
  /** @type {Record<string, string>} */
  let f = $state(Object.fromEntries(KEYS.map((k) => [k, router.query.get(k) ?? ''])));
  let showFilters = $state(KEYS.some((k) => k !== 'actionPrefix' && k !== 'outcome' && f[k]));
  const active = $derived(KEYS.filter((k) => f[k]).length);
  /** Query string for the service call; datetime-local values become ISO. @param {string} [cursor] */
  function qs(cursor) {
    const p = new URLSearchParams();
    for (const k of KEYS) {
      const v = f[k].trim();
      if (!v) continue;
      p.set(k, k === 'from' || k === 'to' ? new Date(v).toISOString() : v);
    }
    p.set('limit', '50');
    if (cursor) p.set('cursor', cursor);
    return p.toString();
  }
  /** @type {any[]} */ let items = $state([]);
  /** @type {string|null} */ let cursor = $state(null);
  let more = $state(false);
  const summary = new Resource(() => api.get(`/services/${sid}/status`));
  const stats = new Resource(() => api.get(`/services/${sid}/audit/stats?hours=${HOURS}`));
  const list = new Resource(async () => {
    const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/audit/events?${qs()}`));
    items = r.items; cursor = r.nextCursor; return r;
  });
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  // Any filter change: mirror into the URL and reload after a short pause (typing).
  $effect(() => {
    const snapshot = JSON.stringify(f);
    clearTimeout(timer);
    timer = setTimeout(() => { router.setQuery(Object.fromEntries(KEYS.map((k) => [k, f[k] || null]))); list.load(); }, snapshot ? 300 : 0);
    return () => clearTimeout(timer);
  });
  $effect(() => { stats.load(); summary.load(); });
  async function loadMore() {
    more = true;
    try { const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/audit/events?${qs(cursor ?? undefined)}`)); items = [...items, ...r.items]; cursor = r.nextCursor; }
    catch (e) { toasts.error(e); } finally { more = false; }
  }
  function clearFilters() { f = Object.fromEntries(KEYS.map((k) => [k, ''])); }

  // Chain verification: read-only, but slow on big logs, so it runs only on request.
  let verifying = $state(false);
  /** @type {any} */ let verdict = $state(null);
  async function verify() {
    verifying = true;
    try {
      verdict = await api.get(`/services/${sid}/audit/chain/verify`);
      if (verdict.ok) toasts.ok(t('ev.verifyOk', { n: fmt.int(verdict.checked) })); else toasts.error(new Error(t('ev.verifyBroken', { seq: verdict.firstBroken, reason: verdict.reason ?? '' })));
    } catch (e) { toasts.error(e); } finally { verifying = false; }
  }

  // Export: plain download link through the console (cookie auth), format chosen in a dialog.
  let exportOpen = $state(false);
  let format = $state('ndjson');
  const exportHref = $derived(`/api/services/${sid}/audit/events/export?${qs().replace(/&?limit=50/, '')}${qs() === 'limit=50' ? '' : '&'}format=${format}`);

  const svc = $derived(services.get(sid));
  const m = $derived(summary.data?.summary);
  const st = $derived(/** @type {any} */ (stats.data));
  /** @param {any} p */
  const party = (p) => (p ? `${p.type}:${p.id}` : '');
</script>

<Page title={svc?.label ?? t('ev.title')} desc={t('ev.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    <button class="btn" onclick={verify} disabled={verifying} aria-label={t('ev.verify')} title={t('ev.verify')}><Icon name="shield" size={16} /><span class="hide-m"> {verifying ? t('ev.verifying') : t('ev.verify')}</span></button>
    <button class="btn" onclick={() => { exportOpen = true; }} aria-label={t('ev.export')} title={t('ev.export')}><Icon name="download" size={16} /><span class="hide-m"> {t('ev.export')}</span></button>
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="audit" {sid} />
  <PollStats {sid} />

  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:20px">
    <Stat label={t('ev.totalEvents')} value={fmt.int(m?.total)} sub={m?.lastHour != null ? `${t('ev.lastHour')}: ${fmt.int(m.lastHour)}` : undefined} />
    <Stat label={t('ev.window', { h: HOURS })} value={fmt.int(st?.total)} />
    <Stat label={t('ev.failures')} value={fmt.int(st?.byOutcome?.failure ?? (st ? 0 : null))} tone={st?.byOutcome?.failure ? 'danger' : ''} sub={t('ev.window', { h: HOURS })} />
    <Stat label={t('ev.deniedCount')} value={fmt.int(st?.byOutcome?.denied ?? (st ? 0 : null))} tone={st?.byOutcome?.denied ? 'warn' : ''} sub={t('ev.window', { h: HOURS })} />
    <Stat label={t('ev.headSeq')} value={fmt.int(m?.headSeq)} sub={verdict ? (verdict.ok ? t('ev.chainOk') : t('ev.chainBroken')) : undefined} tone={verdict ? (verdict.ok ? 'ok' : 'danger') : ''} />
    <Stat label={t('ev.dbSize')} value={fmt.bytes(m?.dbBytes)} sub={m?.oldestAgeSec != null ? `${t('ev.oldest')}: ${fmt.duration(m.oldestAgeSec)}` : undefined} />
  </div>

  {#if st && st.total > 0}
    <div class="card" style="margin-bottom:20px"><div class="card-body">
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px">
        <div>
          <h3 class="subhead">{t('ev.topActions')}</h3>
          <RankedList items={st.topActions.map((/** @type {any} */ a) => ({ id: a.action, label: a.action, mono: true, value: fmt.int(a.count), onclick: () => { f = { ...f, actionPrefix: a.action }; } }))} />
        </div>
        <div>
          <h3 class="subhead">{t('ev.topFailures')}</h3>
          <RankedList items={st.topFailures.map((/** @type {any} */ a) => ({ id: a.action, label: a.action, mono: true, tone: 'danger', value: fmt.int(a.count), onclick: () => { f = { ...f, actionPrefix: a.action, outcome: '' }; } }))} />
        </div>
        <div>
          <h3 class="subhead">{t('ev.bySource')}</h3>
          <RankedList items={st.bySource.map((/** @type {any} */ s) => ({ id: s.source, label: s.source, value: fmt.int(s.count), active: f.source === s.source, onclick: () => { f = { ...f, source: f.source === s.source ? '' : s.source }; } }))} />
          {#if st.topActors.length}
            <h3 class="subhead" style="margin-top:14px">{t('ev.topActors')}</h3>
            <RankedList items={st.topActors.slice(0, 5).map((/** @type {any} */ a) => ({ id: `${a.type}:${a.id}`, label: `${a.type}:${a.id}`, sub: a.name ?? undefined, mono: true, value: fmt.int(a.count), onclick: () => { f = { ...f, actorType: a.type, actorId: a.id }; } }))} />
          {/if}
        </div>
      </div>
    </div></div>
  {/if}

  <Panel title={t('ev.events')} flush>
    {#snippet aside()}
      <div class="seg">{#each OUTCOMES as o (o)}<button aria-pressed={f.outcome === o} onclick={() => { f = { ...f, outcome: o }; }}>{o ? t(`ev.${o}`) : t('common.all')}</button>{/each}</div>
      <input class="input" style="width:min(260px,100%)" type="search" placeholder={t('ev.actionPrefix')} bind:value={f.actionPrefix} />
      <button class="btn {showFilters ? 'primary' : ''}" onclick={() => { showFilters = !showFilters; }} aria-expanded={showFilters}><Icon name="filter" size={14} /> {t('ev.filters')}{#if active}<span class="count">{active}</span>{/if}</button>
    {/snippet}
    {#if showFilters}
      <div class="filters">
        <div class="field"><label for="f-source">{t('ev.source')}</label><input id="f-source" class="input" bind:value={f.source} placeholder="auth" /></div>
        <div class="field"><label for="f-actorType">{t('ev.actor')} · {t('ev.type')}</label><input id="f-actorType" class="input" bind:value={f.actorType} placeholder="user" /></div>
        <div class="field"><label for="f-actorId">{t('ev.actor')} · {t('common.id')}</label><input id="f-actorId" class="input" bind:value={f.actorId} /></div>
        <div class="field"><label for="f-targetType">{t('ev.target')} · {t('ev.type')}</label><input id="f-targetType" class="input" bind:value={f.targetType} placeholder="order" /></div>
        <div class="field"><label for="f-targetId">{t('ev.target')} · {t('common.id')}</label><input id="f-targetId" class="input" bind:value={f.targetId} /></div>
        <div class="field"><label for="f-requestId">{t('ev.requestId')}</label><input id="f-requestId" class="input" bind:value={f.requestId} /></div>
        <div class="field"><label for="f-ip">{t('common.ip')}</label><input id="f-ip" class="input" bind:value={f.ip} /></div>
        <div class="field"><label for="f-from">{t('ev.from')}</label><input id="f-from" class="input" type="datetime-local" bind:value={f.from} /></div>
        <div class="field"><label for="f-to">{t('ev.to')}</label><input id="f-to" class="input" type="datetime-local" bind:value={f.to} /></div>
        <div class="field" style="justify-content:end"><button class="btn" onclick={clearFilters} disabled={!active}><Icon name="x" size={14} /> {t('ev.clear')}</button></div>
      </div>
    {/if}
      {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
      {:else if list.loading && !items.length}<Skeleton rows={8} />
      {:else if !items.length}<Empty icon="history" title={t('ev.emptyTitle')} desc={t('ev.emptyDesc')} />
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('common.at')}</th><th>{t('ev.action')}</th><th>{t('ev.outcome')}</th><th>{t('ev.actor')}</th><th class="hide-m">{t('ev.target')}</th><th class="hide-m">{t('ev.source')}</th><th class="hide-m">{t('common.ip')}</th></tr></thead>
          <tbody>
            {#each items as e (e.id)}
              <tr class="clickable" onclick={() => router.go(`/audit/${sid}/events/${e.id}`)}>
                <td style="white-space:nowrap"><Time value={e.at} /></td>
                <td><code class="{e.outcome !== 'success' ? 'danger-text' : ''}">{e.action}</code></td>
                <td><StatusBadge status={e.outcome} label={t(`ev.${e.outcome}`)} /></td>
                <td class="mono small truncate" style="max-width:180px" title={e.actor?.name ?? ''}>{party(e.actor)}</td>
                <td class="mono small truncate hide-m" style="max-width:180px">{party(e.target)}</td>
                <td class="small hide-m">{e.source}</td>
                <td class="mono small hide-m">{e.ip ?? '–'}</td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        <LoadMore {cursor} busy={more} onmore={loadMore} />
      {/if}
  </Panel>
</Page>

<Dialog open={exportOpen} title={t('ev.exportTitle')} onclose={() => { exportOpen = false; }}>
  <p class="small muted" style="margin-bottom:12px">{t('ev.exportDesc')}</p>
  <p class="small" style="margin-bottom:12px">{active ? t('ev.activeFilters', { n: active }) : t('ev.noFilters')}</p>
  <div class="field"><label for="fmt">{t('ev.format')}</label>
    <select id="fmt" class="select" bind:value={format}><option value="ndjson">NDJSON</option><option value="csv">CSV</option></select></div>
  {#snippet footer()}
    <button class="btn" onclick={() => { exportOpen = false; }}>{t('common.cancel')}</button>
    <a class="btn primary" href={exportHref} download onclick={() => { exportOpen = false; }}><Icon name="download" size={16} /> {t('ev.download')}</a>
  {/snippet}
</Dialog>

<style>
  .count { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--accent); color: #fff; font-size: .7rem; font-weight: 700; margin-left: 4px; }
  .btn.primary .count { background: #fff; color: var(--accent); }
  .filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--border); background: var(--surface-2); }
  .filters > * { min-width: 0; }
  @media (max-width: 900px) { .filters { padding: 12px 14px; } }
</style>
