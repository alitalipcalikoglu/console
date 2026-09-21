<script>import { page } from '$app/state'; import JobDetail from '$lib/pages/scheduler/JobDetail.svelte';</script>
<JobDetail sid={page.params.sid} id={page.params.id} />
