/**
 * What the current page wants shown in the app bar: title, description, back link and action
 * buttons. Pages set it through <Page>; the Shell renders it, so actions never cost a row.
 */
export class PageState {
  constructor() {
    this.title = $state('');
    this.desc = $state('');
    /** @type {string|null} */
    this.back = $state(null);
    /** @type {import('svelte').Snippet|null} */
    this.actions = $state(null);
  }

  /** @param {{ title: string, desc?: string, back?: string|null, actions?: import('svelte').Snippet|null }} p */
  set(p) {
    this.title = p.title;
    this.desc = p.desc ?? '';
    this.back = p.back ?? null;
    this.actions = p.actions ?? null;
  }

  clear() {
    this.title = '';
    this.desc = '';
    this.back = null;
    this.actions = null;
  }
}

export const page = new PageState();
