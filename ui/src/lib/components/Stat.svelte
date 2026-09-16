<script>
  /** `tone` colours the value; `subTone` the small print, for a warning that concerns part of the number (e.g. disabled items). */
  /** @type {{ label: string, value: string|number|null|undefined, sub?: string, tone?: 'ok'|'warn'|'danger'|'', subTone?: 'ok'|'warn'|'danger'|'' }} */
  let { label, value, sub, tone = '', subTone = '' } = $props();
</script>

<div class="card stat">
  <div class="label">{label}</div>
  <div class="value {tone && value != null && value !== '–' ? `${tone}-text` : ''}">{value ?? '–'}</div>
  {#if sub}<div class="sub {subTone ? `${subTone}-text` : ''}">{sub}</div>{/if}
</div>
