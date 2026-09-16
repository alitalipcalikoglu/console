<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Empty from '../../lib/components/Empty.svelte';
  import Time from '../../lib/components/Time.svelte';
  import CopyButton from '../../lib/components/CopyButton.svelte';
  import DeliveryTable from './DeliveryTable.svelte';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  /** @type {{ sid: string, id: string }} */
  let { sid, id } = $props();
  const res = new Resource(() => api.get(`/services/${sid}/webhook-out/events/${encodeURIComponent(id)}`));
  $effect(() => { res.load(); });
  const d = $derived(/** @type {any} */ (res.data));
  const e = $derived(d?.event);
  const json = $derived(e ? JSON.stringify(e.data, null, 2) : '');
</script>

<Page title={e ? e.type : t('wh.event')} back="/webhook-out/{sid}">
  {#snippet actions()}
    <button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !e}<Skeleton rows={8} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        <div class="row wrap" style="margin-bottom:12px"><code>{e.type}</code>{#if e.test}<span class="badge plain">{t('wh.testEvent')}</span>{/if}</div>
        <dl class="kv">
          <dt>{t('common.id')}</dt><dd class="row" style="min-width:0"><span class="mono">{e.id}</span><CopyButton text={e.id} /></dd>
          <dt>{t('common.created')}</dt><dd><Time value={e.createdAt} mode="absolute" /> <span class="faint small">(<Time value={e.createdAt} />)</span></dd>
          <dt>{t('wh.source')}</dt><dd class="mono">{e.source}</dd>
          {#if e.idempotencyKey}<dt>{t('wh.idempotencyKey')}</dt><dd class="mono">{e.idempotencyKey}</dd>{/if}
          <dt>{t('wh.data')}</dt><dd><pre class="result">{json}</pre></dd>
        </dl>
      </div></div>
      <Panel title={t('wh.deliveries')} flush>
        {#if !d.deliveries.length}<Empty icon="history" title={t('wh.noDeliveries')} />
        {:else}<DeliveryTable {sid} items={d.deliveries} showEvent={false} />{/if}
      </Panel>
    </div>
  {/if}
</Page>
