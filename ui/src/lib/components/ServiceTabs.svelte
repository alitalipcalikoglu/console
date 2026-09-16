<script>
  /** Switch between several instances of the same service type (e.g. media-eu / media-us). */
  import { services } from '../services.svelte.js';
  /** @type {{ type: 'notify'|'auth'|'media'|'gateway'|'audit'|'shortlink', sid: string }} */
  let { type, sid } = $props();
  const list = $derived(services.ofType(type));
</script>

{#if list.length > 1}
  <div class="seg" role="tablist" style="margin-bottom:16px">
    {#each list as s (s.id)}
      <a href="/{type}/{s.id}" role="tab" aria-selected={s.id === sid} class="btn ghost sm" style={s.id === sid ? 'background:var(--surface);box-shadow:var(--shadow)' : ''}>{s.label}</a>
    {/each}
  </div>
{/if}
