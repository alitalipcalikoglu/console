import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.principal && locals.session && !locals.session.totpPending) redirect(303, '/');
  return {};
};
