<script>
  import Page from '$lib/components/Page.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Stat from '$lib/components/Stat.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorBox from '$lib/components/ErrorBox.svelte';
  import Time from '$lib/components/Time.svelte';
  import LoadMore from '$lib/components/LoadMore.svelte';
  import ServiceTabs from '$lib/components/ServiceTabs.svelte';
  import AutoRefresh from '$lib/components/AutoRefresh.svelte';
  import PollStats from '$lib/components/PollStats.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import JobForm from './JobForm.svelte';
  import { poller } from '$lib/client/poller.svelte.js';
  import { api } from '$lib/client/api.js';
  import { Resource } from '$lib/client/resource.svelte.js';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { Navigation } from '$lib/client/navigation.js';
  import { useSession } from '$lib/client/session.svelte.js';
  const session = useSession();
  import { services } from '$lib/client/services.svelte.js';
  import { Fmt } from '$lib/client/format.js';
  import { t, i18n } from '$lib/client/i18n.svelte.js';
  import { toasts } from '$lib/client/toast.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const STATUSES = ['pending', 'running', 'retrying', 'succeeded', 'failed', 'skipped', 'cancelled'];
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => Promise.all([list.load(), stats.load(), runs.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  let enabled = $state(route.url.searchParams.get('enabled') ?? '');
  let q = $state(route.url.searchParams.get('q') ?? '');
  let tag = $state(route.url.searchParams.get('tag') ?? '');
  let runStatus = $state(route.url.searchParams.get('status') ?? '');
  /** @type {any[]} */ let items = $state([]);
  /** @type {string|null} */ let cursor = $state(null);
  let more = $state(false);
  const qs = (/** @type {string|null} */ c) => { const p = new URLSearchParams({ limit: '50' }); if (enabled) p.set('enabled', enabled); if (q.trim()) p.set('q', q.trim()); if (tag.trim()) p.set('tag', tag.trim().toLowerCase()); if (c) p.set('cursor', c); return p.toString(); };
  const stats = new Resource(() => api.get(`/services/${sid}/scheduler/stats`));
  const list = new Resource(async () => {
    const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/scheduler/jobs?${qs(null)}`));
    items = r.items; cursor = r.nextCursor; return r;
  });
  /** @type {any[]} */ let runItems = $state([]);
  /** @type {string|null} */ let runBefore = $state(null);
  let runMore = $state(false);
  const rqs = (/** @type {string|null} */ b) => { const p = new URLSearchParams({ limit: '20' }); if (runStatus) p.set('status', runStatus); if (b) p.set('before', b); return p.toString(); };
  const runs = new Resource(async () => {
    const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(`/services/${sid}/scheduler/runs?${rqs(null)}`));
    runItems = r.items; runBefore = r.nextBefore; return r;
  });
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  $effect(() => { enabled; q; tag; clearTimeout(timer); timer = setTimeout(() => { Navigation.replaceQuery(route.url, { enabled, q, tag }); list.load(); }, 300); return () => clearTimeout(timer); });
  $effect(() => { runStatus; Navigation.replaceQuery(route.url, { status: runStatus }); runs.load(); });
  $effect(() => { stats.load(); });
  async function loadMore() {
    more = true;
    try { const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/scheduler/jobs?${qs(cursor)}`)); items = [...items, ...r.items]; cursor = r.nextCursor; }
    catch (e) { toasts.error(e); } finally { more = false; }
  }
  async function loadMoreRuns() {
    runMore = true;
    try { const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(`/services/${sid}/scheduler/runs?${rqs(runBefore)}`)); runItems = [...runItems, ...r.items]; runBefore = r.nextBefore; }
    catch (e) { toasts.error(e); } finally { runMore = false; }
  }
  const st = $derived(/** @type {any} */ (stats.data));
  /** @type {Record<string, boolean>} */ let busy = $state({});
  /** @param {any} j @param {boolean} next */
  async function toggle(j, next) {
    busy = { ...busy, [j.name]: true };
    try {
      const r = /** @type {any} */ (await api.patch(`/services/${sid}/scheduler/jobs/${encodeURIComponent(j.name)}`, { enabled: next }));
      items = items.map((x) => (x.name === j.name ? r.job : x));
      toasts.ok(t(next ? 'sc.resumed' : 'sc.pausedOk'));
      stats.load();
    } catch (e) { toasts.error(e); } finally { busy = { ...busy, [j.name]: false }; }
  }
  let createOpen = $state(false);
  let creating = $state(false);
  /** @type {string[]} */ let targetKeys = $state([]);
  /** @type {string[]} */ let timezones = $state([]);
  /** Target keys and timezones are fetched once, before the dialog opens, so its defaults can use them. */
  async function openCreate() {
    if (!timezones.length) {
      try {
        const [k, z] = await Promise.all([api.get(`/services/${sid}/scheduler/target-keys`), api.get(`/services/${sid}/scheduler/timezones`)]);
        targetKeys = /** @type {any} */ (k).items; timezones = /** @type {any} */ (z).items;
      } catch (e) { toasts.error(e); return; }
    }
    createOpen = true;
  }
  /** @param {any} body */
  async function create(body) {
    creating = true;
    try { const r = /** @type {any} */ (await api.post(`/services/${sid}/scheduler/jobs`, body)); toasts.ok(t('sc.created', { name: r.job.name })); createOpen = false; goto(`/scheduler/${sid}/jobs/${r.job.name}`); }
    catch (e) { toasts.error(e); } finally { creating = false; }
  }
  const svc = $derived(services.get(sid));
</script>

<Page title={svc?.label ?? t('sc.title')} desc={t('sc.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    {#if session.isAdmin}<button class="btn primary" onclick={openCreate} aria-label={t('sc.create')} title={t('sc.create')}><Icon name="plus" size={16} /><span class="hide-m"> {t('sc.create')}</span></button>{/if}
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="scheduler" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:20px">
    <Stat label={t('sc.jobs')} value={fmt.int(st?.jobs?.total)} sub={st ? `${fmt.int(st.jobs.enabled)} ${t('sc.enabled').toLowerCase()} · ${fmt.int(st.jobs.total - st.jobs.enabled)} ${t('sc.pausedJobs')}` : undefined} />
    <Stat label={t('sc.nextDue')} value={st ? (st.jobs.nextDueAt ? fmt.relative(st.jobs.nextDueAt) : '–') : '–'} sub={st?.jobs?.nextDueAt ? fmt.dateTime(st.jobs.nextDueAt) : st ? t('sc.nothingDue') : undefined} />
    <Stat label={t('sc.failed24h')} value={fmt.int(st?.runs?.last24h?.failed)} sub={st ? `${fmt.int(st.runs.last24h.succeeded)} ${t('sc.succeededShort')}` : undefined} tone={st?.runs?.last24h?.failed ? 'danger' : ''} />
    <Stat label={t('sc.inFlight')} value={st ? (st.worker.running ? fmt.int(st.worker.inFlight) : '–') : '–'} sub={st ? (st.worker.running ? `${fmt.int(st.worker.concurrency)} ${t('sc.concurrency')}` : t('sc.workerStopped')) : undefined} tone={st && !st.worker.running ? 'danger' : ''} />
  </div>

  <div class="stack">
    <Panel title={t('sc.jobs')} flush>
      {#snippet aside()}
        <div class="seg"><button aria-pressed={enabled === ''} onclick={() => { enabled = ''; }}>{t('common.all')}</button><button aria-pressed={enabled === 'true'} onclick={() => { enabled = 'true'; }}>{t('sc.enabled')}</button><button aria-pressed={enabled === 'false'} onclick={() => { enabled = 'false'; }}>{t('sc.paused')}</button></div>
        <input class="input" style="width:min(220px,100%)" type="search" placeholder={t('sc.search')} bind:value={q} />
        <input class="input" style="width:min(130px,100%)" type="search" placeholder={t('sl.tag')} bind:value={tag} />
      {/snippet}
      {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
      {:else if (list.loading || !list.loaded) && !items.length}<Skeleton rows={6} />
      {:else if !items.length}<Empty icon="clock" title={t('sc.emptyTitle')} desc={t('sc.emptyDesc')} />
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('sc.name')}</th><th>{t('sc.schedule')}</th><th>{t('sc.nextRun')}</th><th>{t('sc.lastRun')}</th><th class="hide-m">{t('sl.tags')}</th><th>{t('sc.enabled')}</th></tr></thead>
          <tbody>
            {#each items as j (j.name)}
              <tr class="clickable" onclick={() => goto(`/scheduler/${sid}/jobs/${j.name}`)}>
                <td><code>{j.name}</code>{#if j.description}<div class="xs faint truncate" style="max-width:280px">{j.description}</div>{/if}</td>
                <td style="white-space:nowrap">{#if j.schedule.cron}<span class="mono small">{j.schedule.cron}</span><div class="xs faint">{j.schedule.timezone}</div>{:else}<span class="badge plain">{t('sc.oneShot')}</span><div class="xs faint">{fmt.dateTime(j.schedule.at)}</div>{/if}</td>
                <td style="white-space:nowrap">{#if j.nextRunAt}<Time value={j.nextRunAt} />{:else}<span class="faint">–</span>{/if}</td>
                <td style="white-space:nowrap">{#if j.lastStatus}<StatusBadge status={j.lastStatus} label={t(`sc.status.${j.lastStatus}`)} /> <span class="xs faint"><Time value={j.lastRunAt} /></span>{:else}<span class="faint">{t('sc.never')}</span>{/if}</td>
                <td class="hide-m"><span class="row wrap" style="gap:4px">{#each j.tags as tg (tg)}<span class="badge plain">{tg}</span>{/each}</span></td>
                <td><span role="presentation" onclick={(ev) => ev.stopPropagation()}><Switch size="sm" checked={j.enabled} disabled={!session.isAdmin} busy={busy[j.name]} label="{j.name} {t('sc.enabled')}" onchange={(next) => toggle(j, next)} /></span></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        <LoadMore {cursor} busy={more} onmore={loadMore} />
      {/if}
    </Panel>

    <Panel title={t('sc.recentRuns')} flush>
      {#snippet aside()}
        <select class="select" style="width:auto" bind:value={runStatus} aria-label={t('common.status')}><option value="">{t('common.status')}: {t('common.all')}</option>{#each STATUSES as s (s)}<option value={s}>{t(`sc.status.${s}`)}</option>{/each}</select>
      {/snippet}
      {#if runs.error}<ErrorBox error={runs.error} onretry={() => runs.load()} />
      {:else if (runs.loading || !runs.loaded) && !runItems.length}<Skeleton rows={4} />
      {:else if !runItems.length}<Empty icon="history" title={t('sc.noRuns')} />
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>#</th><th>{t('sc.job')}</th><th>{t('common.status')}</th><th>{t('sc.scheduledFor')}</th><th class="hide-m">{t('sc.trigger')}</th><th class="hide-m">{t('sc.duration')}</th><th class="hide-m">HTTP</th></tr></thead>
          <tbody>
            {#each runItems as r (r.id)}
              <tr class="clickable" onclick={() => goto(`/scheduler/${sid}/runs/${r.id}`)}>
                <td class="mono small">{r.id}</td>
                <td><code>{r.job}</code></td>
                <td><StatusBadge status={r.status} label={t(`sc.status.${r.status}`)} />{#if r.attempt > 1 || r.status === 'retrying'} <span class="xs faint">{r.attempt}/{r.maxAttempts}</span>{/if}</td>
                <td style="white-space:nowrap"><Time value={r.scheduledFor} /></td>
                <td class="hide-m small">{t(`sc.trigger.${r.trigger}`)}</td>
                <td class="hide-m small">{fmt.ms(r.durationMs)}</td>
                <td class="hide-m mono small">{r.httpStatus ?? '–'}</td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        <LoadMore cursor={runBefore} busy={runMore} onmore={loadMoreRuns} />
      {/if}
    </Panel>
  </div>
</Page>

<JobForm open={createOpen} {sid} busy={creating} {targetKeys} {timezones} onsubmit={create} onclose={() => { createOpen = false; }} />
