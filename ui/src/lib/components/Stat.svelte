<script>
  /** @type {{ label: string, value: string|number|null|undefined, sub?: string, tone?: 'ok'|'warn'|'danger'|'' }} */
  let { label, value, sub, tone = '' } = $props();
</script>

<div class="card stat">
  <div class="label">{label}</div>
  <div class="value {tone && value != null && value !== '–' ? `${tone}-text` : ''}">{value ?? '–'}</div>
  {#if sub}<div class="sub">{sub}</div>{/if}
</div>
