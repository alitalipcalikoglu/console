<script>
  import Icon from './Icon.svelte';
  import { t } from '../i18n.svelte.js';
  /** @type {{ error: unknown, onretry?: () => void }} */
  let { error, onretry } = $props();
  const e = $derived(/** @type {{ message?: string, code?: string, service?: string }} */ (error ?? {}));
</script>

<div class="card" style="border-color: color-mix(in srgb, var(--danger) 40%, var(--border))">
  <div class="card-body row" style="align-items:flex-start">
    <span class="danger-text"><Icon name="alert" /></span>
    <div class="grow">
      <strong>{t('common.error')}</strong>
      <p class="small muted">{e.message ?? ''}{#if e.service} <span class="badge plain">{e.service}</span>{/if}{#if e.code} <code class="xs">{e.code}</code>{/if}</p>
    </div>
    {#if onretry}<button class="btn sm" onclick={onretry}><Icon name="refresh" size={14} /> {t('common.retry')}</button>{/if}
  </div>
</div>
