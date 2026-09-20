import { foundationState } from '$lib/server/foundation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => foundationState();
