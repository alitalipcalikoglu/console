<script>import { page } from '$app/state'; import UserDetail from '$lib/pages/auth/UserDetail.svelte';</script>
<UserDetail sid={page.params.sid} id={page.params.id} />
