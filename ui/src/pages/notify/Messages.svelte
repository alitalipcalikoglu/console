<script>
  import Page from '../../lib/components/Page.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Stat from '../../lib/components/Stat.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import Time from '../../lib/components/Time.svelte';
  import LoadMore from '../../lib/components/LoadMore.svelte';
  import ServiceTabs from '../../lib/components/ServiceTabs.svelte';
  import Dialog from '../../lib/components/Dialog.svelte';
  import AutoRefresh from '../../lib/components/AutoRefresh.svelte';
  import PollStats from '../../lib/components/PollStats.svelte';
  import { poller } from '../../lib/poller.svelte.js';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import { session } from '../../lib/session.svelte.js';
  import { services } from '../../lib/services.svelte.js';
  import { Fmt } from '../../lib/format.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  import { toasts } from '../../lib/toast.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => Promise.all([list.load(), summary.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  const STATUSES = ['', 'queued', 'processing', 'sent', 'failed'];
  let status = $state(router.query.get('status') ?? '');
  /** @type {any[]} */
  let items = $state([]);
  /** @type {string|null} */
  let cursor = $state(null);
  let more = $state(false);
  const summary = new Resource(() => api.get(`/services/${sid}/status`));
  const list = new Resource(async () => {
    const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/notify/messages?limit=50${status ? `&status=${status}` : ''}`));
    items = r.items; cursor = r.nextCursor; return r;
  });
  $effect(() => { status; router.setQuery({ status }); list.load(); });
  $effect(() => { summary.load(); });
  async function loadMore() {
    more = true;
    try { const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/notify/messages?limit=50${status ? `&status=${status}` : ''}&cursor=${encodeURIComponent(cursor ?? '')}`)); items = [...items, ...r.items]; cursor = r.nextCursor; }
    catch (e) { toasts.error(e); } finally { more = false; }
  }
  /** @param {any} m */
  async function retry(m) {
    try { const r = /** @type {any} */ (await api.post(`/services/${sid}/notify/messages/${m.id}/retry`)); items = items.map((x) => (x.id === m.id ? r : x)); toasts.ok(t('notify.retryDone')); summary.load(); }
    catch (e) { toasts.error(e); }
  }

  // Send dialog
  let sendOpen = $state(false);
  let sendBusy = $state(false);
  /** @type {any[]} */
  let templates = $state([]);
  let tplName = $state('generic');
  let to = $state('');
  let dataText = $state('');
  let dataError = $state('');
  const tpl = $derived(templates.find((x) => x.name === tplName));
  async function openSend() {
    sendOpen = true;
    if (!templates.length) {
      try { templates = /** @type {{ items: any[] }} */ (await api.get(`/services/${sid}/notify/templates`)).items; } catch (e) { toasts.error(e); }
    }
    fillSample();
  }
  function fillSample() {
    const schema = tpl?.schema;
    /** @type {Record<string, unknown>} */
    const sample = {};
    for (const [k, v] of Object.entries(/** @type {Record<string, any>} */ (schema?.properties ?? {}))) {
      if (k === 'locale') { sample[k] = i18n.lang; continue; }
      if (v.type === 'integer') sample[k] = v.minimum ?? 1;
      else if (v.type === 'array') sample[k] = ['…'];
      else if (v.type === 'object') sample[k] = Object.fromEntries(Object.keys(v.properties ?? {}).map((p) => [p, p === 'url' ? 'https://example.com' : '…']));
      else if (v.format === 'uri' || /url/i.test(k)) sample[k] = 'https://example.com/';
      else sample[k] = k === 'appName' ? 'Console' : '…';
    }
    dataText = JSON.stringify(sample, null, 2);
  }
  $effect(() => { tplName; if (sendOpen) fillSample(); });
  async function send() {
    let data;
    try { data = JSON.parse(dataText); dataError = ''; } catch { dataError = t('notify.invalidJson'); return; }
    sendBusy = true;
    try {
      const r = /** @type {any} */ (await api.post(`/services/${sid}/notify/messages`, { channel: 'email', template: tplName, to: to.split(',').map((s) => s.trim()).filter(Boolean), data }));
      toasts.ok(t('notify.sendDone', { id: Fmt.short(r.id) })); sendOpen = false; list.load(); summary.load();
    } catch (e) { toasts.error(e); } finally { sendBusy = false; }
  }
  const svc = $derived(services.get(sid));
  const m = $derived(summary.data?.summary);
</script>

<Page title={svc?.label ?? t('notify.title')} desc={t('notify.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    {#if session.isAdmin}<button class="btn primary" onclick={openSend}><Icon name="mail" size={16} /> {t('notify.send')}</button>{/if}
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="notify" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:20px">
    <Stat label={t('notify.queued')} value={fmt.int(m?.queued)} />
    <Stat label={t('notify.processing')} value={fmt.int(m?.processing)} />
    <Stat label={t('notify.sent')} value={fmt.int(m?.sent)} tone="ok" />
    <Stat label={t('notify.failed')} value={fmt.int(m?.failed)} tone={m?.failed ? 'danger' : ''} />
    <Stat label={t('notify.oldest')} value={fmt.duration(m?.oldestQueuedAgeSec)} tone={(m?.oldestQueuedAgeSec ?? 0) > 300 ? 'warn' : ''} />
  </div>

  <div class="card flush">
    <div class="card-head">
      <h2>{t('notify.messages')}</h2>
      <div class="seg">
        {#each STATUSES as s (s)}<button aria-pressed={status === s} onclick={() => { status = s; }}>{s ? t(`notify.${s}`) : t('common.all')}</button>{/each}
      </div>
    </div>
    <div class="card-body">
      {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
      {:else if list.loading && !items.length}<Skeleton rows={6} />
      {:else if !items.length}<Empty title={t('notify.emptyTitle')} desc={t('notify.emptyDesc')} />
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('common.status')}</th><th>{t('notify.channel')}</th><th>{t('notify.to')}</th><th class="num">{t('notify.attempts')}</th><th class="hide-m">{t('common.created')}</th><th class="hide-m">{t('notify.lastError')}</th><th></th></tr></thead>
          <tbody>
            {#each items as msg (msg.id)}
              <tr class="clickable" onclick={() => router.go(`/notify/${sid}/messages/${msg.id}`)}>
                <td><StatusBadge status={msg.status} label={t(`notify.${msg.status}`)} /></td>
                <td><span class="row"><Icon name={msg.channel === 'email' ? 'mail' : 'webhook'} size={14} /> {msg.template ?? msg.event}</span></td>
                <td class="truncate" style="max-width:220px">{msg.to?.join(', ') ?? msg.url}</td>
                <td class="num">{msg.attempts}/{msg.maxAttempts}</td>
                <td class="hide-m"><Time value={msg.createdAt} /></td>
                <td class="truncate small muted hide-m" style="max-width:260px" title={msg.lastError ?? ''}>{msg.lastError ?? ''}</td>
                <td>{#if msg.status === 'failed' && session.isAdmin}<button class="btn sm" onclick={(e) => { e.stopPropagation(); retry(msg); }}><Icon name="refresh" size={14} /> {t('notify.retry')}</button>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        <LoadMore {cursor} busy={more} onmore={loadMore} />
      {/if}
    </div>
  </div>
</Page>

<Dialog open={sendOpen} title={t('notify.sendTitle')} onclose={() => { sendOpen = false; }} wide>
  <p class="small muted" style="margin-bottom:12px">{t('notify.sendDesc')}</p>
  <div class="stack">
    <div class="field"><label for="tpl">{t('notify.template')}</label>
      <select id="tpl" class="select" bind:value={tplName}>{#each templates as x (x.name)}<option value={x.name}>{x.name} — {x.description}</option>{/each}</select></div>
    <div class="field"><label for="to">{t('notify.to')}</label><input id="to" class="input" type="text" placeholder="a@example.com, b@example.com" bind:value={to} /></div>
    <div class="field"><label for="data">{t('notify.data')}</label><textarea id="data" class="textarea" rows="10" bind:value={dataText} aria-invalid={dataError ? 'true' : undefined}></textarea>{#if dataError}<span class="error">{dataError}</span>{/if}</div>
  </div>
  {#snippet footer()}
    <button class="btn" onclick={() => { sendOpen = false; }}>{t('common.cancel')}</button>
    <button class="btn primary" onclick={send} disabled={sendBusy || !to.trim()}>{t('notify.send')}</button>
  {/snippet}
</Dialog>
