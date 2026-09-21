<script>
  /**
   * Card with a header row: title on the left, optional controls on the right, body below.
   * `flush` removes body padding for tables. `head` replaces the default title row entirely.
   */
  /** @type {{ title?: string, flush?: boolean, bodyClass?: string, aside?: import('svelte').Snippet, head?: import('svelte').Snippet, children: import('svelte').Snippet }} */
  let { title = '', flush = false, bodyClass = '', aside, head, children } = $props();
</script>

<div class="card {flush ? 'flush' : ''}">
  <div class="card-head">
    {#if head}{@render head()}{:else}<h2 class="grow" style="min-width:max-content">{title}</h2>{#if aside}{@render aside()}{/if}{/if}
  </div>
  <div class="card-body {bodyClass}">{@render children()}</div>
</div>
