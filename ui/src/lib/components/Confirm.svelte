<script>
  /** Confirmation for consequential actions; destructive ones can demand a typed word. */
  import Dialog from './Dialog.svelte';
  import { t } from '../i18n.svelte.js';
  /** @type {{ open: boolean, title: string, message: string, confirmLabel?: string, danger?: boolean, typeWord?: string, busy?: boolean, onconfirm: () => void, oncancel: () => void }} */
  let { open, title, message, confirmLabel, danger = false, typeWord, busy = false, onconfirm, oncancel } = $props();
  let typed = $state('');
  $effect(() => { if (open) typed = ''; });
  const ready = $derived(!typeWord || typed.trim() === typeWord);
</script>

<Dialog {open} {title} onclose={oncancel}>
  <p>{message}</p>
  {#if danger}<p class="small danger-text" style="margin-top:8px">{t('confirm.irreversible')}</p>{/if}
  {#if typeWord}
    <div class="field" style="margin-top:12px">
      <label for="confirm-word">{t('common.typeToConfirm', { word: typeWord })}</label>
      <input id="confirm-word" class="input mono" bind:value={typed} autocomplete="off" />
    </div>
  {/if}
  {#snippet footer()}
    <button class="btn" onclick={oncancel} disabled={busy}>{t('common.cancel')}</button>
    <button class="btn {danger ? 'danger solid' : 'primary'}" onclick={onconfirm} disabled={!ready || busy}>{confirmLabel ?? t('common.confirm')}</button>
  {/snippet}
</Dialog>
