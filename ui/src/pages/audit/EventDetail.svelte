<script>
  import Page from '../../lib/components/Page.svelte';
  import Panel from '../../lib/components/Panel.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';
  import Icon from '../../lib/components/Icon.svelte';
  import Skeleton from '../../lib/components/Skeleton.svelte';
  import ErrorBox from '../../lib/components/ErrorBox.svelte';
  import Time from '../../lib/components/Time.svelte';
  import CopyButton from '../../lib/components/CopyButton.svelte';
  import { api } from '../../lib/api.js';
  import { Resource } from '../../lib/resource.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  /** @type {{ sid: string, id: string }} */
  let { sid, id } = $props();
  const res = new Resource(() => api.get(`/services/${sid}/audit/events/${id}`));
  $effect(() => { res.load(); });
  const e = $derived(/** @type {any} */ (res.data)?.event);
  /** @param {Record<string, string>} q */
  const link = (q) => `/audit/${sid}?${new URLSearchParams(q)}`;
  const metaText = $derived(e?.meta ? JSON.stringify(e.meta, null, 2) : '');
  const redacted = $derived(metaText.includes('"[REDACTED]"'));
</script>

<Page title={t('ev.event')} back="/audit/{sid}">
  {#snippet actions()}<button class="btn icon" onclick={() => res.load()} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>{/snippet}
  {#if res.error}<ErrorBox error={res.error} onretry={() => res.load()} />
  {:else if !e}<Skeleton rows={10} />
  {:else}
    <div class="stack">
      <div class="card"><div class="card-body">
        <div class="row wrap" style="margin-bottom:14px">
          <StatusBadge status={e.outcome} label={t(`ev.${e.outcome}`)} />
          <code style="font-size:1rem;font-weight:600">{e.action}</code>
          <span class="mono small muted truncate" style="max-width:100%">{e.id}</span><CopyButton text={e.id} />
        </div>
        <dl class="kv">
          <dt>{t('ev.at')}</dt><dd><Time value={e.at} mode="absolute" /> <span class="faint small">(<Time value={e.at} />)</span></dd>
          <dt>{t('ev.receivedAt')}</dt><dd><Time value={e.receivedAt} mode="absolute" /></dd>
          <dt>{t('ev.source')}</dt><dd><a href={link({ source: e.source })}>{e.source}</a></dd>
          <dt>{t('ev.actor')}</dt><dd>{#if e.actor}<span class="mono">{e.actor.type}:{e.actor.id}</span>{#if e.actor.name} · {e.actor.name}{/if} <a class="small" href={link({ actorType: e.actor.type, actorId: e.actor.id })}>{t('ev.eventsOfActor')}</a>{:else}<span class="faint">–</span>{/if}</dd>
          <dt>{t('ev.target')}</dt><dd>{#if e.target}<span class="mono">{e.target.type}:{e.target.id}</span>{#if e.target.name} · {e.target.name}{/if} <a class="small" href={link({ targetType: e.target.type, targetId: e.target.id })}>{t('ev.eventsOfTarget')}</a>{:else}<span class="faint">–</span>{/if}</dd>
          <dt>{t('common.ip')}</dt><dd class="mono">{e.ip ?? '–'}</dd>
          <dt>{t('ev.userAgent')}</dt><dd class="small" style="word-break:break-all">{e.userAgent ?? '–'}</dd>
          <dt>{t('ev.requestId')}</dt><dd class="mono small">{#if e.requestId}{e.requestId} <a href={link({ requestId: e.requestId })}>{t('ev.sameRequest')}</a>{:else}–{/if}</dd>
          {#if e.clientId}<dt>{t('ev.clientId')}</dt><dd class="mono small">{e.clientId}</dd>{/if}
        </dl>
      </div></div>
      <Panel title={t('ev.meta')}>
        {#snippet aside()}{#if redacted}<span class="xs faint">{t('ev.viaRedaction')}</span>{/if}{/snippet}
        {#if e.meta}<pre class="meta">{metaText}</pre>{:else}<p class="small faint">–</p>{/if}
      </Panel>
      <Panel title={t('ev.hash')}>
        {#snippet aside()}<span class="xs faint mono">{t('ev.seq')} {e.seq}</span>{/snippet}
        <dl class="kv">
          <dt>{t('ev.hash')}</dt><dd class="row" style="min-width:0"><span class="mono small truncate">{e.hash}</span><CopyButton text={e.hash} /></dd>
          <dt>{t('ev.prevHash')}</dt><dd class="row" style="min-width:0"><span class="mono small truncate">{e.prevHash}</span><CopyButton text={e.prevHash} /></dd>
        </dl>
      </Panel>
    </div>
  {/if}
</Page>

<style>
  .meta { margin: 0; padding: 12px; background: var(--surface-2); border-radius: var(--radius-sm); font-family: var(--mono); font-size: .82rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-height: 60vh; overflow: auto; }
</style>
