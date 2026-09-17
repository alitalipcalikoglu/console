<script>
  /** Reference tables: countries, currencies, time zones, in the console language or another. */
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const base = $derived(`/services/${sid}/geo`);
  const TABS = ['countries', 'currencies', 'timezones'];
  let tab = $state(TABS.includes(router.query.get('tab') ?? '') ? /** @type {string} */ (router.query.get('tab')) : 'countries');
  let q = $state(router.query.get('q') ?? '');
  let lang = $state(router.query.get('lang') ?? i18n.lang);
  const langOk = $derived(/^[A-Za-z0-9-]{2,35}$/.test(lang.trim()));
  const data = new Resource(() => api.get(`${base}/${tab}?lang=${encodeURIComponent(lang.trim())}${tab !== 'currencies' && q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`));
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  $effect(() => { tab; q; lang; if (!langOk) return; clearTimeout(timer); timer = setTimeout(() => { router.setQuery({ tab: tab === 'countries' ? null : tab, q: q || null, lang: lang === i18n.lang ? null : lang }); data.load(); }, 250); return () => clearTimeout(timer); });
  const all = $derived(/** @type {any[]} */ (/** @type {any} */ (data.data)?.items ?? []));
  const fold = (/** @type {string} */ s) => s.normalize('NFD').replace(/\p{M}+/gu, '').replace(/ı/g, 'i').replace(/I/g, 'i').toLowerCase();
  const items = $derived(tab === 'currencies' && q.trim() ? all.filter((c) => fold(`${c.code} ${c.name} ${c.countries.join(' ')}`).includes(fold(q.trim()))) : all);
</script>

<Page title={t('ge.reference')} desc={t('ge.referenceDesc')} back="/geo/{sid}">
  {#snippet actions()}
    <button class="btn icon" onclick={() => data.load()} disabled={data.loading} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <div class="stack">
    <div class="row wrap" style="gap:10px">
      <div class="seg" role="group">{#each TABS as x (x)}<button aria-pressed={tab === x} onclick={() => { tab = x; }}>{t(`ge.tab.${x}`)}</button>{/each}</div>
      <input class="input grow" type="search" bind:value={q} placeholder={t('ge.referenceSearch')} aria-label={t('common.search')} style="min-width:160px" />
      <input class="input mono" style="width:90px;flex:none" bind:value={lang} placeholder="en" aria-label={t('ge.lang')} title={t('ge.langHint')} maxlength="35" />
    </div>
    <Panel title={data.loaded ? t('ge.rowCount', { n: items.length }) : t(`ge.tab.${tab}`)} flush>
      {#if !langOk}<ErrorBox error={new Error(t('ge.langHint'))} />
      {:else if data.error}<ErrorBox error={data.error} onretry={() => data.load()} />
      {:else if !data.loaded}<Skeleton rows={8} />
      {:else if !items.length}<Empty icon="globe" title={t('ge.noRows')} />
      {:else if tab === 'countries'}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('ge.country')}</th><th>{t('ge.codes')}</th><th class="hide-m">{t('ge.continent')}</th><th>{t('ge.callingCode')}</th><th>{t('ge.currency')}</th><th class="hide-m">{t('ge.timezones')}</th></tr></thead>
          <tbody>
            {#each items as c (c.code)}
              <tr>
                <td style="white-space:nowrap">{c.flag} {c.name}{#if c.eu} <span class="badge plain xs">EU</span>{/if}</td>
                <td class="mono small" style="white-space:nowrap">{c.code} · {c.alpha3} · {c.numeric}</td>
                <td class="hide-m small">{c.continent.name}</td>
                <td class="mono small" style="white-space:nowrap">{c.callingCodes.join(', ') || '–'}</td>
                <td class="small">{#if c.currency}<span class="mono">{c.currency.code}</span> <span class="faint hide-m">{c.currency.name}</span>{:else}–{/if}</td>
                <td class="hide-m small mono">{c.timezones.slice(0, 2).join(', ')}{#if c.timezones.length > 2} <span class="faint">+{c.timezones.length - 2}</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {:else if tab === 'currencies'}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('ge.code')}</th><th>{t('ge.name')}</th><th>{t('ge.symbol')}</th><th>{t('ge.decimals')}</th><th class="hide-m">{t('ge.countries')}</th></tr></thead>
          <tbody>
            {#each items as c (c.code)}
              <tr><td class="mono">{c.code}</td><td>{c.name}</td><td>{c.symbol}</td><td>{c.decimals}</td><td class="hide-m small mono">{c.countries.join(', ')}</td></tr>
            {/each}
          </tbody>
        </table></div>
      {:else}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{t('ge.zone')}</th><th>{t('ge.offset')}</th><th class="hide-m">{t('ge.localTime')}</th><th class="hide-m">DST</th><th>{t('ge.countries')}</th></tr></thead>
          <tbody>
            {#each items as z (z.name)}
              <tr><td class="mono small">{z.name}<div class="xs faint">{z.longName}</div></td><td class="mono">{z.offset} <span class="xs faint">{z.abbreviation}</span></td><td class="hide-m mono small">{z.localTime.slice(11, 16)}</td><td class="hide-m small">{z.observesDst ? (z.dst ? t('ge.dstOn') : t('ge.dstOff')) : '–'}</td><td class="small mono">{z.countries.join(', ')}</td></tr>
            {/each}
          </tbody>
        </table></div>
      {/if}
    </Panel>
  </div>
</Page>
