<script>import { page } from '$app/state'; import DeliveryDetail from '$lib/pages/webhook/DeliveryDetail.svelte';</script>
<DeliveryDetail sid={page.params.sid} id={page.params.id} />
