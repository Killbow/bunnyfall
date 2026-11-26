// @ts-check
// The terrain and Deep Waters workers load this module, so it imports only formats/ code. Every client and worker
// must grow the same isles from it.
import { CLIMATES, MAX_MAP_PIXEL_X, MAX_MAP_PIXEL_Y } from '../formats/mapsTables.js';

// The box stays inside the wire bounds (`WORLD_PIXEL_BOUND` and `POSE_BOUND` in net/wire.js, so y above -7693) and
// in positive world units, because `worldCoordToMapPixel` truncates.
export const ETHER_BOX = Object.freeze({ x0: 64, x1: 8128, y0: -7680, y1: -2688 });
export const ETHER_WORD = 'Eltheric';
export const ETHER_SEA_NAME = `the ${ETHER_WORD} Ocean`;
export const ETHER_SEA_TITLE = `The ${ETHER_WORD} Ocean`;
// The margin must cover the far ring reach from a ship in the box (`RING_RADIUS` in render/farRing.js plus its
// rebuild drift) and every kernel window.
export const ETHER_MARGIN = 64;
// Copies `PIXEL_M` from net/gateLaw.js so the terrain worker loads no net code; keep them equal.
const PIXEL_M = 819.2;
export const LEAGUE_M = 4828;
export const LEAGUE_PX = LEAGUE_M / PIXEL_M;
export const VEIL_PX = 16;
export const VEIL_X = ETHER_BOX.x1 - VEIL_PX;
export const inEther = (x, y) => x >= ETHER_BOX.x0 && x < ETHER_BOX.x1 && y >= ETHER_BOX.y0 && y < ETHER_BOX.y1;
export const inEtherLaw = (x, y) => x >= ETHER_BOX.x0 - ETHER_MARGIN && x < ETHER_BOX.x1 + ETHER_MARGIN && y >= ETHER_BOX.y0 - ETHER_MARGIN && y < ETHER_BOX.y1 + ETHER_MARGIN;
export const onBayOrEther = (x, y) => (x >= 0 && y >= 0 && x < MAX_MAP_PIXEL_X && y < MAX_MAP_PIXEL_Y) || inEther(x, y);
export const inVeil = (x, y) => inEther(x, y) && x >= VEIL_X;
export const etherFrame = () => ({ x0: ETHER_BOX.x0, y0: ETHER_BOX.y0, w: ETHER_BOX.x1 - ETHER_BOX.x0, h: ETHER_BOX.y1 - ETHER_BOX.y0 });

export const BANDS = Object.freeze([
  Object.freeze({ id: 'shallows', name: 'the Shallows', from: 0, chance: 0.5, kinds: Object.freeze({ port: 30, wild: 30, ruin: 14, rock: 26 }), lift: 0, level: 1, tier: 1, pirate: 1 }),
  Object.freeze({ id: 'reaches', name: 'the Reaches', from: 12, chance: 0.48, kinds: Object.freeze({ port: 18, wild: 32, ruin: 25, rock: 25 }), lift: 0.2, level: 3, tier: 2, pirate: 1.6 }),
  Object.freeze({ id: 'deep', name: 'the Deep Aether', from: 45, chance: 0.42, kinds: Object.freeze({ port: 11, wild: 32, ruin: 33, rock: 24 }), lift: 0.45, level: 6, tier: 3, pirate: 2.4 }),
  Object.freeze({ id: 'abyss', name: 'the Abyss', from: 140, chance: 0.36, kinds: Object.freeze({ port: 6, wild: 32, ruin: 40, rock: 22 }), lift: 0.7, level: 9, tier: 4, pirate: 3.4 }),
]);
export const etherDepthAt = (x) => Math.max(0, VEIL_X - x) / LEAGUE_PX;
export function etherBandOf(leagues) {
  let b = BANDS[0];
  for (const x of BANDS) if (leagues >= x.from) b = x;
  return b;
}
export const etherBandAt = (x) => etherBandOf(etherDepthAt(x));

// Every client must use the same salt; changing it moves every isle in the sea.
export const ETHER_SALT = 0xe7e4;
export function etherHash(...ns) {
  let h = 0x811c9dc5 ^ ETHER_SALT;
  for (const n of ns) {
    h ^= n | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}
export function etherRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ISLE_CELL_PX = 10;
export const ISLE_KINDS = Object.freeze({
  port: Object.freeze({ r: Object.freeze([0.9, 1.1]), peak: Object.freeze([10, 15]), fall: 1, climates: Object.freeze([CLIMATES.Subtropical, CLIMATES.Woodlands, CLIMATES.Rainforest]) }),
  ruin: Object.freeze({ r: Object.freeze([1.4, 2.4]), peak: Object.freeze([15, 34]), fall: 1.5, climates: Object.freeze([CLIMATES.Mountain, CLIMATES.HauntedWoodlands, CLIMATES.Swamp, CLIMATES.Desert]) }),
  wild: Object.freeze({ r: Object.freeze([1.0, 2.8]), peak: Object.freeze([10, 40]), fall: 1.5, climates: Object.freeze([CLIMATES.Rainforest, CLIMATES.Subtropical, CLIMATES.Swamp, CLIMATES.Desert2, CLIMATES.MountainWoods]) }),
  rock: Object.freeze({ r: Object.freeze([0.6, 1.1]), peak: Object.freeze([8, 18]), fall: 1.5, climates: Object.freeze([CLIMATES.Mountain, CLIMATES.Desert]) }),
});
export const KIND_IDS = Object.freeze(Object.keys(ISLE_KINDS));
// These match the GOODS rows with `ether` set in systems/naval/tradeGoods.js; keep them equal.
export const ETHER_GOODS = Object.freeze(['etheramber', 'starglass', 'voidsilk']);
export const HEIGHT_NOISE = 2;
export const CLIMATE_REACH_PX = 1.5;
export const EDGE_CELLS = 1;
export const ETHER_PORT_SHORE_M = 900;
export const ETHER_HARBOUR_REACH = 900;
// The kernel lays a pixel's byte at its south-east corner, so a port centers its land on the four bytes that frame
// its town pixel.
export const landCentre = (kind, px, py) => (kind === 'port' ? [px - 0.5, py - 0.5] : [px, py]);

export const etherCellOf = (x, y) => [Math.floor((x - ETHER_BOX.x0) / ISLE_CELL_PX), Math.floor((y - ETHER_BOX.y0) / ISLE_CELL_PX)];
export const CELLS_W = Math.floor((ETHER_BOX.x1 - ETHER_BOX.x0) / ISLE_CELL_PX);
export const CELLS_H = Math.floor((ETHER_BOX.y1 - ETHER_BOX.y0) / ISLE_CELL_PX);
export const VEILHAVEN_CELL = Object.freeze([Math.floor((VEIL_X - ETHER_BOX.x0) / ISLE_CELL_PX) - 4, Math.floor(CELLS_H / 2)]);
export const VEILHAVEN_NAME = 'Veilhaven';
export const VEILHAVEN_AT = Object.freeze([4, 5]);

const lerp = (a, b, t) => a + (b - a) * t;
const cellKey = (cx, cy) => `${cx},${cy}`;
const openCell = (cx, cy) => cx < EDGE_CELLS || cy < EDGE_CELLS || cy >= CELLS_H - EDGE_CELLS || cx > VEILHAVEN_CELL[0];

/** @typedef {{ key: string, cx: number, cy: number, px: number, py: number, lx: number, ly: number, kind: string, r: number, peak: number, fall: number, climate: number, seed: number, band: string, good: string|null, name: string, haven: boolean }} Isle */

/** @type {Map<string, Isle|null>} */
const _isles = new Map();
export const isleCacheSize = () => _isles.size;
export const dropIsleCache = () => _isles.clear();
export const ISLE_CACHE_MAX = 65536;

function pick(weights, u) {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let x = Math.max(0, Math.min(0.999999, u)) * total;
  for (const k of keys) { if ((x -= weights[k]) < 0) return k; }
  return keys[keys.length - 1];
}

export function isleOfCell(cx, cy) {
  const key = cellKey(cx, cy);
  const hit = _isles.get(key);
  if (hit !== undefined) return hit;
  const isle = makeIsle(cx, cy, key);
  if (_isles.size >= ISLE_CACHE_MAX) _isles.clear();
  _isles.set(key, isle);
  return isle;
}

function makeIsle(cx, cy, key) {
  if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H) return null;
  const haven = cx === VEILHAVEN_CELL[0] && cy === VEILHAVEN_CELL[1];
  if (!haven && openCell(cx, cy)) return null;
  const seed = etherHash(cx, cy, 1);
  const r = etherRng(seed);
  const x0 = ETHER_BOX.x0 + cx * ISLE_CELL_PX, y0 = ETHER_BOX.y0 + cy * ISLE_CELL_PX;
  const band = etherBandAt(x0 + ISLE_CELL_PX / 2);
  if (!haven && !(r() < band.chance)) return null;
  const kind = haven ? 'port' : pick(band.kinds, r());
  const k = ISLE_KINDS[kind];
  const radius = haven ? 1 : lerp(k.r[0], k.r[1], r());
  const peak = haven ? 12 : Math.round(lerp(k.peak[0], k.peak[1], r()) * (kind === 'port' ? 1 : 1 + band.lift));
  const margin = Math.ceil(radius) + 1;
  const span = Math.max(1, ISLE_CELL_PX - 2 * margin);
  const [px, py] = haven ? [x0 + VEILHAVEN_AT[0], y0 + VEILHAVEN_AT[1]] : [x0 + margin + Math.floor(r() * span), y0 + margin + Math.floor(r() * span)];
  const climate = haven ? CLIMATES.Subtropical : k.climates[Math.floor(r() * k.climates.length) % k.climates.length];
  const good = kind === 'wild' ? ETHER_GOODS[Math.floor(r() * ETHER_GOODS.length) % ETHER_GOODS.length] : null;
  const [lx, ly] = landCentre(kind, px, py);
  const isle = { key, cx, cy, px, py, lx, ly, kind, r: radius, peak, fall: k.fall, climate, seed, band: band.id, good, name: '', haven };
  isle.name = haven ? VEILHAVEN_NAME : isleName(isle);
  return Object.freeze(isle);
}

export function isleAt(x, y) {
  if (!inEther(x, y)) return null;
  const [cx, cy] = etherCellOf(x, y);
  return isleOfCell(cx, cy);
}

export function islesNear(x, y, reach) {
  const out = [];
  const [c0, r0] = etherCellOf(x - reach, y - reach), [c1, r1] = etherCellOf(x + reach, y + reach);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const isle = isleOfCell(cx, cy);
    if (isle && Math.max(Math.abs(isle.px - x), Math.abs(isle.py - y)) <= reach) out.push(isle);
  }
  return out.sort((a, b) => Math.hypot(a.px - x, a.py - y) - Math.hypot(b.px - x, b.py - y));
}

export function isleByKey(key) {
  const m = /^(-?\d+),(-?\d+)$/.exec(String(key ?? ''));
  return m ? isleOfCell(Number(m[1]), Number(m[2])) : null;
}

export const veilhaven = () => /** @type {Isle} */ (isleOfCell(VEILHAVEN_CELL[0], VEILHAVEN_CELL[1]));

export const NAME_HEADS = Object.freeze(['Ael', 'Vael', 'Syr', 'Oru', 'Mir', 'Thal', 'Ves', 'Ish', 'Cael', 'Nym', 'Ery', 'Lun', 'Zeph', 'Ora', 'Sar', 'Ith', 'Quel', 'Xan', 'Eth', 'Ul', 'Kor', 'Bel', 'Dra', 'Hal', 'Ost', 'Rhy', 'Tor', 'Vey', 'Wen', 'Aur', 'Cyr', 'Fen', 'Gal', 'Ione', 'Jor', 'Mael', 'Nor', 'Pell', 'Sel', 'Tey']);
export const NAME_MIDS = Object.freeze(['a', 'e', 'i', 'o', 'u', 'ae', 'ar', 'el', 'in', 'or', 'ul', 'ys']);
export const NAME_TAILS = Object.freeze(['dra', 'mere', 'sol', 'veth', 'oria', 'anth', 'is', 'el', 'yne', 'ara', 'ond', 'ith', 'ael', 'orn', 'esse', 'ivar', 'oth', 'una', 'ys', 'ent', 'alis', 'ume', 'ior', 'ast', 'en', 'wyn', 'mor', 'thas', 'rel', 'gard']);
const NAME_WORDS = Object.freeze({
  adj: Object.freeze(['Weeping', 'Glass', 'Silent', 'Drowned', 'Burning', 'Pale', 'Hollow', 'Singing', 'Starlit', 'Broken', 'Twin', 'Black', 'Amber', 'Moonless', 'Shivering', 'Lantern']),
  rock: Object.freeze(['Stack', 'Teeth', 'Rocks', 'Spire', 'Fang', 'Skerry', 'Crag', 'Needles', 'Anvil', 'Crown']),
  ruin: Object.freeze(['Grave', 'Barrow', 'Hollow', 'Tomb', 'Sepulchre', 'Vault']),
});
const FORMS = Object.freeze({
  port: Object.freeze([(n) => `Port ${n}`, (n) => `${n}haven`, (n) => `${n} Landing`, (n) => `${n}'s Anchorage`, (n) => `${n}mouth`]),
  wild: Object.freeze([(n) => n, (n) => `${n} Isle`, (n) => `the Isle of ${n}`, (n, w) => `the ${w.adj} Isle`]),
  ruin: Object.freeze([(n) => `the Isle of ${n}`, (n, w) => `${n}'s ${w.ruin}`, (n) => `Old ${n}`, (n, w) => `the ${w.ruin} of ${n}`]),
  rock: Object.freeze([(n, w) => `the ${w.adj} ${w.rock}`, (n, w) => `${n} ${w.rock}`]),
});
const draw = (list, r) => list[Math.floor(r() * list.length) % list.length];
export function isleName(isle) {
  const r = etherRng(etherHash(isle.seed, 7));
  const root = draw(NAME_HEADS, r) + (r() < 0.5 ? draw(NAME_MIDS, r) : '') + draw(NAME_TAILS, r);
  const w = { adj: draw(NAME_WORDS.adj, r), rock: draw(NAME_WORDS.rock, r), ruin: draw(NAME_WORDS.ruin, r) };
  return draw(FORMS[isle.kind] ?? FORMS.wild, r)(root, w);
}
export const KIND_WORDS = Object.freeze({ port: 'a port', ruin: 'a ruin', wild: 'a wild isle', rock: 'a bare rock' });
const POINTS = Object.freeze(['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west']);
// Returns null for a zero offset, because atan2 reads (0, 0) as south and (0, -0) as north.
export function compassPoint(dx, dy) {
  if (!dx && !dy) return null;
  const a = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  return POINTS[Math.round(a / 22.5) % 16];
}

const lattice = (x, y, salt) => etherHash(x, y, salt) / 4294967296;

export function isleByte(isle, x, y) {
  const t = Math.hypot(x - isle.lx, y - isle.ly) / isle.r;
  if (t >= 1) return 0;
  const h = isle.peak * Math.pow(1 - t * t, isle.fall) + (lattice(x, y, 0x51) - 0.5) * 2 * HEIGHT_NOISE;
  return Math.max(0, Math.min(255, Math.round(h)));
}

export function etherHeightByte(x, y) {
  const isle = isleAt(x, y);
  return isle ? isleByte(isle, x, y) : 0;
}

export function etherLargeMap(x, y) {
  const land = etherHeightByte(x, y) > 0;
  const top = land ? 10 : 2;
  const data = [];
  for (let ix = 0; ix < 5; ix++) {
    const col = new Uint8Array(5);
    for (let iy = 0; iy < 5; iy++) col[iy] = Math.floor(lattice(x * 5 + ix, y * 5 + iy, 0x2545) * top);
    data.push(col);
  }
  return data;
}

export function etherClimateAt(x, y) {
  const isle = isleAt(x, y);
  if (!isle) return CLIMATES.Ocean;
  return Math.hypot(x - isle.lx, y - isle.ly) <= isle.r + CLIMATE_REACH_PX ? isle.climate : CLIMATES.Ocean;
}

/** @param {any} woods */
export function etherWoods(woods) {
  const ground = Object.create(woods);
  ground.getHeightMapValue = function (x, y) { return inEtherLaw(x, y) ? etherHeightByte(x, y) : woods.getHeightMapValue(x, y); };
  ground.getLargeMapData = function (x, y) { return inEtherLaw(x, y) ? etherLargeMap(x, y) : woods.getLargeMapData(x, y); };
  ground.isEtherGround = true;
  ground.etherLaw = inEtherLaw;
  ground.under = woods;
  return ground;
}

export function etherClimateIndex(climateIndex) {
  return (x, y) => (inEtherLaw(x, y) ? etherClimateAt(x, y) : climateIndex(x, y));
}
// In the box this returns `128 + region`, the way POLITIC.PAK stores a region. Past the map POLITIC.PAK returns -1,
// which getRegionIndexAt clamps to region 0.
export function etherPoliticIndex(politicIndex, region) {
  return (x, y) => (inEtherLaw(x, y) ? 128 + region : politicIndex(x, y));
}

export const ETHER_LIGHT_TINT = Object.freeze([0.88, 0.9, 1.14]);
export const ETHER_KEY_TINT = Object.freeze([0.95, 0.93, 1.07]);
// Returns the input array itself when `w` is 0, so callers must not mutate the result.
export function etherLight(rgb, w, tint = ETHER_LIGHT_TINT) {
  if (!(w > 0) && rgb instanceof Float32Array) return rgb;
  const k = Math.max(0, Math.min(1, w || 0));
  return new Float32Array([0, 1, 2].map((i) => rgb[i] * (1 + (tint[i] - 1) * k)));
}

export const CROSS_X = 230;
export const CROSS_LAND_PX = 20;
export const crossingWaters = (x, y, landPx) => !inEtherLaw(x, y) && x < CROSS_X && typeof landPx === 'number' && landPx >= CROSS_LAND_PX;
export const HOME_WATERS = Object.freeze({ px: 180, py: 300 });
export const LANDFALL_OFF_PX = 4;
export const landfall = () => { const h = veilhaven(); return { px: h.px + LANDFALL_OFF_PX, py: h.py }; };
