<script>
  /**
   * Per-service auto-refresh control in the app bar. The setting lives in services.json (shared by
   * every admin); the timer belongs to the shared ServicePoller, so page and overview never run
   * two timers for one service.
   */
  import Icon from './Icon.svelte';
  import { services } from '../services.svelte.js';
  import { session } from '../session.svelte.js';
  import { poller } from '../poller.svelte.js';
  import { t } from '../i18n.svelte.js';
  import { toasts } from '../toast.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const PRESETS = [0, 15, 30, 60, 300];
  const svc = $derived(services.get(sid));
  const value = $derived(svc?.polling.enabled ? svc.polling.intervalSec : 0);
  // A value set by hand in services.json (e.g. 5 s) must stay selectable.
  const OPTIONS = $derived([...new Set([...PRESETS, value])].sort((a, b) => a - b));
  const p = $derived(poller.for(sid));
  let saving = $state(false);

  /** @param {number} sec */
  function label(sec) {
    if (sec === 0) return t('poll.off');
    return sec < 60 ? `${sec} s` : `${sec / 60} min`;
  }
  /** @param {Event} e */
  async function change(e) {
    const sec = Number(/** @type {HTMLSelectElement} */ (e.currentTarget).value);
    saving = true;
    try {
      await services.updatePolling(sid, { enabled: sec > 0, intervalSec: sec > 0 ? sec : (svc?.polling.intervalSec ?? 30) });
      toasts.ok(t('poll.saved'));
    } catch (err) { toasts.error(err); } finally { saving = false; }
  }
</script>

<label class="poll" title={t('poll.hint')}>
  <span class="row xs muted">
    <Icon name="clock" size={14} /><span class="word">{t('poll.label')}</span>
    {#if p.running}<span class="mono {p.inFlight ? 'busy' : ''}" style="min-width:2.4em;text-align:right" title={p.inFlight ? t('poll.inFlight') : ''}>{p.inFlight ? '…' : `${p.countdown}s`}</span>{/if}
    {#if p.running && p.effectiveSec > value}<span class="badge warn plain" title={t('poll.slowedHint', { avg: (p.stats.avgMs / 1000).toFixed(1) })}>{t('poll.slowed', { s: p.effectiveSec })}</span>{/if}
  </span>
  <select class="select sm" value={String(value)} onchange={change} disabled={saving || !session.isAdmin} aria-label={t('poll.label')} title={session.isAdmin ? t('poll.label') : t('poll.viewer')}>
    {#each OPTIONS as sec (sec)}<option value={String(sec)}>{label(sec)}</option>{/each}
  </select>
</label>

<style>
  .poll { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex: none; }
  .select.sm { min-height: 32px; padding: 4px 28px 4px 10px; font-size: .85rem; width: auto; }
  .busy { color: var(--accent); }
  @media (max-width: 900px) { .word { display: none; } .poll :global(.badge) { display: none; } }
</style>
