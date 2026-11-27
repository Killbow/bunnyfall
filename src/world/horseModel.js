// @ts-check
import { texelPlanes } from '../travel/horseCoats.js';
import { SKIN_STATIC_FLOATS, skinStreamFloats } from '../formats/mwGpuSkin.js';
import { SKIN_PAL_ROW } from '../render/skinPalette.js';

export const HORSE_MODEL_URL = new URL('../assets/horse/courser.json', import.meta.url).href;
export const HORSE_PICTURE_URLS = Object.freeze({
  body: new URL('../assets/horse/body.png', import.meta.url).href,
  hair: new URL('../assets/horse/hair.png', import.meta.url).href,
});

export const HORSE_GAITS = Object.freeze(['idle', 'walk', 'trot', 'gallop']);
export const HORSE_GAIT_FROM = Object.freeze({ idle: 0, walk: 0.2, trot: 1.3, gallop: 5 });
export const GAIT_HOLD = 0.15;
export const GAIT_RATES = Object.freeze({ idle: Object.freeze([1, 1]), walk: Object.freeze([0.5, 1.9]), trot: Object.freeze([0.6, 2.2]), gallop: Object.freeze([0.5, 1.8]) });
export const GAIT_FADE = 0.25;

/**
 * @param {number} speed
 * @param {string} [current]
 * @param {boolean} [gallops]
 */
export function gaitFor(speed, current = 'idle', gallops = true) {
  const v = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const top = gallops ? HORSE_GAITS.length - 1 : HORSE_GAITS.indexOf('trot');
  let k = 0;
  for (let i = 1; i <= top; i++) if (v >= HORSE_GAIT_FROM[HORSE_GAITS[i]]) k = i;
  const c = HORSE_GAITS.indexOf(current);
  if (c < 0 || c > top || k === c) return HORSE_GAITS[k];
  if (k > c && v < HORSE_GAIT_FROM[HORSE_GAITS[c + 1]] * (1 + GAIT_HOLD)) return current;
  if (k < c && v > HORSE_GAIT_FROM[HORSE_GAITS[c]] * (1 - GAIT_HOLD)) return current;
  return HORSE_GAITS[k];
}

export function gaitRate(bake, gait, speed) {
  const g = bake.gaits[gait];
  if (!g || !(g.speed > 0)) return 1;
  const [lo, hi] = GAIT_RATES[gait] ?? [1, 1];
  return Math.min(hi, Math.max(lo, (Number.isFinite(speed) ? speed : 0) / g.speed));
}

export function horseGait() {
  return { gait: 'idle', clock: { idle: 0, walk: 0, trot: 0, gallop: 0 }, from: /** @type {string | null} */ (null), fade: 1 };
}

export function stepHorseGait(g, bake, speed, dt, seed = 0, gallops = true) {
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
  const want = gaitFor(speed, g.gait, gallops);
  if (want !== g.gait) {
    const was = bake.gaits[g.gait], now = bake.gaits[want];
    g.clock[want] = was && now ? (g.clock[g.gait] / was.duration) * now.duration : 0;
    if (want === 'idle' && seed) g.clock.idle = ((seed * 0.6180339887) % 1) * bake.gaits.idle.duration;
    g.from = g.gait; g.gait = want; g.fade = 0;
  }
  g.fade = Math.min(1, g.fade + (step / GAIT_FADE));
  if (g.fade >= 1) g.from = null;
  for (const name of g.from ? [g.gait, g.from] : [g.gait]) {
    const d = bake.gaits[name]?.duration;
    if (d > 0) g.clock[name] = (g.clock[name] + step * gaitRate(bake, name, speed)) % d;
  }
  return g;
}

export function gaitShare(g, name) {
  if (g.gait === name) return g.from ? g.fade : 1;
  return g.from === name ? 1 - g.fade : 0;
}

export function gaitLocals(bake, name, time, t, q) {
  const g = bake.gaits[name];
  const nb = bake.bones.length;
  const span = (time / g.duration) % 1;
  const at = (span < 0 ? span + 1 : span) * (g.frames - 1);
  const f0 = Math.min(g.frames - 1, Math.floor(at)), f1 = Math.min(g.frames - 1, f0 + 1), k = at - f0;
  for (let b = 0; b < nb; b++) {
    t[b * 3] = g.rest[b * 3]; t[b * 3 + 1] = g.rest[b * 3 + 1]; t[b * 3 + 2] = g.rest[b * 3 + 2];
    const a = (f0 * nb + b) * 4, c = (f1 * nb + b) * 4;
    let dot = 0;
    for (let j = 0; j < 4; j++) dot += g.q[a + j] * g.q[c + j];
    const sg = dot < 0 ? -1 : 1;
    for (let j = 0; j < 4; j++) q[b * 4 + j] = g.q[a + j] + (sg * g.q[c + j] - g.q[a + j]) * k;
  }
  const m = g.moves.length;
  for (let i = 0; i < m; i++) {
    const b = g.moves[i], a = (f0 * m + i) * 3, c = (f1 * m + i) * 3;
    for (let j = 0; j < 3; j++) t[b * 3 + j] = g.t[a + j] + (g.t[c + j] - g.t[a + j]) * k;
  }
}

export function horsePaletteShape(bake) {
  const entries = 1 + bake.bones.length;
  return { entries, width: 3 * Math.min(entries, SKIN_PAL_ROW), height: Math.ceil(entries / SKIN_PAL_ROW) };
}

export function horsePoseScratch(bake) {
  const nb = bake.bones.length;
  return { t: new Float32Array(nb * 3), q: new Float32Array(nb * 4), t2: new Float32Array(nb * 3), q2: new Float32Array(nb * 4), world: new Float64Array(nb * 12),
    inv: bake.bones.map((b) => rowsOf(b.inverseBind)) };
}

function rowsOf(m) {
  return Float64Array.from([m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]]);
}

// Palette layout matches `writeSkinPalette`: three texels an entry, rows [a0 a1 a2 t0] [a3 a4 a5 t1] [a6 a7 a8 t2],
// and entry 0 is the identity.
export function writeHorsePalette(bake, g, pal, scratch = horsePoseScratch(bake)) {
  const nb = bake.bones.length;
  const { t, q, t2, q2, world, inv } = scratch;
  gaitLocals(bake, g.gait, g.clock[g.gait], t, q);
  if (g.from && g.fade < 1) {
    gaitLocals(bake, g.from, g.clock[g.from], t2, q2);
    const k = g.fade;
    for (let i = 0; i < nb * 3; i++) t[i] = t2[i] + (t[i] - t2[i]) * k;
    for (let b = 0; b < nb; b++) {
      const o = b * 4;
      const sg = q[o] * q2[o] + q[o + 1] * q2[o + 1] + q[o + 2] * q2[o + 2] + q[o + 3] * q2[o + 3] < 0 ? -1 : 1;
      for (let j = 0; j < 4; j++) q[o + j] = q2[o + j] + (sg * q[o + j] - q2[o + j]) * k;
    }
  }
  pal.fill(0, 0, 12);
  pal[0] = 1; pal[5] = 1; pal[10] = 1;
  for (let b = 0; b < nb; b++) {
    const o = b * 4;
    let x = q[o], y = q[o + 1], z = q[o + 2], w = q[o + 3];
    const l = Math.hypot(x, y, z, w) || 1;
    x /= l; y /= l; z /= l; w /= l;
    const L = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), t[b * 3],
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), t[b * 3 + 1],
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), t[b * 3 + 2]];
    const p = bake.bones[b].parent;
    const W = world.subarray(b * 12, b * 12 + 12);
    if (p < 0) W.set(L);
    else affine(world.subarray(p * 12, p * 12 + 12), L, W);
    const e = 1 + b;
    const row = Math.floor(e / SKIN_PAL_ROW), col = (e - row * SKIN_PAL_ROW) * 3;
    const width = 3 * Math.min(nb + 1, SKIN_PAL_ROW);
    affine(W, inv[b], pal, (row * width + col) * 4);
  }
  return pal;
}

function affine(a, b, out, o = 0) {
  for (let r = 0; r < 3; r++) {
    const a0 = a[r * 4], a1 = a[r * 4 + 1], a2 = a[r * 4 + 2], a3 = a[r * 4 + 3];
    out[o + r * 4] = a0 * b[0] + a1 * b[4] + a2 * b[8];
    out[o + r * 4 + 1] = a0 * b[1] + a1 * b[5] + a2 * b[9];
    out[o + r * 4 + 2] = a0 * b[2] + a1 * b[6] + a2 * b[10];
    out[o + r * 4 + 3] = a0 * b[3] + a1 * b[7] + a2 * b[11] + a3;
  }
}

// Corner layout follows the GPU skin stream: `SKIN_STATIC_FLOATS`, then four palette entries and their weights,
// then the post entry 0. Baked UVs are v-up and the pass samples the top row first, so v is flipped.
export function horseSkinStream(bake) {
  const floats = skinStreamFloats(1);
  const corners = bake.meshes.reduce((n, m) => n + m.indices.length, 0);
  const stream = new Float32Array(corners * floats);
  // Opaque hide first and alpha cards after, so the cards blend over it.
  const order = [...bake.meshes].sort((a, b) => (a.alpha ? 1 : 0) - (b.alpha ? 1 : 0));
  const ranges = [];
  let c = 0;
  for (const m of order) {
    const first = c;
    for (const v of m.indices) {
      const o = c * floats;
      stream[o] = m.positions[v * 3]; stream[o + 1] = m.positions[v * 3 + 1]; stream[o + 2] = m.positions[v * 3 + 2];
      stream[o + 3] = 1; stream[o + 4] = 1; stream[o + 5] = 1;
      stream[o + 6] = m.normals[v * 3]; stream[o + 7] = m.normals[v * 3 + 1]; stream[o + 8] = m.normals[v * 3 + 2];
      stream[o + 9] = m.uvs[v * 2]; stream[o + 10] = 1 - m.uvs[v * 2 + 1];
      for (let j = 0; j < 4; j++) {
        stream[o + SKIN_STATIC_FLOATS + j] = 1 + m.joints[v * 4 + j];
        stream[o + SKIN_STATIC_FLOATS + 4 + j] = m.weights[v * 4 + j];
      }
      stream[o + floats - 1] = 0;
      c++;
    }
    ranges.push({ part: m.part, texture: m.texture, alpha: !!m.alpha, first, count: c - first });
  }
  return { stream, floats, pairs: 1, ranges };
}

export function horseHide(bake) {
  const body = bake.meshes.find((m) => m.part === 'body');
  const joints = bake.bones.map((b) => b.bind[14]);
  const legs = bake.bones.map((b, i) => (/hoof/i.test(b.name) && b.parent >= 0 ? (joints[i] + joints[b.parent]) / 2 : null)).filter((z) => z != null);
  const crown = legs.length ? legs.reduce((a, z) => a + z, 0) / legs.length : 0;
  let y0 = Infinity, y1 = -Infinity, z1 = -Infinity;
  const n = body.positions.length / 3;
  for (let v = 0; v < n; v++) {
    const y = body.positions[v * 3 + 1], z = body.positions[v * 3 + 2];
    if (y < y0) y0 = y; if (y > y1) y1 = y; if (z > z1) z1 = z;
  }
  return { length: y1 - y0, front: y1, top: z1, crown, height: z1 - crown };
}

export const TEXEL_GUTTER = 2;

export function horseTexelMap(bake, width, height) {
  const job = startTexelMap(bake, width, height);
  while (!job.step()) { }
  return job.map;
}

export const TEXEL_MAP_STEPS = 4 + TEXEL_GUTTER + 4;

export function startTexelMap(bake, width, height) {
  const body = bake.meshes.find((m) => m.part === 'body');
  const hide = horseHide(bake);
  const n = width * height;
  const own = new Int32Array(n).fill(-1);
  const bary = new Float32Array(n * 3);
  const I = body.indices, UV = body.uvs;
  const tris = I.length / 3, rows = height;
  const hideMask = new Uint8Array(n), planes = new Float32Array(n * 9), up = new Float32Array(n);
  const p = [0, 0, 0], nr = [0, 0, 0];
  let stage = 0;
  const job = { map: /** @type {any} */ (null), step };
  function raster(t0, t1) {
    for (let t = t0 * 3; t < t1 * 3; t += 3) {
      const ax = UV[I[t] * 2] * width, ay = (1 - UV[I[t] * 2 + 1]) * height;
      const bx = UV[I[t + 1] * 2] * width, by = (1 - UV[I[t + 1] * 2 + 1]) * height;
      const cx = UV[I[t + 2] * 2] * width, cy = (1 - UV[I[t + 2] * 2 + 1]) * height;
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
        const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const i = y * width + x;
        own[i] = t; bary[i * 3] = w0; bary[i * 3 + 1] = w1; bary[i * 3 + 2] = w2;
      }
    }
  }
  function ring() {
    const was = own.slice(), wasB = bary.slice();
    for (let i = 0; i < n; i++) {
      if (was[i] >= 0) continue;
      const x = i % width, y = (i - x) / width;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (was[j] < 0) continue;
        own[i] = was[j]; bary[i * 3] = wasB[j * 3]; bary[i * 3 + 1] = wasB[j * 3 + 1]; bary[i * 3 + 2] = wasB[j * 3 + 2];
        break;
      }
    }
  }
  function place(r0, r1) {
    for (let i = r0 * width; i < r1 * width; i++) {
      const t = own[i];
      if (t < 0) continue;
      p[0] = p[1] = p[2] = nr[0] = nr[1] = nr[2] = 0;
      for (let k = 0; k < 3; k++) {
        const v = I[t + k], w = bary[i * 3 + k];
        for (let j = 0; j < 3; j++) { p[j] += w * body.positions[v * 3 + j]; nr[j] += w * body.normals[v * 3 + j]; }
      }
      const l = Math.hypot(nr[0], nr[1], nr[2]) || 1;
      nr[0] /= l; nr[1] /= l; nr[2] /= l;
      hideMask[i] = p[2] >= hide.crown ? 1 : 0;
      texelPlanes(p, nr, hide, planes, i * 9);
      up[i] = hide.height > 0 ? (p[2] - hide.crown) / hide.height : 1;
    }
  }
  function step() {
    if (job.map) return true;
    if (stage < 4) raster(Math.floor((tris * stage) / 4), Math.floor((tris * (stage + 1)) / 4));
    else if (stage < 4 + TEXEL_GUTTER) ring();
    else { const k = stage - 4 - TEXEL_GUTTER; place(Math.floor((rows * k) / 4), Math.floor((rows * (k + 1)) / 4)); }
    stage++;
    if (stage >= TEXEL_MAP_STEPS) job.map = { width, height, hide: hideMask, planes, up };
    return !!job.map;
  }
  return job;
}
const NEIGHBOURS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]);

// Each level averages color weighted by alpha, so a card's cut-out edge does not darken as it shrinks.
export function rgbaMips(width, height, rgba) {
  const mips = [{ width, height, rgba: rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba) }];
  let w = width, h = height, src = mips[0].rgba;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const out = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, a = 0, k = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy), o = (sy * w + sx) * 4;
        const al = src[o + 3];
        r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al; k++;
      }
      const o = (y * nw + x) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round(a / k);
    }
    mips.push({ width: nw, height: nh, rgba: out });
    w = nw; h = nh; src = out;
  }
  return mips;
}
