// @ts-check

// A pseudo-archive far above any classic number, so the renderer's archive_record cache key cannot collide.
export const BLOOD_ATLAS_ARCHIVE = 38001;
export const BLOOD_ATLAS_RECORD = 'marks';
export const ATLAS_SIZE = 1024;
export const ATLAS_CELLS = 8;
export const ATLAS_KINDS = Object.freeze(['pool', 'spatter', 'streak', 'drip', 'print']);
// The atlas holds shape and grain as white ink, and the vertex tint carries the blood's color outright.
export const BLOOD_BASE = Object.freeze([0.47, 0.04, 0.032]);
export const FRESH_VARIANCE = 0.12;
export const DRIED_TINT = Object.freeze([0.3, 0.13, 0.09, 1]);
export const DRY_TIME = 180;
export const DRY_STAGES = 8;
export const DRY_TICK = 2;

// Seeded so the atlas is the same picture on every boot and a test can name a pixel.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (edge0, edge1, x) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function wobble(rng, n = 12, amount = 0.2) {
  const tbl = Array.from({ length: n }, () => (rng() * 2 - 1) * amount);
  return (angle) => {
    const f = ((angle / (Math.PI * 2)) % 1 + 1) % 1 * n;
    const i = Math.floor(f), t = f - i;
    return tbl[i % n] * (1 - t) + tbl[(i + 1) % n] * t;
  };
}

export const NOISE_SIZE = 64;

export function bloodNoise(rng) {
  const N = NOISE_SIZE, g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = rng() * 2 - 1;
  const n = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ix & (N - 1), x1 = (ix + 1) & (N - 1), y0 = (iy & (N - 1)) * N, y1 = ((iy + 1) & (N - 1)) * N;
    const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * sx;
    const b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * sx;
    return a + (b - a) * sy;
  };
  const fbm = (x, y, octaves = 3) => {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) { sum += n(x * f + o * 17.3, y * f - o * 9.1) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  };
  return { n, fbm };
}

export function smin(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

export function taperDist(x, y, ax, ay, ra, bx, by, rb) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  return len(x - (ax + dx * t), y - (ay + dy * t)) - (ra + (rb - ra) * t);
}

const TAU = Math.PI * 2;
const len = (x, y) => Math.sqrt(x * x + y * y);
export const gaussOf = (u1, u2) => Math.sqrt(-2 * Math.log(Math.max(1e-6, 1 - u1))) * Math.cos(TAU * u2);
const DEPTH_REACH = Object.freeze({ pool: 0.42, spatter: 0.2, streak: 0.19 });
const EDGE_ROUGH = 0.07;
const FIELD = { a: 0, depth: 0 };
const fromField = (sdf, reach, aa) => {
  FIELD.a = sdf >= aa ? 0 : 1 - smooth(-aa, aa, sdf);
  FIELD.depth = sdf >= 0 ? 0 : Math.pow(Math.min(1, -sdf / reach), 0.8);
  return FIELD;
};
function roughen(noise, ox, oy) {
  const out = { wx: 0, wy: 0, edge: 0 };
  return (x, y) => {
    const wx = x + 0.09 * noise.fbm(x * 2.1 + ox, y * 2.1 + oy, 2);
    const wy = y + 0.09 * noise.fbm(x * 2.1 + oy + 31.7, y * 2.1 + ox - 12.4, 2);
    out.wx = wx; out.wy = wy; out.edge = EDGE_ROUGH * noise.fbm(wx * 4.3 + ox, wy * 4.3 + oy, 3);
    return out;
  };
}
const bound = (t) => ({ ...t, cx: (t.ax + t.bx) / 2, cy: (t.ay + t.by) / 2, br: len(t.bx - t.ax, t.by - t.ay) / 2 + Math.max(t.ra, t.rb) });
const meltRun = (d, x, y, t, k) => (len(x - t.cx, y - t.cy) - t.br > d + k ? d : smin(d, taperDist(x, y, t.ax, t.ay, t.ra, t.bx, t.by, t.rb), k));
const ROUGH_REACH = 0.2;
const INSIDE = 0.86;
const clampIn = (v, r) => Math.max(-INSIDE + r, Math.min(INSIDE - r, v));

function poolField(rng, noise) {
  const ox = rng() * 64, oy = rng() * 64;
  const rough = roughen(noise, ox, oy);
  const main = { x: (rng() - 0.5) * 0.12, y: (rng() - 0.5) * 0.12, r: 0.38 + rng() * 0.1 };
  const lobes = Array.from({ length: 2 + Math.floor(rng() * 4) }, () => {
    const ang = rng() * TAU, d = 0.22 + rng() * 0.22, r = 0.14 + rng() * 0.15;
    return { x: clampIn(main.x + Math.cos(ang) * d, r), y: clampIn(main.y + Math.sin(ang) * d, r), r };
  });
  const fingers = Array.from({ length: Math.floor(rng() * 3) }, () => {
    const ang = rng() * TAU, from = main.r * 0.7, to = main.r + 0.18 + rng() * 0.2;
    return bound({ ax: main.x + Math.cos(ang) * from, ay: main.y + Math.sin(ang) * from, ra: 0.07 + rng() * 0.04,
      bx: clampIn(main.x + Math.cos(ang) * to, 0.03), by: clampIn(main.y + Math.sin(ang) * to, 0.03), rb: 0.015 + rng() * 0.02 });
  });
  const side = rng() * TAU;
  const sats = Array.from({ length: 3 + Math.floor(rng() * 8) }, () => {
    const ang = side + gaussOf(rng(), rng()) * 0.9, d = 0.6 + rng() * 0.26, r = 0.015 + Math.pow(rng(), 2) * 0.05;
    return { x: clampIn(Math.cos(ang) * d, r), y: clampIn(Math.sin(ang) * d, r), r };
  });
  const body = (wx, wy) => {
    let d = len(wx - main.x, wy - main.y) - main.r;
    for (const l of lobes) d = smin(d, len(wx - l.x, wy - l.y) - l.r, 0.12);
    for (const f of fingers) d = meltRun(d, wx, wy, f, 0.06);
    return d;
  };
  return (x, y) => {
    let d = body(x, y);
    if (d < ROUGH_REACH) { const { wx, wy, edge } = rough(x, y); d = body(wx, wy) + edge; }
    for (const s of sats) d = Math.min(d, len(x - s.x, y - s.y) - s.r);
    return fromField(d, DEPTH_REACH.pool, 0.024);
  };
}

function spatterField(rng, noise) {
  const ox = rng() * 64, oy = rng() * 64;
  const rough = roughen(noise, ox, oy);
  const core = { x: (rng() - 0.5) * 0.1, y: (rng() - 0.5) * 0.1, r: 0.2 + rng() * 0.08 };
  const blobs = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => {
    const ang = rng() * TAU, d = core.r * (0.5 + rng() * 0.6), r = core.r * (0.4 + rng() * 0.4);
    return { x: core.x + Math.cos(ang) * d, y: core.y + Math.sin(ang) * d, r };
  });
  const aims = [rng() * TAU];
  if (rng() < 0.45) aims.push(aims[0] + (rng() < 0.5 ? -1 : 1) * (1.2 + rng() * 1.6));
  const aimAt = () => aims[Math.floor(rng() * aims.length) % aims.length];
  const tendrils = Array.from({ length: 3 + Math.floor(rng() * 7) }, () => {
    const ang = aimAt() + gaussOf(rng(), rng()) * 0.5;
    const len = core.r + 0.18 + Math.pow(rng(), 0.7) * 0.45;
    const bx = clampIn(core.x + Math.cos(ang) * len, 0.05), by = clampIn(core.y + Math.sin(ang) * len, 0.05);
    const bead = 0.025 + rng() * 0.045;
    const gap = rng() < 0.4 ? 0.03 + rng() * 0.06 : 0;
    return bound({ ax: core.x + Math.cos(ang) * core.r * 0.5, ay: core.y + Math.sin(ang) * core.r * 0.5, ra: 0.05 + rng() * 0.04,
      bx, by, rb: 0.008 + rng() * 0.012,
      beadX: clampIn(bx + Math.cos(ang) * (bead + gap), bead), beadY: clampIn(by + Math.sin(ang) * (bead + gap), bead), bead });
  });
  const mist = Array.from({ length: 18 + Math.floor(rng() * 40) }, () => {
    const ang = (rng() < 0.8 ? aimAt() + gaussOf(rng(), rng()) * 0.7 : rng() * TAU);
    const d = core.r + 0.1 + Math.pow(rng(), 0.6) * 0.6, r = 0.009 + Math.pow(rng(), 2.5) * 0.03;
    return { x: clampIn(core.x + Math.cos(ang) * d, r), y: clampIn(core.y + Math.sin(ang) * d, r), r };
  });
  const body = (wx, wy) => {
    let d = len(wx - core.x, wy - core.y) - core.r;
    for (const b of blobs) d = smin(d, len(wx - b.x, wy - b.y) - b.r, 0.08);
    for (const t of tendrils) d = meltRun(d, wx, wy, t, 0.05);
    return d;
  };
  return (x, y) => {
    let d = body(x, y);
    if (d < ROUGH_REACH) { const { wx, wy, edge } = rough(x, y); d = body(wx, wy) + edge * 0.7; }
    for (const t of tendrils) d = Math.min(d, len(x - t.beadX, y - t.beadY) - t.bead);
    for (const m of mist) { const dx = x - m.x, dy = y - m.y; if (dx * dx + dy * dy < 0.01) d = Math.min(d, len(dx, dy) - m.r); }
    return fromField(d, DEPTH_REACH.spatter, 0.022);
  };
}

function streakField(rng, noise) {
  const ox = rng() * 64, oy = rng() * 64;
  const rough = roughen(noise, ox, oy);
  const hx = -0.55 + (rng() - 0.5) * 0.08, hr = 0.2 + rng() * 0.07;
  const end = 0.5 + rng() * 0.3, bend = (rng() - 0.5) * 0.3;
  const yAt = (t) => bend * t * t;
  const SEG = 5;
  const body = Array.from({ length: SEG }, (_, k) => {
    const t0 = k / SEG, t1 = (k + 1) / SEG;
    const x0 = hx + (end - hx) * t0, x1 = hx + (end - hx) * t1;
    return bound({ ax: x0, ay: yAt(t0), ra: hr * 0.8 * (1 - t0 * 0.9), bx: x1, by: yAt(t1), rb: hr * 0.8 * (1 - t1 * 0.9) });
  });
  const trail = Array.from({ length: 1 + Math.floor(rng() * 4) }, (_, k) => {
    const t = 1.08 + k * (0.07 + rng() * 0.06), r = Math.max(0.01, 0.035 * (1 - k * 0.2) * (0.6 + rng() * 0.6));
    return { x: clampIn(hx + (end - hx) * t, r), y: clampIn(yAt(Math.min(1.4, t)) + (rng() - 0.5) * 0.04, r), r };
  });
  const crown = Array.from({ length: 2 + Math.floor(rng() * 5) }, () => {
    const ang = Math.PI + gaussOf(rng(), rng()) * 0.8, d = hr + 0.03 + rng() * 0.12, r = 0.012 + rng() * 0.025;
    return { x: clampIn(hx + Math.cos(ang) * d, r), y: clampIn(Math.sin(ang) * d, r), r };
  });
  const run = (wx, wy) => {
    let d = len((wx - hx) * 0.95, wy * 1.08) - hr;
    for (const b of body) d = meltRun(d, wx, wy, b, 0.06);
    return d;
  };
  return (x, y) => {
    let d = run(x, y);
    if (d < ROUGH_REACH) { const { wx, wy, edge } = rough(x, y); d = run(wx, wy) + edge * 0.6; }
    for (const t of trail) d = Math.min(d, len(x - t.x, y - t.y) - t.r);
    for (const c of crown) d = Math.min(d, len(x - c.x, y - c.y) - c.r);
    return fromField(d, DEPTH_REACH.streak, 0.022);
  };
}

function shapeAt(kind, rng, noise) {
  if (kind === 'pool') return poolField(rng, noise);
  if (kind === 'spatter') return spatterField(rng, noise);
  if (kind === 'streak') return streakField(rng, noise);
  if (kind === 'print') {
    const w = wobble(rng, 10, 0.12);
    const toeX = 0.32 + rng() * 0.12, heelX = -0.5 - rng() * 0.08;
    return (x, y) => {
      const ang = Math.atan2(y, x);
      const heel = 1 - smooth(0.2, 0.28, len((x - heelX) * 1.1, y * 1.35) * (1 + w(ang)));
      const sole = 1 - smooth(0.3, 0.38, len((x - toeX) * 0.75, y * 1.15) * (1 + w(ang + 1)));
      const waist = x > heelX && x < toeX ? 1 - smooth(0.16, 0.22, Math.abs(y) * (1 + 0.6 * Math.abs((x - (heelX + toeX) / 2) / ((toeX - heelX) / 2)))) : 0;
      return { a: Math.max(heel, sole, waist), depth: 1 - smooth(heelX, toeX, x) };
    };
  }
  const w = wobble(rng, 6, 0.25);
  const beadX = (rng() * 2 - 1) * 0.12;
  const beadR = 0.22 + rng() * 0.14;
  const ran = rng() > 0.32;
  const runTo = ran ? -0.9 + rng() * 0.75 : 0.5;
  const drift = (rng() * 2 - 1) * 0.22;
  const width = 0.06 + rng() * 0.06;
  const forked = ran && rng() < 0.35;
  const forkX = (rng() * 2 - 1) * 0.16;
  const forkTo = runTo * (0.35 + rng() * 0.3);
  const forkW = width * (0.4 + rng() * 0.25);
  const trail = (x, y, fromX, toY, halfW, wob) => {
    if (!(y < 0.5 && y > toY)) return { a: 0, along: -1 };
    const along = (0.5 - y) / (0.5 - toY);
    const cx = fromX + drift * along * along;
    const half = halfW * (1 - 0.6 * along) * (1 + (wob ? w(along * Math.PI * 2) : 0)) + 0.015;
    return { a: 1 - smooth(half - 0.03, half + 0.02, Math.abs(x - cx)), along };
  };
  const footX = beadX + drift;
  return (x, y) => {
    const rBead = len((x - beadX) * 1.2, (y - 0.5) * 0.9);
    const rFoot = len(x - footX, y - runTo);
    const bead = 1 - smooth(beadR, beadR + 0.1, rBead);
    const main = trail(x, y, beadX, runTo, width, true);
    const fork = forked ? trail(x, y, beadX + forkX, forkTo, forkW, false) : { a: 0, along: -1 };
    const foot = ran ? 1 - smooth(0.06, 0.11, rFoot) : 0;
    const a = Math.max(bead, main.a, fork.a, foot);
    const dBead = 1 - smooth(beadR * 0.2, beadR + 0.02, rBead);
    const dFoot = ran ? (1 - smooth(0.02, 0.1, rFoot)) * 0.45 : 0;
    const dRun = main.a > 0 ? 1 - main.along : (fork.a > 0 ? (1 - fork.along) * 0.85 : 0);
    return { a, depth: Math.max(0, Math.min(1, Math.max(dBead, dFoot, dRun))) };
  };
}

/**
 * @returns {{ colors: Uint8ClampedArray, width: number, height: number, cells: Array<{ kind: string, u0: number, v0: number, u1: number, v1: number }> }}
 */
const EMPTY = Object.freeze({ a: 0, depth: 0 });
export function buildBloodAtlas(opts = {}) {
  const b = atlasBuilder(opts);
  while (!b.step());
  return b.atlas;
}

export function atlasBuilder({ size = ATLAS_SIZE, cells = ATLAS_CELLS, seed = 0x5EED, rng = null } = {}) {
  // Steps draw from the generator in the same order however they are scheduled, so the sheet is identical.
  const roll = rng ?? mulberry32(seed);
  const noise = bloodNoise(roll);
  const cell = size / cells;
  const rows = ATLAS_KINDS.length;
  const height = cell * rows;
  const colors = new Uint8ClampedArray(size * height * 4);
  const out = [];
  // A clear border and a one-texel UV inset keep a bilinear sample from reading the neighboring cell.
  const BORDER = 2;
  const atlas = { colors, width: size, height, cells: out };
  let next = 0;
  const total = rows * cells;
  function step() {
    if (next >= total) return true;
    const row = Math.floor(next / cells), col = next % cells;
    next++;
    const kind = ATLAS_KINDS[row];
    {
      const at = shapeAt(kind, roll, noise);
      const gx = roll() * 64, gy = roll() * 64;
      const x0 = col * cell, y0 = row * cell;
      for (let py = 0; py < cell; py++) {
        for (let px = 0; px < cell; px++) {
          const inBorder = px < BORDER || py < BORDER || px >= cell - BORDER || py >= cell - BORDER;
          const x = ((px + 0.5) / cell) * 2 - 1, y = ((py + 0.5) / cell) * 2 - 1;
          const { a, depth } = inBorder ? EMPTY : at(x, y);
          const g = inBorder || !(a > 0) ? 1 : 1 + 0.1 * noise.fbm(x * 7 + gx, y * 7 + gy, 2) + 0.05 * noise.n(x * 23 + gy, y * 23 + gx);
          const o = ((y0 + py) * size + (x0 + px)) * 4;
          const thick = Math.max(0, Math.min(1, depth * g));
          const ink = Math.round(255 * (1 - INK_DEPTH * thick));
          colors[o] = ink; colors[o + 1] = ink; colors[o + 2] = ink;
          colors[o + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
        }
      }
      out.push({
        kind,
        u0: (x0 + 1) / size, v0: (y0 + 1) / height,
        u1: (x0 + cell - 1) / size, v1: (y0 + cell - 1) / height,
      });
    }
    return next >= total;
  }
  return { step, atlas, done: () => next >= total };
}

let _atlas = null;
let _builder = null;
export function bloodAtlas() {
  if (_atlas) return _atlas;
  _builder ??= atlasBuilder();
  while (!_builder.step());
  _atlas = _builder.atlas;
  _builder = null;
  return _atlas;
}
export const BLOOD_PREWARM_WAIT_MS = 250;
export function prewarmBloodAtlas(idle = globalThis.requestIdleCallback) {
  if (_atlas || _builder || typeof idle !== 'function') return false;
  _builder = atlasBuilder();
  const slice = (deadline) => {
    if (_atlas || !_builder) return;
    // A timed-out idle call still takes one cell, so a page that never idles finishes the sheet a cell at a time.
    do { if (_builder.step()) { _atlas = _builder.atlas; _builder = null; return; } }
    while ((deadline?.timeRemaining?.() ?? 0) > 6);
    idle(slice, { timeout: BLOOD_PREWARM_WAIT_MS });
  };
  idle(slice, { timeout: BLOOD_PREWARM_WAIT_MS });
  return true;
}

export const BLOOD_DROP_RECORD = 'drop';
export const DROP_ART_SIZE = 16;
let _droplet = null;
export function bloodDropletArt() {
  if (_droplet) return _droplet;
  const N = DROP_ART_SIZE, colors = new Uint8ClampedArray(N * N * 4);
  const base = BLOOD_BASE.map((c) => c * 255);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = ((px + 0.5) / N) * 2 - 1, y = ((py + 0.5) / N) * 2 - 1;
      const bead = Math.sqrt(x * x / 0.36 + (y - 0.22) * (y - 0.22) / 0.42);
      const tail = y < 0.22 ? Math.abs(x) / Math.max(0.001, 0.6 * (y + 0.85) / 1.07) : 99;
      const inside = bead <= 1 || (tail <= 1 && y > -0.85);
      const o = (py * N + px) * 4;
      if (!inside) continue;
      const rim = Math.min(1, bead);
      const shade = 1.15 - 0.55 * rim * rim;
      const glint = Math.max(0, 1 - Math.hypot(x + 0.22, y - 0.02) / 0.2);
      for (let c = 0; c < 3; c++) colors[o + c] = Math.round(Math.min(255, base[c] * shade + glint * [150, 95, 85][c]));
      colors[o + 3] = 255;
    }
  }
  return (_droplet = { colors, width: N, height: N });
}

export function pickCell(atlas, kind, rng = Math.random) {
  const of = atlas.cells.filter((c) => c.kind === kind);
  if (!of.length) return atlas.cells[0] ?? null;
  const c = of[Math.min(of.length - 1, Math.floor(rng() * of.length))];
  // A horizontal mirror keeps drips running downward. It returns a new object because every mark shares the
  // atlas cells.
  return rng() < 0.5 ? { ...c, u0: c.u1, u1: c.u0 } : c;
}

export function bloodMarkKind({ pool = false, wall = false, print = false, stretch = 1 } = {}) {
  if (pool) return 'pool';
  if (wall) return 'drip';
  if (print) return 'print';
  return stretch > 1.5 ? 'streak' : 'spatter';
}

// The decal shaders in renderer.js and enhancedLighting.js inline these constants; filmColour mirrors their law.
export const BLOOD_ABSORB = Object.freeze([0.50, 0.95, 0.95]);
export const DISPLAY_GAMMA = 2.2;
// The classic decal shader works in display space, so its exponent is divided by the display gamma.
export const BLOOD_ABSORB_ENCODED = Object.freeze(BLOOD_ABSORB.map((a) => a / DISPLAY_GAMMA));
// The sheet stores 1 - INK_DEPTH * thickness and the shaders invert it, so one ramp serves every shape.
export const INK_DEPTH = 0.18;
export const WET_DARKEN = 0.72;
export const BLOOD_F0 = 0.02;
export const WET_THICK_LO = 0.15;
export const WET_THICK_HI = 0.75;
export const BLOOD_MENISCUS = 0.85;

export function filmColour(tint, thick) {
  const d = 1 - Math.max(0, Math.min(1, thick));
  return [0, 1, 2].map((i) => (tint?.[i] ?? 0) * Math.exp(BLOOD_ABSORB[i] * d));
}

/**
 * @param {number} alpha
 * @param {number} ink
 */
export const filmThickness = (alpha, ink) =>
  Math.max(0, Math.min(1, alpha)) * Math.max(0, Math.min(1, (1 - Math.max(0, Math.min(1, ink))) / INK_DEPTH));

export function wetGate(wet, thick) {
  if (!(wet > 0)) return 0;
  const t = Math.max(0, Math.min(1, thick));
  const x = Math.max(0, Math.min(1, (t - WET_THICK_LO) / Math.max(1e-6, WET_THICK_HI - WET_THICK_LO)));
  return Math.max(0, Math.min(1, wet)) * (x * x * (3 - 2 * x));
}

// Schlick for a specular lobe takes the view and half-vector cosine, not the view and normal one.
export function wetFresnel(vdoth) {
  return BLOOD_F0 + (1 - BLOOD_F0) * Math.pow(1 - Math.max(0, Math.min(1, vdoth)), 5);
}

export const wetSheen = (wet, thick, vdoth) => wetGate(wet, thick) * wetFresnel(vdoth);

export const wetAlbedo = (wet) => 1 - (1 - WET_DARKEN) * Math.max(0, Math.min(1, wet));

export function freshTint(rng = Math.random) {
  const k = 1 - rng() * FRESH_VARIANCE;
  return [BLOOD_BASE[0] * k, BLOOD_BASE[1] * k, BLOOD_BASE[2] * k, 1];
}

export function freshShade(fresh) {
  const k = BLOOD_BASE[0] > 0 ? (fresh?.[0] ?? BLOOD_BASE[0]) / BLOOD_BASE[0] : 1;
  return k >= 1 - FRESH_VARIANCE - 1e-9 && k <= 1 + 1e-9 ? k : 1;
}

export const WET_POWER = 2;
export function wetAt(stage) {
  const t = Math.max(0, Math.min(1, (Number.isFinite(stage) ? stage : 0) / DRY_STAGES));
  return Math.pow(1 - t, WET_POWER);
}

export function dryStage(age) {
  if (!(age > 0)) return 0;
  return Math.min(DRY_STAGES, Math.floor((age / DRY_TIME) * DRY_STAGES));
}

export function driedTint(fresh, stage) {
  const t = Math.max(0, Math.min(1, stage / DRY_STAGES));
  const k = freshShade(fresh);
  const end = [DRIED_TINT[0] * k, DRIED_TINT[1] * k, DRIED_TINT[2] * k];
  if (t >= 1) return [end[0], end[1], end[2], fresh[3] ?? 1];
  return [
    fresh[0] + (end[0] - fresh[0]) * t,
    fresh[1] + (end[1] - fresh[1]) * t,
    fresh[2] + (end[2] - fresh[2]) * t,
    fresh[3] ?? 1,
  ];
}
