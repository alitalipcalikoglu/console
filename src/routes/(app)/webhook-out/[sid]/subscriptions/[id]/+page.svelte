<script>import { page } from '$app/state'; import SubscriptionDetail from '$lib/pages/webhook/SubscriptionDetail.svelte';</script>
<SubscriptionDetail sid={page.params.sid} id={page.params.id} />
