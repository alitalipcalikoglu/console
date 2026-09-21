<script>
  import Page from '$lib/components/Page.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorBox from '$lib/components/ErrorBox.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Time from '$lib/components/Time.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import Confirm from '$lib/components/Confirm.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import { api } from '$lib/client/api.js';
  import { Resource } from '$lib/client/resource.svelte.js';
  import { goto } from '$app/navigation';
  import { useSession } from '$lib/client/session.svelte.js';
  const session = useSession();
  import { t } from '$lib/client/i18n.svelte.js';
  import { toasts } from '$lib/client/toast.svelte.js';
  /** @type {{ sid: string, id: string }} */
  let { sid, id } = $props();
  const res = new Resource(() => api.get(`/services/${sid}/auth/users/${id}`));
  $effect(() => { res.load(); });
  const d = $derived(/** @type {any} */ (res.data));
  const u = $derived(d?.user);
  /** @type {null|'disable'|'delete'|'revokeAll'} */
  let confirm = $state(null);
  /** Session id awaiting revoke confirmation. @type {string|null} */
  let revoking = $state(null);
  let busy = $state(false);
  /** @param {() => Promise<unknown>} fn @param {string} ok */
  async function run(fn, ok, reload = true) {
    busy = true;
    try { await fn(); toasts.ok(ok); if (reload) await res.load(); } catch (e) { toasts.error(e); } finally { busy = false; confirm = null; revoking = null; }
  }
  const base = $derived(`/services/${sid}/auth/users/${id}`);
</script>

<Page title={u?.email ?? t('auth.users')} back="/auth/{sid}">
  {#snippet actions()}
    {#if u && session.isAdmin}
      <button class="btn" onclick={() => run(() => api.post(`${base}/resend-verification`, { email: u.email }), t('auth.sent'), false)} disabled={busy || u.emailVerified}><Icon name="mail" size={16} /> {t('auth.resend')}</button>
      <button class="btn" onclick={() => run(() => api.post(`${base}/password-reset-email`, { email: u.email }), t('auth.sent'), false)} disabled={busy}><Icon name="key" size={16} /> {t('auth.resetEmail')}</button>
      {#if u.status === 'active'}<button class="btn danger" onclick={() => { confirm = 'disable'; }} disabled={busy}><Icon name="lock" size={16} /> {t('auth.disable')}</button>
      {:else}<button class="btn" onclick={() => run(() => api.patch(base, { status: 'active' }), t('auth.updated'))} disabled={busy}><Icon name="unlock" size={16} /> {t('auth.enable')}</button>{/if}
      <button class="btn danger" onclick={() => { confirm = 'delete'; }} disabled={busy}><Icon name="trash" size={16} /> {t('common.delete')}</button>
    {/if}
    <button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}

  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !u}<Skeleton rows={8} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        <div class="row wrap" style="margin-bottom:14px">
          <StatusBadge status={u.lockedUntil ? 'locked' : u.status} label={u.lockedUntil ? t('auth.locked') : u.status} />
          {#if u.emailVerified}<span class="badge ok">{t('auth.verified')}</span>{:else}<span class="badge warn">{t('auth.unverified')}</span>{/if}
          <span class="mono xs muted">{u.id}</span><CopyButton text={u.id} />
        </div>
        <dl class="kv">
          <dt>{t('common.name')}</dt><dd>{u.name ?? '–'}</dd>
          <dt>{t('common.created')}</dt><dd><Time value={u.createdAt} mode="absolute" /></dd>
          <dt>{t('auth.passwordChanged')}</dt><dd><Time value={u.passwordChangedAt} /></dd>
          {#if u.emailVerifiedAt}<dt>{t('auth.verified')}</dt><dd><Time value={u.emailVerifiedAt} mode="absolute" /></dd>{/if}
          {#if u.lockedUntil}<dt>{t('auth.locked')}</dt><dd class="danger-text"><Time value={u.lockedUntil} /></dd>{/if}
        </dl>
      </div></div>

      <Panel flush>
        {#snippet head()}<h2 class="grow">{t('auth.sessions')} <span class="badge plain">{d.sessions.length}</span></h2>
          {#if d.sessions.length && session.isAdmin}<button class="btn sm danger" onclick={() => { confirm = 'revokeAll'; }}>{t('auth.revokeAll')}</button>{/if}{/snippet}
          {#if !d.sessions.length}<p class="small muted" style="text-align:center;padding:12px">{t('auth.noSessions')}</p>
          {:else}<div class="table-wrap"><table class="table">
            <thead><tr><th>{t('auth.device')}</th><th class="hide-m">{t('common.ip')}</th><th>{t('auth.lastSeen')}</th><th class="hide-m">{t('auth.expires')}</th><th></th></tr></thead>
            <tbody>{#each d.sessions as s (s.id)}<tr>
              <td class="truncate small" style="max-width:320px" title={s.userAgent ?? ''}>{s.userAgent ?? '–'}</td><td class="mono small hide-m">{s.ip ?? '–'}</td>
              <td><Time value={s.lastUsedAt} /></td><td class="hide-m"><Time value={s.expiresAt} /></td>
              <td>{#if session.isAdmin}<button class="btn sm danger" onclick={() => { revoking = s.id; }} disabled={busy}>{t('auth.revoke')}</button>{/if}</td>
            </tr>{/each}</tbody></table></div>{/if}
      </Panel>

      <Panel title={t('auth.events')} flush>
          {#if !d.events.length}<Empty icon="list" title={t('audit.emptyTitle')} />
          {:else}<div class="table-wrap"><table class="table">
            <thead><tr><th>{t('common.at')}</th><th>{t('audit.action')}</th><th class="hide-m">{t('common.ip')}</th><th class="hide-m">{t('common.details')}</th></tr></thead>
            <tbody>{#each d.events as e (e.id)}<tr>
              <td style="white-space:nowrap"><Time value={e.at} /></td>
              <td><code class="{/failed|locked|reuse/.test(e.type) ? 'danger-text' : ''}">{e.type}</code></td>
              <td class="mono small hide-m">{e.ip ?? '–'}</td>
              <td class="small muted mono hide-m">{e.meta ? JSON.stringify(e.meta) : ''}</td>
            </tr>{/each}</tbody></table></div>{/if}
      </Panel>
    </div>
  {/if}
</Page>

<Confirm open={revoking !== null} title={t('auth.revoke')} message={t('auth.revokeDesc')} danger confirmLabel={t('auth.revoke')} {busy} onconfirm={() => run(() => api.delete(`${base}/sessions/${revoking}`), t('auth.revoked'))} oncancel={() => { revoking = null; }} />
<Confirm open={confirm === 'disable'} title={t('auth.disable')} message={t('auth.disableDesc')} danger irreversible={false} confirmLabel={t('auth.disable')} {busy} onconfirm={() => run(() => api.patch(base, { status: 'disabled' }), t('auth.updated'))} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'revokeAll'} title={t('auth.revokeAll')} message={t('auth.revokeAllDesc')} danger confirmLabel={t('auth.revokeAll')} {busy} onconfirm={() => run(async () => { const r = /** @type {any} */ (await api.delete(`${base}/sessions`)); toasts.info(t('auth.revokedAll', { n: r.revoked })); }, t('auth.updated'))} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'delete'} title={t('auth.deleteUser')} message={t('auth.deleteDesc')} danger typeWord={u?.email ?? ''} confirmLabel={t('common.delete')} {busy} onconfirm={() => run(async () => { await api.delete(base); goto(`/auth/${sid}`); }, t('auth.userDeleted'), false)} oncancel={() => { confirm = null; }} />
