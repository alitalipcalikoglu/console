<script>
  /** Geo service home: IP, phone and distance lookups, the IP database, place collections. */
  import Page from '$lib/components/Page.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Stat from '$lib/components/Stat.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorBox from '$lib/components/ErrorBox.svelte';
  import Time from '$lib/components/Time.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import ServiceTabs from '$lib/components/ServiceTabs.svelte';
  import AutoRefresh from '$lib/components/AutoRefresh.svelte';
  import PollStats from '$lib/components/PollStats.svelte';
  import CollectionForm from './CollectionForm.svelte';
  import { poller } from '$lib/client/poller.svelte.js';
  import { api } from '$lib/client/api.js';
  import { Resource } from '$lib/client/resource.svelte.js';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { Navigation } from '$lib/client/navigation.js';
  import { useSession } from '$lib/client/session.svelte.js';
  const session = useSession();
  import { services } from '$lib/client/services.svelte.js';
  import { Fmt } from '$lib/client/format.js';
  import { t, i18n } from '$lib/client/i18n.svelte.js';
  import { toasts } from '$lib/client/toast.svelte.js';
  /** @type {{ sid: string }} */
  let { sid } = $props();
  const service = $derived(poller.for(sid));
  $effect(() => service.subscribe(() => Promise.all([stats.load(), list.load()])));
  const fmt = $derived(new Fmt(i18n.lang));
  const base = $derived(`/services/${sid}/geo`);
  const stats = new Resource(() => api.get(`${base}/stats`));
  const list = new Resource(() => api.get(`${base}/collections`));
  $effect(() => { stats.load(); list.load(); });
  const st = $derived(/** @type {any} */ (stats.data));
  const db = $derived(st?.database);
  const items = $derived(/** @type {any[]} */ (list.data?.items ?? []));
  const svc = $derived(services.get(sid));

  // ---- lookups: each keeps its own input, result and error
  let ip = $state(route.url.searchParams.get('ip') ?? '');
  /** @type {any} */ let ipResult = $state(null);
  /** @type {unknown} */ let ipError = $state(null);
  let ipBusy = $state(false);
  async function lookupIp() {
    const v = ip.trim(); if (!v) return;
    ipBusy = true; Navigation.replaceQuery(route.url, { ip: v });
    try { ipResult = await api.get(`${base}/ip?ip=${encodeURIComponent(v)}&lang=${i18n.lang}`); ipError = null; } catch (e) { ipError = e; ipResult = null; } finally { ipBusy = false; }
  }
  let phone = $state('');
  let phoneCountry = $state('');
  /** @type {any} */ let phoneResult = $state(null);
  /** @type {unknown} */ let phoneError = $state(null);
  async function lookupPhone() {
    const v = phone.trim(); if (!v) return;
    try { phoneResult = await api.get(`${base}/phone?number=${encodeURIComponent(v)}${phoneCountry.trim() ? `&country=${encodeURIComponent(phoneCountry.trim())}` : ''}`); phoneError = null; } catch (e) { phoneError = e; phoneResult = null; }
  }
  let from = $state('');
  let to = $state('');
  /** @type {any} */ let distResult = $state(null);
  /** @type {unknown} */ let distError = $state(null);
  const pair = /^\s*-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?\s*$/;
  const distValid = $derived(pair.test(from) && pair.test(to));
  async function lookupDistance() {
    if (!distValid) return;
    try { distResult = await api.get(`${base}/distance?from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}`); distError = null; } catch (e) { distError = e; distResult = null; }
  }
  $effect(() => { if (ip) lookupIp(); });

  // ---- database reload, collections
  let reloading = $state(false);
  async function reload() {
    reloading = true;
    try { await api.post(`${base}/database/reload`, {}); toasts.ok(t('ge.reloaded')); await stats.load(); } catch (e) { toasts.error(e); } finally { reloading = false; }
  }
  let createOpen = $state(false);
  let creating = $state(false);
  /** @param {any} body */
  async function create(body) {
    creating = true;
    try { const r = /** @type {any} */ (await api.post(`${base}/collections`, body)); toasts.ok(t('ge.created', { name: r.collection.name })); createOpen = false; goto(`/geo/${sid}/collections/${r.collection.name}`); }
    catch (e) { toasts.error(e); } finally { creating = false; }
  }
  /** @param {any} c */
  const flagName = (c) => (c ? `${c.code}${c.name && c.name !== c.code ? ` · ${c.name}` : ''}` : '–');
</script>

<Page title={svc?.label ?? t('ge.title')} desc={t('ge.desc')}>
  {#snippet actions()}
    <AutoRefresh {sid} />
    <a class="btn" href="/geo/{sid}/reference"><Icon name="globe" size={16} /><span class="hide-m"> {t('ge.reference')}</span></a>
    {#if session.isAdmin}<button class="btn primary" onclick={() => { createOpen = true; }} aria-label={t('ge.createCollection')} title={t('ge.createCollection')}><Icon name="plus" size={16} /><span class="hide-m"> {t('ge.createCollection')}</span></button>{/if}
    <button class="btn icon" onclick={() => service.trigger()} disabled={service.inFlight} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  <ServiceTabs type="geo" {sid} />
  <PollStats {sid} />
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:20px">
    <Stat label={t('ge.database')} value={db ? (db.loaded ? t('ge.loaded') : db.configured ? t('ge.notLoaded') : t('ge.none')) : undefined} tone={db && db.configured && !db.loaded ? 'danger' : db?.loaded ? 'ok' : ''} sub={db?.city ? `${db.city.type} · ${fmt.dateTime(db.city.builtAt)}` : undefined} />
    <Stat label={t('ge.lookups')} value={db ? fmt.int(db.lookups.hit + db.lookups.miss + db.lookups.special) : undefined} sub={db ? `${fmt.int(db.lookups.hit)} ${t('ge.hit')} · ${fmt.int(db.lookups.miss)} ${t('ge.miss')}` : undefined} />
    <Stat label={t('ge.collections')} value={fmt.int(st?.collections)} />
    <Stat label={t('ge.places')} value={fmt.int(st?.places)} sub={st ? fmt.bytes(st.dbBytes) : undefined} />
  </div>

  <div class="layout two">
    <div class="stack">
      <Panel title={t('ge.ipLookup')} bodyClass="stack">
        <form class="row" style="gap:8px" onsubmit={(e) => { e.preventDefault(); lookupIp(); }}>
          <input class="input grow mono" bind:value={ip} placeholder="81.5.6.7, 2a02:6b8::1" aria-label={t('ge.ip')} maxlength="64" />
          <button type="submit" class="btn" disabled={!ip.trim() || ipBusy}><Icon name="search" size={16} /><span class="hide-m"> {t('ge.lookup')}</span></button>
        </form>
        {#if ipError}<ErrorBox error={ipError} onretry={lookupIp} />
        {:else if ipResult}
          <div class="row wrap" style="gap:6px"><span class="mono">{ipResult.ip}</span><StatusBadge status={ipResult.kind} label={t(`ge.kind.${ipResult.kind}`)} />{#if ipResult.kind === 'public'}<StatusBadge status={ipResult.found ? 'found' : 'missing'} label={ipResult.found ? t('ge.found') : t('ge.notFound')} />{/if}</div>
          {#if ipResult.found || ipResult.asn}
            <dl class="kv">
              {#if ipResult.country}<dt>{t('ge.country')}</dt><dd>{flagName(ipResult.country)}{#if ipResult.country.eu} <span class="badge plain xs">EU</span>{/if}</dd>{/if}
              {#if ipResult.registeredCountry && ipResult.registeredCountry.code !== ipResult.country?.code}<dt>{t('ge.registered')}</dt><dd>{flagName(ipResult.registeredCountry)}</dd>{/if}
              {#if ipResult.region}<dt>{t('ge.region')}</dt><dd>{ipResult.region.name ?? ipResult.region.code}</dd>{/if}
              {#if ipResult.city}<dt>{t('ge.city')}</dt><dd>{ipResult.city.name}{#if ipResult.postal} · {ipResult.postal}{/if}</dd>{/if}
              {#if ipResult.location}<dt>{t('ge.location')}</dt><dd class="row" style="min-width:0"><span class="mono">{ipResult.location.lat}, {ipResult.location.lng}</span><CopyButton text={`${ipResult.location.lat},${ipResult.location.lng}`} />{#if ipResult.location.accuracyKm}<span class="xs faint">±{fmt.int(ipResult.location.accuracyKm)} km</span>{/if}</dd>{/if}
              {#if ipResult.timezone}<dt>{t('ge.timezone')}</dt><dd class="mono">{ipResult.timezone}</dd>{/if}
              {#if ipResult.asn}<dt>ASN</dt><dd>AS{ipResult.asn.number}{#if ipResult.asn.organization} · {ipResult.asn.organization}{/if}</dd>{/if}
              {#if ipResult.network}<dt>{t('ge.network')}</dt><dd class="mono">{ipResult.network}</dd>{/if}
              {#if ipResult.source}<dt>{t('ge.source')}</dt><dd class="small">{ipResult.source}</dd>{/if}
            </dl>
          {:else}<p class="small faint" style="margin:0">{ipResult.kind === 'public' ? t('ge.notFoundDesc') : t('ge.specialDesc')}</p>{/if}
        {:else}<p class="small faint" style="margin:0">{t('ge.ipHint')}</p>{/if}
      </Panel>

      <Panel title={t('ge.phone')} bodyClass="stack">
        <form class="row" style="gap:8px" onsubmit={(e) => { e.preventDefault(); lookupPhone(); }}>
          <input class="input grow mono" bind:value={phone} placeholder="+90 532 123 45 67" aria-label={t('ge.phone')} maxlength="40" />
          <input class="input mono" style="width:72px;flex:none" bind:value={phoneCountry} placeholder="TR" aria-label={t('ge.country')} maxlength="3" />
          <button type="submit" class="btn" disabled={!phone.trim()}><Icon name="search" size={16} /><span class="hide-m"> {t('ge.lookup')}</span></button>
        </form>
        {#if phoneError}<ErrorBox error={phoneError} onretry={lookupPhone} />
        {:else if phoneResult}
          <dl class="kv">
            <dt>E.164</dt><dd class="row" style="min-width:0">{#if phoneResult.e164}<span class="mono">{phoneResult.e164}</span><CopyButton text={phoneResult.e164} />{:else}–{/if}<StatusBadge status={phoneResult.valid ? 'valid' : 'invalid'} label={phoneResult.valid ? t('ge.valid') : t('ge.invalid')} /></dd>
            {#if phoneResult.reason}<dt>{t('ge.reason')}</dt><dd class="small">{phoneResult.reason}</dd>{/if}
            <dt>{t('ge.country')}</dt><dd>{phoneResult.country ?? '–'}{#if phoneResult.countries.length > 1} <span class="xs faint">({phoneResult.countries.join(', ')})</span>{/if}</dd>
            {#if phoneResult.callingCode}<dt>{t('ge.callingCode')}</dt><dd class="mono">{phoneResult.callingCode} · {phoneResult.national}</dd>{/if}
          </dl>
        {:else}<p class="small faint" style="margin:0">{t('ge.phoneHint')}</p>{/if}
      </Panel>

      <Panel title={t('ge.distance')} bodyClass="stack">
        <form class="row wrap" style="gap:8px" onsubmit={(e) => { e.preventDefault(); lookupDistance(); }}>
          <input class="input grow mono" style="min-width:150px" bind:value={from} placeholder="41.0082, 28.9784" aria-label={t('ge.from')} />
          <input class="input grow mono" style="min-width:150px" bind:value={to} placeholder="39.9334, 32.8597" aria-label={t('ge.to')} />
          <button type="submit" class="btn" disabled={!distValid}><Icon name="route" size={16} /><span class="hide-m"> {t('ge.compute')}</span></button>
        </form>
        {#if distError}<ErrorBox error={distError} onretry={lookupDistance} />
        {:else if distResult}<p style="margin:0"><strong>{fmt.int(Math.round(distResult.km))} km</strong> <span class="faint">· {fmt.int(Math.round(distResult.mi))} mi · {t('ge.bearing')} {distResult.bearing}°</span></p>
        {:else}<p class="small faint" style="margin:0">{t('ge.distanceHint')}</p>{/if}
      </Panel>
    </div>

    <div class="stack">
      <Panel title={t('ge.ipDatabase')} bodyClass="stack">
        {#snippet aside()}{#if session.isAdmin && db?.configured}<button class="btn sm" onclick={reload} disabled={reloading}><Icon name="refresh" size={14} /> {t('ge.reload')}</button>{/if}{/snippet}
        {#if stats.error}<ErrorBox error={stats.error} onretry={() => stats.load()} />
        {:else if !db}<Skeleton rows={3} />
        {:else if !db.configured}<Empty icon="globe" title={t('ge.noDbTitle')} desc={t('ge.noDbDesc')} />
        {:else if !db.loaded}<ErrorBox error={new Error(db.error ?? t('ge.notLoaded'))} onretry={session.isAdmin ? reload : undefined} />
        {:else}
          <dl class="kv">
            <dt>{t('ge.dbType')}</dt><dd>{db.city.type}</dd>
            <dt>{t('ge.built')}</dt><dd><Time value={db.city.builtAt} mode="absolute" /> <span class="xs faint">(<Time value={db.city.builtAt} />)</span></dd>
            <dt>{t('ge.file')}</dt><dd class="small mono truncate" title={db.city.path}>{db.city.path} · {fmt.bytes(db.city.sizeBytes)}</dd>
            {#if db.city.languages?.length}<dt>{t('ge.languages')}</dt><dd class="small">{db.city.languages.join(', ')}</dd>{/if}
            <dt>ASN</dt><dd>{#if db.asn}{db.asn.type} · <Time value={db.asn.builtAt} />{:else}<span class="faint">–</span>{/if}</dd>
            <dt>{t('ge.loadedAt')}</dt><dd><Time value={db.loadedAt} /></dd>
          </dl>
        {/if}
      </Panel>

      <Panel title={t('ge.collections')} flush>
        {#if list.error}<ErrorBox error={list.error} onretry={() => list.load()} />
        {:else if (list.loading || !list.loaded) && !items.length}<Skeleton rows={3} />
        {:else if !items.length}<Empty icon="globe" title={t('ge.emptyTitle')} desc={t('ge.emptyDesc')} />
        {:else}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>{t('ge.name')}</th><th>{t('ge.places')}</th><th class="hide-m">{t('common.updated')}</th></tr></thead>
            <tbody>
              {#each items as c (c.name)}
                <tr class="clickable" onclick={() => goto(`/geo/${sid}/collections/${c.name}`)}>
                  <td><code>{c.name}</code>{#if c.description}<div class="xs faint truncate" style="max-width:240px">{c.description}</div>{/if}</td>
                  <td>{fmt.int(c.places)}</td>
                  <td class="hide-m" style="white-space:nowrap"><Time value={c.updatedAt} /></td>
                </tr>
              {/each}
            </tbody>
          </table></div>
        {/if}
      </Panel>
    </div>
  </div>
</Page>

<CollectionForm open={createOpen} busy={creating} onsubmit={create} onclose={() => { createOpen = false; }} />

<style>
  .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (min-width: 1101px) { .layout.two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
</style>
