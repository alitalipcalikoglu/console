/**
 * Layout probe run in the browser during the visual check of every UI change (see README,
 * "Visual checks"). Paste the body of `probe` into the console, or evaluate this file's default
 * export as a string with the page open. It reports:
 *   page      – horizontal page overflow
 *   nested    – any element whose right edge exceeds its parent's right edge while the parent
 *               does not scroll: clipped icons, inputs wider than their box, text spilling out
 *               (text cut with an ellipsis by a `.truncate` parent is intentional and not reported)
 *   scrollers – intentional scroll containers that currently scroll, and whether the mobile
 *               fade hint is visible
 * Everything inside toasts, dialogs' backdrops and scroll containers is skipped by design.
 */
export const probe = () => {
  const skip = (/** @type {Element} */ el) => Boolean(el.closest('.toasts, .backdrop, script, style, svg *'));
  const scroller = (/** @type {Element} */ el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX);
  const inScroller = (/** @type {Element} */ el) => { for (let p = el.parentElement; p; p = p.parentElement) if (scroller(p)) return true; return false; };
  const path = (/** @type {Element} */ el) => { const parts = []; for (let e = /** @type {Element|null} */ (el); e && parts.length < 4 && e !== document.body; e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return parts.join(' > '); };
  const nested = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (skip(el) || inScroller(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'absolute' || cs.display === 'none' || cs.display === 'contents') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    let p = el.parentElement;
    while (p && (getComputedStyle(p).display === 'contents' || getComputedStyle(p).display.startsWith('inline'))) p = p.parentElement;
    if (!p || p === document.body) continue;
    const pr = p.getBoundingClientRect();
    if (r.right > pr.right + 1 && !scroller(p) && getComputedStyle(p).textOverflow !== 'ellipsis') nested.push({ el: path(el), over: Math.round(r.right - pr.right) });
    if (r.right > innerWidth + 1) nested.push({ el: path(el), over: Math.round(r.right - innerWidth), page: true });
  }
  const scrollers = [...document.querySelectorAll('.table-wrap, .seg')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => ({ cls: e.className, hint: getComputedStyle(e).backgroundImage !== 'none' }));
  const seen = new Set();
  return { path: location.pathname, width: innerWidth, page: document.documentElement.scrollWidth > innerWidth, nested: nested.filter((n) => !seen.has(n.el) && seen.add(n.el)).slice(0, 12), scrollers };
};

export default `(${probe.toString()})()`;
