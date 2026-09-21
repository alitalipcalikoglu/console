<script>import { page } from '$app/state'; import FileDetail from '$lib/pages/media/FileDetail.svelte';</script>
<FileDetail sid={page.params.sid} id={page.params.id} />
