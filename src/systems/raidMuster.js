// @ts-check
// BUNNYFALL (2026-11-04, the owner: "better enemy coordination so attackers gather and move in larger groups, plus
// visible smoke columns at gathering points"; asked, "waves from camps" and "camps plus burning houses"): A RAID'S
// MUSTER. A raid's raiders no longer stand one by one just out of the player's view: they come out of the raid's CAMPS
// at the town's edge, gather there into a WAVE, and march in on the town together.
//
//   THE CAMPS: one, or two for a big town, each at the edge of the town's streets on a side the raid's own tuple draws
//     (musterSides - no new draw, so every machine names the same camps), where the refugees' way starts
//     (scenes/raidSitesHost.js way): the way from there to the square is the wave's road in.
//   GATHERING: a raider stood at a camp is held there (a follower of the camp, leashed: it fights what comes at it)
//     until its wave is whole - MUSTER_WAVE_MIN to MUSTER_WAVE_MAX of them, or a kind's own pack - or MUSTER_GATHER_MAX_S
//     has gone by.
//   THE MARCH: the wave follows a guide walking the road at a marching pace, waiting for its stragglers, the column
//     leashed to it (it fights what it meets on the way); at the square the guide turns for the nearest player in the
//     town, and within MUSTER_ENGAGE_M of one (or MUSTER_MARCH_MAX_S on) the wave is let loose. The next wave gathers
//     while this one fights.
//   THE SMOKE: a column over each camp and over the houses nearest it, on every machine (scenes/raidMusterHost.js).
// A town with no streets or way for it keeps the mod's raid (one by one, just out of view): the muster answers null.
//
// The runner's side (the one machine that stands a raid's foes - systems/raidingParties.js), its clock the frame's.
// Not a DFU member, nor Kamer's: Ledger A (RAID1's row).

/** A wave of the classic raid: this many at the least and the most. */
export const MUSTER_WAVE_MIN = 6;
export const MUSTER_WAVE_MAX = 8;
/** How long a wave waits for its last raiders before it marches with what it has (s). */
export const MUSTER_GATHER_MAX_S = 40;
/** How soon the next raider of a gathering wave is stood (s). */
export const MUSTER_GATHER_STEP_S = 1.5;
/** A camp: how far round its heart its raiders are stood, and held (stop, leash; m). */
export const MUSTER_CAMP_R = 6;
export const MUSTER_HOLD_STOP_M = 3;
export const MUSTER_HOLD_LEASH_M = 10;
/** The march: the guide's pace (m/s), how far its column may string out before it waits (the mean, m), the column's
 *  leash and stop, how near a player lets it loose, and how long it marches at the most (s). */
export const MUSTER_MARCH_MPS = 1.6;
export const MUSTER_STRAGGLE_M = 7;
export const MUSTER_MARCH_LEASH_M = 12;
export const MUSTER_MARCH_STOP_M = 2.5;
export const MUSTER_ENGAGE_M = 14;
export const MUSTER_MARCH_MAX_S = 150;
/** A town this wide or wider (m, its walk grid's longer side) musters at two camps. */
export const MUSTER_TWO_CAMPS_M = 320;
/** How soon a camp not found is asked for again (s). */
export const MUSTER_SITE_AGAIN_S = 5;

/** FNV-1a over a raid's own tuple (raidKinds.js's, its own salt). */
function tupleHash(/** @type {any[]} */ parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 0x7c; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The sides (0 north, 1 east, 2 south, 3 west) a raid musters on: one, or two for a big town - read off the raid's
 *  key, start and party alone, the same on every machine. Pure. @param {any} raid @param {boolean} big */
export function musterSides(raid, big) {
  const key = raid?.key ?? `${raid?.regionIndex}:${raid?.locationIndex}:${raid?.startDay}`;
  const h = tupleHash(['raid-muster', key, raid?.startMinute, raid?.type]);
  const a = h % 4;
  return big ? [a, (a + 1 + ((h >>> 4) % 3)) % 4] : [a];
}

/** Is the town of this walk grid big enough for two camps? @param {{ width: number, height: number } | null | undefined} nav @param {number} cell */
export const musterBigTown = (nav, cell) => !!nav && Math.max(nav.width, nav.height) * cell >= MUSTER_TWO_CAMPS_M;

/**
 * THE RUNNER'S MUSTER. `deps`: `camps(raid)` - the raid's camps now, `[{ pts: [[x, y, z]...] }]` (each camp's heart its
 * first point, its road in the rest), or null while the town has none; `players()` the feet of the players in the town;
 * `release(raid, foe)` a raider let loose (its kind's objective). Every point in the scene's frame (offsetAll moves them).
 * @param {{ camps: (raid: any) => Array<{ pts: number[][] }> | null, players?: () => number[][], release?: (raid: any, foe: any) => void, random?: () => number, keyOf: (raid: any) => string }} deps
 */
export function createRaidMuster({ camps, players = () => [], release = () => {}, random = Math.random, keyOf }) {
  let clock = 0;
  /** key -> { camps, at } - each raid's camps, asked once and kept (a null asked again MUSTER_SITE_AGAIN_S on). */
  const sites = new Map();
  /** The waves: { key, raid, camp, target, asked, members: any[], since, phase: 'gather'|'march', guide, leg, marched }. */
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
  const loose = (w) => { for (const f of w.members) if (f.ai?.follow?.muster === w) { f.ai.follow = null; if (!f.dead) release(w.raid, f); } };
  return {
    /** Where the raid's next raider stands - a placement for the host's standRaider (`at` its camp's heart), or null
     *  (no camp: the caller's own). `size` a kind's pack (a new wave of that many), else a wave of MUSTER_WAVE_MIN-MAX. */
    place(raid, size = 0) {
      const c = campsOf(raid);
      if (!c) return null;
      const key = keyOf(raid);
      let w = forming(key);
      if (!w) {
        const target = size > 0 ? size : MUSTER_WAVE_MIN + Math.floor(random() * (MUSTER_WAVE_MAX - MUSTER_WAVE_MIN + 1));
        w = { key, raid, camp: c[made++ % c.length], target, asked: 0, members: [], since: clock, phase: 'gather', guide: null, leg: 0, marched: 0 };
        waves.push(w);
      }
      w.asked++;
      return { at: w.camp.pts[0], min: 1.5, max: MUSTER_CAMP_R, los: false, wave: w };
    },
    /** Whether the raid's gathering wave wants more raiders (the classic raid's clock). */
    gathering(raid) { return !!forming(keyOf(raid)); },
    /** A raider stood where `place` said: held at its camp with its wave. A stand that missed (`foe` null) is asked
     *  again. @param {any} at the placement `place` answered */
    adopt(at, foe) {
      const w = at?.wave;
      if (!w || !waves.includes(w)) return false;
      if (!foe) { w.asked = Math.max(0, w.asked - 1); return false; }
      w.members.push(foe);
      if (foe.ai) foe.ai.follow = w.phase === 'gather'
        ? { feet: () => w.camp.pts[0], stop: MUSTER_HOLD_STOP_M, leash: MUSTER_HOLD_LEASH_M, muster: w }
        : { feet: () => w.guide, stop: MUSTER_MARCH_STOP_M, leash: MUSTER_MARCH_LEASH_M, muster: w };
      return true;
    },
    /** One frame: waves whole (or tired of waiting) march, the marching walk on, a wave at a player is let loose. */
    step(dt) {
      if (!(dt > 0)) return;
      clock += dt;
      for (const w of waves) {
        const live = alive(w);
        if (w.phase === 'gather') {
          const whole = w.asked >= w.target && live.length >= w.target;
          if (!whole && !(clock - w.since >= MUSTER_GATHER_MAX_S && live.length)) continue;
          w.phase = 'march'; w.asked = w.target;   // no more join it
          w.guide = [...w.camp.pts[0]]; w.leg = 1;
          for (const f of live) if (f.ai) f.ai.follow = { feet: () => w.guide, stop: MUSTER_MARCH_STOP_M, leash: MUSTER_MARCH_LEASH_M, muster: w };
          continue;
        }
        w.marched += dt;
        if (!live.length) { w.done = true; continue; }
        const near = players().reduce((b, p) => { const d = Math.hypot(p[0] - w.guide[0], p[2] - w.guide[2]); return d < b.d ? { p, d } : b; }, { p: null, d: Infinity });
        if (near.d <= MUSTER_ENGAGE_M || w.marched >= MUSTER_MARCH_MAX_S) { loose(w); w.done = true; continue; }
        // the column keeps together: the guide waits while it is strung out
        const spread = live.reduce((s, f) => s + (f.ai?.feet ? Math.hypot(f.ai.feet[0] - w.guide[0], f.ai.feet[2] - w.guide[2]) : 0), 0) / live.length;
        if (spread > MUSTER_STRAGGLE_M) continue;
        // its road in, then the nearest player
        const goal = w.leg < w.camp.pts.length ? w.camp.pts[w.leg] : near.p;
        if (!goal) continue;
        const dx = goal[0] - w.guide[0], dz = goal[2] - w.guide[2], d = Math.hypot(dx, dz), stepM = MUSTER_MARCH_MPS * dt;
        if (d <= stepM) { w.guide[0] = goal[0]; w.guide[1] = goal[1]; w.guide[2] = goal[2]; if (w.leg < w.camp.pts.length) w.leg++; }
        else { w.guide[0] += (dx / d) * stepM; w.guide[2] += (dz / d) * stepM; w.guide[1] += ((goal[1] - w.guide[1]) * stepM) / d; }
      }
      waves = waves.filter((w) => !w.done && !(w.phase === 'gather' && w.asked >= w.target && !alive(w).length && clock - w.since > MUSTER_GATHER_MAX_S));
    },
    /** A raid ended, or no longer mine: its waves let go (its raiders as the raid leaves them), its camps forgotten. */
    end(key) {
      for (const w of waves) if (w.key === key) for (const f of w.members) if (f.ai?.follow?.muster === w) f.ai.follow = null;
      waves = waves.filter((w) => w.key !== key);
      sites.delete(key);
    },
    /** The world's origin moved by `d`: every camp, road and guide with it. */
    offsetAll(d) {
      const shift = (p) => { if (Array.isArray(p)) { p[0] += d[0]; p[1] += d[1]; p[2] += d[2]; } };
      for (const s of sites.values()) for (const c of s.camps ?? []) for (const p of c.pts) shift(p);
      for (const w of waves) shift(w.guide);   // a wave's camp is its raid's, shifted above
    },
    /** For the pins and the probes: the waves as they stand. */
    waves: () => waves.map((w) => ({ key: w.key, phase: w.phase, target: w.target, asked: w.asked, live: alive(w).length })),
  };
}
