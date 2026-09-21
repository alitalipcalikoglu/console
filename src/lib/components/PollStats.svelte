<script>
  /** Request timing of one service's poller: last ten durations, average, effective interval, queue state. */
  import Bars from './Bars.svelte';
  import Icon from './Icon.svelte';
  import { poller } from '$lib/client/poller.svelte.js';
  import { services } from '$lib/client/services.svelte.js';
  import { Fmt } from '$lib/client/format.js';
  import { t, i18n } from '$lib/client/i18n.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const fmt = $derived(new Fmt(i18n.lang));
  const p = $derived(poller.for(sid));
  const cfg = $derived(services.get(sid)?.polling);
  const max = $derived(Math.max(1, p.stats.maxMs));
</script>

{#if cfg?.enabled}
  <div class="card stats">
    <div class="row wrap" style="gap:14px">
      <span class="row small"><Icon name="clock" size={14} /><strong>{t('poll.label')}</strong></span>
      <span class="small muted">{t('poll.configured')}: <strong>{cfg.intervalSec} s</strong></span>
      <span class="small muted">{t('poll.effective')}: <strong class="{p.effectiveSec > cfg.intervalSec ? 'warn-text' : ''}">{p.effectiveSec} s</strong></span>
      <span class="small muted">{t('poll.avg')}: <strong>{fmt.ms(p.stats.avgMs)}</strong></span>
      <span class="small muted">{t('poll.last')}: <strong>{fmt.ms(p.stats.lastMs)}</strong></span>
      <span class="small muted">{t('poll.runs')}: <strong>{p.stats.runs}</strong></span>
      {#if p.stats.errors}<span class="small danger-text">{t('poll.errors')}: <strong>{p.stats.errors}</strong></span>{/if}
      {#if p.stats.coalesced}<span class="small muted">{t('poll.coalesced')}: <strong>{p.stats.coalesced}</strong></span>{/if}
      <span class="grow"></span>
      <span class="small muted">{#if p.inFlight}<span class="badge info">{t('poll.inFlight')}</span>{:else if p.running}{t('poll.next', { s: p.countdown })}{:else}{t('poll.paused')}{/if}</span>
    </div>
    <Bars items={Array.from({ length: 10 }, (_, i) => { const ms = p.stats.durations[p.stats.durations.length - 10 + i]; return { value: ms, title: ms === undefined ? '' : fmt.ms(ms), tone: ms !== undefined && ms > cfg.intervalSec * 1000 ? 'warn' : '' }; })} max={max} barWidth={10} label={t('poll.lastTen')} />
    {#if p.effectiveSec > cfg.intervalSec}<p class="xs warn-text" style="margin-top:6px">{t('poll.slowedHint', { avg: (p.stats.avgMs / 1000).toFixed(1) })}</p>{/if}
  </div>
{/if}

<style>
  .stats { padding: 10px 14px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
</style>
