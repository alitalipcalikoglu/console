<script>
  import Page from '../lib/components/Page.svelte';
  import Panel from '../lib/components/Panel.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import ErrorBox from '../lib/components/ErrorBox.svelte';
  import { api } from '../lib/api.js';
  import { Resource } from '../lib/resource.svelte.js';
  import { t } from '../lib/i18n.svelte.js';

  /** @typedef {{ id: string, type: string, label: string, url: string, ok: boolean, data?: Record<string, unknown>, error?: string }} AboutItem */
  const list = new Resource(() => /** @type {Promise<{ items: AboutItem[] }>} */ (api.get('/services/about')));
  $effect(() => { list.load(); });
  const items = $derived(/** @type {{ items: AboutItem[] }|null} */ (list.data)?.items ?? []);

  /** Every /v1/info field is optional from the console's point of view: an older service may not
   * have adopted the contract yet, or may be missing a field a newer contract added later — show
   * "–" rather than breaking the row. @param {unknown} v */
  const cell = (v) => (v === undefined || v === null || v === '' ? '–' : v);
</script>

<Page title={t('about.title')} desc={t('about.desc')}>
  {#snippet actions()}<button class="btn ghost icon sm" onclick={() => list.load()} disabled={list.loading} aria-label={t('common.refresh')} title={t('common.refresh')}><Icon name="refresh" size={14} /></button>{/snippet}
  <Panel title={t('about.title')} flush>
    {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
    {:else if !list.loaded}<Skeleton rows={4} />
    {:else}
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>{t('about.service')}</th><th>{t('about.version')}</th><th class="hide-m">{t('about.apiVersion')}</th>
          <th class="hide-m">{t('about.capabilities')}</th><th class="hide-m">{t('about.schemaVersion')}</th>
          <th class="hide-m">{t('about.serviceCore')}</th><th>{t('common.status')}</th>
        </tr></thead>
        <tbody>{#each items as it (it.id)}
          <tr>
            <td><a href="/{it.type}/{it.id}">{it.label ?? it.id}</a><div class="xs faint truncate">{it.type}</div></td>
            <td class="mono small">{cell(it.data?.version)}</td>
            <td class="hide-m mono small">{cell(it.data?.apiVersion)}</td>
            <td class="hide-m small">{#if Array.isArray(it.data?.capabilities) && it.data.capabilities.length}{it.data.capabilities.join(', ')}{:else}–{/if}</td>
            <td class="hide-m mono small">{cell(it.data?.schemaVersion)}</td>
            <td class="hide-m mono small">{cell(it.data?.serviceCore)}</td>
            <td>
              {#if it.ok}<span class="badge ok">{t('about.ok')}</span>
              {:else}<span class="badge danger" title={it.error}>{t('about.unavailable')}</span>{/if}
            </td>
          </tr>
        {/each}</tbody>
      </table></div>
    {/if}
  </Panel>
</Page>
