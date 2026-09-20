export const SERVER_ONLY_SENTINEL = 'M1_SERVER_ONLY_BOUNDARY_6f0d44b1';

export function foundationState() {
  return Object.freeze({
    stage: 'M1',
    renderer: 'SvelteKit SSR',
    runtime: 'adapter-node',
    serverBoundary: SERVER_ONLY_SENTINEL.startsWith('M1_SERVER_ONLY_BOUNDARY_'),
  });
}
