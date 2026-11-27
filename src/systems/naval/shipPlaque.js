// @ts-check
import { FNT_ASCII_START, FNT_GLYPH_DIM, FNT_GLYPH_SPACING } from '../../formats/fntFile.js';
import { toColor32 } from '../../formats/color32Order.js';

// A pseudo-archive for plaque textures made in the session; no data file uses this number.
export const PLAQUE_ARCHIVE = 38193;
export const PLAQUE_STANDOFF = 0.03;
export const PLAQUE_LETTER = 0.012;
export const PLAQUE_LETTER_MIN = 0.22;
export const PLAQUE_LETTER_MAX = 0.6;
export const PLAQUE_BREADTH = 0.45;
export const PLAQUE_AFT_SHARE = 0.55;
export const PLAQUE_SCALE = 3;
export const PLAQUE_PAD = 9;
export const PLAQUE_FRAME = 3;
export const PLAQUE_STEP = 0.25;
export const PLAQUE_ROWS = 3;
export const PLAQUE_IDLE_DRAWS = 1800;

// Fallback lettering for when the FONT0003 file is missing: 5 by 7 capitals, digits, and name marks.
const BLOCK = Object.freeze({
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '####.|....#|....#|.###.|....#|....#|####.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|....#|.###.', "'": '..#..|..#..|.#...|.....|.....|.....|.....', '-': '.....|.....|.....|.###.|.....|.....|.....',
  '.': '.....|.....|.....|.....|.....|.##..|.##..', ',': '.....|.....|.....|.....|.##..|..#..|.#...', '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#', ':': '.....|.##..|.##..|.....|.##..|.##..|.....',
});
export const BLOCK_LETTERS = Object.freeze({
  height: 7, space: 3,
  widthOf: (code) => (BLOCK[String.fromCharCode(code).toUpperCase()] ? 5 : 0),
  lit: (code, x, y) => BLOCK[String.fromCharCode(code).toUpperCase()]?.split('|')[y]?.[x] === '#',
});
export function fntLetters(fnt) {
  const glyph = new Map();
  const at = (code) => {
    const i = code - FNT_ASCII_START;
    if (!glyph.has(i)) glyph.set(i, fnt.getGlyphPixels(i, 1));
    return glyph.get(i);
  };
  return Object.freeze({
    height: fnt.fixedHeight, space: Math.max(1, fnt.fixedWidth - 1),
    widthOf: (code) => (at(code) ? fnt.glyphWidth(code - FNT_ASCII_START) : 0),
    lit: (code, x, y) => (at(code)?.[y * FNT_GLYPH_DIM + x] ?? 0) !== 0,
  });
}
export function nameWidth(name, letters) {
  let w = 0;
  for (const ch of name) { const c = ch.charCodeAt(0); w += (c === 32 ? letters.space : letters.widthOf(c)) + FNT_GLYPH_SPACING; }
  return Math.max(0, w - FNT_GLYPH_SPACING);
}

const WOOD = [58, 36, 20], WOOD_DARK = [40, 24, 13], FRAME = [96, 64, 32], FRAME_DARK = [28, 17, 9];
const GILT = [214, 168, 70], GILT_HI = [246, 214, 128], CUT = [22, 13, 6];
const grain = (x, y) => { let h = Math.imul((x * 73856093) ^ (y * 19349663), 0x9e3779b1) >>> 0; h ^= h >>> 15; return (h & 255) / 255; };
/**
 * @param {string} name
 * @param {{ height: number, space: number, widthOf: (c: number) => number, lit: (c: number, x: number, y: number) => boolean }} letters
 */
export function paintPlaque(name, letters) {
  const text = typeof name === 'string' ? name.trim() : '';
  const tw = text ? nameWidth(text, letters) : 0;
  if (!tw) return null;
  const S = PLAQUE_SCALE, P = PLAQUE_PAD;
  const width = tw * S + 2 * P, height = letters.height * S + 2 * P;
  const data = new Uint8Array(width * height * 4);
  const put = (x, y, c) => { const i = (y * width + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const f = PLAQUE_FRAME, edge = Math.min(x, y, width - 1 - x, height - 1 - y);
    if (edge < f) { put(x, y, edge === 0 || x === width - 1 - edge || y === height - 1 - edge ? FRAME_DARK : FRAME); continue; }
    const g = grain(x >> 1, y) * 0.5 + grain(x >> 3, y >> 1) * 0.5;
    put(x, y, WOOD.map((v, k) => Math.round(WOOD_DARK[k] + (v - WOOD_DARK[k]) * (0.55 + 0.45 * g))));
  }
  let pen = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    const w = c === 32 ? letters.space : letters.widthOf(c);
    for (let gy = 0; gy < letters.height; gy++) for (let gx = 0; gx < w; gx++) {
      if (c === 32 || !letters.lit(c, gx, gy)) continue;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const x = P + (pen + gx) * S + sx, y = P + gy * S + sy;
        if (x + 1 < width && y + 1 < height) put(x + 1, y + 1, CUT);
        put(x, y, sy === 0 || sx === 0 ? GILT_HI : GILT);
      }
    }
    pen += w + FNT_GLYPH_SPACING;
  }
  return { width, height, data };
}

export const PLAQUE_GRID_M = 0.25;
const _grids = new WeakMap();
const gridKey = (y, z) => Math.floor(y / PLAQUE_GRID_M) * 65536 + Math.floor(z / PLAQUE_GRID_M);
// A ray along x can only hit triangles whose (y, z) box covers its cell, so it tests that cell alone.
function gridOf(m) {
  let g = _grids.get(m);
  if (g) return g;
  g = new Map();
  const p = m.positions, ix = m.indices;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const y0 = Math.floor(Math.min(p[a + 1], p[b + 1], p[c + 1]) / PLAQUE_GRID_M), y1 = Math.floor(Math.max(p[a + 1], p[b + 1], p[c + 1]) / PLAQUE_GRID_M);
    const z0 = Math.floor(Math.min(p[a + 2], p[b + 2], p[c + 2]) / PLAQUE_GRID_M), z1 = Math.floor(Math.max(p[a + 2], p[b + 2], p[c + 2]) / PLAQUE_GRID_M);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const k = y * 65536 + z; const cell = g.get(k); if (cell) cell.push(i); else g.set(k, [i]); }
  }
  _grids.set(m, g);
  return g;
}
const NO_TRIANGLES = Object.freeze([]);
function rayHit(m, o, d) {
  const p = m.positions, ix = m.indices;
  const along = d[1] === 0 && d[2] === 0;
  const tris = along ? gridOf(m).get(gridKey(o[1], o[2])) ?? NO_TRIANGLES : null;
  const n = along ? tris.length : ix.length / 3;
  let best = null;
  for (let q = 0; q < n; q++) {
    const i = along ? tris[q] : q * 3;
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det, sx = o[0] - p[a], sy = o[1] - p[a + 1], sz = o[2] - p[a + 2];
    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
    if (v < 0 || u + v > 1) continue;
    const t = f * (e2x * qx + e2y * qy + e2z * qz);
    if (t > 1e-6 && (!best || t < best.t)) {
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, l = Math.hypot(nx, ny, nz) || 1;
      best = { t, n: [nx / l, ny / l, nz / l] };
    }
  }
  return best;
}
function sideAt(m, build, side, y, z) {
  const reach = build.halfWidth + 6;
  const h = rayHit(m, [side * reach, y, z], [-side, 0, 0]);
  if (!h) return null;
  const n = h.n[0] * side < 0 ? h.n.map((v) => -v) : h.n;
  return { p: [side * (reach - h.t), y, z], n };
}
export function plankingOf(surface, build, side = 1) {
  const L = build.bowZ - build.aftZ, z0 = build.aftZ + PLAQUE_AFT_SHARE * L;
  const top = Math.max(0.6, build.deck);
  const count = new Map();
  for (let z = z0; z <= build.bowZ; z += L / 24) {
    for (let y = 0.15; y <= top; y += top / 10) {
      let best = null;
      surface.forEach((m, i) => { const h = rayHit(m, [side * (build.halfWidth + 6), y, z], [-side, 0, 0]); if (h && (!best || h.t < best.t)) best = { t: h.t, i }; });
      if (best) count.set(best.i, (count.get(best.i) ?? 0) + 1);
    }
  }
  let at = -1, most = 0;
  for (const [i, n] of count) if (n > most) { most = n; at = i; }
  return at;
}
export function railOf(m, build, side, z, dy) {
  let top = -Infinity, miss = null;
  for (let y = 0.15; y <= build.deck + 4; y += 4 * dy) {
    if (sideAt(m, build, side, y, z)) { top = y; miss = null; } else if (top > -Infinity && miss == null) miss = y;
  }
  if (top === -Infinity) return top;
  let hi = miss ?? top + 4 * dy;
  while (hi - top > dy) { const mid = (top + hi) / 2; if (sideAt(m, build, side, mid, z)) top = mid; else hi = mid; }
  return top;
}
export const letterOf = (build) => Math.min(PLAQUE_LETTER_MAX, Math.max(PLAQUE_LETTER_MIN, PLAQUE_LETTER * (build.bowZ - build.aftZ)));

export function bowStation(m, build, side) {
  if (!m) return null;
  const L = build.bowZ - build.aftZ, zAftMost = build.aftZ + PLAQUE_AFT_SHARE * L;
  const letter = letterOf(build);
  const dy = Math.max(0.04, letter / 4);
  for (let z = build.bowZ; z >= zAftMost; z -= Math.max(0.1, L / 200)) {
    const rail = railOf(m, build, side, z, dy);
    if (!Number.isFinite(rail)) continue;
    const at = sideAt(m, build, side, rail - letter, z);
    if (at && Math.abs(at.p[0]) >= PLAQUE_BREADTH * build.halfWidth) return { zFore: z, letter, dy };
  }
  return null;
}

/**
 * @param {{ positions: ArrayLike<number>, indices: ArrayLike<number> }} m
 * @param {{ deck: number, bowZ: number, aftZ: number, halfWidth: number }} build
 * @param {{ zFore: number, letter: number, dy: number } | null} station
 */
export function plaqueOnBow(m, build, side, aspect, letterShare, station = bowStation(m, build, side)) {
  if (!m || !station || !(aspect > 0) || !(letterShare > 0 && letterShare <= 1)) return null;
  const { zFore, letter, dy } = station;
  const zAftMost = build.aftZ + PLAQUE_AFT_SHARE * (build.bowZ - build.aftZ);
  let height = letter / letterShare, length = height * aspect;
  const room = zFore - zAftMost;
  if (length > room) { length = room; height = length / aspect; }
  if (!(height > 0.05)) return null;
  const zAft = zFore - length;
  const cols = Math.max(4, Math.ceil(length / PLAQUE_STEP));
  let rail = Infinity;
  for (let k = 0; k <= cols; k++) rail = Math.min(rail, railOf(m, build, side, zFore - (k / cols) * length, dy));
  const yTop = rail - 0.1 * letter, yBottom = yTop - height;
  if (!Number.isFinite(yTop) || yBottom < 0.15) return null;
  const positions = [], normals = [], uvs = [], indices = [];
  for (let k = 0; k <= cols; k++) {
    const z = zFore - (k / cols) * length;
    for (let j = 0; j < PLAQUE_ROWS; j++) {
      const y = yTop - (j / (PLAQUE_ROWS - 1)) * height;
      const at = sideAt(m, build, side, y, z);
      if (!at) return null;
      positions.push(at.p[0] + at.n[0] * PLAQUE_STANDOFF, at.p[1] + at.n[1] * PLAQUE_STANDOFF, at.p[2] + at.n[2] * PLAQUE_STANDOFF);
      normals.push(...at.n);
      // The world is drawn left-handed, so the starboard board reads aft to bow and the port board bow to aft.
      uvs.push(side > 0 ? 1 - k / cols : k / cols, 1 - j / (PLAQUE_ROWS - 1));
    }
  }
  const out = [side, 0, 0];
  const vtx = (k, j) => k * PLAQUE_ROWS + j;
  // Each triangle winds counter-clockwise about the outward side, the renderer's front face.
  const tri = (a, b, c) => {
    const pa = a * 3, pb = b * 3, pc = c * 3;
    const ux = positions[pb] - positions[pa], uy = positions[pb + 1] - positions[pa + 1], uz = positions[pb + 2] - positions[pa + 2];
    const vx = positions[pc] - positions[pa], vy = positions[pc + 1] - positions[pa + 1], vz = positions[pc + 2] - positions[pa + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) indices.push(a, b, c); else indices.push(a, c, b);
  };
  for (let k = 0; k < cols; k++) for (let j = 0; j < PLAQUE_ROWS - 1; j++) { tri(vtx(k, j), vtx(k + 1, j), vtx(k + 1, j + 1)); tri(vtx(k, j), vtx(k + 1, j + 1), vtx(k, j + 1)); }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices), length, height };
}

/** @param {{ renderer: any, surfaceOf: (hull: number) => any[] | null, buildOf: (hull: number) => any, letters: () => any }} deps */
export function createShipPlaques(deps) {
  const planks = new Map();
  const stations = new Map();
  const records = new Map();
  const boards = new Map();
  let next = 0, draws = 0;
  const plankOf = (hull) => {
    if (planks.has(hull)) return planks.get(hull);
    const surface = deps.surfaceOf(hull);
    const build = deps.buildOf(hull);
    const i = surface && build ? plankingOf(surface, build) : -1;
    const m = i >= 0 ? surface[i] : null;
    planks.set(hull, m);
    return m;
  };
  function pictureOf(name) {
    if (records.has(name)) return records.get(name);
    const letters = deps.letters();
    if (!letters) return null;
    const pic = paintPlaque(name, letters);
    if (!pic) { records.set(name, null); return null; }
    const rec = next++;
    deps.renderer.uploadTexture(PLAQUE_ARCHIVE, rec, toColor32(pic), { opaque: true });
    const r = { rec, aspect: pic.width / pic.height, letterShare: (letters.height * PLAQUE_SCALE) / pic.height };
    records.set(name, r);
    return r;
  }
  // The pool calls prime at preload, so the costly planking and bow reads never run inside its draw.
  function prime(hull) {
    const m = plankOf(hull), build = deps.buildOf(hull);
    for (const side of [1, -1]) { const sk = `${hull}|${side}`; if (!stations.has(sk)) stations.set(sk, m && build ? bowStation(m, build, side) : null); }
  }
  return {
    prime,
    meshesFor(boat, name) {
      if (!name || !deps.renderer?.createMesh || !deps.renderer?.uploadTexture) return [];
      const key = `${boat.hull}|${name}`;
      const had = boards.get(key);
      if (had) { had.seen = draws; return had.meshes; }
      const pic = pictureOf(name);
      if (!pic) return [];
      const m = plankOf(boat.hull), build = deps.buildOf(boat.hull);
      const meshes = [];
      for (const side of [1, -1]) {
        const sk = `${boat.hull}|${side}`;
        if (!stations.has(sk)) stations.set(sk, m && build ? bowStation(m, build, side) : null);
        const g = m && build ? plaqueOnBow(m, build, side, pic.aspect, pic.letterShare, stations.get(sk)) : null;
        if (g) meshes.push(deps.renderer.createMesh({ ...g, subMeshes: [{ textureArchive: PLAQUE_ARCHIVE, textureRecord: pic.rec, startIndex: 0, primitiveCount: g.indices.length / 3 }] }));
      }
      boards.set(key, { meshes, seen: draws, name });
      return meshes;
    },
    sweep() {
      draws++;
      for (const [key, b] of boards) if (draws - b.seen > PLAQUE_IDLE_DRAWS) { for (const m of b.meshes) deps.renderer.destroyMesh?.(m); boards.delete(key); }
      if (draws % 120 !== 0) return;
      const used = new Set([...boards.values()].map((b) => b.name));
      for (const [name, r] of records) if (!used.has(name)) { if (r) deps.renderer.releaseTexture?.(PLAQUE_ARCHIVE, r.rec); records.delete(name); }
    },
    _boards: boards,
  };
}
