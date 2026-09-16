<script>
  /** Registers title, description, back link and actions with the app bar, then renders the body. */
  import { page } from '../page.svelte.js';
  /** @type {{ title: string, desc?: string, back?: string, actions?: import('svelte').Snippet, children: import('svelte').Snippet }} */
  let { title, desc, back, actions, children } = $props();
  $effect(() => {
    page.set({ title, desc, back, actions });
    document.title = `${title} · Console`;
    return () => page.clear();
  });
</script>

{@render children()}
