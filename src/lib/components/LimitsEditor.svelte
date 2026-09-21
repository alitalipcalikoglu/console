<script>
  /**
   * Rows of "limit per n unit" for a ratelimit policy or override. `rows` is bound; the parent
   * converts with LimitRows. Windows must be distinct; the editor flags duplicates and bad numbers.
   */
  import Icon from './Icon.svelte';
  import { LimitRows } from '$lib/client/limits.js';
  import { t } from '$lib/client/i18n.svelte.js';
  /** @type {{ rows: import('../limits.js').LimitRow[], max?: number, disabled?: boolean }} */
  let { rows = $bindable(), max = 5, disabled = false } = $props();
  const windows = $derived(rows.map((r) => Number(r.n) * LimitRows.UNIT_SEC[r.unit]));
  /** @param {number} i */
  const dup = (i) => windows.some((w, j) => j !== i && w === windows[i]);
  /** @param {number} i */
  const bad = (i) => !Number.isInteger(Number(rows[i].n)) || Number(rows[i].n) < 1 || !Number.isInteger(Number(rows[i].limit)) || Number(rows[i].limit) < 0;
</script>

<div class="stack" style="gap:8px">
  {#each rows as r, i (i)}
    <div class="limit-row">
      <input class="input" type="number" min="0" step="1" bind:value={r.limit} aria-label={t('rl.limitUnits')} {disabled} />
      <span class="small faint">{t('rl.per')}</span>
      <input class="input" type="number" min="1" step="1" bind:value={r.n} aria-label={t('rl.windowLength')} {disabled} />
      <select class="select" bind:value={r.unit} aria-label={t('rl.windowUnit')} {disabled}>{#each LimitRows.UNITS as u (u)}<option value={u}>{t(`rl.unit.${u}`)}</option>{/each}</select>
      <button type="button" class="btn ghost icon sm" onclick={() => { rows = rows.filter((_, j) => j !== i); }} disabled={disabled || rows.length === 1} aria-label={t('rl.removeWindow')} title={t('rl.removeWindow')}><Icon name="x" size={14} /></button>
      {#if dup(i)}<span class="error" style="grid-column:1/-1">{t('rl.dupWindow')}</span>{:else if bad(i)}<span class="error" style="grid-column:1/-1">{t('rl.badRow')}</span>{/if}
    </div>
  {/each}
  {#if rows.length < max}<button type="button" class="btn sm" style="align-self:flex-start" onclick={() => { rows = [...rows, LimitRows.blank()]; }} {disabled}><Icon name="plus" size={14} /> {t('rl.addWindow')}</button>{/if}
</div>

<style>
  .limit-row { display: grid; grid-template-columns: minmax(0, 1.4fr) auto minmax(0, 1fr) minmax(0, 1fr) auto; gap: 6px; align-items: center; }
  .limit-row .error { font-size: .8rem; color: var(--danger); }
</style>
