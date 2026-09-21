<script>
  /** Create or edit a place collection. Editing sends only the description when it changed. */
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/client/i18n.svelte.js';
  /** @type {{ open: boolean, initial?: any, busy?: boolean, onsubmit: (body: any) => void, onclose: () => void }} */
  let { open, initial = null, busy = false, onsubmit, onclose } = $props();
  let name = $state('');
  let description = $state('');
  $effect(() => { if (open) { name = initial?.name ?? ''; description = initial?.description ?? ''; } });
  const valid = $derived(Boolean(initial || /^[a-z0-9]+([.\-_][a-z0-9]+)*$/.test(name.trim())));
  function submit() {
    if (!valid) return;
    if (!initial) return onsubmit({ name: name.trim(), description: description.trim() });
    onsubmit(description.trim() === initial.description ? {} : { description: description.trim() });
  }
</script>

<Dialog {open} title={initial ? t('ge.editCollection') : t('ge.createCollection')} {onclose}>
  <form class="stack" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    {#if !initial}<div class="field"><label for="cf-name">{t('ge.name')}</label><input id="cf-name" class="input mono" bind:value={name} required pattern={'[a-z0-9]+([.\\-_][a-z0-9]+)*'} placeholder="branches" /><span class="hint">{t('ge.nameHint')}</span></div>{/if}
    <div class="field"><label for="cf-desc">{t('ge.description')}</label><input id="cf-desc" class="input" bind:value={description} maxlength="500" /></div>
    <button type="submit" class="sr-only">ok</button>
  </form>
  {#snippet footer()}
    <button class="btn" onclick={onclose} disabled={busy}>{t('common.cancel')}</button>
    <button class="btn primary" onclick={submit} disabled={busy || !valid}>{initial ? t('common.save') : t('ge.createCollection')}</button>
  {/snippet}
</Dialog>
