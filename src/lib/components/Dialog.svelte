<script>
  /** Modal dialog. Closes on Escape and backdrop click; traps initial focus. */
  /** @type {{ open: boolean, title: string, onclose: () => void, children: import('svelte').Snippet, footer?: import('svelte').Snippet, wide?: boolean }} */
  let { open, title, onclose, children, footer, wide = false } = $props();
  /** @type {HTMLDivElement|undefined} */
  let box = $state();
  $effect(() => {
    if (!open || !box) return;
    const first = /** @type {HTMLElement|null} */ (box.querySelector('input, select, textarea, button:not([data-close])'));
    first?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  });
  /** @param {KeyboardEvent} e */
  function onkey(e) { if (e.key === 'Escape') onclose(); }
</script>

<svelte:window onkeydown={open ? onkey : undefined} />

{#if open}
  <div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" bind:this={box} style={wide ? 'width:min(760px,100%)' : ''}>
      <div class="dialog-head row">
        <h2 id="dlg-title" class="grow">{title}</h2>
        <button class="btn ghost icon sm" data-close onclick={onclose} aria-label="close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="dialog-body">{@render children()}</div>
      {#if footer}<div class="dialog-foot">{@render footer()}</div>{/if}
    </div>
  </div>
{/if}
