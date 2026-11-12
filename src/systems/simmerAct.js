// @ts-check
// BUNNYFALL PROVISIONING: THE SIMMER - the pot's and the cauldron's minigame (docs/PROVISIONING.md). The heat drifts on its
// own and falls when let alone; holding raises it. A band marks the right heat and wanders slowly. Every moment in the
// band fills the meter; boiling over or going cold drains it. About twenty seconds; the meter at the end is the make's
// `simmer` (0..1). Pure: `tick(dt, holding)` moves it, `report()` says how it went. The page draws it.

export const SIMMER = Object.freeze({
  seconds: 20,
  rise: 0.55, fall: 0.32,        // heat a second, held and let go (0..1 the gauge)
  drift: 0.18,                   // the pot's own wander, a second
  band: 0.2, bandMin: 0.12,      // the band's width, narrower as the rank's pot runs hotter
  fill: 0.03, drain: 0.05,       // the meter a second in the band (full in about 14 s of 20), and off it at the edges
});

/** @param {{ rank?: number, rand?: () => number }} [o] */
export function createSimmer({ rank = 0, rand = Math.random } = {}) {
  const width = Math.max(SIMMER.bandMin, SIMMER.band - rank * 0.0006);
  const state = { heat: 0.3, band: 0.45, bandTo: 0.55, width, meter: 0, t: 0, inBand: false, over: false, cold: false, done: false, cancelled: false, wander: 0 };
  return {
    state,
    tick(/** @type {number} */ dt, /** @type {boolean} */ holding) {
      if (state.done) return;
      const d = Math.max(0, Math.min(0.1, dt));
      state.t += d;
      state.wander += (rand() - 0.5) * SIMMER.drift * d * 6;
      state.wander = Math.max(-0.4, Math.min(0.4, state.wander * 0.98));
      state.heat = Math.max(0, Math.min(1, state.heat + (holding ? SIMMER.rise : -SIMMER.fall) * d + state.wander * d));
      if (Math.abs(state.band - state.bandTo) < 0.01) state.bandTo = 0.25 + rand() * 0.5;
      state.band += Math.sign(state.bandTo - state.band) * 0.06 * d;
      const lo = state.band - state.width / 2, hi = state.band + state.width / 2;
      state.inBand = state.heat >= lo && state.heat <= hi;
      state.over = state.heat > 0.95;
      state.cold = state.heat < 0.05;
      state.meter = Math.max(0, Math.min(1, state.meter + (state.inBand ? SIMMER.fill : state.over || state.cold ? -SIMMER.drain : 0) * d * 2.4));
      if (state.t >= SIMMER.seconds) state.done = true;
    },
    cancel() { state.done = true; state.cancelled = true; },
    report() { return { simmer: state.cancelled ? 0 : Math.round(state.meter * 100) / 100, cancelled: state.cancelled }; },
  };
}
