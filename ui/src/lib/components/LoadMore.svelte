<script>
  import { t } from '../i18n.svelte.js';
  /** @type {{ cursor: string|null, busy: boolean, onmore: () => void }} */
  let { cursor, busy, onmore } = $props();
</script>

{#if cursor}
  <div style="text-align:center;padding:14px">
    <button class="btn" onclick={onmore} disabled={busy}>{busy ? t('common.loading') : t('common.loadMore')}</button>
  </div>
{/if}
