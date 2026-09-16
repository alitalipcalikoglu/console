<script>
  import Page from '../lib/components/Page.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import ErrorBox from '../lib/components/ErrorBox.svelte';
  import StatusBadge from '../lib/components/StatusBadge.svelte';
  import Time from '../lib/components/Time.svelte';
  import Dialog from '../lib/components/Dialog.svelte';
  import Confirm from '../lib/components/Confirm.svelte';
  import { api } from '../lib/api.js';
  import { Resource } from '../lib/resource.svelte.js';
  import { session } from '../lib/session.svelte.js';
  import { t } from '../lib/i18n.svelte.js';
  import { toasts } from '../lib/toast.svelte.js';
  const list = new Resource(() => api.get('/admins'));
  $effect(() => { list.load(); });
  const items = $derived(/** @type {any} */ (list.data)?.items ?? []);
  let busy = $state(false);
  /** @type {null|'create'|'password'} */ let dialog = $state(null);
  /** @type {any|null} */ let target = $state(null);
  /** @type {any|null} */ let deleting = $state(null);
  let fEmail = $state(''); let fName = $state(''); let fPassword = $state(''); /** @type {'admin'|'viewer'} */ let fRole = $state('viewer');
  /** @param {() => Promise<unknown>} fn @param {string} ok */
  async function run(fn, ok) { busy = true; try { await fn(); toasts.ok(ok); await list.load(); dialog = null; deleting = null; } catch (e) { toasts.error(e); } finally { busy = false; } }
  function openCreate() { fEmail = fName = fPassword = ''; fRole = 'viewer'; dialog = 'create'; }
</script>

<Page title={t('admins.title')} desc={t('admins.desc')}>
  {#snippet actions()}<button class="btn primary" onclick={openCreate}><Icon name="plus" size={16} /> {t('admins.create')}</button>{/snippet}
  <div class="card flush"><div class="card-body">
    {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
    {:else if !list.loaded}<Skeleton rows={4} />
    {:else}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>{t('common.email')}</th><th>{t('common.name')}</th><th>{t('common.role')}</th><th>{t('common.status')}</th><th>{t('admins.totp')}</th><th>{t('admins.lastLogin')}</th><th></th></tr></thead>
        <tbody>{#each items as a (a.id)}
          {@const me = a.id === session.admin?.id}
          <tr>
            <td class="mono small">{a.email}{#if me} <span class="badge plain">{t('admins.you')}</span>{/if}</td><td>{a.name}</td>
            <td><StatusBadge status={a.role} label={t(`admins.${a.role}`)} /></td>
            <td><StatusBadge status={a.lockedUntil ? 'locked' : a.status} label={a.lockedUntil ? t('auth.locked') : a.status} /></td>
            <td>{#if a.totpEnabled}<span class="badge ok">{t('account.totpOn')}</span>{:else}<span class="badge">{t('account.totpOff')}</span>{/if}</td>
            <td><Time value={a.lastLoginAt} /></td>
            <td><div class="row" style="justify-content:flex-end">
              {#if !me}
                <button class="btn sm" onclick={() => run(() => api.patch(`/admins/${a.id}`, { role: a.role === 'admin' ? 'viewer' : 'admin' }), t('admins.updated'))} disabled={busy}>{a.role === 'admin' ? t('admins.viewer') : t('admins.admin')}</button>
                <button class="btn sm" onclick={() => run(() => api.patch(`/admins/${a.id}`, { status: a.status === 'active' ? 'disabled' : 'active' }), t('admins.updated'))} disabled={busy}>{a.status === 'active' ? t('admins.disable') : t('admins.enable')}</button>
                {#if a.lockedUntil}<button class="btn sm" onclick={() => run(() => api.post(`/admins/${a.id}/unlock`), t('admins.unlocked'))} disabled={busy}><Icon name="unlock" size={14} /> {t('admins.unlock')}</button>{/if}
                <button class="btn sm" onclick={() => { target = a; fPassword = ''; dialog = 'password'; }} disabled={busy}><Icon name="key" size={14} /> {t('admins.resetPassword')}</button>
                <button class="btn sm danger icon" onclick={() => { deleting = a; }} disabled={busy} aria-label={t('admins.delete')}><Icon name="trash" size={14} /></button>
              {/if}
            </div></td>
          </tr>
        {/each}</tbody>
      </table></div>
    {/if}
  </div></div>
</Page>

<Dialog open={dialog === 'create'} title={t('admins.create')} onclose={() => { dialog = null; }}>
  <div class="stack">
    <div class="field"><label for="ae">{t('common.email')}</label><input id="ae" class="input" type="email" bind:value={fEmail} required /></div>
    <div class="field"><label for="an">{t('common.name')} <span class="faint">({t('common.optional')})</span></label><input id="an" class="input" bind:value={fName} /></div>
    <div class="field"><label for="ap">{t('common.password')}</label><input id="ap" class="input" type="password" autocomplete="new-password" bind:value={fPassword} /><span class="hint">{t('account.newHint')}</span></div>
    <div class="field"><span class="small" style="font-weight:550;color:var(--text-2)">{t('common.role')}</span>
      <div class="row wrap">
        <label class="checkbox"><input type="radio" name="role" value="viewer" bind:group={fRole} /> <span><strong>{t('admins.viewer')}</strong> <span class="muted small">— {t('admins.viewerDesc')}</span></span></label>
        <label class="checkbox"><input type="radio" name="role" value="admin" bind:group={fRole} /> <span><strong>{t('admins.admin')}</strong> <span class="muted small">— {t('admins.adminDesc')}</span></span></label>
      </div></div>
  </div>
  {#snippet footer()}<button class="btn" onclick={() => { dialog = null; }}>{t('common.cancel')}</button><button class="btn primary" disabled={busy || !fEmail || !fPassword} onclick={() => run(() => api.post('/admins', { email: fEmail.trim(), name: fName.trim(), password: fPassword, role: fRole }), t('admins.created'))}>{t('admins.create')}</button>{/snippet}
</Dialog>
<Dialog open={dialog === 'password'} title="{t('admins.resetPassword')} · {target?.email ?? ''}" onclose={() => { dialog = null; }}>
  <p class="small muted" style="margin-bottom:12px">{t('admins.resetDesc')}</p>
  <div class="field"><label for="rp">{t('account.new')}</label><input id="rp" class="input" type="password" autocomplete="new-password" bind:value={fPassword} /><span class="hint">{t('account.newHint')}</span></div>
  {#snippet footer()}<button class="btn" onclick={() => { dialog = null; }}>{t('common.cancel')}</button><button class="btn primary" disabled={busy || fPassword.length < 12} onclick={() => run(() => api.post(`/admins/${target.id}/password`, { password: fPassword }), t('admins.passwordSet'))}>{t('common.save')}</button>{/snippet}
</Dialog>
<Confirm open={deleting !== null} title={t('admins.delete')} message="{deleting?.email ?? ''}: {t('admins.deleteDesc')}" danger typeWord={deleting?.email ?? ''} confirmLabel={t('common.delete')} {busy} onconfirm={() => run(() => api.delete(`/admins/${deleting.id}`), t('admins.deleted'))} oncancel={() => { deleting = null; }} />
