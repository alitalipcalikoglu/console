<script>
  /** @type {{ rows?: number, height?: number }} */
  let { rows = 4, height = 40 } = $props();
</script>

<div class="stack" aria-busy="true" aria-live="polite">
  {#each Array(rows) as _, i (i)}
    <div class="skeleton" style="height:{height}px;width:{100 - (i % 3) * 7}%"></div>
  {/each}
</div>
