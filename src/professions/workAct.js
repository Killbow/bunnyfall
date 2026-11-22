// @ts-check
// BUNNYFALL CRAFTING REWORK: THE WORK - the Bench's minigame. A piece is put together part by part, as its form says
// (net/craft/forms.js): each part is a turn of the dial, a needle sweeping round and a marked arc to strike in. Two good
// strikes finish a part and the next one turns faster. A strike near the arc's middle is a true one. A material well
// suited to the piece gives a wider arc, so the choice at the bench is felt at the work too.
//
// The engine is pure (no DOM, no clock): `tick(dt)` moves it, `strike()` acts, `report()` says how it went. The window
// draws it (ui/professions/craftActs.js). The service only reads `clean` - one step of quality, as every act before.

/** The work's numbers. Widths in degrees, speed in degrees a second. */
export const WORK_ACT = Object.freeze({
  hitsPer: 2,          // good strikes a part takes
  speed: 150,          // the first part's sweep
  accel: 1.18,         // each part after turns this much faster
  widthMin: 16, widthMax: 46,
  trueShare: 1 / 3,    // the middle of the arc that counts as a true strike
  missesMax: 3,        // the work is spoiled past this many
  missesClean: 1,      // a clean work allows this many
  lapsMax: 2,          // the needle may pass an arc this many times round before it counts as a miss
  gapS: 0.12,          // a strike within this long of the last is ignored (a held key)
});

/** An arc's width for a part: the rank over the recipe (`margin`), the attributes' band, and how well the material suits. */
export function workWidth(margin, band = 1, suit = 0.6) {
  const base = 18 + Math.max(0, Math.min(40, margin)) * 0.45;
  const w = base * (Number.isFinite(band) ? band : 1) * (0.75 + 0.5 * Math.max(0, Math.min(1, suit)));
  return Math.max(WORK_ACT.widthMin, Math.min(WORK_ACT.widthMax, w));
}

const wrap = (/** @type {number} */ d) => ((d % 360) + 360) % 360;
const apart = (/** @type {number} */ a, /** @type {number} */ b) => { const d = Math.abs(wrap(a) - wrap(b)); return Math.min(d, 360 - d); };

/**
 * @param {{ parts: { label: string, material?: string, width: number }[], rand?: () => number }} o
 */
export function createWorkAct({ parts, rand = Math.random }) {
  const list = (Array.isArray(parts) && parts.length ? parts : [{ label: 'The work', width: 24 }]).map((p) => ({ label: String(p.label), material: p.material ?? '', width: Math.max(WORK_ACT.widthMin, Math.min(WORK_ACT.widthMax, Number(p.width) || 24)) }));
  const state = {
    parts: list, part: 0, hits: 0, misses: 0, angle: 0, speed: WORK_ACT.speed, target: 0, swept: 0, since: 1,
    /** @type {('true'|'hit'|'miss')[]} */ results: [], done: false, spoiled: false, cancelled: false,
    /** the last strike, for the drawing: its kind and when (a counter the window watches) */ last: /** @type {null|{ kind: string, n: number }} */ (null),
    need: list.length * WORK_ACT.hitsPer,
  };
  let n = 0;
  const spawn = () => { state.target = wrap(state.angle + 110 + rand() * 140); state.swept = 0; };
  spawn();
  const note = (/** @type {string} */ kind) => { state.last = { kind, n: ++n }; };
  const miss = () => {
    state.misses++;
    state.results.push('miss');
    note('miss');
    if (state.misses > WORK_ACT.missesMax) { state.done = true; state.spoiled = true; }
  };
  return {
    state,
    get width() { return state.parts[state.part]?.width ?? 0; },
    get onArc() { return apart(state.angle, state.target) <= (state.parts[state.part]?.width ?? 0) / 2; },
    tick(/** @type {number} */ dt) {
      if (state.done) return;
      const step = state.speed * Math.max(0, dt);
      state.angle = wrap(state.angle + step);
      state.swept += step;
      state.since += dt;
      if (state.swept > 360 * WORK_ACT.lapsMax + 180) { miss(); if (!state.done) spawn(); }
    },
    strike() {
      if (state.done || state.since < WORK_ACT.gapS) return null;
      state.since = 0;
      const half = (state.parts[state.part]?.width ?? 0) / 2;
      const d = apart(state.angle, state.target);
      if (d > half) { miss(); return 'miss'; }
      const kind = d <= half * WORK_ACT.trueShare ? 'true' : 'hit';
      state.results.push(kind);
      note(kind);
      state.hits++;
      if (state.hits >= WORK_ACT.hitsPer) {
        state.hits = 0;
        state.part++;
        state.speed *= WORK_ACT.accel;
        note('part');
        if (state.part >= state.parts.length) { state.done = true; return kind; }
      }
      spawn();
      return kind;
    },
    cancel() { state.done = true; state.cancelled = true; },
    report() {
      const trues = state.results.filter((r) => r === 'true').length;
      return { clean: !state.cancelled && !state.spoiled && state.part >= state.parts.length && state.misses <= WORK_ACT.missesClean, trues, misses: state.misses, spoiled: state.spoiled };
    },
  };
}
