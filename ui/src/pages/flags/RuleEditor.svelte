<script>
  /**
   * Ordered targeting rules for one environment. Lists are edited as comma-separated text,
   * attributes as `name: a, b` lines; ids are derived from names when empty.
   */
  import Icon from '../../lib/components/Icon.svelte';
  import ValueInput from './ValueInput.svelte';
  import { t } from '../../lib/i18n.svelte.js';
  /** @typedef {{ id: string, name?: string, match: { userIds?: string[], emails?: string[], attrs?: Record<string, string[]> }, value: unknown }} Rule */
  /** @type {{ kind: 'boolean'|'string'|'number'|'json', rules: Rule[], onchange: (rules: Rule[]) => void, disabled?: boolean, defaultValue: unknown }} */
  let { kind, rules, onchange, disabled = false, defaultValue } = $props();
  const list = (/** @type {string[]|undefined} */ a) => (a ?? []).join(', ');
  const parse = (/** @type {string} */ s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const attrsText = (/** @type {Record<string, string[]>|undefined} */ a) => Object.entries(a ?? {}).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n');
  /** @param {string} s */
  function parseAttrs(s) {
    /** @type {Record<string, string[]>} */ const out = {};
    for (const line of s.split('\n')) { const i = line.indexOf(':'); if (i > 0) { const k = line.slice(0, i).trim(); const v = parse(line.slice(i + 1)); if (k && v.length) out[k] = v; } }
    return out;
  }
  /** @param {number} i @param {Partial<Rule>} patch */
  function update(i, patch) { onchange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r))); }
  /** @param {number} i @param {Partial<Rule['match']>} patch */
  function updateMatch(i, patch) { const m = { ...rules[i].match, ...patch }; for (const k of /** @type {const} */ (['userIds', 'emails'])) if (!m[k]?.length) delete m[k]; if (m.attrs && !Object.keys(m.attrs).length) delete m.attrs; update(i, { match: m }); }
  function add() { onchange([...rules, { id: `rule-${rules.length + 1}`, name: '', match: {}, value: defaultValue }]); }
  /** @param {number} i @param {number} dir */
  function move(i, dir) { const j = i + dir; if (j < 0 || j >= rules.length) return; const next = [...rules]; [next[i], next[j]] = [next[j], next[i]]; onchange(next); }
  const slug = (/** @type {string} */ s) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
</script>

<div class="stack">
  {#each rules as r, i (i)}
    <div class="rule">
      <div class="head">
        <span class="badge plain">{i + 1}</span>
        <input class="input name" placeholder={t('fl.ruleName')} value={r.name ?? ''} {disabled} oninput={(e) => { const name = /** @type {HTMLInputElement} */ (e.currentTarget).value; update(i, { name, id: r.id.startsWith('rule-') || r.id === slug(r.name ?? '') ? (slug(name) || r.id) : r.id }); }} />
        <span class="tools">
          <button class="btn ghost icon sm" {disabled} onclick={() => move(i, -1)} aria-label={t('fl.moveUp')} title={t('fl.moveUp')}><Icon name="chevron" size={14} /></button>
          <button class="btn ghost icon sm" {disabled} onclick={() => move(i, 1)} aria-label={t('fl.moveDown')} title={t('fl.moveDown')}><Icon name="chevron" size={14} /></button>
          <button class="btn ghost icon sm danger" {disabled} onclick={() => onchange(rules.filter((_, j) => j !== i))} aria-label={t('common.delete')} title={t('common.delete')}><Icon name="trash" size={14} /></button>
        </span>
        <span class="mono xs faint id">id: {r.id}</span>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
        <div class="field"><label for="r-{i}-users">{t('fl.userIds')}</label><input id="r-{i}-users" class="input mono" value={list(r.match.userIds)} {disabled} onchange={(e) => updateMatch(i, { userIds: parse(/** @type {HTMLInputElement} */ (e.currentTarget).value) })} placeholder="u_1001, u_1002" /></div>
        <div class="field"><label for="r-{i}-emails">{t('fl.emails')}</label><input id="r-{i}-emails" class="input mono" value={list(r.match.emails)} {disabled} onchange={(e) => updateMatch(i, { emails: parse(/** @type {HTMLInputElement} */ (e.currentTarget).value) })} placeholder="ada@example.com" /></div>
        <div class="field"><label for="r-{i}-attrs">{t('fl.attrs')}</label><textarea id="r-{i}-attrs" class="textarea mono" rows="2" value={attrsText(r.match.attrs)} {disabled} onchange={(e) => updateMatch(i, { attrs: parseAttrs(/** @type {HTMLTextAreaElement} */ (e.currentTarget).value) })} placeholder="plan: pro, team"></textarea></div>
        <div class="field"><label for="r-{i}-value">{t('fl.serves')}</label><ValueInput id="r-{i}-value" {kind} value={r.value} {disabled} onchange={(v) => update(i, { value: v })} /></div>
      </div>
    </div>
  {/each}
  {#if !disabled}<div><button class="btn sm" onclick={add}><Icon name="plus" size={14} /> {t('fl.addRule')}</button></div>{/if}
  {#if !rules.length && disabled}<p class="small faint" style="margin:0">{t('fl.noRules')}</p>{/if}
</div>

<style>
  .rule { padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); min-width: 0; }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; min-width: 0; }
  .head .name { flex: 1 1 140px; min-width: 0; }
  .head .tools { display: inline-flex; gap: 2px; flex: none; }
  .head .tools .btn:nth-child(1) :global(svg) { transform: rotate(-90deg); }
  .head .tools .btn:nth-child(2) :global(svg) { transform: rotate(90deg); }
  .head .id { flex: 1 1 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
