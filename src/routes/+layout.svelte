<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';
  import Toasts from '$lib/components/Toasts.svelte';
  import { i18n } from '$lib/client/i18n.svelte.js';
  import { pwa } from '$lib/client/pwa.svelte.js';
  import { provideSession } from '$lib/client/session.svelte.js';
  import { theme } from '$lib/client/theme.svelte.js';
  import '../app.css';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
  const session = provideSession(() => data.auth);

  $effect(() => session.sync(data.auth));
  onMount(() => {
    i18n.init();
    theme.init();
    pwa.init();
  });
</script>

<svelte:head>
  <meta name="description" content="Administration console for ATC-WEB services" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/icons/icon.svg" />
</svelte:head>

{@render children()}
<Toasts />
