<script>
  /** Application frame: side navigation on desktop, bottom tabs on mobile, header with theme and account. */
  import Icon from './Icon.svelte';
  import { router } from '../router.svelte.js';
  import { session } from '../session.svelte.js';
  import { services } from '../services.svelte.js';
  import { theme } from '../theme.svelte.js';
  import { pwa } from '../pwa.svelte.js';
  import { t } from '../i18n.svelte.js';
  /** @type {{ children: import('svelte').Snippet }} */
  let { children } = $props();
  /** @type {Record<string, string>} */
  const ICONS = { notify: 'bell', auth: 'users', media: 'image', gateway: 'route' };
  const current = $derived(router.path);
  /** @param {string} href */
  const active = (href) => (href === '/' ? current === '/' : current === href || current.startsWith(`${href}/`));
  const primaryMobile = $derived([{ href: '/', icon: 'home', label: t('nav.overview') }, ...services.items.slice(0, 3).map((s) => ({ href: `/${s.type}/${s.id}`, icon: ICONS[s.type], label: s.label })), { href: '/account', icon: 'user', label: t('nav.account') }]);
</script>

<div class="shell">
  <nav class="nav" aria-label="main">
    <a href="/" class="brand"><img src="/icons/icon.svg" alt="" width="28" height="28" /> {t('app.name')}</a>
    <a href="/" aria-current={active('/') ? 'page' : undefined}><Icon name="home" /> {t('nav.overview')}</a>
    <div class="section">{t('nav.services')}</div>
    {#each services.items as s (s.id)}
      <a href="/{s.type}/{s.id}" aria-current={active(`/${s.type}/${s.id}`) ? 'page' : undefined}><Icon name={ICONS[s.type]} /> <span class="truncate">{s.label}</span><span class="dot {services.health(s.id)}" title={services.health(s.id)}></span></a>
    {/each}
    <div class="section">{t('nav.console')}</div>
    <a href="/audit" aria-current={active('/audit') ? 'page' : undefined}><Icon name="list" /> {t('nav.audit')}</a>
    {#if session.isAdmin}<a href="/admins" aria-current={active('/admins') ? 'page' : undefined}><Icon name="shield" /> {t('nav.admins')}</a>{/if}
    <a href="/account" aria-current={active('/account') ? 'page' : undefined}><Icon name="user" /> {t('nav.account')}</a>
    <div class="grow"></div>
    {#if pwa.canInstall}<button class="btn sm" onclick={() => pwa.install()}><Icon name="download" size={14} /> {t('common.install')}</button>{/if}
    <div class="xs faint" style="padding:10px">{session.admin?.email}</div>
  </nav>

  <div class="main">
    <header class="header">
      <a href="/" class="row" style="font-weight:700;color:inherit"><img src="/icons/icon.svg" alt="" width="24" height="24" style="border-radius:6px" /> <span class="hide-desktop">{t('app.name')}</span></a>
      <div class="grow"></div>
      {#if !pwa.online}<span class="badge warn"><Icon name="wifiOff" size={12} /> {t('common.offline')}</span>{/if}
      {#if session.admin?.role === 'viewer'}<span class="badge plain" title={t('common.viewerNote')}>{t('admins.viewer')}</span>{/if}
      <button class="btn ghost icon" onclick={() => theme.toggle()} aria-label={t('account.theme')} title={t('account.theme')}><Icon name={theme.mode === 'dark' ? 'sun' : 'moon'} /></button>
      <button class="btn ghost icon" onclick={() => session.logout().then(() => router.go('/login'))} aria-label={t('account.logout')} title={t('account.logout')}><Icon name="logout" /></button>
    </header>
    <main class="content">{@render children()}</main>
  </div>

  <nav class="bottom-nav" aria-label="main mobile">
    {#each primaryMobile as item (item.href)}
      <a href={item.href} aria-current={active(item.href) ? 'page' : undefined}><Icon name={item.icon} /> <span class="truncate">{item.label}</span></a>
    {/each}
  </nav>
</div>

<style>
  @media (min-width: 901px) { .hide-desktop { display: none; } }
</style>
