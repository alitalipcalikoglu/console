<script>
  import { untrack } from 'svelte';
  import Page from '../lib/components/Page.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Time from '../lib/components/Time.svelte';
  import { services } from '../lib/services.svelte.js';
  import { Fmt } from '../lib/format.js';
  import { t, i18n } from '../lib/i18n.svelte.js';
  import { toasts } from '../lib/toast.svelte.js';
  import { visibility } from '../lib/visibility.svelte.js';
  const fmt = $derived(new Fmt(i18n.lang));
  /** @type {Record<string, string>} */
  const ICONS = { notify: 'bell', auth: 'users', media: 'image', gateway: 'route' };
  // First visit probes only the services never seen in this session; afterwards each card refreshes on demand.
  $effect(() => { if (services.loaded) untrack(() => services.refreshMissing()); });
  /** @param {string} id */
  async function refresh(id) { try { await services.refreshOne(id); } catch (e) { toasts.error(e); } }

  // Per-service polling on the overview: every service whose own setting is enabled ticks at its
  // own interval while this page is open and the tab is visible. Same setting as its page.
  /** @type {Record<string, number>} */
  let countdown = $state({});
  $effect(() => {
    const polled = services.items.filter((s) => s.polling.enabled);
    if (!visibility.visible || !polled.length) { countdown = {}; return; }
    countdown = Object.fromEntries(polled.map((s) => [s.id, s.polling.intervalSec]));
    const timers = polled.map((s) => setInterval(() => {
      const next = (countdown[s.id] ?? s.polling.intervalSec) - 1;
      if (next <= 0) { countdown = { ...countdown, [s.id]: s.polling.intervalSec }; services.refreshOne(s.id).catch(() => {}); }
      else countdown = { ...countdown, [s.id]: next };
    }, 1000));
    return () => { for (const id of timers) clearInterval(id); };
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
      default: return [];
    }
  }
</script>

<Page title={t('overview.title')} desc={t('overview.desc')}>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr))">
    {#each services.items as s (s.id)}
      {@const o = services.overview[s.id]}
      <div class="card service">
        <div class="card-body">
          <div class="row" style="margin-bottom:10px">
            <a href="/{s.type}/{s.id}" class="icon-wrap" aria-label={t('overview.open')}><Icon name={ICONS[s.type]} size={20} /></a>
            <div class="grow" style="min-width:90px"><a href="/{s.type}/{s.id}" style="font-weight:650;color:inherit">{s.label}</a><div class="xs faint truncate">{s.type} · <span class="mono">{s.url.replace(/^https?:\/\//, '')}</span></div></div>
            <span class="badge {tone(o)}">{label(o)}</span>
            {#if s.polling.enabled && countdown[s.id] !== undefined}<span class="xs muted mono" title="{t('poll.label')}: {s.polling.intervalSec} s"><Icon name="clock" size={12} /> {countdown[s.id]}s</span>{/if}
            <button class="btn ghost icon sm" onclick={() => refresh(s.id)} disabled={services.refreshing[s.id]} aria-label="{t('common.refresh')} {s.label}" title={t('common.refresh')}><Icon name="refresh" size={14} /></button>
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
