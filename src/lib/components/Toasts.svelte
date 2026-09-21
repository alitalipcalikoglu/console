<script>
  import { toasts } from '$lib/client/toast.svelte.js';
  import Icon from './Icon.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.items as toast (toast.id)}
    <div class="toast {toast.kind}" role="status">
      <Icon name={toast.kind === 'ok' ? 'check' : toast.kind === 'danger' ? 'alert' : 'bell'} size={16} />
      <span class="grow">{toast.text}</span>
      {#if toast.action}<button class="btn sm primary" onclick={() => { toast.action?.run(); toasts.dismiss(toast.id); }}>{toast.action.label}</button>{/if}
      <button class="btn ghost icon sm" onclick={() => toasts.dismiss(toast.id)} aria-label="dismiss"><Icon name="x" size={14} /></button>
    </div>
  {/each}
</div>
