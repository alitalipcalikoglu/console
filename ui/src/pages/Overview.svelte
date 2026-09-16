<script>
  import Page from '../lib/components/Page.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Time from '../lib/components/Time.svelte';
  import { services } from '../lib/services.svelte.js';
  import { Fmt } from '../lib/format.js';
  import { t, i18n } from '../lib/i18n.svelte.js';
  import { toasts } from '../lib/toast.svelte.js';
  const fmt = $derived(new Fmt(i18n.lang));
  let busy = $state(false);
  /** @type {Record<string, string>} */
  const ICONS = { notify: 'bell', auth: 'users', media: 'image', gateway: 'route' };
  async function refresh() { busy = true; try { await services.refreshOverview(); } catch (e) { toasts.error(e); } finally { busy = false; } }
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
  {#snippet actions()}
    {#if services.overviewAt}<span class="xs faint"><Time value={services.overviewAt} /></span>{/if}
    <button class="btn" onclick={refresh} disabled={busy}><Icon name="refresh" size={16} /> {t('common.refresh')}</button>
  {/snippet}
  <div class="grid">
    {#each services.items as s (s.id)}
      {@const o = services.overview[s.id]}
      <a href="/{s.type}/{s.id}" class="card service" style="color:inherit;text-decoration:none">
        <div class="card-body">
          <div class="row" style="margin-bottom:10px">
            <span class="icon-wrap"><Icon name={ICONS[s.type]} size={20} /></span>
            <div class="grow"><div style="font-weight:650">{s.label}</div><div class="xs faint">{s.type} · <span class="mono">{s.url.replace(/^https?:\/\//, '')}</span></div></div>
            <span class="badge {tone(o)}">{label(o)}</span>
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
          {#if o}<div class="xs faint" style="margin-top:10px">{t('overview.latency')} {fmt.ms(o.latencyMs)}{#if o.summary?.uptimeSec != null} · {t('overview.uptime')} {fmt.duration(o.summary.uptimeSec)}{/if}</div>{/if}
        </div>
      </a>
    {/each}
  </div>
</Page>

<style>
  .service:hover { border-color: var(--border-strong); }
  .icon-wrap { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
</style>
