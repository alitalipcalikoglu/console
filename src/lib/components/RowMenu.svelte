<script>
  /**
   * Compact per-row actions: one "⋯" button opening a small menu. Closes on outside click,
   * Escape, or after choosing an item. Items may be marked `danger` or `disabled`.
   */
  import Icon from './Icon.svelte';
  /** @type {{ items: { label: string, icon?: string, danger?: boolean, disabled?: boolean, run: () => void }[], label?: string }} */
  let { items, label = 'actions' } = $props();
  let open = $state(false);
  /** @type {HTMLDivElement|undefined} */
  let root = $state();
  /** @type {HTMLButtonElement|undefined} */
  let trigger = $state();
  // Fixed positioning escapes overflow-clipping table wrappers; recomputed on open.
  let pos = $state({ top: 0, right: 0 });
  function toggle() {
    if (!open && trigger) {
      const r = trigger.getBoundingClientRect();
      pos = { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) };
    }
    open = !open;
  }
  $effect(() => {
    if (!open) return;
    /** @param {MouseEvent} e */
    const away = (e) => { if (root && !root.contains(/** @type {Node} */ (e.target))) open = false; };
    /** @param {KeyboardEvent} e */
    const key = (e) => { if (e.key === 'Escape') open = false; };
    const close = () => { open = false; };
    document.addEventListener('click', away, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('click', away, true); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  });
</script>

<div class="menu" bind:this={root}>
  <button class="btn ghost icon sm" bind:this={trigger} aria-haspopup="menu" aria-expanded={open} aria-label={label} onclick={toggle}><Icon name="more" size={16} /></button>
  {#if open}
    <div class="pop" role="menu" style="top:{pos.top}px;right:{pos.right}px">
      {#each items as item (item.label)}
        <button role="menuitem" class="item {item.danger ? 'danger' : ''}" disabled={item.disabled} onclick={() => { open = false; item.run(); }}>
          {#if item.icon}<Icon name={item.icon} size={14} />{/if}<span>{item.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu { position: relative; display: inline-block; }
  .pop { position: fixed; z-index: 40; min-width: 200px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-lg); animation: pop .12s; }
  @keyframes pop { from { transform: translateY(-4px); opacity: 0; } }
  .item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: 0; background: transparent; border-radius: var(--radius-sm); text-align: left; cursor: pointer; font-size: .9rem; color: var(--text); }
  .item:hover, .item:focus-visible { background: var(--surface-2); }
  .item.danger { color: var(--danger); }
  .item:disabled { opacity: .5; cursor: not-allowed; }
</style>
