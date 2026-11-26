// @ts-check
import { gateHash } from '../../net/gateLaw.js';
import { CLIMATES } from '../../formats/mapsTables.js';
import { MINE_ART_ARCHIVE } from './mineArt.js';

const SIDE = 128;
const cached = new Map();

export function mineTextures(worldClimate) {
  const base = worldClimate === CLIMATES.Mountain || worldClimate === CLIMATES.MountainWoods ? 320 : 310;
  return { archive: MINE_ART_ARCHIVE, wall: base, floor: base + 1, ceiling: base + 2 };
}

const random = (x, y, salt) => gateHash(x, y, salt) / 4294967296;
const wrap = (n, size) => ((n % size) + size) % size;
const ease = (v) => v * v * (3 - 2 * v);

function noise(u, v, columns, rows, salt) {
  const x = Math.floor(u * columns), y = Math.floor(v * rows);
  const dx = ease(u * columns - x), dy = ease(v * rows - y);
  const sample = (i, j) => random(wrap(i, columns), wrap(j, rows), salt);
  const a = sample(x, y), b = sample(x + 1, y), c = sample(x, y + 1), d = sample(x + 1, y + 1);
  return (a + (b - a) * dx) * (1 - dy) + (c + (d - c) * dx) * dy;
}

function slabs(u, v) {
  const cells = 5, x = u * cells, y = v * cells;
  let first = Infinity, second = Infinity, shade = 0;
  for (let j = Math.floor(y) - 1; j <= Math.floor(y) + 1; j++) {
    for (let i = Math.floor(x) - 1; i <= Math.floor(x) + 1; i++) {
      const a = wrap(i, cells), b = wrap(j, cells);
      const d = (x - i - 0.25 - 0.5 * random(a, b, 11)) ** 2 + (y - j - 0.25 - 0.5 * random(a, b, 12)) ** 2;
      if (d < first) { second = first; first = d; shade = random(a, b, 13); }
      else if (d < second) second = d;
    }
  }
  const edge = Math.sqrt(second) - Math.sqrt(first);
  return edge < 0.045 ? -28 : edge < 0.095 ? 9 : 16 * (shade - 0.5);
}

export function mineSurfacePictures(tex) {
  if (cached.has(tex.wall)) return cached.get(tex.wall);
  const cold = tex.wall === 320;
  const palettes = cold ? [[82, 91, 100], [133, 112, 87], [57, 63, 72]]
    : [[108, 91, 80], [148, 123, 88], [76, 65, 62]];
  const pictures = [tex.wall, tex.floor, tex.ceiling].map((record, kind) => {
    const colors = new Uint8ClampedArray(SIDE * SIDE * 4);
    for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) {
      const u = x / SIDE, v = y / SIDE;
      const grain = (noise(u, v, 24, 24, 30) - 0.5) * 19 + (random(x, y, 36) - 0.5) * 10;
      const strata = Math.sin((v * 8 + 1.15 * noise(u, v, 4, 5, 31)) * 2 * Math.PI);
      const rock = kind === 1 ? slabs(u + 0.035 * noise(u, v, 4, 4, 33), v) :
        strata * 9 - (strata > 0.87 ? 12 : 0) + (noise(u, v, 8, 5, 34) - 0.5) * 27;
      const at = (y * SIDE + x) * 4;
      for (let c = 0; c < 3; c++) colors[at + c] = palettes[kind][c] + grain + rock;
      colors[at + 3] = 255;
    }
    return { record, width: SIDE, height: SIDE, colors: new Uint8Array(colors.buffer) };
  });
  cached.set(tex.wall, pictures);
  return pictures;
}
