import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.principal || !locals.session || locals.session.totpPending) redirect(303, '/login');
  return {};
};
