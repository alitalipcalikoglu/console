<script>
  import Page from '$lib/components/Page.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorBox from '$lib/components/ErrorBox.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Time from '$lib/components/Time.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import { api } from '$lib/client/api.js';
  import { Resource } from '$lib/client/resource.svelte.js';
  import { useSession } from '$lib/client/session.svelte.js';
  const session = useSession();
  import { t } from '$lib/client/i18n.svelte.js';
  import { toasts } from '$lib/client/toast.svelte.js';
  /** @type {{ sid: string, id: string }} */
  let { sid, id } = $props();
  const res = new Resource(() => api.get(`/services/${sid}/notify/messages/${id}`));
  $effect(() => { res.load(); });
  const m = $derived(/** @type {any} */ (res.data));
  async function retry() { try { res.data = await api.post(`/services/${sid}/notify/messages/${id}/retry`); toasts.ok(t('notify.retryDone')); } catch (e) { toasts.error(e); } }
</script>

<Page title={t('notify.message')} back="/notify/{sid}">
  {#snippet actions()}
    {#if m?.status === 'failed' && session.isAdmin}<button class="btn primary" onclick={retry}><Icon name="refresh" size={16} /> {t('notify.retry')}</button>{/if}
    <button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
  {/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} boxed />
  {:else if !m}<Skeleton rows={8} />
  {:else}
    <div class="card"><div class="card-body">
      <div class="row wrap" style="margin-bottom:14px"><StatusBadge status={m.status} label={t(`notify.${m.status}`)} /><span class="mono small muted">{m.id}</span><CopyButton text={m.id} /></div>
      <dl class="kv">
        <dt>{t('notify.channel')}</dt><dd class="row"><Icon name={m.channel === 'email' ? 'mail' : 'webhook'} size={14} /> {m.channel}</dd>
        {#if m.template}<dt>{t('notify.template')}</dt><dd><code>{m.template}</code></dd>{/if}
        {#if m.event}<dt>{t('notify.event')}</dt><dd><code>{m.event}</code></dd>{/if}
        {#if m.to}<dt>{t('notify.to')}</dt><dd>{m.to.join(', ')}</dd>{/if}
        {#if m.url}<dt>{t('notify.url')}</dt><dd class="mono small">{m.url}</dd>{/if}
        <dt>{t('notify.attempts')}</dt><dd>{m.attempts} / {m.maxAttempts}</dd>
        {#if m.nextAttemptAt}<dt>{t('notify.nextAttempt')}</dt><dd><Time value={m.nextAttemptAt} /></dd>{/if}
        {#if m.lastError}<dt>{t('notify.lastError')}</dt><dd class="danger-text small">{m.lastError}</dd>{/if}
        {#if m.providerId}<dt>{t('notify.provider')}</dt><dd class="mono small">{m.providerId}</dd>{/if}
        <dt>{t('common.created')}</dt><dd><Time value={m.createdAt} mode="absolute" /></dd>
        <dt>{t('common.updated')}</dt><dd><Time value={m.updatedAt} mode="absolute" /></dd>
        {#if m.sentAt}<dt>{t('notify.sent')}</dt><dd><Time value={m.sentAt} mode="absolute" /></dd>{/if}
      </dl>
    </div></div>
  {/if}
</Page>
