<script>
  import { onMount } from 'svelte';
  import Page from '$lib/components/Page.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorBox from '$lib/components/ErrorBox.svelte';
  import SwaggerReference from '$lib/components/SwaggerReference.svelte';
  import { api } from '$lib/client/api.js';
  import { fetchDocServices, fetchOpenApi } from '$lib/client/api-docs.js';
  import { page as route } from '$app/state';
  import { Navigation } from '$lib/client/navigation.js';
  import { t } from '$lib/client/i18n.svelte.js';

  /** @typedef {{ id: string, type: string, label: string }} DocService */
  /** @type {DocService[]} */
  let items = $state([]);
  let selected = $state(route.url.searchParams.get('service') ?? 'console');
  /** @type {Record<string, unknown>|null} */
  let document = $state(null);
  let listLoading = $state(true);
  let loading = $state(false);
  let error = $state(/** @type {unknown} */ (null));
  let sequence = 0;

  async function loadDocument() {
    const seq = ++sequence;
    loading = true;
    error = null;
    document = null;
    try {
      const next = await fetchOpenApi((path) => api.get(path), selected);
      if (seq === sequence) document = next;
    } catch (err) {
      if (seq === sequence) error = err;
    } finally {
      if (seq === sequence) loading = false;
    }
  }

  async function loadServices() {
    listLoading = true;
    error = null;
    try {
      const next = await fetchDocServices((path) => api.get(path), selected);
      items = next.items;
      selected = next.selected;
      if (selected) await loadDocument();
    } catch (err) {
      error = err;
    } finally {
      listLoading = false;
    }
  }

  function choose(/** @type {Event} */ event) {
    selected = /** @type {HTMLSelectElement} */ (event.currentTarget).value;
    Navigation.replaceQuery(route.url, { service: selected === 'console' ? null : selected });
    loadDocument();
  }

  onMount(loadServices);
</script>

<Page title={t('docs.title')} desc={t('docs.desc')}>
  <Panel flush>
    {#snippet head()}
      <div class="docs-head">
        <label for="docs-service">{t('docs.service')}</label>
        <select id="docs-service" class="select" value={selected} onchange={choose} disabled={listLoading || !items.length}>
          {#each items as service (service.id)}<option value={service.id}>{service.label} · {service.type}</option>{/each}
        </select>
      </div>
    {/snippet}
    {#if error}<div class="state"><ErrorBox {error} onretry={items.length ? loadDocument : loadServices} /></div>
    {:else if listLoading || loading}<div class="state"><Skeleton rows={8} /></div>
    {:else if !document}<div class="state faint">{t('docs.empty')}</div>
    {:else}{#key selected}<SwaggerReference {document} />{/key}{/if}
  </Panel>
</Page>

<style>
  .docs-head { display:flex; align-items:center; gap:12px; width:100%; }
  .docs-head label { font-size:.82rem; color:var(--text-2); white-space:nowrap; }
  .docs-head .select { width:min(360px, 100%); }
  .state { padding:20px; }
  @media (max-width:600px) {
    .docs-head { align-items:stretch; flex-direction:column; gap:6px; }
    .docs-head .select { width:100%; }
  }
</style>
