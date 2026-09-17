<script>
  /** One place collection: places, JSON upload, nearby test, clear and delete. */
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Time from '../../lib/components/Time.svelte';
  import Confirm from '../../lib/components/Confirm.svelte';
  import Dialog from '../../lib/components/Dialog.svelte';
  import LoadMore from '../../lib/components/LoadMore.svelte';
  import RowMenu from '../../lib/components/RowMenu.svelte';
  import RankedList from '../../lib/components/RankedList.svelte';
  import CollectionForm from './CollectionForm.svelte';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import { session } from '../../lib/session.svelte.js';
  import { Fmt } from '../../lib/format.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  import { toasts } from '../../lib/toast.svelte.js';
  /** @type {{ sid: string, id: string }} */
  let { sid, id } = $props();
  const PAGE = 50;
  const fmt = $derived(new Fmt(i18n.lang));
  const base = $derived(`/services/${sid}/geo/collections/${encodeURIComponent(id)}`);
  const res = new Resource(() => api.get(base));
  const x = $derived(/** @type {any} */ (res.data)?.collection);
  /** @type {any[]} */ let places = $state([]);
  let total = $state(0);
  let loading = $state(false);
  /** @type {unknown} */ let listError = $state(null);
  /** @param {number} offset */
  async function loadPlaces(offset = 0) {
    loading = true;
    try { const r = /** @type {any} */ (await api.get(`${base}/places?limit=${PAGE}&offset=${offset}`)); places = offset ? [...places, ...r.items] : r.items; total = r.total; listError = null; }
    catch (e) { listError = e; } finally { loading = false; }
  }
  $effect(() => { res.load(); loadPlaces(0); });
  const reloadAll = () => { res.load(); loadPlaces(0); };

  // ---- nearby test
  let lat = $state('');
  let lng = $state('');
  let radius = $state('10');
  /** @type {any} */ let near = $state(null);
  /** @type {unknown} */ let nearError = $state(null);
  const coord = /^-?\d{1,3}(\.\d+)?$/;
  const nearValid = $derived(coord.test(lat.trim()) && coord.test(lng.trim()) && /^\d{1,5}(\.\d+)?$/.test(radius.trim()));
  async function nearby() {
    if (!nearValid) return;
    try { near = await api.get(`${base}/nearby?lat=${lat.trim()}&lng=${lng.trim()}&radius=${radius.trim()}&limit=10`); nearError = null; } catch (e) { nearError = e; near = null; }
  }
  /** @param {any} p */
  function useAsCenter(p) { lat = String(p.lat); lng = String(p.lng); nearby(); }

  // ---- actions
  /** @type {'delete'|'clear'|'deletePlace'|null} */ let confirm = $state(null);
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
    if (!Object.keys(patch).length) { toasts.info(t('ge.noChanges')); editOpen = false; return; }
    await run(async () => { await api.patch(base, patch); await res.load(); }, t('ge.updated'));
    editOpen = false;
  }
  let uploadOpen = $state(false);
  let uploadText = $state('');
  const parsed = $derived.by(() => { try { const v = JSON.parse(uploadText); const arr = Array.isArray(v) ? v : Array.isArray(v?.places) ? v.places : null; return arr && arr.length ? arr : null; } catch { return null; } });
  const upload = () => run(async () => { const r = /** @type {any} */ (await api.put(`${base}/places`, { places: parsed })); toasts.ok(t('ge.uploaded', { c: r.created, u: r.updated })); uploadOpen = false; uploadText = ''; await Promise.all([res.load(), loadPlaces(0)]); }, null);
  const clear = () => run(async () => { const r = /** @type {any} */ (await api.post(`${base}/clear`, {})); toasts.ok(t('ge.cleared', { n: r.removed })); near = null; await Promise.all([res.load(), loadPlaces(0)]); }, null);
  const deletePlace = () => run(async () => { await api.delete(`${base}/places/${encodeURIComponent(target.id)}`); await Promise.all([res.load(), loadPlaces(0)]); }, t('ge.placeDeleted'));
  /** @param {Record<string, unknown>} attrs */
  const attrText = (attrs) => Object.entries(attrs).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
</script>

<Page title={x ? x.name : t('ge.collection')} back="/geo/{sid}">
  {#snippet actions()}
    {#if x && session.isAdmin}
      <button class="btn primary" onclick={() => { uploadOpen = true; }} disabled={busy}><Icon name="upload" size={16} /><span class="hide-m"> {t('ge.upload')}</span></button>
      <button class="btn" onclick={() => { editOpen = true; }} disabled={busy}><Icon name="settings" size={16} /><span class="hide-m"> {t('ge.edit')}</span></button>
      <RowMenu label={t('common.actions')} items={[
        { label: t('ge.clear'), icon: 'x', danger: true, run: () => { confirm = 'clear'; } },
        { label: t('ge.delete'), icon: 'trash', danger: true, run: () => { confirm = 'delete'; } },
      ]} />
    {/if}
    <button class="btn icon" onclick={reloadAll} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !x}<Skeleton rows={8} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        {#if x.description}<p style="margin-bottom:8px">{x.description}</p>{/if}
        <p class="xs faint" style="margin:0">{fmt.int(x.places)} {t('ge.places').toLowerCase()} · {t('ge.createdBy')} <span class="mono">{x.createdBy}</span> · {t('common.updated').toLowerCase()} <Time value={x.updatedAt} /></p>
      </div></div>

      <div class="layout two">
        <Panel title={t('ge.nearby')} bodyClass="stack">
          <form class="row wrap" style="gap:8px" onsubmit={(e) => { e.preventDefault(); nearby(); }}>
            <input class="input grow mono" style="min-width:110px" bind:value={lat} placeholder="41.0082" aria-label="lat" />
            <input class="input grow mono" style="min-width:110px" bind:value={lng} placeholder="28.9784" aria-label="lng" />
            <input class="input mono" style="width:84px;flex:none" bind:value={radius} aria-label={t('ge.radius')} />
            <button type="submit" class="btn" disabled={!nearValid}><Icon name="search" size={16} /><span class="hide-m"> {t('ge.search')}</span></button>
          </form>
          <p class="xs faint" style="margin:0">{t('ge.nearbyHint')}</p>
          {#if nearError}<ErrorBox error={nearError} onretry={nearby} />
          {:else if near}
            <p class="small" style="margin:0">{t('ge.nearbyCount', { n: fmt.int(near.total), r: near.radiusKm })}</p>
            <RankedList items={near.items.map((/** @type {any} */ p) => ({ id: p.id, label: p.name, sub: `${p.id} · ${p.bearing}°`, value: `${p.distanceKm < 10 ? p.distanceKm.toFixed(2) : fmt.int(Math.round(p.distanceKm))} km` }))} empty={t('ge.nearbyNone')} />
          {/if}
        </Panel>

        <Panel title={total ? t('ge.placeCount', { n: fmt.int(total) }) : t('ge.places')} flush>
          {#if listError}<ErrorBox error={listError} onretry={() => loadPlaces(0)} />
          {:else if loading && !places.length}<Skeleton rows={4} />
          {:else if !places.length}<Empty icon="globe" title={t('ge.noPlaces')} desc={t('ge.noPlacesDesc')} />
          {:else}
            <div class="table-wrap"><table class="table">
              <thead><tr><th>{t('ge.name')}</th><th>{t('ge.coordinates')}</th><th class="hide-m">{t('ge.attrs')}</th>{#if session.isAdmin}<th></th>{/if}</tr></thead>
              <tbody>
                {#each places as p (p.id)}
                  <tr>
                    <td><button class="linkish truncate" style="max-width:200px" onclick={() => useAsCenter(p)} title={t('ge.useAsCenter')}>{p.name}</button><div class="xs faint mono truncate" style="max-width:200px">{p.id}</div></td>
                    <td class="mono small" style="white-space:nowrap">{p.lat}, {p.lng}</td>
                    <td class="hide-m"><span class="row wrap" style="gap:4px">{#each attrText(p.attrs) as a (a)}<span class="badge plain xs">{a}</span>{/each}</span></td>
                    {#if session.isAdmin}<td style="text-align:right"><RowMenu label={t('common.actions')} items={[{ label: t('ge.deletePlace'), icon: 'trash', danger: true, run: () => { target = p; confirm = 'deletePlace'; } }]} /></td>{/if}
                  </tr>
                {/each}
              </tbody>
            </table></div>
            <LoadMore cursor={places.length < total ? String(places.length) : null} busy={loading} onmore={() => loadPlaces(places.length)} />
          {/if}
        </Panel>
      </div>
    </div>
  {/if}
</Page>

<CollectionForm open={editOpen} initial={x} busy={busy} onsubmit={save} onclose={() => { editOpen = false; }} />
<Dialog open={uploadOpen} title={t('ge.upload')} onclose={() => { uploadOpen = false; }} wide>
  <div class="stack">
    <p class="small muted" style="margin:0">{t('ge.uploadHint')}</p>
    <textarea class="textarea mono" rows="12" bind:value={uploadText} placeholder={'[\n  { "id": "kadikoy", "name": "Kadıköy", "lat": 40.9903, "lng": 29.0252, "attrs": { "type": "store" } }\n]'} aria-label={t('ge.upload')}></textarea>
    {#if uploadText.trim() && !parsed}<span class="small danger-text">{t('ge.uploadInvalid')}</span>{:else if parsed}<span class="small faint">{t('ge.uploadReady', { n: fmt.int(parsed.length) })}</span>{/if}
  </div>
  {#snippet footer()}
    <button class="btn" onclick={() => { uploadOpen = false; }} disabled={busy}>{t('common.cancel')}</button>
    <button class="btn primary" onclick={upload} disabled={busy || !parsed}>{t('ge.upload')}</button>
  {/snippet}
</Dialog>
<Confirm open={confirm === 'deletePlace'} title={t('ge.deletePlace')} message={t('ge.deletePlaceDesc', { s: target?.name ?? '' })} danger confirmLabel={t('common.delete')} busy={busy} onconfirm={deletePlace} oncancel={() => { confirm = null; target = null; }} />
<Confirm open={confirm === 'clear'} title={t('ge.clear')} message={t('ge.clearDesc')} danger typeWord={x?.name} confirmLabel={t('ge.clear')} busy={busy} onconfirm={clear} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'delete'} title={t('ge.delete')} message={t('ge.deleteDesc')} danger typeWord={x?.name} confirmLabel={t('common.delete')} busy={busy} onconfirm={() => run(async () => { await api.delete(base); router.go(`/geo/${sid}`); }, t('ge.deleted'))} oncancel={() => { confirm = null; }} />

<style>
  .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (min-width: 1101px) { .layout.two { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); } }
  .linkish { background: none; border: 0; padding: 0; color: inherit; cursor: pointer; text-align: left; font: inherit; display: block; }
  .linkish:hover { text-decoration: underline; }
</style>
