<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Time from '../../lib/components/Time.svelte';
  import Confirm from '../../lib/components/Confirm.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
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
  const base = $derived(`/services/${sid}/webhook-out/deliveries/${encodeURIComponent(id)}`);
  const res = new Resource(() => api.get(base));
  $effect(() => { res.load(); });
  const r = $derived(/** @type {any} */ (res.data)?.delivery);
  const cancellable = $derived(Boolean(r) && (r.status === 'pending' || r.status === 'retrying'));
  const redeliverable = $derived(Boolean(r) && (r.status === 'succeeded' || r.status === 'failed' || r.status === 'cancelled'));
  let busy = $state(false);
  /** @type {'cancel'|'redeliver'|null} */ let confirm = $state(null);
  async function cancel() {
    busy = true;
    try { await api.post(`${base}/cancel`, {}); toasts.ok(t('wh.cancelled')); confirm = null; await res.load(); } catch (e) { toasts.error(e); } finally { busy = false; }
  }
  async function redeliver() {
    busy = true;
    try { const out = /** @type {any} */ (await api.post(`${base}/redeliver`, {})); toasts.ok(t('wh.redelivered', { id: out.delivery.id })); confirm = null; router.go(`/webhook-out/${sid}/deliveries/${out.delivery.id}`); } catch (e) { toasts.error(e); } finally { busy = false; }
  }
</script>

<Page title="{t('wh.delivery')} #{id}" back="/webhook-out/{sid}/subscriptions/{r?.subscriptionId ?? ''}">
  {#snippet actions()}
    {#if session.isAdmin && redeliverable}<button class="btn primary" onclick={() => { confirm = 'redeliver'; }} disabled={busy}><Icon name="refresh" size={16} /><span class="hide-m"> {t('wh.redeliver')}</span></button>{/if}
    {#if session.isAdmin && cancellable}<button class="btn danger" onclick={() => { confirm = 'cancel'; }} disabled={busy}><Icon name="x" size={16} /><span class="hide-m"> {t('wh.cancel')}</span></button>{/if}
    <button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !r}<Skeleton rows={8} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        <div class="row wrap" style="margin-bottom:12px">
          <StatusBadge status={r.status} label={t(`wh.dstatus.${r.status}`)} />
          <span class="badge plain">{t('wh.attempt')} {r.attempt}/{r.maxAttempts}</span>
        </div>
        <dl class="kv">
          <dt>{t('wh.subscription')}</dt><dd><a href="/webhook-out/{sid}/subscriptions/{r.subscriptionId}" class="mono">{r.subscriptionId}</a></dd>
          <dt>{t('wh.event')}</dt><dd><a href="/webhook-out/{sid}/events/{r.eventId}" class="mono">{r.eventId}</a></dd>
          <dt>{t('common.created')}</dt><dd><Time value={r.createdAt} mode="absolute" /> <span class="faint small">(<Time value={r.createdAt} />)</span></dd>
          <dt>{t('wh.started')}</dt><dd>{#if r.startedAt}<Time value={r.startedAt} mode="absolute" />{:else}<span class="faint">–</span>{/if}</dd>
          <dt>{t('wh.finished')}</dt><dd>{#if r.finishedAt}<Time value={r.finishedAt} mode="absolute" /> · {fmt.ms(r.durationMs)}{:else}<span class="faint">–</span>{/if}</dd>
          {#if r.nextAttemptAt}<dt>{t('wh.nextAttempt')}</dt><dd><Time value={r.nextAttemptAt} mode="absolute" /> <span class="faint small">(<Time value={r.nextAttemptAt} />)</span></dd>{/if}
          <dt>HTTP</dt><dd class="mono">{r.httpStatus ?? '–'}</dd>
          {#if r.error}<dt>{t('wh.error')}</dt><dd class="danger-text" style="word-break:break-word">{r.error}</dd>{/if}
          {#if r.response}<dt>{t('wh.response')}</dt><dd><pre class="result">{r.response}</pre></dd>{/if}
        </dl>
      </div></div>

      <Panel title={t('wh.attempts')} flush>
        {#if !r.attempts.length}<p class="small faint" style="padding:16px;margin:0">–</p>{:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>#</th><th>{t('wh.started')}</th><th>{t('wh.duration')}</th><th>HTTP</th><th>{t('wh.error')}</th></tr></thead>
          <tbody>{#each r.attempts as a (a.n)}<tr><td class="mono small">{a.n}</td><td style="white-space:nowrap"><Time value={a.startedAt} mode="absolute" /></td><td class="small">{fmt.ms(a.durationMs)}</td><td class="mono small">{a.httpStatus ?? '–'}</td><td class="small truncate" style="max-width:280px" title={a.error ?? ''}>{#if a.error}<span class="danger-text">{a.error}</span>{:else}<span class="faint">–</span>{/if}</td></tr>{/each}</tbody>
        </table></div>{/if}
      </Panel>
    </div>
  {/if}
</Page>

<Confirm open={confirm === 'cancel'} title={t('wh.cancel')} message={t('wh.cancelDesc')} danger confirmLabel={t('wh.cancel')} busy={busy} onconfirm={cancel} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'redeliver'} title={t('wh.redeliver')} message={t('wh.redeliverDesc')} confirmLabel={t('wh.redeliver')} busy={busy} onconfirm={redeliver} oncancel={() => { confirm = null; }} />
