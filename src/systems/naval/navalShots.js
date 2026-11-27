// @ts-check
import { shotPosition, shotVelocity, segmentBoxEntry, segmentCrossesDown, toBoxLocal } from './navalBallistics.js';
import { hitZone } from './navalDamage.js';
import { GUNS, BARREL, SHIP_TOUGHNESS } from './navalShips.js';
import { shotGun } from './shotKinds.js';

export const NEAR_MISS_M = 8;
export const BALL_LIFE = 9;
// A flight the step came late to is walked along its arc in pieces this long, never across the chord.
export const BALL_STEP_S = 0.1;
export const FLOAT_DRIFT = 0.1;
export const BARREL_ARM = 1.6;
export const FLOTSAM_LIFE = Math.round(150 * SHIP_TOUGHNESS);
export const FLOTSAM_REACH = 3;
const GROUND_STEP = 4;

/**
 * @typedef {{ id: string, box: { c: number[], ax: number[], ay: number[], az: number[], h: number[] }, rig?: any[], alive?: boolean,
 *   hitBy?: (shooter: any) => boolean, ear?: boolean }} ShotTarget
 */

/**
 * @param {{ seaY: () => number, targets: () => ShotTarget[], ground?: ((p: number[]) => boolean) | null,
 *           collectors?: () => { id: string, box: any }[], onEvent?: (e: any) => void, random?: () => number,
 *           wind?: () => number[] }} deps
 */
export function createShotField(deps) {
  /** @type {any[]} */ let balls = [];
  /** @type {any[]} */ let floaters = [];
  let clock = 0;
  const emit = (e) => deps.onEvent?.(e);
  const random = deps.random ?? Math.random;

  // A volley with resolve false is another client's, flown from the same launches and seed; its hits count there.
  function fireVolley({ id, shooter, launches, resolve = true, side = null, owner = null, since = 0 }) {
    const back = Math.max(0, since);
    for (const l of launches) {
      balls.push({
        volley: id, shooter, owner, resolve, side, gun: l.gun, shot: l.shot ?? null, weight: l.weight ?? 1, index: l.index, count: launches.length,
        p0: [...l.p0], v0: [...l.v0], born: clock - back + Math.max(0, l.delay ?? 0), t: 0, shown: false, prev: [...l.p0], pos: [...l.p0], spin: random() * Math.PI * 2,
      });
    }
  }

  function dropBarrel({ id, shooter, pos, resolve = true, owner = null }) {
    floaters.push({ kind: 'barrel', id, shooter, owner, resolve, pos: [...pos], born: clock, life: BARREL.life, phase: random() * Math.PI * 2 });
  }
  /** @param {{ id: string, pos: number[], lot?: number|string, from?: string|null, owner?: string|null, deep?: boolean, life?: number }} f */
  function dropFlotsam({ id, pos, lot = 0, from = null, owner = null, deep = false, life = FLOTSAM_LIFE }) {
    floaters.push({ kind: 'flotsam', id, from, lot, owner, deep: !!deep, pos: [...pos], born: clock, life, phase: random() * Math.PI * 2 });
  }

  const nearestHit = (targets, a, b, radius, shooter) => {
    let best = null;
    for (const t of targets) {
      if (t.alive === false || t.id === shooter || t.hitBy?.(shooter) === false) continue;
      const e = segmentBoxEntry(a, b, t.box, radius);
      if (e && (!best || e.t < best.e.t)) best = { t, e };
    }
    return best;
  };
  const rigsCrossed = (targets, a, b, radius, ball, before) => {
    const out = [];
    for (const t of targets) {
      if (t.alive === false || t.id === ball.shooter || t.hitBy?.(ball.shooter) === false || !t.rig?.length || ball.rigged?.has(t.id)) continue;
      let best = null;
      for (const box of t.rig) { const e = segmentBoxEntry(a, b, box, radius); if (e && e.t <= before && (!best || e.t < best.t)) best = e; }
      if (best) out.push({ t, e: best });
    }
    return out.sort((x, y) => x.e.t - y.e.t);
  };

  function groundAlong(a, b) {
    if (!deps.ground) return null;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.ceil(len / GROUND_STEP));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (deps.ground([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k])) return k;
    }
    return null;
  }

  function passTold(b, id) {
    const n = b.near?.get(id);
    if (!n) return;
    b.near.delete(id);
    (b.passed ??= new Set()).add(id);
    emit({ type: 'pass', volley: b.volley, shooter: b.shooter, owner: b.owner, target: id, gun: b.gun, shot: b.shot, point: n.point, gap: n.gap, dir: n.dir });
  }
  function flyPiece(b, a, next, targets, seaY, t1 = b.t) {
    const radius = (b.radius ??= shotGun(b.gun, GUNS[b.gun], b.shot)?.radius ?? 0.1);
    const flight = (k) => b.t + (t1 - b.t) * k;
    const ship = nearestHit(targets, a, next, radius, b.shooter);
    const sea = segmentCrossesDown(a, next, seaY);
    const land = groundAlong(a, next);
    const firstT = Math.min(ship ? ship.e.t : Infinity, sea ?? Infinity, land ?? Infinity);
    const dir = [next[0] - a[0], next[1] - a[1], next[2] - a[2]];
    for (const r of rigsCrossed(targets, a, next, radius, b, firstT)) {
      (b.rigged ??= new Set()).add(r.t.id);
      emit({ type: 'hit', volley: b.volley, shooter: b.shooter, owner: b.owner, target: r.t.id, gun: b.gun, shot: b.shot, t: flight(r.e.t), weight: b.weight, point: r.e.point, zone: 'rig', dir, resolve: b.resolve });
    }
    for (const t of targets) {
      if (!t.ear || t.id === b.shooter || b.passed?.has(t.id)) continue;
      if (ship && ship.t.id === t.id && ship.e.t === firstT) { b.near?.delete(t.id); continue; }
      const upTo = firstT === Infinity ? 1 : firstT;
      if (segmentPointGap(a, next, t.box.c, upTo) > Math.hypot(t.box.h[0], t.box.h[1], t.box.h[2]) + NEAR_MISS_M) continue;
      const near = segmentNearBox(a, next, t.box, upTo), was = b.near?.get(t.id);
      // The nearest pass is held while the gap falls and told in the piece where it turns, or where the ball stops.
      if (near.gap <= NEAR_MISS_M && (!was || near.gap < was.gap)) (b.near ??= new Map()).set(t.id, { point: near.point, gap: near.gap, dir });
      if (near.u < upTo - 1e-3 || firstT !== Infinity) passTold(b, t.id);
    }
    if (firstT === Infinity) return false;
    const at = (k) => [a[0] + (next[0] - a[0]) * k, a[1] + (next[1] - a[1]) * k, a[2] + (next[2] - a[2]) * k];
    if (ship && ship.e.t === firstT) {
      emit({
        type: 'hit', volley: b.volley, shooter: b.shooter, owner: b.owner, target: ship.t.id, gun: b.gun, shot: b.shot, t: flight(ship.e.t), weight: b.weight, point: ship.e.point,
        zone: hitZone(ship.e.point[1] - seaY), dir, resolve: b.resolve,
      });
    } else if (land != null && land === firstT) emit({ type: 'land', volley: b.volley, shooter: b.shooter, gun: b.gun, shot: b.shot, point: at(land) });
    else emit({ type: 'splash', volley: b.volley, shooter: b.shooter, gun: b.gun, shot: b.shot, point: [at(sea ?? 0)[0], seaY, at(sea ?? 0)[2]] });
    return true;
  }

  function step(dt) {
    clock += Math.max(0, dt);
    const seaY = deps.seaY();
    // Targets are read once a step, never per ball or barrel.
    const targets = balls.length || floaters.length ? deps.targets() : [];
    const keep = [];
    for (const b of balls) {
      if (clock < b.born) { keep.push(b); continue; }
      const age = clock - b.born;
      if (!b.shown) {
        b.shown = true;
        emit({ type: 'muzzle', volley: b.volley, shooter: b.shooter, owner: b.owner, side: b.side, gun: b.gun, shot: b.shot, index: b.index, count: b.count, pos: [...b.p0], dir: [...b.v0], resolve: b.resolve });
      }
      if (age > BALL_LIFE) { for (const id of [...(b.near?.keys() ?? [])]) passTold(b, id); emit({ type: 'gone', volley: b.volley, shooter: b.shooter, gun: b.gun }); continue; }
      let ended = false;
      while (!ended && b.t < age) {
        const t1 = Math.min(age, b.t + BALL_STEP_S);
        const a = b.pos, next = shotPosition(b.p0, b.v0, t1, undefined, [0, 0, 0]);
        ended = flyPiece(b, a, next, targets, seaY, t1);
        if (!ended) { b.prev = a; b.pos = next; b.t = t1; }
      }
      if (!ended) keep.push(b);
    }
    balls = keep;
    const floatKeep = [];
    const w = floaters.length ? (deps.wind?.() ?? null) : null;
    const span = Math.max(0, dt);
    for (const f of floaters) {
      const age = clock - f.born;
      if (age > f.life) { emit({ type: 'sink', kind: f.kind, id: f.id, point: [...f.pos] }); continue; }
      if (w) { f.pos[0] += (w[0] ?? 0) * FLOAT_DRIFT * span; f.pos[2] += (w[2] ?? 0) * FLOAT_DRIFT * span; }
      f.pos[1] = seaY + 0.15 * Math.sin(clock * 1.7 + f.phase);
      if (f.kind === 'barrel' && age >= BARREL_ARM) {
        const t = targets.find((s) => s.alive !== false && s.id !== f.shooter && s.hitBy?.(f.shooter) !== false && insideGrown(s.box, f.pos, BARREL.fuse));
        if (t) { emit({ type: 'blast', id: f.id, shooter: f.shooter, owner: f.owner, target: t.id, point: [...f.pos], resolve: f.resolve }); continue; }
      }
      if (f.kind === 'flotsam') {
        const c = (deps.collectors?.() ?? []).find((k) => insideGrown(k.box, f.pos, FLOTSAM_REACH));
        if (c) { emit({ type: 'pickup', id: f.id, lot: f.lot, from: f.from, owner: f.owner, deep: !!f.deep, collector: c.id, point: [...f.pos] }); continue; }
      }
      floatKeep.push(f);
    }
    floaters = floatKeep;
  }

  function offsetAll(o) {
    for (const b of balls) for (const k of ['p0', 'prev', 'pos']) { b[k][0] += o[0]; b[k][1] += o[1]; b[k][2] += o[2]; }
    for (const f of floaters) { f.pos[0] += o[0]; f.pos[1] += o[1]; f.pos[2] += o[2]; }
  }

  return {
    fireVolley, dropBarrel, dropFlotsam, step, offsetAll,
    balls: () => balls.filter((b) => b.shown).map((b) => ({ pos: b.pos, gun: b.gun, shot: b.shot, spin: b.spin + (clock - b.born) * 12, age: clock - b.born, vel: shotVelocity(b.v0, b.t) })),
    floaters: () => floaters.map((f) => ({ kind: f.kind, pos: f.pos, id: f.id, phase: f.phase, lot: f.lot, from: f.from, owner: f.owner ?? null, deep: !!f.deep })),
    floater: (id) => floaters.find((f) => f.id === id) ?? null,
    removeFloater(id) { const i = floaters.findIndex((f) => f.id === id); if (i >= 0) floaters.splice(i, 1); return i >= 0; },
    clear() { balls = []; floaters = []; },
    get clock() { return clock; },
    get inFlight() { return balls.length; },
  };
}

export function boxGap(box, p) {
  const l = toBoxLocal(box, p);
  return Math.hypot(Math.max(0, Math.abs(l[0]) - box.h[0]), Math.max(0, Math.abs(l[1]) - box.h[1]), Math.max(0, Math.abs(l[2]) - box.h[2]));
}
const segmentPointGap = (a, b, p, upTo = 1) => {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const u = dd > 0 ? Math.max(0, Math.min(Math.max(0, Math.min(1, upTo)), (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / dd)) : 0;
  return Math.hypot(w[0] - d[0] * u, w[1] - d[1] * u, w[2] - d[2] * u);
};
export function segmentNearBox(a, b, box, upTo = 1) {
  const at = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  let lo = 0, hi = Math.max(0, Math.min(1, upTo));
  // The gap to a convex box is convex along a line, so a ternary search finds its least.
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (boxGap(box, at(m1)) <= boxGap(box, at(m2))) hi = m2; else lo = m1;
  }
  const u = (lo + hi) / 2, point = at(u);
  return { u, gap: boxGap(box, point), point };
}
export function insideGrown(box, p, r) {
  const l = toBoxLocal(box, p);
  return Math.abs(l[0]) <= box.h[0] + r && Math.abs(l[1]) <= box.h[1] + r && Math.abs(l[2]) <= box.h[2] + r;
}
