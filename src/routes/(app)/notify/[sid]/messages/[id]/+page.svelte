<script>import { page } from '$app/state'; import MessageDetail from '$lib/pages/notify/MessageDetail.svelte';</script>
<MessageDetail sid={page.params.sid} id={page.params.id} />
