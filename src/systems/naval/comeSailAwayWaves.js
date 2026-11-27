// @ts-check
import { recalculateNormals } from '../../world/skinnedBake.js';

const f = Math.fround;

export const WAVE_ARCHIVE = 112395;
export const WAVE_RECORD = 2;
export const WAVE_FRAME_LIMIT = 99;
export const WAVE_FRAME_COUNT = 32;
export const LAND_MARGIN = 1;
export const WATER_HEIGHT_MAP_VALUE = 2;
export const WOD_WATER_HEIGHT_MAP_VALUE = 6;
export const WAVE_LIFT = f(0.1);
export const WAVE_SCALE = f(819.2);
const HALF = f(409.6);
const QUARTER = f(204.8);
const THREE_QUARTERS = f(614.4);
const RAY_RISE = 500;
const RAY_REACH = 1000;
const DOWN = Object.freeze([0, -1, 0]);

export const WAVE_MATERIAL = Object.freeze({
  tile: Object.freeze([10, 10]),
  color: Object.freeze([0.5, 0.75, 1, 1]),
  cutoff: 0.5,
  ditherStart: 0.5,
  ditherEnd: 1,
});
export const BAYER_8X8 = Object.freeze([
  3, 192, 50, 239, 16, 204, 63, 251,
  129, 66, 177, 114, 141, 78, 188, 126,
  34, 224, 20, 208, 47, 235, 30, 220,
  161, 98, 145, 82, 173, 110, 157, 94,
  12, 200, 59, 247, 8, 196, 55, 243,
  137, 75, 184, 122, 133, 71, 180, 118,
  43, 231, 27, 216, 39, 228, 24, 212,
  169, 106, 153, 90, 165, 102, 149, 86,
]);

// The mod's frames have no mipmaps; this chain of texel means keeps distant breakers from flickering.
/**
 * @param {number} width
 * @param {number} height
 * @param {number} channels
 * @param {ArrayLike<number>} data
 * @returns {{ width: number, height: number, data: Uint8Array }[]}
 */
export function boxLevels(width, height, channels, data) {
  const bytes = (v) => { const o = new Uint8Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] + 0.5; return o; };
  const levels = [{ width, height, data: data instanceof Uint8Array ? data.slice() : Uint8Array.from(data) }];
  /** @type {{ data: Uint8Array | Float32Array, w: number, h: number }[]} */
  const exact = [{ data: levels[0].data, w: width, h: height }];
  for (let L = 1; (width >> (L - 1)) > 1 || (height >> (L - 1)) > 1; L++) {
    const w = Math.max(1, width >> L), h = Math.max(1, height >> L);
    const out = new Float32Array(w * h * channels);
    if (w << L === width && h << L === height && exact.length === L) {
      const src = exact[L - 1].data, row = 2 * w * channels;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = 2 * y * row + 2 * x * channels, b = a + row, o = (y * w + x) * channels;
          for (let c = 0; c < channels; c++) out[o + c] = (src[a + c] + src[a + channels + c] + src[b + c] + src[b + channels + c]) * 0.25;
        }
      }
      exact.push({ data: out, w, h });
    } else {
      const to = (c, size, n) => Math.floor(((c + 0.5) * n) / size);
      const whole = (E) => {
        const span = 1 << E, e = exact[E];
        for (let i = 0; i < e.w; i++) if (to(i * span, width, w) !== to((i + 1) * span - 1, width, w)) return false;
        for (let i = 0; i < e.h; i++) if (to(i * span, height, h) !== to((i + 1) * span - 1, height, h)) return false;
        return true;
      };
      let E = exact.length - 1;
      while (E > 0 && !whole(E)) E--;
      const { data: src, w: ew, h: eh } = exact[E], span = 1 << E;
      const mx = new Int32Array(ew), n = new Uint32Array(w * h);
      for (let x = 0; x < ew; x++) mx[x] = to(x * span, width, w);
      for (let y = 0; y < eh; y++) {
        const base = to(y * span, height, h) * w;
        let s = y * ew * channels;
        for (let x = 0; x < ew; x++, s += channels) {
          const t = base + mx[x], o = t * channels;
          n[t]++;
          for (let c = 0; c < channels; c++) out[o + c] += src[s + c];
        }
      }
      for (let t = 0; t < w * h; t++) for (let c = 0; c < channels; c++) out[t * channels + c] /= n[t];
    }
    levels.push({ width: w, height: h, data: bytes(out) });
  }
  return levels;
}

/**
 * @param {{ width: number, height: number, data: Uint8Array }} paint
 * @param {ArrayLike<number>} snowMean
 * @param {string} [key]
 * @returns {{ width: number, height: number, data: Uint8Array }[]}
 */
export function wavePaintLevels(paint, snowMean, key = 'ff00ffff') {
  const k = [0, 2, 4, 6].map((i) => parseInt(key.slice(i, i + 2), 16));
  const n = paint.width * paint.height, frame = new Uint8Array(n * 4), d = paint.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (d[o] === k[0] && d[o + 1] === k[1] && d[o + 2] === k[2] && d[o + 3] === k[3]) {
      frame[o] = snowMean[0]; frame[o + 1] = snowMean[1]; frame[o + 2] = snowMean[2]; frame[o + 3] = 255;
      continue;
    }
    const a = d[o + 3];
    frame[o] = Math.round((d[o] * a) / 255); frame[o + 1] = Math.round((d[o + 1] * a) / 255); frame[o + 2] = Math.round((d[o + 2] * a) / 255); frame[o + 3] = a;
  }
  const levels = boxLevels(paint.width, paint.height, 4, frame);
  levels[0] = { width: paint.width, height: paint.height, data: d };
  return levels;
}

export function wavePictureMean(pic) {
  const sum = [0, 0, 0], n = pic.width * pic.height;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) sum[c] += pic.data[i * 4 + c];
  return sum.map((v) => Math.round(v / n));
}

// The integer division matches the mod's `Speed / 100`.
export const waveFrameTimeOf = (speed) => f(f(2 - Math.trunc(Number(speed) / 100)) * f(0.125));
export function waveDitherOf(length, fade) {
  const waveLength = f(f(length) * f(0.5));
  return { start: f(f(fade) * waveLength), end: waveLength };
}
export const isDayHour = (hour) => hour >= 6 && hour < 18;

export function stepWaveFrame(index, timer, frameTime, dt, count, day) {
  if (timer < frameTime) return { index, timer: f(timer + dt), changed: false };
  let i = index;
  if (day) i = i < count - 1 ? i + 1 : 0;
  else i = i > 0 ? i - 1 : count - 1;
  return { index: i, timer: 0, changed: true };
}

// The absolute coordinates from the mod hold because the floating origin keeps the player pixel corner at x = z = 0.
export function buildWaveMesh({ heightMapValue, raycast, mapPixel, worldCompensation, waveDistance, waterLevel, wodTerrain = false }) {
  const wcy = f(worldCompensation[1]);
  const position = [HALF, f(f(f(waterLevel) + WAVE_LIFT) + wcy), HALF];
  const currentMapPixel = mapPixel;
  let num = WATER_HEIGHT_MAP_VALUE;
  const num2 = Math.trunc(waterLevel) + LAND_MARGIN;
  if (wodTerrain) num = WOD_WATER_HEIGHT_MAP_VALUE;
  const landAbove = f(wcy + num2);
  // Any collider counts, so a boat's deck reads as land, as in the mod.
  const hitsLand = (origin) => {
    const hit = raycast(origin, DOWN, RAY_REACH);
    return !!hit && f(hit.point[1]) > landAbove;
  };
  /** @type {Array<[number, number]>} */
  const list = [];
  for (let i = -waveDistance; i < waveDistance + 1; i++) {
    for (let j = -waveDistance; j < waveDistance + 1; j++) {
      if (heightMapValue(currentMapPixel.X + i, currentMapPixel.Y + j) > num) continue;
      const vx = f(f(819.2) * i), vz = f(f(819.2) * -j);
      const top = f(wcy + RAY_RISE);
      let flag = true;
      if (hitsLand([f(QUARTER + vx), top, f(QUARTER + vz)])) flag = false;
      if (hitsLand([f(THREE_QUARTERS + vx), top, f(QUARTER + vz)])) flag = false;
      if (hitsLand([f(QUARTER + vx), top, f(THREE_QUARTERS + vz)])) flag = false;
      if (hitsLand([f(THREE_QUARTERS + vx), top, f(THREE_QUARTERS + vz)])) flag = false;
      if (flag) list.push([currentMapPixel.X + i, currentMapPixel.Y + j]);
    }
  }
  // As in the mod, an empty list returns before the loop, so the last neighbors stay in use.
  if (list.length <= 0) return { position, neighbors: undefined, mesh: null };
  /** @type {number[][]} */
  const list2 = [];
  /** @type {number[]} */
  const list3 = [];
  /** @type {number[][]} */
  const list4 = [];
  /** @type {boolean[][] | undefined} */
  let currentNeighbors;
  for (const item of list) {
    const val8 = [f(item[0] - currentMapPixel.X), f(currentMapPixel.Y - item[1])];
    const piece = (count, verts, uvs, tris) => {
      for (const [x, z] of verts) list2.push([f(val8[0] + f(x)), f(val8[1] + f(z))]);
      for (const [u, v] of uvs) list4.push([f(u), f(v)]);
      for (const t of tris) list3.push(count + t);
    };
    const array = [[false, false, false], [false, false, false], [false, false, false]];
    for (let k = -1; k < 2; k++) {
      for (let l = -1; l < 2; l++) {
        if (heightMapValue(item[0] + k, item[1] + l) > num) {
          array[k + 1][l + 1] = true;
        } else {
          const cx = f(f(HALF + f(val8[0] * f(819.2))) + f(f(k) * f(819.2)));
          const cz = f(f(HALF + f(val8[1] * f(819.2))) + f(f(-l) * f(819.2)));
          // These rays rise from 500 over the world origin, not the compensated height, as in the mod.
          if (hitsLand([f(cx - QUARTER), RAY_RISE, f(cz - QUARTER)])) array[k + 1][l + 1] = true;
          if (hitsLand([f(cx + QUARTER), RAY_RISE, f(cz - QUARTER)])) array[k + 1][l + 1] = true;
          if (hitsLand([f(cx - QUARTER), RAY_RISE, f(cz + QUARTER)])) array[k + 1][l + 1] = true;
          if (hitsLand([f(cx + QUARTER), RAY_RISE, f(cz + QUARTER)])) array[k + 1][l + 1] = true;
        }
        // This is each water pixel's own middle, so the last water pixel's neighbors win, as in the mod.
        if (k === 0 && l === 0) currentNeighbors = array;
      }
    }
    if (array[1][0]) {
      let count = list2.length;
      piece(count, [[0.25, 0.25], [-0.25, 0.25], [-0.5, 0.5], [0, 1], [0.5, 0.5]], [[0.25, 1], [0.75, 1], [1, 0.75], [0.5, 0.25], [0, 0.75]], [0, 1, 4, 1, 2, 4, 2, 3, 4]);
      if (array[0][0]) {
        if (array[0][1]) {
          count = list2.length;
          piece(count, [[-0.5, 0.5], [-1, 1], [0, 1]], [[1, 0.75], [1.5, 0.25], [0.5, 0.25]], [0, 1, 2]);
        } else {
          count = list2.length;
          piece(count, [[-0.5, 0.5], [-0.5, 1], [0, 1]], [[1, 0.75], [1, 0.25], [0.5, 0.25]], [0, 1, 2]);
          count = list2.length;
          piece(count, [[-0.25, 0.25], [-0.5, 0.25], [-0.5, 0.5]], [[0.75, 1], [1, 1], [1, 0.75]], [0, 1, 2]);
        }
      } else if (!array[0][1]) {
        count = list2.length;
        piece(count, [[-0.25, 0.25], [-0.75, 0.25], [-0.5, 0.5]], [[0.75, 1], [1.25, 1], [1, 0.75]], [0, 1, 2]);
      }
      if (array[2][0]) {
        if (array[2][1]) {
          count = list2.length;
          piece(count, [[0.5, 0.5], [0, 1], [1, 1]], [[0, 0.75], [0.5, 0.25], [-0.5, 0.25]], [0, 1, 2]);
        } else {
          count = list2.length;
          piece(count, [[0.5, 0.5], [0, 1], [0.5, 1]], [[0, 0.75], [0.5, 0.25], [0, 0.25]], [0, 1, 2]);
          count = list2.length;
          piece(count, [[0.5, 0.25], [0.25, 0.25], [0.5, 0.5]], [[0, 1], [0.25, 1], [0, 0.75]], [0, 1, 2]);
        }
      } else if (!array[2][1]) {
        count = list2.length;
        piece(count, [[0.75, 0.25], [0.25, 0.25], [0.5, 0.5]], [[-0.25, 1], [0.25, 1], [0, 0.75]], [0, 1, 2]);
      }
    }
    if (array[0][1]) {
      let count2 = list2.length;
      piece(count2, [[-0.25, 0.25], [-0.25, -0.25], [-0.5, -0.5], [-1, 0], [-0.5, 0.5]], [[0.25, 1], [0.75, 1], [1, 0.75], [0.5, 0.25], [0, 0.75]], [0, 1, 4, 1, 2, 4, 2, 3, 4]);
      if (array[0][2]) {
        if (array[1][2]) {
          count2 = list2.length;
          piece(count2, [[-0.5, -0.5], [-1, -1], [-1, 0]], [[1, 0.75], [1.5, 0.25], [0.5, 0.25]], [0, 1, 2]);
        } else {
          count2 = list2.length;
          piece(count2, [[-0.5, -0.5], [-1, -0.5], [-1, 0]], [[1, 0.75], [1, 0.25], [0.5, 0.25]], [0, 1, 2]);
          count2 = list2.length;
          piece(count2, [[-0.25, -0.25], [-0.25, -0.5], [-0.5, -0.5]], [[0.75, 1], [1, 1], [1, 0.75]], [0, 1, 2]);
        }
      } else if (!array[1][2]) {
        count2 = list2.length;
        piece(count2, [[-0.25, -0.25], [-0.25, -0.75], [-0.5, -0.5]], [[0.75, 1], [1.25, 1], [1, 0.75]], [0, 1, 2]);
      }
      if (array[0][0]) {
        if (array[1][0]) {
          count2 = list2.length;
          piece(count2, [[-0.5, 0.5], [-1, 0], [-1, 1]], [[0, 0.75], [0.5, 0.25], [-0.5, 0.25]], [0, 1, 2]);
        } else {
          count2 = list2.length;
          piece(count2, [[-0.5, 0.5], [-1, 0], [-1, 0.5]], [[0, 0.75], [0.5, 0.25], [0, 0.25]], [0, 1, 2]);
          count2 = list2.length;
          piece(count2, [[-0.25, 0.5], [-0.25, 0.25], [-0.5, 0.5]], [[0, 1], [0.25, 1], [0, 0.75]], [0, 1, 2]);
        }
      } else if (!array[1][0]) {
        count2 = list2.length;
        piece(count2, [[-0.25, 0.75], [-0.25, 0.25], [-0.5, 0.5]], [[-0.25, 1], [0.25, 1], [0, 0.75]], [0, 1, 2]);
      }
    }
    if (array[1][2]) {
      let count3 = list2.length;
      piece(count3, [[-0.25, -0.25], [0.25, -0.25], [0.5, -0.5], [0, -1], [-0.5, -0.5]], [[0.25, 1], [0.75, 1], [1, 0.75], [0.5, 0.25], [0, 0.75]], [0, 1, 4, 1, 2, 4, 2, 3, 4]);
      if (array[2][2]) {
        if (array[2][1]) {
          count3 = list2.length;
          piece(count3, [[0.5, -0.5], [1, -1], [0, -1]], [[1, 0.75], [1.5, 0.25], [0.5, 0.25]], [0, 1, 2]);
        } else {
          count3 = list2.length;
          piece(count3, [[0.5, -0.5], [0.5, -1], [0, -1]], [[1, 0.75], [1, 0.25], [0.5, 0.25]], [0, 1, 2]);
          count3 = list2.length;
          piece(count3, [[0.25, -0.25], [0.5, -0.25], [0.5, -0.5]], [[0.75, 1], [1, 1], [1, 0.75]], [0, 1, 2]);
        }
      } else if (!array[2][1]) {
        count3 = list2.length;
        piece(count3, [[0.25, -0.25], [0.75, -0.25], [0.5, -0.5]], [[0.75, 1], [1.25, 1], [1, 0.75]], [0, 1, 2]);
      }
      if (array[0][2]) {
        if (array[0][1]) {
          count3 = list2.length;
          piece(count3, [[-0.5, -0.5], [0, -1], [-1, -1]], [[0, 0.75], [0.5, 0.25], [-0.5, 0.25]], [0, 1, 2]);
        } else {
          count3 = list2.length;
          piece(count3, [[-0.5, -0.5], [0, -1], [-0.5, -1]], [[0, 0.75], [0.5, 0.25], [0, 0.25]], [0, 1, 2]);
          count3 = list2.length;
          piece(count3, [[-0.5, -0.25], [0.25, -0.25], [-0.5, -0.5]], [[0, 1], [0.25, 1], [0, 0.75]], [0, 1, 2]);
        }
      } else if (!array[0][1]) {
        count3 = list2.length;
        piece(count3, [[-0.75, -0.25], [0.25, -0.25], [-0.5, -0.5]], [[-0.25, 1], [0.25, 1], [0, 0.75]], [0, 1, 2]);
      }
    }
    if (!array[2][1]) {
      continue;
    }
    let count4 = list2.length;
    piece(count4, [[0.25, -0.25], [0.25, 0.25], [0.5, 0.5], [1, 0], [0.5, -0.5]], [[0.25, 1], [0.75, 1], [1, 0.75], [0.5, 0.25], [0, 0.75]], [0, 1, 4, 1, 2, 4, 2, 3, 4]);
    if (array[2][0]) {
      if (array[1][0]) {
        count4 = list2.length;
        piece(count4, [[0.5, 0.5], [1, 1], [1, 0]], [[1, 0.75], [1.5, 0.25], [0.5, 0.25]], [0, 1, 2]);
      } else {
        count4 = list2.length;
        piece(count4, [[0.5, 0.5], [1, 0.5], [1, 0]], [[1, 0.75], [1, 0.25], [0.5, 0.25]], [0, 1, 2]);
        count4 = list2.length;
        piece(count4, [[0.25, 0.25], [0.25, 0.5], [0.5, 0.5]], [[0.75, 1], [1, 1], [1, 0.75]], [0, 1, 2]);
      }
    } else if (!array[1][0]) {
      count4 = list2.length;
      piece(count4, [[0.25, 0.25], [0.25, 0.75], [0.5, 0.5]], [[0.75, 1], [1.25, 1], [1, 0.75]], [0, 1, 2]);
    }
    if (array[2][2]) {
      if (array[1][2]) {
        count4 = list2.length;
        piece(count4, [[0.5, -0.5], [1, 0], [1, -1]], [[0, 0.75], [0.5, 0.25], [-0.5, 0.25]], [0, 1, 2]);
        continue;
      }
      count4 = list2.length;
      piece(count4, [[0.5, -0.5], [1, 0], [1, -0.5]], [[0, 0.75], [0.5, 0.25], [0, 0.25]], [0, 1, 2]);
      count4 = list2.length;
      piece(count4, [[0.25, -0.5], [0.25, -0.25], [0.5, -0.5]], [[0, 1], [0.25, 1], [0, 0.75]], [0, 1, 2]);
    } else if (!array[1][2]) {
      count4 = list2.length;
      piece(count4, [[0.25, -0.75], [0.25, -0.25], [0.5, -0.5]], [[-0.25, 1], [0.25, 1], [0, 0.75]], [0, 1, 2]);
    }
  }
  if (list2.length <= 0) return { position, neighbors: currentNeighbors, mesh: null };
  const n = list2.length;
  const vertices = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) { vertices[v * 3] = list2[v][0]; vertices[v * 3 + 1] = 0; vertices[v * 3 + 2] = list2[v][1]; }
  const indices = Uint32Array.from(list3);
  const uvs = Float32Array.from(list4.flat());
  const normals = recalculateNormals(vertices, indices, [{ startIndex: 0, primitiveCount: indices.length / 3 }]);
  return { position, neighbors: currentNeighbors, mesh: { vertices, uvs, indices, normals } };
}
