<script>
  /** Search inside one index: query, facet filters, ranked results with highlights; index and document management. */
  import Page from '$lib/components/Page.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorBox from '$lib/components/ErrorBox.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import Time from '$lib/components/Time.svelte';
  import Confirm from '$lib/components/Confirm.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import LoadMore from '$lib/components/LoadMore.svelte';
  import RowMenu from '$lib/components/RowMenu.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import IndexForm from './IndexForm.svelte';
  import { api } from '$lib/client/api.js';
  import { Resource } from '$lib/client/resource.svelte.js';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { Navigation } from '$lib/client/navigation.js';
  import { useSession } from '$lib/client/session.svelte.js';
  const session = useSession();
  import { Fmt } from '$lib/client/format.js';
  import { t, i18n } from '$lib/client/i18n.svelte.js';
  import { toasts } from '$lib/client/toast.svelte.js';
  /** @type {{ sid: string, id: string }} */
  let { sid, id } = $props();
  const PAGE = 20;
  const fmt = $derived(new Fmt(i18n.lang));
  const base = $derived(`/services/${sid}/search/indexes/${encodeURIComponent(id)}`);
  const res = new Resource(() => api.get(base));
  $effect(() => { res.load(); });
  const x = $derived(/** @type {any} */ (res.data)?.index);
  const facetKeys = $derived(/** @type {string[]} */ (x?.facets ?? []));

  // ---- search state (query and filters live in the URL)
  let q = $state(route.url.searchParams.get('q') ?? '');
  let sort = $state(route.url.searchParams.get('sort') ?? 'relevance');
  /** @type {Record<string, string[]>} */ let filters = $state(JSON.parse(route.url.searchParams.get('f') ?? '{}'));
  /** @type {any} */ let result = $state(null);
  /** @type {any[]} */ let hits = $state([]);
  let searching = $state(false);
  let more = $state(false);
  /** @type {unknown} */ let searchError = $state(null);
  let seq = 0;
  /** @param {number} offset */
  async function search(offset = 0) {
    if (!x) return;
    const mine = ++seq;
    if (offset === 0) searching = true; else more = true;
    try {
      const r = /** @type {any} */ (await api.post(`${base}/search`, { q: q.trim(), filters, facets: facetKeys, limit: PAGE, offset, highlight: true, sort }));
      if (mine !== seq) return;
      result = r; hits = offset === 0 ? r.hits : [...hits, ...r.hits]; searchError = null;
    } catch (e) { if (mine === seq) { searchError = e; if (offset === 0) { result = null; hits = []; } } } finally { if (mine === seq) { searching = false; more = false; } }
  }
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  $effect(() => { q; sort; filters; x; clearTimeout(timer); timer = setTimeout(() => { Navigation.replaceQuery(route.url, { q, sort: sort === 'relevance' ? null : sort, f: Object.keys(filters).length ? JSON.stringify(filters) : null }); search(0); }, 250); return () => clearTimeout(timer); });
  const activeFilters = $derived(Object.values(filters).reduce((a, v) => a + v.length, 0));
  /** @param {string} key @param {string} value */
  function toggle(key, value) {
    const cur = filters[key] ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    const copy = { ...filters };
    if (next.length) copy[key] = next; else delete copy[key];
    filters = copy;
  }
  /** Facet values to show: counts from the result, plus selected values that dropped out of the matched set (so they can be unticked). @param {string} key */
  const facetValues = (key) => { const counted = /** @type {{ value: string, count: number }[]} */ (result?.facets?.[key] ?? []); const extra = (filters[key] ?? []).filter((v) => !counted.some((c) => c.value === v)).map((v) => ({ value: v, count: 0 })); return [...counted, ...extra]; };

  // ---- document dialog
  /** @type {any} */ let doc = $state(null);
  let docBusy = $state(false);
  /** @param {string} docId */
  async function openDoc(docId) {
    try { doc = /** @type {any} */ (await api.get(`${base}/documents/${encodeURIComponent(docId)}`)).document; } catch (e) { toasts.error(e); }
  }
  /** @type {'delete'|'clear'|'deleteDoc'|null} */ let confirm = $state(null);
  let busy = $state(false);
  /** @param {() => Promise<unknown>} fn @param {string|null} ok */
  async function run(fn, ok) {
    busy = true;
    try { await fn(); if (ok) toasts.ok(ok); confirm = null; await res.load(); } catch (err) { toasts.error(err); } finally { busy = false; }
  }
  let editOpen = $state(false);
  /** @param {Record<string, unknown>} patch */
  async function save(patch) {
    if (!Object.keys(patch).length) { toasts.info(t('se.noChanges')); editOpen = false; return; }
    await run(() => api.patch(base, patch), t('se.updated'));
    editOpen = false;
  }
  const clear = () => run(async () => { const r = /** @type {any} */ (await api.post(`${base}/clear`, {})); toasts.ok(t('se.cleared', { n: r.removed })); hits = []; result = null; }, null);
  const deleteDoc = async () => { docBusy = true; try { await api.delete(`${base}/documents/${encodeURIComponent(doc.id)}`); toasts.ok(t('se.docDeleted')); confirm = null; doc = null; await Promise.all([res.load(), search(0)]); } catch (e) { toasts.error(e); } finally { docBusy = false; } };
  /** @param {unknown} v */
  const attrText = (v) => (Array.isArray(v) ? v.join(', ') : String(v));
</script>

<Page title={x ? x.name : t('se.index')} back="/search/{sid}">
  {#snippet actions()}
    {#if x && session.isAdmin}
      <button class="btn" onclick={() => { editOpen = true; }} disabled={busy}><Icon name="settings" size={16} /><span class="hide-m"> {t('se.edit')}</span></button>
      <RowMenu label={t('common.actions')} items={[
        { label: t('se.clear'), icon: 'x', danger: true, run: () => { confirm = 'clear'; } },
        { label: t('se.delete'), icon: 'trash', danger: true, run: () => { confirm = 'delete'; } },
      ]} />
    {/if}
    <button class="btn icon" onclick={() => { res.load(); search(0); }} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !x}<Skeleton rows={8} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        {#if x.description}<p style="margin-bottom:10px">{x.description}</p>{/if}
        <p class="xs faint" style="margin:0">{fmt.int(x.documents)} {t('se.documents').toLowerCase()} · {t('se.lastIndexed').toLowerCase()} {#if x.lastIndexedAt}<Time value={x.lastIndexedAt} />{:else}{t('se.never').toLowerCase()}{/if} · {t('se.weights').toLowerCase()} <span class="mono">{x.weights.title}/{x.weights.body}/{x.weights.tags}</span> · {fmt.int(x.searchesSinceStart)} {t('se.searches').toLowerCase()}</p>
      </div></div>

      <div class="row" style="gap:10px;align-items:stretch">
        <input class="input grow" type="search" placeholder={t('se.searchPlaceholder')} bind:value={q} aria-label={t('se.search')} />
        <select class="select" style="width:auto" bind:value={sort} aria-label={t('se.sort')}>{#each ['relevance', 'newest', 'oldest'] as s (s)}<option value={s}>{t(`se.sort.${s}`)}</option>{/each}</select>
      </div>

      <div class="layout {facetKeys.length ? 'two' : ''}">
        {#if facetKeys.length}
          <Panel title={t('se.filters')} bodyClass="stack">
            {#snippet aside()}{#if activeFilters}<button class="btn ghost sm" onclick={() => { filters = {}; }}>{t('se.clearFilters')}</button>{/if}{/snippet}
            {#each facetKeys as key (key)}
              <div class="field">
                <span class="subhead" style="margin:0">{key}</span>
                {#each facetValues(key) as v (v.value)}
                  <label class="checkbox small"><input type="checkbox" checked={(filters[key] ?? []).includes(v.value)} onchange={() => toggle(key, v.value)} /> <span class="grow truncate" title={v.value}>{v.value}</span><span class="xs faint">{fmt.int(v.count)}</span></label>
                {:else}<span class="xs faint">–</span>{/each}
              </div>
            {/each}
          </Panel>
        {/if}
        <Panel title={result ? t('se.resultCount', { n: fmt.int(result.total) }) : t('se.results')} flush>
          {#snippet aside()}{#if result?.query}<span class="xs faint mono truncate" style="max-width:260px" title={t('se.query')}>{result.query}</span>{/if}{/snippet}
          {#if searchError}<ErrorBox error={searchError} onretry={() => search(0)} />
          {:else if searching && !hits.length}<Skeleton rows={5} />
          {:else if !hits.length}
            {#if x.documents === 0}<Empty icon="search" title={t('se.emptyIndex')} desc={t('se.emptyIndexDesc')} />{:else}<Empty icon="search" title={t('se.noResults')} desc={t('se.noResultsDesc')} />{/if}
          {:else}
            <ul class="hits">
              {#each hits as h (h.id)}
                <li><button class="hit" onclick={() => openDoc(h.id)}>
                  <div class="row" style="min-width:0"><span class="hit-title truncate">{@html h.highlights?.title ?? h.title}</span>{#if h.score !== null}<span class="xs faint mono hide-m">{t('se.score')} {h.score.toFixed(4)}</span>{/if}</div>
                  {#if h.highlights?.body}<p class="small muted hit-body">{@html h.highlights.body}</p>{/if}
                  <div class="row wrap" style="gap:4px"><code class="xs">{h.id}</code>{#each h.tags as tg (tg)}<span class="badge plain">{tg}</span>{/each}{#each Object.entries(h.attrs) as [k, v] (k)}<span class="badge plain xs">{k}: {attrText(v)}</span>{/each}</div>
                </button></li>
              {/each}
            </ul>
            <LoadMore cursor={result && hits.length < result.total ? String(hits.length) : null} busy={more} onmore={() => search(hits.length)} />
          {/if}
        </Panel>
      </div>
    </div>
  {/if}
</Page>

<IndexForm open={editOpen} initial={x} busy={busy} onsubmit={save} onclose={() => { editOpen = false; }} />
<Dialog open={doc !== null} title={doc?.title ?? t('se.document')} onclose={() => { doc = null; }} wide>
  {#if doc}
    <dl class="kv">
      <dt>{t('common.id')}</dt><dd class="row" style="min-width:0"><span class="mono">{doc.id}</span><CopyButton text={doc.id} /></dd>
      {#if doc.url}<dt>{t('se.url')}</dt><dd><a class="mono truncate" href={doc.url} target="_blank" rel="noreferrer">{doc.url}</a></dd>{/if}
      {#if doc.tags.length}<dt>{t('se.tags')}</dt><dd><span class="row wrap" style="gap:4px">{#each doc.tags as tg (tg)}<span class="badge plain">{tg}</span>{/each}</span></dd>{/if}
      {#if Object.keys(doc.attrs).length}<dt>{t('se.attrs')}</dt><dd><pre class="result">{JSON.stringify(doc.attrs, null, 2)}</pre></dd>{/if}
      {#if doc.body}<dt>{t('se.body')}</dt><dd><pre class="result">{doc.body}</pre></dd>{/if}
      <dt>{t('se.source')}</dt><dd><span class="mono small">{doc.source}</span> · <Time value={doc.updatedAt} mode="absolute" /></dd>
    </dl>
  {/if}
  {#snippet footer()}
    {#if session.isAdmin}<button class="btn danger" onclick={() => { confirm = 'deleteDoc'; }} disabled={docBusy}><Icon name="trash" size={14} /> {t('common.delete')}</button>{/if}
    <span class="grow"></span>
    <button class="btn" onclick={() => { doc = null; }}>{t('common.close')}</button>
  {/snippet}
</Dialog>
<Confirm open={confirm === 'deleteDoc'} title={t('se.deleteDoc')} message={t('se.deleteDocDesc')} danger irreversible={false} confirmLabel={t('common.delete')} busy={docBusy} onconfirm={deleteDoc} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'clear'} title={t('se.clear')} message={t('se.clearDesc')} danger typeWord={x?.name} confirmLabel={t('se.clear')} busy={busy} onconfirm={clear} oncancel={() => { confirm = null; }} />
<Confirm open={confirm === 'delete'} title={t('se.delete')} message={t('se.deleteDesc')} danger typeWord={x?.name} confirmLabel={t('common.delete')} busy={busy} onconfirm={() => run(async () => { await api.delete(base); goto(`/search/${sid}`); }, t('se.deleted'))} oncancel={() => { confirm = null; }} />

<style>
  .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (min-width: 901px) { .layout.two { grid-template-columns: 240px minmax(0, 1fr); } }
  .hits { list-style: none; margin: 0; padding: 0; }
  .hits li + li { border-top: 1px solid var(--border); }
  .hit { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 12px 16px; color: inherit; font: inherit; cursor: pointer; }
  .hit:hover { background: var(--surface-2); }
  .hit-title { font-weight: 600; }
  .hit-body { margin: 4px 0 6px; }
</style>
