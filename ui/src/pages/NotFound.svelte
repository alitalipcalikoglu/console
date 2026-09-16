<script>
  import Empty from '../lib/components/Empty.svelte';
  import { t } from '../lib/i18n.svelte.js';
</script>
<Empty icon="alert" title={t('common.notFound')} desc={t('common.notFoundDesc')}><a class="btn" href="/">{t('common.goHome')}</a></Empty>
