// Prints the span solver's report for one hall, or sweeps every course with the real player motor and exits 1 when
// a course is not crossed. Run: node tools/egSpanSolve.mjs <seed> <hall> [geo] [--law9 [--band <0-3>]]
// Sweep: node tools/egSpanSolve.mjs --sweep [--law9] [--band n] [--seeds n] [--from n] [--golden] [--part p/k]
import { egCircleSpecs, egFirstHallOf } from '../src/net/eliteGates/egLaw.js';
import { egHallOf, egSpecForget } from '../src/net/eliteGates/egLaw.js';
import { egSpanPairs, egPairWindows, egSpanProof, egRoadCross, egFastCross, egCrossMin, egCourseOf, egJumpLands, egJumpReach, egPieceAt, egPendHits,
  egSlagLane, egSlagState, egSlagX, egRouteCross, egRouteSolved, egAlongOf, egSpanBuildOf, EG_SPAN_RUN_MPS, EG_BODY_R, EG_CRUMBLE_KINDS, EG_CRUMBLE_DELAY_S, EG_SOLVE_HORIZON_S } from '../src/net/eliteGates/egSpanLaw.js';
import { egRouted, egRouteRoads, egClimbPitches, egPitchWallS, EG_ROUTE_COURSE_RISE_M } from '../src/net/eliteGates/egRouteProof.js';
import { egRouteLen } from '../src/net/eliteGates/egRoute.js';
import { egSynth9Give } from './lib/egLaw9Synth.mjs';
import { egCircleColliderTris } from '../src/world/eliteGates/egHall.js';
import { createEgSpan, egStepKey, EG_FLOOR_KEY, EG_GUST_REACH_M } from '../src/systems/eliteGates/egSpan.js';
import { egGustSections } from '../src/world/eliteGates/egLook.js';
import { PlayerMotor, walkSpeed } from '../src/player/motor.js';
import { Collider } from '../src/player/collider.js';
import { realmToDungeon, dungeonToRealm } from '../src/net/sdBrain.js';
import { gustAt } from '../src/world/sdSteps.js';
import { identity } from '../src/world/mat4.js';
import { egPolyIn } from '../src/net/eliteGates/egShape.js';
import { isMain } from './lib/isMain.mjs';
import { loadEgHeroFragMeshes } from '../src/world/eliteGates/egHeroFragModel.js';
import { madeLevelRule } from '../src/characters/madeLevel.js';

await loadEgHeroFragMeshes();

export const SWEEP_BUILD = Object.freeze({ speed: 10, running: 0, swimming: 30 });
const SKILL0 = Object.freeze({ climbing: 0, jumping: 0, khajiit: false, enhanced: false, fatigue: 1, load: 0 });
const CLIMB0 = Object.freeze({ ...SKILL0, fatigue: 0 });
export const SWEEP_GOLDEN = Object.freeze([77, 0xbeef, 3, 12345]);
const DT = 1 / 60;
const HOLD_S = 0.06;
// The jump is pressed at the edge itself, since the motor is still on the edge during the frame it crosses it.
// A jump pressed earlier falls short of the widest gaps.
const EDGE_M = 0;
const RUNUP_M = 0.45;
const SIDE_M = 0.55;
const COURSE_MAX_S = 240;
const ROUTE_MAX_S = 480;
const WINDOW_LOOK_S = 1.5;
const REPLAN_MAX = 4;
const LATE_S = 0.2;
const STILL = new Set(['still', 'ledge', 'drop', 'gust', 'vent', 'bone', 'crumble']);
const TIMED = new Set(['beat', 'moon', 'slag', 'crumble', 'bone', 'sink']);
// A landing on a piece that moves away from the body gets no corner catch, so its reach is one body radius short.
const UNCAUGHT = Object.freeze({ ...egSpanBuildOf(0), reach: (/** @type {number} */ h) => { const r = egJumpReach(h); return { reach: r.reach - EG_BODY_R, air: r.air }; } });
const still = (o = {}) => ({ forward: 0, strafe: 0, run: false, jump: false, up: false, down: false, ...o });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const onGround = (key) => key === EG_FLOOR_KEY || /^eg:(wall|tube|isle):/.test(key ?? '');

export function sweepCircleOf(seed, band) {
  const c = 1 + 5 * band + (seed % 5);
  return { c, geo: c <= 1 ? 0 : seed % 9 };
}

export function sweepPath(spec, road) {
  const launch = (p) => (p.a ? p.a.z + p.a.d / 2 : p.edge), roadOf = (p) => (p.b ?? p.a)?.road ?? 0;
  const fork = road === 1 && !!spec.fork;
  const path = egSpanPairs(spec).filter((p) => (fork ? roadOf(p) === 1 || (roadOf(p) === 0 && launch(p) < spec.fork.z - 0.01) : roadOf(p) === road));
  const out = [];
  for (const p of path) {
    const l = out[out.length - 1];
    if (l && !l.b && l.a && !p.a && p.b && Math.abs(p.edge - l.edge) < 0.01 && roadOf(l) === roadOf(p)) out[out.length - 1] = { a: l.a, b: p.b, edge: p.edge };
    else out.push(p);
  }
  return out;
}

/** @param {number} seed @param {number} c @param {number} geo */
export function sweepStand(seed, c, geo) {
  const col = new Collider(() => -Infinity);
  const tris = egCircleColliderTris(seed, c, geo), n = tris.length / 3, idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  col.addMesh(EG_FLOOR_KEY, tris, idx, identity());
  const specs = egCircleSpecs(seed, c, geo), faces = sweepClimbTris(col, specs);
  if (faces.length) { const k = faces.length / 3, fi = k > 65535 ? new Uint32Array(k) : new Uint16Array(k); for (let i = 0; i < k; i++) fi[i] = i; col.addMesh(SWEEP_CLIMB_KEY, faces, fi, identity()); }
  const span = createEgSpan({ seed, c, geo });
  span.stand({ dynamicDraws: [], collider: col });
  return { seed, c, geo, col, span, specs };
}
export const SWEEP_CLIMB_KEY = 'eg:climbface';
/** @param {any} col @param {any[]} specs */
export function sweepClimbTris(col, specs) {
  const out = [];
  for (const spec of specs) for (const c of spec.climbs ?? []) {
    const nx = c.face[0], nz = c.face[1], d = c.d ?? 1.2, P = (x, y, z) => realmToDungeon(spec.x0 + x, y, z), ys = [c.y0];
    for (const H of egClimbPitches(c)) ys.push(ys[ys.length - 1] + H);
    for (let k = 0; k + 1 < ys.length; k++) {
      const ax = c.x0 - nx * d * k, az = c.z0 - nz * d * k, bx = c.x1 - nx * d * k, bz = c.z1 - nz * d * k, y0 = ys[k], y1 = ys[k + 1];
      if (col.raycastHit(P((ax + bx) / 2 + nx, (y0 + y1) / 2, (az + bz) / 2 + nz), [-nx, 0, -nz], 1.5).dist < 1.5) continue;
      const a = P(ax, y0, az), b = P(bx, y0, bz), e = P(bx, y1, bz), f = P(ax, y1, az);
      out.push(...a, ...b, ...e, ...a, ...e, ...f);
    }
  }
  return new Float32Array(out);
}

/** @param {ReturnType<typeof sweepStand>} S @param {any} spec @param {number} road @param {number} t0 */
function pilotOf(S, spec, road, t0, trace = null) {
  const { col, span } = S, h = spec.h, X0 = spec.x0;
  let skills = SKILL0;
  // The game forces enhanced climbing online and refuses the running leap at the Spire's made level; the pilot
  // does the same.
  const parkour = { enabled: () => true, leap: () => madeLevelRule('spire', 'runLeap') !== 'refused', inputs: () => skills, tally: () => {}, say: () => {}, hold: null };
  const m = new PlayerMotor(col, SWEEP_BUILD, { parkour });
  const fail = (step, why) => ({ ok: false, seed: S.seed, h, road, step, why, t: t - t0 });
  let t = t0;
  const at = realmToDungeon(X0 + spec.arrive.x, spec.arrive.y ?? 0, spec.arrive.z);
  m.spawn(at[0], at[1] + 0.05, at[2]);
  span.setSafe(null);
  let turn = 0;
  const me = () => { const p = dungeonToRealm(m.pos[0], m.pos[1], m.pos[2]), x = p[0] - X0; if (!turn) return { x, y: p[1], z: p[2] }; const [a, b] = egAlongOf(turn, x, p[2]); return { x: a, y: p[1], z: b }; };
  let wayYs = /** @type {number[]|null} */ (null);
  const storey = (y) => wayYs != null && ((y ?? 0) < wayYs[0] || (y ?? 0) > wayYs[1]);
  const frame = (input, yaw = 0) => {
    // The game moves the span pieces before the motor in each frame.
    const back = span.ride(t, DT, m, true);
    if (back) return 'fell';
    m.update(DT, input, yaw + (turn * Math.PI) / 2, 0);
    t += DT;
    trace?.(t, me(), m.grounded, m.groundKey, input);
    return null;
  };
  const walkTo = (gx, gz, rel = null, until = Infinity) => {
    let best = Infinity, since = t;
    const y0 = me().y;
    for (let k = 0; k < 60 * 60; k++) {
      const o = rel ? egPieceAt(rel, t) : null;
      const tx = gx + (o ? o.dx : 0), tz = gz + (o ? o.dz : 0), p = me(), dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.08 || t >= until) return null;
      if (d < best - 0.02) { best = d; since = t; }
      if (t - since > 2) return 'stuck';
      const yaw = Math.atan2(dx, dz);
      if (frame(still({ forward: 1, run: d > 0.3 }), yaw)) return 'fell';
      if (!m.grounded && me().y < y0 - 2.5) return 'fell';
    }
    return 'stuck';
  };
  const groundAt = (x) => {
    const iv = [];
    for (const d of spec.discs) { const dx = Math.abs(x - d.x); if (dx <= d.r - 0.4 && !storey(d.y)) { const hh = Math.sqrt(d.r * d.r - dx * dx); iv.push([d.z - hh, d.z + hh]); } }
    for (const q of spec.bands) if (Math.abs(x - q.x) <= q.halfW - 0.4 && !storey(q.y)) iv.push([q.z0, q.z1]);
    for (const l of spec.lanes) if (Math.abs(l.ax - l.bx) < 0.01 && Math.abs(x - l.ax) <= l.hw - 0.4 && !storey(l.y)) iv.push([Math.min(l.az, l.bz), Math.max(l.az, l.bz)]);
    for (const q of spec.heroes ?? []) for (const g of q.floors) {
      if (storey(g.y)) continue;
      const zs = g.poly.map((p) => p[1]), z1 = Math.max(...zs), on = (z) => egPolyIn(g.poly, x, z) && egPolyIn(g.poly, x - 0.4, z) && egPolyIn(g.poly, x + 0.4, z);
      let a = null;
      for (let k = 0, z = Math.min(...zs); z <= z1 + 1e-9; z = Math.min(...zs) + ++k * 0.1) { if (on(z)) a ??= z; else if (a != null) { iv.push([a, z - 0.1]); a = null; } }
      if (a != null) iv.push([a, z1]);
    }
    iv.sort((u, v) => u[0] - v[0]);
    const out = [];
    for (const q of iv) { const l = out[out.length - 1]; if (l && q[0] <= l[1] + 0.05) l[1] = Math.max(l[1], q[1]); else out.push([...q]); }
    return out;
  };
  const crossGround = (gx, gz) => {
    const iv = groundAt(gx);
    for (let n = 0; n < 32; n++) {
      const p = me(), here = iv.find((q) => p.z >= q[0] - 0.6 && p.z <= q[1] + 0.6);
      if (!here || gz <= here[1] - 0.3) return walkTo(gx, Math.min(gz, here ? here[1] - 0.5 : gz));
      const next = iv.find((q) => q[0] > here[1]);
      if (!next) return walkTo(gx, gz);
      if (next[0] - here[1] > 3.6) return `a gap of ${(next[0] - here[1]).toFixed(2)} m in the ground`;
      const err = walkTo(gx, here[1] - EDGE_M - RUNUP_M);
      if (err) return err;
      let jumped = false, landed = false;
      for (let k = 0; k < 4 * 60 && !landed; k++) {
        const go = !jumped && me().z >= here[1] - EDGE_M;
        if (frame(still({ forward: jumped ? 0 : 1, run: true, jump: go, up: go }), 0)) return 'fell';
        if (go) jumped = true;
        if (!m.grounded && me().y < p.y - 4.6) return 'fell over a gap in the ground';
        landed = jumped && m.grounded && !m.jumping && me().z > here[1];
      }
      if (!landed) return 'never landed over a gap in the ground';
    }
    return walkTo(gx, gz);
  };
  const gz = egGustSections([spec]);
  const gusty = (r, z, a, b, x = null) => { if (!gz.some((g) => g.road === r && z >= g.z0 && z <= g.z1 && (x == null || Math.abs(x - g.x) <= EG_GUST_REACH_M))) return false; for (let u = a; u <= b; u += 0.05) if (gustAt(u).push) return true; return false; };

  let pairs = /** @type {any[]} */ ([]), standSince = t, standLane = -1;
  const airOf = (p) => { const ya = p.a ? p.a.y : p.b ? p.b.y : 0; return egJumpReach((p.b ? p.b.y : ya) - ya).air; };
  const pieceAt = (q, u, lane = -1) => (q.kind === 'slag' && lane >= 0 ? { dx: egSlagX(q, lane) - q.x, dz: 0, solid: egSlagState(q, lane, u).st === 'crust' } : egPieceAt(q, u));
  const lzOf = (p, u, lane = -1) => (p.a ? p.a.z + pieceAt(p.a, u, lane).dz + p.a.d / 2 : p.edge);
  const recedes = (p, u) => { if (!p.b) return false; const T = u + airOf(p); return egPieceAt(p.b, T + 0.02).dz > egPieceAt(p.b, T).dz + 1e-6; };
  const lands = (p, u) => egJumpLands(p, u - HOLD_S) && egJumpLands(p, u) && egJumpLands(p, u + HOLD_S) && (!recedes(p, u) || egJumpLands(p, u, UNCAUGHT));
  const goneAt = (q, since, lane = -1) => {
    if (!q || !TIMED.has(q.kind)) return Infinity;
    if (EG_CRUMBLE_KINDS.includes(q.kind)) return since + EG_CRUMBLE_DELAY_S - 0.06;
    if (q.kind === 'sink') return since + 5;
    for (let u = since; u < since + EG_SOLVE_HORIZON_S; u += 0.02) if (!pieceAt(q, u, lane).solid) return u;
    return Infinity;
  };
  const aimOf = (pi, u, lane = -1) => {
    const p = pairs[pi], { a, b } = p, ay = p.a ? p.a.y : me().y, by = p.b ? p.b.y : ay, lz = lzOf(p, u, lane);
    const offs = [];
    if (b && by - ay < -0.3 && STILL.has(b.kind) && (!a || STILL.has(a.kind))) {
      const fall = Math.sqrt((2 * (ay - by)) / 20), gap = b.z - b.d / 2 - lz;
      for (const [name, v] of [['run', EG_SPAN_RUN_MPS], ['walk', walkSpeed(SWEEP_BUILD.speed)]]) { const d = v * fall + EDGE_M; if (d >= gap + 0.4 && d <= gap + b.d - 0.5) offs.push([name, fall, v]); }
    }
    const off = offs[0] ?? null, air = off ? off[1] : egJumpReach(by - ay).air, T = u + air;
    const bx = b ? b.x + egPieceAt(b, T).dx : (a ? a.x : 0);
    let xl;
    if (!a) xl = clamp(bx, (b ? b.x : 0) - 1.0, (b ? b.x : 0) + 1.0);
    else { const o = pieceAt(a, u, lane), half = a.kind === 'drop' ? 0.75 : a.w / 2 - 0.3; xl = clamp(bx, a.x + o.dx - half, a.x + o.dx + half); }
    const xt = b ? clamp(xl, bx - b.w / 2 + SIDE_M, bx + b.w / 2 - SIDE_M) : xl;
    const flight = off ? off[2] * air : (EG_SPAN_RUN_MPS + 0.225) * air, yaw = Math.asin(clamp((xt - xl) / Math.max(0.5, flight), -0.85, 0.85));
    return { off: off ? off[0] : null, air, ay, by, lz, xl, xt, yaw, zLand: lz - EDGE_M + flight * Math.cos(yaw) };
  };
  const pendClear = (pi, u, lane = -1) => {
    const b = pairs[pi].b;
    if (b?.kind !== 'pend') return true;
    const A = aimOf(pi, u, lane);
    for (let k = 0; k <= 12; k++) { const f = k / 12; if (egPendHits(b, u + f * A.air, A.xl + (A.xt - A.xl) * f, b.y, A.lz - EDGE_M + (A.zLand - A.lz + EDGE_M) * f)) return false; }
    return true;
  };
  let ahead = new Map();
  const overlap = (p, u, air, lane = -1) => {
    if (!p.a || !p.b) return 0;
    const oa = pieceAt(p.a, u, lane), ob = egPieceAt(p.b, u + air);
    return Math.min(p.a.x + oa.dx + p.a.w / 2, p.b.x + ob.dx + p.b.w / 2) - Math.max(p.a.x + oa.dx - p.a.w / 2, p.b.x + ob.dx - p.b.w / 2);
  };
  const takes = (pi, u, lane = -1) => {
    const p = pairs[pi];
    return lands(p, u) && (turn || !gusty((p.b ?? p.a)?.road ?? 0, lzOf(p, u, lane), u - 0.2, u + airOf(p) + 0.1, (p.b ?? p.a)?.x ?? null)) && pendClear(pi, u - HOLD_S, lane) && pendClear(pi, u, lane) && pendClear(pi, u + HOLD_S, lane);
  };
  const follows = (pi, u, depth = 0) => {
    const p = pairs[pi], nx = pairs[pi + 1];
    if (!(p.b && TIMED.has(p.b.kind) && nx && nx.a === p.b && depth < 8)) return true;
    const land = u + airOf(p), kb = p.b.kind === 'slag' ? egSlagLane(p.b, land) : -1, key = `${pi + 1}:${Math.round(land * 50)}`;
    if (!ahead.has(key)) ahead.set(key, launch(pi + 1, land + p.b.d / EG_SPAN_RUN_MPS + LATE_S, EG_CRUMBLE_KINDS.includes(p.b.kind) || p.b.kind === 'sink' ? land + LATE_S : land, depth + 1, kb) != null);
    return ahead.get(key);
  };
  const launch = (pi, ready, since, depth = 0, lane = -1) => {
    const p = pairs[pi], gone = goneAt(p.a, since, lane), air = airOf(p);
    let best = null, bestOv = -Infinity, first = null;
    for (let u = ready; u <= ready + EG_SOLVE_HORIZON_S && u + 0.05 < gone; u += 0.02) {
      if (first != null && u > first + WINDOW_LOOK_S) break;
      if (!takes(pi, u, lane)) continue;
      if (!follows(pi, u, depth) || !follows(pi, u + HOLD_S, depth)) continue;
      first ??= u;
      const ov = overlap(p, u, air, lane);
      if (ov > bestOv + 0.02) { bestOv = ov; best = u; }
    }
    return best;
  };
  const crossPairs = (list, routed = false) => {
    pairs = list; ahead = new Map(); standSince = t; standLane = -1;
    let again = false, replans = 0;
    for (let pi = 0; pi < pairs.length; pi++) {
      const pair = pairs[pi], { a, b } = pair, at = b ? b.i : a ? `${a.i}>ground` : 'ground';
      if (!again && !routed && road === 1 && spec.fork && (b ?? a)?.road === 1 && (pi === 0 || ((pairs[pi - 1].b ?? pairs[pi - 1].a)?.road ?? 0) === 0)) {
        const err = crossGround(spec.fork.x, spec.fork.z - 3) ?? walkTo(spec.fork.lowX, spec.fork.z - 3);
        if (err) return fail(at, `${err} on the fork's bridge`);
      }
      if (a?.kind === 'riser' && m.groundKey !== egStepKey(h, a.i)) {
        const p = me();
        const err = walkTo(clamp(p.x, a.x - 0.6, a.x + 0.6), a.z - a.d / 2 - 1.4);
        if (err) return fail(a.i, `${err} before the riser`);
        let up = false;
        for (let k = 0; k < 4 * 60 && !up; k++) {
          const go = me().z >= a.z - a.d / 2 - 0.8;
          if (frame(still({ forward: 1, run: true, jump: go, up: go }), 0)) return fail(a.i, 'fell off the riser');
          up = m.grounded && m.groundKey === egStepKey(h, a.i);
        }
        if (!up) return fail(a.i, 'the riser was not run up');
        for (let k = 0; k < 8; k++) if (frame(still())) return fail(a.i, 'fell off the riser');
      }
      if (!a) { const err = turn ? walkTo(b ? b.x : me().x, pair.edge - EDGE_M - RUNUP_M - 0.2) : crossGround(b ? b.x : me().x, pair.edge - EDGE_M - RUNUP_M - 0.2); if (err) return fail(at, `${err} on the way to the launch`); }
      const lane = a?.kind === 'slag' ? standLane : -1, lzAt = (u) => lzOf(pair, u, lane);
      const tau = launch(pi, t + Math.max(0, lzAt(t) - EDGE_M - me().z) / EG_SPAN_RUN_MPS + 0.03, standSince, 0, lane);
      if (tau == null) return fail(at, a && TIMED.has(a.kind) ? `no launch before the ${a.kind} under me goes` : 'no launch the solver allows in its horizon');
      const A = aimOf(pi, tau, lane), { xl, xt, yaw, zLand, off } = A, T = tau + A.air, ob = b ? egPieceAt(b, T) : null;
      const v = off === 'walk' ? walkSpeed(SWEEP_BUILD.speed) : EG_SPAN_RUN_MPS;
      const run = RUNUP_M, lz0 = A.lz, rel = a && a.kind !== 'slag' ? a : null, o0 = rel ? egPieceAt(rel, tau) : null;
      const rx = xl - run * Math.sin(yaw), rz = lz0 - EDGE_M - run * Math.cos(yaw), go0 = tau - run / v;
      const gx = rel ? rx - o0.dx : rx, gz = rel ? rz - o0.dz : rz;
      const err = walkTo(gx, gz, rel, go0);
      if (err) return fail(at, `${err} on the way to the launch`);
      while (t < go0) { const e2 = walkTo(gx, gz, rel, go0); if (e2) return fail(at, `${e2} while waiting`); if (t < go0 && frame(still())) return fail(at, 'fell while waiting'); }
      const onB = () => !!b && m.grounded && (m.groundKey === egStepKey(h, b.i) || !!m.groundKey?.startsWith(`${egStepKey(h, b.i)}:`));
      let jumped = false, across = false, late = false;
      again = false;
      for (let k = 0; k < 90 && !jumped && !across; k++) {
        const p = me(), edge = p.z >= lzAt(t) - EDGE_M;
        if (!off && !edge && t >= tau + 0.03 && !lands(pair, t)) { late = true; break; }
        const go = !off && edge;
        if (frame(still({ forward: 1, run: off !== 'walk', jump: go, up: go }), Math.atan2(xt + (b ? egPieceAt(b, T).dx - ob.dx : 0) - p.x, zLand - p.z))) return fail(at, 'fell before the launch');
        jumped = go || (!!off && !m.grounded);
        across = !jumped && onB();
      }
      if (late) { if (++replans > REPLAN_MAX) return fail(at, 'late to every launch'); again = true; pi--; continue; }
      if (!jumped && !across) return fail(at, off ? 'never ran off the edge' : 'never reached the edge');
      let landed = across;
      for (let k = 0; k < 6 * 60 && !landed; k++) {
        if (frame(still(), yaw)) return fail(at, 'fell (cast back)');
        if (!m.grounded && me().y < Math.min(A.ay, A.by) - 2.5) return fail(at, 'fell short');
        landed = m.grounded && !m.jumping;
      }
      if (!landed) return fail(at, 'never landed');
      const key = m.groundKey, want = b ? egStepKey(h, b.i) : EG_FLOOR_KEY;
      const level = onGround(key) && b && me().y >= b.y - 0.3;
      if (b ? key !== want && !key?.startsWith(`${want}:`) && !level : !onGround(key)) return fail(at, `landed on ${key ?? 'nothing'}, not ${want}`);
      const onStep = () => m.groundKey === want || !!m.groundKey?.startsWith(`${want}:`);
      // A Crumble's clock starts the frame a foot first touches it, so the pilot walks onto it from nearby ground.
      if (level && !onStep() && (EG_CRUMBLE_KINDS.includes(b.kind) || b.kind === 'sink')) {
        for (let k = 0; k < 2 * 60 && !onStep() && me().z < b.z + b.d / 2 - RUNUP_M - 0.1; k++) {
          const p = me();
          if (frame(still({ forward: 1, run: true }), Math.atan2(b.x + egPieceAt(b, t).dx - p.x, b.z - p.z))) return fail(at, 'fell stepping onto the step');
        }
      }
      standSince = t;
      standLane = b?.kind === 'slag' ? Number(/:(\d+)$/.exec(key)?.[1] ?? -1) : -1;
      if (t - t0 > (routed ? ROUTE_MAX_S : COURSE_MAX_S)) return fail(at, 'the course took too long');
    }
    return null;
  };
  const wayTo = (q, g) => {
    const low = Math.min(g.from[1], g.to[1]);
    let best = Infinity, since = t;
    for (let k = 0; k < 60 * 120; k++) {
      const p = me(), dx = q[0] - p.x, dz = q[2] - p.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.3 && m.grounded && Math.abs(p.y - q[1]) < 1.2) return null;
      if (d < best - 0.02) { best = d; since = t; }
      if (t - since > 3) return `stuck ${d.toFixed(2)} m short of (${q.map((v) => v.toFixed(1)).join(', ')})`;
      if (frame(still({ forward: 1, run: d > 0.6 }), Math.atan2(dx, dz))) return 'fell (cast back)';
      if (!m.grounded && me().y < low - 2.5) return 'fell';
    }
    return 'stuck';
  };
  const climbUp = (g) => {
    const c = g.climb;
    if (!c) return 'a climb with no face';
    const err = wayTo(g.from, g);
    if (err) return `${err} on the way to the climb's foot`;
    const yaw = Math.atan2(-c.face[0], -c.face[1]);
    for (let k = 0; k < 60 * 5 && m.grip < 1; k++) if (frame(still(), yaw)) return 'fell at the climb\'s foot';
    skills = CLIMB0;
    const foot = me().y;
    let high = foot, up = false, why = '';
    for (let k = 0; k < 60 * 90 && !up && !why; k++) {
      const rest = m.grounded && m.grip < 1 && me().y > foot + 0.3;
      if (frame(still({ forward: rest ? 0 : 1 }), yaw)) why = 'fell off the climb (cast back)';
      const p = me();
      if (m.grounded && p.y < high - 1) why = `fell off the climb ${(high - foot).toFixed(2)} m up (its grip ${m.grip.toFixed(2)})`;
      high = Math.max(high, p.y);
      up = m.grounded && p.y >= c.y1 - 0.1;
    }
    skills = SKILL0;
    if (why) return why;
    if (!up) return `never stood on the climb's lip (${(high - foot).toFixed(2)} m up)`;
    return wayTo(g.to, g);
  };
  const wayOf = (g) => { wayYs = g ? [Math.min(g.from[1], g.to[1]) - EG_ROUTE_COURSE_RISE_M, Math.max(g.from[1], g.to[1]) + EG_ROUTE_COURSE_RISE_M] : null; };
  return { m, me, frame, walkTo, crossGround, crossPairs, wayTo, climbUp, wayOf, fail, get t() { return t; }, turnTo: (/** @type {number} */ hd) => { turn = hd; },
    done: () => ({ ok: true, seed: S.seed, h, road, step: null, why: '', t: t - t0 }) };
}

/** @param {ReturnType<typeof sweepStand>} S @param {any} spec @param {number} road @param {number} t0 */
export function sweepCourse(S, spec, road, t0, trace = null) {
  if (egRouted(spec)) return sweepRoute(S, spec, road, t0, trace);
  const P = pilotOf(S, spec, road, t0, trace), { m, walkTo, crossGround, fail } = P;
  for (let k = 0; k < 20; k++) if (P.frame(still())) return fail('ground', 'fell from the arrival plate');
  const crossed = P.crossPairs(sweepPath(spec, road));
  if (crossed) return crossed;
  if (spec.end) {
    const lane = road === 1 && spec.fork ? spec.lanes.find((l) => l.role === 'bridge' && Math.abs(l.ax - spec.fork.lowX) < 0.01 && Math.abs(l.bz - spec.fork.plate) < 0.01) : null;
    if (lane) { const err = walkTo(lane.ax, lane.az + 1); if (err) return fail('ground', `${err} onto the Low Road's bridge`); const e2 = walkTo(lane.ax + 0.9 * (lane.bx - lane.ax), lane.az + 0.9 * (lane.bz - lane.az)); if (e2) return fail('ground', `${e2} on the Low Road's bridge`); }
    const err = lane ? walkTo(spec.end.x, spec.end.z - 1.5) : crossGround(spec.end.x, spec.end.z - 1.5);
    if (err) return fail('ground', `${err} on the way to the end plate`);
    if (m.groundKey !== EG_FLOOR_KEY) return fail('ground', 'not standing on the end plate');
  }
  return P.done();
}

/** @param {ReturnType<typeof sweepStand>} S @param {any} spec @param {number} road @param {number} t0 */
export function sweepRoute(S, spec, road, t0, trace = null) {
  const P = pilotOf(S, spec, road, t0, trace), { fail } = P;
  for (let k = 0; k < 20; k++) if (P.frame(still())) return fail('ground', 'fell from the arrival plate');
  for (const L of egRouteSolved(spec, road)) {
    const g = L.g;
    let why = null;
    if (g.kind === 'climb') why = P.climbUp(g);
    else if (L.pairs.length) {
      P.wayOf(g);
      P.turnTo(L.g.steps[0]?.hd ?? 0);
      const crossed = P.crossPairs(L.pairs, true);
      P.turnTo(0);
      P.wayOf(null);
      if (crossed) return crossed;
      why = P.wayTo(g.to, g);
    } else why = P.wayTo(g.to, g);
    if (why) return fail(`link ${g.i} (${g.kind})`, why);
    if (P.t - t0 > ROUTE_MAX_S) return fail(`link ${g.i} (${g.kind})`, 'the way took too long');
  }
  const e = spec.end, p = P.me();
  if (e && (P.m.groundKey !== EG_FLOOR_KEY || Math.hypot(p.x - e.x, p.z - e.z) > e.r || Math.abs(p.y - (e.y ?? 0)) > 1)) return fail('ground', 'not standing on the end plate');
  return P.done();
}

export function sweepSeed(seed, band) {
  const { c, geo } = sweepCircleOf(seed, band), S = sweepStand(seed, c, geo), out = [];
  let k = 0;
  for (const spec of S.specs) for (const road of [0, 1]) {
    if (egRouted(spec)) { if (!egRouteRoads(spec).includes(road)) continue; } else {
      const course = egCourseOf(spec, road);
      if (!course || !course.steps.length) continue;
    }
    const t0 = 1_800_000_000 + (seed % 36) + 0.37 + 200 * k++;
    out.push({ c, geo, t0, ...sweepCourse(S, spec, road, t0) });
  }
  S.span.clear();
  return out;
}

export function sweepSynth9(seed, band) {
  const { c, geo } = sweepCircleOf(seed, band);
  egSynth9Give(seed, c, geo, band);
  try { return sweepSeed(seed, band); } finally { egSpecForget(); }
}

export const sweepSeeds = (n, from = 1, golden = false) => [...new Set([...Array.from({ length: n }, (_, i) => from + i), ...(golden ? SWEEP_GOLDEN : [])])];

export function sweepPartOf(s) {
  const m = /^(\d+)\/(\d+)$/.exec(String(s ?? ''));
  if (!m) return null;
  const p = Number(m[1]), k = Number(m[2]);
  return k >= 1 && p >= 1 && p <= k ? { p, k } : null;
}
// Every k-th seed from the p-th, so k parallel jobs sweep each seed exactly once.
export const sweepPart = (seeds, p, k) => seeds.filter((_, i) => i % k === p - 1);

export function solveReport(seed, hall, geo = 0) {
  const spec = egHallOf(seed, hall, geo), lines = [];
  lines.push(`seed ${seed} hall ${hall} (${spec.kind}${spec.variant ? ` ${spec.variant}` : ''}, band ${spec.band}, circle ${spec.c}, ground ${geo}) - ${spec.steps.length} steps, laid again ${spec.laid} time(s)`);
  const proof = egSpanProof(spec);
  lines.push(`  proof: ${proof.ok ? 'proven' : `REFUSED - ${proof.why.join('; ')}`}`);
  if (egRouted(spec)) return [...lines, ...routeReport(spec)];
  for (const road of [0, 1]) {
    const course = egCourseOf(spec, road);
    if (!course) continue;
    lines.push(`  road ${road}: ${course.steps.length} steps, ${course.checkpoints.length} checkpoints, end at ${course.end.toFixed(2)} m`);
    for (const pair of sweepPath(spec, road)) {
      const w = egPairWindows(pair), name = `${pair.a ? `${pair.a.i} ${pair.a.kind}` : 'ground'} > ${pair.b ? `${pair.b.i} ${pair.b.kind}` : 'ground'}`;
      lines.push(`    ${name.padEnd(28)} open ${w.open.toFixed(2)} s of ${EG_SOLVE_HORIZON_S}, least in 12 s ${w.worst12.toFixed(2)}, longest wait ${w.wait.toFixed(2)}`);
    }
    const c = egRoadCross(spec, road);
    lines.push(`    the span build: fastest ${c.fast.toFixed(2)} s, median ${c.median.toFixed(2)} s`);
    if (spec.end) lines.push(`    the fast build: ${egFastCross(spec, road).toFixed(2)} s - EG_CROSS_MIN ${egCrossMin(spec, road)} ms`);
  }
  return lines;
}

export function routeReport(spec) {
  const lines = [];
  for (const road of egRouteRoads(spec)) {
    lines.push(`  road ${road} along the route: ${egRouteLen(spec, road).toFixed(1)} m, plate to door`);
    for (const L of egRouteSolved(spec, road)) {
      const g = L.g, at = `    link ${String(g.i).padStart(2)} ${g.kind.padEnd(6)} ${g.len.toFixed(1).padStart(5)} m, ${g.rise >= 0 ? '+' : ''}${g.rise.toFixed(1)} m: ${L.span.toFixed(2)} s`;
      if (g.kind === 'climb') lines.push(`${at} - pitches ${(g.climb ? egClimbPitches(g.climb) : []).map((H) => `${H.toFixed(2)} m (${egPitchWallS(H).toFixed(2)} s on the wall)`).join(', ') || 'none: no face'}`);
      else lines.push(L.pairs.length ? `${at} + its ${L.pairs.length} pairs' waits` : at);
      for (const pair of L.pairs) {
        const w = egPairWindows(pair), name = `${pair.a ? `${pair.a.i} ${pair.a.kind}` : 'ground'} > ${pair.b ? `${pair.b.i} ${pair.b.kind}` : 'ground'}`;
        lines.push(`      ${name.padEnd(26)} open ${w.open.toFixed(2)} s of ${EG_SOLVE_HORIZON_S}, least in 12 s ${w.worst12.toFixed(2)}, longest wait ${w.wait.toFixed(2)}`);
      }
    }
    const c = egRouteCross(spec, road);
    lines.push(`    the span build: fastest ${c.fast.toFixed(2)} s, median ${c.median.toFixed(2)} s (${(c.median / c.fast).toFixed(2)} x)`);
    if (spec.end) lines.push(`    the fast build: ${egFastCross(spec, road).toFixed(2)} s - EG_CROSS_MIN ${egCrossMin(spec, road)} ms`);
  }
  return lines;
}

export function runSweep(bands, seeds, sweep = sweepSeed, log = console.log) {
  let bad = 0, n = 0;
  for (const band of bands) {
    const t0 = performance.now();
    let courses = 0;
    for (const seed of seeds) {
      for (const r of sweep(seed, band)) {
        courses++; n++;
        if (!r.ok) { bad++; log(`FAIL seed ${r.seed} hall ${r.h} road ${r.road} step ${r.step} (circle ${r.c}, ground ${r.geo}, from ${r.t0}): ${r.why}`); }
      }
    }
    log(`band ${band}: ${seeds.length} seeds, ${courses} courses crossed by the real motor in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  log(bad ? `${bad} of ${n} courses NOT crossed` : `every one of ${n} courses crossed`);
  return { bad, n };
}

export function main(argv, log = console.log, sweep = sweepSeed) {
  const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const law9 = argv.includes('--law9');
  if (!argv.includes('--sweep')) {
    const [seed, hall, geo] = argv.filter((x, i) => !x.startsWith('--') && argv[i - 1] !== '--band').map(Number);
    if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(hall) || hall < 1) { log('usage: node tools/egSpanSolve.mjs <seed> <hall> [geo] [--law9 [--band 0-3]] | --sweep [--band 0-3] [--seeds n] [--from seed] [--golden] [--part p/k] [--law9]'); return 2; }
    if (law9) egSynth9Give(seed, Math.ceil(hall / 5), geo || 0, Number(arg('--band', 0)));
    try { for (const l of solveReport(seed, hall, geo || 0)) log(l); } finally { if (law9) egSpecForget(); }
    return 0;
  }
  const bands = argv.includes('--band') ? [Number(arg('--band'))] : [0, 1, 2, 3];
  if (!bands.every((b) => [0, 1, 2, 3].includes(b))) { log('--band is 0, 1, 2 or 3'); return 2; }
  const part = argv.includes('--part') ? sweepPartOf(arg('--part')) : { p: 1, k: 1 };
  if (!part) { log('--part is p/k, 1 <= p <= k'); return 2; }
  const all = sweepSeeds(Number(arg('--seeds', 25)), Number(arg('--from', 1)), argv.includes('--golden'));
  const seeds = sweepPart(all, part.p, part.k);
  if (part.k > 1) log(`part ${part.p}/${part.k}: ${seeds.length} of the ${all.length} seeds`);
  const { bad } = runSweep(bands, seeds, law9 && sweep === sweepSeed ? sweepSynth9 : sweep, log);
  return bad ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
