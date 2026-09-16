<script>
  /** Colour-codes well-known status words from the services. */
  /** @type {{ status: string|null|undefined, label?: string }} */
  let { status, label } = $props();
  /** @type {Record<string, string>} */
  const TONE = { sent: 'ok', active: 'ok', success: 'ok', public: 'info', queued: 'info', processing: 'warn', private: '', failed: 'danger', failure: 'danger', denied: 'warn', disabled: 'danger', expired: 'warn', exhausted: 'warn', locked: 'danger', admin: 'info', viewer: '', pending: 'info', running: 'warn', retrying: 'warn', succeeded: 'ok', skipped: '', cancelled: '' };
</script>

<span class="badge {TONE[status ?? ''] ?? ''}">{label ?? status ?? '–'}</span>
