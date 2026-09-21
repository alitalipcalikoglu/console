<script>import { page } from '$app/state'; import IndexDetail from '$lib/pages/search/IndexDetail.svelte';</script>
<IndexDetail sid={page.params.sid} id={page.params.id} />
