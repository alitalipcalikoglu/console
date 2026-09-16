<script>
  import { Fmt } from '../format.js';
  import { i18n } from '../i18n.svelte.js';
  /** @type {{ value: string|number|null|undefined, mode?: 'relative'|'absolute' }} */
  let { value, mode = 'relative' } = $props();
  const fmt = $derived(new Fmt(i18n.lang));
  let now = $state(Date.now());
  $effect(() => { value; now = Date.now(); });
  $effect(() => { const id = setInterval(() => { now = Date.now(); }, 30_000); return () => clearInterval(id); });
</script>

{#if value}
  <time datetime={new Date(value).toISOString()} title={fmt.dateTime(value)}>{mode === 'relative' ? fmt.relative(value, now) : fmt.dateTime(value)}</time>
{:else}
  <span class="faint">–</span>
{/if}
