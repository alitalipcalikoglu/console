<script>
  /** Registers title, description, back link and actions with the app bar, then renders the body. */
  import { page } from '$lib/client/page.svelte.js';
  /** @type {{ title: string, desc?: string, back?: string, actions?: import('svelte').Snippet, children: import('svelte').Snippet }} */
  let { title, desc, back, actions, children } = $props();
  $effect(() => {
    page.set({ title, desc, back, actions });
    return () => page.clear();
  });
</script>

<svelte:head><title>{title} · Console</title></svelte:head>

{@render children()}
