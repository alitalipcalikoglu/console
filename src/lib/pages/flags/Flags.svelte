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
  import FlagForm from './FlagForm.svelte';
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
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => Promise.all([list.load(), stats.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  let archived = $state(route.url.searchParams.get('archived') === 'true');
  let q = $state(route.url.searchParams.get('q') ?? '');
  let tag = $state(route.url.searchParams.get('tag') ?? '');
  let kind = $state(route.url.searchParams.get('kind') ?? '');
  /** @type {any[]} */ let items = $state([]);
  /** @type {string|null} */ let cursor = $state(null);
  let more = $state(false);
  const qs = (/** @type {string|null} */ c) => { const p = new URLSearchParams({ limit: '50', archived: String(archived) }); if (q.trim()) p.set('q', q.trim()); if (tag.trim()) p.set('tag', tag.trim().toLowerCase()); if (kind) p.set('kind', kind); if (c) p.set('cursor', c); return p.toString(); };
  const stats = new Resource(() => api.get(`/services/${sid}/flags/stats`));
  const list = new Resource(async () => {
    const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/flags/flags?${qs(null)}`));
    items = r.items; cursor = r.nextCursor; return r;
  });
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  $effect(() => { archived; q; tag; kind; clearTimeout(timer); timer = setTimeout(() => { Navigation.replaceQuery(route.url, { archived: archived ? 'true' : null, q, tag, kind }); list.load(); }, 300); return () => clearTimeout(timer); });
  $effect(() => { stats.load(); });
  async function loadMore() {
    more = true;
    try { const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/flags/flags?${qs(cursor)}`)); items = [...items, ...r.items]; cursor = r.nextCursor; }
    catch (e) { toasts.error(e); } finally { more = false; }
  }
  const st = $derived(/** @type {any} */ (stats.data));
  const envs = $derived(/** @type {{ env: string, version: number, enabled: number, evaluations: number }[]} */ (st?.environments ?? []));
  /** @type {Record<string, boolean>} */ let busy = $state({});
  /** @param {any} f @param {string} env @param {boolean} next */
  async function toggle(f, env, next) {
    const id = `${f.key}:${env}`;
    busy = { ...busy, [id]: true };
    try {
      const r = /** @type {any} */ (await api.patch(`/services/${sid}/flags/flags/${encodeURIComponent(f.key)}/envs/${env}`, { enabled: next }));
      items = items.map((x) => (x.key === f.key ? { ...x, environments: { ...x.environments, [env]: r.state } } : x));
      toasts.ok(t(next ? 'fl.enabledIn' : 'fl.disabledIn', { key: f.key, env }));
      stats.load();
    } catch (e) { toasts.error(e); } finally { busy = { ...busy, [id]: false }; }
  }
  let createOpen = $state(false);
  let creating = $state(false);
  /** @param {any} body */
  async function create(body) {
    creating = true;
    try { const r = /** @type {any} */ (await api.post(`/services/${sid}/flags/flags`, body)); toasts.ok(t('fl.created', { key: r.flag.key })); createOpen = false; goto(`/flags/${sid}/flags/${r.flag.key}`); }
    catch (e) { toasts.error(e); } finally { creating = false; }
  }
  const svc = $derived(services.get(sid));
  /** @param {any} f @param {string} env */
  const summary = (f, env) => { const s = f.environments?.[env]; if (!s) return ''; const parts = []; if (s.rules?.length) parts.push(`${s.rules.length} ${t('fl.rulesShort')}`); if (s.percentage < 100) parts.push(`${s.percentage}%`); return parts.join(' · '); };
</script>

<Page title={svc?.label ?? t('fl.title')} desc={t('fl.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    {#if session.isAdmin}<button class="btn primary" onclick={() => { createOpen = true; }} aria-label={t('fl.create')} title={t('fl.create')}><Icon name="plus" size={16} /><span class="hide-m"> {t('fl.create')}</span></button>{/if}
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="flags" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:20px">
    <Stat label={t('fl.flags')} value={fmt.int(st?.flags?.total)} sub={st ? `${t('fl.archived')}: ${fmt.int(st.flags.archived)}` : undefined} />
    {#each envs as e (e.env)}<Stat label={e.env} value={fmt.int(e.enabled)} sub="{t('fl.enabledShort')} · v{e.version} · {fmt.int(e.evaluations)} {t('fl.evals')}" />{/each}
  </div>

  <Panel title={t('fl.flags')} flush>
    {#snippet aside()}
      <div class="seg"><button aria-pressed={!archived} onclick={() => { archived = false; }}>{t('fl.active')}</button><button aria-pressed={archived} onclick={() => { archived = true; }}>{t('fl.archived')}</button></div>
      <select class="select" style="width:auto" bind:value={kind} aria-label={t('fl.kind')}><option value="">{t('fl.kind')}: {t('common.all')}</option>{#each ['boolean', 'string', 'number', 'json'] as k (k)}<option value={k}>{k}</option>{/each}</select>
      <input class="input" style="width:min(220px,100%)" type="search" placeholder={t('fl.search')} bind:value={q} />
      <input class="input" style="width:min(130px,100%)" type="search" placeholder={t('sl.tag')} bind:value={tag} />
    {/snippet}
    {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
    {:else if list.loading && !items.length}<Skeleton rows={6} />
    {:else if !items.length}<Empty icon="flag" title={t('fl.emptyTitle')} desc={t('fl.emptyDesc')} />
    {:else}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>{t('fl.key')}</th><th class="hide-m">{t('fl.kind')}</th>{#each envs as e (e.env)}<th>{e.env}</th>{/each}<th class="hide-m">{t('sl.tags')}</th><th class="hide-m">{t('common.updated')}</th></tr></thead>
        <tbody>
          {#each items as f (f.key)}
            <tr class="clickable" onclick={() => goto(`/flags/${sid}/flags/${f.key}`)}>
              <td><code>{f.key}</code>{#if f.description}<div class="xs faint truncate" style="max-width:280px">{f.description}</div>{/if}</td>
              <td class="hide-m"><span class="badge plain">{f.kind}</span></td>
              {#each envs as e (e.env)}
                <td>
                  {#if f.environments?.[e.env]}
                    <span class="row" style="gap:6px" role="presentation" onclick={(ev) => ev.stopPropagation()}><Switch size="sm" checked={f.environments[e.env].enabled} disabled={!session.isAdmin || f.archived} busy={busy[`${f.key}:${e.env}`]} label="{f.key} · {e.env}" onchange={(next) => toggle(f, e.env, next)} /><span class="xs faint">{summary(f, e.env)}</span></span>
                  {:else}<span class="faint">–</span>{/if}
                </td>
              {/each}
              <td class="hide-m"><span class="row wrap" style="gap:4px">{#each f.tags as tg (tg)}<span class="badge plain">{tg}</span>{/each}</span></td>
              <td class="hide-m small"><Time value={f.updatedAt} /></td>
            </tr>
          {/each}
        </tbody>
      </table></div>
      <LoadMore {cursor} busy={more} onmore={loadMore} />
    {/if}
  </Panel>
</Page>

<FlagForm open={createOpen} busy={creating} onsubmit={create} onclose={() => { createOpen = false; }} />
