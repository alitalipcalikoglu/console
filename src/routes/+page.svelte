<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';

  let { data }: { data: PageData } = $props();
  let hydrationCount = $state(0);
  let hydrated = $state(false);

  onMount(() => { hydrated = true; });
</script>

<svelte:head>
  <title>Console migration foundation</title>
</svelte:head>

<main class="foundation" data-m1-foundation>
  <p>{data.stage} · {data.runtime}</p>
  <h1>Console migration foundation</h1>
  <p>This neutral route proves filesystem routing and {data.renderer}. The production Console remains on the legacy runtime during M1.</p>
  <p data-hydration-status data-hydrated={hydrated}>{hydrated ? 'hydrated' : 'awaiting hydration'}</p>
  <button type="button" data-hydration-proof onclick={() => hydrationCount += 1}>
    Hydration proof: {hydrationCount}
  </button>
</main>
