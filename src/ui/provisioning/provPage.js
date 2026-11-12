// @ts-check
// BUNNYFALL PROVISIONING (docs/PROVISIONING.md): THE PAGE - its own line on the Crafting rail. The book on the left, the
// pot or cauldron on parchment, the ingredients beside it, what it will make below. Away from a fire or an alchemy table
// the book and the plan are read; the make is the station's. Every number is the shared law's (provisionLaw.js), the
// service's own; the make is the service's (provisioning.js).

import {
  provPlan, traitsOf, traitName, traitKnown, slotsAt, BASES, POT_KEYS, CAULDRON_KEYS, FOOD_TRAITS, ALCHEMY_TRAITS, PREPARES, provXp, GROCER_STOCK,
} from '../../net/provision/provisionLaw.js';
import { DISHES } from '../../net/recipeLaw.js';
import { POTION_RECIPES } from '../../systems/potionRecipes.js';
import { createSimmer } from '../../systems/simmerAct.js';
import { scaleXp, xpPct } from '../../net/firmament/firmamentLaw.js';
import { firmamentStats } from '../../systems/firmamentLive.js';
import { getPref } from '../../systems/uiPrefs.js';

const _pv = { kind: /** @type {'pot'|'cauldron'} */ ('pot'), keys: /** @type {string[]} */ ([]), base: /** @type {string|null} */ (null), q: '', word: '', busy: false, act: /** @type {any} */ (null), asked: false, followed: /** @type {string|null} */ (null) };

const doc = () => globalThis.document;
function h(tag, cls = null, text = null) { const e = doc().createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function button(cls, text, on, disabled = false) { const b = h('button', cls, text); b.type = 'button'; b.disabled = !!disabled; b.onclick = (ev) => { ev?.preventDefault?.(); if (!b.disabled) on(); }; return b; }

let _styled = false;
function ensureStyle() {
  if (_styled || !doc()?.head) return;
  _styled = true;
  const st = h('style');
  st.textContent = `
.pv, .pv * { font-family: inherit; box-sizing: border-box; }
.pv { display: flex; flex-direction: column; gap: 12px; color: #e8e2d0; }
.pv-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; border-bottom: 2px solid #6b5228; padding-bottom: 6px; }
.pv-head b { color: #f0d58a; }
.pv-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pv-chip { font: inherit; padding: 4px 10px; color: #e8e2d0; background: rgba(10,12,17,.5); border: 1px solid #6b5228; cursor: pointer; }
.pv-chip.on { color: #1c140c; background: #d9b45a; border-color: #f0d58a; }
.pv-chip:disabled { opacity: .5; cursor: default; }
.pv-body { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; }
.pv-book { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 6px; max-height: 62vh; overflow-y: auto; }
.pv-mid { flex: 3 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.pv-ings { flex: 2 1 220px; min-width: 0; display: flex; flex-direction: column; gap: 6px; max-height: 62vh; overflow-y: auto; }
.pv-title { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #d9b45a; border-bottom: 1px solid #6b5228; padding-bottom: 3px; }
.pv-row { font: inherit; text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 7px 10px; background: rgba(0,0,0,.25); border: 1px solid #4a3820; color: #e8e2d0; cursor: pointer; }
.pv-row:hover { border-color: #b08a3e; }
.pv-row small { color: #b8b09a; }
.pv-row.pv-classic small { color: #9cc98a; }
.pv-parch { background: #e6d6b0; color: #2b2116; border: 2px solid #8a6a32; box-shadow: inset 0 0 0 3px #e6d6b0, inset 0 0 0 4px #a8844a; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; overflow-wrap: anywhere; }
.pv-parch, .pv-parch * { text-shadow: none !important; }
.pv-slot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 6px 8px; border: 1px solid #a8844a; background: rgba(60,40,20,.08); }
.pv-slot b { min-width: 120px; }
.pv-slot.pv-empty { border-style: dashed; color: #6a4e26; }
.pv-tr { font-size: 13px; padding: 1px 7px; border: 1px solid #a8844a; color: #4a3a26; }
.pv-tr.shared { background: #6a4e26; color: #f0e6cc; border-color: #2b2116; }
.pv-tr.unknown { border-style: dashed; color: #8a7a5a; }
.pv-x { font: inherit; margin-left: auto; padding: 0 8px; background: none; border: 1px solid #a8844a; color: #6a4e26; cursor: pointer; }
.pv-ing { font: inherit; text-align: left; display: grid; grid-template-columns: 1fr auto; gap: 1px 8px; padding: 6px 9px; background: rgba(0,0,0,.25); border: 1px solid #4a3820; color: #e8e2d0; cursor: pointer; font-size: 14px; }
.pv-ing.in { border: 2px solid #d9b45a; color: #f0d58a; }
.pv-ing small { color: #b8b09a; grid-column: 1 / -1; font-size: 12px; }
.pv-ing .short { color: #e0a070; }
.pv-sum { display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center; border-top: 2px solid #6b5228; padding: 10px 12px; background: rgba(0,0,0,.3); }
.pv-sum > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pv-name { font-size: 1.25em; color: #f0d58a; font-weight: 700; }
.pv-lab { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #b8b09a; }
.pv-does { display: flex; gap: 8px; font-size: 14px; }
.pv-does b { color: #f0d58a; min-width: 90px; }
.pv-go { margin-left: auto; display: flex; flex-direction: column; gap: 6px; }
.pv-btn { font: inherit; padding: 8px 14px; color: #e8e2d0; background: transparent; border: 1px solid #6b5228; cursor: pointer; }
.pv-btn.primary { color: #1c140c; background: #d9b45a; border: 2px solid #f0d58a; font-weight: 700; }
.pv-btn:disabled { opacity: .5; cursor: default; }
.pv-word { padding: 6px 10px; border-left: 3px solid #d9b45a; background: rgba(217,180,90,.1); }
.pv-sim { background: #1c150e; border: 2px solid #6b5228; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; color: #e8e2d0; user-select: none; }
.pv-gauge { position: relative; height: 34px; background: linear-gradient(90deg, #2a3a5a, #6a5a3a, #a84020); border: 1px solid #6b5228; }
.pv-band { position: absolute; top: 0; bottom: 0; background: rgba(240,213,138,.3); border-left: 2px solid #f0d58a; border-right: 2px solid #f0d58a; transition: background .2s; }
.pv-band.hot { background: rgba(156,201,138,.45); }
.pv-needle { position: absolute; top: -6px; bottom: -6px; width: 4px; margin-left: -2px; background: #fff6d8; box-shadow: 0 0 6px #f0d58a; }
.pv-meter { height: 12px; border: 1px solid #6b5228; background: #15100b; }
.pv-meter > div { height: 100%; background: #9cc98a; transition: width .1s linear; }
.pv-sim.over .pv-gauge { animation: pv-boil .3s ease-in-out infinite; }
@keyframes pv-boil { 0%,100% { transform: translateX(0); } 50% { transform: translateX(2px); } }
@media (prefers-reduced-motion: reduce) { .pv-sim.over .pv-gauge { animation: none; } }
`;
  doc().head.append(st);
}

/** Where the player stands: a fire, an alchemy table, or neither. */
const where = (/** @type {string|null} */ here) => (here === 'fire' ? 'pot' : here === 'alchemy' ? 'cauldron' : null);

/**
 * Draws the page into `detail`. `p` the professions' provider (profPages): `book` the professions book, `name(key)`,
 * `provision(body)` the make. `here` the station the player stands at (profPages stationHere). `kit.go` opens another page.
 */
export function drawProvPage(detail, rerender, p, here, kit) {
  ensureStyle();
  const book = p?.book;
  if (!book) { detail.append(h('p', null, 'Provisioning opens with the professions.')); return; }
  const at = where(here);
  if (at && _pv.followed !== at) { _pv.kind = at; _pv.keys = []; _pv.base = null; _pv.followed = at; }
  if (!at) _pv.followed = null;
  const state = book.provState?.();
  if (!state && !_pv.asked) { _pv.asked = true; book.provRefresh?.().then(() => rerender()).catch(() => null); }
  const learnt = state?.learnt ?? new Set();
  const track = book.track?.('provisioning') ?? book.track?.('alchemy');
  const rank = track?.rank ?? 0;
  const kind = _pv.kind;
  const held = (/** @type {string} */ k) => Number(book.workable?.(k) ?? book.held?.(k) ?? 0);
  const name = (/** @type {string} */ k) => (typeof p.name === 'function' ? p.name(k) : k);
  const root = h('div', 'pv');

  // the head: the rank, where, the pot or the cauldron
  const head = h('div', 'pv-head');
  const left = h('div');
  left.append(h('b', null, 'Provisioning'), doc().createTextNode(` · rank ${rank} · ${at === 'pot' ? 'at a fire' : at === 'cauldron' ? 'at an alchemy table' : 'away from a station: plan here, make at a fire or an alchemy table'}`));
  const modes = h('div', 'pv-chips');
  for (const [k, label] of [['pot', 'Pot'], ['cauldron', 'Cauldron']]) modes.append(button(`pv-chip${kind === k ? ' on' : ''}`, label, () => { if (_pv.act) return; _pv.kind = /** @type {any} */ (k); _pv.keys = []; _pv.base = null; rerender(); }));
  head.append(left, modes);
  root.append(head);
  if (_pv.word) root.append(h('div', 'pv-word', _pv.word));

  const body = h('div', 'pv-body');
  // ── THE BOOK: found makes first, then the classics (made the classic way, at the station page)
  const bk = h('div', 'pv-book');
  bk.append(h('div', 'pv-title', 'Recipe book'));
  const found = (state?.book ?? []).filter((/** @type {any} */ b) => b.kind === kind);
  if (!found.length) bk.append(h('small', null, 'Nothing found yet. Put ingredients together to discover what they make.'));
  for (const b of found) {
    const row = button('pv-row', '', () => { if (_pv.act) return; _pv.keys = b.keys.slice(0, slotsAt(rank)); _pv.base = b.base ?? null; rerender(); });
    row.append(h('b', null, b.name), h('small', null, `${b.traits.map(traitName).join(', ') || 'no traits'} · made ${b.made}`));
    bk.append(row);
  }
  bk.append(h('div', 'pv-title', 'Classic recipes'));
  const classics = kind === 'pot' ? DISHES.map((d) => [d.name, 'the classic dish']) : POTION_RECIPES.map((r) => [r.displayName ?? r.name, 'the classic potion']);
  for (const [n, w] of classics) {
    const row = button('pv-row pv-classic', '', () => kit?.go?.('crafting'));
    row.append(h('b', null, n), h('small', null, `${w}: made at the Stations page`));
    bk.append(row);
  }
  body.append(bk);

  // ── THE VESSEL, on parchment
  const mid = h('div', 'pv-mid');
  const parch = h('div', 'pv-parch');
  const slots = slotsAt(rank);
  parch.append(h('b', null, kind === 'pot' ? 'In the pot' : 'In the cauldron'));
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const k of _pv.keys) for (const t of traitsOf(k, kind)) count.set(t, (count.get(t) ?? 0) + 1);
  if (kind === 'cauldron') {
    const bl = h('div', 'pv-chips');
    for (const b of BASES) bl.append(button(`pv-chip${_pv.base === b.key ? ' on' : ''}`, `${b.name} (${b.words}, ${held(b.key)})`, () => { if (_pv.act) return; _pv.base = _pv.base === b.key ? null : b.key; rerender(); }));
    parch.append(h('small', null, 'One base sets how strong it is:'), bl);
  }
  for (let i = 0; i < slots; i++) {
    const k = _pv.keys[i];
    if (!k) { parch.append(h('div', 'pv-slot pv-empty', 'Empty: pick an ingredient')); continue; }
    const s = h('div', 'pv-slot');
    s.append(h('b', null, name(k)));
    for (const t of traitsOf(k, kind)) {
      const known = traitKnown(k, t, kind, learnt);
      const shared = known && (count.get(t) ?? 0) >= 2;
      s.append(h('span', `pv-tr${shared ? ' shared' : known ? '' : ' unknown'}`, known ? traitName(t) : '?'));
    }
    s.append(button('pv-x', 'Take out', () => { if (_pv.act) return; _pv.keys = _pv.keys.filter((x) => x !== k); rerender(); }));
    parch.append(s);
  }
  if (slots < 4) parch.append(h('small', null, `${slots < 3 ? 'A third ingredient at rank 40, a fourth at 75.' : 'A fourth ingredient at rank 75.'}`));
  parch.append(h('small', null, 'Filled: a trait two or more ingredients share goes into what you make. "?" is a trait you have not learnt yet.'));
  mid.append(parch);
  if (_pv.act) mid.append(_pv.act.el);
  if (kind === 'pot') {
    const prep = h('div', 'pv-chips');
    for (const pr of PREPARES) {
      const inp = pr.inputs[0];
      prep.append(button('pv-chip', `${pr.id === 'flour' ? 'Mill' : 'Set'} ${name(pr.out)} (${inp.n} ${name(inp.key)}, have ${held(inp.key)})`, async () => {
        if (_pv.busy) return;
        _pv.busy = true;
        const r = await book.provPrepare?.(pr.id, 1).catch(() => null);
        _pv.busy = false; _pv.word = r?.ok ? `You made ${name(pr.out)}.` : 'You do not have enough for that.'; rerender();
      }, held(inp.key) < inp.n));
    }
    mid.append(prep);
    // the Grocers' pantry, delivered to the Stores for silver (professionLaw GROCER_STOCK)
    if (typeof p.stock === 'function' && p.marksOpen?.() !== false) {
      const shop = h('div', 'pv-chips');
      for (const g of GROCER_STOCK) {
        shop.append(button('pv-chip', `Buy 5 ${name(g.key)} from the Grocers (${g.marks * 5} silver)`, async () => {
          if (_pv.busy) return;
          _pv.busy = true; rerender();
          const r = await p.stock(g.key, 5, 'grocers').catch(() => null);
          _pv.busy = false; _pv.word = r?.text ?? null; rerender();
        }, _pv.busy));
      }
      mid.append(h('small', null, 'The Grocers sell the pantry and deliver it to your Stores:'), shop);
    }
  }
  body.append(mid);

  // ── THE INGREDIENTS
  const ings = h('div', 'pv-ings');
  ings.append(h('div', 'pv-title', kind === 'pot' ? 'Food, herbs and spices' : 'Plants, parts and metals'));
  const search = h('input', 'pv-chip');
  search.type = 'search'; search.placeholder = 'Search'; search.value = _pv.q; search.setAttribute('aria-label', 'Search the ingredients');
  search.oninput = () => { _pv.q = search.value; rerender(); };
  ings.append(search);
  const q = _pv.q.trim().toLowerCase();
  const pool = (kind === 'pot' ? POT_KEYS : CAULDRON_KEYS)
    .map((k) => ({ k, n: held(k), label: name(k) }))
    .filter((x) => !q || x.label.toLowerCase().includes(q))
    .sort((a, b) => Number(b.n > 0) - Number(a.n > 0) || a.label.localeCompare(b.label));
  const seenPlant = new Set();
  for (const x of pool) {
    if (/^p[12]:/.test(x.k)) { const id = `${x.label}`; if (seenPlant.has(id) && x.n === 0) continue; seenPlant.add(id); }
    const inPot = _pv.keys.includes(x.k);
    const full = !inPot && _pv.keys.length >= slots;
    const b = button(`pv-ing${inPot ? ' in' : ''}`, '', () => {
      if (_pv.act) return;
      _pv.keys = inPot ? _pv.keys.filter((y) => y !== x.k) : full ? _pv.keys : [..._pv.keys, x.k];
      rerender();
    }, full);
    b.append(h('b', null, x.label), h('span', x.n ? null : 'short', String(x.n)));
    b.append(h('small', null, traitsOf(x.k, kind).map((t) => (traitKnown(x.k, t, kind, learnt) ? traitName(t) : '?')).join(' · ')));
    ings.append(b);
  }
  body.append(ings);
  root.append(body);

  // ── WHAT IT WILL MAKE
  const plan = /** @type {any} */ (provPlan({ kind, keys: _pv.keys, base: _pv.base }, rank, 0, false));
  const sum = h('div', 'pv-sum');
  if (!plan.ok) {
    const msg = plan.error === 'prov-count' ? `Put in at least two ingredients (up to ${slots}).` : plan.error === 'prov-base' ? 'Pick a base for the cauldron.' : plan.error === 'prov-nothing' ? 'Nothing in the cauldron shares a trait yet.' : plan.error === 'prov-twice' ? 'That plant is in already.' : 'Pick what goes in.';
    sum.append(h('div', null, msg));
  } else {
    const known = plan.traits.every((/** @type {string} */ t) => _pv.keys.filter((k) => traitsOf(k, kind).includes(t)).every((k) => traitKnown(k, t, kind, learnt)));
    const a = h('div');
    a.append(h('span', 'pv-lab', 'You will make'), h('span', 'pv-name', known ? plan.name : 'Something you have not made before'),
      h('small', null, kind === 'cauldron' ? `${plan.count} ${plan.count === 1 ? 'bottle' : 'bottles'}` : `${plan.drink ? 'a drink' : 'a dish'} · fills hunger · ${plan.count} servings${plan.party ? ' · a feast for your Company' : ''}`));
    const b = h('div');
    b.append(h('span', 'pv-lab', 'What it does'));
    for (const t of plan.traits) {
      const line = h('div', 'pv-does');
      const isKnown = _pv.keys.filter((k) => traitsOf(k, kind).includes(t)).every((k) => traitKnown(k, t, kind, learnt));
      const does = kind === 'cauldron' ? `as the classic potion, at ${100 + plan.potent}% strength`
        : /** @type {any} */ (FOOD_TRAITS)[t]?.stat ? `+${plan.magnitude} ${/** @type {any} */ (FOOD_TRAITS)[t].stat[0].toUpperCase()}${/** @type {any} */ (FOOD_TRAITS)[t].stat.slice(1)}`
          : /** @type {any} */ (FOOD_TRAITS)[t]?.resist ? `${/** @type {any} */ (FOOD_TRAITS)[t].does}, at ${100 + plan.resistPct}% of the potion's` : /** @type {any} */ (FOOD_TRAITS)[t]?.does ?? '';
      line.append(h('b', null, isKnown ? traitName(t) : '?'), h('span', null, isKnown ? does : 'you will learn it by making this'));
      b.append(line);
    }
    if (!plan.traits.length) b.append(h('span', null, 'Nothing shared: a plain meal that fills hunger.'));
    const c = h('div');
    const xp = scaleXp(provXp(plan), xpPct(firmamentStats(), 'provisioning'));
    c.append(h('span', 'pv-lab', kind === 'cauldron' ? 'Strength' : 'For'), h('span', null, kind === 'cauldron' ? `${100 + plan.potent}% of a shop's potion` : `${Math.round(plan.minutes / 60 * 10) / 10} hours`),
      h('small', null, `The Simmer adds up to a quarter · +${xp} Provisioning XP`));
    sum.append(a, b, c);
    const go = h('div', 'pv-go');
    const missing = [...plan.keys, ...(plan.base ? [plan.base] : [])].filter((k) => held(k) < 1);
    const ready = !!at && at === kind && !missing.length && !_pv.busy && !_pv.act && typeof p.provision === 'function';
    if (!at) go.append(h('small', null, kind === 'pot' ? 'Stand at a fire to cook.' : 'Stand at an alchemy table to brew.'));
    else if (at !== kind) go.append(h('small', null, kind === 'pot' ? 'This is an alchemy table: switch to the Cauldron.' : 'This is a fire: switch to the Pot.'));
    if (missing.length) go.append(h('small', null, `Missing ${missing.map(name).join(', ')}`));
    const verb = kind === 'pot' ? 'Cook' : 'Brew';
    const make = async (simmer) => {
      _pv.busy = true; rerender();
      const r = await p.provision({ kind, keys: _pv.keys, base: _pv.base, simmer }).catch(() => null);
      _pv.busy = false;
      _pv.word = r?.ok ? `Made: ${r.data?.prov?.name ?? 'it'} (+${r.data?.xp ?? 0} Provisioning XP).` : r?.text ?? 'That did not go through. Nothing was spent.';
      rerender();
    };
    const gentle = getPref('gentleActs') === true;
    go.append(button('pv-btn primary', _pv.busy ? 'Working...' : gentle ? verb : `${verb} (The Simmer)`, () => {
      if (gentle) { make(0); return; }
      _pv.act = mountSimmer(rank, (rep) => { _pv.act = null; if (rep && !rep.cancelled) make(rep.simmer); else { _pv.word = 'You took it off the heat. Nothing was spent.'; rerender(); } }, rerender);
      rerender();
    }, !ready));
    if (!gentle) go.append(button('pv-btn', `${verb}, skip the game`, () => make(0), !ready));
    sum.append(go);
  }
  root.append(sum);
  detail.append(root);
}

/** THE SIMMER, mounted: the gauge, the band, the needle, the meter; held by a press or the space bar. */
function mountSimmer(rank, done, rerender) {
  const act = createSimmer({ rank });
  const el = h('div', 'pv-sim');
  const top = h('div', 'pv-head');
  top.append(h('b', null, 'The Simmer'), h('small', null, 'Hold to raise the heat, let go to let it fall. Keep the needle in the band.'));
  const gauge = h('div', 'pv-gauge');
  const band = h('div', 'pv-band');
  const needle = h('div', 'pv-needle');
  gauge.append(band, needle);
  const meterRow = h('div', 'pv-does');
  const meter = h('div', 'pv-meter');
  const fill = h('div');
  meter.append(fill);
  meter.style.flex = '1';
  const pct = h('b', null, '+0%');
  meterRow.append(h('span', null, 'Strength gained'), meter, pct);
  const hold = button('pv-btn primary', 'Hold for heat', () => {});
  const stop = button('pv-btn', 'Take it off the heat', () => { act.cancel(); });
  let holding = false;
  const on = (/** @type {any} */ e) => { e?.preventDefault?.(); holding = true; };
  const off = () => { holding = false; };
  hold.onpointerdown = on; hold.onpointerup = off; hold.onpointerleave = off;
  const key = (/** @type {any} */ e) => { if (e.code === 'Space') { e.preventDefault(); holding = e.type === 'keydown'; } };
  globalThis.addEventListener?.('keydown', key); globalThis.addEventListener?.('keyup', key);
  el.append(top, gauge, meterRow, hold, stop);
  let last = 0, ended = false;
  const frame = (/** @type {number} */ now) => {
    if (ended) return;
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    act.tick(dt, holding);
    const s = act.state;
    band.style.left = `${(s.band - s.width / 2) * 100}%`; band.style.width = `${s.width * 100}%`;
    band.classList.toggle('hot', s.inBand);
    needle.style.left = `${s.heat * 100}%`;
    fill.style.width = `${Math.round(s.meter * 100)}%`;
    pct.textContent = `+${Math.round(s.meter * 25)}%`;
    el.classList.toggle('over', s.over);
    if (s.done) {
      ended = true;
      globalThis.removeEventListener?.('keydown', key); globalThis.removeEventListener?.('keyup', key);
      done(act.report());
      return;
    }
    globalThis.requestAnimationFrame?.(frame);
  };
  globalThis.requestAnimationFrame?.(frame);
  return { el };
}

/** A trait's words, for the tooltips and the help. */
export const traitWords = (/** @type {string} */ t) => /** @type {any} */ (FOOD_TRAITS)[t]?.does ?? /** @type {any} */ (ALCHEMY_TRAITS)[t]?.name ?? t;
