<script>
  /**
   * Editor for a flag value of a given kind. Emits the parsed value through `onchange`; JSON
   * that does not parse keeps the last good value and shows the error.
   */
  import { t } from '$lib/client/i18n.svelte.js';
  /** @type {{ kind: 'boolean'|'string'|'number'|'json', value: unknown, onchange: (v: unknown) => void, id: string, disabled?: boolean }} */
  let { kind, value, onchange, id, disabled = false } = $props();
  let text = $state('');
  let error = $state('');
  $effect(() => { text = kind === 'json' ? JSON.stringify(value ?? null, null, 2) : String(value ?? ''); error = ''; });
  function commitJson() {
    try { onchange(JSON.parse(text)); error = ''; } catch { error = t('fl.invalidJson'); }
  }
</script>

{#if kind === 'boolean'}
  <select {id} class="select" {disabled} value={value ? 'true' : 'false'} onchange={(e) => onchange(/** @type {HTMLSelectElement} */ (e.currentTarget).value === 'true')}>
    <option value="true">true</option><option value="false">false</option>
  </select>
{:else if kind === 'number'}
  <input {id} class="input" type="number" step="any" {disabled} value={String(value ?? 0)} oninput={(e) => { const n = Number(/** @type {HTMLInputElement} */ (e.currentTarget).value); if (Number.isFinite(n)) onchange(n); }} />
{:else if kind === 'string'}
  <input {id} class="input" type="text" {disabled} value={String(value ?? '')} oninput={(e) => onchange(/** @type {HTMLInputElement} */ (e.currentTarget).value)} />
{:else}
  <textarea {id} class="textarea mono" rows="4" {disabled} bind:value={text} onblur={commitJson} aria-invalid={error ? 'true' : undefined}></textarea>
  {#if error}<span class="error">{error}</span>{/if}
{/if}
