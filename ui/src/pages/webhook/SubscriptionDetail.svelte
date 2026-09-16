<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Time from '../../lib/components/Time.svelte';
  import Confirm from '../../lib/components/Confirm.svelte';
  import Dialog from '../../lib/components/Dialog.svelte';
  import CopyButton from '../../lib/components/CopyButton.svelte';
  import LoadMore from '../../lib/components/LoadMore.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import RowMenu from '../../lib/components/RowMenu.svelte';
  import SubscriptionForm from './SubscriptionForm.svelte';
  import SecretDialog from './SecretDialog.svelte';
  import DeliveryTable from './DeliveryTable.svelte';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import { session } from '../../lib/session.svelte.js';
  import { Fmt } from '../../lib/format.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  import { toasts } from '../../lib/toast.svelte.js';
  /** @type {{ sid: string, id: string }} */
  let { sid, id } = $props();
  const fmt = $derived(new Fmt(i18n.lang));
  const base = $derived(`/services/${sid}/webhook-out/subscriptions/${encodeURIComponent(id)}`);
  const res = new Resource(() => api.get(base));
  $effect(() => { res.load(); });
  const d = $derived(/** @type {any} */ (res.data));
  const s = $derived(d?.subscription);
  /** @type {any[]} */ let extra = $state([]);
  /** @type {string|null} */ let before = $state(null);
  let moreBusy = $state(false);
  $effect(() => { if (d) { extra = []; before = d.deliveriesNextBefore; } });
  const all = $derived([...(d?.deliveries ?? []), ...extra]);
  async function loadMore() {
    moreBusy = true;
    try { const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(`/services/${sid}/webhook-out/deliveries?subscription=${encodeURIComponent(id)}&limit=20&before=${before}`)); extra = [...extra, ...r.items]; before = r.nextBefore; }
    catch (e) { toasts.error(e); } finally { moreBusy = false; }
  }
  let busy = $state(false);
  /** @param {() => Promise<unknown>} fn @param {string|null} ok */
  async function run(fn, ok) {
    busy = true;
    try { await fn(); if (ok) toasts.ok(ok); await res.load(); } catch (err) { toasts.error(err); } finally { busy = false; }
  }
  /** @type {'delete'|'pause'|'rotate'|null} */ let confirm = $state(null);
  let editOpen = $state(false);
  let replayOpen = $state(false);
  let replayFrom = $state('');
  let replayTo = $state('');
  /** @type {string|null} */ let secret = $state(null);
  /** @type {string|null} */ let secretUntil = $state(null);
  /** @param {Record<string, unknown>} patch */
  async function save(patch) {
    if (!Object.keys(patch).length) { toasts.info(t('wh.noChanges')); editOpen = false; return; }
    await run(() => api.patch(base, patch), t('wh.updated'));
    editOpen = false;
  }
  const pause = () => run(() => api.patch(base, { enabled: false }), t('wh.pausedOk')).then(() => { confirm = null; });
  const resume = () => run(() => api.patch(base, { enabled: true }), t('wh.resumed'));
  const sendTest = () => run(async () => { const r = /** @type {any} */ (await api.post(`${base}/test`, {})); toasts.ok(t('wh.testQueued', { id: r.delivery.id })); }, null);
  const rotate = () => run(async () => { const r = /** @type {any} */ (await api.post(`${base}/rotate`, {})); secret = r.secret; secretUntil = r.previousValidUntil; }, t('wh.rotated')).then(() => { confirm = null; });
  /** Local datetime input → ISO; the window end is optional. */
  const toIso = (/** @type {string} */ v) => (v ? new Date(v).toISOString() : undefined);
  const replayValid = $derived(Boolean(replayFrom) && !Number.isNaN(Date.parse(replayFrom)) && (!replayTo || Date.parse(replayTo) > Date.parse(replayFrom)));
  const replay = () => run(async () => { const r = /** @type {any} */ (await api.post(`${base}/replay`, { from: toIso(replayFrom), ...(replayTo ? { to: toIso(replayTo) } : {}) })); toasts.ok(t('wh.replayed', { n: r.queued })); replayOpen = false; }, null);
  const headerCount = $derived(s ? Object.keys(s.headers ?? {}).length : 0);
</script>

<Page title={s ? s.name : t('wh.subscription')} back="/webhook-out/{sid}">
  {#snippet actions()}
    {#if s && session.isAdmin}
      <button class="btn primary" onclick={sendTest} disabled={busy}><Icon name="webhook" size={16} /><span class="hide-m"> {t('wh.test')}</span></button>
      <button class="btn" onclick={() => { editOpen = true; }} disabled={busy}><Icon name="settings" size={16} /><span class="hide-m"> {t('wh.edit')}</span></button>
      {#if s.status === 'active'}<button class="btn" onclick={() => { confirm = 'pause'; }} disabled={busy}><Icon name="pause" size={16} /><span class="hide-m"> {t('wh.pause')}</span></button>
      {:else}<button class="btn" onclick={resume} disabled={busy}><Icon name="check" size={16} /><span class="hide-m"> {t('wh.resume')}</span></button>{/if}
      <RowMenu label={t('common.actions')} items={[
        { label: t('wh.replay'), icon: 'history', run: () => { replayFrom = ''; replayTo = ''; replayOpen = true; } },
        { label: t('wh.rotate'), icon: 'key', run: () => { confirm = 'rotate'; } },
        { label: t('wh.delete'), icon: 'trash', danger: true, run: () => { confirm = 'delete'; } },
      ]} />
    {/if}
    <button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !s}<Skeleton rows={8} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        <div class="row wrap" style="margin-bottom:12px">
          <StatusBadge status={s.status} label={t(`wh.status.${s.status}`)} />
          {#if s.lastStatus}<StatusBadge status={s.lastStatus} label="{t('wh.lastDelivery')}: {t(`wh.dstatus.${s.lastStatus}`)}" />{/if}
          {#if s.consecutiveFailures}<span class="badge danger">{t('wh.consecutiveFailures')}: {s.consecutiveFailures}</span>{/if}
        </div>
        {#if s.status === 'disabled'}<p class="small danger-text" style="margin-bottom:12px">{t('wh.disabledNote', { n: s.consecutiveFailures })}</p>{/if}
        {#if s.description}<p style="margin-bottom:12px">{s.description}</p>{/if}
        <dl class="kv">
          <dt>{t('wh.url')}</dt><dd class="row" style="min-width:0"><span class="mono truncate" title={s.url}>{s.url}</span><CopyButton text={s.url} /></dd>
          <dt>{t('wh.eventPatterns')}</dt><dd><span class="row wrap" style="gap:4px">{#each s.events as p (p)}<span class="badge plain mono">{p}</span>{/each}</span></dd>
          {#if headerCount}<dt>{t('wh.headers')}</dt><dd class="mono small">{#each Object.entries(s.headers) as [k, v] (k)}<div class="truncate">{k}: {v}</div>{/each}</dd>{/if}
          <dt>{t('wh.lastDelivery')}</dt><dd>{#if s.lastDeliveryAt}<Time value={s.lastDeliveryAt} mode="absolute" /> <span class="faint small">(<Time value={s.lastDeliveryAt} />)</span>{:else}<span class="faint">{t('wh.never')}</span>{/if}</dd>
          {#if s.secretRotatedUntil && Date.parse(s.secretRotatedUntil) > Date.now()}<dt>{t('wh.rotate')}</dt><dd class="small">{t('wh.secretPrev', { until: fmt.dateTime(s.secretRotatedUntil) })}</dd>{/if}
          <dt>{t('sl.createdBy')}</dt><dd><span class="mono small">{s.createdBy}</span> · <Time value={s.createdAt} mode="absolute" /> · {t('common.updated')} <Time value={s.updatedAt} /></dd>
        </dl>
      </div></div>

      <Panel title={t('wh.deliveries')} flush>
        {#if !all.length}<Empty icon="history" title={t('wh.noDeliveries')} />
        {:else}
          <DeliveryTable {sid} items={all} showSubscription={false} />
          <LoadMore cursor={before} busy={moreBusy} onmore={loadMore} />
        {/if}
      </Panel>
    </div>
  {/if}
</Page>

<SubscriptionForm open={editOpen} initial={s} busy={busy} onsubmit={save} onclose={() => { editOpen = false; }} />
<SecretDialog {secret} previousValidUntil={secretUntil} onclose={() => { secret = null; secretUntil = null; }} />
<Dialog open={replayOpen} title={t('wh.replay')} onclose={() => { replayOpen = false; }}>
  <p class="small muted" style="margin:0 0 12px">{t('wh.replayDesc')}</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
    <div class="field"><label for="rp-from">{t('wh.replayFrom')}</label><input id="rp-from" class="input" type="datetime-local" bind:value={replayFrom} required /></div>
    <div class="field"><label for="rp-to">{t('wh.replayTo')} <span class="faint">({t('common.optional')})</span></label><input id="rp-to" class="input" type="datetime-local" bind:value={replayTo} /><span class="hint">{t('wh.replayToHint')}</span></div>
  </div>
  {#snippet footer()}
    <button class="btn" onclick={() => { replayOpen = false; }} disabled={busy}>{t('common.cancel')}</button>
    <button class="btn primary" onclick={replay} disabled={busy || !replayValid}>{t('wh.replay')}</button>
  {/snippet}
</Dialog>
<Confirm open={confirm === 'pause'} title={t('wh.pause')} message={t('wh.pauseDesc')} confirmLabel={t('wh.pause')} busy={busy} onconfirm={pause} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'rotate'} title={t('wh.rotate')} message={t('wh.rotateDesc')} danger confirmLabel={t('wh.rotate')} busy={busy} onconfirm={rotate} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'delete'} title={t('wh.delete')} message={t('wh.deleteDesc')} danger typeWord={s?.name} confirmLabel={t('common.delete')} busy={busy} onconfirm={() => run(async () => { await api.delete(base); router.go(`/webhook-out/${sid}`); }, t('wh.deleted'))} oncancel={() => { confirm = null; }} />
