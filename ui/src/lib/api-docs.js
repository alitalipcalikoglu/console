/**
 * Loads the allowlisted documentation services and resolves a stable initial selection.
 * @param {(path: string) => Promise<unknown>} get
 * @param {string} selected
 */
export async function fetchDocServices(get, selected) {
  const data = /** @type {{ items: { id: string, type: string, label: string }[] }} */ (await get('/docs/services'));
  const items = Array.isArray(data.items) ? data.items : [];
  return { items, selected: items.some((service) => service.id === selected) ? selected : (items[0]?.id ?? '') };
}

/**
 * Loads one service-scoped parsed document. Keeping this boundary outside the renderer makes
 * failed-service recovery testable without coupling tests to Swagger UI's internal DOM.
 * @param {(path: string) => Promise<unknown>} get
 * @param {string} selected
 */
export async function fetchOpenApi(get, selected) {
  const data = /** @type {{ document: Record<string, unknown> }} */ (
    await get(`/docs/services/${encodeURIComponent(selected)}/openapi`)
  );
  return data.document;
}
