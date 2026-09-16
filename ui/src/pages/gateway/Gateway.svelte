<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Stat from '../../lib/components/Stat.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import ServiceTabs from '../../lib/components/ServiceTabs.svelte';
  import AutoRefresh from '../../lib/components/AutoRefresh.svelte';
  import PollStats from '../../lib/components/PollStats.svelte';
  import { poller } from '../../lib/poller.svelte.js';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { services } from '../../lib/services.svelte.js';
  import { Fmt } from '../../lib/format.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => res.load()));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  const res = new Resource(() => api.get(`/services/${sid}/status`));
  $effect(() => { res.load(); });
  const d = $derived(/** @type {any} */ (res.data));
  const m = $derived(d?.summary && !d.summary.error ? d.summary : null);
  const routes = $derived(Object.entries(/** @type {Record<string, any>} */ (m?.routes ?? {})).sort((a, b) => total(b[1]) - total(a[1])));
  /** @param {any} r */
  function total(r) { return Object.values(r.requests ?? {}).reduce((a, b) => a + Number(b), 0); }
  const upstreams = $derived(/** @type {Record<string, string>} */ (d?.readyDetail?.upstreams ?? {}));
  const svc = $derived(services.get(sid));
</script>

<Page title={svc?.label ?? t('gateway.title')} desc={t('gateway.desc')}>
  {#snippet actions()}<AutoRefresh {sid} /><button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>{/snippet}
  <ServiceTabs type="gateway" {sid} />
  <PollStats {sid} />
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} />
  {:else if !d}<Skeleton rows={5} />
  {:else}
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:20px">
      <Stat label={t('common.status')} value={d.health && d.ready ? t('overview.healthy') : d.health ? t('overview.degraded') : t('overview.down')} tone={d.health && d.ready ? 'ok' : d.health ? 'warn' : 'danger'} sub="{t('overview.latency')} {fmt.ms(d.latencyMs)}" />
      <Stat label={t('gateway.requests')} value={fmt.int(routes.reduce((a, [, r]) => a + total(r), 0))} />
      <Stat label={t('gateway.rateLimited')} value={fmt.int(m?.rejected?.rate_limited ?? 0)} tone={m?.rejected?.rate_limited ? 'warn' : ''} />
      <Stat label={t('gateway.unauthorized')} value={fmt.int(m?.rejected?.unauthorized ?? 0)} />
      <Stat label={t('gateway.noRoute')} value={fmt.int(m?.rejected?.no_route ?? 0)} />
      {#if m?.uptimeSec != null}<Stat label={t('overview.uptime')} value={fmt.duration(m.uptimeSec)} />{/if}
    </div>
    <div class="stack">
      <Panel title={t('gateway.upstreams')}>
        {#if !Object.keys(upstreams).length}<p class="small muted">–</p>{:else}
        <div class="row wrap">{#each Object.entries(upstreams) as [route, ratio] (route)}
          {@const [ok, all] = ratio.split('/').map(Number)}
          <span class="badge {ok === 0 ? 'danger' : ok < all ? 'warn' : 'ok'}">{route} {ratio}</span>
        {/each}</div>{/if}
      </Panel>
      <Panel title={t('gateway.routes')} flush>
        {#if !m}<p class="small muted" style="padding:8px">{t('gateway.noMetrics')}</p>
        {:else if !routes.length}<p class="small muted" style="padding:8px">–</p>
        {:else}<div class="table-wrap"><table class="table">
          <thead><tr><th>{t('gateway.route')}</th><th class="num">{t('gateway.requests')}</th><th class="num">2xx</th><th class="num">4xx</th><th class="num">5xx</th><th class="num">{t('gateway.errors')}</th><th class="num">{t('gateway.p50')}</th><th class="num">{t('gateway.p95')}</th><th class="num">{t('gateway.in')}</th><th class="num">{t('gateway.out')}</th></tr></thead>
          <tbody>{#each routes as [id, r] (id)}<tr>
            <td><code>{id}</code></td><td class="num">{fmt.int(total(r))}</td><td class="num ok-text">{fmt.int(r.requests['2xx'] ?? 0)}</td><td class="num">{fmt.int(r.requests['4xx'] ?? 0)}</td><td class="num {r.requests['5xx'] ? 'danger-text' : ''}">{fmt.int(r.requests['5xx'] ?? 0)}</td>
            <td class="num {r.upstreamErrors ? 'warn-text' : ''}">{fmt.int(r.upstreamErrors)}</td><td class="num">{r.p50Ms == null ? '–' : `≤${fmt.ms(r.p50Ms)}`}</td><td class="num">{r.p95Ms == null ? '–' : `≤${fmt.ms(r.p95Ms)}`}</td><td class="num">{fmt.bytes(r.bytesIn)}</td><td class="num">{fmt.bytes(r.bytesOut)}</td>
          </tr>{/each}</tbody></table></div>{/if}
      </Panel>
    </div>
  {/if}
</Page>
