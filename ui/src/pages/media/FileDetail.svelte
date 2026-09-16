<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import Time from '../../lib/components/Time.svelte';
  import CopyButton from '../../lib/components/CopyButton.svelte';
  import Confirm from '../../lib/components/Confirm.svelte';
  import Dialog from '../../lib/components/Dialog.svelte';
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
  const res = new Resource(() => api.get(`/services/${sid}/media/files/${id}`));
  $effect(() => { res.load(); });
  const f = $derived(/** @type {any} */ (res.data)?.file);
  const isImage = $derived(f && /^image\//.test(f.mime) && f.mime !== 'image/svg+xml');
  const base = $derived(`/services/${sid}/media/files/${id}`);
  const notFound = $derived(/** @type {any} */ (res.error)?.status === 404);
  let busy = $state(false);
  let confirmDelete = $state(false);
  let renameOpen = $state(false);
  let newName = $state('');
  let ttl = $state('900');
  /** @type {Record<string, { url: string, expiresAt: string|null }>|null} */
  let signed = $state(null);
  /** @param {() => Promise<unknown>} fn @param {string} ok */
  async function run(fn, ok) { busy = true; try { await fn(); toasts.ok(ok); await res.load(); } catch (e) { toasts.error(e); } finally { busy = false; confirmDelete = false; renameOpen = false; } }
  async function sign() { try { signed = /** @type {any} */ (await api.post(`${base}/urls?ttl=${Number(ttl) || 900}`)).urls; } catch (e) { toasts.error(e); } }
</script>

<Page title={f?.name ?? t('media.files')} back="/media/{sid}">
  {#snippet actions()}
    {#if f && session.isAdmin}
      <button class="btn" onclick={() => { newName = f.name.replace(/\.[^.]+$/, ''); renameOpen = true; }} disabled={busy}>{t('media.rename')}</button>
      <button class="btn" onclick={() => run(() => api.patch(base, { visibility: f.visibility === 'public' ? 'private' : 'public' }), t('common.updated'))} disabled={busy}><Icon name={f.visibility === 'public' ? 'lock' : 'globe'} size={16} /> {f.visibility === 'public' ? t('media.private') : t('media.public')}</button>
      <button class="btn danger" onclick={() => { confirmDelete = true; }} disabled={busy}><Icon name="trash" size={16} /> {t('common.delete')}</button>
    {/if}
    <button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}
    {#if notFound && session.isAdmin}
      <div class="card"><div class="card-body stack"><p>{t('common.notFoundDesc')}</p><div><button class="btn" onclick={() => run(() => api.post(`${base}/restore`), t('media.restored'))}><Icon name="refresh" size={16} /> {t('media.restore')}</button></div></div></div>
    {:else}<ErrorBox error={res.error} onretry={() => res.load()} boxed />{/if}
  {:else if !f}<Skeleton rows={6} height={60} />
  {:else}
    <div class="detail">
      <div class="card"><div class="card-body" style="display:grid;place-items:center;min-height:240px;background:var(--surface-2);border-radius:var(--radius)">
        {#if isImage}<img src="/api/services/{sid}/media/files/{id}/bytes/{f.width > 1600 ? 'large' : 'original'}" alt={f.name} style="max-width:100%;max-height:60vh;border-radius:6px" />
        {:else}<Empty icon="file" title={t('media.noPreview')} desc={f.mime} />{/if}
      </div></div>
      <div class="stack">
        <div class="card"><div class="card-body">
          <div class="row wrap" style="margin-bottom:12px"><StatusBadge status={f.visibility} label={t(`media.${f.visibility}`)} /><span class="mono xs muted truncate">{f.id}</span><CopyButton text={f.id} /></div>
          <dl class="kv">
            <dt>{t('common.type')}</dt><dd class="mono small">{f.mime}</dd>
            <dt>{t('common.size')}</dt><dd>{fmt.bytes(f.size)}</dd>
            {#if f.width}<dt>{t('media.dimensions')}</dt><dd>{f.width} × {f.height}</dd>{/if}
            <dt>{t('media.sha')}</dt><dd class="mono xs row" style="word-break:break-all">{f.sha256}<CopyButton text={f.sha256} /></dd>
            <dt>{t('common.created')}</dt><dd><Time value={f.createdAt} mode="absolute" /></dd>
          </dl>
        </div></div>
        <Panel title={t('media.urls')} flush>
          {#snippet aside()}{#if f.visibility === 'private'}<div class="row"><input class="input" style="width:110px" inputmode="numeric" bind:value={ttl} aria-label={t('media.ttl')} /><button class="btn sm primary" onclick={sign}><Icon name="link" size={14} /> {t('media.signedUrl')}</button></div>{/if}{/snippet}
          <div class="table-wrap"><table class="table"><tbody>
            {#each Object.entries(signed ?? f.urls) as [name, u] (name)}
              <tr><td style="width:90px"><code>{name}</code></td><td class="mono xs" style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href={u.url} target="_blank" rel="noopener" title={u.url}>{u.url.replace(/^https?:\/\/[^/]+/, '')}</a></td><td class="xs faint" style="white-space:nowrap">{#if u.expiresAt}<Time value={u.expiresAt} />{/if}</td><td style="width:40px"><CopyButton text={u.url} /></td></tr>
            {/each}
          </tbody></table></div>
        </Panel>
      </div>
    </div>
  {/if}
</Page>

<Confirm open={confirmDelete} title={t('media.delete')} message={t('media.deleteDesc', { days: 7 })} danger confirmLabel={t('common.delete')} {busy} onconfirm={() => run(async () => { await api.delete(base); router.go(`/media/${sid}`); }, t('media.deleted'))} oncancel={() => { confirmDelete = false; }} />
<Dialog open={renameOpen} title={t('media.rename')} onclose={() => { renameOpen = false; }}>
  <div class="field"><label for="nn">{t('media.newName')}</label><input id="nn" class="input" bind:value={newName} /></div>
  {#snippet footer()}<button class="btn" onclick={() => { renameOpen = false; }}>{t('common.cancel')}</button><button class="btn primary" onclick={() => run(() => api.patch(base, { name: newName.trim() }), t('common.updated'))} disabled={busy || !newName.trim()}>{t('common.save')}</button>{/snippet}
</Dialog>

<style>
  .detail { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .detail > * { min-width: 0; }
  @media (max-width: 900px) { .detail { grid-template-columns: minmax(0, 1fr); } }
</style>
