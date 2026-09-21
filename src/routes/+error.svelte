<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head><title>{page.status === 404 ? 'Page not found' : 'Error'} · Console</title></svelte:head>

<main class="error-page">
  <section class="card error-card">
    <p class="subhead">{page.status}</p>
    <h1>{page.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
    <p class="muted">{page.status === 404 ? 'This address does not exist in Console.' : page.error?.message}</p>
    <a class="btn primary" href="/">Return to overview</a>
  </section>
</main>

<style>
  .error-page { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
  .error-card { width: min(440px, 100%); padding: 28px; display: flex; flex-direction: column; gap: 14px; }
  .error-card .btn { align-self: flex-start; }
</style>
