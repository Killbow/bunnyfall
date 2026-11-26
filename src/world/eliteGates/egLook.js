// @ts-check
import { egCircleSpecs, egBandOfCircle, EG_BRINK_HALLS } from '../../net/eliteGates/egLaw.js';
import { egMistAt } from '../../net/eliteGates/egFragLaw.js';
import { egTubeBand, egWallBand, egIsleDisc, egToDungeon, egLaneOpenEnds } from './egHall.js';
import { SD_ISLAND_SIDES } from '../sdRealm.js';
import { SD_STEP_THICK, breathSeen } from '../sdSteps.js';
import { createMeshKit } from './meshKit.js';
import { EG_DRESS, egBandArchive } from './egBandArt.js';
import { EG_CVD } from '../../ui/eliteGates/egAccess.js';
import { egRideOf } from '../../net/eliteGates/egFair.js';
import { egPieceAt } from '../../net/eliteGates/egSpanLaw.js';
import { egAtmosOf } from './egAtmos.js';

export const EG_EDGE_LINE = Object.freeze({ px: 2, phonePx: 3, phoneH: 720, luma: 0.38, lift: 0.02, color: Object.freeze([1.0, 0.78, 0.4]) });
export const egEdgeLinePx = (h) => (h > 0 && h <= EG_EDGE_LINE.phoneH ? EG_EDGE_LINE.phonePx : EG_EDGE_LINE.px);
export const egEdgeLineColor = (pal = null) => { const g = pal && pal.key !== 'standard' && Array.isArray(pal.safety) ? pal.safety : EG_EDGE_LINE.color, l = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2], k = EG_EDGE_LINE.luma / l; return [g[0] * k, g[1] * k, g[2] * k]; };
export const EG_LINE_KIND = Object.freeze({ edge: 0, track: 1, streamer: 2, trail: 3 });
export const EG_TRACK = Object.freeze({ dash: 0.5, under: SD_STEP_THICK + 0.12 });

export function egCircleEdges(seed, c, geo = 0) {
  const edge = [], track = [];
  const seg = (out, a, b) => out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  for (const spec of egCircleSpecs(seed, c, geo)) {
    const lift = EG_EDGE_LINE.lift;
    for (const d of spec.discs) {
      if (egIsleDisc(spec, d)) continue;
      for (let k = 0; k < SD_ISLAND_SIDES; k++) {
        const a0 = (k / SD_ISLAND_SIDES) * Math.PI * 2, a1 = ((k + 1) / SD_ISLAND_SIDES) * Math.PI * 2;
        seg(edge, egToDungeon(spec, d.x + Math.cos(a0) * d.r, (d.y ?? 0) + lift, d.z + Math.sin(a0) * d.r), egToDungeon(spec, d.x + Math.cos(a1) * d.r, (d.y ?? 0) + lift, d.z + Math.sin(a1) * d.r));
      }
    }
    for (const b of spec.bands) {
      if (b.role === 'cave' || egWallBand(spec, b) || egTubeBand(b)) continue;
      const y = b.y + 0.124 + lift;
      for (const s of [-1, 1]) seg(edge, egToDungeon(spec, b.x + s * b.halfW, y, b.z0), egToDungeon(spec, b.x + s * b.halfW, y, b.z1));
    }
    for (const l of spec.lanes ?? []) {
      const dx = l.bx - l.ax, dz = l.bz - l.az, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, y = (l.y ?? 0) + lift;
      for (const s of [-1, 1]) seg(edge, egToDungeon(spec, l.ax + s * nx * l.hw, y, l.az + s * nz * l.hw), egToDungeon(spec, l.bx + s * nx * l.hw, y, l.bz + s * nz * l.hw));
      const open = egLaneOpenEnds(spec, l);
      if (open & 1) seg(edge, egToDungeon(spec, l.ax + nx * l.hw, y, l.az + nz * l.hw), egToDungeon(spec, l.ax - nx * l.hw, y, l.az - nz * l.hw));
      if (open & 2) seg(edge, egToDungeon(spec, l.bx + nx * l.hw, y, l.bz + nz * l.hw), egToDungeon(spec, l.bx - nx * l.hw, y, l.bz - nz * l.hw));
    }
    for (const s of spec.steps) {
      if ((s.kind !== 'rail' && s.kind !== 'drum') || !(s.amp > 0)) continue;
      const y = s.y - EG_TRACK.under, z0 = s.z - s.amp - s.d / 2, z1 = s.z + s.amp + s.d / 2;
      for (const side of [-1, 1]) seg(track, egToDungeon(spec, s.x + side * (s.w / 2 - 0.2), y, z0), egToDungeon(spec, s.x + side * (s.w / 2 - 0.2), y, z1));
      for (const side of [-1, 1]) for (const z of [z0, z1]) { const x = s.x + side * (s.w / 2 - 0.2); seg(track, egToDungeon(spec, x - EG_TRACK.dash / 2, y, z), egToDungeon(spec, x + EG_TRACK.dash / 2, y, z)); }
    }
  }
  return { edge: new Float32Array(edge), track: new Float32Array(track) };
}

export const EG_STREAMERS = Object.freeze({ n: 7, len: 2.2, mps: 9, lo: 0.5, hi: 1.9, reach: 7 });
// `systems/eliteGates/egSpan.js` also pushes players with these sections, so each road and each span link stays its
// own section.
export function egGustSections(specs) {
  const out = [];
  for (const spec of specs) for (const road of [0, 1]) {
    let run = null;
    for (const q of spec.steps ?? []) {
      if ((q.road ?? 0) !== road) continue;
      if (q.kind !== 'gust') { run = null; continue; }
      if (run && q.span !== run.span) run = null;
      if (!run) { run = { spec, road, span: q.span, x: q.x, y: q.y, y1: q.y, z0: q.z - q.d / 2 - 4, z1: 0 }; out.push(run); }
      run.y = Math.min(run.y, q.y); run.y1 = Math.max(run.y1, q.y); run.z1 = q.z + q.d / 2 + 4;
    }
  }
  return out;
}
const _breath = { dir: 0, k: 0 };
/**
 * @param {ReturnType<typeof egGustSections>} sections
 * @param {number} t
 * @param {Float32Array} out
 * @param {Float32Array} alphas
 */
export function egStreamersAt(sections, t, out, alphas) {
  breathSeen(t, _breath);
  if (!_breath.dir) return 0;
  const S = EG_STREAMERS, a = Math.min(1, _breath.k * 3) * (1 - Math.max(0, _breath.k - 0.85) / 0.15);
  let n = 0;
  for (const g of sections) for (let i = 0; i < S.n; i++) {
    if ((n + 1) * 6 > out.length) return n;
    const z = g.z0 + ((i + 0.5) / S.n) * (g.z1 - g.z0), y = g.y + S.lo + ((i * 0.618) % 1) * (S.hi - S.lo);
    const run = 2 * S.reach + S.len, x0 = -S.reach + (((t * S.mps + i * 3.7) % run) + run) % run - S.len;
    const xa = _breath.dir > 0 ? x0 : -x0, xb = xa + _breath.dir * S.len;
    const A = egToDungeon(g.spec, g.x + xa, y, z), B = egToDungeon(g.spec, g.x + xb, y, z);
    out.set([A[0], A[1], A[2], B[0], B[1], B[2]], n * 6);
    alphas[n] = a;
    n++;
  }
  return n;
}

export const EG_WAYSTONE = Object.freeze({ side: 0.5, h: 1.1, below: 0.9, cap: 0.36, capH: 0.22, off: 0.3 });
export function buildEgLookModel(seed, c, geo = 0) {
  const kit = createMeshKit(), W = EG_WAYSTONE;
  for (const spec of egCircleSpecs(seed, c, geo)) {
    for (const w of spec.waystones ?? []) {
      const side = (spec.walk ? spec.walk.halfW : 0) + W.off + W.side / 2;
      const p = egToDungeon(spec, w.x + side, 0, w.z), h = W.side / 2;
      kit.box(EG_DRESS.pillar, [p[0] - h, p[1] - W.below, p[2] - h], [p[0] + h, p[1] + W.h, p[2] + h]);
      const q = W.cap / 2;
      kit.box(EG_DRESS.edge, [p[0] - q, p[1] + W.h, p[2] - q], [p[0] + q, p[1] + W.h + W.capH, p[2] + q], { skip: ['bottom'] });
    }
  }
  return kit.vertexCount ? kit.pack(egBandArchive(egBandOfCircle(c))) : null;
}

export const EG_TRAIL = Object.freeze({ step: 1, max: 240, alpha: 0.4, width: 2, lift: 0.05 });
/**
 * @param {any[]} route
 * @param {any} spec
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} tS
 */
export function egRibbonPush(route, spec, x, y, z, tS) {
  if (route.length >= EG_TRAIL.max) return false;
  const last = route.at(-1);
  if (last && trailAt(spec, last, tS, _trailP) && Math.hypot(x - _trailP[0], y - _trailP[1], z - _trailP[2]) < EG_TRAIL.step) return false;
  const ride = egRideOf(spec, x, y, z, tS);
  route.push(ride ? { pl: ride } : { at: [x, y, z] });
  return true;
}
const _trailP = [0, 0, 0], _trailQ = [0, 0, 0], _trailPiece = { dx: 0, dz: 0, solid: true };
function trailAt(spec, q, tS, o) {
  if (!q.pl) { o[0] = q.at[0]; o[1] = q.at[1]; o[2] = q.at[2]; return true; }
  const s = spec?.steps?.[q.pl[0]];
  if (!s) return false;
  egPieceAt(s, tS, _trailPiece);
  o[0] = s.x + _trailPiece.dx + q.pl[1]; o[1] = s.y + q.pl[2]; o[2] = s.z + _trailPiece.dz + q.pl[3];
  return true;
}
/**
 * @param {any[]} route
 * @param {any} spec
 * @param {number} tS
 * @param {Float32Array} out
 */
export function egTrailSegs(route, spec, tS, out) {
  if (!route?.length || !spec) return 0;
  const o = egToDungeon(spec, 0, EG_TRAIL.lift, 0), room = Math.floor(out.length / 6);
  let n = 0, had = false;
  for (const q of route) {
    if (n >= room) break;
    const ok = trailAt(spec, q, tS, _trailQ);
    if (ok && had) {
      const k = n * 6;
      out[k] = o[0] + _trailP[0]; out[k + 1] = o[1] + _trailP[1]; out[k + 2] = o[2] + _trailP[2];
      out[k + 3] = o[0] + _trailQ[0]; out[k + 4] = o[1] + _trailQ[1]; out[k + 5] = o[2] + _trailQ[2];
      n++;
    }
    if (ok) { _trailP[0] = _trailQ[0]; _trailP[1] = _trailQ[1]; _trailP[2] = _trailQ[2]; }
    had = ok;
  }
  return n;
}
export const EG_MIST = Object.freeze({ below: 0.3, rise: 3, color: Object.freeze([0.5, 0.5, 0.58]), pad: 3 });
export function egMistSheets(specs) {
  const out = [];
  for (const spec of specs) for (const hz of spec.hazards ?? []) {
    if (hz.kind !== 'mist') continue;
    const q = spec.caves.find((c) => c.kit === 'mist' && hz.z >= c.z0 - 1 && hz.z <= c.z1);
    if (q) { out.push(sheetOf({ spec, hz, x0: q.x - q.halfW, z0: q.z0, x1: q.x + q.halfW, z1: q.z1 })); continue; }
    const fl = spec.steps.filter((t) => t.kind === 'sink' && t.z >= hz.z - 1);
    if (!fl.length) continue;
    const P = EG_MIST.pad;
    out.push(sheetOf({ spec, hz, x0: Math.min(...fl.map((t) => t.x - t.w / 2)) - P, z0: Math.min(...fl.map((t) => t.z - t.d / 2)) - P, x1: Math.max(...fl.map((t) => t.x + t.w / 2)) + P, z1: Math.max(...fl.map((t) => t.z + t.d / 2)) + P }));
  }
  return out;
}
function sheetOf(m) {
  const a = egToDungeon(m.spec, m.x0, 0, m.z0), b = egToDungeon(m.spec, m.x1, 0, m.z1);
  return { ...m, rect: [Math.min(a[0], b[0]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[2], b[2])], oy: a[1] };
}
const _sheetSlots = new WeakMap();
// Reuses the sheet objects held for `out` on every call, so a caller must not keep a sheet past the next call.
export function egMistSheetsAt(sheets, t, out = []) {
  let pool = _sheetSlots.get(out), n = 0;
  if (!pool) _sheetSlots.set(out, (pool = []));
  for (const m of sheets) {
    const line = egMistAt(m.hz, t);
    if (!(line > 0.05)) continue;
    const top = Math.min(line, EG_MIST.rise - EG_MIST.below), r = (m.rect ??= sheetOf(m).rect), s = (pool[n] ??= { rect: [0, 0, 0, 0], y: 0, alpha: 0 });
    out[n++] = s;
    s.rect[0] = r[0]; s.rect[1] = r[1]; s.rect[2] = r[2]; s.rect[3] = r[3];
    s.y = (m.oy ??= sheetOf(m).oy) + m.hz.y + top; s.alpha = Math.min(1, line / 1.5);
  }
  out.length = n;
  return out;
}

export const EG_STAIR = Object.freeze({ dither: 0.8, bandFirst: Object.freeze([1, ...EG_BRINK_HALLS]) });
export const egStairOf = (h, reduced = false) => (reduced ? 'cut' : EG_STAIR.bandFirst.includes(h) ? 'fall' : 'veil');

export const EG_SKIES = Object.freeze([
  { moon: 0, embers: 1.0, underside: 0.34, lean: 0.18 },
  { moon: 0, embers: 0.15, underside: 0.22, lean: 0.24 },
  { moon: 1, embers: 0, underside: 0.13, lean: 0.3 },
  { moon: 0, embers: 1.6, underside: 0.07, lean: 0.36 },
].map((s, b) => { const k = egAtmosOf(b).sky; return Object.freeze({ zenith: k.zenith, horizon: k.horizon, deep: k.up, ...s }); }));
export const egSkyOf = (c) => EG_SKIES[egBandOfCircle(c)];

// The telegraph GLSL in `render/gateTelegraph.js` tests these bits as literals, so the values must not change.
export const EG_LOOK_BIT = Object.freeze({ keyline2: 1, hatch: 2, dash: 4 });
export const egPaletteBits = (P) => ((P?.keyline ?? 1) >= 2 ? EG_LOOK_BIT.keyline2 : 0) | (P?.hatch ? EG_LOOK_BIT.hatch : 0);
export function egQuietCompany(stage, full = true) {
  const trial = stage === 'trial';
  return { auras: trial ? 0 : 1, allyAlpha: trial ? 0.6 : 1, allyGlow: trial ? 0 : 1, allyNumbers: !trial || full, vestigeRing: 0.6, aimedOther: trial ? 0.55 : 1, watchfireM: trial ? 12 : Infinity };
}

export const EG_FOG_FLOOR = Object.freeze({ floor: 0.85, within: 30, ease: 4 });
// The GLSL `uFogFloor` code in the telegraph, steps, and line passes repeats this curve; change them together.
export function egFogKept(f, d) {
  const F = EG_FOG_FLOOR, t = Math.max(0, Math.min(1, (d - F.within) / F.ease)), ease = 1 - t * t * (3 - 2 * t);
  return Math.max(f, F.floor * ease);
}

export { EG_CVD };
export function egSeen(c, how) {
  if (how === 'grey') { const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return [l, l, l]; }
  const M = EG_CVD[how];
  if (!M) return [c[0], c[1], c[2]];
  const cl = (v) => Math.max(0, Math.min(1, v));
  return [cl(M[0] * c[0] + M[1] * c[1] + M[2] * c[2]), cl(M[3] * c[0] + M[4] * c[1] + M[5] * c[2]), cl(M[6] * c[0] + M[7] * c[1] + M[8] * c[2])];
}
export function egThroughFog(c, d, density, fog, kept = false) {
  let f = Math.exp(-density * d);
  if (kept) f = egFogKept(f, d);
  return [c[0] * f + fog[0] * (1 - f), c[1] * f + fog[1] * (1 - f), c[2] * f + fog[2] * (1 - f)];
}
export function egLab(c) {
  const X = 0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2], Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], Z = 0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const egDeltaE = (a, b) => { const p = egLab(a), q = egLab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
export const EG_LAB = Object.freeze({ deltaE: 12, greyL: 8 });
