<script>
  import Page from '../lib/components/Page.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Time from '../lib/components/Time.svelte';
  import CopyButton from '../lib/components/CopyButton.svelte';
  import Dialog from '../lib/components/Dialog.svelte';
  import { api } from '../lib/api.js';
  import { Resource } from '../lib/resource.svelte.js';
  import { session } from '../lib/session.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { theme } from '../lib/theme.svelte.js';
  import { i18n, t } from '../lib/i18n.svelte.js';
  import { toasts } from '../lib/toast.svelte.js';
  import { QrCode } from '../lib/qr.js';
  const sessions = new Resource(() => api.get('/me/sessions'));
  $effect(() => { sessions.load(); });
  let busy = $state(false);
  let cur = $state(''); let next = $state('');
  /** @type {{ secret: string, uri: string, svg: string }|null} */ let enrol = $state(null);
  let code = $state('');
  let disableOpen = $state(false); let dPassword = $state(''); let dCode = $state('');
  /** @param {SubmitEvent} e */
  async function changePassword(e) {
    e.preventDefault(); busy = true;
    try { await api.post('/me/password', { currentPassword: cur, newPassword: next }); toasts.ok(t('account.passwordChanged')); cur = next = ''; sessions.load(); } catch (err) { toasts.error(err); } finally { busy = false; }
  }
  async function startTotp() {
    busy = true;
    try { const r = /** @type {{ secret: string, uri: string }} */ (await api.post('/me/totp/start')); enrol = { ...r, svg: new QrCode(r.uri).toSvg({ margin: 2 }) }; code = ''; } catch (err) { toasts.error(err); } finally { busy = false; }
  }
  /** @param {SubmitEvent} e */
  async function confirmTotp(e) {
    e.preventDefault(); busy = true;
    try { await api.post('/me/totp/confirm', { code: code.trim() }); toasts.ok(t('account.totpEnabled')); enrol = null; await session.refresh(); } catch (err) { toasts.error(err); code = ''; } finally { busy = false; }
  }
  async function disableTotp() {
    busy = true;
    try { await api.post('/me/totp/disable', { password: dPassword, code: dCode.trim() }); toasts.ok(t('account.totpDisabled')); disableOpen = false; dPassword = dCode = ''; await session.refresh(); } catch (err) { toasts.error(err); } finally { busy = false; }
  }
  async function logoutOthers() { busy = true; try { const r = /** @type {{ revoked: number }} */ (await api.post('/me/sessions/logout-others')); toasts.ok(t('account.loggedOutOthers', { n: r.revoked })); sessions.load(); } catch (err) { toasts.error(err); } finally { busy = false; } }
  const items = $derived(/** @type {any} */ (sessions.data)?.items ?? []);
  const MODES = /** @type {const} */ (['system', 'light', 'dark']);
</script>

<Page title={t('account.title')} desc={t('account.desc')}>
  {#snippet actions()}<button class="btn" onclick={() => session.logout().then(() => router.go('/login'))}><Icon name="logout" size={16} /> {t('account.logout')}</button>{/snippet}
  <div class="two">
    <div class="stack">
      <div class="card"><div class="card-body">
        <div class="row" style="margin-bottom:12px"><div class="avatar">{session.admin?.email.slice(0, 1).toUpperCase()}</div><div><div style="font-weight:650">{session.admin?.name}</div><div class="small muted mono">{session.admin?.email}</div></div><span class="grow"></span><span class="badge {session.isAdmin ? 'info' : ''}">{t(`admins.${session.admin?.role}`)}</span></div>
        <div class="row wrap" style="gap:16px">
          <div class="field"><span class="small" style="font-weight:550;color:var(--text-2)">{t('account.theme')}</span><div class="seg">{#each MODES as m (m)}<button aria-pressed={theme.mode === m} onclick={() => theme.set(m)}>{t(`account.theme${m[0].toUpperCase()}${m.slice(1)}`)}</button>{/each}</div></div>
          <div class="field"><span class="small" style="font-weight:550;color:var(--text-2)">{t('account.language')}</span><div class="seg"><button aria-pressed={i18n.lang === 'tr'} onclick={() => i18n.set('tr')}>Türkçe</button><button aria-pressed={i18n.lang === 'en'} onclick={() => i18n.set('en')}>English</button></div></div>
        </div>
      </div></div>

      <form class="card" onsubmit={changePassword}><div class="card-head"><h2>{t('account.password')}</h2></div><div class="card-body stack">
        <div class="field"><label for="cp">{t('account.current')}</label><input id="cp" class="input" type="password" autocomplete="current-password" bind:value={cur} required /></div>
        <div class="field"><label for="np">{t('account.new')}</label><input id="np" class="input" type="password" autocomplete="new-password" bind:value={next} required minlength="12" /><span class="hint">{t('account.newHint')}</span></div>
        <div><button class="btn primary" type="submit" disabled={busy || !cur || next.length < 12}>{t('common.save')}</button></div>
      </div></form>
    </div>

    <div class="stack">
      <div class="card"><div class="card-head"><h2>{t('account.totp')}</h2><span class="badge {session.admin?.totpEnabled ? 'ok' : 'warn'}">{session.admin?.totpEnabled ? t('account.totpOn') : t('account.totpOff')}</span></div><div class="card-body stack">
        <p class="small muted">{t('account.totpDesc')}</p>
        {#if session.admin?.totpEnabled}
          <div><button class="btn danger" onclick={() => { disableOpen = true; }}>{t('account.disableTotp')}</button></div>
        {:else if enrol}
          <form class="stack" onsubmit={confirmTotp}>
            <p class="small">{t('account.scan')}</p>
            <div class="qr">{@html enrol.svg}</div>
            <div class="row wrap small"><span class="muted">{t('account.secret')}:</span><code style="word-break:break-all">{enrol.secret}</code><CopyButton text={enrol.secret} /></div>
            <div class="field"><label for="tc">{t('login.code')}</label><input id="tc" class="input mono" inputmode="numeric" pattern={'[0-9]{6}'} maxlength="6" autocomplete="one-time-code" bind:value={code} required /></div>
            <div class="row"><button class="btn primary" type="submit" disabled={busy || code.length !== 6}>{t('account.enableTotp')}</button><button class="btn ghost" type="button" onclick={() => { enrol = null; }}>{t('common.cancel')}</button></div>
          </form>
        {:else}
          <div><button class="btn primary" onclick={startTotp} disabled={busy}><Icon name="shield" size={16} /> {t('account.enableTotp')}</button></div>
        {/if}
      </div></div>

      <div class="card flush"><div class="card-head"><h2>{t('account.sessions')}</h2>{#if items.length > 1}<button class="btn sm" onclick={logoutOthers} disabled={busy}>{t('account.logoutOthers')}</button>{/if}</div><div class="card-body"><div class="table-wrap"><table class="table">
        <thead><tr><th>{t('auth.device')}</th><th>{t('common.ip')}</th><th>{t('auth.lastSeen')}</th></tr></thead>
        <tbody>{#each items as s (s.id)}<tr><td class="small truncate" style="max-width:260px">{s.userAgent ?? '–'}{#if s.current} <span class="badge ok plain">{t('account.thisDevice')}</span>{/if}</td><td class="mono small">{s.ip ?? '–'}</td><td><Time value={s.lastSeenAt} /></td></tr>{/each}</tbody>
      </table></div></div></div>
    </div>
  </div>
</Page>

<Dialog open={disableOpen} title={t('account.disableTotp')} onclose={() => { disableOpen = false; }}>
  <p class="small muted" style="margin-bottom:12px">{t('account.disableTotpDesc')}</p>
  <div class="stack">
    <div class="field"><label for="dp">{t('common.password')}</label><input id="dp" class="input" type="password" autocomplete="current-password" bind:value={dPassword} /></div>
    <div class="field"><label for="dc">{t('login.code')}</label><input id="dc" class="input mono" inputmode="numeric" maxlength="6" bind:value={dCode} /></div>
  </div>
  {#snippet footer()}<button class="btn" onclick={() => { disableOpen = false; }}>{t('common.cancel')}</button><button class="btn danger solid" onclick={disableTotp} disabled={busy || !dPassword || dCode.length !== 6}>{t('account.disableTotp')}</button>{/snippet}
</Dialog>

<style>
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
  .avatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-weight: 700; }
  .qr { width: 200px; background: #fff; padding: 8px; border-radius: 8px; }
  .qr :global(svg) { display: block; width: 100%; height: auto; }
</style>
