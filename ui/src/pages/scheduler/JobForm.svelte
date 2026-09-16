<script>
  /**
   * Create or edit a job. Editing sends only the fields that changed: re-sending an unchanged
   * schedule would recompute the next firing (and reject a one-shot that already fired).
   */
  import Dialog from '../../lib/components/Dialog.svelte';
  import { api } from '../../lib/api.js';
  import { Fmt } from '../../lib/format.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  /** @type {{ open: boolean, sid: string, initial?: any, busy?: boolean, targetKeys: string[], timezones: string[], onsubmit: (body: any) => void, onclose: () => void }} */
  let { open, sid, initial = null, busy = false, targetKeys, timezones, onsubmit, onclose } = $props();
  const fmt = $derived(new Fmt(i18n.lang));
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let name = $state('');
  let description = $state('');
  let tags = $state('');
  let mode = $state(/** @type {'cron'|'at'} */ ('cron'));
  let cron = $state('0 9 * * *');
  let timezone = $state('UTC');
  let at = $state('');
  let url = $state('');
  let method = $state('POST');
  let headers = $state('');
  let body = $state('');
  let targetKey = $state('');
  let timeoutMs = $state(30000);
  let retryMax = $state(3);
  let backoffSec = $state(30);
  let enabled = $state(true);
  /** ISO → value for <input type="datetime-local"> in local time. @param {string|null|undefined} iso */
  const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (/** @type {number} */ n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  $effect(() => {
    if (!open) return;
    const j = initial;
    name = j?.name ?? ''; description = j?.description ?? ''; tags = (j?.tags ?? []).join(', '); enabled = j?.enabled ?? true;
    mode = j?.schedule?.at ? 'at' : 'cron'; cron = j?.schedule?.cron ?? '0 9 * * *';
    timezone = j?.schedule?.timezone ?? (timezones.includes(browserTz) ? browserTz : 'UTC'); at = toLocal(j?.schedule?.at);
    url = j?.target?.url ?? ''; method = j?.target?.method ?? 'POST';
    headers = Object.entries(j?.target?.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
    body = j?.target?.body === undefined ? '' : JSON.stringify(j.target.body, null, 2);
    targetKey = j?.targetKey ?? ''; timeoutMs = j?.timeoutMs ?? 30000; retryMax = j?.retry?.max ?? 3; backoffSec = j?.retry?.backoffSec ?? 30;
  });
  const hasBody = $derived(method !== 'GET' && method !== 'DELETE');
  /** Parsed headers or the offending line. */
  const parsedHeaders = $derived.by(() => {
    /** @type {Record<string, string>} */ const out = {};
    for (const raw of headers.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const i = line.indexOf(':');
      if (i <= 0) return { error: t('sc.headersInvalid', { line }) };
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return { value: out };
  });
  const parsedBody = $derived.by(() => {
    if (!hasBody || !body.trim()) return { value: undefined };
    try { return { value: JSON.parse(body) }; } catch { return { error: t('fl.invalidJson') }; }
  });
  const atError = $derived(mode === 'at' && at !== '' && Number.isNaN(Date.parse(at)) ? t('sl.invalidDate') : '');
  const valid = $derived(Boolean(url.trim()) && (initial || Boolean(name.trim())) && !parsedHeaders.error && !parsedBody.error && !atError && (mode === 'cron' ? Boolean(cron.trim()) : Boolean(at)));

  // Live preview of the next firings while the cron expression or timezone changes.
  /** @type {{ next: string[], error: string }} */ let preview = $state({ next: [], error: '' });
  let previewSeq = 0;
  $effect(() => {
    if (!open || mode !== 'cron') return;
    const expr = cron.trim();
    const tz = timezone;
    const seq = ++previewSeq;
    if (!expr) { preview = { next: [], error: '' }; return; }
    const timer = setTimeout(async () => {
      try {
        const r = /** @type {{ next: string[] }} */ (await api.get(`/services/${sid}/scheduler/preview?${new URLSearchParams({ cron: expr, timezone: tz, count: '3' })}`));
        if (seq === previewSeq) preview = { next: r.next, error: '' };
      } catch (e) {
        if (seq === previewSeq) preview = { next: [], error: e instanceof Error ? e.message : String(e) };
      }
    }, 400);
    return () => clearTimeout(timer);
  });

  function build() {
    const atIso = mode === 'at' ? (at === toLocal(initial?.schedule?.at) ? initial.schedule.at : new Date(at).toISOString()) : null;
    const schedule = mode === 'cron' ? { cron: cron.trim(), timezone } : { at: atIso };
    const target = { url: url.trim(), method, headers: parsedHeaders.value ?? {}, ...(parsedBody.value === undefined ? {} : { body: parsedBody.value }) };
    const full = { description: description.trim(), tags: tags.split(',').map((s) => s.trim()).filter(Boolean), enabled, schedule, target, targetKey: targetKey || null, timeoutMs: Number(timeoutMs), retry: { max: Number(retryMax), backoffSec: Number(backoffSec) } };
    if (!initial) return { name: name.trim(), ...full };
    const before = { description: initial.description, tags: initial.tags, enabled: initial.enabled, schedule: initial.schedule, target: initial.target, targetKey: initial.targetKey, timeoutMs: initial.timeoutMs, retry: initial.retry };
    /** @type {Record<string, unknown>} */ const patch = {};
    for (const k of /** @type {(keyof typeof full)[]} */ (Object.keys(full))) if (JSON.stringify(full[k]) !== JSON.stringify(before[k])) patch[k] = full[k];
    return patch;
  }
  function submit() { if (valid) onsubmit(build()); }
</script>

<Dialog {open} title={initial ? t('sc.edit') : t('sc.create')} {onclose} wide>
  <form class="stack" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    {#if !initial}
      <div class="field"><label for="jf-name">{t('sc.name')}</label><input id="jf-name" class="input mono" bind:value={name} required pattern={'[a-z0-9]+([.\\-_][a-z0-9]+)*'} placeholder="nightly.report" /><span class="hint">{t('sc.nameHint')}</span></div>
    {/if}
    <div class="field"><label for="jf-desc">{t('fl.description')}</label><input id="jf-desc" class="input" bind:value={description} maxlength="500" /></div>

    <div class="subhead">{t('sc.schedule')}</div>
    <div class="seg" role="tablist"><button type="button" aria-pressed={mode === 'cron'} onclick={() => { mode = 'cron'; }}>{t('sc.recurring')}</button><button type="button" aria-pressed={mode === 'at'} onclick={() => { mode = 'at'; }}>{t('sc.oneShot')}</button></div>
    {#if mode === 'cron'}
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        <div class="field"><label for="jf-cron">{t('sc.cron')}</label><input id="jf-cron" class="input mono" bind:value={cron} required placeholder="0 9 * * mon-fri" aria-invalid={preview.error ? 'true' : undefined} /><span class="hint">{t('sc.cronHint')}</span></div>
        <div class="field"><label for="jf-tz">{t('sc.timezone')}</label><select id="jf-tz" class="select" bind:value={timezone}>{#each timezones as z (z)}<option value={z}>{z}</option>{/each}</select></div>
      </div>
      <div class="field"><span class="small" style="font-weight:550;color:var(--text-2)">{t('sc.preview')}</span>
        {#if preview.error}<span class="error">{preview.error}</span>
        {:else if preview.next.length}<span class="small mono">{preview.next.map((x) => fmt.dateTime(x)).join(' · ')}</span>
        {:else}<span class="hint">–</span>{/if}</div>
    {:else}
      <div class="field"><label for="jf-at">{t('sc.at')}</label><input id="jf-at" class="input" type="datetime-local" bind:value={at} required aria-invalid={atError ? 'true' : undefined} />{#if atError}<span class="error">{atError}</span>{:else}<span class="hint">{t('sc.atHint')}</span>{/if}</div>
    {/if}

    <div class="subhead">{t('sc.target')}</div>
    <div class="field"><label for="jf-url">{t('sc.url')}</label><input id="jf-url" class="input mono" type="url" bind:value={url} required placeholder="https://api.example/reports/daily" /></div>
    <div class="field"><span class="small" style="font-weight:550;color:var(--text-2)">{t('sc.method')}</span><div class="seg">{#each METHODS as m (m)}<button type="button" aria-pressed={method === m} onclick={() => { method = m; }}>{m}</button>{/each}</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
      <div class="field"><label for="jf-headers">{t('sc.headers')} <span class="faint">({t('common.optional')})</span></label><textarea id="jf-headers" class="textarea mono" rows="3" bind:value={headers} placeholder="X-Tenant: shop-1" aria-invalid={parsedHeaders.error ? 'true' : undefined}></textarea>{#if parsedHeaders.error}<span class="error">{parsedHeaders.error}</span>{:else}<span class="hint">{t('sc.headersHint')}</span>{/if}</div>
      <div class="field"><label for="jf-body">{t('sc.body')} <span class="faint">({t('common.optional')})</span></label><textarea id="jf-body" class="textarea mono" rows="3" bind:value={body} disabled={!hasBody} placeholder={'{ "full": true }'} aria-invalid={parsedBody.error ? 'true' : undefined}></textarea>{#if parsedBody.error}<span class="error">{parsedBody.error}</span>{:else if !hasBody}<span class="hint">{t('sc.bodyHint')}</span>{/if}</div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
      <div class="field"><label for="jf-key">{t('sc.targetKey')}</label><select id="jf-key" class="select" bind:value={targetKey}><option value="">{t('sc.noTargetKey')}</option>{#each targetKeys as k (k)}<option value={k}>{k}</option>{/each}</select><span class="hint">{t('sc.targetKeyHint')}</span></div>
      <div class="field"><label for="jf-timeout">{t('sc.timeout')}</label><input id="jf-timeout" class="input" type="number" min="1000" step="1000" bind:value={timeoutMs} /></div>
      <div class="field"><label for="jf-retry">{t('sc.retryMax')}</label><input id="jf-retry" class="input" type="number" min="0" max="100" bind:value={retryMax} /></div>
      <div class="field"><label for="jf-backoff">{t('sc.backoff')}</label><input id="jf-backoff" class="input" type="number" min="1" bind:value={backoffSec} /><span class="hint">{t('sc.retryHint')}</span></div>
    </div>
    <div class="field"><label for="jf-tags">{t('sl.tags')} <span class="faint">({t('sl.tagsHint')})</span></label><input id="jf-tags" class="input" bind:value={tags} placeholder="reports, nightly" /></div>
    {#if !initial}<label class="checkbox small"><input type="checkbox" bind:checked={enabled} /> {t('sc.startEnabled')}</label>{/if}
    <button type="submit" class="sr-only">ok</button>
  </form>
  {#snippet footer()}
    <button class="btn" onclick={onclose} disabled={busy}>{t('common.cancel')}</button>
    <button class="btn primary" onclick={submit} disabled={busy || !valid}>{initial ? t('common.save') : t('sc.create')}</button>
  {/snippet}
</Dialog>
