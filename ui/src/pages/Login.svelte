<script>
  import Icon from '../lib/components/Icon.svelte';
  import { session } from '../lib/session.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { t, i18n } from '../lib/i18n.svelte.js';
  let email = $state('');
  let password = $state('');
  let code = $state('');
  let busy = $state(false);
  /** @type {string|null} */
  let error = $state(null);
  $effect(() => { document.title = `${t('login.title')} · Console`; document.getElementById(session.totpPending ? 'code' : 'email')?.focus(); });

  /** @param {SubmitEvent} e */
  async function submit(e) {
    e.preventDefault();
    busy = true; error = null;
    try {
      const r = await session.login(email.trim(), password);
      if (!r.totpRequired) router.go('/', { replace: true });
    } catch (err) {
      const x = /** @type {{ code?: string, message?: string, details?: { retryAfterSec?: number } }} */ (err);
      error = x.code === 'ACCOUNT_LOCKED' ? t('login.locked', { s: x.details?.retryAfterSec ?? 900 }) : (x.message ?? t('common.error'));
    } finally { busy = false; }
  }
  /** @param {SubmitEvent} e */
  async function submitTotp(e) {
    e.preventDefault();
    busy = true; error = null;
    try { await session.completeTotp(code.trim()); router.go('/', { replace: true }); }
    catch (err) { error = /** @type {{ message?: string }} */ (err).message ?? t('common.error'); code = ''; }
    finally { busy = false; }
  }
</script>

<div class="login-wrap">
  <form class="card login" onsubmit={session.totpPending ? submitTotp : submit}>
    <div class="row" style="margin-bottom:18px"><img src="/icons/icon.svg" alt="" width="36" height="36" style="border-radius:10px" /><div><h1 style="font-size:1.2rem">{session.totpPending ? t('login.totpTitle') : t('login.title')}</h1><p class="small muted">{session.totpPending ? t('login.totpSubtitle') : t('login.subtitle')}</p></div></div>
    {#if session.totpPending}
      <div class="field"><label for="code">{t('login.code')}</label><input id="code" class="input mono" style="letter-spacing:.3em;font-size:1.3rem;text-align:center" inputmode="numeric" pattern={'[0-9]{6}'} maxlength="6" autocomplete="one-time-code" bind:value={code} required /></div>
    {:else}
      <div class="field"><label for="email">{t('common.email')}</label><input id="email" class="input" type="email" autocomplete="username" bind:value={email} required /></div>
      <div class="field"><label for="password">{t('common.password')}</label><input id="password" class="input" type="password" autocomplete="current-password" bind:value={password} required /></div>
    {/if}
    {#if error}<p class="small danger-text" role="alert">{error}</p>{/if}
    <button class="btn primary" type="submit" disabled={busy} style="min-height:42px">{busy ? t('common.loading') : session.totpPending ? t('login.totpSubmit') : t('login.submit')}</button>
    {#if session.totpPending}<button type="button" class="btn ghost sm" onclick={() => session.logout()}>{t('login.backToLogin')}</button>{/if}
    <div class="row xs faint" style="justify-content:center;margin-top:8px">
      <button type="button" class="btn ghost sm" onclick={() => i18n.set(i18n.lang === 'tr' ? 'en' : 'tr')}><Icon name="globe" size={12} /> {i18n.lang === 'tr' ? 'English' : 'Türkçe'}</button>
    </div>
  </form>
</div>

<style>
  .login-wrap { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
  .login { width: min(400px, 100%); padding: 26px; display: flex; flex-direction: column; gap: 14px; }
</style>
