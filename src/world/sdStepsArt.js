// @ts-check
// Paints the Unmoored Steps atlas (drift, riser, beat, crumble, and parts records) in code, one draw per step.
import { SD_RAMP, SD_LIGHT } from './sdLook.js';
import { image, putTexel, scale, ramp, step, bevel, rivet, rng, noiseField, paletteOf, quantize } from './sdPixelKit.js';
import { SD_DRIFT_SIZE, SD_BEAT_SIZE, SD_CRUMBLE_SIZE } from './sdSteps.js';

export const SD_STEPS_RECORD = Object.freeze({
  drift: 60,
  riser: 61,
  beat: Object.freeze([22, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]),
  falter: 73,
  crumble: Object.freeze([21, 74, 75, 76]),
  parts: 77,
  partsDark: 78,
});
export const SD_STEPS_CRACKED_RECORD = SD_STEPS_RECORD.crumble[0];
export const SD_STEPS_BEAT_RECORD = SD_STEPS_RECORD.beat[0];
export const SD_BEAT_EMBER_FRAME = 10;
export const SD_BEAT_EMBER_HOURS = 2;

export const SD_STEPS_ATLAS = Object.freeze({
  w: 128, h: 64,
  top: Object.freeze([0, 0, 64, 64]),
  side: Object.freeze([64, 0, 64, 16]),
  line: Object.freeze([64, 16, 64, 4]),
  bevel: Object.freeze([64, 20, 64, 4]),
  under: Object.freeze([64, 24, 64, 40]),
});
export const SD_RISER_ATLAS = Object.freeze({
  w: 128, h: 64,
  top: Object.freeze([0, 0, 64, 64]),
  side: Object.freeze([64, 0, 64, 52]),
  line: Object.freeze([64, 52, 64, 4]),
  bevel: Object.freeze([64, 56, 64, 4]),
  under: Object.freeze([64, 60, 64, 4]),
});
export const SD_PARTS_ATLAS = Object.freeze({
  w: 64, h: 64,
  rod: Object.freeze([0, 0, 8, 64]),
  gear: Object.freeze([8, 0, 24, 24]),
  rim: Object.freeze([8, 24, 24, 8]),
  stone: Object.freeze([32, 0, 16, 32]),
  rune: Object.freeze([48, 0, 16, 32]),
  cap: Object.freeze([32, 32, 16, 16]),
  vane: Object.freeze([48, 32, 16, 16]),
  grit: Object.freeze([8, 32, 8, 8]),
  dark: Object.freeze([16, 32, 16, 16]),
});
export const SD_STEP_BEVEL = 0.06;
export const SD_STEP_LINE = 0.05;

const { basalt: Ba, brass: Br, verdigris: Vg, void: Vo, bronze: Bz } = SD_RAMP;
const PALETTE = paletteOf(Ba, Br, Vg, Vo, Bz);
const GOLD = SD_LIGHT.gold.map((v) => Math.round(v * 255));
const EMBER = SD_LIGHT.ember.map((v) => Math.round(v * 255));
const BLACK = Object.freeze([0, 0, 0]);
export const SD_STEPS_GLOW = Object.freeze({ line: 0.5, lip: 0.65, tick: 1, hand: 1, falter: 0.12, sector: 0.1, crack: Object.freeze([0.18, 0.35, 0.55, 0.85]), rune: 0.8 });

function fill(img, cell, fn) {
  const [x0, y0, w, h] = cell;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn((x + 0.5) / w, (y + 0.5) / h, x0 + x, y0 + y); if (c) putTexel(img, x0 + x, y0 + y, c); }
}
const topMetres = (kind, s, t) => {
  const size = kind === 'drift' ? SD_DRIFT_SIZE : kind === 'crumble' ? SD_CRUMBLE_SIZE : SD_BEAT_SIZE;
  return [(s - 0.5) * (size.w - 2 * SD_STEP_BEVEL), (t - 0.5) * (size.d - 2 * SD_STEP_BEVEL)];
};
/**
 * @param {import('./sdPixelKit.js').Img} albedo
 * @param {import('./sdPixelKit.js').Img} emission
 * @param {typeof SD_STEPS_ATLAS | typeof SD_RISER_ATLAS} A
 * @param {ReadonlyArray<number>} [col]
 * @param {number} [k]
 */
function paintRim(albedo, emission, A, col = GOLD, k = SD_STEPS_GLOW.line) {
  fill(albedo, A.line, (s, t, x, y) => (t < 0.5 ? step(Br, 5) : step(Br, 4)));
  fill(emission, A.line, (s, t) => scale(col, t < 0.5 ? k : k * 0.7));
  fill(albedo, A.bevel, (s, t, x, y) => ramp(Br, 0.62 + 0.25 * (1 - t), x, y));
}
function paintBrassSide(albedo, A, seed) {
  const g = noiseField(seed, 8, A.w, A.h);
  fill(albedo, A.side, (s, t, x, y) => ramp(Br, 0.42 - 0.3 * t + 0.12 * g(x, y), x, y));
  const [x0, y0, w, h] = A.side;
  for (let x = 0; x < w; x++) { putTexel(albedo, x0 + x, y0, step(Br, 4)); putTexel(albedo, x0 + x, y0 + h - 1, step(Vg, 1)); }
  for (let x = 4; x < w; x += 8) rivet(albedo, x0 + x, y0 + Math.floor(h / 2), step(Br, 3), step(Br, 0), step(Br, 5));
}

export function driftArt(seed = 0x5d90) {
  const A = SD_STEPS_ATLAS, albedo = image(A.w, A.h), emission = image(A.w, A.h), g = noiseField(seed, 8, A.w, A.h);
  fill(albedo, A.top, (s, t, x, y) => {
    const e = Math.min(x, y, 63 - x, 63 - y);
    if (e < 5) return ramp(Br, 0.5 + 0.2 * g(x, y) + (e === 0 ? 0.3 : e === 4 ? -0.25 : 0), x, y);
    const dx = ((x % 6) + 6) % 6 - 2.5, dy = ((y + 3 * (Math.floor(x / 6) & 1)) % 6) - 2.5;
    const raised = Math.abs(dx) + Math.abs(dy) < 2.2;
    return raised ? ramp(Bz, 0.55 + 0.2 * g(x, y), x, y) : ramp(Bz, 0.2 + 0.15 * g(x, y), x, y);
  });
  for (let k = 0; k < 8; k++) { const p = 4 + k * 8; rivet(albedo, p, 2, step(Br, 4), step(Br, 1), step(Br, 5)); rivet(albedo, p, 61, step(Br, 4), step(Br, 1), step(Br, 5)); rivet(albedo, 2, p, step(Br, 4), step(Br, 1), step(Br, 5)); rivet(albedo, 61, p, step(Br, 4), step(Br, 1), step(Br, 5)); }
  for (const ex of [5, 58]) fill(albedo, [ex - 4, 28, 9, 9], (s, t, x, y) => { const r = Math.hypot(s - 0.5, t - 0.5); return r < 0.2 ? step(Vo, 0) : r < 0.5 ? step(Br, r < 0.32 ? 5 : 3) : null; });
  paintBrassSide(albedo, A, seed + 1);
  paintRim(albedo, emission, A);
  fill(albedo, A.under, (s, t, x, y) => (Math.abs(s - 0.5) < 0.06 || Math.abs(t - 0.5) < 0.08 ? ramp(Br, 0.3, x, y) : ramp(Br, 0.08 + 0.1 * g(x, y), x, y)));
  return { albedo: quantize(albedo, PALETTE), emission };
}

export function riserArt(seed = 0x5d91) {
  const A = SD_RISER_ATLAS, albedo = image(A.w, A.h), emission = image(A.w, A.h), g = noiseField(seed, 8, A.w, A.h), r = rng(seed);
  const shade = Array.from({ length: 64 }, () => r());
  fill(albedo, A.top, (s, t, x, y) => {
    const e = Math.min(x, y, 63 - x, 63 - y);
    if (e < 3) return ramp(Br, 0.45 + (e === 0 ? 0.3 : 0), x, y);
    const fx = (x - 3) % 29, fy = (y - 3) % 29;
    if (fx === 0 || fy === 0) return step(Ba, 0);
    return ramp(Ba, 0.35 + 0.35 * shade[(Math.floor((x - 3) / 29) * 3 + Math.floor((y - 3) / 29)) & 63] + 0.1 * g(x, y), x, y);
  });
  const [sx0, sy0, sw, sh] = A.side;
  fill(albedo, A.side, (s, t, x, y) => {
    const lx = x - sx0, ly = y - sy0, row = Math.floor(ly / 8), off = (row & 1) * 8, bx = (lx + off) % 16, by = ly % 8;
    if (Math.abs(lx - sw / 2 + 0.5) < 10) return Math.abs(lx - sw / 2 + 0.5) > 8 ? step(Br, 1) : ramp(Br, 0.12 + 0.08 * g(x, y), x, y);
    if (bx === 0 || by === 7) return step(Ba, 0);
    return ramp(Ba, 0.3 + 0.4 * shade[(row * 5 + Math.floor((lx + off) / 16) * 3) & 63] + (by === 0 ? 0.15 : 0), x, y);
  });
  paintRim(albedo, emission, A, GOLD, SD_STEPS_GLOW.lip);
  fill(albedo, A.under, (s, t, x, y) => step(Ba, 1));
  return { albedo: quantize(albedo, PALETTE), emission };
}

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
export const hourAngle = (x, z) => { const a = Math.atan2(x, z); return a < 0 ? a + Math.PI * 2 : a; };
export const SD_BEAT_DIAL = Object.freeze({ bezel0: 1.04, bezel1: 1.18, tick0: 0.7, tick1: 0.95, tickW: 0.11, hand: 0.9, handW: 0.07, hub: 0.14 });
export const beatHandAngle = (k) => ((12 - k) / 12) * Math.PI * 2;
export const beatTickLit = (k, h) => h >= 1 && h < 12 - k;

export function beatArt(k = 0, faltered = false, seed = 0x5d92, { warn = EMBER, dash = false } = {}) {
  const A = SD_STEPS_ATLAS, albedo = image(A.w, A.h), emission = image(A.w, A.h), g = noiseField(seed, 8, A.w, A.h), D = SD_BEAT_DIAL;
  const ember = k >= SD_BEAT_EMBER_FRAME, col = ember ? warn : GOLD, f = faltered ? SD_STEPS_GLOW.falter / SD_STEPS_GLOW.tick : 1;
  const ha = beatHandAngle(k), hx = Math.sin(ha), hz = Math.cos(ha), sector = (SD_BEAT_EMBER_HOURS / 12) * Math.PI * 2;
  fill(albedo, A.top, (s, t, x, y) => {
    const [mx, mz] = topMetres('beat', s, t), r = Math.hypot(mx, mz), a = hourAngle(mx, mz);
    const e = Math.min(x, y, 63 - x, 63 - y);
    let c = ramp(Br, 0.1 + 0.12 * g(x, y), x, y);
    if (e < 2) c = step(Br, e === 0 ? 4 : 1);
    if (r > D.bezel0 && r < D.bezel1) c = step(Br, r < D.bezel0 + 0.05 ? 5 : r > D.bezel1 - 0.04 ? 1 : 4);
    else if (r < D.bezel0 && r > D.tick0 - 0.08 && a < sector) c = ramp(Vo, 0.62, x, y);
    const h = Math.round((a / (Math.PI * 2)) * 12) % 12, ta = (h / 12) * Math.PI * 2, along = mx * Math.sin(ta) + mz * Math.cos(ta), across = mx * Math.cos(ta) - mz * Math.sin(ta);
    if (along > D.tick0 && along < D.tick1 && Math.abs(across) < D.tickW / 2 * (h === 0 ? 1.8 : 1)) c = step(Br, h === 0 ? 5 : beatTickLit(k, h) ? 5 : 1);
    if (r < D.hub) c = r < D.hub * 0.45 ? step(Br, 5) : step(Br, 0);
    const hal = mx * hx + mz * hz, hac = Math.abs(mx * hz - mz * hx);
    if (hal > 0 && hal < D.hand && hac < D.handW / 2 + (hal > D.hand * 0.55 && hal < D.hand * 0.8 ? 0.05 : 0)) c = step(Br, 5);
    return c;
  });
  fill(emission, A.top, (s, t) => {
    const [mx, mz] = topMetres('beat', s, t), r = Math.hypot(mx, mz), a = hourAngle(mx, mz);
    if (r < D.hub) return BLACK;
    const hal = mx * hx + mz * hz, hac = Math.abs(mx * hz - mz * hx);
    if (hal > 0 && hal < D.hand && hac < D.handW / 2 + (hal > D.hand * 0.55 && hal < D.hand * 0.8 ? 0.05 : 0)) return scale(col, SD_STEPS_GLOW.hand * f);
    const h = Math.round((a / (Math.PI * 2)) * 12) % 12, ta = (h / 12) * Math.PI * 2, along = mx * Math.sin(ta) + mz * Math.cos(ta), across = mx * Math.cos(ta) - mz * Math.sin(ta);
    if (along > D.tick0 && along < D.tick1 && Math.abs(across) < D.tickW / 2 * (h === 0 ? 1.8 : 1)) return h === 0 ? scale(GOLD, 0.3 * f) : beatTickLit(k, h) ? scale(col, SD_STEPS_GLOW.tick * f) : BLACK;
    if (r < D.bezel0 && r > D.tick0 - 0.08 && a < sector) return scale(ember ? warn : EMBER, SD_STEPS_GLOW.sector * (ember ? 2.5 * f : 1));
    return BLACK;
  });
  paintBrassSide(albedo, A, seed + 1);
  paintRim(albedo, emission, A, col, SD_STEPS_GLOW.line * f);
  if (dash && ember) fill(emission, A.line, (s, t, x) => (((x >> 2) & 1) === 1 ? BLACK : null));
  fill(albedo, A.under, (s, t, x, y) => ramp(Br, 0.1 + 0.12 * g(x, y), x, y));
  return { albedo: quantize(albedo, PALETTE), emission };
}

export const SD_CRUMBLE_CRACKS = (() => {
  const r = rng(0x5d7b), W = SD_CRUMBLE_SIZE.w / 2, D = SD_CRUMBLE_SIZE.d / 2, j = (k) => (r() - 0.5) * k;
  const at = Object.freeze([j(0.5), j(0.5)]);
  const run = (from, to, n, wob) => { const pts = [from]; for (let i = 1; i < n; i++) { const u = i / n; pts.push([from[0] + (to[0] - from[0]) * u + wob[0] * j(1),from[1] + (to[1] - from[1]) * u + wob[1] * j(1)]); } pts.push(to); return pts; };
  const ax = j(1.2), bx = j(1.2), az = j(1.2), bz = j(1.2);
  const across = [...run([-W, az], at, 3, [0, 0.35]), ...run(at, [W, bz], 3, [0, 0.35]).slice(1)];
  const along = [...run([ax, -D], at, 3, [0.35, 0]), ...run(at, [bx, D], 3, [0.35, 0]).slice(1)];
  const branches = [];
  for (let k = 0; k < 5; k++) {
    const src = (k & 1 ? across : along)[1 + (k % 3)], a = r() * Math.PI * 2, L = 0.25 + r() * 0.3;
    branches.push(Object.freeze([Object.freeze(src.slice()), Object.freeze([src[0] + Math.cos(a) * L, src[1] + Math.sin(a) * L])]));
  }
  const fz = (pts) => Object.freeze(pts.map((p) => Object.freeze(p)));
  return Object.freeze({ at, across: fz(across), along: fz(along), branches: Object.freeze(branches) });
})();
export const SD_CRACK_STAGES = Object.freeze([
  Object.freeze({ core: 0.022, lip: 0.06, branch: false }),
  Object.freeze({ core: 0.035, lip: 0.075, branch: false }),
  Object.freeze({ core: 0.05, lip: 0.095, branch: true }),
  Object.freeze({ core: 0.07, lip: 0.12, branch: true }),
]);
export function crackDistance(x, z) {
  let main = Infinity, branch = Infinity;
  for (const pts of [SD_CRUMBLE_CRACKS.across, SD_CRUMBLE_CRACKS.along]) for (let j = 1; j < pts.length; j++) main = Math.min(main, segDist(x, z, pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1]));
  for (const [a, b] of SD_CRUMBLE_CRACKS.branches) branch = Math.min(branch, segDist(x, z, a[0], a[1], b[0], b[1]));
  return [main, branch];
}
export function crumbleArt(n = 0, seed = 0x5d93) {
  const A = SD_STEPS_ATLAS, albedo = image(A.w, A.h), emission = image(A.w, A.h), g = noiseField(seed, 6, A.w, A.h), S = SD_CRACK_STAGES[n];
  const k = SD_STEPS_GLOW.crack[n], col = n >= 2 ? EMBER : scale(EMBER, 1), hot = SD_RAMP.void[4];
  const crack = (mx, mz) => { const [m, b] = crackDistance(mx, mz); const d = S.branch ? Math.min(m, b * 1.4) : Math.min(m, b * 2.2); return d; };
  fill(albedo, A.top, (s, t, x, y) => {
    const [mx, mz] = topMetres('crumble', s, t), d = crack(mx, mz), e = Math.min(x, y, 63 - x, 63 - y);
    if (d < S.core) return [...hot];
    if (d < S.lip) return step(Ba, 0);
    if (e === 0) return step(Ba, 3);
    return ramp(Ba, 0.28 + 0.35 * g(x, y), x, y);
  });
  fill(emission, A.top, (s, t) => { const [mx, mz] = topMetres('crumble', s, t), d = crack(mx, mz); return d < S.core ? scale(col, k) : d < S.lip ? scale(col, k * 0.18) : BLACK; });
  const [x0, y0, w, h] = A.side;
  fill(albedo, A.side, (s, t, x, y) => ramp(Ba, 0.22 + 0.25 * g(x, y * 3) + (y - y0 === 0 ? 0.25 : 0), x, y));
  for (const pts of [SD_CRUMBLE_CRACKS.across, SD_CRUMBLE_CRACKS.along]) for (const p of [pts[0], pts[pts.length - 1]]) {
    const u = Math.abs(Math.abs(p[0]) - SD_CRUMBLE_SIZE.w / 2) < 1e-6 ? (p[1] / SD_CRUMBLE_SIZE.d + 0.5) : (p[0] / SD_CRUMBLE_SIZE.w + 0.5);
    const cx = x0 + Math.round(u * (w - 1));
    for (let yy = 0; yy < h; yy++) { const wob = Math.round(Math.sin(yy * 1.7 + cx) * 0.8); putTexel(albedo, cx + wob, y0 + yy, [...hot]); putTexel(emission, cx + wob, y0 + yy, scale(col, k * (1 - yy / h))); }
  }
  paintRim(albedo, emission, A, n >= 3 ? EMBER : GOLD, SD_STEPS_GLOW.line);
  fill(albedo, A.under, (s, t, x, y) => ramp(Ba, 0.1 + 0.2 * g(x, y), x, y));
  return { albedo: quantize(albedo, PALETTE), emission };
}
export const crackedArt = () => crumbleArt(0);

export function partsArt(lit = true, seed = 0x5d94) {
  const P = SD_PARTS_ATLAS, albedo = image(P.w, P.h), emission = image(P.w, P.h), g = noiseField(seed, 8, P.w, P.h);
  fill(albedo, P.rod, (s, t, x, y) => step(Br, s < 0.3 ? 4 : s < 0.7 ? 3 : 1));
  fill(albedo, P.gear, (s, t, x, y) => { const r = Math.hypot(s - 0.5, t - 0.5); return r < 0.12 ? step(Br, 0) : r < 0.18 ? step(Br, 4) : Math.abs(((Math.atan2(s - 0.5, t - 0.5) / Math.PI) * 3 + 6) % 1 - 0.5) < 0.12 && r < 0.42 ? step(Br, 1) : ramp(Br, 0.45 + 0.2 * g(x, y), x, y); });
  fill(albedo, P.rim, (s, t, x, y) => step(Br, t < 0.3 ? 5 : 3));
  fill(albedo, P.stone, (s, t, x, y) => (Math.floor(t * 8) !== Math.floor((t - 1 / 32) * 8) ? step(Ba, 0) : ramp(Ba, 0.35 + 0.3 * g(x, y), x, y)));
  fill(albedo, P.rune, (s, t, x, y) => ramp(Ba, 0.3 + 0.25 * g(x, y), x, y));
  const rune = (s, t) => {
    const x = Math.abs((s - 0.5) * 0.27), y = (t - 0.55) * 0.85;
    return (x < 0.022 && y > -0.14 && y < 0.05) || (y >= 0.03 && y < 0.14 && x < 0.065 * (1 - (y - 0.03) / 0.11));
  };
  fill(albedo, P.rune, (s, t) => (rune(s, t) ? step(Br, lit ? 5 : 2) : null));
  fill(emission, P.rune, (s, t) => (rune(s, t) && lit ? scale(GOLD, SD_STEPS_GLOW.rune) : BLACK));
  fill(albedo, P.cap, (s, t, x, y) => ramp(Br, 0.5 + 0.3 * (1 - t), x, y));
  bevel(albedo, P.cap[0], P.cap[1], P.cap[2], P.cap[3], step(Br, 5), step(Br, 1));
  fill(albedo, P.vane, (s, t, x, y) => ramp(Br, 0.55 + 0.25 * g(x, y), x, y));
  fill(albedo, P.grit, (s, t, x, y) => step(Ba, (x + y) & 1 ? 3 : 2));
  fill(albedo, P.dark, (s, t, x, y) => step(Br, 0));
  return { albedo: quantize(albedo, PALETTE), emission };
}

export const SD_STEPS_PALETTE = PALETTE;

/** @returns {Array<[number, { albedo: import('./sdPixelKit.js').Img, emission: import('./sdPixelKit.js').Img }]>} */
export function stepsArt() {
  const R = SD_STEPS_RECORD;
  /** @type {Array<[number, { albedo: import('./sdPixelKit.js').Img, emission: import('./sdPixelKit.js').Img }]>} */
  const out = [[R.crumble[0], crumbleArt(0)], [R.beat[0], beatArt(0)]];
  out.push([R.drift, driftArt()], [R.riser, riserArt()]);
  for (let k = 1; k < 12; k++) out.push([R.beat[k], beatArt(k)]);
  out.push([R.falter, beatArt(11, true)]);
  for (let n = 1; n < 4; n++) out.push([R.crumble[n], crumbleArt(n)]);
  out.push([R.parts, partsArt(true)], [R.partsDark, partsArt(false)]);
  return out;
}
