<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Time from '../../lib/components/Time.svelte';
  import Confirm from '../../lib/components/Confirm.svelte';
  import CopyButton from '../../lib/components/CopyButton.svelte';
  import LoadMore from '../../lib/components/LoadMore.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import JobForm from './JobForm.svelte';
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
  const base = $derived(`/services/${sid}/scheduler/jobs/${encodeURIComponent(id)}`);
  const res = new Resource(() => api.get(base));
  $effect(() => { res.load(); });
  const d = $derived(/** @type {any} */ (res.data));
  const j = $derived(d?.job);
  /** Runs loaded past the first page, appended below the detail's own list. @type {any[]} */
  let extraRuns = $state([]);
  /** @type {string|null} */ let runBefore = $state(null);
  let runMore = $state(false);
  $effect(() => { if (d) { extraRuns = []; runBefore = d.runsNextBefore; } });
  const allRuns = $derived([...(d?.runs ?? []), ...extraRuns]);
  async function loadMoreRuns() {
    runMore = true;
    try { const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(`${base}/runs?limit=20&before=${runBefore}`)); extraRuns = [...extraRuns, ...r.items]; runBefore = r.nextBefore; }
    catch (e) { toasts.error(e); } finally { runMore = false; }
  }
  let busy = $state(false);
  /** @param {() => Promise<unknown>} fn @param {string} ok */
  async function run(fn, ok) {
    busy = true;
    try { await fn(); toasts.ok(ok); await res.load(); } catch (err) { toasts.error(err); } finally { busy = false; }
  }
  /** @type {'delete'|'pause'|null} */ let confirm = $state(null);
  let editOpen = $state(false);
  /** @type {string[]} */ let targetKeys = $state([]);
  /** @type {string[]} */ let timezones = $state([]);
  async function openEdit() {
    if (!timezones.length) {
      try {
        const [k, z] = await Promise.all([api.get(`/services/${sid}/scheduler/target-keys`), api.get(`/services/${sid}/scheduler/timezones`)]);
        targetKeys = /** @type {any} */ (k).items; timezones = /** @type {any} */ (z).items;
      } catch (e) { toasts.error(e); return; }
    }
    editOpen = true;
  }
  /** @param {Record<string, unknown>} patch */
  async function save(patch) {
    if (!Object.keys(patch).length) { toasts.info(t('sc.noChanges')); editOpen = false; return; }
    await run(() => api.patch(base, patch), t('sc.updated'));
    editOpen = false;
  }
  async function runNow() {
    busy = true;
    try { const r = /** @type {any} */ (await api.post(`${base}/run`, {})); toasts.ok(t('sc.runQueued', { id: r.run.id })); await res.load(); } catch (e) { toasts.error(e); } finally { busy = false; }
  }
  const pause = () => run(() => api.patch(base, { enabled: false }), t('sc.pausedOk')).then(() => { confirm = null; });
  const resume = () => run(() => api.patch(base, { enabled: true }), t('sc.resumed'));
  const headerCount = $derived(j ? Object.keys(j.target.headers ?? {}).length : 0);
</script>

<Page title={j ? j.name : t('sc.job')} back="/scheduler/{sid}">
  {#snippet actions()}
    {#if j && session.isAdmin}
      <button class="btn primary" onclick={runNow} disabled={busy}><Icon name="play" size={16} /><span class="hide-m"> {t('sc.runNow')}</span></button>
      <button class="btn" onclick={openEdit} disabled={busy}><Icon name="settings" size={16} /><span class="hide-m"> {t('sc.edit')}</span></button>
      {#if j.enabled}<button class="btn" onclick={() => { confirm = 'pause'; }} disabled={busy}><Icon name="pause" size={16} /><span class="hide-m"> {t('sc.pause')}</span></button>
      {:else}<button class="btn" onclick={resume} disabled={busy}><Icon name="check" size={16} /><span class="hide-m"> {t('sc.resume')}</span></button>{/if}
      <button class="btn danger" onclick={() => { confirm = 'delete'; }} disabled={busy} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
    {/if}
    <button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !j}<Skeleton rows={8} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        <div class="row wrap" style="margin-bottom:12px">
          {#if j.enabled}<StatusBadge status="active" label={t('sc.enabled')} />{:else}<StatusBadge status="disabled" label={t('sc.paused')} />{/if}
          {#if j.lastStatus}<StatusBadge status={j.lastStatus} label="{t('sc.lastRun')}: {t(`sc.status.${j.lastStatus}`)}" />{/if}
          {#each j.tags as tg (tg)}<span class="badge plain">{tg}</span>{/each}
        </div>
        {#if j.description}<p style="margin-bottom:12px">{j.description}</p>{/if}
        <dl class="kv">
          <dt>{t('sc.schedule')}</dt><dd>{#if j.schedule.cron}<span class="mono">{j.schedule.cron}</span> · <span class="faint small">{j.schedule.timezone}</span>{:else}{t('sc.oneShot')} · <Time value={j.schedule.at} mode="absolute" />{/if}</dd>
          <dt>{t('sc.nextRun')}</dt><dd>{#if j.nextRunAt}<Time value={j.nextRunAt} mode="absolute" /> <span class="faint small">(<Time value={j.nextRunAt} />)</span>{:else}<span class="faint">–</span>{/if}</dd>
          <dt>{t('sc.lastRun')}</dt><dd>{#if j.lastRunAt}<Time value={j.lastRunAt} mode="absolute" /> <span class="faint small">(<Time value={j.lastRunAt} />)</span>{:else}<span class="faint">{t('sc.never')}</span>{/if}</dd>
          <dt>{t('sc.target')}</dt><dd class="row" style="min-width:0"><span class="badge plain">{j.target.method}</span><span class="mono truncate" title={j.target.url}>{j.target.url}</span><CopyButton text={j.target.url} /></dd>
          {#if headerCount}<dt>{t('sc.headers')}</dt><dd class="mono small">{#each Object.entries(j.target.headers) as [k, v] (k)}<div class="truncate">{k}: {v}</div>{/each}</dd>{/if}
          {#if j.target.body !== undefined}<dt>{t('sc.body')}</dt><dd><pre class="result">{JSON.stringify(j.target.body, null, 2)}</pre></dd>{/if}
          <dt>{t('sc.targetKey')}</dt><dd>{#if j.targetKey}<span class="mono">{j.targetKey}</span>{:else}<span class="faint">{t('sc.noTargetKey')}</span>{/if}</dd>
          <dt>{t('sc.timeoutShort')}</dt><dd>{fmt.ms(j.timeoutMs)} · {t('sc.retrySummary', { max: j.retry.max, sec: j.retry.backoffSec })}</dd>
          <dt>{t('sl.createdBy')}</dt><dd><span class="mono small">{j.createdBy}</span> · <Time value={j.createdAt} mode="absolute" /> · {t('common.updated')} <Time value={j.updatedAt} /></dd>
        </dl>
      </div></div>

      <Panel title={t('sc.runs')} flush>
        {#if !allRuns.length}<Empty icon="history" title={t('sc.noRuns')} />
        {:else}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>#</th><th>{t('common.status')}</th><th>{t('sc.scheduledFor')}</th><th class="hide-m">{t('sc.started')}</th><th class="hide-m">{t('sc.trigger')}</th><th>{t('sc.duration')}</th><th class="hide-m">HTTP</th><th class="hide-m">{t('sc.error')}</th></tr></thead>
            <tbody>
              {#each allRuns as r (r.id)}
                <tr class="clickable" onclick={() => router.go(`/scheduler/${sid}/runs/${r.id}`)}>
                  <td class="mono small">{r.id}</td>
                  <td><StatusBadge status={r.status} label={t(`sc.status.${r.status}`)} />{#if r.attempt > 1 || r.status === 'retrying'} <span class="xs faint">{r.attempt}/{r.maxAttempts}</span>{/if}</td>
                  <td style="white-space:nowrap"><Time value={r.scheduledFor} /></td>
                  <td class="hide-m" style="white-space:nowrap">{#if r.startedAt}<Time value={r.startedAt} />{:else}–{/if}</td>
                  <td class="hide-m small">{t(`sc.trigger.${r.trigger}`)}</td>
                  <td class="small">{fmt.ms(r.durationMs)}</td>
                  <td class="hide-m mono small">{r.httpStatus ?? '–'}</td>
                  <td class="hide-m xs faint truncate" style="max-width:240px" title={r.error ?? ''}>{r.error ?? ''}</td>
                </tr>
              {/each}
            </tbody>
          </table></div>
          <LoadMore cursor={runBefore} busy={runMore} onmore={loadMoreRuns} />
        {/if}
      </Panel>
    </div>
  {/if}
</Page>

<JobForm open={editOpen} {sid} initial={j} busy={busy} {targetKeys} {timezones} onsubmit={save} onclose={() => { editOpen = false; }} />
<Confirm open={confirm === 'pause'} title={t('sc.pause')} message={t('sc.pauseDesc')} confirmLabel={t('sc.pause')} busy={busy} onconfirm={pause} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'delete'} title={t('sc.delete')} message={t('sc.deleteDesc')} danger typeWord={j?.name} confirmLabel={t('common.delete')} busy={busy} onconfirm={() => run(async () => { await api.delete(base); router.go(`/scheduler/${sid}`); }, t('sc.deleted'))} oncancel={() => { confirm = null; }} />
