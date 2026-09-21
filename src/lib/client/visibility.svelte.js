/** Whether the tab is visible. Timers subscribe to this so hidden tabs generate no traffic. */
export class Visibility {
  constructor() {
    this.visible = $state(typeof document === 'undefined' ? true : !document.hidden);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { this.visible = !document.hidden; });
  }
}

export const visibility = new Visibility();
