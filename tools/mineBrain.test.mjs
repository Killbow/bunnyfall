import assert from 'node:assert/strict';
import test from 'node:test';
import { mineLayout } from '../src/net/mine/mineLayout.js';
import {
  createMineState, stepMine, MINE_ALARM, MINE_STRAY, MINE_COST, MINE_PROP, MINE_SEAL_S, MINE_WEEK_S, MINE_WOOD_STRENGTH,
} from '../src/net/mine/mineBrain.js';

const NOW = 1_800_000_000;
const MINE = 4242;

/** The first chamber of a layout with no weak walls, and one with at least two. */
function chambers(layout) {
  let plain = null, weak = null;
  layout.sections.forEach((s, si) => s.chambers.forEach((c, ci) => {
    const n = c.walls.filter((w) => w.weak).length;
    if (n === 0 && !plain) plain = { s: si, c: ci };
    if (n >= 2 && !weak) weak = { s: si, c: ci, walls: c.walls.map((w, k) => (w.weak ? k : -1)).filter((k) => k >= 0) };
  }));
  return { plain, weak };
}
/** A layout of this mine that has both kinds of chamber. */
function pick() {
  for (let reset = 0; reset < 50; reset++) {
    const L = mineLayout(MINE, reset), c = chambers(L);
    if (c.plain && c.weak) return { L, ...c };
  }
  throw new Error('no layout with both kinds of chamber');
}

test('a fresh mine: full stability, no props, not sealed, its weak walls kept', () => {
  const { L } = pick();
  const st = createMineState(L, NOW);
  assert.equal(st.mine, L.mineId);
  assert.equal(st.reset, L.reset);
  assert.deepEqual(st.stab, L.sections.map(() => 100));
  assert.deepEqual(st.cap, L.sections.map(() => 100));
  assert.deepEqual(st.props, []);
  assert.equal(st.sealedUntil, 0);
  assert.equal(st.weak.length, L.sections.length);
  assert.deepEqual(st.weak[0][0], L.sections[0].chambers[0].walls.map((w, k) => (w.weak ? k : -1)).filter((k) => k >= 0));
});

test('167 strikes in a plain chamber warn dust, creak and rumble once each, in order, then collapse it', () => {
  const { L, plain } = pick();
  let st = createMineState(L, NOW);
  const events = [];
  for (let i = 0; i < 167; i++) {
    const r = stepMine(st, { op: 'strike', s: plain.s, c: plain.c }, NOW + i);
    assert.equal(r.error, undefined);
    st = r.state;
    events.push(...r.events);
  }
  assert.deepEqual(events.filter((e) => !e.startsWith('wave:')), ['warn:dust', 'warn:creak', 'warn:rumble', 'collapse']);
  assert.equal(st.sealedUntil, NOW + 166 + MINE_SEAL_S);
});

test('each unpropped weak wall makes a strike cost half again; a prop on one takes its share off', () => {
  const { L, weak } = pick();
  const st = createMineState(L, NOW);
  const n = weak.walls.length;
  const hit = (s) => 100 - stepMine(s, { op: 'strike', s: weak.s, c: weak.c }, NOW).state.stab[weak.s];
  assert.ok(Math.abs(hit(st) - MINE_COST.strike * MINE_COST.weakMult ** n) < 1e-9);
  const propped = stepMine(st, { op: 'prop', s: weak.s, c: weak.c, w: weak.walls[0], wood: 'pine', by: 'a' }, NOW).state;
  const before = propped.stab[weak.s];
  const after = stepMine(propped, { op: 'strike', s: weak.s, c: weak.c }, NOW).state.stab[weak.s];
  assert.ok(Math.abs(before - after - MINE_COST.strike * MINE_COST.weakMult ** (n - 1)) < 1e-9);
});

test('Ironwood shores three times what Pine does; a plank on a weak wall counts double', () => {
  const { L, plain, weak } = pick();
  const st = createMineState(L, NOW);
  const capUp = (s, c, w, wood) => stepMine(st, { op: 'prop', s, c, w, wood, by: 'a' }, NOW).state.cap[s] - st.cap[s];
  const strong = L.sections[plain.s].chambers[plain.c].walls.findIndex((x) => !x.weak);
  assert.equal(capUp(plain.s, plain.c, strong, 'pine'), MINE_PROP.cap * MINE_WOOD_STRENGTH.pine);
  assert.equal(capUp(plain.s, plain.c, strong, 'ironwood'), 3 * capUp(plain.s, plain.c, strong, 'pine'));
  assert.equal(capUp(weak.s, weak.c, weak.walls[0], 'oak'), 2 * MINE_PROP.cap * MINE_WOOD_STRENGTH.oak);
  assert.equal(stepMine(st, { op: 'prop', s: plain.s, c: plain.c, w: strong, wood: 'balsa', by: 'a' }, NOW).error, 'wood');
});

test('a wall already propped turns the second plank away and the state stands unchanged', () => {
  const { L, plain } = pick();
  const st = stepMine(createMineState(L, NOW), { op: 'prop', s: plain.s, c: plain.c, w: 0, wood: 'oak', by: 'a' }, NOW).state;
  const r = stepMine(st, { op: 'prop', s: plain.s, c: plain.c, w: 0, wood: 'teak', by: 'b' }, NOW);
  assert.equal(r.error, 'taken');
  assert.deepEqual(r.state, st);
});

test('a sealed mine refuses every act, and a tick after the seal resets it as a new mine', () => {
  const { L, plain } = pick();
  let st = createMineState(L, NOW);
  for (let i = 0; i < 200 && !st.sealedUntil; i++) st = stepMine(st, { op: 'strike', s: plain.s, c: plain.c }, NOW).state;
  assert.equal(stepMine(st, { op: 'strike', s: plain.s, c: plain.c }, NOW + 10).error, 'sealed');
  assert.deepEqual(stepMine(st, { op: 'tick' }, st.sealedUntil - 1).events, []);
  const r = stepMine(st, { op: 'tick' }, st.sealedUntil + 1);
  assert.deepEqual(r.events, ['reset']);
  assert.equal(r.state.reset, st.reset + 1);
  assert.equal(r.state.sealedUntil, 0);
  assert.deepEqual(r.state.props, []);
  assert.equal(r.state.stab.length, mineLayout(MINE, st.reset + 1).sections.length);
});

test('a mine nobody collapses turns over after a week', () => {
  const { L } = pick();
  const st = createMineState(L, NOW);
  assert.deepEqual(stepMine(st, { op: 'tick' }, NOW + MINE_WEEK_S - 1).events, []);
  const r = stepMine(st, { op: 'tick' }, NOW + MINE_WEEK_S);
  assert.deepEqual(r.events, ['reset']);
  assert.equal(r.state.born, NOW + MINE_WEEK_S);
});

test('stepMine never changes the state it is handed, and refuses a place the mine has not', () => {
  const { L, plain } = pick();
  const st = createMineState(L, NOW), copy = structuredClone(st);
  stepMine(st, { op: 'strike', s: plain.s, c: plain.c }, NOW);
  stepMine(st, { op: 'prop', s: plain.s, c: plain.c, w: 1, wood: 'oak', by: 'a' }, NOW);
  assert.deepEqual(st, copy);
  assert.equal(stepMine(st, { op: 'strike', s: 9, c: 0 }, NOW).error, 'bad');
  assert.equal(stepMine(st, { op: 'prop', s: plain.s, c: plain.c, w: 40, wood: 'oak', by: 'a' }, NOW).error, 'bad');
  assert.equal(stepMine(st, { op: 'dance' }, NOW).error, 'bad');
});

test('the noise calls waves: one each time a section’s alarm fills, bigger as the mine calls more, and a quiet minute forgets', () => {
  const { L, plain } = pick();
  let st = createMineState(L, NOW);
  const waves = [];
  for (let i = 0; i < MINE_ALARM.wave * 4; i++) { const r = stepMine(st, { op: 'strike', s: plain.s, c: plain.c }, NOW); st = r.state; waves.push(...r.events.filter((e) => e.startsWith('wave:'))); }
  assert.deepEqual(waves.map((w) => Number(w.split(':')[3])), [2, 2, 3, 3]);
  assert.ok(waves.every((w) => w.startsWith(`wave:${plain.s}:${plain.c}:`)));
  for (let i = 0; i < MINE_ALARM.wave - 1; i++) st = stepMine(st, { op: 'strike', s: plain.s, c: plain.c }, NOW).state;
  st = stepMine(st, { op: 'tick' }, NOW + 600).state;   // ten quiet minutes
  assert.equal(st.alarm[plain.s], 0);
  assert.deepEqual(stepMine(st, { op: 'strike', s: plain.s, c: plain.c }, NOW + 600).events.filter((e) => e.startsWith('wave:')), []);
});

test('a stray comes only into a mine someone stands in, on the tick’s roll, into a chamber the mine has', () => {
  const { L } = pick();
  const st = createMineState(L, NOW);
  assert.deepEqual(stepMine(st, { op: 'tick', present: false, roll: 0, pick: 0.5 }, NOW + 60).events, []);
  assert.deepEqual(stepMine(st, { op: 'tick', present: true, roll: 0.99, pick: 0.5 }, NOW + 60).events, []);
  const [e] = stepMine(st, { op: 'tick', present: true, roll: MINE_STRAY.chance / 2, pick: 0.999 }, NOW + 60).events;
  const [, s, c, n] = e.split(':').map(Number);
  assert.ok(e.startsWith('stray:') && s < L.sections.length && c < L.sections[s].chambers.length && (n === 1 || n === 2));
});
