<script>
  /** Page header with title, description and an optional actions area. */
  /** @type {{ title: string, desc?: string, back?: string, actions?: import('svelte').Snippet, children: import('svelte').Snippet }} */
  let { title, desc, back, actions, children } = $props();
  import Icon from './Icon.svelte';
  $effect(() => { document.title = `${title} · Console`; });
</script>

<div class="page-head">
  <div class="grow">
    {#if back}
      <a href={back} class="row small muted" style="margin-bottom:6px;display:inline-flex"><Icon name="back" size={14} /> {back === '/' ? 'Console' : ''}<span class="sr-only">back</span></a>
    {/if}
    <h1>{title}</h1>
    {#if desc}<p class="desc">{desc}</p>{/if}
  </div>
  {#if actions}<div class="row wrap">{@render actions()}</div>{/if}
</div>
{@render children()}
