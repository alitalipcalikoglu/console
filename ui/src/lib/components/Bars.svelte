<script>
  /**
   * Tiny bar chart: one bar per item, heights relative to the largest value (or `max`).
   * @typedef {{ value: number|undefined, title?: string, tone?: ''|'warn'|'danger' }} Bar
   */
  /** @type {{ items: Bar[], height?: number, max?: number, barWidth?: number, label?: string }} */
  let { items, height = 28, max, barWidth, label } = $props();
  const top = $derived(Math.max(1, max ?? Math.max(0, ...items.map((b) => b.value ?? 0))));
</script>

<div class="bars" style="height:{height}px" role="img" aria-label={label} title={label}>
  {#each items as b, i (i)}
    <span class="bar {b.tone ?? ''}" style="height:{b.value === undefined ? 2 : Math.max(3, Math.round((b.value / top) * height))}px;{barWidth ? `width:${barWidth}px;flex:none` : ''}" title={b.title ?? ''}></span>
  {/each}
</div>

<style>
  .bars { display: flex; align-items: flex-end; gap: 3px; }
  .bar { flex: 1; min-width: 3px; max-width: 40px; background: var(--accent); border-radius: 2px 2px 0 0; opacity: .85; }
  .bar.warn { background: var(--warn); } .bar.danger { background: var(--danger); }
</style>
