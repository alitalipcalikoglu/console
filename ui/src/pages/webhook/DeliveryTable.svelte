<script>
  /** Delivery rows shared by the list, subscription and event pages. Columns adapt to what the context already shows. */
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import Time from '../../lib/components/Time.svelte';
  import { router } from '../../lib/router.svelte.js';
  import { Fmt } from '../../lib/format.js';
  import { t, i18n } from '../../lib/i18n.svelte.js';
  /** @type {{ sid: string, items: any[], subscriptions?: Record<string, string>, showSubscription?: boolean, showEvent?: boolean }} */
  let { sid, items, subscriptions = {}, showSubscription = true, showEvent = true } = $props();
  const fmt = $derived(new Fmt(i18n.lang));
</script>

<div class="table-wrap"><table class="table">
  <thead><tr><th>#</th>{#if showSubscription}<th>{t('wh.subscription')}</th>{/if}{#if showEvent}<th>{t('wh.event')}</th>{/if}<th>{t('common.status')}</th><th>{t('common.created')}</th><th class="hide-m">{t('wh.duration')}</th><th class="hide-m">HTTP</th><th class="hide-m">{t('wh.error')}</th></tr></thead>
  <tbody>
    {#each items as d (d.id)}
      <tr class="clickable" onclick={() => router.go(`/webhook-out/${sid}/deliveries/${d.id}`)}>
        <td class="mono small">{d.id}</td>
        {#if showSubscription}<td><code>{subscriptions[d.subscriptionId] ?? d.subscriptionId}</code></td>{/if}
        {#if showEvent}<td class="mono small">{d.eventId}</td>{/if}
        <td><StatusBadge status={d.status} label={t(`wh.dstatus.${d.status}`)} />{#if d.attempt > 1 || d.status === 'retrying'} <span class="xs faint">{d.attempt}/{d.maxAttempts}</span>{/if}</td>
        <td style="white-space:nowrap"><Time value={d.createdAt} /></td>
        <td class="hide-m small">{fmt.ms(d.durationMs)}</td>
        <td class="hide-m mono small">{d.httpStatus ?? '–'}</td>
        <td class="hide-m xs faint truncate" style="max-width:240px" title={d.error ?? ''}>{d.error ?? ''}</td>
      </tr>
    {/each}
  </tbody>
</table></div>
