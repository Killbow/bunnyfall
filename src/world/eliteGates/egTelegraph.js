// @ts-check
import { telegraphBounds, telegraphField, telegraphStrip, TELEGRAPH_KIND, TELEGRAPH_NOW_MS } from '../../render/gateTelegraph.js';
import { egInShape, segDist, egPieceIn } from '../../net/eliteGates/egShape.js';
import { egHazardParts, EG_HAZARDS } from '../../net/eliteGates/egFragLaw.js';
import { egFightFloorAt } from '../../net/eliteGates/egFair.js';
import { egOneStorey } from '../../net/eliteGates/egWalkGraph.js';
import { EG_FL } from '../../net/eliteGates/egBodies.js';
import { EG_ECLIPSE_NM } from '../../net/eliteGates/egLords.js';
import { EG_VESTIGES } from '../../net/eliteGates/egVestige.js';
import { gateHitFlash } from '../gateBoss.js';
import { EG_BAND_RAMPS } from './egBandArt.js';
import { SD_ISLAND_SIDES } from '../sdRealm.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const EG_FLOOR_DRAWS_MAX = 32;
export const EG_FLOOR_CAP_SIDES = 12;
// `EG_FLOOR_NEAR_M` matches the pad that net/eliteGates/egLaw.js `egStampFloors` uses on the relay; keep them
// equal.
export const EG_FLOOR_NEAR_M = 1;
const holds = (f, x, z, pad = 0) => (f.t === 'p' ? egPieceIn(f, x, z, pad) : f.t === 'd' ? Math.hypot(x - f.x, z - f.z) <= f.r + pad : segDist(x, z, f.ax, f.az, f.bx, f.bz) <= f.hw + pad);
function earCut(poly, tri) {
  const v = poly.map((p) => [p[0], p[1]]);
  const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => turn(a, b, p) >= 0 && turn(b, c, p) >= 0 && turn(c, a, p) >= 0;
  for (let guard = 0; v.length > 3 && guard < 4096; guard++) {
    let cut = false;
    for (let i = 0; i < v.length; i++) {
      const a = v[(i + v.length - 1) % v.length], b = v[i], c = v[(i + 1) % v.length];
      if (turn(a, b, c) <= 0 || v.some((p) => p !== a && p !== b && p !== c && inTri(p, a, b, c))) continue;
      tri(a[0], a[1], b[0], b[1], c[0], c[1]); v.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (v.length === 3) tri(v[0][0], v[0][1], v[1][0], v[1][1], v[2][0], v[2][1]);
}

export function egFightFloors(spec) {
  const out = [];
  for (const f of spec?.fl ?? []) {
    const v = [];
    const tri = (ax, az, bx, bz, cx, cz) => v.push(ax, az, bx, bz, cx, cz);
    const fan = (x, z, r, a0, a1, n) => { for (let k = 0; k < n; k++) { const p = a0 + ((a1 - a0) * k) / n, q = a0 + ((a1 - a0) * (k + 1)) / n; tri(x, z, x + Math.sin(p) * r, z + Math.cos(p) * r, x + Math.sin(q) * r, z + Math.cos(q) * r); } };
    if (f.t === 'p') {
      earCut(f.poly, tri);
      const xs = f.poly.map((p) => p[0]), zs = f.poly.map((p) => p[1]), box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
      const cx = (box[0] + box[2]) / 2, cz = (box[1] + box[3]) / 2, R = Math.max(...f.poly.map((p) => Math.hypot(p[0] - cx, p[1] - cz)));
      out.push({ y: f.y ?? 0, tris: new Float32Array(v), box, cx, cz, R, piece: f, over: Object.freeze({ r: R, courts: Object.freeze([Object.freeze([cx, cz])]) }) });
      continue;
    }
    if (f.t === 'd') {
      fan(f.x, f.z, f.r, 0, Math.PI * 2, SD_ISLAND_SIDES);
      out.push({ y: f.y ?? 0, tris: new Float32Array(v), box: [f.x - f.r, f.z - f.r, f.x + f.r, f.z + f.r], cx: f.x, cz: f.z, R: f.r, piece: f, over: Object.freeze({ r: f.r, courts: Object.freeze([Object.freeze([f.x, f.z])]) }) });
      continue;
    }
    const dx = f.bx - f.ax, dz = f.bz - f.az, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, nx = -uz * f.hw, nz = ux * f.hw;
    tri(f.ax + nx, f.az + nz, f.bx + nx, f.bz + nz, f.bx - nx, f.bz - nz);
    tri(f.ax + nx, f.az + nz, f.bx - nx, f.bz - nz, f.ax - nx, f.az - nz);
    const head = Math.atan2(ux, uz);
    fan(f.bx, f.bz, f.hw, head - Math.PI / 2, head + Math.PI / 2, EG_FLOOR_CAP_SIDES);
    fan(f.ax, f.az, f.hw, head + Math.PI / 2, head + (Math.PI * 3) / 2, EG_FLOOR_CAP_SIDES);
    const cx = (f.ax + f.bx) / 2, cz = (f.az + f.bz) / 2, R = L / 2 + f.hw;
    out.push({ y: f.y ?? 0, tris: new Float32Array(v), box: [Math.min(f.ax, f.bx) - f.hw, Math.min(f.az, f.bz) - f.hw, Math.max(f.ax, f.bx) + f.hw, Math.max(f.az, f.bz) + f.hw],
      cx, cz, R, piece: f, over: Object.freeze({ r: R, courts: Object.freeze([Object.freeze([cx, cz])]) }) });
  }
  return out;
}

const _pa = [], _pb = [];
const _planes = new Float64Array(12);
function cutPoly(src, n, dst, ax, box, bi, sign) {
  const at = box[bi];
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = src[i * 2 + ax], b = src[j * 2 + ax], ina = sign * (a - at) >= 0, inb = sign * (b - at) >= 0;
    if (ina) { dst[m * 2] = src[i * 2]; dst[m * 2 + 1] = src[i * 2 + 1]; m++; }
    if (ina !== inb) {
      const k = (at - a) / (b - a);
      dst[m * 2] = src[i * 2] + (src[j * 2] - src[i * 2]) * k; dst[m * 2 + 1] = src[i * 2 + 1] + (src[j * 2 + 1] - src[i * 2 + 1]) * k;
      dst[m * 2 + ax] = at; m++;
    }
  }
  return m;
}
function cutLine(src, n, dst, p) {
  const nx = _planes[p * 3], nz = _planes[p * 3 + 1], c = _planes[p * 3 + 2];
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, da = nx * src[i * 2] + nz * src[i * 2 + 1] - c, db = nx * src[j * 2] + nz * src[j * 2 + 1] - c;
    if (da >= 0) { dst[m * 2] = src[i * 2]; dst[m * 2 + 1] = src[i * 2 + 1]; m++; }
    if ((da >= 0) !== (db >= 0)) {
      const k = da / (da - db);
      dst[m * 2] = src[i * 2] + (src[j * 2] - src[i * 2]) * k; dst[m * 2 + 1] = src[i * 2 + 1] + (src[j * 2 + 1] - src[i * 2 + 1]) * k; m++;
    }
  }
  return m;
}
function inStrip(tris, t) {
  const x = tris[t], z = tris[t + 1];
  for (let p = 0; p < 12; p += 3) if (_planes[p] * x + _planes[p + 1] * z - _planes[p + 2] < 0) return false;
  return true;
}
/**
 * `out` needs room for up to five output triangles per input triangle.
 * @param {Float32Array|number[]} tris
 * @param {number[]|null} box
 * @param {Float32Array} out
 * @param {number} at
 * @param {{ a: number[], u: number[], len: number, w: number }|null} [strip]
 */
export function egClipTris(tris, box, out, at, strip = null) {
  let w = at;
  if (strip) {
    // The across axis is `(u.y, -u.x)`, the same frame as `TELEGRAPH_VS` in render/gateTelegraph.js; change both
    // together.
    const ux = strip.u[0], uz = strip.u[1], ua = ux * strip.a[0] + uz * strip.a[1], va = uz * strip.a[0] - ux * strip.a[1];
    _planes[0] = ux; _planes[1] = uz; _planes[2] = ua;
    _planes[3] = -ux; _planes[4] = -uz; _planes[5] = -(ua + strip.len);
    _planes[6] = uz; _planes[7] = -ux; _planes[8] = va - strip.w;
    _planes[9] = -uz; _planes[10] = ux; _planes[11] = -(va + strip.w);
  }
  for (let t = 0; t + 5 < tris.length; t += 6) {
    if (!box) { for (let k = 0; k < 6; k++) out[w++] = tris[t + k]; continue; }
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 6; k += 2) { x0 = Math.min(x0, tris[t + k]); x1 = Math.max(x1, tris[t + k]); z0 = Math.min(z0, tris[t + k + 1]); z1 = Math.max(z1, tris[t + k + 1]); }
    if (x1 < box[0] || x0 > box[2] || z1 < box[1] || z0 > box[3]) continue;
    const whole = strip ? inStrip(tris, t) && inStrip(tris, t + 2) && inStrip(tris, t + 4) : x0 >= box[0] && x1 <= box[2] && z0 >= box[1] && z1 <= box[3];
    if (whole) { for (let k = 0; k < 6; k++) out[w++] = tris[t + k]; continue; }
    for (let k = 0; k < 6; k++) _pa[k] = tris[t + k];
    let n;
    if (strip) {
      n = cutLine(_pa, 3, _pb, 0);
      n = cutLine(_pb, n, _pa, 1);
      n = cutLine(_pa, n, _pb, 2);
      n = cutLine(_pb, n, _pa, 3);
    } else {
      n = cutPoly(_pa, 3, _pb, 0, box, 0, 1);
      n = cutPoly(_pb, n, _pa, 0, box, 2, -1);
      n = cutPoly(_pa, n, _pb, 1, box, 1, 1);
      n = cutPoly(_pb, n, _pa, 1, box, 3, -1);
    }
    for (let k = 1; k + 1 < n; k++) { out[w++] = _pa[0]; out[w++] = _pa[1]; out[w++] = _pa[k * 2]; out[w++] = _pa[k * 2 + 1]; out[w++] = _pa[k * 2 + 2]; out[w++] = _pa[k * 2 + 3]; }
  }
  return w;
}

const pinsFloors = (sh) => sh.kind !== TELEGRAPH_KIND.all && sh.kind !== TELEGRAPH_KIND.spokes;
function anchorOn(f, sh) {
  const M = EG_FLOOR_NEAR_M;
  if (sh.kind === TELEGRAPH_KIND.discs) { for (let j = 0; j < sh.points.length; j++) if (holds(f.piece, sh.points[j][0], sh.points[j][1], M)) return true; return false; }
  return holds(f.piece, sh.origin[0], sh.origin[1], M) || (sh.kind === TELEGRAPH_KIND.lane && holds(f.piece, sh.end[0], sh.end[1], M));
}
/**
 * @param {ReturnType<typeof egFightFloors>} floors
 * @param {any} sh
 * @param {number} y
 */
function landsAt(floors, sh, y) {
  const by = Number.isFinite(sh.by) ? sh.by : NaN;
  if (!egOneStorey(y, by)) return false;
  if (!pinsFloors(sh)) return true;
  let any = false;
  for (let k = 0; k < floors.length; k++) { if (!anchorOn(floors[k], sh) || !egOneStorey(floors[k].y, by)) continue; if (floors[k].y === y) return true; any = true; }
  return !any;
}

/** @param {any} hz */
export const egHazardSurface = (hz) => (EG_HAZARDS[hz?.kind]?.aim === 'trav' || hz?.kind === 'slag' ? hz.y ?? 0 : NaN);
function nearOf(sh, feet, out = null) {
  const B = telegraphBounds(sh, out);
  if (!B) return 0;
  return Math.hypot(Math.max(B[0] - feet[0], 0, feet[0] - B[2]), Math.max(B[1] - feet[1], 0, feet[1] - B[3]));
}
/**
 * @param {any[]} shapes
 * @param {ReturnType<typeof egFightFloors>} floors
 * @param {number[]|null} feet
 * @param {Float32Array|null} buf
 * @param {number} [max]
 * @param {ReturnType<typeof egFloorPlanKeep>|null} [keep]
 */
export function egFloorPlan(shapes, floors, feet, buf, max = EG_FLOOR_DRAWS_MAX, keep = null) {
  const K = keep ?? egFloorPlanKeep(), ranked = K.ranked, draws = K.plan.draws;
  ranked.length = 0; draws.length = 0; K.used = 0;
  for (let i = 0; i < shapes.length; i++) {
    const sh = shapes[i], r = (K.ranks[i] ??= { sh: null, i: 0, k0: 0, k1: 0, k2: 0 });
    r.sh = sh; r.i = i; r.k0 = sh.mine || (feet && telegraphField(sh, feet[0], feet[1]).inside) ? 0 : 1; r.k1 = Number.isFinite(sh.order) ? sh.order : Infinity; r.k2 = feet ? nearOf(sh, feet, K.N) : 0;
    ranked.push(r);
  }
  ranked.sort(byRank);
  let out = buf ?? new Float32Array(4096), n = 0;
  for (let q = 0; q < ranked.length; q++) {
    if (draws.length >= max) break;
    const r = ranked[q], sh = r.sh;
    if (!(sh.alpha > 0.001)) continue;
    const B = telegraphBounds(sh, K.B);
    if (Number.isFinite(sh.y) || !floors.length) {
      const d = planDraw(K, sh, null, 0, 0, r.i);
      if (Number.isFinite(sh.y) && B) { d.over = d.own; d.own.r = Math.hypot(B[2] - B[0], B[3] - B[1]) / 2; d.own.courts[0][0] = (B[0] + B[2]) / 2; d.own.courts[0][1] = (B[1] + B[3]) / 2; }
      draws.push(d);
      continue;
    }
    const strip = telegraphStrip(sh, K.strip);
    for (let k = 0; k < floors.length; k++) {
      const f = floors[k];
      if (draws.length >= max) break;
      if (!landsAt(floors, sh, f.y)) continue;
      if (B && (B[2] < f.box[0] || B[0] > f.box[2] || B[3] < f.box[1] || B[1] > f.box[3])) continue;
      if (out.length < n + f.tris.length * 5) { const grown = new Float32Array(Math.max(out.length * 2, n + f.tris.length * 5)); grown.set(out.subarray(0, n)); out = grown; }
      const at = n;
      n = egClipTris(f.tris, B, out, n, strip);
      if (n > at) draws.push(planDraw(K, sh, f, at / 2, (n - at) / 2, r.i));
    }
  }
  draws.sort(mineLast);
  K.plan.buf = out; K.plan.n = n;
  return K.plan;
}
export const egFloorPlanKeep = () => ({ ranks: [], ranked: [], slots: [], used: 0, B: [0, 0, 0, 0], N: [0, 0, 0, 0], strip: { a: [0, 0], u: [0, 0], len: 0, w: 0 }, plan: { draws: [], buf: null, n: 0 } });
const byRank = (a, b) => a.k0 - b.k0 || a.k1 - b.k1 || a.k2 - b.k2 || a.i - b.i;
const mineLast = (a, b) => (a.sh.mine ? 1 : 0) - (b.sh.mine ? 1 : 0) || a.i - b.i;
function planDraw(K, sh, f, first, count, i) {
  const d = (K.slots[K.used++] ??= { sh: null, f: null, first: 0, count: 0, over: null, i: 0, own: { r: 0, courts: [[0, 0]] } });
  d.sh = sh; d.f = f; d.first = first; d.count = count; d.over = null; d.i = i;
  return d;
}

// These values copy the `PERIL_*` constants in worldEvents/gateCourt.js so this module does not load that scene;
// keep them equal.
export const EG_PERIL = Object.freeze({ bearings: 24, step: 0.25, reach: 20, rim: 0.4, nowMs: TELEGRAPH_NOW_MS });
export const EG_CHECK_ORDER = 'Stand in the light!';
export function egOnFloorAt(spec, x, z, y, inset = 0) {
  for (const f of spec?.fl ?? []) if ((f.y ?? 0) === y && holds(f, x, z, -inset)) return true;
  return false;
}
const inStamps = (b, x, z) => b.s.some((s) => s[0] !== 'a' && egInShape(s, x, z));
export function egPerilOf(pending, f, fy, spec, now) {
  if (!f || !spec) return null;
  const fl = egFightFloorAt(spec, f[0], fy, f[1]);
  if (!fl) return null;
  let best = null;
  for (const b of pending ?? []) {
    if (!(now < b.at) || now < b.at - b.wu || !inStamps(b, f[0], f[1]) || !egOneStorey(fl.y ?? 0, Number.isFinite(b.y) ? b.y : NaN)) continue;
    if (!best || b.at < best.at) best = b;
  }
  if (!best) return null;
  const y0 = fl.y ?? 0, P = EG_PERIL, others = (pending ?? []).filter((b) => b !== best && now < b.at);
  let exit = null, clear = null;
  for (let k = 0; k < P.bearings; k++) {
    const a = (k / P.bearings) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    let out = false;
    for (let m = P.step; m <= P.reach + 1e-9; m += P.step) {
      if (clear && m >= clear.m) break;
      const x = f[0] + dx * m, z = f[1] + dz * m;
      if (!egOnFloorAt(spec, x, z, y0, P.rim)) break;
      if (!out && !inStamps(best, x, z)) { out = true; if (!exit || m < exit.m) exit = { dx, dz, m }; }
      if (out && !inStamps(best, x, z) && !others.some((b) => inStamps(b, x, z))) { if (!clear || m < clear.m) clear = { dx, dz, m }; break; }
    }
  }
  const way = clear ?? exit;
  return { name: best.nm || '', t: best.wu > 0 ? clamp01((now - (best.at - best.wu)) / best.wu) : 1, now: best.at - now <= P.nowMs, check: !!best.ch || best.s.some((s) => s[0] === 'h'),
    dir: way ? [way.dx, way.dz] : null, m: way ? way.m : null };
}

export const EG_TETHER = Object.freeze({ slack: 6, taut: 8, half: 0.35, thin: 0.25, past: 0.6, chainHalf: 0.3, snap: 0.85 });
export const egTetherKind = (tx) => (tx?.[2] === 2 ? 'close' : 'pull');
// A drain tether (kind 0) packs reach and break in meters as `r * 100 + brk`; other kinds carry the break in
// centimeters.
export const egTetherBreak = (tx) => (tx?.[2] === 0 ? tx[3] % 100 : (tx?.[3] ?? 0) / 100);
export function egPullLook(a, b, brk) {
  const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz), ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, half = Math.max(d / 2, brk / 2 + EG_TETHER.past);
  return { origin: [mx - ux * half, mz - uz * half], end: [mx + ux * half, mz + uz * half], r: d / 2, r1: brk / 2, d, halfW: EG_TETHER.half * (EG_TETHER.thin + (1 - EG_TETHER.thin) * clamp01(1 - d / Math.max(brk, 1e-3))) };
}
export const egChainLook = (d) => ({ taut: clamp01((d - EG_TETHER.slack) / (EG_TETHER.taut - EG_TETHER.slack)), chip: `${d.toFixed(1)}/${EG_TETHER.taut} m` });
export const egChainWords = (name, d) => `Chained to ${name || 'another'}: ${egChainLook(d).chip}`;

export const EG_POOL_RAMP = Object.freeze(['liquid', 'stone', 'liquid', 'liquid']);
export const EG_POOL_STEP = 2;
export const EG_POOL_DARK = 0.5;
export function egPoolRgb(band) {
  const b = Math.max(0, Math.min(3, band | 0)), c = EG_BAND_RAMPS[b][EG_POOL_RAMP[b]][EG_POOL_STEP];
  return [(c[0] / 255) * EG_POOL_DARK, (c[1] / 255) * EG_POOL_DARK, (c[2] / 255) * EG_POOL_DARK];
}

export const EG_ECLIPSE_LOOK = Object.freeze({ dark: 2, wind: 3, deep: 0.62, windSound: Object.freeze({ rec: 70, vol: 0.9, pitch: 0.8 }), tollSound: Object.freeze({ rec: 107, vol: 1, pitch: 0.75 }) });
export function egEclipseAt(spec, t) {
  for (const hz of spec?.hazards ?? []) {
    if (hz.kind !== 'eclipse') continue;
    for (const p of egHazardParts(hz, t)) {
      const havens = [];
      for (let k = 1; k + 2 < p.sh.length; k += 3) havens.push([p.sh[k], p.sh[k + 1]]);
      return { secs: p.st === 'tell' ? (1 - p.k) * (EG_HAZARDS.eclipse.tell / 1000) : 0, live: p.st === 'live', havens, r: EG_HAZARDS.eclipse.r, key: p.key };
    }
  }
  return null;
}
export const EG_ECLIPSE_BLOW_LIVE_MS = 600;
export function egEclipseOfBlows(blows, ms) {
  for (const b of blows ?? []) {
    const s = b?.s?.[0];
    if (!b.ch || b.nm !== EG_ECLIPSE_NM || b.cut || s?.[0] !== 'h' || ms < b.at - b.wu || ms >= b.at + EG_ECLIPSE_BLOW_LIVE_MS) continue;
    const havens = [];
    for (let k = 1; k + 2 < s.length; k += 3) havens.push([s[k], s[k + 1]]);
    return { secs: Math.max(0, (b.at - ms) / 1000), live: ms >= b.at, havens, r: s[3] ?? EG_HAZARDS.eclipse.r, key: `b${b.i}` };
  }
  return null;
}
export const egEclipseChip = (e) => (e && !e.live ? `The Eclipse: ${Math.max(1, Math.ceil(e.secs - 1e-9))}` : '');
export const egEclipseDark = (e) => (!e ? 0 : e.live ? 1 : clamp01(1 - e.secs / EG_ECLIPSE_LOOK.dark));

export const EG_SIGILS = Object.freeze(['tooth', 'gem', 'flame', 'flake', 'chain', 'cage', 'ring', 'eye', 'knot']);
export const EG_SIGIL_RIM = Object.freeze({ 2: Object.freeze([1.0, 0.45, 0.1]), 3: Object.freeze([0.62, 0.78, 0.82]) });
export const EG_SIGIL_UP_M = 0.6;
export function egSigilsOf(mk, sub, now) {
  const out = [];
  for (const m of mk ?? []) if (m[0] === sub && m[2] > now && EG_SIGILS[m[1]]) out.push({ k: m[1], sigil: EG_SIGILS[m[1]], secs: Math.ceil((m[2] - now) / 1000), n: m[3] | 0, rim: EG_SIGIL_RIM[m[1]] ?? null });
  return out.sort((a, b) => a.k - b.k);
}
export function egScreenAt(vp, p) {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  if (!(w > 1e-3)) return null;
  const sx = 0.5 + (0.5 * x) / w, sy = 0.5 - (0.5 * y) / w;
  return sx >= 0 && sx <= 1 && sy >= 0 && sy <= 1 ? [sx, sy] : null;
}
export const egViewYaw = (view) => Math.atan2(-view[2], -view[10]);

export const EG_AURA_RING = Object.freeze({ r: 0.6, color: Object.freeze([92 / 255, 124 / 255, 196 / 255]) });
const AURA_IDS = new Set(EG_VESTIGES.filter((v) => /** @type {any} */ (v).aura > 0).map((v) => v.id));
export const egAuraHolders = (E) => (E?.ms ?? []).filter((r) => (r[6] ?? []).some((v) => AURA_IDS.has(v[0]))).map((r) => r[0]);

export const EG_SHADE_BAND = 2;
export const EG_SHADE_RIM = Object.freeze([187 / 255, 193 / 255, 202 / 255, 0.3]);
export const EG_GUARD_GLINT = Object.freeze([1, 0.92, 0.7, 0.75]);
export const EG_GUARD_SOUND = Object.freeze({ rec: 433, vol: 1, pitch: 1.2 });
export const EG_GUST_TELL_MS = 1000;
export const EG_GUST_SOUND = Object.freeze({ rec: 66, vol: 0.9, pitch: 1.1 });
// `EG_FL.lit` is also set on a Binder's raise, so the guard glint applies only when `lord` is true.
export const egRimOf = (band, fl, lord = true) => ((fl & EG_FL.lit) !== 0 && lord ? EG_GUARD_GLINT : band === EG_SHADE_BAND && (fl & (EG_FL.dormant | EG_FL.friend)) === 0 ? EG_SHADE_RIM : null);

export const EG_HEAVY_SHAKE = Object.freeze({ Savage: Object.freeze([2.5, 10]), Gore: Object.freeze([3, 10]), Whirl: Object.freeze([2.5, 10]), Smash: Object.freeze([2, 8]), Maul: Object.freeze([2.5, 8]) });
const stampDist = (s, x, z) => (s[0] === 'l' ? segDist(x, z, s[1], s[2], s[3], s[4]) : s[0] === 'a' || s[0] === 'h' ? 0 : Math.hypot(x - s[1], z - s[2]));
export function egHeavyShake(blow, x, z, motion = 1) {
  const w = EG_HEAVY_SHAKE[blow?.nm];
  if (!w || !(motion > 0)) return 0;
  let d = Infinity;
  for (const s of blow.s ?? []) d = Math.min(d, stampDist(s, x, z));
  return w[0] * Math.max(0, 1 - d / w[1]) * Math.min(1, motion);
}
export const egShakeMotion = (still, technique) => { if (still) return 0; const v = Number(technique); return Number.isFinite(v) ? clamp01(v) : 1; };
// An hp drop within this window after a hit by the local player is the relay echo of that hit (`ehp`), not an ally
// hit.
export const EG_MINE_ECHO_MS = 400;
export function egBodyFlash(b, t) {
  if (!b || b.fellAt) return 0;
  const mine = b.mineAt ?? -Infinity, hurt = b.hurtAt ?? -Infinity;
  return gateHitFlash(mine, hurt >= mine && hurt - mine <= EG_MINE_ECHO_MS ? -Infinity : hurt, t);
}
export const EG_DROP_THUD = Object.freeze({ min: 1, over: 6, r0: 0.6, r1: 3.2, ms: 700,
  sounds: Object.freeze([Object.freeze({ rec: 15, vol: 1, pitch: 0.6 }), Object.freeze({ rec: 24, vol: 0.55, pitch: 0.5 })]) });
export function egDropUnder(spec, x, y, z) {
  for (const s of spec?.steps ?? []) if (s.kind === 'drop' && Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2 && y >= s.y - 0.3 && y - s.y <= EG_DROP_THUD.over) return s;
  return null;
}
export const egOverDrop = (spec, x, y, z) => { const s = egDropUnder(spec, x, y, z); return !!s && y - s.y >= EG_DROP_THUD.min; };
