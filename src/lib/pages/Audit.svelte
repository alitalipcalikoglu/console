<script>
  import Page from '$lib/components/Page.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorBox from '$lib/components/ErrorBox.svelte';
  import Time from '$lib/components/Time.svelte';
  import LoadMore from '$lib/components/LoadMore.svelte';
  import { api } from '$lib/client/api.js';
  import { Resource } from '$lib/client/resource.svelte.js';
  import { page as route } from '$app/state';
  import { Navigation } from '$lib/client/navigation.js';
  import { t } from '$lib/client/i18n.svelte.js';
  import { toasts } from '$lib/client/toast.svelte.js';
  let action = $state(route.url.searchParams.get('action') ?? '');
  /** @type {any[]} */ let items = $state([]);
  /** @type {string|null} */ let before = $state(null);
  let more = $state(false);
  const url = (/** @type {string|null} */ b) => `/audit?limit=50${action ? `&action=${encodeURIComponent(action)}` : ''}${b ? `&before=${b}` : ''}`;
  const list = new Resource(async () => { const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(url(null))); items = r.items; before = r.nextBefore; return r; });
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  $effect(() => { action; clearTimeout(timer); timer = setTimeout(() => { Navigation.replaceQuery(route.url, { action }); list.load(); }, 250); return () => clearTimeout(timer); });
  async function loadMore() { more = true; try { const r = /** @type {{ items: any[], nextBefore: string|null }} */ (await api.get(url(before))); items = [...items, ...r.items]; before = r.nextBefore; } catch (e) { toasts.error(e); } finally { more = false; } }
  const QUICK = ['', 'login', 'admin.', 'notify.', 'auth.', 'media.'];
</script>

<Page title={t('audit.title')} desc={t('audit.desc')}>
  {#snippet actions()}<button class="btn icon" onclick={() => list.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>{/snippet}
  <Panel flush>
    {#snippet head()}
      <div class="seg">{#each QUICK as q (q)}<button aria-pressed={action === q} onclick={() => { action = q; }}>{q || t('common.all')}</button>{/each}</div>
      <input class="input" style="width:min(280px,100%)" type="search" placeholder={t('audit.filter')} bind:value={action} />
    {/snippet}
      {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
      {:else if list.loading && !items.length}<Skeleton rows={8} />
      {:else if !items.length}<Empty icon="list" title={t('audit.emptyTitle')} desc={t('audit.emptyDesc')} />
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('common.at')}</th><th class="hide-m">{t('audit.actor')}</th><th>{t('audit.action')}</th><th>{t('audit.target')}</th><th class="hide-m">{t('common.details')}</th><th class="hide-m">{t('common.ip')}</th></tr></thead>
          <tbody>{#each items as e (e.id)}<tr>
            <td style="white-space:nowrap"><Time value={e.at} /></td><td class="small hide-m">{e.adminEmail ?? '–'}</td>
            <td><code class="{/failed|delete|revoke|disable/.test(e.action) ? 'danger-text' : ''}">{e.action}</code></td>
            <td class="mono small truncate" style="max-width:220px">{e.target ?? ''}</td>
            <td class="small muted mono truncate hide-m" style="max-width:320px" title={e.meta ? JSON.stringify(e.meta) : ''}>{e.meta ? JSON.stringify(e.meta) : ''}</td>
            <td class="mono small hide-m">{e.ip ?? '–'}</td>
          </tr>{/each}</tbody>
        </table></div>
        <LoadMore cursor={before} busy={more} onmore={loadMore} />
      {/if}
  </Panel>
</Page>
