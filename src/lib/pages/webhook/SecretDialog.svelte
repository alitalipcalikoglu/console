<script>
  /** Shows a freshly generated signing secret once, with a copy button. */
  import Dialog from '$lib/components/Dialog.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import { Fmt } from '$lib/client/format.js';
  import { t, i18n } from '$lib/client/i18n.svelte.js';
  /** @type {{ secret: string|null, previousValidUntil?: string|null, onclose: () => void }} */
  let { secret, previousValidUntil = null, onclose } = $props();
  const fmt = $derived(new Fmt(i18n.lang));
</script>

<Dialog open={secret !== null} title={t('wh.secretTitle')} {onclose}>
  <p class="small muted" style="margin:0 0 12px">{t('wh.secretOnce')}</p>
  <div class="row" style="min-width:0"><code class="result grow" style="max-height:none">{secret}</code><CopyButton text={secret ?? ''} /></div>
  {#if previousValidUntil}<p class="small muted" style="margin:12px 0 0">{t('wh.secretPrev', { until: fmt.dateTime(previousValidUntil) })}</p>{/if}
  {#snippet footer()}
    <button class="btn primary" onclick={onclose}>{t('common.close')}</button>
  {/snippet}
</Dialog>
