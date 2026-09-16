<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
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
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import SubscriptionForm from './SubscriptionForm.svelte';
  import SecretDialog from './SecretDialog.svelte';
  import DeliveryTable from './DeliveryTable.svelte';
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
  const DSTATUSES = ['pending', 'running', 'retrying', 'succeeded', 'failed', 'cancelled'];
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => Promise.all([list.load(), stats.load(), deliveries.load(), events.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  const base = $derived(`/services/${sid}/webhook-out`);
  let status = $state(router.query.get('status') ?? '');
  let q = $state(router.query.get('q') ?? '');
  let dstatus = $state(router.query.get('dstatus') ?? '');
  let etype = $state(router.query.get('type') ?? '');
  /** @type {any[]} */ let items = $state([]);
  /** @type {string|null} */ let cursor = $state(null);
  let more = $state(false);
  const qs = (/** @type {string|null} */ c) => { const p = new URLSearchParams({ limit: '50' }); if (status) p.set('status', status); if (q.trim()) p.set('q', q.trim()); if (c) p.set('cursor', c); return p.toString(); };
  const stats = new Resource(() => api.get(`${base}/stats`));
  const list = new Resource(async () => {
    const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`${base}/subscriptions?${qs(null)}`));
    items = r.items; cursor = r.nextCursor; return r;
  });
  /** @type {any[]} */ let dItems = $state([]);
  /** @type {string|null} */ let dBefore = $state(null);
  let dMore = $state(false);
  const dqs = (/** @type {string|null} */ b) => { const p = new URLSearchParams({ limit: '20' }); if (dstatus) p.set('status', dstatus); if (b) p.set('before', b); return p.toString(); };
  const deliveries = new Resource(async () => {
    const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(`${base}/deliveries?${dqs(null)}`));
    dItems = r.items; dBefore = r.nextBefore; return r;
  });
  /** @type {any[]} */ let eItems = $state([]);
  /** @type {string|null} */ let eBefore = $state(null);
  let eMore = $state(false);
  const eqs = (/** @type {string|null} */ b) => { const p = new URLSearchParams({ limit: '20' }); if (etype) p.set('type', etype); if (b) p.set('before', b); return p.toString(); };
  const events = new Resource(async () => {
    const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(`${base}/events?${eqs(null)}`));
    eItems = r.items; eBefore = r.nextBefore; return r;
  });
  const types = new Resource(() => api.get(`${base}/event-types`));
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  $effect(() => { status; q; clearTimeout(timer); timer = setTimeout(() => { router.setQuery({ status, q }); list.load(); }, 300); return () => clearTimeout(timer); });
  $effect(() => { dstatus; router.setQuery({ dstatus }); deliveries.load(); });
  $effect(() => { etype; router.setQuery({ type: etype }); events.load(); });
  $effect(() => { stats.load(); types.load(); });
  /** Subscription names by id, for delivery rows. */
  const names = $derived(Object.fromEntries(items.map((s) => [s.id, s.name])));
  async function loadMore() {
    more = true;
    try { const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`${base}/subscriptions?${qs(cursor)}`)); items = [...items, ...r.items]; cursor = r.nextCursor; }
    catch (e) { toasts.error(e); } finally { more = false; }
  }
  async function loadMoreDeliveries() {
    dMore = true;
    try { const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(`${base}/deliveries?${dqs(dBefore)}`)); dItems = [...dItems, ...r.items]; dBefore = r.nextBefore; }
    catch (e) { toasts.error(e); } finally { dMore = false; }
  }
  async function loadMoreEvents() {
    eMore = true;
    try { const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(`${base}/events?${eqs(eBefore)}`)); eItems = [...eItems, ...r.items]; eBefore = r.nextBefore; }
    catch (e) { toasts.error(e); } finally { eMore = false; }
  }
  const st = $derived(/** @type {any} */ (stats.data));
  let createOpen = $state(false);
  let creating = $state(false);
  /** @type {string|null} */ let secret = $state(null);
  /** @type {string|null} */ let createdId = $state(null);
  /** @param {any} body */
  async function create(body) {
    creating = true;
    try {
      const r = /** @type {any} */ (await api.post(`${base}/subscriptions`, body));
      toasts.ok(t('wh.created', { name: r.subscription.name }));
      createOpen = false; secret = r.secret; createdId = r.subscription.id;
    } catch (e) { toasts.error(e); } finally { creating = false; }
  }
  /** The secret dialog closes into the new subscription's page. */
  function closeSecret() { const id = createdId; secret = null; createdId = null; if (id) router.go(`/webhook-out/${sid}/subscriptions/${id}`); }
  const svc = $derived(services.get(sid));
</script>

<Page title={svc?.label ?? t('wh.title')} desc={t('wh.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    {#if session.isAdmin}<button class="btn primary" onclick={() => { createOpen = true; }} aria-label={t('wh.create')} title={t('wh.create')}><Icon name="plus" size={16} /><span class="hide-m"> {t('wh.create')}</span></button>{/if}
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="webhook-out" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:20px">
    <Stat label={t('wh.activeSubs')} value={fmt.int(st?.subscriptions?.active)} sub={st ? `${fmt.int(st.subscriptions.paused)} ${t('wh.pausedShort')} · ${fmt.int(st.subscriptions.disabled)} ${t('wh.disabledShort')}` : undefined} subTone={st?.subscriptions?.disabled ? 'danger' : ''} />
    <Stat label={t('wh.events24h')} value={fmt.int(st?.events?.last24h)} sub={st ? `${fmt.int(st.events.total)} ${t('wh.total')}` : undefined} />
    <Stat label={t('wh.failed24h')} value={fmt.int(st?.deliveries?.last24h?.failed)} sub={st ? `${fmt.int(st.deliveries.last24h.succeeded)} ${t('wh.succeededShort')}` : undefined} tone={st?.deliveries?.last24h?.failed ? 'danger' : ''} />
    <Stat label={t('wh.backlog')} value={st ? (st.worker.running ? fmt.int(st.deliveries.backlog.queued) : '–') : '–'} sub={st ? (!st.worker.running ? t('wh.workerStopped') : st.deliveries.backlog.oldestAt ? `${t('wh.oldest')}: ${fmt.relative(st.deliveries.backlog.oldestAt)}` : t('wh.empty')) : undefined} tone={st && !st.worker.running ? 'danger' : ''} />
  </div>

  <div class="stack">
    <Panel title={t('wh.subscriptions')} flush>
      {#snippet aside()}
        <div class="seg"><button aria-pressed={status === ''} onclick={() => { status = ''; }}>{t('common.all')}</button>{#each ['active', 'paused', 'disabled'] as s (s)}<button aria-pressed={status === s} onclick={() => { status = s; }}>{t(`wh.status.${s}`)}</button>{/each}</div>
        <input class="input" style="width:min(240px,100%)" type="search" placeholder={t('wh.search')} bind:value={q} />
      {/snippet}
      {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
      {:else if (list.loading || !list.loaded) && !items.length}<Skeleton rows={5} />
      {:else if !items.length}<Empty icon="webhook" title={t('wh.emptyTitle')} desc={t('wh.emptyDesc')} />
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('wh.name')}</th><th>{t('common.status')}</th><th>{t('wh.eventPatterns')}</th><th>{t('wh.lastDelivery')}</th><th class="hide-m">{t('wh.url')}</th></tr></thead>
          <tbody>
            {#each items as s (s.id)}
              <tr class="clickable" onclick={() => router.go(`/webhook-out/${sid}/subscriptions/${s.id}`)}>
                <td><code>{s.name}</code>{#if s.description}<div class="xs faint truncate" style="max-width:260px">{s.description}</div>{/if}</td>
                <td><StatusBadge status={s.status} label={t(`wh.status.${s.status}`)} />{#if s.consecutiveFailures}<span class="xs danger-text"> {s.consecutiveFailures}✕</span>{/if}</td>
                <td><span class="row wrap" style="gap:4px">{#each s.events.slice(0, 3) as p (p)}<span class="badge plain mono">{p}</span>{/each}{#if s.events.length > 3}<span class="xs faint">+{s.events.length - 3}</span>{/if}</span></td>
                <td style="white-space:nowrap">{#if s.lastStatus}<StatusBadge status={s.lastStatus} label={t(`wh.dstatus.${s.lastStatus}`)} /> <span class="xs faint"><Time value={s.lastDeliveryAt} /></span>{:else}<span class="faint">{t('wh.never')}</span>{/if}</td>
                <td class="hide-m mono xs truncate" style="max-width:260px" title={s.url}>{s.url}</td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        <LoadMore {cursor} busy={more} onmore={loadMore} />
      {/if}
    </Panel>

    <Panel title={t('wh.recentDeliveries')} flush>
      {#snippet aside()}
        <select class="select" style="width:auto" bind:value={dstatus} aria-label={t('common.status')}><option value="">{t('common.status')}: {t('common.all')}</option>{#each DSTATUSES as s (s)}<option value={s}>{t(`wh.dstatus.${s}`)}</option>{/each}</select>
      {/snippet}
      {#if deliveries.error}<ErrorBox error={deliveries.error} onretry={() => deliveries.load()} />
      {:else if (deliveries.loading || !deliveries.loaded) && !dItems.length}<Skeleton rows={4} />
      {:else if !dItems.length}<Empty icon="history" title={t('wh.noDeliveries')} />
      {:else}
        <DeliveryTable {sid} items={dItems} subscriptions={names} />
        <LoadMore cursor={dBefore} busy={dMore} onmore={loadMoreDeliveries} />
      {/if}
    </Panel>

    <Panel title={t('wh.recentEvents')} flush>
      {#snippet aside()}
        <select class="select" style="width:auto" bind:value={etype} aria-label={t('wh.eventType')}><option value="">{t('wh.eventType')}: {t('common.all')}</option>{#each /** @type {any[]} */ (types.data?.items ?? []) as x (x.type)}<option value={x.type}>{x.type} ({fmt.int(x.count)})</option>{/each}</select>
      {/snippet}
      {#if events.error}<ErrorBox error={events.error} onretry={() => events.load()} />
      {:else if (events.loading || !events.loaded) && !eItems.length}<Skeleton rows={4} />
      {:else if !eItems.length}<Empty icon="inbox" title={t('wh.noEvents')} />
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('common.id')}</th><th>{t('wh.type')}</th><th>{t('common.created')}</th><th class="hide-m">{t('wh.source')}</th><th class="hide-m">{t('wh.idempotencyKey')}</th></tr></thead>
          <tbody>
            {#each eItems as e (e.id)}
              <tr class="clickable" onclick={() => router.go(`/webhook-out/${sid}/events/${e.id}`)}>
                <td class="mono small">{e.id}</td>
                <td><code>{e.type}</code></td>
                <td style="white-space:nowrap"><Time value={e.createdAt} /></td>
                <td class="hide-m mono small">{e.source}</td>
                <td class="hide-m mono xs faint truncate" style="max-width:200px">{e.idempotencyKey ?? '–'}</td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        <LoadMore cursor={eBefore} busy={eMore} onmore={loadMoreEvents} />
      {/if}
    </Panel>
  </div>
</Page>

<SubscriptionForm open={createOpen} busy={creating} onsubmit={create} onclose={() => { createOpen = false; }} />
<SecretDialog {secret} onclose={closeSecret} />
