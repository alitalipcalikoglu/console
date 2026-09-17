<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Stat from '../../lib/components/Stat.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Time from '../../lib/components/Time.svelte';
  import ServiceTabs from '../../lib/components/ServiceTabs.svelte';
  import AutoRefresh from '../../lib/components/AutoRefresh.svelte';
  import PollStats from '../../lib/components/PollStats.svelte';
  import IndexForm from './IndexForm.svelte';
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
  $effect(() => service.subscribe(() => Promise.all([list.load(), stats.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  const base = $derived(`/services/${sid}/search`);
  const stats = new Resource(() => api.get(`${base}/stats`));
  const list = new Resource(() => api.get(`${base}/indexes`));
  $effect(() => { list.load(); stats.load(); });
  const st = $derived(/** @type {any} */ (stats.data));
  const items = $derived(/** @type {any[]} */ (list.data?.items ?? []));
  let createOpen = $state(false);
  let creating = $state(false);
  /** @param {any} body */
  async function create(body) {
    creating = true;
    try { const r = /** @type {any} */ (await api.post(`${base}/indexes`, body)); toasts.ok(t('se.created', { name: r.index.name })); createOpen = false; router.go(`/search/${sid}/indexes/${r.index.name}`); }
    catch (e) { toasts.error(e); } finally { creating = false; }
  }
  const svc = $derived(services.get(sid));
</script>

<Page title={svc?.label ?? t('se.title')} desc={t('se.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    {#if session.isAdmin}<button class="btn primary" onclick={() => { createOpen = true; }} aria-label={t('se.create')} title={t('se.create')}><Icon name="plus" size={16} /><span class="hide-m"> {t('se.create')}</span></button>{/if}
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="search" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:20px">
    <Stat label={t('se.indexes')} value={fmt.int(st?.indexes)} />
    <Stat label={t('se.documents')} value={fmt.int(st?.documents)} />
    <Stat label={t('se.searches')} value={fmt.int(st?.searchesSinceStart)} />
    <Stat label={t('se.dbSize')} value={st ? fmt.bytes(st.dbBytes) : '–'} />
  </div>

  <Panel title={t('se.indexes')} flush>
    {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
    {:else if (list.loading || !list.loaded) && !items.length}<Skeleton rows={4} />
    {:else if !items.length}<Empty icon="search" title={t('se.emptyTitle')} desc={t('se.emptyDesc')} />
    {:else}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>{t('se.name')}</th><th>{t('se.documents')}</th><th class="hide-m">{t('se.facetKeys')}</th><th>{t('se.lastIndexed')}</th><th class="hide-m">{t('se.searches')}</th></tr></thead>
        <tbody>
          {#each items as x (x.name)}
            <tr class="clickable" onclick={() => router.go(`/search/${sid}/indexes/${x.name}`)}>
              <td><code>{x.name}</code>{#if x.description}<div class="xs faint truncate" style="max-width:280px">{x.description}</div>{/if}</td>
              <td>{fmt.int(x.documents)}</td>
              <td class="hide-m"><span class="row wrap" style="gap:4px">{#each x.facets as f (f)}<span class="badge plain mono">{f}</span>{/each}</span></td>
              <td style="white-space:nowrap">{#if x.lastIndexedAt}<Time value={x.lastIndexedAt} />{:else}<span class="faint">{t('se.never')}</span>{/if}</td>
              <td class="hide-m">{fmt.int(x.searchesSinceStart)}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    {/if}
  </Panel>
</Page>

<IndexForm open={createOpen} busy={creating} onsubmit={create} onclose={() => { createOpen = false; }} />
