import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.principal?.role !== 'admin') error(403, 'administrator access required');
  return {};
};
