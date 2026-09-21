import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  const pending = locals.session?.totpPending === true;
  const principal = locals.principal;
  return {
    auth: {
      admin: principal && !pending ? {
        id: principal.id,
        email: principal.email,
        name: principal.name,
        role: principal.role,
        totpEnabled: principal.totpEnabled,
        lastLoginAt: null,
      } : null,
      totpPending: Boolean(principal && pending),
    },
  };
};
