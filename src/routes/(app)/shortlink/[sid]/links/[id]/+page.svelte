<script>import { page } from '$app/state'; import LinkDetail from '$lib/pages/shortlink/LinkDetail.svelte';</script>
<LinkDetail sid={page.params.sid} id={page.params.id} />
