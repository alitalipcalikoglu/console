<script>
  /** Failed-load state, same layout as Empty. `boxed` adds a card frame for use outside a panel. */
  import Icon from './Icon.svelte';
  import { t } from '$lib/client/i18n.svelte.js';
  /** @type {{ error: unknown, onretry?: () => void, boxed?: boolean }} */
  let { error, onretry, boxed = false } = $props();
  const e = $derived(/** @type {{ message?: string, code?: string, service?: string }} */ (error ?? {}));
</script>

{#snippet body()}
  <div class="state danger" role="alert">
    <Icon name="alert" size={40} />
    <h3>{t('common.error')}</h3>
    {#if e.message}<p class="small">{e.message}</p>{/if}
    {#if e.service || e.code}<p class="xs faint mono">{#if e.service}{e.service}{#if e.code} · {/if}{/if}{e.code ?? ''}</p>{/if}
    {#if onretry}<div class="state-actions"><button class="btn" onclick={onretry}><Icon name="refresh" size={14} /> {t('common.retry')}</button></div>{/if}
  </div>
{/snippet}

{#if boxed}<div class="card">{@render body()}</div>{:else}{@render body()}{/if}
