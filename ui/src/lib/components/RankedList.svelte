<script>
  /**
   * Label + number rows, largest first as given. A row is a link when it has `href`, a button
   * when it has `onclick`, plain text otherwise.
   * @typedef {{ id: string, label: string, sub?: string, value: string|number, href?: string, onclick?: () => void, mono?: boolean, tone?: 'danger'|'warn'|'' , active?: boolean }} RankedItem
   */
  /** @type {{ items: RankedItem[], empty?: string }} */
  let { items, empty = '–' } = $props();
</script>

{#if !items.length}
  <p class="small faint" style="margin:0">{empty}</p>
{:else}
  <ol class="ranked">
    {#each items as it (it.id)}
      <li>
        {#if it.href}<a class="truncate" href={it.href} aria-current={it.active ? 'true' : undefined}><span class="{it.mono ? 'mono' : ''} {it.tone ? `${it.tone}-text` : ''}">{it.label}</span>{#if it.sub}<span class="muted small"> · {it.sub}</span>{/if}</a>
        {:else if it.onclick}<button class="linkish truncate" onclick={it.onclick} aria-pressed={it.active}><span class="{it.mono ? 'mono' : ''} {it.tone ? `${it.tone}-text` : ''}">{it.label}</span>{#if it.sub}<span class="muted small"> · {it.sub}</span>{/if}</button>
        {:else}<span class="truncate"><span class="{it.mono ? 'mono' : ''} {it.tone ? `${it.tone}-text` : ''}">{it.label}</span>{#if it.sub}<span class="muted small"> · {it.sub}</span>{/if}</span>{/if}
        <span class="num">{it.value}</span>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .ranked { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: .9rem; }
  .ranked li { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ranked a { color: inherit; min-width: 0; }
  .ranked a[aria-current="true"], .linkish[aria-pressed="true"] { color: var(--accent); font-weight: 600; }
  .num { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 600; flex: none; }
  .linkish { background: none; border: 0; padding: 0; color: inherit; cursor: pointer; text-align: left; min-width: 0; font: inherit; }
  .linkish:hover, .ranked a:hover { text-decoration: underline; }
</style>
