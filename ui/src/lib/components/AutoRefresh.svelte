<script>
  /**
   * Per-service auto-refresh control. The choice is a service setting stored in services.json
   * (shared by every admin); the timer runs only while this page is mounted and the tab is
   * visible, so background traffic is exactly what the admin asked for.
   */
  import Icon from './Icon.svelte';
  import { services } from '../services.svelte.js';
  import { session } from '../session.svelte.js';
  import { t } from '../i18n.svelte.js';
  import { toasts } from '../toast.svelte.js';
  import { visibility } from '../visibility.svelte.js';
  /** @type {{ sid: string, ontick: () => void }} */
  let { sid, ontick } = $props();
  const OPTIONS = [0, 15, 30, 60, 300];
  const svc = $derived(services.get(sid));
  const value = $derived(svc?.polling.enabled ? svc.polling.intervalSec : 0);
  let saving = $state(false);
  const visible = $derived(visibility.visible);
  let countdown = $state(0);

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
  $effect(() => {
    if (!value || !visible) { countdown = 0; return; }
    countdown = value;
    const id = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) { countdown = value; ontick(); }
    }, 1000);
    return () => clearInterval(id);
  });
</script>

<label class="poll" title={t('poll.hint')}>
  <span class="row xs muted"><Icon name="clock" size={14} /><span class="word">{t('poll.label')}</span>{#if value && visible}<span class="mono" style="min-width:2.4em;text-align:right">{countdown}s</span>{/if}</span>
  <select class="select sm" value={String(value)} onchange={change} disabled={saving || !session.isAdmin} aria-label={t('poll.label')} title={session.isAdmin ? t('poll.label') : t('poll.viewer')}>
    {#each OPTIONS as sec (sec)}<option value={String(sec)}>{label(sec)}</option>{/each}
  </select>
</label>

<style>
  .poll { display: inline-flex; align-items: center; gap: 6px; }
  .select.sm { min-height: 32px; padding: 4px 28px 4px 10px; font-size: .85rem; width: auto; }
  @media (max-width: 900px) { .word { display: none; } }
</style>
