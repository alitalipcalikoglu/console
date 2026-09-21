<script>
  /** Create or edit a policy. Editing sends only the fields that changed. */
  import Dialog from '$lib/components/Dialog.svelte';
  import LimitsEditor from '$lib/components/LimitsEditor.svelte';
  import { LimitRows } from '$lib/client/limits.js';
  import { t } from '$lib/client/i18n.svelte.js';
  /** @type {{ open: boolean, initial?: any, busy?: boolean, onsubmit: (body: any) => void, onclose: () => void }} */
  let { open, initial = null, busy = false, onsubmit, onclose } = $props();
  let name = $state('');
  let description = $state('');
  /** @type {import('$lib/client/limits.js').LimitRow[]} */ let rows = $state([LimitRows.blank()]);
  $effect(() => {
    if (!open) return;
    name = initial?.name ?? ''; description = initial?.description ?? '';
    rows = initial?.limits?.length ? LimitRows.fromLimits(initial.limits) : [LimitRows.blank()];
  });
  const valid = $derived(Boolean(initial || /^[a-z0-9]+([.\-_][a-z0-9]+)*$/.test(name.trim())) && LimitRows.valid(rows));
  function build() {
    const full = { description: description.trim(), limits: LimitRows.toLimits(rows) };
    if (!initial) return { name: name.trim(), ...full };
    /** @type {Record<string, unknown>} */ const patch = {};
    for (const k of /** @type {(keyof typeof full)[]} */ (Object.keys(full))) if (JSON.stringify(full[k]) !== JSON.stringify(initial[k])) patch[k] = full[k];
    return patch;
  }
  function submit() { if (valid) onsubmit(build()); }
</script>

<Dialog {open} title={initial ? t('rl.edit') : t('rl.create')} {onclose}>
  <form class="stack" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    {#if !initial}<div class="field"><label for="pf-name">{t('rl.name')}</label><input id="pf-name" class="input mono" bind:value={name} required pattern={'[a-z0-9]+([.\\-_][a-z0-9]+)*'} placeholder="api" /><span class="hint">{t('rl.nameHint')}</span></div>{/if}
    <div class="field"><label for="pf-desc">{t('rl.description')}</label><input id="pf-desc" class="input" bind:value={description} maxlength="500" /></div>
    <div class="field"><span class="small" style="font-weight:550;color:var(--text-2)">{t('rl.limits')}</span><LimitsEditor bind:rows /><span class="hint">{t('rl.limitsHint')}</span></div>
    <button type="submit" class="sr-only">ok</button>
  </form>
  {#snippet footer()}
    <button class="btn" onclick={onclose} disabled={busy}>{t('common.cancel')}</button>
    <button class="btn primary" onclick={submit} disabled={busy || !valid}>{initial ? t('common.save') : t('rl.create')}</button>
  {/snippet}
</Dialog>
