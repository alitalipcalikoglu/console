<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Time from '../../lib/components/Time.svelte';
  import Confirm from '../../lib/components/Confirm.svelte';
  import Switch from '../../lib/components/Switch.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import FlagForm from './FlagForm.svelte';
  import ValueInput from './ValueInput.svelte';
  import RuleEditor from './RuleEditor.svelte';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import { session } from '../../lib/session.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import { toasts } from '../../lib/toast.svelte.js';
  /** @type {{ sid: string, id: string }} */
  let { sid, id } = $props();
  const base = $derived(`/services/${sid}/flags/flags/${encodeURIComponent(id)}`);
  const res = new Resource(() => api.get(base));
  $effect(() => { res.load(); });
  const d = $derived(/** @type {any} */ (res.data));
  const f = $derived(d?.flag);
  const envNames = $derived(/** @type {string[]} */ (f ? Object.keys(f.environments) : []));
  const canEdit = $derived(session.isAdmin && f && !f.archived);
  /** Draft state per environment, edited locally and saved as one PATCH. @type {Record<string, any>} */
  let drafts = $state({});
  $effect(() => { if (f) drafts = Object.fromEntries(envNames.map((e) => [e, structuredClone(/** @type {any} */ ($state.snapshot(f.environments[e])))])); });
  const dirty = (/** @type {string} */ e) => JSON.stringify(drafts[e]) !== JSON.stringify(f?.environments[e]);
  /** @type {Record<string, boolean>} */ let busy = $state({});
  /** @param {string} e @param {() => Promise<unknown>} fn @param {string} ok */
  async function run(e, fn, ok) {
    busy = { ...busy, [e]: true };
    try { await fn(); toasts.ok(ok); await res.load(); } catch (err) { toasts.error(err); } finally { busy = { ...busy, [e]: false }; }
  }
  /** @param {string} e */
  const save = (e) => run(e, () => { const s = drafts[e]; return api.patch(`${base}/envs/${e}`, { enabled: s.enabled, value: s.value, offValue: s.offValue, percentage: s.percentage, rules: s.rules }); }, t('fl.saved', { env: e }));
  /** @param {string} e @param {boolean} next */
  const toggle = (e, next) => run(e, () => api.patch(`${base}/envs/${e}`, { enabled: next }), t(next ? 'fl.enabledIn' : 'fl.disabledIn', { key: id, env: e }));
  /** @param {string} from @param {string} to */
  const copy = (from, to) => run(to, () => api.post(`${base}/envs/${from}/copy`, { to }), t('fl.copied', { from, to }));
  let editOpen = $state(false);
  /** @type {'delete'|'archive'|'reshuffle'|null} */ let confirm = $state(null);
  /** @param {object} patch @param {string} ok */
  async function patchFlag(patch, ok) { await run('flag', () => api.patch(base, patch), ok); editOpen = false; confirm = null; }

  // Evaluate tester
  let evEnv = $state('');
  let evUser = $state('');
  let evEmail = $state('');
  let evAttrs = $state('');
  /** @type {any} */ let evResult = $state(null);
  let evBusy = $state(false);
  $effect(() => { if (!evEnv && envNames.length) evEnv = envNames.includes('prod') ? 'prod' : envNames[0]; });
  async function evaluate() {
    evBusy = true;
    try {
      /** @type {Record<string, string>} */ const attrs = {};
      for (const line of evAttrs.split('\n')) { const i = line.indexOf('='); if (i > 0) attrs[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
      const context = { ...(evUser.trim() ? { userId: evUser.trim() } : {}), ...(evEmail.trim() ? { email: evEmail.trim() } : {}), ...(Object.keys(attrs).length ? { attrs } : {}) };
      evResult = await api.post(`/services/${sid}/flags/evaluate`, { env: evEnv, context, keys: [id] });
    } catch (e) { toasts.error(e); } finally { evBusy = false; }
  }
  const REASON_TONE = /** @type {Record<string, string>} */ ({ rule: 'success', rollout: 'success', default: 'success', disabled: 'disabled', excluded: 'expired', missing: 'failure' });
  /** @param {any} h */
  const diff = (h) => { if (!h.before || !h.after) return ''; const keys = Object.keys(h.after).filter((k) => JSON.stringify(h.after[k]) !== JSON.stringify(h.before[k]) && k !== 'from'); return keys.join(', '); };
</script>

<Page title={f ? f.key : t('fl.flag')} back="/flags/{sid}">
  {#snippet actions()}
    {#if f && session.isAdmin}
      <button class="btn" onclick={() => { editOpen = true; }} disabled={busy.flag}><Icon name="settings" size={16} /><span class="hide-m"> {t('fl.edit')}</span></button>
      {#if f.archived}<button class="btn primary" onclick={() => patchFlag({ archived: false }, t('fl.unarchived'))} disabled={busy.flag}><Icon name="unlock" size={16} /><span class="hide-m"> {t('fl.unarchive')}</span></button>
      {:else}<button class="btn" onclick={() => { confirm = 'archive'; }} disabled={busy.flag}><Icon name="lock" size={16} /><span class="hide-m"> {t('fl.archive')}</span></button>{/if}
      <button class="btn danger" onclick={() => { confirm = 'delete'; }} disabled={busy.flag} aria-label={t('common.delete')}><Icon name="trash" size={16} /></button>
    {/if}
    <button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !f}<Skeleton rows={10} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        <div class="row wrap" style="margin-bottom:10px"><span class="badge plain">{f.kind}</span>{#if f.archived}<StatusBadge status="disabled" label={t('fl.archived')} />{/if}{#each f.tags as tg (tg)}<span class="badge plain">{tg}</span>{/each}</div>
        {#if f.description}<p style="margin-bottom:10px">{f.description}</p>{/if}
        <p class="xs faint" style="margin:0">{t('sl.createdBy')} <span class="mono">{f.createdBy}</span> · <Time value={f.createdAt} mode="absolute" /> · {t('common.updated')} <Time value={f.updatedAt} />{#if session.isAdmin && !f.archived} · <button class="linkish" onclick={() => { confirm = 'reshuffle'; }}>{t('fl.reshuffle')}</button>{/if}</p>
      </div></div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
        {#each envNames as e (e)}
          {@const s = drafts[e]}
          {@const live = f.environments[e]}
          {#if s}
            <Panel title={e} bodyClass="stack">
              {#snippet aside()}
                <span class="xs faint mono">v{live.version}</span>
                <Switch checked={live.enabled} disabled={!canEdit} busy={busy[e]} label="{e} {t('fl.enabledShort')}" onchange={(next) => toggle(e, next)} />
              {/snippet}
              <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px">
                <div class="field"><label for="{e}-value">{t('fl.value')}</label><ValueInput id="{e}-value" kind={f.kind} value={s.value} disabled={!canEdit} onchange={(v) => { drafts[e].value = v; }} /></div>
                <div class="field"><label for="{e}-off">{t('fl.offValue')}</label><ValueInput id="{e}-off" kind={f.kind} value={s.offValue} disabled={!canEdit} onchange={(v) => { drafts[e].offValue = v; }} /></div>
              </div>
              <div class="field"><label for="{e}-pct">{t('fl.percentage')}: <strong>{s.percentage}%</strong></label>
                <div class="row"><input id="{e}-pct" type="range" min="0" max="100" step="1" style="flex:1" bind:value={s.percentage} disabled={!canEdit} /><input class="input" style="width:72px" type="number" min="0" max="100" bind:value={s.percentage} disabled={!canEdit} aria-label={t('fl.percentage')} /></div>
                <span class="hint">{t('fl.percentageHint')}</span></div>
              <div class="field"><span class="small" style="font-weight:550;color:var(--text-2)">{t('fl.rules')}</span><RuleEditor kind={f.kind} rules={s.rules} disabled={!canEdit} defaultValue={s.value} onchange={(rules) => { drafts[e].rules = rules; }} /></div>
              {#if canEdit}
                <div class="row wrap">
                  <button class="btn primary" onclick={() => save(e)} disabled={busy[e] || !dirty(e)}><Icon name="check" size={14} /> {t('common.save')}</button>
                  {#if dirty(e)}<button class="btn ghost" onclick={() => { drafts[e] = structuredClone(/** @type {any} */ ($state.snapshot(live))); }}>{t('fl.discard')}</button>{/if}
                  <span class="grow"></span>
                  {#if envNames.length > 1}<select class="select" style="width:auto" aria-label={t('fl.copyTo')} disabled={busy[e]} onchange={(ev) => { const to = /** @type {HTMLSelectElement} */ (ev.currentTarget).value; if (to) copy(e, to); /** @type {HTMLSelectElement} */ (ev.currentTarget).value = ''; }}><option value="">{t('fl.copyTo')}…</option>{#each envNames.filter((x) => x !== e) as x (x)}<option value={x}>{x}</option>{/each}</select>{/if}
                </div>
              {/if}
              <p class="xs faint" style="margin:0">{t('common.updated')} <Time value={live.updatedAt} /> · <span class="mono">{live.updatedBy}</span></p>
            </Panel>
          {/if}
        {/each}
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
        <Panel title={t('fl.evaluate')} bodyClass="stack">
          <p class="small muted" style="margin:0">{t('fl.evaluateDesc')}</p>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
            <div class="field"><label for="ev-env">{t('fl.environment')}</label><select id="ev-env" class="select" bind:value={evEnv}>{#each envNames as e (e)}<option value={e}>{e}</option>{/each}</select></div>
            <div class="field"><label for="ev-user">{t('fl.userId')}</label><input id="ev-user" class="input mono" bind:value={evUser} placeholder="u_1001" /></div>
            <div class="field"><label for="ev-email">{t('common.email')}</label><input id="ev-email" class="input mono" bind:value={evEmail} placeholder="ada@example.com" /></div>
          </div>
          <div class="field"><label for="ev-attrs">{t('fl.attrs')} <span class="faint">(key=value)</span></label><textarea id="ev-attrs" class="textarea mono" rows="2" bind:value={evAttrs} placeholder="plan=pro"></textarea></div>
          <div><button class="btn primary" onclick={evaluate} disabled={evBusy || !evEnv}><Icon name="check" size={14} /> {t('fl.evaluate')}</button></div>
          {#if evResult}
            {@const r = evResult.flags[id]}
            <div class="row wrap"><StatusBadge status={REASON_TONE[r.reason] ?? ''} label={t(`fl.reason.${r.reason}`)} />{#if r.ruleId}<code>{r.ruleId}</code>{/if}<span class="xs faint">v{evResult.version}</span></div>
            <pre class="result">{JSON.stringify(r.value, null, 2)}</pre>
          {/if}
        </Panel>
        <Panel title={t('history.title')} flush>
          {#if !d.history.length}<p class="small faint" style="padding:16px;margin:0">–</p>{:else}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>{t('common.at')}</th><th>{t('audit.action')}</th><th>{t('fl.environment')}</th><th class="hide-m">{t('audit.actor')}</th><th class="hide-m">{t('fl.changed')}</th></tr></thead>
            <tbody>{#each d.history as h (h.id)}<tr><td style="white-space:nowrap"><Time value={h.at} /></td><td><code>{h.action}</code></td><td>{h.env ?? '–'}</td><td class="mono small hide-m">{h.actor}</td><td class="xs faint hide-m truncate" style="max-width:200px">{diff(h)}</td></tr>{/each}</tbody>
          </table></div>{/if}
        </Panel>
      </div>
    </div>
  {/if}
</Page>

<FlagForm open={editOpen} initial={f} busy={busy.flag} onsubmit={(body) => patchFlag(body, t('fl.updated'))} onclose={() => { editOpen = false; }} />
<Confirm open={confirm === 'archive'} title={t('fl.archive')} message={t('fl.archiveDesc')} confirmLabel={t('fl.archive')} busy={busy.flag} onconfirm={() => patchFlag({ archived: true }, t('fl.archived'))} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'reshuffle'} title={t('fl.reshuffle')} message={t('fl.reshuffleDesc')} confirmLabel={t('fl.reshuffle')} busy={busy.flag} onconfirm={() => patchFlag({ reshuffle: true }, t('fl.reshuffled'))} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'delete'} title={t('fl.delete')} message={t('fl.deleteDesc')} danger typeWord={f?.key} confirmLabel={t('common.delete')} busy={busy.flag} onconfirm={() => run('flag', async () => { await api.delete(base); router.go(`/flags/${sid}`); }, t('fl.deleted'))} oncancel={() => { confirm = null; }} />

<style>
  .result { margin: 0; padding: 10px 12px; background: var(--surface-2); border-radius: var(--radius-sm); font-family: var(--mono); font-size: .85rem; white-space: pre-wrap; word-break: break-word; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }
  .linkish:hover { text-decoration: underline; }
</style>
