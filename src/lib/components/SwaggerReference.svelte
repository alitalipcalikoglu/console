<script>
  import { onMount } from 'svelte';
  import { swaggerOptions } from '$lib/client/swagger-config.js';

  /** @type {{ document: Record<string, unknown> }} */
  let { document } = $props();
  let host = $state(/** @type {HTMLDivElement|null} */ (null));
  let failed = $state(false);
  let ready = $state(false);

  onMount(() => {
    if (!host) return;
    let active = true;
    Promise.all([
      import('swagger-ui-dist/swagger-ui-es-bundle.js'),
      import('swagger-ui-dist/swagger-ui.css'),
    ]).then(([{ default: SwaggerUI }]) => {
      if (active) {
        SwaggerUI(swaggerOptions(document, host));
        ready = true;
      }
    }).catch(() => {
      if (active) failed = true;
    });
    return () => {
      active = false;
      host?.replaceChildren();
    };
  });
</script>

{#if failed}<p class="reference-error" role="alert">Documentation renderer could not be loaded.</p>{/if}
<div class="reference" bind:this={host} aria-busy={!failed && !ready}></div>

<style>
  .reference { min-width: 0; overflow: hidden; }
  .reference-error { margin: 20px; color: var(--danger); }
  .reference :global(.swagger-ui) { color: var(--text); font-family: inherit; }
  .reference :global(.swagger-ui .wrapper) { max-width: none; padding: 0 16px 20px; }
  .reference :global(.swagger-ui .info) { margin: 24px 0; }
  .reference :global(.swagger-ui .info .title),
  .reference :global(.swagger-ui .info p),
  .reference :global(.swagger-ui .info li),
  .reference :global(.swagger-ui .opblock-tag),
  .reference :global(.swagger-ui .opblock-description-wrapper p),
  .reference :global(.swagger-ui .opblock-external-docs-wrapper p),
  .reference :global(.swagger-ui .opblock-title_normal p),
  .reference :global(.swagger-ui .parameter__name),
  .reference :global(.swagger-ui .parameter__type),
  .reference :global(.swagger-ui .response-col_status),
  .reference :global(.swagger-ui .responses-inner h4),
  .reference :global(.swagger-ui .responses-inner h5),
  .reference :global(.swagger-ui .model-title),
  .reference :global(.swagger-ui .model),
  .reference :global(.swagger-ui table thead tr td),
  .reference :global(.swagger-ui table thead tr th) { color: var(--text); font-family: inherit; }
  .reference :global(.swagger-ui .opblock-tag) { border-color: var(--border); }
  .reference :global(.swagger-ui .scheme-container),
  .reference :global(.swagger-ui section.models) { background: var(--surface); box-shadow: none; border-color: var(--border); }
  .reference :global(.swagger-ui input[type=text]) { background: var(--surface); border-color: var(--border-strong); color: var(--text); }
  .reference :global(.swagger-ui .topbar),
  .reference :global(.swagger-ui .authorization__btn),
  .reference :global(.swagger-ui .authorize),
  .reference :global(.swagger-ui .try-out),
  .reference :global(.swagger-ui .execute-wrapper) { display: none !important; }
  .reference :global(.swagger-ui a) { color: var(--accent); }
  .reference :global(.swagger-ui svg) { fill: currentColor; }
  @media (max-width: 700px) {
    .reference :global(.swagger-ui .wrapper) { padding: 0 8px 16px; }
    .reference :global(.swagger-ui .opblock .opblock-summary-operation-id) { display: none; }
    .reference :global(.swagger-ui .opblock-summary-path) { max-width: 54vw; }
    .reference :global(.swagger-ui .info .title) { font-size: 1.5rem; }
  }
</style>
