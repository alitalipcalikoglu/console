<script>import { page } from '$app/state'; import RunDetail from '$lib/pages/scheduler/RunDetail.svelte';</script>
<RunDetail sid={page.params.sid} id={page.params.id} />
