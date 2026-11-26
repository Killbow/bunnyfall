// @ts-check

import { createDecorRoom, decorBoxSeen, DECOR_DRAW, DECOR_SKIP } from './decorRoom.js';
import { decorKey } from './decorCatalogue.js';
import { decorFlameLift } from './decorFlame.js';
import { decorPlaque } from './decorLook.js';
import { pickActivatableHit } from '../player/activate.js';
import { plaqueActionFor } from '../items/quickLoot.js';
import { YARD_RANGE_TIERS, YARD_RANGE_DEFAULT, yardRangeOf, YARD_DRAW_M } from '../net/yardRange.js';
import { createDecorTool } from './decorTool.js';
import { decorYardPieceOf, DECOR_YARD_CAP, decorYardHighOk, DECOR_YARD_HIGH_WHY } from '../net/decorLaw.js';
import { homeLookRecords } from '../world/homeLook.js';
import { onPathTile } from '../player/exteriorSurface.js';
import { RMB_TILE_SIDE } from '../world/locationEntrance.js';
import { TERRAIN_TILE_DIM } from '../world/terrainSurface.js';
import { homeOutsideKept, homeYardWhere, homeCandidate } from './onlineHomes.js';
import { homeDecorShown } from '../net/homeVoteLaw.js';
import { homeDecorSeenByMe } from './homeDecorHide.js';
import { createYardNature, isNaturePiece, yardNatureFlat, yardTreeSet } from './yardNature.js';
import { campsWhereWords, setCampPacker } from '../ui/campsPage.js';
import { CAMP_CAP, CAMP_RADIUS, CAMP_PIXEL_M, campOf, campKitPieces } from '../net/campLaw.js';
import { CAMP_KIND } from '../systems/survival/camp.js';
import { remapSubMeshes } from '../world/texRemap.js';
import { applyClimate } from '../world/climateSwaps.js';
import { isNatureArchive, BLOCK_FLATS_OFFSET_Y } from '../world/rmbFlats.js';
import { LIGHTS_ARCHIVE, CITY_LIGHT_RANGE, CITY_LIGHT_INTENSITY, CITY_LIGHT_COLOR } from '../world/cityLights.js';
import { interiorLightProperties } from '../world/interiorLights.js';
import { GLOBAL_SCALE } from '../world/meshReader.js';
import { transformedAabb } from '../render/frustum.js';
import { adoptLight } from '../render/lightId.js';
import { createBankAccounts, BANK_REGION_COUNT, goldRegion } from '../trade/banking.js';
import { totalGoldAmount, payUndoable, addGold } from '../justice/court.js';

export const homeYardWallet = (entity, region) => {
  entity.bankAccounts ??= createBankAccounts(BANK_REGION_COUNT);
  const a = entity.bankAccounts[goldRegion(entity.bankAccounts, region)] ?? null;
  return {
    gold: totalGoldAmount(entity) + (a?.accountGold ?? 0),
    pay: (n) => payUndoable(entity, n, a),
    credit: (n) => { addGold(entity, n); },
  };
};
export const YARD_LAMP = Object.freeze({ range: CITY_LIGHT_RANGE, intensity: CITY_LIGHT_INTENSITY, color: CITY_LIGHT_COLOR });
export const YARD_CANDLE_RECORDS = new Set([2, 3, 4, 5, 9, 11, 21]);
/** The most TEXTURE.210 flats in any classic Daggerfall town block. */
export const YARD_LAMPS_MAX = 8;
/** Daggerfall sinks a block's flats by blockFlatsOffsetY but not their lights, so a yard lamp hangs this far up. */
export const YARD_LAMP_RAISE = -BLOCK_FLATS_OFFSET_Y * GLOBAL_SCALE;
export function yardLampOf(piece, size) {
  if (piece?.flat?.[0] !== LIGHTS_ARCHIVE || !(size?.h > 0)) return null;
  const k = piece.scale > 0 ? piece.scale : 1;
  const slot = yardLampSlot(piece.id);
  if (YARD_CANDLE_RECORDS.has(piece.flat[1])) {
    const c = interiorLightProperties(piece.flat[1]);
    return { light: { range: c.range * k, intensity: c.intensity, color: c.color, slot }, lift: size.h + YARD_LAMP_RAISE * k };
  }
  const flame = decorFlameLift(piece.flat[1], size.h);
  return { light: { ...YARD_LAMP, range: YARD_LAMP.range * k, slot }, lift: flame ?? size.h + YARD_LAMP_RAISE * k };
}
export function yardLampSlot(id) {
  const s = String(id ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function yardLampRows(lamps, rows, animRanges, color, out) {
  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i];
    const e = rows[i] ?? (rows[i] = { x: 0, y: 0, z: 0, range: 0, color: null });
    e.x = l.x; e.y = l.y; e.z = l.z;
    adoptLight(e, l);
    e.range = animRanges[l.slot % animRanges.length] * (l.range / CITY_LIGHT_RANGE);
    e.color = color;
    out.push(e);
  }
  return out;
}

export { YARD_DRAW_M };
export { YARD_RANGE_TIERS, YARD_RANGE_DEFAULT, yardRangeOf };
export const YARD_MIN_ANGLE = 1 / 300;
export const YARD_MARGIN = 6;
export const YARD_NEAR = 2;
const YARD_NEAR_ONLY = 1e6;
export const YARD_MARK_HIGH = 1;
export const YARD_TOWN_TTL_MS = 60_000;
export const YARD_RETRY_MS = 10_000;
/** The service caches a town's yards for 30 s and may read a replica, so a later answer can predate a write. */
export const YARD_WRITE_HOLD_MS = 60_000;
export const YARD_ASK_M = YARD_DRAW_M + 200;
export const YARD_RETRY_MAX_MS = 300_000;
export const yardRetryMs = (n) => Math.min(YARD_RETRY_MAX_MS, YARD_RETRY_MS * 2 ** Math.max(0, n - 1));
export const YARD_SYNC_S = 0.5;
export const CAMP_READ_MS = 15_000;
export const CAMP_READ_CALM_MS = 60_000;
export const campReadWait = (/** @type {boolean} */ calm) => (calm ? CAMP_READ_CALM_MS : CAMP_READ_MS);
export const campSigOf = (/** @type {any[]} */ list) => list.map((x) => `${x?.id}:${x?.pieces?.length ?? 0}`).sort().join(',');
export const CAMP_LINE_S = 3;
export const CAMP_LINE_M = 60;
export const CAMP_REFUSED_MS = 5 * 60_000;
export const CAMP_OFF_GROUND = 'Outside your camp. Keep it within the marked edge.';
export function campWhyNot(piece, foot = []) {
  const pos = piece?.pos;
  if (!Array.isArray(pos)) return CAMP_OFF_GROUND;
  const pts = [[pos[0], pos[2]], ...(foot ?? []).map(([dx, dz]) => [pos[0] + dx, pos[2] + dz])];
  if (!pts.every(([x, z]) => Math.abs(x) <= CAMP_RADIUS && Math.abs(z) <= CAMP_RADIUS)) return CAMP_OFF_GROUND;
  if (!decorYardHighOk({ pos })) return YARD_TOO_HIGH;
  return null;
}
export const YARD_MERGES_A_FRAME = 1;
export const YARD_STANDS_A_FRAME = 4;
export const YARD_OFF_LOT = 'Outside your lot. Keep it within the marked edge.';
export const YARD_IN_HOUSE = 'That is inside your house. Place it in the yard around it.';
export const YARD_ON_OTHER = "That is another building's ground.";
export const YARD_FULL = `Your yard already holds ${DECOR_YARD_CAP} pieces.`;
export const YARD_IN_HALL = "That is inside the hall. Place it in the hall's yard around it.";
export const YARD_HALL_FULL = `The hall's yard already holds ${DECOR_YARD_CAP} pieces.`;
export const YARD_ON_ROAD = 'That is the road. Keep the street and its paths clear.';
export const YARD_TOO_HIGH = DECOR_YARD_HIGH_WHY;
export const YARD_EDGE_PAD = 0.05;
export const YARD_FOOT_CELL = 0.4;
export const YARD_SPLIT_CELL = 0.5;
export const YARD_ROOF_Y = 2;

export function modelFootRects(positions, indices, cell = YARD_FOOT_CELL) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    x0 = Math.min(x0, positions[i]); x1 = Math.max(x1, positions[i]);
    z0 = Math.min(z0, positions[i + 2]); z1 = Math.max(z1, positions[i + 2]);
  }
  if (!(x1 > x0) || !(z1 > z0)) return [];
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((z1 - z0) / cell);
  const hit = new Uint8Array(W * H);
  const roof = new Uint8Array(W * H);
  const walls = [];
  const seen = new Set();
  const mark = (grid, x, z) => { grid[Math.min(H - 1, Math.floor((z - z0) / cell)) * W + Math.min(W - 1, Math.floor((x - x0) / cell))] = 1; };
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    if (Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) < 2e-3) {
      const edges = [[ax, az, bx, bz], [bx, bz, cx, cz], [cx, cz, ax, az]];
      let best = edges[0], len = -1;
      for (const e of edges) {
        const d = Math.hypot(e[2] - e[0], e[3] - e[1]);
        if (d > len) { best = e; len = d; }
      }
      if (len < 1e-3) continue;
      const q = (v) => Math.round(v * 1000);
      const ka = `${q(best[0])},${q(best[1])}`, kb = `${q(best[2])},${q(best[3])}`;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      // A wall closes the house only when it starts below roof height; an upper story or a gable closes nothing.
      if (Math.min(ay, by, cy) < YARD_ROOF_Y && !seen.has(key)) { seen.add(key); walls.push(best); }
      continue;
    }
    const high = ay >= YARD_ROOF_Y && by >= YARD_ROOF_Y && cy >= YARD_ROOF_Y;
    const grid = high ? roof : hit;
    const n = Math.max(1, Math.ceil(Math.max(Math.hypot(bx - ax, bz - az), Math.hypot(cx - ax, cz - az), Math.hypot(cx - bx, cz - bz)) / (cell / 2)));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        const u = (i + 1 / 3) / n, v = (j + 1 / 3) / n, w = 1 - u - v;
        mark(grid, ax * w + bx * u + cx * v, az * w + bz * u + cz * v);
      }
    }
  }
  const inside = (x, z) => {
    let n = 0;
    for (const [ax, az, bx, bz] of walls) {
      if ((az > z) === (bz > z)) continue;
      const cross = ax + ((z - az) / (bz - az)) * (bx - ax);
      if (cross > x) n += 1;
    }
    return n % 2 === 1;
  };
  // Roof cells count as ground only for a model with no walls; otherwise the ground-floor walls enclose the house.
  for (let i = 0; i < roof.length; i++) {
    if (hit[i]) continue;
    if (!walls.length) { if (roof[i]) hit[i] = 1; continue; }
    const q = i % W, r = (i / W) | 0;
    if (inside(x0 + (q + 0.5) * cell, z0 + (r + 0.5) * cell)) hit[i] = 1;
  }
  const out = [];
  let open = new Map();
  for (let r = 0; r < H; r++) {
    const next = new Map();
    for (let q = 0; q < W;) {
      if (!hit[r * W + q]) { q++; continue; }
      let e = q;
      while (e < W && hit[r * W + e]) e++;
      const k = q * 65536 + e;
      const rect = open.get(k) ?? [x0 + q * cell, z0 + r * cell, Math.min(x1, x0 + e * cell), 0];
      if (!open.has(k)) out.push(rect);
      rect[3] = Math.min(z1, z0 + (r + 1) * cell);
      next.set(k, rect);
      q = e;
    }
    open = next;
  }
  return out;
}
export function footRectsAt(rects, m) {
  return (rects ?? []).map(([rx0, rz0, rx1, rz1]) => {
    const b = transformedAabb([rx0, 0, rz0, rx1, 0, rz1], m);
    return [b[0], b[2], b[3], b[5]];
  });
}

export function yardLot(origin, box, margin = YARD_MARGIN, rects = null) {
  if (!Array.isArray(origin) || !Array.isArray(box) || box.length < 6) return null;
  const house = [box[0] - origin[0], box[2] - origin[2], box[3] - origin[0], box[5] - origin[2]];
  if (!(house[2] > house[0]) || !(house[3] > house[1])) return null;
  const walls = Array.isArray(rects) && rects.length ? rects.map((r) => [r[0] - origin[0], r[1] - origin[2], r[2] - origin[0], r[3] - origin[2]]) : [house];
  return { house, walls, lot: [house[0] - margin, house[1] - margin, house[2] + margin, house[3] + margin], y: box[1] - origin[1] };
}
const inRect = (x, z, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && z >= r[1] - pad && z <= r[3] + pad;
export const yardGapTo = (rs, x, z) => (rs ?? []).reduce((m, r) => Math.min(m, Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]))), Infinity);
export function yardFootMeets(poly, r, pad = 0) {
  const x0 = r[0] + pad, z0 = r[1] + pad, x1 = r[2] - pad, z1 = r[3] - pad;
  if (!(x1 >= x0) || !(z1 >= z0) || !poly.length) return false;
  if (poly.every((p) => p[0] < x0) || poly.every((p) => p[0] > x1) || poly.every((p) => p[1] < z0) || poly.every((p) => p[1] > z1)) return false;
  const box = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const edges = poly.length > 2 ? poly.length : poly.length - 1;
  for (let i = 0; i < edges; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const nx = a[1] - b[1], nz = b[0] - a[0];
    const along = (p) => p[0] * nx + p[1] * nz;
    const ps = poly.map(along), bs = box.map(along);
    if (Math.max(...ps) < Math.min(...bs) || Math.min(...ps) > Math.max(...bs)) return false;
  }
  return true;
}
export function yardWhyNot(pos, lot, others = [], foot = [], roads = [], lines = others) {
  if (!lot || !Array.isArray(pos)) return YARD_OFF_LOT;
  const [x, , z] = pos;
  const corners = (foot ?? []).map(([dx, dz]) => [x + dx, z + dz]);
  const points = [[x, z], ...corners];
  if (!points.every(([px, pz]) => inRect(px, pz, lot.lot))) return YARD_OFF_LOT;
  const ground = corners.length ? corners : [[x, z]];
  const meets = (r) => inRect(x, z, r) || yardFootMeets(ground, r, YARD_EDGE_PAD);
  if ((lot.walls ?? [lot.house]).some(meets)) return YARD_IN_HOUSE;
  if ((others ?? []).some(meets)) return YARD_ON_OTHER;
  const own = lot.walls ?? [lot.house];
  if (points.some(([px, pz]) => yardGapTo(lines, px, pz) < yardGapTo(own, px, pz))) return YARD_ON_OTHER;
  if ((roads ?? []).some((r) => yardFootMeets(ground, r, YARD_EDGE_PAD))) return YARD_ON_ROAD;
  if (!decorYardHighOk({ pos })) return YARD_TOO_HIGH;
  return null;
}
export const yardLineHolder = (frame, bk, home = null) => !!home || homeCandidate({ buildingType: frame?.type, buildingKey: bk, factionId: frame?.faction ?? 0 });
export function yardRoadsOf(p, at, lot) {
  const bytes = p?.tilemapBytes ?? null;
  if (!bytes || !lot || !Array.isArray(at)) return [];
  const S = RMB_TILE_SIDE, N = TERRAIN_TILE_DIM;
  const [lx0, lz0, lx1, lz1] = lot.lot;
  const tx0 = Math.max(0, Math.floor((at[0] + lx0) / S)), tx1 = Math.min(N - 1, Math.floor((at[0] + lx1) / S));
  const tz0 = Math.max(0, Math.floor((at[2] + lz0) / S)), tz1 = Math.min(N - 1, Math.floor((at[2] + lz1) / S));
  const out = [];
  for (let tz = tz0; tz <= tz1; tz++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const i = tz * N + tx;
      if (!onPathTile(bytes[i] >> 2) && !p.paths?.[i]) continue;
      out.push([tx * S - at[0], tz * S - at[2], (tx + 1) * S - at[0], (tz + 1) * S - at[2]]);
    }
  }
  return out;
}
export function yardLotEdges(lot, roads = [], lines = []) {
  if (!lot) return [];
  const [X0, Z0, X1, Z1] = lot.lot;
  const holes = (roads ?? []).filter((r) => r[0] < X1 && r[2] > X0 && r[1] < Z1 && r[3] > Z0);
  const near = (lines ?? []).filter((r) => r[0] < X1 + 2 * YARD_MARGIN && r[2] > X0 - 2 * YARD_MARGIN && r[1] < Z1 + 2 * YARD_MARGIN && r[3] > Z0 - 2 * YARD_MARGIN);
  const own = lot.walls ?? [lot.house];
  const steps = (lo, hi) => (near.length ? Array.from({ length: Math.max(0, Math.ceil((hi - lo) / YARD_SPLIT_CELL) - 1) }, (_, k) => lo + (k + 1) * YARD_SPLIT_CELL) : []);
  const cuts = (lo, hi, i, j) => [...new Set([lo, hi, ...steps(lo, hi), ...holes.flatMap((r) => [r[i], r[j]]).filter((v) => v > lo && v < hi)])].sort((a, b) => a - b);
  const xs = cuts(X0, X1, 0, 2), zs = cuts(Z0, Z1, 1, 3);
  const memo = new Map();
  const open = (i, j) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= zs.length - 1) return false;
    const k = i * 65536 + j;
    if (memo.has(k)) return memo.get(k);
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    const v = !holes.some((r) => cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3])
      && !(near.length && yardGapTo(near, cx, cz) < yardGapTo(own, cx, cz));
    memo.set(k, v);
    return v;
  };
  const segs = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const w = open(i - 1, j), e = open(i, j);
      if (w !== e) segs.push(e ? [xs[i], zs[j + 1], xs[i], zs[j]] : [xs[i], zs[j], xs[i], zs[j + 1]]);
    }
  }
  for (let j = 0; j < zs.length; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const s = open(i, j - 1), n = open(i, j);
      if (s !== n) segs.push(n ? [xs[i], zs[j], xs[i + 1], zs[j]] : [xs[i + 1], zs[j], xs[i], zs[j]]);
    }
  }
  const out = [];
  const left = new Set(segs);
  const dir = (s) => [Math.sign(s[2] - s[0]), Math.sign(s[3] - s[1])].join();
  while (left.size) {
    const first = [...left].reduce((a, b) => (b[1] < a[1] || (b[1] === a[1] && b[0] < a[0]) ? b : a));
    let run = [...first];
    left.delete(first);
    for (;;) {
      const next = [...left].find((q) => q[0] === run[2] && q[1] === run[3] && dir(q) === dir(run))
        ?? [...left].find((q) => q[0] === run[2] && q[1] === run[3]);
      if (!next) break;
      left.delete(next);
      if (dir(next) === dir(run)) { run[2] = next[2]; run[3] = next[3]; continue; }
      out.push(run);
      run = [...next];
    }
    out.push(run);
  }
  return out;
}
export const yardHolds = (lot, origin, p, near = 0) => !!lot && Array.isArray(p) && inRect(p[0] - origin[0], p[2] - origin[2], lot.lot, near);
export function yardLotQuads(lot, origin, high = YARD_MARK_HIGH, roads = [], lines = []) {
  if (!lot) return [];
  const y = origin[1] + lot.y + high / 2;
  const side = ([ax, az, bx, bz]) => {
    const len = Math.hypot(bx - ax, bz - az);
    return { pos: [origin[0] + (ax + bx) / 2, y, origin[2] + (az + bz) / 2], size: high, stretch: len / high, right: [(bx - ax) / len, 0, (bz - az) / len], up: [0, 1, 0] };
  };
  return yardLotEdges(lot, roads, lines).map(side);
}

export function createHomeYards(deps) {
  const now = () => deps.now?.() ?? Date.now();
  const range = () => yardRangeOf(deps.range?.());
  const reachOf = (y) => (y === cur?.yard ? Infinity : y.kept ? YARD_DRAW_M : range());
  function nearEye(y, eye) {
    const reach = reachOf(y);
    if (!eye || reach === Infinity) return true;
    const o = originOf(y);
    return Math.hypot(o[0] - eye[0], o[2] - eye[2]) <= reach;
  }
  let _eye = null;
  const seenCull = (box) => (_eye && !decorBoxSeen(box, _eye, YARD_MIN_ANGLE) ? DECOR_SKIP : deps.cull ? deps.cull(box) : DECOR_DRAW);
  const _batches = [];
  /** @type {Map<number, {at: number, byKey: Map<number, any[]>}>} */
  const towns = new Map();
  const asking = new Map();
  /** @type {Map<number, {at: number, n: number}>} */
  const failed = new Map();
  /** @type {Map<string, {pool: any, px: number, py: number, mapId: number, bk: number, t: number[], sig: string, src: any[] | null, srcSig: string, kept: boolean, lot: any, frame: any, entry: any, skin: number, trees: Map<string, any>, treeSet: any, camp?: any}>} */
  const yards = new Map();
  const yardFigs = [];
  let mergesLeft = 0;
  const merge = { take: () => (mergesLeft > 0 ? (mergesLeft--, true) : false), now };
  let syncIn = 0;
  /** @type {any} */
  let cur = null;
  let lotMarks = { yard: null, key: '', quads: [] };
  // An answer read before one of the owner's writes must not overwrite the yard that write left.
  let wrote = 0;
  /** @type {Map<number, Map<number, {n: number, at: number, list: any[]}>>} */
  const writes = new Map();

  /** @type {Map<string, any>} */
  const campsById = new Map();
  let campRead = { key: '', at: -Infinity, asking: false, ready: false, sig: '', calm: false };
  let campLineIn = 0;
  const campAsking = new Set(), campStriking = new Set();
  /** @type {Map<string, number>} */
  const campRefused = new Map();
  // Strike a camp only once its tent was seen since the last load; loading an older save leaves it alone.
  const seenRecs = new Set();
  function campPixelOf(pos) {
    if (!Array.isArray(pos)) return null;
    for (const [, p] of deps.built?.() ?? []) {
      if (!Number.isSafeInteger(p?.px) || !Number.isSafeInteger(p?.py)) continue;
      const t = deps.translation(p.px, p.py);
      const lx = pos[0] - t[0], lz = pos[2] - t[2];
      if (lx >= 0 && lx < CAMP_PIXEL_M && lz >= 0 && lz < CAMP_PIXEL_M) return { px: p.px, py: p.py, at: [lx, pos[1] - t[1], lz] };
    }
    return null;
  }
  function campOriginOf(c) {
    if (!deps.built?.()?.get?.(`${c.px},${c.py}`)) return null;
    const t = deps.translation(c.px, c.py);
    return [t[0] + c.at[0], t[1] + c.at[1], t[2] + c.at[2]];
  }
  function readCamps(force = false) {
    if (!deps.api?.campsNear || campRead.asking) return;
    const here = campPixelOf(deps.feet?.() ?? null);
    if (!here) return;
    const key = `${here.px},${here.py}`;
    if (!force && key === campRead.key && now() - campRead.at < campReadWait(campRead.calm)) return;
    const before = campRead;
    campRead = { ...campRead, key, at: now(), asking: true };
    Promise.resolve(deps.api.campsNear(here.px, here.py)).then((r) => {
      const list = r?.ok ? r.data?.camps : null;
      if (!Array.isArray(list)) return;
      const held = (id) => cur?.camp?.id === id && busyWriting();
      for (const [id, c] of campsById) {
        const inWindow = Math.abs(c.px - here.px) <= 1 && Math.abs(c.py - here.py) <= 1;
        if ((inWindow || Math.abs(c.px - here.px) > 2 || Math.abs(c.py - here.py) > 2) && !held(id)) campsById.delete(id);
      }
      for (const raw of list) { const c = campOf(raw); if (c && !held(c.id)) campsById.set(c.id, c); }
      const sig = campSigOf(list);
      campRead.calm = before.key === key && before.sig === sig;
      campRead.sig = sig;
      campRead.ready = true;
    }, () => {}).finally(() => { campRead.asking = false; });
  }
  const kitStands = (rec) => !!rec && !!deps.campPool?.()?.camps?.some?.((x) => x?.rec?.id === rec);
  function lineUpCamps() {
    for (const id of campOwed.keys()) settleOwed(id);
    const pool = deps.campPool?.();
    const char = deps.character?.() ?? null;
    const feet = deps.feet?.() ?? null;
    if (!pool?.own || !char || !feet || !campRead.ready || !deps.api?.campPitch || !deps.outside?.()) return;
    const tents = pool.own().filter((r) => r?.kind === CAMP_KIND.Tent && !r.deck && Array.isArray(r.pos) && typeof r.id === 'string');
    const recs = new Set(tents.map((r) => r.id));
    for (const id of recs) seenRecs.add(id);
    const mine = [...campsById.values()].filter((c) => c.mine && c.char === char);
    for (const r of tents) {
      if (Math.hypot(r.pos[0] - feet[0], r.pos[2] - feet[2]) > CAMP_LINE_M || mine.some((c) => c.rec === r.id) || campAsking.has(r.id)) continue;
      const refused = campRefused.get(r.id);
      if (refused != null && now() - refused < CAMP_REFUSED_MS) continue;
      const at = campPixelOf(r.pos);
      if (!at) continue;
      campAsking.add(r.id);
      Promise.resolve(deps.api.campPitch({ character: char, rec: r.id, px: at.px, py: at.py, at: at.at, yaw: Number.isFinite(r.yaw) ? r.yaw : 0 })).then((res) => {
        const c = res?.ok ? campOf(res.data?.camp) : null;
        if (c) {
          campsById.set(c.id, c);
          if (!res.data?.repeat && !campOwed.has(r.id)) deps.say?.(`Your camp will stay when you leave. Stand in it to decorate it (up to ${CAMP_CAP} pieces).`);
          return;
        }
        campRefused.set(r.id, now());
        if (res?.error && res.error !== 'homes-need-account' && res.error !== 'offline') {
          const said = (extra) => deps.say?.(`Your tent stands, but it will not stay as a camp. ${deps.refusal?.(res.error) ?? ''} ${extra}`.trim());
          if (res.error === 'camps-max') campsWhereWords().then(said, () => said(''));
          else said('');
        }
      }, () => {}).finally(() => { campAsking.delete(r.id); });
    }
    for (const c of mine) {
      if (!c.rec || recs.has(c.rec) || campStriking.has(c.id) || campOwed.has(c.rec)) continue;
      const o = campOriginOf(c);
      if (!o || Math.hypot(o[0] - feet[0], o[2] - feet[2]) > CAMP_LINE_M) continue;
      if (seenRecs.has(c.rec)) strikeKept(c.id, c.pieces.length);
    }
  }
  function strikeKept(id, pieces) {
    if (campStriking.has(id)) return Promise.resolve(null);
    campStriking.add(id);
    return Promise.resolve(deps.api.campStrike(id)).then((res) => {
      if (!res?.ok && res?.error !== 'no-camp') return res;
      campsById.delete(id);
      if (pieces) deps.say?.('Your camp is packed up, and its decorations with it.');
      return res;
    }, () => null).finally(() => { campStriking.delete(id); });
  }
  // Packed tents whose camp still has to be struck, retried each line-up until the service answers; dropped when a
  // load brings the tent back or another character plays. Memory only.
  /** @type {Map<string, { char: string|null, at: { px: number, py: number } | null, busy: boolean }>} */
  const campOwed = new Map();
  const owedAgain = (res) => !res || res.error === 'offline' || res.error === 'server';
  function settleOwed(recId) {
    const o = campOwed.get(recId);
    if (!o || o.busy || campAsking.has(recId)) return;
    if (o.char !== (deps.character?.() ?? null) || kitStands(recId)) { campOwed.delete(recId); return; }
    o.busy = true;
    Promise.resolve(keptCampOf({ id: recId }, o.at)).then((k) => {
      if (!k) return true;
      return k.id ? strikeKept(k.id, k.pieces).then((res) => !owedAgain(res)) : false;
    }).then((done) => { if (done) campOwed.delete(recId); }, () => {}).finally(() => { o.busy = false; });
  }
  function scenePixelOf(pos) {
    const t = deps.translation(0, 0);
    return { px: Math.floor((pos[0] - t[0]) / CAMP_PIXEL_M), py: -Math.floor((pos[2] - t[2]) / CAMP_PIXEL_M) };
  }
  /** @returns {{ id: string|null, pieces: number } | null | Promise<{ id: string|null, pieces: number } | null>} */
  function keptCampOf(rec, at = Array.isArray(rec.pos) ? scenePixelOf(rec.pos) : null) {
    const hit = (list) => list.find((c) => c?.mine && c.rec === rec.id) ?? null;
    const near = hit([...campsById.values()]);
    if (near || !deps.api?.campsNear || !at) return near ? { id: near.id, pieces: near.pieces.length } : null;
    return Promise.resolve(deps.api.campsNear(at.px, at.py)).then((r) => {
      if (!r?.ok) return { id: null, pieces: 1 };
      const c = hit((r.data?.camps ?? []).map(campOf));
      return c ? { id: c.id, pieces: c.pieces.length } : null;
    });
  }
  deps.campPool?.()?.keepCamps?.({
    loaded: () => seenRecs.clear(),
    free: () => deps.slotFree?.() ?? true,
    kept: keptCampOf,
    struck: (rec) => {
      campOwed.set(rec.id, { char: deps.character?.() ?? null, at: Array.isArray(rec.pos) ? scenePixelOf(rec.pos) : null, busy: false });
      settleOwed(rec.id);
    },
  });
  // Also packs this character's tent for the camp, so the line-up does not pitch it again.
  setCampPacker((c) => Promise.resolve(deps.api.campStrike(c.id)).then((res) => {
    if (!res?.ok && res?.error !== 'no-camp') return res;
    campsById.delete(c.id);
    campRefused.clear();
    if (c.char === deps.character?.()) deps.campPool?.()?.packTent?.(c.rec);
    return res;
  }));
  const campPiecesOf = (c) => (!c.mine && !kitStands(c.rec) ? [...c.pieces, ...campKitPieces(c.yaw)] : c.pieces);

  function ensure(mapId) {
    if (deps.heard?.() === false) return;
    const had = towns.get(mapId);
    if (had && now() - had.at < YARD_TOWN_TTL_MS) return;
    const f = failed.get(mapId);
    if (asking.has(mapId) || (f && now() - f.at < yardRetryMs(f.n))) return;
    const asked = wrote;
    const p = Promise.resolve().then(() => deps.api?.yards?.(mapId)).then((r) => {
      const list = r?.ok ? r.data?.yards : null;
      if (!Array.isArray(list)) { failed.set(mapId, { at: now(), n: (failed.get(mapId)?.n ?? 0) + 1 }); return; }
      const byKey = new Map();
      for (const y of list) {
        if (!Number.isSafeInteger(y?.buildingKey) || !Array.isArray(y.pieces)) continue;
        byKey.set(y.buildingKey, y.pieces.map(decorYardPieceOf).filter((p) => p && decorYardHighOk(p)));
      }
      for (const [bk, w] of writes.get(mapId) ?? []) if (w.n > asked || now() - w.at < YARD_WRITE_HOLD_MS) byKey.set(bk, w.list);
      towns.set(mapId, { at: now(), byKey });
      failed.delete(mapId);
    }, () => { failed.set(mapId, { at: now(), n: (failed.get(mapId)?.n ?? 0) + 1 }); }).finally(() => { asking.delete(mapId); });
    asking.set(mapId, p);
  }

  const entryOf = (y) => deps.built?.()?.get?.(`${y.px},${y.py}`) ?? null;
  const nature = createYardNature({ renderer: deps.renderer, getTexture: deps.getTexture, uploadRecord: deps.uploadRecord, seasonal: () => deps.seasonal?.() ?? null, trees: deps.trees ?? null });
  /** An older tree answer can land after a newer one, so a tree that its piece outlived plants nothing. */
  function plantTree(y, id, got, live) {
    if (!got?.tree || !live()) return got;
    const { tree, release } = got;
    y.trees.set(id, tree);
    y.treeSet = null;
    return { ...got, release: () => { if (y.trees.get(id) === tree) { y.trees.delete(id); y.treeSet = null; } release?.(); } };
  }
  function climateOf(y, gpu) {
    const p = entryOf(y);
    if (!p?.texRemap || p.townClimate == null) return null;
    return remapSubMeshes(gpu?.subMeshes, p.texRemap, (a, r) => applyClimate(a, r, p.townClimate, p.season), { getTexture: deps.getTexture, uploadRecord: deps.uploadRecord }, p.townClimate);
  }

  const originOf = (y) => {
    const t = deps.translation(y.px, y.py);
    const f = y.frame;
    return [t[0] + f.at[0], t[1] + f.at[1], t[2] + f.at[2]];
  };
  function makeYard(key, p, bk, frame, margin = YARD_MARGIN) {
    const y = { key, px: p.px, py: p.py, mapId: p.homeTown, bk, frame, t: [...deps.translation(p.px, p.py)], sig: '', src: null, srcSig: '', kept: false, lot: yardLot(frame.at, frame.box, margin, frame.rects), pool: null, entry: p, skin: p._skinGen ?? 0, trees: new Map(), treeSet: null };
    y.pool = createDecorRoom({
      meshes: deps.meshes, renderer: deps.renderer, getTexture: deps.getTexture, uploadRecord: deps.uploadRecord, uploadRecordFrame: deps.uploadRecordFrame,
      collider: () => deps.collider?.() ?? null, origin: () => originOf(y),
      lampOf: yardLampOf,
      merge,
      flatAnims: () => entryOf(y)?.flatAnims ?? null,
      prepareModel: (gpu) => climateOf(y, gpu),
      standFlat: (piece, at, live) => {
        if (!isNaturePiece(piece)) return null;
        const pe = entryOf(y);
        return nature.stand(piece, at, { season: pe?.season ?? 0, natureArchive: pe?.forest?.archive ?? null, live }).then((got) => plantTree(y, piece.id, got, live));
      },
    });
    yards.set(key, y);
    return y;
  }

  function withinReach(p, feet) {
    if (!feet) return true;
    const t = deps.translation(p.px, p.py);
    for (const [, frame] of p.homeFrames) {
      if (!frame?.at) return true;
      if (Math.hypot(t[0] + frame.at[0] - feet[0], t[2] + frame.at[2] - feet[2]) <= YARD_ASK_M) return true;
    }
    return false;
  }
  function sync() {
    const live = new Set();
    const feet = deps.feet?.() ?? null;
    let stands = YARD_STANDS_A_FRAME;
    let behind = false;
    for (const [pk, p] of deps.built?.() ?? []) {
      if (!p?.homeTown || !p.homeFrames) continue;
      if (withinReach(p, feet)) ensure(p.homeTown);
      const town = towns.get(p.homeTown);
      for (const [bk, frame] of p.homeFrames) {
        const home = deps.homes?.homeAt?.(p.homeTown, bk) ?? null;
        const pieces = homeDecorSeenByMe(home, p.homeTown, bk, homeDecorShown(home)) ? town?.byKey.get(bk) ?? null : null;
        if (!home || (!pieces?.length && !homeOutsideKept(home) && !home.decorator)) continue;
        if (!homeOutsideKept(home) && !home.decorator && range() === 0) continue;
        const key = `${pk}:${bk}`;
        live.add(key);
        const y = yards.get(key) ?? makeYard(key, p, bk, frame);
        const t = deps.translation(p.px, p.py);
        const moved = t[0] !== y.t[0] || t[1] !== y.t[1] || t[2] !== y.t[2];
        // Town lists are replaced, never mutated, so only a new list reference can hold a new answer.
        if (pieces && pieces !== y.src) { y.src = pieces; y.srcSig = JSON.stringify(pieces); }
        const sig = pieces ? y.srcSig : '';
        y.kept = homeOutsideKept(home);
        const rebuilt = y.entry !== p || y.skin !== (p._skinGen ?? 0);
        // While the owner's decorator writes this yard, the pieces on screen win and the town answer waits.
        const holding = cur?.yard === y && busyWriting();
        if (moved || rebuilt || (sig !== y.sig && !holding)) {
          if (stands <= 0 && !y.kept && cur?.yard !== y) { behind = true; continue; }
          stands--;
          y.t = [...t];
          y.entry = p;
          y.skin = p._skinGen ?? 0;
          if (!holding) y.sig = sig;
          y.pool.set(holding ? y.pool.list() : pieces ?? y.pool.list());
          deps.decorators?.stood(home, y.mapId, y.bk, y.pool);
        } else if (home.decorator) deps.decorators?.stood(home, y.mapId, y.bk, y.pool, false);
      }
    }
    for (const c of campsById.values()) {
      const p = deps.built?.()?.get?.(`${c.px},${c.py}`);
      if (!p || (!c.mine && range() === 0)) continue;
      const key = `camp:${c.id}`;
      live.add(key);
      let y = yards.get(key);
      if (!y) {
        const a = c.at;
        y = makeYard(key, p, 0, { at: [...a], box: [a[0] - 0.01, a[1], a[2] - 0.01, a[0] + 0.01, a[1] + 2, a[2] + 0.01], rects: null }, CAMP_RADIUS);
      }
      y.camp = c;
      y.mapId = null;
      y.kept = c.mine;
      const pieces = campPiecesOf(c);
      const t = deps.translation(p.px, p.py);
      const moved = t[0] !== y.t[0] || t[1] !== y.t[1] || t[2] !== y.t[2];
      const rebuilt = y.entry !== p || y.skin !== (p._skinGen ?? 0);
      const holding = cur?.yard === y && busyWriting();
      const sig = JSON.stringify(pieces);
      if (moved || rebuilt || (sig !== y.sig && !holding)) {
        y.t = [...t];
        y.entry = p;
        y.skin = p._skinGen ?? 0;
        if (!holding) y.sig = sig;
        y.pool.set(holding ? y.pool.list() : pieces);
      }
    }
    for (const [key, y] of yards) if (!live.has(key)) { y.pool.destroyAll(); yards.delete(key); }
    return behind;
  }
  const busyWriting = () => !!tool.flying() || !!tool.panelOpen();
  const remapOf = (y) => deps.built?.()?.get?.(`${y.px},${y.py}`)?.texRemap ?? null;

  function ownYardHere() {
    const feet = deps.feet?.();
    if (!feet || !deps.outside?.() || deps.heard?.() === false) return null;
    let best = null, bestRank = Infinity;
    for (const y of yards.values()) {
      const home = deps.homes?.homeAt?.(y.mapId, y.bk) ?? null;
      if (!homeOutsideKept(home) && !home?.decorator) continue;
      const o = originOf(y);
      if (!yardHolds(y.lot, o, feet, YARD_NEAR)) continue;
      const x = feet[0] - o[0], z = feet[2] - o[2], h = y.lot.house;
      const away = Math.hypot(Math.max(h[0] - x, 0, x - h[2]), Math.max(h[1] - z, 0, z - h[3]));
      const rank = (yardHolds(y.lot, o, feet) ? 0 : YARD_NEAR_ONLY) + away;
      if (rank < bestRank) { best = { y, home }; bestRank = rank; }
    }
    if (!best) return ownCampHere(feet);
    const { y, home } = best;
    const others = [], lines = [];
    const p = deps.built?.()?.get?.(`${y.px},${y.py}`);
    for (const [bk, f] of p?.homeFrames ?? []) {
      if (bk === y.bk) continue;
      const ground = f.rects?.length ? f.rects : [[f.box[0], f.box[2], f.box[3], f.box[5]]];
      const nb = deps.homes?.homeAt?.(y.mapId, bk) ?? null;
      const holds = yardLineHolder(f, bk, nb) && !(nb?.mine === true && !nb.hall && !home.hall);
      for (const r of ground) {
        const g = [r[0] - y.frame.at[0], r[1] - y.frame.at[2], r[2] - y.frame.at[0], r[3] - y.frame.at[2]];
        others.push(g);
        if (holds) lines.push(g);
      }
    }
    return { yard: y, others, lines, roads: yardRoadsOf(p, y.frame.at, y.lot), hall: !!home.hall, home };
  }

  function ownCampHere(feet) {
    let best = null, bestD = Infinity;
    for (const y of yards.values()) {
      if (!y.camp?.mine) continue;
      const o = originOf(y);
      const dx = Math.abs(feet[0] - o[0]), dz = Math.abs(feet[2] - o[2]);
      if (dx > CAMP_RADIUS + YARD_NEAR || dz > CAMP_RADIUS + YARD_NEAR) continue;
      if (dx + dz < bestD) { best = y; bestD = dx + dz; }
    }
    return best ? { yard: best, others: [], lines: [], roads: [], hall: false, camp: best.camp } : null;
  }

  const pool = {
    put: (p) => { cur?.yard.pool.put(p); keep(); },
    remove: (id) => { cur?.yard.pool.remove(id); keep(); },
    list: () => cur?.yard.pool.list() ?? [],
    pieceOf: (id) => cur?.yard.pool.pieceOf(id) ?? null,
    size: () => cur?.yard.pool.size() ?? 0,
    holdsAny: () => false, ownOf: () => null, keepOwn() {}, takeOwn: () => null, ownIds: () => [],
  };
  function keep() {
    const y = cur?.yard;
    if (!y) return;
    if (y.camp) {
      const list = y.pool.list();
      y.camp.pieces = list;
      y.sig = JSON.stringify(list);
      campRead.at = -Infinity;
      return;
    }
    const town = towns.get(y.mapId);
    const list = y.pool.list();
    if (town) town.byKey.set(y.bk, list);
    y.sig = JSON.stringify(list);
    if (!writes.has(y.mapId)) writes.set(y.mapId, new Map());
    writes.get(y.mapId).set(y.bk, { n: ++wrote, at: now(), list });
  }
  const campOn = () => (cur?.camp ? cur.camp.id : null);
  const homeDecor = deps.api ? {
    place: (a) => (campOn() ? deps.api.campPlace({ id: campOn(), character: a.character, piece: a.piece }) : deps.api.place({ ...a, yard: true })),
    move: (a) => (campOn() ? deps.api.campMove({ id: campOn(), character: a.character, pieceId: a.id, place: a.place }) : deps.api.move(a)),
    remove: (a) => (campOn() ? deps.api.campRemove({ id: campOn(), character: a.character, pieceId: a.id }) : deps.api.remove(a)),
    hidden: async () => ({ ok: false, error: 'bad-decor' }),
    ...(typeof deps.api.list === 'function' && typeof deps.api.batch === 'function' ? {
      list: (mapId, buildingKey) => deps.api.list(mapId, buildingKey, false, true),
      batch: (a) => deps.api.batch({ ...a, yard: true }),
    } : {}),
  } : null;
  const collider = {
    raycastHit: (o, d, m, f = null) => deps.collider?.()?.surfaceHit?.(o, d, m, f) ?? deps.collider?.()?.raycastHit?.(o, d, m, f) ?? null,
  };
  const names = new Map();
  const hallWords = (why) => (cur?.hall && why === YARD_IN_HOUSE ? YARD_IN_HALL : why);
  const tool = createDecorTool({
    doc: deps.doc ?? null, win: deps.win ?? null, canvas: deps.canvas ?? null, touch: !!deps.touch, renderer: deps.renderer, pool, names,
    room: () => (cur?.camp ? { kind: 'home', yard: true, free: true, cap: CAMP_CAP, where: cur.camp.name, mapId: 0, buildingKey: 0, camp: cur.camp.id, natureBase: entryOf(cur.yard)?.forest?.base ?? null }
      : cur?.home?.decorator && !cur.home.own ? deps.decorators?.roomHere(cur.home, cur.yard.mapId, cur.yard.bk, true) ?? null
      : cur ? { kind: 'home', yard: true, ...(cur.hall ? { hall: true } : {}), where: homeYardWhere(cur), mapId: cur.yard.mapId, buildingKey: cur.yard.bk, natureBase: entryOf(cur.yard)?.forest?.base ?? null } : null),
    flatAs: (flat) => (cur && isNatureArchive(flat?.[0]) ? yardNatureFlat(flat, entryOf(cur.yard)?.season ?? 0) : flat),
    flatPicture: (flat) => (cur && isNatureArchive(flat?.[0]) ? nature.picture(flat, entryOf(cur.yard)?.season ?? 0, entryOf(cur.yard)?.forest?.archive ?? null) : null),
    prepareModel: (gpu) => (cur ? climateOf(cur.yard, gpu) : null),
    scanDeps: () => deps.scanDeps(),
    base: () => null,
    getGpuMesh: (id) => deps.meshes.getGpuMesh(id), cpuModels: deps.meshes.cpuModels, getTexture: deps.getTexture, uploadRecord: deps.uploadRecord, iconUrl: deps.iconUrl,
    ...(deps.meshes.hold ? { thumbHold: () => deps.meshes.hold('decor-thumbs', 'yard') } : {}),
    collider: () => collider, origin: () => (cur ? originOf(cur.yard) : [0, 0, 0]), eye: () => deps.eye?.() ?? [0, 0, 0],
    stick: () => deps.stick?.() ?? null, actionOf: (e) => deps.actionOf?.(e) ?? null,
    locked: () => !!deps.locked?.(), cursorOff: () => deps.cursorOff?.(),
    wallet: () => deps.wallet(cur ? deps.regionOf?.(cur.yard) ?? 0 : 0), homeDecor, character: () => deps.character?.() ?? null,
    realm: () => deps.realm?.() ?? null,
    pack: () => [], identity: () => null, furnishings: () => [], packHas: () => false, packTake: () => null, packGive() {},
    visit: () => (cur ? `${cur.yard.mapId}:${cur.yard.bk}` : null),
    openSlot: (o) => deps.openSlot?.(o), closeSlot: () => {},
    say: (l) => deps.say?.(l), refusal: (w) => deps.refusal?.(w) ?? null, now,
    placeOk: (piece, foot) => (cur?.camp ? campWhyNot(piece, foot) : cur ? hallWords(yardWhyNot(piece.pos, cur.yard.lot, cur.others, foot, cur.roads, cur.lines)) : YARD_OFF_LOT),
    lot: () => {
      if (!cur) return [];
      const o = originOf(cur.yard), key = `${o.join(',')}|${cur.lines.length}|${cur.roads.length}`;
      if (lotMarks.yard !== cur.yard.lot || lotMarks.key !== key) {
        lotMarks = { yard: cur.yard.lot, key, quads: yardLotQuads(cur.yard.lot, o, YARD_MARK_HIGH, cur.roads, cur.lines) };
      }
      return lotMarks.quads;
    },
    yardCap: DECOR_YARD_CAP,
    template: deps.decorators ?? null, decorators: () => (cur && !cur.camp ? deps.decorators?.openerHere() ?? null : null),
    look: () => (cur && !cur.camp && deps.look ? lookDoor(cur.yard) : null),
  });

  const lookCounts = new Map();
  function lookRecordsOf(part, climate) {
    const season = deps.look?.season?.() ?? 0;
    const k = `${part}:${climate}:${season}`;
    if (!lookCounts.has(k)) {
      lookCounts.set(k, null);
      homeLookRecords(part, climate, season, deps.getTexture).then((n) => lookCounts.set(k, n > 0 ? n : null), () => lookCounts.delete(k));
    }
    return lookCounts.get(k) ?? null;
  }
  function lookDoor(y) {
    const home = deps.homes?.homeAt?.(y.mapId, y.bk) ?? null;
    return {
      current: home?.look ?? null,
      season: deps.look.season?.() ?? 0,
      records: (part, climate) => lookRecordsOf(part, climate),
      preview: (look) => deps.look.preview(y.mapId, y.bk, look),
      commit: async (look) => {
        const r = await deps.homes.setLook(y.mapId, y.bk, look);
        deps.look.preview(y.mapId, y.bk, undefined);
        return r;
      },
    };
  }

  /** @param {{ dt: number, cam: any, overlayUp: boolean }} f */
  function frame({ dt, cam, overlayUp }) {
    syncIn -= dt > 0 ? dt : 0;
    if (syncIn > 0) for (const y of yards.values()) { const t = deps.translation(y.px, y.py), e = entryOf(y); if (t[0] !== y.t[0] || t[1] !== y.t[1] || t[2] !== y.t[2] || e !== y.entry || (e?._skinGen ?? 0) !== y.skin) { syncIn = 0; break; } }
    if (syncIn <= 0) {
      if (deps.outside?.()) readCamps();
      syncIn = sync() ? 0 : YARD_SYNC_S;
    }
    campLineIn -= dt > 0 ? dt : 0;
    if (campLineIn <= 0) { campLineIn = CAMP_LINE_S; lineUpCamps(); }
    if (!tool.flying() && !tool.panelOpen()) cur = ownYardHere();
    else if (cur && yards.get(cur.yard.key) !== cur.yard) {
      // The pixel can be rebuilt under the open decorator, which then follows the new yard, never the old one.
      const again = yards.get(cur.yard.key) ?? null;
      if (again) cur = { ...cur, yard: again }; else { tool.close(); cur = null; }
    }
    tool.frame({ dt, cam, overlayUp, interior: !!cur });
  }

  /** The host recenter calls this before the draw, so each yard moves in place in the same frame. */
  function rebase() {
    for (const y of yards.values()) {
      const t = deps.translation(y.px, y.py);
      if (t[0] === y.t[0] && t[1] === y.t[1] && t[2] === y.t[2]) continue;
      y.t = [...t];
      y.pool.restand();
    }
  }

  const _treeSets = [];
  function treeSets() {
    _treeSets.length = 0;
    for (const y of yards.values()) {
      if (!y.trees.size) continue;
      y.treeSet ??= { ox: 0, oy: 0, oz: 0, ...yardTreeSet([...y.trees.values()]) };
      const o = originOf(y);
      y.treeSet.ox = o[0]; y.treeSet.oy = o[1]; y.treeSet.oz = o[2];
      _treeSets.push(y.treeSet);
    }
    return _treeSets;
  }

  const _lamps = [];
  function lamps() {
    _lamps.length = 0;
    for (const y of yards.values()) y.pool.pushLights(_lamps, YARD_LAMPS_MAX);
    return _lamps;
  }

  return {
    frame,
    rebase,
    keepDraft: (rev) => tool.keepDraft(rev),
    decoratorHere: () => (cur && !cur.camp && cur.home ? { home: cur.home, mapId: cur.yard.mapId, buildingKey: cur.yard.bk, pool: cur.yard.pool, region: deps.regionOf?.(cur.yard) ?? 0 } : null),
    draw(r = deps.renderer) {
      let n = 0;
      const eye = deps.eye?.() ?? null;
      const cull = deps.cull ?? null;
      mergesLeft = YARD_MERGES_A_FRAME;
      for (const y of yards.values()) {
        if (!nearEye(y, eye)) continue;
        _eye = y === cur?.yard ? null : eye;
        n += y.pool.draw(r, remapOf(y), _eye || cull ? seenCull : null);
      }
      _eye = null;
      tool.draw(r, cur ? remapOf(cur.yard) : null);
      return n;
    },
    batches() {
      _batches.length = 0;
      const eye = deps.eye?.() ?? null;
      for (const y of yards.values()) if (nearEye(y, eye)) y.pool.batchesSeen(_batches, y === cur?.yard ? null : eye, YARD_MIN_ANGLE);
      for (const b of tool.batches()) _batches.push(b);
      return _batches;
    },
    figures: () => {
      yardFigs.length = 0;
      const eye = deps.eye?.() ?? null;
      for (const y of yards.values()) if (nearEye(y, eye)) for (const e of y.pool.figures()) yardFigs.push(e);
      return yardFigs;
    },
    treeSets,
    lamps,
    drawDecals: (r = deps.renderer) => tool.drawMounts(r),
    drawPreview: () => tool.drawPreview(cur ? remapOf(cur.yard) : null),
    cameraOverride: (c) => tool.cameraOverride(c),
    flying: () => tool.flying(),
    panelOpen: () => tool.panelOpen(),
    targets() {
      if (!tool.flying() || tool.ghost()) return [];
      return cur?.yard.pool.targets() ?? [];
    },
    hoverName(key) {
      if (!tool.flying() || tool.ghost() || typeof key !== 'string' || !key.startsWith('decor:')) return null;
      const piece = cur?.yard.pool.pieceOf(key.slice('decor:'.length)) ?? null;
      if (!piece) return null;
      const named = piece.model != null || piece.flat ? names.get(decorKey(piece)) : null;
      return decorPlaque(null, { piece, mayEdit: true, name: piece.name || named || null });
    },
    press(eye, dir) {
      if (!tool.flying() || tool.ghost()) return false;
      const hit = pickActivatableHit(eye, dir, cur?.yard.pool.targets() ?? [], deps.collider?.() ?? null);
      if (typeof hit?.key !== 'string' || !hit.key.startsWith('decor:')) return false;
      const verb = plaqueActionFor(hit.key);
      if (verb) tool.act(verb, hit.key.slice('decor:'.length));
      return true;
    },
    yards: () => [...yards.values()],
    here: () => cur,
    tool: () => tool,
    destroy() { for (const y of yards.values()) y.pool.destroyAll(); yards.clear(); tool.destroy(); },
  };
}
