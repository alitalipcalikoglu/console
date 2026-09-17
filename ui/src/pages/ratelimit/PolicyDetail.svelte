<script>
  /** One policy: windows, hourly decisions, overrides, top consumers and a subject lookup with reset. */
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Stat from '../../lib/components/Stat.svelte';
  import Bars from '../../lib/components/Bars.svelte';
  import RankedList from '../../lib/components/RankedList.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Time from '../../lib/components/Time.svelte';
  import Confirm from '../../lib/components/Confirm.svelte';
  import LoadMore from '../../lib/components/LoadMore.svelte';
  import RowMenu from '../../lib/components/RowMenu.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import PolicyForm from './PolicyForm.svelte';
  import OverrideForm from './OverrideForm.svelte';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import { session } from '../../lib/session.svelte.js';
  import { Fmt } from '../../lib/format.js';
  import { LimitRows } from '../../lib/limits.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  import { toasts } from '../../lib/toast.svelte.js';
  /** @type {{ sid: string, id: string }} */
  let { sid, id } = $props();
  const PAGE = 20;
  const fmt = $derived(new Fmt(i18n.lang));
  const base = $derived(`/services/${sid}/ratelimit/policies/${encodeURIComponent(id)}`);
  const res = new Resource(() => api.get(base));
  const x = $derived(/** @type {any} */ (res.data)?.policy);
  /** @param {{ window: number, limit: number }} l */
  const label = (l) => { const s = LimitRows.split(l.window); return `${fmt.int(l.limit)} / ${s.n} ${t(`rl.unit.${s.unit}`)}`; };
  const total = $derived(x ? x.last24h.allowed + x.last24h.denied : 0);
  const denyRate = $derived(total > 0 ? Math.round((x.last24h.denied / total) * 1000) / 10 : null);

  // ---- hourly decisions
  let hours = $state(Number(router.query.get('h') ?? 24));
  const stats = new Resource(() => api.get(`${base}/stats?hours=${hours}`));
  const series = $derived(/** @type {{ hour: string, allowed: number, denied: number }[]} */ (/** @type {any} */ (stats.data)?.series ?? []));
  const hourTitle = (/** @type {{ hour: string, allowed: number, denied: number }} */ h) => `${fmt.dateTime(h.hour)}: ${fmt.int(h.allowed)} ${t('rl.allowedShort')}, ${fmt.int(h.denied)} ${t('rl.deniedShort')}`;

  // ---- overrides
  /** @type {any[]} */ let overrides = $state([]);
  let ovTotal = $state(0);
  let ovLoading = $state(false);
  /** @type {unknown} */ let ovError = $state(null);
  /** @param {number} offset */
  async function loadOverrides(offset = 0) {
    ovLoading = true;
    try { const r = /** @type {any} */ (await api.get(`${base}/overrides?limit=${PAGE}&offset=${offset}`)); overrides = offset ? [...overrides, ...r.items] : r.items; ovTotal = r.total; ovError = null; }
    catch (e) { ovError = e; } finally { ovLoading = false; }
  }

  // ---- top subjects
  /** @type {number|null} */ let topWindow = $state(null);
  const top = new Resource(() => api.get(`${base}/top?limit=10${topWindow ? `&window=${topWindow}` : ''}`));
  const topItems = $derived(/** @type {{ subject: string, used: number }[]} */ (/** @type {any} */ (top.data)?.items ?? []));

  // ---- subject lookup
  let lookupInput = $state(router.query.get('s') ?? '');
  let subject = $state(router.query.get('s') ?? '');
  const usage = new Resource(() => api.get(`${base}/subjects/${encodeURIComponent(subject)}`));
  const u = $derived(/** @type {any} */ (usage.data));
  function lookup() { const s = lookupInput.trim(); if (!s) return; subject = s; router.setQuery({ s }); usage.load(); }
  /** @param {string} s */
  function pick(s) { lookupInput = s; lookup(); }

  $effect(() => { res.load(); loadOverrides(0); top.load(); });
  $effect(() => { hours; router.setQuery({ h: hours === 24 ? null : String(hours) }); stats.load(); });
  $effect(() => { if (subject) usage.load(); });
  const reloadAll = () => { res.load(); stats.load(); loadOverrides(0); top.load(); if (subject) usage.load(); };

  // ---- actions
  /** @type {'delete'|'deleteOverride'|'reset'|null} */ let confirm = $state(null);
  /** @type {any} */ let target = $state(null);
  let busy = $state(false);
  /** @param {() => Promise<unknown>} fn @param {string|null} ok */
  async function run(fn, ok) {
    busy = true;
    try { await fn(); if (ok) toasts.ok(ok); confirm = null; target = null; } catch (err) { toasts.error(err); } finally { busy = false; }
  }
  let editOpen = $state(false);
  /** @param {Record<string, unknown>} patch */
  async function save(patch) {
    if (!Object.keys(patch).length) { toasts.info(t('rl.noChanges')); editOpen = false; return; }
    await run(async () => { await api.patch(base, patch); await res.load(); }, t('rl.updated'));
    editOpen = false;
  }
  let ovOpen = $state(false);
  /** @type {any} */ let ovInitial = $state(null);
  let ovSubject = $state('');
  /** @param {string} s @param {any} body */
  async function saveOverride(s, body) {
    await run(async () => { await api.put(`${base}/overrides/${encodeURIComponent(s)}`, body); await Promise.all([res.load(), loadOverrides(0)]); if (subject === s) usage.load(); }, t('rl.overrideSaved'));
    ovOpen = false;
  }
  const deleteOverride = () => run(async () => { await api.delete(`${base}/overrides/${encodeURIComponent(target.subject)}`); await Promise.all([res.load(), loadOverrides(0)]); if (subject === target.subject) usage.load(); }, t('rl.overrideDeleted'));
  const resetSubject = () => run(async () => { const r = /** @type {any} */ (await api.delete(`${base}/subjects/${encodeURIComponent(subject)}/usage`)); toasts.ok(t('rl.resetDone', { n: r.removed })); await Promise.all([usage.load(), top.load(), res.load()]); }, null);
</script>

<Page title={x ? x.name : t('rl.policy')} back="/ratelimit/{sid}">
  {#snippet actions()}
    {#if x && session.isAdmin}
      <button class="btn" onclick={() => { editOpen = true; }} disabled={busy}><Icon name="settings" size={16} /><span class="hide-m"> {t('rl.edit')}</span></button>
      <button class="btn" onclick={() => { ovInitial = null; ovSubject = subject; ovOpen = true; }} disabled={busy}><Icon name="plus" size={16} /><span class="hide-m"> {t('rl.addOverride')}</span></button>
      <RowMenu label={t('common.actions')} items={[{ label: t('rl.delete'), icon: 'trash', danger: true, run: () => { confirm = 'delete'; } }]} />
    {/if}
    <button class="btn icon" onclick={reloadAll} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !x}<Skeleton rows={8} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        {#if x.description}<p style="margin-bottom:10px">{x.description}</p>{/if}
        <div class="row wrap" style="gap:6px;margin-bottom:8px">{#each x.limits as l (l.window)}<span class="badge plain mono">{label(l)}</span>{/each}</div>
        <p class="xs faint" style="margin:0">{t('rl.createdBy')} <span class="mono">{x.createdBy}</span> · <Time value={x.createdAt} mode="absolute" /> · {t('common.updated').toLowerCase()} <Time value={x.updatedAt} /></p>
      </div></div>

      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
        <Stat label={t('rl.allowed24h')} value={fmt.int(x.last24h.allowed)} />
        <Stat label={t('rl.denied24h')} value={fmt.int(x.last24h.denied)} tone={x.last24h.denied ? 'warn' : ''} sub={denyRate === null ? undefined : t('rl.denyRate', { p: denyRate })} />
        <Stat label={t('rl.activeSubjects')} value={fmt.int(x.activeSubjects)} />
        <Stat label={t('rl.overrides')} value={fmt.int(x.overrides)} />
      </div>

      <Panel title={t('rl.decisions')}>
        {#snippet aside()}<div class="seg" role="group">{#each [24, 72, 168] as h (h)}<button aria-pressed={hours === h} onclick={() => { hours = h; }}>{t(`rl.hours.${h}`)}</button>{/each}</div>{/snippet}
        {#if stats.error}<ErrorBox error={stats.error} onretry={() => stats.load()} />
        {:else if !stats.loaded}<Skeleton rows={2} />
        {:else}
          <div class="stack" style="gap:6px">
            <div class="row" style="gap:10px"><span class="xs faint" style="width:64px;flex:none">{t('rl.allowedShort')}</span><div class="grow" style="min-width:0"><Bars items={series.map((h) => ({ value: h.allowed, title: hourTitle(h) }))} height={40} label={t('rl.allowedShort')} /></div></div>
            <div class="row" style="gap:10px"><span class="xs faint" style="width:64px;flex:none">{t('rl.deniedShort')}</span><div class="grow" style="min-width:0"><Bars items={series.map((h) => ({ value: h.denied, title: hourTitle(h), tone: h.denied ? 'danger' : '' }))} height={40} label={t('rl.deniedShort')} /></div></div>
            <div class="row" style="justify-content:space-between"><span class="xs faint">{series.length ? fmt.dateTime(series[0].hour) : ''}</span><span class="xs faint">{fmt.int(/** @type {any} */ (stats.data).allowed)} {t('rl.allowedShort')} · {fmt.int(/** @type {any} */ (stats.data).denied)} {t('rl.deniedShort')}</span></div>
          </div>
        {/if}
      </Panel>

      <div class="layout two">
        <div class="stack">
          <Panel title={t('rl.lookup')} bodyClass="stack">
            <form class="row" style="gap:8px" onsubmit={(e) => { e.preventDefault(); lookup(); }}>
              <input class="input grow mono" bind:value={lookupInput} placeholder={t('rl.subjectPlaceholder')} aria-label={t('rl.subject')} maxlength="200" />
              <button type="submit" class="btn" disabled={!lookupInput.trim()}><Icon name="search" size={16} /><span class="hide-m"> {t('rl.lookupBtn')}</span></button>
            </form>
            {#if subject}
              {#if usage.error}<ErrorBox error={usage.error} onretry={() => usage.load()} />
              {:else if !u || u.usage.subject !== subject}<Skeleton rows={3} />
              {:else}
                <div class="row wrap" style="gap:6px"><span class="mono truncate" style="max-width:100%">{u.usage.subject}</span>{#if u.usage.blocked}<StatusBadge status="blocked" label={t('rl.blocked')} />{:else if u.usage.source === 'override'}<StatusBadge status="override" label={t('rl.overrideBadge')} />{/if}</div>
                <ul class="usage">
                  {#each u.usage.limits as l (l.window)}
                    <li><span class="mono">{label(l)}</span><span class="grow"></span><span class="num {l.remaining === 0 ? 'warn-text' : ''}">{fmt.int(l.remaining)}</span><span class="xs faint" style="flex-basis:100%">{t('rl.used').toLowerCase()} {fmt.int(Math.round(l.used))} · {t('rl.resets').toLowerCase()} <Time value={l.resetAt} /></span></li>
                  {/each}
                </ul>
                {#if u.override}<p class="xs faint" style="margin:0">{t('rl.hasOverride')}{#if u.override.note}: {u.override.note}{/if}{#if u.override.expired} · {t('rl.expired')}{/if}</p>{/if}
                {#if session.isAdmin}
                  <div class="row wrap" style="gap:8px">
                    <button class="btn sm" onclick={() => { ovInitial = u.override; ovSubject = subject; ovOpen = true; }} disabled={busy}><Icon name={u.override ? 'settings' : 'plus'} size={14} /> {u.override ? t('rl.editOverride') : t('rl.addOverride')}</button>
                    <button class="btn sm danger" onclick={() => { confirm = 'reset'; }} disabled={busy}><Icon name="history" size={14} /> {t('rl.reset')}</button>
                  </div>
                {/if}
              {/if}
            {:else}<p class="small faint" style="margin:0">{t('rl.lookupHint')}</p>{/if}
          </Panel>

          <Panel title={t('rl.top')}>
            {#snippet aside()}{#if x.limits.length > 1}<div class="seg" role="group">{#each x.limits as l (l.window)}<button aria-pressed={(topWindow ?? x.limits[0].window) === l.window} onclick={() => { topWindow = l.window; top.load(); }}>{LimitRows.split(l.window).n}{t(`rl.unit.${LimitRows.split(l.window).unit}`)}</button>{/each}</div>{/if}{/snippet}
            {#if top.error}<ErrorBox error={top.error} onretry={() => top.load()} />
            {:else if !top.loaded}<Skeleton rows={3} />
            {:else}<RankedList items={topItems.map((it) => ({ id: it.subject, label: it.subject, mono: true, value: fmt.int(Math.round(it.used)), onclick: () => pick(it.subject), active: it.subject === subject }))} empty={t('rl.noTraffic')} />{/if}
          </Panel>
        </div>

        <Panel title={ovTotal ? t('rl.overrideCount', { n: fmt.int(ovTotal) }) : t('rl.overrides')} flush>
          {#if ovError}<ErrorBox error={ovError} onretry={() => loadOverrides(0)} />
          {:else if ovLoading && !overrides.length}<Skeleton rows={3} />
          {:else if !overrides.length}<Empty icon="user" title={t('rl.noOverrides')} desc={t('rl.noOverridesDesc')} />
          {:else}
            <div class="table-wrap"><table class="table">
              <thead><tr><th>{t('rl.subject')}</th><th>{t('rl.limits')}</th><th class="hide-m">{t('rl.expiresAt')}</th>{#if session.isAdmin}<th></th>{/if}</tr></thead>
              <tbody>
                {#each overrides as o (o.subject)}
                  <tr>
                    <td><button class="linkish mono truncate" style="max-width:180px" onclick={() => pick(o.subject)} title={o.subject}>{o.subject}</button>{#if o.note}<div class="xs faint truncate" style="max-width:180px">{o.note}</div>{/if}</td>
                    <td>{#if o.blocked}<StatusBadge status="blocked" label={t('rl.blocked')} />{:else}<span class="row wrap" style="gap:4px">{#each o.limits as l (l.window)}<span class="badge plain mono">{label(l)}</span>{/each}</span>{/if}</td>
                    <td class="hide-m" style="white-space:nowrap">{#if o.expiresAt}<Time value={o.expiresAt} />{#if o.expired} <span class="xs warn-text">{t('rl.expired')}</span>{/if}{:else}<span class="faint">–</span>{/if}</td>
                    {#if session.isAdmin}<td style="text-align:right"><RowMenu label={t('common.actions')} items={[
                      { label: t('rl.editOverride'), icon: 'settings', run: () => { ovInitial = o; ovSubject = o.subject; ovOpen = true; } },
                      { label: t('rl.deleteOverride'), icon: 'trash', danger: true, run: () => { target = o; confirm = 'deleteOverride'; } },
                    ]} /></td>{/if}
                  </tr>
                {/each}
              </tbody>
            </table></div>
            <LoadMore cursor={overrides.length < ovTotal ? String(overrides.length) : null} busy={ovLoading} onmore={() => loadOverrides(overrides.length)} />
          {/if}
        </Panel>
      </div>
    </div>
  {/if}
</Page>

<PolicyForm open={editOpen} initial={x} busy={busy} onsubmit={save} onclose={() => { editOpen = false; }} />
<OverrideForm open={ovOpen} subject={ovSubject} initial={ovInitial} policyLimits={x?.limits ?? []} busy={busy} onsubmit={saveOverride} onclose={() => { ovOpen = false; }} />
<Confirm open={confirm === 'reset'} title={t('rl.reset')} message={t('rl.resetDesc', { s: subject })} danger irreversible={false} confirmLabel={t('rl.reset')} busy={busy} onconfirm={resetSubject} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'deleteOverride'} title={t('rl.deleteOverride')} message={t('rl.deleteOverrideDesc', { s: target?.subject ?? '' })} danger confirmLabel={t('common.delete')} busy={busy} onconfirm={deleteOverride} oncancel={() => { confirm = null; target = null; }} />
<Confirm open={confirm === 'delete'} title={t('rl.delete')} message={t('rl.deleteDesc')} danger typeWord={x?.name} confirmLabel={t('common.delete')} busy={busy} onconfirm={() => run(async () => { await api.delete(base); router.go(`/ratelimit/${sid}`); }, t('rl.deleted'))} oncancel={() => { confirm = null; }} />

<style>
  .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (min-width: 1101px) { .layout.two { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); } }
  .usage { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: .9rem; }
  .usage li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
  .usage .num { font-variant-numeric: tabular-nums; font-weight: 600; }
  .linkish { background: none; border: 0; padding: 0; color: inherit; cursor: pointer; text-align: left; font: inherit; display: block; }
  .linkish:hover { text-decoration: underline; }
</style>
