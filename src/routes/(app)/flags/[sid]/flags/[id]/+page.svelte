<script>import { page } from '$app/state'; import FlagDetail from '$lib/pages/flags/FlagDetail.svelte';</script>
<FlagDetail sid={page.params.sid} id={page.params.id} />
