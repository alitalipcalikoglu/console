<script>import { page } from '$app/state'; import EventDetail from '$lib/pages/audit/EventDetail.svelte';</script>
<EventDetail sid={page.params.sid} id={page.params.id} />
