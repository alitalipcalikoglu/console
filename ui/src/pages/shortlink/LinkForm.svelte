<script>
  /** Create/edit dialog body shared by the list and detail pages. Emits a plain patch/create object. */
  import Dialog from '../../lib/components/Dialog.svelte';
  import { t } from '../../lib/i18n.svelte.js';
  /** @type {{ open: boolean, title: string, submitLabel: string, initial?: any, busy?: boolean, onsubmit: (body: any) => void, onclose: () => void }} */
  let { open, title, submitLabel, initial = null, busy = false, onsubmit, onclose } = $props();
  let url = $state('');
  let slug = $state('');
  let tags = $state('');
  let note = $state('');
  let expires = $state('');
  let maxClicks = $state('');
  let permanent = $state(false);
  let dateError = $state('');
  /** ISO → value for <input type="datetime-local"> in local time. @param {string|null} iso */
  const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (/** @type {number} */ n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  $effect(() => {
    if (!open) return;
    url = initial?.url ?? ''; slug = initial?.code ?? ''; tags = (initial?.tags ?? []).join(', '); note = initial?.note ?? '';
    expires = toLocal(initial?.expiresAt ?? null); maxClicks = initial?.maxClicks == null ? '' : String(initial.maxClicks); permanent = initial?.permanent ?? false; dateError = '';
  });
  function submit() {
    /** @type {Record<string, unknown>} */
    const body = { url: url.trim(), permanent, tags: tags.split(',').map((s) => s.trim()).filter(Boolean), note: note.trim() || null };
    if (expires) {
      const ts = new Date(expires).getTime();
      if (Number.isNaN(ts)) { dateError = t('sl.invalidDate'); return; }
      body.expiresAt = new Date(ts).toISOString();
    } else body.expiresAt = null;
    body.maxClicks = maxClicks.trim() ? Number(maxClicks) : null;
    if (!initial && slug.trim()) body.slug = slug.trim();
    onsubmit(body);
  }
</script>

<Dialog {open} {title} {onclose}>
  {#if !initial}<p class="small muted" style="margin-bottom:12px">{t('sl.createDesc')}</p>{/if}
  <form class="stack" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    <div class="field"><label for="lf-url">{t('sl.url')}</label><input id="lf-url" class="input" type="url" placeholder="https://" bind:value={url} required /></div>
    {#if !initial}<div class="field"><label for="lf-slug">{t('sl.slug')} <span class="faint">({t('common.optional')})</span></label><input id="lf-slug" class="input mono" bind:value={slug} pattern={'[A-Za-z0-9][A-Za-z0-9_-]{2,63}'} /><span class="hint">{t('sl.slugHint')}</span></div>{/if}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
      <div class="field"><label for="lf-exp">{t('sl.expiresAt')} <span class="faint">({t('common.optional')})</span></label><input id="lf-exp" class="input" type="datetime-local" bind:value={expires} aria-invalid={dateError ? 'true' : undefined} />{#if dateError}<span class="error">{dateError}</span>{/if}</div>
      <div class="field"><label for="lf-max">{t('sl.maxClicks')} <span class="faint">({t('common.optional')})</span></label><input id="lf-max" class="input" type="number" min="1" step="1" bind:value={maxClicks} /></div>
    </div>
    <div class="field"><label for="lf-tags">{t('sl.tags')} <span class="faint">({t('sl.tagsHint')})</span></label><input id="lf-tags" class="input" bind:value={tags} placeholder="poster, 2026" /></div>
    <div class="field"><label for="lf-note">{t('sl.note')} <span class="faint">({t('common.optional')})</span></label><input id="lf-note" class="input" bind:value={note} maxlength="500" /></div>
    <label class="row small" style="gap:10px;cursor:pointer"><input type="checkbox" bind:checked={permanent} /> <span>{t('sl.permanent')}<br><span class="faint xs">{t('sl.permanentHint')}</span></span></label>
    <button type="submit" class="sr-only">ok</button>
  </form>
  {#snippet footer()}
    <button class="btn" onclick={onclose} disabled={busy}>{t('common.cancel')}</button>
    <button class="btn primary" onclick={submit} disabled={busy || !url.trim()}>{submitLabel}</button>
  {/snippet}
</Dialog>
