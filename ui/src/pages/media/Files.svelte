<script>
  import Page from '../../lib/components/Page.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Stat from '../../lib/components/Stat.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import Time from '../../lib/components/Time.svelte';
  import LoadMore from '../../lib/components/LoadMore.svelte';
  import ServiceTabs from '../../lib/components/ServiceTabs.svelte';
  import AutoRefresh from '../../lib/components/AutoRefresh.svelte';
  import PollStats from '../../lib/components/PollStats.svelte';
  import { poller } from '../../lib/poller.svelte.js';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import { session } from '../../lib/session.svelte.js';
  import { services } from '../../lib/services.svelte.js';
  import { Fmt } from '../../lib/format.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  import { toasts } from '../../lib/toast.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => Promise.all([list.load(), summary.load()])));
  const refreshNow = () => service.trigger();
  const fmt = $derived(new Fmt(i18n.lang));
  /** @type {'grid'|'list'} */
  let view = $state(/** @type {'grid'|'list'} */ ((() => { try { return localStorage.getItem('console.media.view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } })()));
  $effect(() => { try { localStorage.setItem('console.media.view', view); } catch { /* ignore */ } });
  /** @type {any[]} */ let items = $state([]);
  /** @type {string|null} */ let cursor = $state(null);
  let more = $state(false);
  const summary = new Resource(() => api.get(`/services/${sid}/status`));
  const list = new Resource(async () => {
    const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/media/files?limit=48`));
    items = r.items; cursor = r.nextCursor; return r;
  });
  $effect(() => { list.load(); summary.load(); });
  async function loadMore() {
    more = true;
    try { const r = /** @type {{ items: any[], nextCursor: string|null }} */ (await api.get(`/services/${sid}/media/files?limit=48&cursor=${encodeURIComponent(cursor ?? '')}`)); items = [...items, ...r.items]; cursor = r.nextCursor; }
    catch (e) { toasts.error(e); } finally { more = false; }
  }

  // Upload
  /** @type {'public'|'private'} */ let visibility = $state('private');
  let dragging = $state(false);
  /** @type {{ name: string, progress: number, error?: string }[]} */ let uploads = $state([]);
  /** @type {HTMLInputElement|undefined} */ let picker = $state();
  /** @param {FileList|File[]|null|undefined} files */
  async function uploadFiles(files) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      /** @type {{ name: string, progress: number, error?: string }} */
      const entry = $state({ name: file.name, progress: 0 });
      uploads = [...uploads, entry];
      try {
        const r = await api.upload(`/services/${sid}/media/files?visibility=${visibility}&name=${encodeURIComponent(file.name)}`, file, (f) => { entry.progress = f; });
        items = [r.file, ...items]; toasts.ok(t('media.uploaded', { name: r.file.name })); summary.load();
        uploads = uploads.filter((u) => u !== entry);
      } catch (e) { entry.error = /** @type {{ message?: string }} */ (e).message ?? t('common.error'); toasts.error(e); }
    }
  }
  const isImage = (/** @type {any} */ f) => /^image\//.test(f.mime) && f.mime !== 'image/svg+xml';
  const svc = $derived(services.get(sid));
  const m = $derived(summary.data?.summary);
</script>

<Page title={svc?.label ?? t('media.title')} desc={t('media.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    <div class="seg"><button aria-pressed={view === 'grid'} onclick={() => { view = 'grid'; }} title={t('media.grid')}><Icon name="grid" size={14} /></button><button aria-pressed={view === 'list'} onclick={() => { view = 'list'; }} title={t('media.list')}><Icon name="list" size={14} /></button></div>
    <button class="btn icon" onclick={refreshNow} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="media" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:20px">
    <Stat label={t('media.files')} value={fmt.int(m?.files)} sub="{t('media.blobs')}: {fmt.int(m?.blobs)}" />
    <Stat label={t('media.stored')} value={fmt.bytes(m?.storedBytes)} />
    <Stat label={t('media.uploads')} value={fmt.int(m?.uploads)} />
    <Stat label={t('media.downloads')} value={fmt.int(m?.downloads)} />
  </div>

  {#if session.isAdmin}
    <div class="dropzone {dragging ? 'active' : ''}" style="margin-bottom:20px" role="button" tabindex="0" aria-label={t('media.upload')}
      ondragover={(e) => { e.preventDefault(); dragging = true; }} ondragleave={() => { dragging = false; }} ondrop={(e) => { e.preventDefault(); dragging = false; uploadFiles(e.dataTransfer?.files); }}
      onclick={() => picker?.click()} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker?.click(); } }}>
      <Icon name="upload" size={28} />
      <div style="margin-top:6px;font-weight:600">{t('media.dropHere')}</div>
      <div class="xs faint">{t('media.dropHint')}</div>
      <div class="row" style="justify-content:center;margin-top:12px" role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
        <span class="small muted">{t('media.visibility')}:</span>
        <div class="seg"><button aria-pressed={visibility === 'private'} onclick={() => { visibility = 'private'; }}>{t('media.private')}</button><button aria-pressed={visibility === 'public'} onclick={() => { visibility = 'public'; }}>{t('media.public')}</button></div>
      </div>
      <input type="file" multiple class="sr-only" bind:this={picker} onchange={(e) => { uploadFiles(/** @type {HTMLInputElement} */ (e.currentTarget).files); /** @type {HTMLInputElement} */ (e.currentTarget).value = ''; }} />
    </div>
    {#each uploads as u (u)}
      <div class="card" style="margin-bottom:8px"><div class="card-body row"><Icon name="upload" size={16} /><span class="grow truncate">{u.name}</span>{#if u.error}<span class="small danger-text">{u.error}</span>{:else}<div class="progress" style="width:160px"><div style="width:{Math.round(u.progress * 100)}%"></div></div>{/if}</div></div>
    {/each}
  {/if}

  {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} boxed />
  {:else if list.loading && !items.length}<Skeleton rows={4} height={90} />
  {:else if !items.length}<div class="card"><Empty icon="image" title={t('media.emptyTitle')} desc={t('media.emptyDesc')} /></div>
  {:else if view === 'grid'}
    <div class="file-grid">
      {#each items as f (f.id)}
        <button class="file-tile" onclick={() => router.go(`/media/${sid}/files/${f.id}`)}>
          {#if isImage(f)}<img class="thumb" src="/api/services/{sid}/media/files/{f.id}/bytes/thumb" alt="" loading="lazy" />
          {:else}<div class="thumb" style="display:grid;place-items:center;color:var(--text-3)"><Icon name="file" size={32} /></div>{/if}
          <div class="truncate small" style="margin-top:8px;font-weight:550" title={f.name}>{f.name}</div>
          <div class="row xs faint"><span>{fmt.bytes(f.size)}</span><span class="grow"></span><StatusBadge status={f.visibility} label={t(`media.${f.visibility}`)} /></div>
        </button>
      {/each}
    </div>
  {:else}
    <div class="card flush"><div class="card-body"><div class="table-wrap"><table class="table">
      <thead><tr><th></th><th>{t('common.name')}</th><th class="hide-m">{t('common.type')}</th><th class="num">{t('common.size')}</th><th class="hide-m">{t('media.dimensions')}</th><th>{t('media.visibility')}</th><th class="hide-m">{t('common.created')}</th></tr></thead>
      <tbody>{#each items as f (f.id)}<tr class="clickable" onclick={() => router.go(`/media/${sid}/files/${f.id}`)}>
        <td style="width:44px">{#if isImage(f)}<img src="/api/services/{sid}/media/files/{f.id}/bytes/thumb" alt="" width="36" height="36" style="border-radius:6px;object-fit:cover;display:block" loading="lazy" />{:else}<Icon name="file" />{/if}</td>
        <td class="truncate" style="max-width:280px">{f.name}</td><td class="mono small hide-m">{f.mime}</td><td class="num">{fmt.bytes(f.size)}</td>
        <td class="small muted hide-m">{f.width ? `${f.width}×${f.height}` : '–'}</td><td><StatusBadge status={f.visibility} label={t(`media.${f.visibility}`)} /></td><td class="hide-m"><Time value={f.createdAt} /></td>
      </tr>{/each}</tbody></table></div></div></div>
  {/if}
  <LoadMore {cursor} busy={more} onmore={loadMore} />
</Page>
