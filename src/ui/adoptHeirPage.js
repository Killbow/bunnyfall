// @ts-check
// BUNNYFALL (2026-11-05, Phase 5): THE HOUSE PAGE'S ADOPTION - a selection of ready-made heirs (a different race, class and sex
// each) and a custom one the player makes (a name, a sex, a race, a class, a face). Drawn into the House page
// (ui/familyPages.js drawHousePage); it asks the provider (`adoptionOffers`, `adoptionRefusal`, `adopt`) and touches no runtime.
import { CLASS_CAREERS } from '../systems/chargen.js';
import { FACES_PER_RACE } from '../systems/races.js';
import { RACE_KEYS } from '../systems/legacy/adoption.js';

let _offers = null, _custom = false, _armed = null, _said = null;
let _form = { given: '', gender: 'female', race: RACE_KEYS[0], careerIndex: 0, face: 0 };
/** Forget what the page held (the pause window closed). */
export function resetAdoptPage() { _offers = null; _custom = false; _armed = null; _said = null; }

/**
 * @param {HTMLElement} detail @param {() => void} rerender
 * @param {{ el: (tag: string, cls?: string|null, text?: string|null) => HTMLElement, prov: any, raceWord: (r: string) => string }} o
 */
export function drawAdoptSection(detail, rerender, { el, prov, raceWord }) {
  if (!prov?.adopt || !prov.adoptionOffers) return;
  detail.append(el('p', 'fam-h', 'Adopt an heir'));
  const no = prov.adoptionRefusal?.() ?? null;
  detail.append(el('p', 'px-note', 'An adopted child joins the house as your own. They are a child until the mantle passes to them, and then they can carry the line on at a final death. Choose one of these, or make your own.'));
  if (_said) { detail.append(el('p', _said.ok ? 'px-note fam-ok' : 'px-note fam-no', _said.text)); }
  if (no) { detail.append(el('p', 'px-note', no)); return; }
  const take = (spec, key) => {
    if (_armed !== key) { _armed = key; _said = { ok: true, text: 'Press again to take this child in.' }; rerender(); return; }
    _armed = null;
    const r = prov.adopt(spec);
    _said = r.ok ? { ok: true, text: `${r.name} is taken into the house.` } : { ok: false, text: r.why ?? 'Not now.' };
    if (r.ok) _offers = null;
    rerender();
  };
  const list = el('div', 'fam-hall');
  _offers ??= prov.adoptionOffers();
  _offers.forEach((o, i) => {
    const row = el('div', 'fam-hallrow');
    row.append(el('div', 'fam-kin', o.given), el('div', 'fam-sub', `${o.gender === 'female' ? 'Girl' : 'Boy'}, ${raceWord(o.race)}, ${CLASS_CAREERS[o.careerIndex]}`));
    const b = el('button', `act fam-adopt${_armed === `o${i}` ? ' primary' : ''}`, _armed === `o${i}` ? 'Yes, take them in' : 'Adopt');
    b.setAttribute('aria-label', `Adopt ${o.given}`);
    b.onclick = () => take(o, `o${i}`);
    row.append(b);
    list.append(row);
  });
  detail.append(list);
  const more = el('button', 'act', 'Show others');
  more.onclick = () => { _offers = null; _armed = null; _said = null; rerender(); };
  const mine = el('button', 'act', _custom ? 'Hide the custom heir' : 'Make a custom heir');
  mine.onclick = () => { _custom = !_custom; _armed = null; _said = null; rerender(); };
  detail.append(more, mine);
  if (!_custom) return;
  // the custom heir: a name, a sex, a race, a class and a face
  const form = el('div', 'fam-grid');
  const field = (label, node) => form.append(el('span', 'k', label), node);
  const name = /** @type {HTMLInputElement} */ (el('input')); name.type = 'text'; name.maxLength = 20; name.value = _form.given; name.placeholder = 'Given name';
  name.oninput = () => { _form.given = name.value; _armed = null; };
  name.onkeydown = (e) => e.stopPropagation();
  const select = (opts, value, set) => {
    const s = /** @type {HTMLSelectElement} */ (el('select'));
    for (const [v, text] of opts) { const op = /** @type {HTMLOptionElement} */ (el('option', null, text)); op.value = String(v); if (String(v) === String(value)) op.selected = true; s.append(op); }
    s.onchange = () => { set(s.value); _armed = null; rerender(); };
    s.onkeydown = (e) => e.stopPropagation();
    return s;
  };
  field('Name', name);
  field('Sex', select([['female', 'Girl'], ['male', 'Boy']], _form.gender, (v) => { _form.gender = v; }));
  field('Race', select(RACE_KEYS.map((r) => [r, raceWord(r)]), _form.race, (v) => { _form.race = v; _form.face = 0; }));
  field('Class', select(CLASS_CAREERS.map((c, i) => [i, c]), _form.careerIndex, (v) => { _form.careerIndex = Number(v); }));
  field('Face', select(Array.from({ length: FACES_PER_RACE }, (_, i) => [i, `Face ${i + 1}`]), _form.face, (v) => { _form.face = Number(v); }));
  detail.append(form);
  const go = el('button', `act fam-adopt${_armed === 'custom' ? ' primary' : ''}`, _armed === 'custom' ? 'Yes, take them in' : 'Adopt this child');
  go.onclick = () => take({ ..._form }, 'custom');
  detail.append(go);
}
