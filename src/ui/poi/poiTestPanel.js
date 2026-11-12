// @ts-check
// The in-game POI editor's Test panel (poi/poiDmTest.js): the throwaway purse and pack the test settles on (gold, what
// was gained and given up, with a way to add gold or an item to try a trade), the enemies the test stood, the run's
// values, and a log of what fired in the Sandbox's words. Drawn in the editor's right dock while a test runs.

import { t } from '../../systems/textManager.js';
import { itemChoices, groupWord, stateWord } from '../../poi/poiDmEdit.js';
import { itemLongName } from '../../systems/item/itemInfo.js';
import { logText } from './poiSandbox.js';

/** A pack's records counted by name. @param {any[]} items */
function countsOf(items) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const it of items ?? []) {
    let name;
    try { name = itemLongName(it); } catch { name = String(it?.name ?? it?.templateIndex ?? '?'); }
    out.set(name, (out.get(name) ?? 0) + (Number.isInteger(it?.stackCount) && it.stackCount > 0 ? it.stackCount : 1));
  }
  return out;
}
/** What `b` holds more of than `a`, as words. @param {Map<string, number>} a @param {Map<string, number>} b */
function moreIn(a, b) {
  const out = [];
  for (const [name, n] of b) { const d = n - (a.get(name) ?? 0); if (d > 0) out.push(d > 1 ? `${d} ${name}` : name); }
  return out.join(', ');
}

/**
 * @param {{ test: any, el: (tag: string, cls?: string, text?: string | null) => any, btn: (text: string, fn: () => void, cls?: string) => any,
 *   redraw: () => void, onStop: () => void }} o
 */
export function createPoiTestPanel({ test, el, btn, redraw, onStop }) {
  let pickAt = '71', countAt = '1';
  const section = (/** @type {string} */ title, /** @type {any[]} */ ...kids) => { const s = el('div', 'dfpoi-card'); s.append(el('div', 'dfpoi-h', title), ...kids.filter(Boolean)); return s; };
  const row = (/** @type {any[]} */ ...kids) => { const r = el('div', 'dfpoi-row'); r.append(...kids.filter(Boolean)); return r; };
  const none = () => t('poi.sandbox.none', 'none');

  /** The banner line said in the bar and over the panel. */
  function banner() {
    const on = test.testing();
    return on ? t('poi.test.banner', 'Testing {name}. Trades and events use a test copy of your gold and items. The game is not saved, and your character is put back when the test ends.', { name: on.name }) : '';
  }

  function purse() {
    const p = test.purse();
    if (!p) return null;
    const first = countsOf(p.first.items), now = countsOf(p.now.items);
    const gold = el('input');
    gold.type = 'number'; gold.min = '0'; gold.value = String(p.now.goldPieces);
    gold.addEventListener('change', () => { test.setGold(Number(gold.value)); redraw(); });
    const pick = el('select');
    let group = null, og = null;
    for (const it of itemChoices()) {
      if (it.group !== group) { group = it.group; og = el('optgroup'); og.label = groupWord(group); pick.append(og); }
      const op = el('option', '', it.name); op.value = String(it.template); og.append(op);
    }
    pick.value = pickAt;
    pick.addEventListener('change', () => { pickAt = pick.value; });
    const count = el('input');
    count.type = 'number'; count.min = '1'; count.value = countAt;
    count.addEventListener('change', () => { countAt = count.value; });
    let carried = 0;
    for (const n of now.values()) carried += n;
    return section(t('poi.test.purse', 'Test gold and items'),
      row(el('label', '', t('poi.sandbox.gold', 'Gold')), gold, el('span', 'dfpoi-sub', t('poi.test.goldWas', 'was {n, number}', { n: p.first.goldPieces }))),
      el('div', '', t('poi.test.gained', 'Gained: {list}', { list: moreIn(first, now) || none() })),
      el('div', '', t('poi.test.givenUp', 'Given up: {list}', { list: moreIn(now, first) || none() })),
      el('div', 'dfpoi-sub', t('poi.test.carrying', 'Carrying {n, plural, one {# item} other {# items}}.', { n: carried })),
      row(el('label', '', t('poi.sandbox.addItem', 'Add an item')), pick, count, btn(t('poi.sandbox.add', 'Add'), () => {
        test.addStack({ template: Number(pick.value), count: Math.max(1, Math.floor(Number(count.value)) || 1) }); redraw();
      })));
  }

  function state() {
    const m = test.model();
    if (!m) return null;
    const d = m.doc;
    const nameIn = (/** @type {string} */ coll, /** @type {string} */ key) => (d[coll] ?? []).find((/** @type {any} */ r) => r.key === key)?.name ?? key;
    const kindOf = (/** @type {string} */ key) => (d.interactives ?? []).find((/** @type {any} */ o) => o.key === key)?.kind;
    /** @type {Record<string, () => string>} */
    const enc = { idle: () => t('poi.sandbox.enc.idle', 'waiting'), active: () => t('poi.sandbox.enc.active', 'fighting'), done: () => t('poi.sandbox.enc.done', 'won') };
    return section(t('poi.test.now', 'The test now'),
      el('div', '', t('poi.test.enemies', 'Enemies standing: {n, number}', { n: test.enemies() })),
      el('div', '', t('poi.sandbox.encountersNow', 'Encounters: {list}', { list: Object.entries(m.encounters).map(([k, v]) => `${nameIn('encounters', k)} ${enc[String(v)]?.() ?? v}`).join(', ') || none() })),
      el('div', '', t('poi.sandbox.objectsNow', 'Objects: {list}', { list: Object.entries(m.states).map(([k, v]) => `${nameIn('interactives', k)} ${stateWord(String(v), kindOf(k))}`).join(', ') || none() })),
      el('div', '', t('poi.sandbox.valuesNow', 'Values: {list}', { list: Object.entries(m.vars).map(([k, v]) => `${nameIn('variables', k)} = ${JSON.stringify(v)}`).join(', ') || none() })));
  }

  /** The Test panel, drawn fresh. */
  function view() {
    const box = el('div', 'dfpoi-test');
    box.append(el('div', 'dfpoi-warn', banner()));
    box.append(row(btn(t('poi.test.stop', 'Stop test'), () => onStop()), btn(t('poi.test.reset', 'Start again'), () => { test.reset().then(() => redraw()); })));
    box.append(el('div', 'dfpoi-sub', t('poi.test.resetHint', 'Start again copies your gold and items again and sets every value, object, and encounter back to how it is authored.')));
    const p = purse(), s = state();
    if (p) box.append(p);
    if (s) box.append(s);
    const m = test.model();
    // the test settles such an event itself, so the Sandbox's "would be settled by the realm" line is left out
    const lines = m ? m.log.filter((/** @type {any} */ l) => l.k !== 'to_service').map((/** @type {any} */ l) => logText(m.doc, l)) : [];
    box.append(section(t('poi.sandbox.log', 'Log ({n, plural, one {# step} other {# steps}})', { n: lines.length }), el('pre', 'dfpoi-dm-log', lines.join('\n') || t('poi.sandbox.empty', 'Nothing has happened yet.'))));
    // what the end of a test does not put back (the world's own, outside the character)
    box.append(el('div', 'dfpoi-sub', t('poi.test.limits', 'Other POIs wait while you test. A quest step taken in a test stays done, and loot taken from the world\'s own enemies is gone when the test ends.')));
    box.append(el('div', 'dfpoi-sub', t('poi.test.limitsArrows', 'Arrows you shoot come back to your pack when the test ends, and the ones that landed can still be picked up.')));
    return box;
  }

  return { view, banner };
}
