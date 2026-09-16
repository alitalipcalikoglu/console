<script>
  import Page from '../../lib/components/Page.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Stat from '../../lib/components/Stat.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Time from '../../lib/components/Time.svelte';
  import CopyButton from '../../lib/components/CopyButton.svelte';
  import Confirm from '../../lib/components/Confirm.svelte';
  import LinkForm from './LinkForm.svelte';
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
  const DAYS = 30;
  const base = $derived(`/services/${sid}/shortlink/links/${encodeURIComponent(id)}`);
  const res = new Resource(() => api.get(`${base}?days=${DAYS}`));
  $effect(() => { res.load(); });
  const d = $derived(/** @type {any} */ (res.data));
  const l = $derived(d?.link);
  const st = $derived(d?.stats);
  const maxDay = $derived(Math.max(1, ...(st?.byDay ?? []).map((/** @type {any} */ x) => x.clicks)));
  let busy = $state(false);
  let editOpen = $state(false);
  /** @type {'disable'|'delete'|null} */ let confirm = $state(null);
  /** @param {() => Promise<unknown>} fn @param {string} ok */
  async function run(fn, ok, reload = true) {
    busy = true;
    try { await fn(); toasts.ok(ok); if (reload) await res.load(); } catch (e) { toasts.error(e); } finally { busy = false; confirm = null; editOpen = false; }
  }
  /** @param {string} s */
  const tone = (s) => (s === 'active' ? 'ok' : s === 'disabled' ? 'danger' : 'warn');
  const qrSrc = $derived(`/api${base}/qr.png?scale=6&margin=2`);
</script>

<Page title={l ? l.code : t('sl.link')} back="/shortlink/{sid}">
  {#snippet actions()}
    {#if l && session.isAdmin}
      <button class="btn" onclick={() => { editOpen = true; }} disabled={busy}><Icon name="settings" size={16} /><span class="hide-m"> {t('sl.edit')}</span></button>
      {#if l.enabled}<button class="btn danger" onclick={() => { confirm = 'disable'; }} disabled={busy}><Icon name="lock" size={16} /><span class="hide-m"> {t('sl.disable')}</span></button>
      {:else}<button class="btn primary" onclick={() => run(() => api.patch(base, { enabled: true }), t('sl.updated'))} disabled={busy}><Icon name="unlock" size={16} /><span class="hide-m"> {t('sl.enable')}</span></button>{/if}
      <button class="btn danger" onclick={() => { confirm = 'delete'; }} disabled={busy} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
    {/if}
    <button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} />
  {:else if !l}<Skeleton rows={10} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body detail">
        <div class="info">
          <div class="row wrap" style="margin-bottom:12px">
            <span class="badge {tone(l.status)}">{t(`sl.${l.status}`)}</span>
            <span class="badge plain">{l.permanent ? '301' : '302'}</span>
            {#each l.tags as tg (tg)}<span class="badge plain">{tg}</span>{/each}
          </div>
          <div class="row" style="margin-bottom:12px;min-width:0"><a class="mono truncate" href={l.shortUrl} target="_blank" rel="noreferrer" style="font-size:1.05rem;font-weight:600">{l.shortUrl}</a><CopyButton text={l.shortUrl} /></div>
          <dl class="kv">
            <dt>{t('sl.url')}</dt><dd class="row" style="min-width:0"><a class="truncate" href={l.url} target="_blank" rel="noreferrer" title={l.url}>{l.url}</a><CopyButton text={l.url} /></dd>
            <dt>{t('sl.clicks')}</dt><dd><strong>{fmt.int(l.clicks)}</strong>{#if l.maxClicks != null} / {fmt.int(l.maxClicks)} <span class="faint small">({t('sl.remaining', { n: fmt.int(l.remainingClicks) })})</span>{/if}</dd>
            <dt>{t('sl.lastClick')}</dt><dd>{#if l.lastClickAt}<Time value={l.lastClickAt} />{:else}<span class="faint">{t('sl.never')}</span>{/if}</dd>
            <dt>{t('sl.expiresAt')}</dt><dd>{#if l.expiresAt}<Time value={l.expiresAt} mode="absolute" /> <span class="faint small">(<Time value={l.expiresAt} />)</span>{:else}<span class="faint">{t('sl.never')}</span>{/if}</dd>
            {#if l.note}<dt>{t('sl.note')}</dt><dd>{l.note}</dd>{/if}
            <dt>{t('sl.createdBy')}</dt><dd><span class="mono small">{l.createdBy}</span> · <Time value={l.createdAt} mode="absolute" /></dd>
            <dt>{t('sl.preview')}</dt><dd><a class="mono small" href={l.previewUrl} target="_blank" rel="noreferrer">{l.previewUrl} <Icon name="external" size={12} /></a></dd>
          </dl>
        </div>
        <div class="qr">
          <img src={qrSrc} alt="QR {l.shortUrl}" width="180" height="180" />
          <a class="btn sm" href={qrSrc} download="{l.code}.png"><Icon name="download" size={14} /> {t('sl.download')}</a>
          <p class="xs faint" style="text-align:center;margin:0">{t('sl.qrHint')}</p>
        </div>
      </div></div>

      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
        <Stat label={t('sl.clicksWindow', { d: DAYS })} value={fmt.int(st?.clicks)} />
        <Stat label={t('sl.visitors')} value={fmt.int(st?.visitors)} />
        <Stat label={t('sl.bots')} value={fmt.int(st?.bots)} />
        <Stat label={t('sl.byDevice')} value={st?.byDevice?.mobile != null || st?.byDevice?.desktop != null ? `${fmt.int(st.byDevice.mobile ?? 0)} / ${fmt.int(st.byDevice.desktop ?? 0)}` : '–'} sub="mobile / desktop" />
      </div>

      {#if st && st.clicks > 0}
        <div class="card flush"><div class="card-head"><h2>{t('sl.byDay')}</h2><span class="xs faint">{t('sl.clicksWindow', { d: DAYS })}</span></div><div class="card-body">
          <div class="bars" role="img" aria-label={t('sl.byDay')}>
            {#each st.byDay as day (day.day)}<div class="bar" style="height:{Math.max(4, Math.round((day.clicks / maxDay) * 100))}%" title="{day.day}: {day.clicks} ({day.visitors})"></div>{/each}
          </div>
          <div class="row xs faint" style="justify-content:space-between;margin-top:4px"><span>{st.byDay[0]?.day}</span><span>{st.byDay.at(-1)?.day}</span></div>
        </div></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
          <div class="card flush"><div class="card-head"><h2>{t('sl.byReferrer')}</h2></div><div class="card-body">
            <ol class="ranked">{#each st.byReferrer as r (r.referrer ?? '')}<li><span class="truncate {r.referrer ? 'mono small' : 'muted small'}">{r.referrer ?? t('sl.direct')}</span><span class="num">{fmt.int(r.clicks)}</span></li>{/each}</ol>
          </div></div>
          <div class="card flush"><div class="card-head"><h2>{t('sl.recent')}</h2></div><div class="card-body">
            <div class="table-wrap"><table class="table">
              <thead><tr><th>{t('common.at')}</th><th>{t('sl.device')}</th><th>{t('sl.referrer')}</th><th class="hide-m">{t('sl.visitor')}</th></tr></thead>
              <tbody>{#each st.recent as c, i (i)}<tr><td style="white-space:nowrap"><Time value={c.at} /></td><td><span class="badge plain">{c.device}</span></td><td class="small truncate" style="max-width:160px">{c.referrer ?? '–'}</td><td class="mono xs faint hide-m">{c.visitor.slice(0, 12)}</td></tr>{/each}</tbody>
            </table></div>
          </div></div>
        </div>
      {:else if st}
        <p class="small faint">{t('sl.noClicks')}</p>
      {/if}
    </div>
  {/if}
</Page>

<LinkForm open={editOpen} title={t('sl.edit')} submitLabel={t('common.save')} initial={l} {busy} onsubmit={(body) => run(() => api.patch(base, body), t('sl.updated'))} onclose={() => { editOpen = false; }} />
<Confirm open={confirm === 'disable'} title={t('sl.disable')} message={t('sl.disableDesc')} confirmLabel={t('sl.disable')} {busy} onconfirm={() => run(() => api.patch(base, { enabled: false }), t('sl.updated'))} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'delete'} title={t('sl.delete')} message={t('sl.deleteDesc')} danger typeWord={l?.code} confirmLabel={t('common.delete')} {busy} onconfirm={() => run(async () => { await api.delete(base); router.go(`/shortlink/${sid}`); }, t('sl.deleted'), false)} oncancel={() => { confirm = null; }} />

<style>
  .detail { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; align-items: start; }
  .info { min-width: 0; }
  .qr { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 180px; }
  .qr img { border-radius: 8px; background: #fff; display: block; }
  @media (max-width: 700px) { .detail { grid-template-columns: minmax(0, 1fr); } .qr { width: 100%; } }
  .bars { display: flex; align-items: flex-end; gap: 3px; height: 90px; }
  .bar { flex: 1; min-width: 3px; max-width: 40px; background: var(--accent); border-radius: 2px 2px 0 0; opacity: .85; }
  .ranked { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .ranked li { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ranked .num { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 600; font-size: .9rem; flex: none; }
</style>
