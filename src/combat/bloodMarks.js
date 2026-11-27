// @ts-check
// Marks are their own binding. The splash pool hands its batches off and must not end them, while this pool owns
// its ring and batches, and its host ends it by name.

import {
  createBloodDecalPool, writeDecalQuad, bloodRate, marksBlood, DECAL_FLOATS,
  sprayCount, sprayRadius, sprayPattern, dropSize,
  isOverkill, burstCount, burstRate, burstReach,
  scaleRate, looksUp, isCeilingNormal, streakFor, impactStretch,
  CEILING_DOT,
} from './bloodDecals.js';
import {
  throwGibs, gibStep, gibFly, gibLand, gibSprayOrigin, shiftGibs, dripFrom,
  GIB_SPLASH_RATE, GIB_COUNT, DRIP_SPLASH_RATE,
} from './bloodGibs.js';
import { bloodAtlas, prewarmBloodAtlas, bloodDropletArt, BLOOD_DROP_RECORD, pickCell, bloodMarkKind, freshTint, dryStage, driedTint, wetAt, DRY_TICK, BLOOD_ATLAS_ARCHIVE, BLOOD_ATLAS_RECORD } from './bloodArt.js';
import { BLEED_RADIUS, BLEED_RATE, POOL_SIZE, POOL_SPREAD, POOL_STEPS, poolSizeAt } from './bloodBleed.js';

export const WALL_RUN_LEAN = 0.12;
export const MARK_DROP = 3;
// Floor rays start at knee height because a ray that starts on the floor never meets it.
export const DRIP_FROM = 0.5;
export const BLEED_DROPS_CAP = 8;
export const MAX_SPREADS = 16;
export const TRACK_STEPS = 6;
export const TRACK_WET_STAGE = 2;
export const PRINT_SIZE = 0.34;
export const PRINT_SPREAD = 0.13;
export const STEP_ABOVE = 0.25;

const DOWN = Object.freeze([0, -1, 0]);
const UP = Object.freeze([0, 1, 0]);

// A mark stays where it was laid, so a moving surface such as a swinging step or a ship's deck takes none.
export const onMover = (col, h) => h?.key != null && !!col?.bucketPose?.(h.key);

export const CEILING_REACH = 4;

export const MAX_BODIES = 4;

export const MAX_DRIPS = 64;

export const GIB_QUAD = Object.freeze({ w: 0.28, h: 0.28 });
export const GIB_FRAME = 0;

export const DROP_GRAVITY = 9.81;
/** @type {Readonly<{ min: number, max: number }>} */
export const DROP_LAUNCH = Object.freeze({ min: 0.3, max: 1.8 });
export const DRIP_LAUNCH = Object.freeze({ min: 0, max: 0.25 });
export const DROP_CEILING_SPARE = Object.freeze({ min: 1.05, max: 1.3 });
export const MAX_FLYING = 256;
export const DROP_QUAD = Object.freeze({ w: 0.055, h: 0.055 });

export function dropArc(from, to, rng = Math.random, g = DROP_GRAVITY, launch = DROP_LAUNCH) {
  const dy = to[1] - from[1];
  if (!Number.isFinite(dy)) return null;
  if (dy > 0) {
    const need = Math.sqrt(2 * g * dy);
    const vy = need * (DROP_CEILING_SPARE.min + rng() * (DROP_CEILING_SPARE.max - DROP_CEILING_SPARE.min));
    const T = (vy - Math.sqrt(Math.max(0, vy * vy - 2 * g * dy))) / g;
    return T > 0 ? { vy, T } : null;
  }
  const vy = launch.min + rng() * (launch.max - launch.min);
  const T = (vy + Math.sqrt(vy * vy - 2 * g * dy)) / g;
  return T > 0 ? { vy, T } : null;
}

export function dropAt(f, t, out = [0, 0, 0], g = DROP_GRAVITY) {
  const k = Math.max(0, Math.min(1, t / f.T));
  const tt = k * f.T;
  out[0] = f.from[0] + (f.to[0] - f.from[0]) * k;
  out[1] = k >= 1 ? f.to[1] : f.from[1] + f.vy * tt - 0.5 * g * tt * tt;
  out[2] = f.from[2] + (f.to[2] - f.from[2]) * k;
  return out;
}

// collider is a getter because hosts rebuild their colliders on mode changes and streaming loads, and this pool
// outlives them.
/**
 * @param {{renderer?:any, collider?:(() => any)|null, settings?:any, texture?:(() => any)|null, rng?:(() => number)}} [deps]
 */
export function createBloodMarks({ renderer = null, collider = null, settings = null, texture = null, rng = Math.random } = {}) {
  let _pool = null;
  let _batch = null;
  let _atlasTex = null;
  let _atlas = null;
  const atlas = () => (_atlas ??= bloodAtlas());
  let _clock = 0;
  let _dryDue = DRY_TICK;
  let _spreads = [];
  let _tracks = new WeakMap();
  let _gibs = [];
  let _gibBatch = null;
  let _gibArt = null;
  let _drips = [];
  // Dispose is terminal; a late place or tick must not rebuild a ring that nobody will free.
  let _dead = false;
  let _gibPos = [];
  // Slot writes land in this mirror and upload as contiguous dirty runs, one call per run.
  let _mirror = null;
  let _dirty = [];
  let _flying = [];
  let _dropBatch = null;
  let _dropPos = [];

  const liveCollider = () => (typeof collider === 'function' ? collider() : null);
  const on = () => !_dead && !!(settings?.enabled?.() ?? false) && typeof collider === 'function' && !!renderer?.createDecalBatch;
  const overkillOn = () => !!(settings?.overkill?.() ?? false);
  const flightOn = () => !!(settings?.flight?.() ?? false) && !!renderer?.createBillboardBatch && !!renderer?.moveBillboardBatch && !!renderer?.uploadTexture;
  const markTexture = texture ?? (() => _atlasTex);

  function ensure() {
    if (_pool) return;
    const cap = Math.max(1, Math.floor(settings?.capacity?.() ?? 1000));
    _pool = createBloodDecalPool({ capacity: cap, rng });
    _batch = renderer.createDecalBatch(cap);
    _mirror = new Float32Array(cap * DECAL_FLOATS);
    _dirty = [];
  }
  function wear() {
    if (!_atlasTex && renderer?.uploadTexture) _atlasTex = renderer.uploadTexture(BLOOD_ATLAS_ARCHIVE, BLOOD_ATLAS_RECORD, atlas(), { smooth: true }) ?? null;
  }

  function writeSlot(d) {
    writeDecalQuad(_mirror, d.slot * DECAL_FLOATS, d, d.uv);
    _dirty.push(d.slot);
  }
  function flush() {
    if (!_dirty.length || !_batch) { _dirty = []; return 0; }
    _dirty.sort((a, b) => a - b);
    let n = 0;
    for (let i = 0; i < _dirty.length;) {
      const lo = _dirty[i];
      let hi = lo + 1;
      while (i + 1 < _dirty.length && _dirty[i + 1] <= hi) { i++; if (_dirty[i] === hi) hi++; }
      renderer.writeDecalSlot(_batch, lo, _mirror.subarray(lo * DECAL_FLOATS, hi * DECAL_FLOATS));
      n++;
      i++;
    }
    _dirty = [];
    return n;
  }

  function useArt(archive, record) {
    _gibArt = { archive, record };
  }

  function dress(d, kind, alpha = 1) {
    wear();
    d.uv = pickCell(atlas(), kind, rng);
    d.fresh = freshTint(rng);
    d.fresh[3] = alpha;
    d.tint = d.fresh;
    d.born = _clock;
    d.stage = 0;
    d.wet = wetAt(0);
    return d;
  }
  function lay(at, normal, opts, kind, alpha = 1) {
    const d = _pool.place(at, normal, opts);
    if (!d) return null;
    dress(d, kind, alpha);
    writeSlot(d);
    return d;
  }

  function land(fly, from, at, normal, opts, kind, drips, streaky = false, launch = DROP_LAUNCH) {
    if (fly && _flying.length < MAX_FLYING) {
      const arc = dropArc(from, at, rng, DROP_GRAVITY, launch);
      if (arc) {
        if (streaky) {
          const across = Math.hypot(at[0] - from[0], at[2] - from[2]) / arc.T;
          opts.stretch = impactStretch(across, arc.vy - DROP_GRAVITY * arc.T);
          kind = bloodMarkKind({ stretch: opts.stretch });
        }
        _flying.push({ from: [from[0], from[1], from[2]], to: at, vy: arc.vy, T: arc.T, age: 0, pos: [from[0], from[1], from[2]], land: { normal, opts, kind, drips } });
        return null;
      }
    }
    return settle(at, normal, opts, kind, drips);
  }
  function settle(at, normal, opts, kind, drips) {
    const d = lay(at, normal, opts, kind);
    if (d && drips && _drips.length < MAX_DRIPS) _drips.push(dripFrom(at));
    return d;
  }

  function spray(col, pos, n, radius, rate, thrown = null, { up: mayLookUp = true, streak: mayStreak = true, launch = DROP_LAUNCH } = {}) {
    let pool = null;
    const tx = thrown?.[0] ?? 0, tz = thrown?.[1] ?? 0;
    const pattern = sprayPattern(n, radius, thrown, rng);
    const fly = flightOn();
    for (let i = 0; i < n; i++) {
      const { dx, dz, scale } = pattern[i];
      const fromX = pos[0] + dx + (i > 0 ? tx : 0), fromZ = pos[2] + dz + (i > 0 ? tz : 0);
      const up = mayLookUp && looksUp(i);
      const dir = up ? UP : DOWN, reach = up ? CEILING_REACH : MARK_DROP;
      const ox = fromX - pos[0], oz = fromZ - pos[2];
      const run = i > 0 ? Math.hypot(ox, oz) : 0;
      // Each drop rays from the body to its spot first, so blood cannot pass through a wall that is in the way.
      if (run > 1e-6 && col.raycastHit) {
        const wall = col.raycastHit(pos, [ox / run, 0, oz / run], run);
        if (wall && Number.isFinite(wall.dist) && wall.dist <= run) {
          if (onMover(col, wall)) continue;
          const wx = pos[0] + (ox / run) * wall.dist, wz = pos[2] + (oz / run) * wall.dist;
          ensure();
          const lean = (rng() * 2 - 1) * WALL_RUN_LEAN;
          land(fly, pos, [wx, pos[1], wz], wall.normal ?? [-ox / run, 0, -oz / run], { size: dropSize(i, rate, rng) * scale, turn: lean }, bloodMarkKind({ wall: true }), false, false, launch);
          continue;
        }
      }
      // surfaceHit adds the heightAt ground, which raycastHit misses outdoors where the ground is not a mesh.
      const h = col.surfaceHit([fromX, pos[1], fromZ], dir, reach);
      if (!h || !Number.isFinite(h.dist) || h.dist > reach) continue;
      if (onMover(col, h)) continue;
      const at = [fromX, pos[1] + dir[1] * h.dist, fromZ];
      if (up && !isCeilingNormal(h.normal)) continue;
      ensure();
      const stretch = mayStreak ? streakFor(run, radius) : 1;
      const opts = {
        size: dropSize(i, rate, rng) * scale,
        along: run > 1e-6 ? [ox, 0, oz] : null,
        stretch,
      };
      const kind = bloodMarkKind({ pool: i === 0, stretch });
      if (i > 0) { land(fly, pos, at, h.normal ?? (up ? DOWN : [0, 1, 0]), opts, kind, up, mayStreak, launch); continue; }
      const d = lay(at, h.normal ?? (up ? DOWN : [0, 1, 0]), opts, kind);
      if (!d) continue;
      pool = d;
    }
    return pool;
  }

  function drip(bloodIndex, feet, count) {
    if (!on() || !feet || !marksBlood(bloodIndex)) return null;
    const col = liveCollider();
    if (!col?.surfaceHit) return null;
    const n = Math.max(1, Math.min(BLEED_DROPS_CAP, count | 0));
    const d = spray(col, [feet[0], feet[1] + DRIP_FROM, feet[2]], n, BLEED_RADIUS, BLEED_RATE, null, { up: false, streak: false, launch: DRIP_LAUNCH });
    flush();
    return d;
  }

  function spreadPool(bloodIndex, feet) {
    if (!on() || !feet || !marksBlood(bloodIndex)) return null;
    const col = liveCollider();
    if (!col?.surfaceHit) return null;
    const h = col.surfaceHit([feet[0], feet[1] + DRIP_FROM, feet[2]], DOWN, MARK_DROP);
    if (!h || !Number.isFinite(h.dist) || h.dist > MARK_DROP) return null;
    if (h.dist < DRIP_FROM - STEP_ABOVE) return null;
    if (onMover(col, h)) return null;
    ensure();
    const d = lay([feet[0], feet[1] + DRIP_FROM - h.dist, feet[2]], h.normal ?? [0, 1, 0], { size: POOL_SIZE.start }, 'pool');
    flush();
    if (!d) return null;
    if (_spreads.length >= MAX_SPREADS) _spreads.shift();
    _spreads.push({ d, born: _clock });
    return d;
  }

  function spread() {
    if (!_spreads.length || !_pool) return 0;
    let n = 0;
    _spreads = _spreads.filter(({ d, born }) => {
      if (_pool.at(d.slot) !== d) return false;
      const size = poolSizeAt(_clock - born);
      if (size !== d.size) {
        d.size = size;
        writeSlot(d);
        n++;
      }
      return _clock - born < POOL_SPREAD;
    });
    return n;
  }

  function step(walker, pos, forward = null) {
    if (!on() || !walker || !pos || !_pool) return null;
    const col = liveCollider();
    if (!col?.surfaceHit) return null;
    // A surface well above the feet, such as a crate the streamed feet sit inside, is not the floor.
    const h = col.surfaceHit([pos[0], pos[1] + DRIP_FROM, pos[2]], DOWN, MARK_DROP);
    if (!h || !Number.isFinite(h.dist) || h.dist > MARK_DROP) return null;
    if (h.dist < DRIP_FROM - STEP_ABOVE) return null;
    if (onMover(col, h)) return null;
    const foot = [pos[0], pos[1] + DRIP_FROM - h.dist, pos[2]];
    let wet = false;
    for (let i = 0, cap = _pool.capacity; i < cap; i++) {
      const d = _pool.at(i);
      if (!d || d.uv?.kind === 'print' || !(d.normal[1] > CEILING_DOT) || (d.stage ?? 0) > TRACK_WET_STAGE) continue;
      const dx = foot[0] - d.pos[0], dz = foot[2] - d.pos[2];
      if (dx * dx + dz * dz <= (d.size * 0.5) * (d.size * 0.5) && Math.abs(foot[1] - d.pos[1]) < 0.5) { wet = true; break; }
    }
    let t = _tracks.get(walker);
    if (wet) {
      if (!t) { t = { left: TRACK_STEPS, side: 1 }; _tracks.set(walker, t); } else t.left = TRACK_STEPS;
      return null;
    }
    if (!t || t.left <= 0) return null;
    const f = forward && Math.hypot(forward[0], forward[2]) > 1e-6 ? [forward[0], 0, forward[2]] : null;
    const rx = f ? f[2] / Math.hypot(f[0], f[2]) : 1, rz = f ? -f[0] / Math.hypot(f[0], f[2]) : 0;
    t.side = -t.side;
    const at = [foot[0] + rx * PRINT_SPREAD * t.side, foot[1], foot[2] + rz * PRINT_SPREAD * t.side];
    const share = t.left / TRACK_STEPS;
    t.left -= 1;
    ensure();
    const d = lay(at, h.normal ?? [0, 1, 0], { size: PRINT_SIZE, along: f, stretch: 1 }, bloodMarkKind({ print: true }), share);
    flush();
    return d;
  }

  function place(bloodIndex, pos, hit = null) {
    if (!on() || !pos) return null;
    if (!marksBlood(bloodIndex)) return null;
    const col = liveCollider();
    if (!col?.surfaceHit) return null;
    const damage = hit?.damage ?? 0, maxHealth = hit?.maxHealth ?? 0;
    const density = settings?.density?.() ?? 1;
    // The burst goes down first so the ordinary spray's pool lands on top of it.
    if (overkillOn() && isOverkill(damage, maxHealth)) {
      const heavy = !!hit?.fromPlayer && !!hit?.heavy;
      spray(col, pos, burstCount(heavy, density), burstReach(heavy, density), burstRate(heavy, density), hit?.throw);
      if (heavy && _gibs.length < GIB_COUNT * MAX_BODIES) { _gibs = _gibs.concat(throwGibs(pos, rng)); reseatGibs(); }
    }
    const rate = bloodRate(damage, maxHealth, density);
    const pool = spray(col, pos, sprayCount(rate), sprayRadius(rate), rate, hit?.throw);
    flush();
    return pool;
  }

  function reseatGibs() {
    if (_gibBatch) { renderer?.destroyBillboardBatch?.(_gibBatch); _gibBatch = null; }
    _gibPos = _gibs.map((g) => g.pos);
    if (!_gibs.length || !renderer?.createBillboardBatch || !_gibArt) return;
    _gibBatch = renderer.createBillboardBatch(
      _gibArt.archive, _gibArt.record, GIB_QUAD, _gibPos, { dynamic: true },
    );
    if (_gibBatch) _gibBatch.frame = GIB_FRAME;
  }

  function fall(list, dt, col, rate) {
    let moved = 0;
    for (const g of list) {
      const step = gibStep(g, dt);
      if (!step) continue;
      moved++;
      const h = col?.surfaceHit ? col.surfaceHit(step.from, step.dir, step.dist) : null;
      if (!h || !Number.isFinite(h.dist) || h.dist > step.dist) { gibFly(g, step); continue; }
      gibLand(g, [
        step.from[0] + step.dir[0] * h.dist,
        step.from[1] + step.dir[1] * h.dist,
        step.from[2] + step.dir[2] * h.dist,
      ]);
      if (on() && col) spray(col, gibSprayOrigin(g), sprayCount(rate), sprayRadius(rate), rate);
    }
    return moved;
  }

  function dryPass() {
    if (!_pool || !_pool.count) return 0;
    let n = 0;
    for (let i = 0, cap = _pool.capacity; i < cap; i++) {
      const d = _pool.at(i);
      if (!d) continue;
      const stage = dryStage(_clock - (d.born ?? _clock));
      if (stage === (d.stage ?? 0)) continue;
      d.stage = stage;
      d.tint = driedTint(d.fresh ?? d.tint ?? [1, 1, 1, 1], stage);
      d.wet = wetAt(stage);
      writeSlot(d);
      n++;
    }
    return n;
  }
  function dry() { const n = dryPass(); flush(); return n; }

  function tick(dt) {
    if (!(dt > 0)) return 0;
    _clock += dt;
    let wrote = 0;
    if (_clock >= _dryDue) { _dryDue = _clock + DRY_TICK; wrote += dryPass(); }
    wrote += spread();
    if (wrote) flush();
    const flew = _flying.length ? flyDrops(dt) : 0;
    if (!_gibs.length && !_drips.length) return flew;
    if (!on()) { _gibs = []; _drips = []; reseatGibs(); return flew; }
    // The gib art can resolve after the throw, so a flight with no batch builds one once the art arrives.
    if (_gibs.length && !_gibBatch && _gibArt) reseatGibs();
    const col = liveCollider();
    const density = settings?.density?.() ?? 1;
    const rate = scaleRate(GIB_SPLASH_RATE, density);
    let moved = fall(_gibs, dt, col, rate);
    moved += fall(_drips, dt, col, scaleRate(DRIP_SPLASH_RATE, density));
    flush();
    if (_drips.length && _drips.every((g) => g.still)) _drips = [];
    if (_gibBatch) renderer?.moveBillboardBatch?.(_gibBatch, _gibPos);
    // The length check comes first because every() on an empty list is true.
    if (_gibs.length && _gibs.every((g) => g.still)) { _gibs = []; reseatGibs(); }
    return moved + flew;
  }

  function flyDrops(dt) {
    if (!on()) { _flying = []; return 0; }
    let landed = false;
    let keep = 0;
    for (let k = 0; k < _flying.length; k++) {
      const f = _flying[k];
      f.age += dt;
      if (f.age >= f.T) {
        settle(f.to, f.land.normal, f.land.opts, f.land.kind, f.land.drips);
        landed = true;
        continue;
      }
      dropAt(f, f.age, f.pos);
      _flying[keep++] = f;
    }
    _flying.length = keep;
    if (landed) flush();
    moveDrops();
    return keep;
  }
  function moveDrops() {
    if (!_flying.length) return;
    if (!_dropBatch && renderer?.createBillboardBatch && renderer?.uploadTexture) {
      const art = bloodDropletArt();
      renderer.uploadTexture(BLOOD_ATLAS_ARCHIVE, BLOOD_DROP_RECORD, art);
      _dropPos = Array.from({ length: MAX_FLYING }, () => [0, 0, 0]);
      _dropBatch = renderer.createBillboardBatch(BLOOD_ATLAS_ARCHIVE, BLOOD_DROP_RECORD, DROP_QUAD, _dropPos, { dynamic: true }) ?? null;
      if (_dropBatch) _dropBatch.noShadow = true;
    }
    if (!_dropBatch) return;
    const lead = _flying[0].pos;
    for (let k = 0; k < MAX_FLYING; k++) {
      const p = k < _flying.length ? _flying[k].pos : lead;
      const c = _dropPos[k];
      c[0] = p[0]; c[1] = p[1]; c[2] = p[2];
    }
    renderer.moveBillboardBatch(_dropBatch, _dropPos);
  }

  function shiftOrigin(offset) {
    shiftGibs(_gibs, offset);
    shiftGibs(_drips, offset);
    // The host shifts, draws, then ticks, so the quads must move now or they draw one frame in the old origin.
    if (_gibBatch) renderer?.moveBillboardBatch?.(_gibBatch, _gibPos);
    if (offset && _flying.length) {
      for (const f of _flying) for (const p of [f.from, f.to, f.pos]) { p[0] += offset[0]; p[1] += offset[1]; p[2] += offset[2]; }
      moveDrops();
    }
    if (!_pool || !_pool.count || !offset) return 0;
    const n = _pool.shiftOrigin(offset);
    for (let i = 0, cap = _pool.capacity; i < cap; i++) {
      const d = _pool.at(i);
      if (d) writeSlot(d);
    }
    flush();
    return n;
  }

  function draw(camRight = null, camUp = null) {
    if (!on()) return false;
    let drew = false;
    const tex = markTexture();
    flush();
    if (_batch && _pool && _pool.count && tex) { renderer.drawDecals(_batch, tex, _pool.ranges?.() ?? null); drew = true; }
    if (_gibBatch && camRight && camUp && renderer?.drawBillboards) {
      renderer.drawBillboards([_gibBatch], camRight, camUp);
      drew = true;
    }
    if (_dropBatch && _flying.length && camRight && camUp && renderer?.drawBillboards) {
      renderer.drawBillboards([_dropBatch], camRight, camUp);
      drew = true;
    }
    return drew;
  }

  function clear() {
    _spreads = [];
    _gibs = []; reseatGibs();
    _drips = [];
    _flying = [];
    _tracks = new WeakMap();
    _dirty = [];
    if (!_pool) return 0;
    const n = _pool.count;
    // Nothing uploads here: clearing resets the ring's touched count, so stale slots are never drawn.
    _pool.clear();
    return n;
  }

  // The ring is built at boot to the tier set then; only the atlas waits for the first mark, since it is the
  // expensive part.
  if (renderer?.createDecalBatch) ensure();
  if (renderer?.createDecalBatch && on()) prewarmBloodAtlas();

  return {
    place, draw, tick, shiftOrigin, clear, useArt,
    drip, spreadPool,
    step,
    tracked: (walker) => _tracks.get(walker)?.left ?? 0,
    spreads: () => _spreads.slice(),
    gibs: () => _gibs.slice(),
    drips: () => _drips.slice(),
    flying: () => _flying.slice(),
    count: () => (_pool ? _pool.count : 0),
    dispose() {
      clear();
      if (_batch) renderer?.destroyDecalBatch?.(_batch);
      if (_dropBatch) renderer?.destroyBillboardBatch?.(_dropBatch);
      _dropBatch = null; _dropPos = [];
      _batch = null; _pool = null; _mirror = null; _dirty = []; _atlasTex = null; _gibArt = null;
      _dead = true;
    },
    _pool: () => _pool,
    _mirror: () => _mirror,
    dry,
    clock: () => _clock,
  };
}
