<script>
  import Icon from './Icon.svelte';
  import { t } from '$lib/client/i18n.svelte.js';
  import { toasts } from '$lib/client/toast.svelte.js';
  /** @type {{ text: string, label?: string, small?: boolean }} */
  let { text, label, small = true } = $props();
  let done = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      done = true;
      setTimeout(() => { done = false; }, 1500);
    } catch {
      toasts.warn(text);
    }
  }
</script>

<button class="btn ghost {small ? 'sm' : ''} {label ? '' : 'icon'}" onclick={copy} aria-label={label ?? t('common.copy')} title={t('common.copy')}>
  <Icon name={done ? 'check' : 'copy'} size={14} />{#if label}<span>{done ? t('common.copied') : label}</span>{/if}
</button>
