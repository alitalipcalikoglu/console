<script>import { page } from '$app/state'; import PolicyDetail from '$lib/pages/ratelimit/PolicyDetail.svelte';</script>
<PolicyDetail sid={page.params.sid} id={page.params.id} />
