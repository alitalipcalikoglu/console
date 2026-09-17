<script>
  import { untrack } from 'svelte';
  import Page from '../lib/components/Page.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Time from '../lib/components/Time.svelte';
  import { Services, services } from '../lib/services.svelte.js';
  import { Fmt } from '../lib/format.js';
  import { t, i18n } from '../lib/i18n.svelte.js';
  import { toasts } from '../lib/toast.svelte.js';
  import { poller } from '../lib/poller.svelte.js';
  const fmt = $derived(new Fmt(i18n.lang));
  const ICONS = Services.ICONS;
  // First visit probes only the services never seen in this session; afterwards each card refreshes on demand.
  $effect(() => { if (services.loaded) untrack(() => services.refreshMissing()); });
  /**
   * Manual refresh goes through the service's poller so it never overlaps a scheduled run.
   * @param {string} id
   */
  async function refresh(id) { try { await poller.for(id).trigger(); } catch (e) { toasts.error(e); } }

  // Every service registers its status loader with its own poller; the poller decides whether a
  // timer runs (setting on, tab visible) and at what effective interval.
  $effect(() => {
    const unsubs = services.items.map((s) => poller.for(s.id).subscribe(() => services.refreshOne(s.id)));
    return () => { for (const u of unsubs) u(); };
  });
  /** @param {any} o */
  function tone(o) { return !o ? '' : o.health && o.ready ? 'ok' : o.health ? 'warn' : 'danger'; }
  /** @param {any} o */
  function label(o) { return !o ? t('common.loading') : o.health && o.ready ? t('overview.healthy') : o.health ? t('overview.degraded') : t('overview.down'); }
  /** @param {any} s @param {any} o */
  function facts(s, o) {
    const m = o?.summary;
    if (!m || m.error) return [];
    switch (s.type) {
      case 'notify': return [[t('notify.queued'), fmt.int(m.queued)], [t('notify.failed'), fmt.int(m.failed)], [t('notify.sent'), fmt.int(m.sent)], [t('notify.oldest'), fmt.duration(m.oldestQueuedAgeSec)]];
      case 'auth': return [[t('auth.activeUsers'), fmt.int(m.activeUsers)], [t('auth.activeSessions'), fmt.int(m.activeSessions)], [t('auth.disabledUsers'), fmt.int(m.disabledUsers)]];
      case 'media': return [[t('media.files'), fmt.int(m.files)], [t('media.stored'), fmt.bytes(m.storedBytes)], [t('media.downloads'), fmt.int(m.downloads)]];
      case 'gateway': { const routes = Object.values(m.routes ?? {}); const req = routes.reduce((a, /** @type {any} */ r) => a + Object.values(r.requests).reduce((x, y) => x + Number(y), 0), 0); return [[t('gateway.requests'), fmt.int(req)], [t('gateway.routes'), fmt.int(routes.length)], [t('gateway.rateLimited'), fmt.int(m.rejected?.rate_limited ?? 0)]]; }
      case 'audit': return [[t('ev.totalEvents'), fmt.int(m.total)], [t('ev.lastHour'), fmt.int(m.lastHour)], [t('ev.headSeq'), fmt.int(m.headSeq)], [t('ev.dbSize'), fmt.bytes(m.dbBytes)]];
      case 'shortlink': return [[t('sl.activeLinks'), fmt.int(m.activeLinks)], [t('sl.clicks'), fmt.int(m.clicks)], [t('sl.clicksLastHour'), fmt.int(m.clicksLastHour)], [t('sl.inactiveLinks'), fmt.int(m.inactiveLinks)]];
      case 'flags': return [[t('fl.flags'), fmt.int(m.activeFlags)], ...Object.entries(m.enabledByEnv ?? {}).map(([env, n]) => [`${env} ${t('fl.enabledShort')}`, fmt.int(/** @type {number} */ (n))]), [t('fl.archived'), fmt.int(m.archivedFlags)]];
      case 'scheduler': return [[t('sc.enabledJobs'), fmt.int(m.enabledJobs)], [t('sc.nextDue'), m.nextDueSec == null || m.nextDueSec < 0 ? '–' : fmt.duration(m.nextDueSec)], [t('sc.status.succeeded'), fmt.int(m.runsByStatus?.succeeded ?? 0)], [t('sc.status.failed'), fmt.int(m.runsByStatus?.failed ?? 0)]];
      case 'webhook-out': return [[t('wh.activeSubs'), fmt.int(m.activeSubscriptions)], [t('wh.status.disabled'), fmt.int(m.disabledSubscriptions)], [t('wh.backlog'), fmt.int(m.backlog)], [t('wh.dstatus.failed'), fmt.int(m.deliveriesByStatus?.failed ?? 0)]];
      case 'search': return [[t('se.indexes'), fmt.int(m.indexes)], [t('se.documents'), fmt.int(m.documents)], [t('se.searches'), fmt.int(Object.values(m.queriesByIndex ?? {}).reduce((a, n) => a + Number(n), 0))], [t('se.dbSize'), fmt.bytes(m.dbBytes)]];
      case 'ratelimit': return [[t('rl.policies'), fmt.int(m.policies)], [t('rl.allowedShort'), fmt.int(m.allowed)], [t('rl.deniedShort'), fmt.int(m.denied)], [t('rl.counters'), fmt.int(m.counters)]];
      case 'geo': return [[t('ge.lookups'), fmt.int(m.lookupsTotal)], [t('ge.database'), m.databaseLoaded ? t('ge.loaded') : t('ge.none')], [t('ge.collections'), fmt.int(m.collections)], [t('ge.places'), fmt.int(m.places)]];
      default: return [];
    }
  }
</script>

<Page title={t('overview.title')} desc={t('overview.desc')}>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr))">
    {#each services.items as s (s.id)}
      {@const o = services.overview[s.id]}
      {@const p = poller.for(s.id)}
      <div class="card service">
        <div class="card-body">
          <div class="row" style="margin-bottom:10px">
            <a href="/{s.type}/{s.id}" class="icon-wrap" aria-label={t('overview.open')}><Icon name={ICONS[s.type]} size={20} /></a>
            <div class="grow" style="min-width:90px"><a href="/{s.type}/{s.id}" style="font-weight:650;color:inherit">{s.label}</a><div class="xs faint truncate">{s.type} · <span class="mono">{s.url.replace(/^https?:\/\//, '')}</span></div></div>
            <span class="badge {tone(o)}">{label(o)}</span>
            {#if p.running}<span class="xs muted mono" title="{t('poll.label')}: {p.effectiveSec} s"><Icon name="clock" size={12} /> {p.inFlight ? '…' : `${p.countdown}s`}</span>{/if}
            <button class="btn ghost icon sm" onclick={() => refresh(s.id)} disabled={p.inFlight} aria-label="{t('common.refresh')} {s.label}" title={t('common.refresh')}><Icon name="refresh" size={14} /></button>
          </div>
          {#if o?.summary?.error}
            <p class="small warn-text">{t('overview.noMetrics')}: {o.summary.error}</p>
          {:else if facts(s, o).length}
            <dl class="kv">{#each facts(s, o) as [k, v] (k)}<dt>{k}</dt><dd style="font-variant-numeric:tabular-nums;font-weight:600">{v}</dd>{/each}</dl>
          {:else if o}
            <p class="small faint">{t('overview.noMetrics')}</p>
          {:else}
            <div class="skeleton" style="height:48px"></div>
          {/if}
          {#if o}<div class="xs faint row" style="margin-top:10px"><span class="grow">{t('overview.latency')} {fmt.ms(o.latencyMs)}{#if o.summary?.uptimeSec != null} · {t('overview.uptime')} {fmt.duration(o.summary.uptimeSec)}{/if}</span>{#if services.refreshedAt[s.id]}<Time value={services.refreshedAt[s.id]} />{/if}</div>{/if}
        </div>
      </div>
    {/each}
  </div>
</Page>

<style>
  .icon-wrap { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); flex: none; }
  .service a:hover { text-decoration: none; }
</style>
