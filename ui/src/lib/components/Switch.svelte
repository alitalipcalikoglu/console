<script>
  /** On/off control with an accessible label; `busy` blocks clicks while a request runs. */
  /** @type {{ checked: boolean, onchange: (next: boolean) => void, label: string, disabled?: boolean, busy?: boolean, size?: 'sm'|'md' }} */
  let { checked, onchange, label, disabled = false, busy = false, size = 'md' } = $props();
</script>

<button type="button" class="switch {size}" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled || busy} onclick={() => onchange(!checked)}>
  <span class="knob"></span>
</button>

<style>
  .switch { position: relative; width: 40px; height: 22px; border-radius: 999px; border: 0; padding: 0; background: var(--border-strong); cursor: pointer; transition: background .15s; flex: none; }
  .switch.sm { width: 32px; height: 18px; }
  .switch[aria-checked="true"] { background: var(--ok); }
  .switch:disabled { opacity: .55; cursor: not-allowed; }
  .switch:focus-visible { box-shadow: var(--focus); outline: none; }
  .knob { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
  .switch.sm .knob { width: 14px; height: 14px; }
  .switch[aria-checked="true"] .knob { transform: translateX(18px); }
  .switch.sm[aria-checked="true"] .knob { transform: translateX(14px); }
</style>
