<script>
  import Icon from './Icon.svelte';
  /** @type {{ icon?: string, title: string, desc?: string, children?: import('svelte').Snippet }} */
  let { icon = 'inbox', title, desc, children } = $props();
</script>

<div class="empty">
  <Icon name={icon} size={40} />
  <h3>{title}</h3>
  {#if desc}<p class="small">{desc}</p>{/if}
  {#if children}<div style="margin-top:14px">{@render children()}</div>{/if}
</div>
