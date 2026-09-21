<script>
  import Page from '$lib/components/Page.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Stat from '$lib/components/Stat.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorBox from '$lib/components/ErrorBox.svelte';
  import ServiceTabs from '$lib/components/ServiceTabs.svelte';
  import AutoRefresh from '$lib/components/AutoRefresh.svelte';
  import PollStats from '$lib/components/PollStats.svelte';
  import PolicyForm from './PolicyForm.svelte';
  import { poller } from '$lib/client/poller.svelte.js';
  import { api } from '$lib/client/api.js';
  import { Resource } from '$lib/client/resource.svelte.js';
  import { goto } from '$app/navigation';
  import { useSession } from '$lib/client/session.svelte.js';
  const session = useSession();
  import { services } from '$lib/client/services.svelte.js';
  import { Fmt } from '$lib/client/format.js';
  import { LimitRows } from '$lib/client/limits.js';
  import { t, i18n } from '$lib/client/i18n.svelte.js';
  import { toasts } from '$lib/client/toast.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => Promise.all([list.load(), stats.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  const base = $derived(`/services/${sid}/ratelimit`);
  const stats = new Resource(() => api.get(`${base}/stats`));
  const list = new Resource(() => api.get(`${base}/policies`));
  $effect(() => { list.load(); stats.load(); });
  const st = $derived(/** @type {any} */ (stats.data));
  const items = $derived(/** @type {any[]} */ (list.data?.items ?? []));
  const denyRate = $derived(st && st.last24h.allowed + st.last24h.denied > 0 ? Math.round((st.last24h.denied / (st.last24h.allowed + st.last24h.denied)) * 1000) / 10 : null);
  /** @param {{ window: number, limit: number }} l */
  const label = (l) => { const s = LimitRows.split(l.window); return `${fmt.int(l.limit)}/${s.n}${t(`rl.unit.${s.unit}`)}`; };
  let createOpen = $state(false);
  let creating = $state(false);
  /** @param {any} body */
  async function create(body) {
    creating = true;
    try { const r = /** @type {any} */ (await api.post(`${base}/policies`, body)); toasts.ok(t('rl.created', { name: r.policy.name })); createOpen = false; goto(`/ratelimit/${sid}/policies/${r.policy.name}`); }
    catch (e) { toasts.error(e); } finally { creating = false; }
  }
  const svc = $derived(services.get(sid));
</script>

<Page title={svc?.label ?? t('rl.title')} desc={t('rl.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    {#if session.isAdmin}<button class="btn primary" onclick={() => { createOpen = true; }} aria-label={t('rl.create')} title={t('rl.create')}><Icon name="plus" size={16} /><span class="hide-m"> {t('rl.create')}</span></button>{/if}
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="ratelimit" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:20px">
    <Stat label={t('rl.policies')} value={fmt.int(st?.policies)} />
    <Stat label={t('rl.allowed24h')} value={fmt.int(st?.last24h?.allowed)} />
    <Stat label={t('rl.denied24h')} value={fmt.int(st?.last24h?.denied)} tone={st?.last24h?.denied ? 'warn' : ''} sub={denyRate === null ? undefined : t('rl.denyRate', { p: denyRate })} />
    <Stat label={t('rl.counters')} value={fmt.int(st?.counters)} sub={st ? fmt.bytes(st.dbBytes) : undefined} />
  </div>

  <Panel title={t('rl.policies')} flush>
    {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
    {:else if (list.loading || !list.loaded) && !items.length}<Skeleton rows={4} />
    {:else if !items.length}<Empty icon="gauge" title={t('rl.emptyTitle')} desc={t('rl.emptyDesc')} />
    {:else}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>{t('rl.name')}</th><th>{t('rl.limits')}</th><th class="hide-m">{t('rl.overrides')}</th><th class="hide-m">{t('rl.activeSubjects')}</th><th>{t('rl.allowed24h')}</th><th>{t('rl.denied24h')}</th></tr></thead>
        <tbody>
          {#each items as x (x.name)}
            <tr class="clickable" onclick={() => goto(`/ratelimit/${sid}/policies/${x.name}`)}>
              <td><code>{x.name}</code>{#if x.description}<div class="xs faint truncate" style="max-width:280px">{x.description}</div>{/if}</td>
              <td><span class="row wrap" style="gap:4px">{#each x.limits as l (l.window)}<span class="badge plain mono">{label(l)}</span>{/each}</span></td>
              <td class="hide-m">{fmt.int(x.overrides)}</td>
              <td class="hide-m">{fmt.int(x.activeSubjects)}</td>
              <td>{fmt.int(x.last24h.allowed)}</td>
              <td class={x.last24h.denied ? 'warn-text' : ''}>{fmt.int(x.last24h.denied)}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    {/if}
  </Panel>
</Page>

<PolicyForm open={createOpen} busy={creating} onsubmit={create} onclose={() => { createOpen = false; }} />
