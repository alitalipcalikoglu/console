/**
 * Swagger UI is used as a renderer only. Supplying a document object avoids a spec fetch;
 * an empty submit-method list removes request execution for every HTTP verb, and the defensive
 * interceptor rejects any request should a future renderer change bypass that control.
 * @param {Record<string, unknown>} document
 * @param {HTMLElement} domNode
 */
export function swaggerOptions(document, domNode) {
  return {
    domNode,
    spec: document,
    url: null,
    validatorUrl: null,
    supportedSubmitMethods: [],
    tryItOutEnabled: false,
    persistAuthorization: false,
    withCredentials: false,
    requestInterceptor: () => Promise.reject(new Error('API request execution is disabled in Console documentation')),
    deepLinking: false,
    displayOperationId: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 1,
    filter: true,
    syntaxHighlight: { activated: true, theme: 'agate' },
  };
}
