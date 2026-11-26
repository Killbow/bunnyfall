// @ts-check

export const MUSTER_WAVE_MIN = 6;
export const MUSTER_WAVE_MAX = 8;
export const MUSTER_GATHER_MAX_S = 40;
export const MUSTER_GATHER_STEP_S = 1.5;
export const MUSTER_CAMP_R = 6;
export const MUSTER_HOLD_STOP_M = 3;
export const MUSTER_HOLD_LEASH_M = 10;
export const MUSTER_MARCH_MPS = 1.6;
export const MUSTER_STRAGGLE_M = 7;
export const MUSTER_MARCH_LEASH_M = 12;
export const MUSTER_MARCH_STOP_M = 2.5;
export const MUSTER_ENGAGE_M = 14;
export const MUSTER_MARCH_MAX_S = 150;
export const MUSTER_TWO_CAMPS_M = 320;
export const MUSTER_SITE_AGAIN_S = 5;

function tupleHash(/** @type {any[]} */ parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 0x7c; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Reads only the raid key, start, and party, so every machine, runner or not, puts the camps and their smoke on the
 * same sides.
 * @param {any} raid
 * @param {boolean} big
 */
export function musterSides(raid, big) {
  const key = raid?.key ?? `${raid?.regionIndex}:${raid?.locationIndex}:${raid?.startDay}`;
  const h = tupleHash(['raid-muster', key, raid?.startMinute, raid?.type]);
  const a = h % 4;
  return big ? [a, (a + 1 + ((h >>> 4) % 3)) % 4] : [a];
}

/**
 * @param {{ width: number, height: number } | null | undefined} nav
 * @param {number} cell
 */
export const musterBigTown = (nav, cell) => !!nav && Math.max(nav.width, nav.height) * cell >= MUSTER_TWO_CAMPS_M;

/** @param {{ camps: (raid: any) => Array<{ pts: number[][] }> | null, players?: () => number[][], release?: (raid: any, foe: any) => void, random?: () => number, keyOf: (raid: any) => string }} deps */
export function createRaidMuster({ camps, players = () => [], release = () => {}, random = Math.random, keyOf }) {
  let clock = 0;
  const sites = new Map();
  let waves = [];
  let made = 0;
  const alive = (w) => w.members.filter((f) => !f.dead && (f.entity?.health ?? 1) > 0);
  const campsOf = (raid) => {
    const key = keyOf(raid);
    let s = sites.get(key);
    if (!s || (!s.camps && clock >= s.at)) {
      const c = camps(raid);
      s = { camps: c && c.length ? c.map((x) => ({ pts: x.pts.map((p) => [...p]) })) : null, at: clock + MUSTER_SITE_AGAIN_S };
      sites.set(key, s);
    }
    return s.camps;
  };
  const forming = (key) => waves.find((w) => w.key === key && w.phase === 'gather' && w.asked < w.target) ?? null;
  const marchFollow = (w) => ({ feet: () => w.guide, stop: MUSTER_MARCH_STOP_M, leash: MUSTER_MARCH_LEASH_M, trail: () => w.trail, muster: w });
  const loose = (w) => { for (const f of w.members) if (f.ai?.follow?.muster === w) { f.ai.follow = null; if (!f.dead) release(w.raid, f); } };
  return {
    place(raid, size = 0) {
      const c = campsOf(raid);
      if (!c) return null;
      const key = keyOf(raid);
      let w = forming(key);
      if (!w) {
        const target = size > 0 ? size : MUSTER_WAVE_MIN + Math.floor(random() * (MUSTER_WAVE_MAX - MUSTER_WAVE_MIN + 1));
        w = { key, raid, camp: c[made++ % c.length], target, asked: 0, members: [], since: clock, phase: 'gather', guide: null, leg: 0, trail: null, marched: 0 };
        waves.push(w);
      }
      w.asked++;
      return { at: w.camp.pts[0], min: 1.5, max: MUSTER_CAMP_R, los: false, wave: w };
    },
    gathering(raid) { return !!forming(keyOf(raid)); },
    /**
     * Call with a null `foe` when the spawn fails, so the wave asks for that raider again.
     * @param {any} at
     */
    adopt(at, foe) {
      const w = at?.wave;
      if (!w || !waves.includes(w)) return false;
      if (!foe) { w.asked = Math.max(0, w.asked - 1); return false; }
      w.members.push(foe);
      if (foe.ai) foe.ai.follow = w.phase === 'gather'
        ? { feet: () => w.camp.pts[0], stop: MUSTER_HOLD_STOP_M, leash: MUSTER_HOLD_LEASH_M, muster: w }
        : marchFollow(w);
      return true;
    },
    step(dt) {
      if (!(dt > 0)) return;
      clock += dt;
      for (const w of waves) {
        const live = alive(w);
        if (w.phase === 'gather') {
          const whole = w.asked >= w.target && live.length >= w.target;
          if (!whole && !(clock - w.since >= MUSTER_GATHER_MAX_S && live.length)) continue;
          w.phase = 'march'; w.asked = w.target;
          w.guide = [...w.camp.pts[0]]; w.leg = 1; w.trail = [w.guide];
          for (const f of live) if (f.ai) f.ai.follow = marchFollow(w);
          continue;
        }
        w.marched += dt;
        if (!live.length) { w.done = true; continue; }
        const near = players().reduce((b, p) => { const d = Math.hypot(p[0] - w.guide[0], p[2] - w.guide[2]); return d < b.d ? { p, d } : b; }, { p: null, d: Infinity });
        const late = w.marched >= MUSTER_MARCH_MAX_S;
        if (near.d <= MUSTER_ENGAGE_M || (late && w.leg >= w.camp.pts.length)) { loose(w); w.done = true; continue; }
        const spread = live.reduce((s, f) => s + (f.ai?.feet ? Math.hypot(f.ai.feet[0] - w.guide[0], f.ai.feet[2] - w.guide[2]) : 0), 0) / live.length;
        if (spread > MUSTER_STRAGGLE_M && !late) continue;
        const goal = w.leg < w.camp.pts.length ? w.camp.pts[w.leg] : near.p;
        if (!goal) continue;
        const dx = goal[0] - w.guide[0], dz = goal[2] - w.guide[2], d = Math.hypot(dx, dz), stepM = MUSTER_MARCH_MPS * dt;
        if (d <= stepM) { w.guide[0] = goal[0]; w.guide[1] = goal[1]; w.guide[2] = goal[2]; if (w.leg < w.camp.pts.length) { w.leg++; w.trail = [...w.camp.pts.slice(0, w.leg), w.guide]; } }
        else { w.guide[0] += (dx / d) * stepM; w.guide[2] += (dz / d) * stepM; w.guide[1] += ((goal[1] - w.guide[1]) * stepM) / d; }
      }
      waves = waves.filter((w) => !w.done && !(w.phase === 'gather' && w.asked >= w.target && !alive(w).length && clock - w.since > MUSTER_GATHER_MAX_S));
    },
    end(key) {
      for (const w of waves) if (w.key === key) for (const f of w.members) if (f.ai?.follow?.muster === w) f.ai.follow = null;
      waves = waves.filter((w) => w.key !== key);
      sites.delete(key);
    },
    offsetAll(d) {
      const shift = (p) => { if (Array.isArray(p)) { p[0] += d[0]; p[1] += d[1]; p[2] += d[2]; } };
      for (const s of sites.values()) for (const c of s.camps ?? []) for (const p of c.pts) shift(p);
      // `w.camp` and `w.trail` share point arrays with `sites`, so shifting them here would move them twice.
      for (const w of waves) shift(w.guide);
    },
    waves: () => waves.map((w) => ({ key: w.key, phase: w.phase, target: w.target, asked: w.asked, live: alive(w).length })),
  };
}
