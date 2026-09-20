<script lang="ts">
  import type { Snippet } from 'svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <meta name="description" content="ATC-WEB Console migration foundation" />
</svelte:head>

{@render children()}
