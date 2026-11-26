// Paints roads at the terrain pipeline's one seam: after generateTileData classifies the ground and before
// assignTiles runs its marching squares.

import { DIR } from './roadNetwork.js';

export const TILE = Object.freeze({
  water: 0, dirt: 1, grass: 2, stone: 3,
  road: 46, roadDirt: 47, roadGrass: 55,
  NO_CHANGE: 99,
  ROTATE: 64, FLIP: 128,
});

const NC = TILE.NO_CHANGE;
export const ROAD_TILES = Object.freeze([
  [46, 46, 46, 46],
  null,
  [46, 46, 46, 46],
  [47, 47, 55, 55],
  null,
  null,
]);
export const TRACK_TILES = Object.freeze([
  [0, NC, 11, 26], null, [0, NC, 51, 52], [0, NC, 12, 27], null, [0, NC, 10, 25],
]);
export const STREAM_TILES = Object.freeze([
  [0, 6, 21, 31], null, [0, 48, 49, 50], [0, 7, 22, 32], null, [0, 5, 20, 30],
]);
export const RIVER_TILES = Object.freeze([
  [0, 0, 0, 0], [0, 6, 21, 31], [0, 0, 0, 0], [0, 5, 20, 30], [0, 7, 22, 32], [0, 5, 20, 30],
]);
const CARD_INN = 0, CARD_OUT = 1, DIAG_INN = 2, DIAG_OUT = 3, DIAG_GAP = 4, ICORNER = 5;

const DIM = 128;
const MID_LO = 63, MID_HI = 64;

export function pathCorners(mask, x, y, w = 1000) {
  const east = x + 1 < w ? mask[y * w + x + 1] : 0;
  const west = x > 0 ? mask[y * w + x - 1] : 0;
  return (east & 0x5) | (west & 0x50);
}

/**
 * @param {object} masks
 * @param {object} corners
 */
export function paintRoads(tileData, tilemap, roadMask, trackMask, locationRect = null, tdDim = 129, opts = {}) {
  const masks = { road: roadMask | 0, track: trackMask | 0, river: opts.river | 0, stream: opts.stream | 0 };
  const corners = { road: opts.corners?.road | 0, track: opts.corners?.track | 0, river: opts.corners?.river | 0, stream: opts.corners?.stream | 0 };
  const water = !!opts.water;
  const paths = opts.paths ?? null;
  const anyCorner = corners.road || corners.track || (water && (corners.river || corners.stream));
  if (!masks.road && !masks.track && !(water && (masks.river || masks.stream)) && !anyCorner) return 0;
  let painted = 0;
  const ctx = { tilemap, i: 0, x: 0, y: 0, ground: 0, rect: locationRect, paths };
  for (let y = 0; y < DIM; y++) {
    for (let x = 0; x < DIM; x++) {
      if (!(x >= MID_LO - 1 && x <= MID_HI + 1) && !(y >= MID_LO - 1 && y <= MID_HI + 1)
        && Math.abs(x - y) > 2 && Math.abs(DIM - 1 - x - y) > 2
        && !(locationRect && x > locationRect.xMin && x < locationRect.xMax && y > locationRect.yMin && y < locationRect.yMax)) continue;
      const i = y * DIM + x;
      if (tilemap[i] !== 0) continue;
      let ground = tileData[y * tdDim + x];
      if (ground > TILE.stone) ground = TILE.grass;
      ctx.i = i; ctx.x = x; ctx.y = y; ctx.ground = ground;
      if (paintPath(ctx, ROAD_TILES, masks.road, corners.road)) { painted++; continue; }
      if (water && paintPathWithSubPathJoins(ctx, RIVER_TILES, masks.river, corners.river, masks.stream)) { painted++; continue; }
      if (water && paintPath(ctx, STREAM_TILES, masks.stream, corners.stream)) { painted++; continue; }
      if (paintPath(ctx, TRACK_TILES, masks.track, corners.track)) painted++;
    }
  }
  return painted;
}

function tile(ctx, slot, rotate, flip, overwrite = true) {
  if (!slot) return false;
  if (!overwrite && ctx.tilemap[ctx.i] !== 0) return false;
  const t = slot[ctx.ground];
  if (t === NC) { if (ctx.paths) ctx.paths[ctx.i] = 1; return false; }
  let v = t;
  // Rotate and flip bits are added before the zero check, as in DFU's RotateFlipTile, so only bare water is 0xFF.
  if (rotate) v += TILE.ROTATE;
  if (flip) v += TILE.FLIP;
  ctx.tilemap[ctx.i] = v === 0 ? 0xff : v;
  if (ctx.paths) ctx.paths[ctx.i] = 1;
  return true;
}

function paintPath(ctx, T, m, corners) {
  const { x, y } = ctx;
  if (!m && !corners) return false;
  let has = false;
  if ((((m & DIR.N) && (x === MID_LO || x === MID_HI) && y > MID_LO) || ((m & DIR.S) && (x === MID_LO || x === MID_HI) && y < MID_HI)) && T[CARD_INN]) {
    has = tile(ctx, T[CARD_INN], false, x === MID_HI) || has;
  }
  if ((((m & DIR.N) && (x === MID_LO || x === MID_HI) && y === MID_LO) || ((m & DIR.S) && (x === MID_LO || x === MID_HI) && y === MID_HI)) && T[DIAG_OUT]) {
    has = tile(ctx, T[DIAG_OUT], x === y, x === MID_HI, false) || has;
  }
  if ((((m & DIR.E) && (y === MID_LO || y === MID_HI) && x > MID_LO) || ((m & DIR.W) && (y === MID_LO || y === MID_HI) && x < MID_HI)) && T[CARD_INN]) {
    has = tile(ctx, T[CARD_INN], true, y === MID_HI) || has;
  }
  if ((((m & DIR.E) && (y === MID_LO || y === MID_HI) && x === MID_LO) || ((m & DIR.W) && (y === MID_LO || y === MID_HI) && x === MID_HI)) && T[DIAG_OUT]) {
    has = tile(ctx, T[DIAG_OUT], x === y, x === MID_HI, false) || has;
  }
  if ((((m & DIR.NE) && x === y && x > MID_LO) || ((m & DIR.SW) && x === y && x < MID_HI)) && T[DIAG_INN]) {
    has = tile(ctx, T[DIAG_INN], false, false) || has;
  }
  if ((((m & DIR.NE) && ((x === y + 1 && x > MID_LO) || (x + 1 === y && y > MID_LO))) || ((m & DIR.SW) && ((x === y + 1 && x <= MID_HI) || (x + 1 === y && y <= MID_HI)))) && T[DIAG_OUT] && !has) {
    has = tile(ctx, T[DIAG_OUT], false, x === y + 1) || has;
  }
  const xm = DIM - 1 - x;
  if ((((m & DIR.NW) && xm === y && x < MID_HI) || ((m & DIR.SE) && xm === y && x > MID_LO)) && T[DIAG_INN]) {
    has = tile(ctx, T[DIAG_INN], true, false) || has;
  }
  if ((((m & DIR.NW) && ((xm === y + 1 && x < MID_HI) || (xm + 1 === y && y > MID_LO))) || ((m & DIR.SE) && ((xm === y + 1 && x >= MID_LO) || (xm + 1 === y && y <= MID_HI)))) && T[DIAG_OUT] && !has) {
    has = tile(ctx, T[DIAG_OUT], true, xm !== y + 1) || has;
  }
  if (T[CARD_OUT] && !has) {
    if (((m & DIR.N) && (x === MID_LO - 1 || x === MID_HI + 1) && y > MID_LO) || ((m & DIR.S) && (x === MID_LO - 1 || x === MID_HI + 1) && y < MID_HI)) {
      has = tile(ctx, T[CARD_OUT], false, x === MID_HI + 1, false) || has;
    }
    if (((m & DIR.E) && (y === MID_LO - 1 || y === MID_HI + 1) && x > MID_LO) || ((m & DIR.W) && (y === MID_LO - 1 || y === MID_HI + 1) && x < MID_HI)) {
      has = tile(ctx, T[CARD_OUT], true, y === MID_HI + 1) || has;
    }
  }
  if (T[DIAG_GAP] && !has) {
    if (((m & DIR.NE) && ((x - 1 === y + 1 && x > MID_LO) || (x + 1 === y - 1 && y > MID_LO))) || ((m & DIR.SW) && ((x - 1 === y + 1 && x <= MID_HI) || (x + 1 === y - 1 && y <= MID_HI)))) {
      has = tile(ctx, T[DIAG_GAP], false, x - 1 === y + 1) || has;
    }
    if (((m & DIR.NW) && ((xm - 1 === y + 1 && x < MID_HI) || (xm + 1 === y - 1 && y > MID_LO))) || ((m & DIR.SE) && ((xm - 1 === y + 1 && x >= MID_LO) || (xm + 1 === y - 1 && y <= MID_HI)))) {
      has = tile(ctx, T[DIAG_GAP], true, xm - 1 !== y + 1) || has;
    }
  }
  if (T[ICORNER]) {
    const o = T[CARD_OUT] ? 1 : 0;
    if ((m & DIR.N) && (m & DIR.W) && x === MID_LO - o && y === MID_HI + o) tile(ctx, T[ICORNER], false, false);
    if ((m & DIR.N) && (m & DIR.E) && x === MID_HI + o && y === MID_HI + o) tile(ctx, T[ICORNER], true, true);
    if ((m & DIR.S) && (m & DIR.W) && x === MID_LO - o && y === MID_LO - o) tile(ctx, T[ICORNER], true, false);
    if ((m & DIR.S) && (m & DIR.E) && x === MID_HI + o && y === MID_LO - o) tile(ctx, T[ICORNER], false, true);
  }
  if (m && ctx.rect && T === ROAD_TILES && x > ctx.rect.xMin && x < ctx.rect.xMax && y > ctx.rect.yMin && y < ctx.rect.yMax) {
    ctx.tilemap[ctx.i] = 46;
    if (ctx.paths) ctx.paths[ctx.i] = 1;
    return true;
  }
  if (corners && T[DIAG_OUT]) {
    if ((corners & DIR.NW) && x === DIM - 1 && y === DIM - 1) has = tile(ctx, T[DIAG_OUT], true, false) || has;
    if ((corners & DIR.SW) && x === DIM - 1 && y === 0) has = tile(ctx, T[DIAG_OUT], false, false) || has;
    if ((corners & DIR.SE) && x === 0 && y === 0) has = tile(ctx, T[DIAG_OUT], true, true) || has;
    if ((corners & DIR.NE) && x === 0 && y === DIM - 1) has = tile(ctx, T[DIAG_OUT], false, true) || has;
  }
  return has;
}

function paintPathWithSubPathJoins(ctx, T, m, corners, sub) {
  const has = paintPath(ctx, T, m, corners);
  const { x, y } = ctx;
  const water = () => { ctx.tilemap[ctx.i] = 0xff; if (ctx.paths) ctx.paths[ctx.i] = 1; };
  const ic = (rotate, flip) => tile(ctx, T[ICORNER], rotate, flip);
  const co = (rotate, flip) => tile(ctx, T[CARD_OUT], rotate, flip);
  if (corners) {
    if (((corners & DIR.NW) && (sub & DIR.NE) && x === DIM - 1 && y === DIM - 1)
      || ((corners & DIR.SW) && (sub & DIR.SE) && x === DIM - 1 && y === 0)
      || ((corners & DIR.SE) && (sub & DIR.SW) && x === 0 && y === 0)
      || ((corners & DIR.NE) && (sub & DIR.NW) && x === 0 && y === DIM - 1)) water();
  }
  if (sub && T[ICORNER]) {
    const o = T[CARD_OUT] ? 1 : 0;
    if ((m & DIR.N) && (sub & DIR.W) && x === MID_LO - o && y === MID_HI && !(m & DIR.W)) ic(false, false);
    if ((m & DIR.N) && (sub & DIR.E) && x === MID_HI + o && y === MID_HI && !(m & DIR.E)) ic(true, true);
    if ((m & DIR.S) && (sub & DIR.W) && x === MID_LO - o && y === MID_LO && !(m & DIR.W)) ic(true, false);
    if ((m & DIR.S) && (sub & DIR.E) && x === MID_HI + o && y === MID_LO && !(m & DIR.E)) ic(false, true);

    if ((m & DIR.N) && (sub & DIR.NW) && x === MID_LO - o && y === MID_HI + 1 && !(m & DIR.W)) ic(true, false);
    if ((m & DIR.N) && (sub & DIR.NW) && x === MID_LO - o && y === MID_HI + 2) ic(false, false);
    if ((m & DIR.N) && (sub & DIR.NE) && x === MID_HI + o && y === MID_HI + 1 && !(m & DIR.E)) ic(false, true);
    if ((m & DIR.N) && (sub & DIR.NE) && x === MID_HI + o && y === MID_HI + 2) ic(true, true);

    if ((m & DIR.S) && (sub & DIR.SW) && x === MID_LO - o && y === MID_LO - 1 && !(m & DIR.W)) ic(false, false);
    if ((m & DIR.S) && (sub & DIR.SW) && x === MID_LO - o && y === MID_LO - 2) ic(true, false);
    if ((m & DIR.S) && (sub & DIR.SE) && x === MID_HI + o && y === MID_LO - 1 && !(m & DIR.E)) ic(true, true);
    if ((m & DIR.S) && (sub & DIR.SE) && x === MID_HI + o && y === MID_LO - 2) ic(false, true);

    if ((m & DIR.W) && (sub & DIR.N) && x === MID_LO && y === MID_HI + o && !(m & DIR.N)) ic(false, false);
    if ((m & DIR.E) && (sub & DIR.N) && x === MID_HI && y === MID_HI + o && !(m & DIR.N)) ic(true, true);
    if ((m & DIR.W) && (sub & DIR.S) && x === MID_LO && y === MID_LO - o && !(m & DIR.S)) ic(true, false);
    if ((m & DIR.E) && (sub & DIR.S) && x === MID_HI && y === MID_LO - o && !(m & DIR.S)) ic(false, true);

    if ((m & DIR.E) && (sub & DIR.NE) && x === MID_HI + 1 && y === MID_HI + o && !(m & DIR.N)) ic(false, false);
    if ((m & DIR.E) && (sub & DIR.NE) && x === MID_HI + 2 && y === MID_HI + o) ic(true, true);
    if ((m & DIR.E) && (sub & DIR.SE) && x === MID_HI + 1 && y === MID_LO - o && !(m & DIR.S)) ic(true, false);
    if ((m & DIR.E) && (sub & DIR.SE) && x === MID_HI + 2 && y === MID_LO - o) ic(false, true);

    if ((m & DIR.W) && (sub & DIR.NW) && x === MID_LO - 1 && y === MID_HI + o && !(m & DIR.N)) ic(true, true);
    if ((m & DIR.W) && (sub & DIR.NW) && x === MID_LO - 2 && y === MID_HI + o) ic(false, false);
    if ((m & DIR.W) && (sub & DIR.SW) && x === MID_LO - 1 && y === MID_LO - o && !(m & DIR.S)) ic(false, true);
    if ((m & DIR.W) && (sub & DIR.SW) && x === MID_LO - 2 && y === MID_LO - o) ic(true, false);

    if (T[CARD_OUT]) {
      if ((m & DIR.NE) && (sub & DIR.SE) && x === MID_HI && y === MID_LO && !(m & DIR.SE)) water();
      if ((m & DIR.NE) && (sub & DIR.SE) && x === MID_HI + o && y === MID_LO && !(m & DIR.SE)) {
        if (!(m & DIR.E) && (sub & DIR.E)) {
          ic(false, true);
        } else {
          co(false, true);
        }
      } else if ((m & DIR.NE) && (sub & DIR.E) && x === MID_HI + 1 && y === MID_LO) co(true, false);

      if ((m & DIR.NE) && (sub & DIR.E) && x === MID_HI + 1 && y === MID_HI) water();
      if ((m & DIR.NE) && (sub & DIR.E) && x === MID_HI + 2 && y === MID_HI) ic(true, true);

      if ((m & DIR.SW) && (sub & DIR.SE) && x === MID_HI && y === MID_LO && !(m & DIR.SE)) water();
      if ((m & DIR.SW) && (sub & DIR.SE) && x === MID_HI && y === MID_LO - o && !(m & DIR.SE)) {
        if (!(m & DIR.S) && (sub & DIR.S)) {
          ic(false, true);
        } else {
          co(true, false);
        }
      } else if ((m & DIR.SW) && (sub & DIR.S) && x === MID_HI && y === MID_LO - 1) co(false, true);

      if ((m & DIR.SW) && (sub & DIR.S) && x === MID_LO && y === MID_LO - 1) water();
      if ((m & DIR.SW) && (sub & DIR.S) && x === MID_LO && y === MID_LO - 2) ic(true, false);


      if ((m & DIR.NE) && (sub & DIR.NW) && x === MID_LO && y === MID_HI && !(m & DIR.NW)) water();
      if ((m & DIR.NE) && (sub & DIR.NW) && x === MID_LO && y === MID_HI + o && !(m & DIR.NW)) {
        if (!(m & DIR.N) && (sub & DIR.N)) {
          ic(false, false);
        } else {
          co(true, true);
        }
      } else if ((m & DIR.NE) && (sub & DIR.N) && x === MID_LO && y === MID_HI + 1) co(false, false);

      if ((m & DIR.NE) && (sub & DIR.N) && x === MID_HI && y === MID_HI + 1) water();
      if ((m & DIR.NE) && (sub & DIR.N) && x === MID_HI && y === MID_HI + 2) ic(true, true);

      if ((m & DIR.SW) && (sub & DIR.NW) && x === MID_LO && y === MID_HI && !(m & DIR.SE)) water();
      if ((m & DIR.SW) && (sub & DIR.NW) && x === MID_LO - o && y === MID_HI && !(m & DIR.SE)) {
        if (!(m & DIR.W) && (sub & DIR.W)) {
          ic(false, false);
        } else {
          co(false, false);
        }
      } else if ((m & DIR.SW) && (sub & DIR.W) && x === MID_LO - 1 && y === MID_HI) co(true, true);

      if ((m & DIR.SW) && (sub & DIR.W) && x === MID_LO - 1 && y === MID_LO) water();
      if ((m & DIR.SW) && (sub & DIR.W) && x === MID_LO - 2 && y === MID_LO) ic(true, false);


      if ((m & DIR.NW) && (sub & DIR.SW) && x === MID_LO && y === MID_LO && !(m & DIR.SW)) water();
      if ((m & DIR.NW) && (sub & DIR.SW) && x === MID_LO - o && y === MID_LO && !(m & DIR.SW)) {
        if (!(m & DIR.E) && (sub & DIR.W)) {
          ic(true, false);
        } else {
          co(false, false);
        }
      } else if ((m & DIR.NW) && (sub & DIR.W) && x === MID_LO - 1 && y === MID_LO) co(true, false);

      if ((m & DIR.NW) && (sub & DIR.W) && x === MID_LO - 1 && y === MID_HI) water();
      if ((m & DIR.NW) && (sub & DIR.W) && x === MID_LO - 2 && y === MID_HI) ic(false, false);

      if ((m & DIR.SE) && (sub & DIR.SW) && x === MID_LO && y === MID_LO && !(m & DIR.SW)) water();
      if ((m & DIR.SE) && (sub & DIR.SW) && x === MID_LO && y === MID_LO - o && !(m & DIR.SW)) {
        if (!(m & DIR.S) && (sub & DIR.S)) {
          ic(true, false);
        } else {
          co(true, false);
        }
      } else if ((m & DIR.SE) && (sub & DIR.S) && x === MID_LO && y === MID_LO - 1) co(false, false);

      if ((m & DIR.SE) && (sub & DIR.S) && x === MID_HI && y === MID_LO - 1) water();
      if ((m & DIR.SE) && (sub & DIR.S) && x === MID_HI && y === MID_LO - 2) ic(false, true);


      if ((m & DIR.NW) && (sub & DIR.NE) && x === MID_HI && y === MID_HI && !(m & DIR.NE)) water();
      if ((m & DIR.NW) && (sub & DIR.NE) && x === MID_HI && y === MID_HI + o && !(m & DIR.NE)) {
        if (!(m & DIR.N) && (sub & DIR.N)) {
          ic(true, true);
        } else {
          co(true, true);
        }
      } else if ((m & DIR.NW) && (sub & DIR.N) && x === MID_HI && y === MID_HI + 1) co(false, true);

      if ((m & DIR.NW) && (sub & DIR.N) && x === MID_LO && y === MID_HI + 1) water();
      if ((m & DIR.NW) && (sub & DIR.N) && x === MID_LO && y === MID_HI + 2) ic(false, false);

      if ((m & DIR.SE) && (sub & DIR.NE) && x === MID_HI && y === MID_HI && !(m & DIR.NE)) water();
      if ((m & DIR.SE) && (sub & DIR.NE) && x === MID_HI + o && y === MID_HI && !(m & DIR.NE)) {
        if (!(m & DIR.E) && (sub & DIR.E)) {
          ic(true, true);
        } else {
          co(false, true);
        }
      } else if ((m & DIR.SE) && (sub & DIR.E) && x === MID_HI + 1 && y === MID_HI) co(true, true);

      if ((m & DIR.SE) && (sub & DIR.E) && x === MID_HI + 1 && y === MID_LO) water();
      if ((m & DIR.SE) && (sub & DIR.E) && x === MID_HI + 2 && y === MID_LO) ic(false, true);
    }
  }
  return has;
}

export function classify(x, y, mask) {
  const t = new Uint8Array(DIM * DIM);
  const ctx = { tilemap: t, i: y * DIM + x, x, y, ground: TILE.grass };
  const has = paintPath(ctx, ROAD_TILES, mask, 0);
  if (!has) return null;
  const v = t[ctx.i];
  return { centre: (v & 0x3f) === 46, rotate: !!(v & TILE.ROTATE), flip: !!(v & TILE.FLIP), diag: false };
}

/**
 * @param {Float32Array} samples
 * @param {Uint8Array} tilemap
 * @returns {number}
 */
export const SMOOTHED_TILES = Object.freeze(new Set([46, 0xff]));
export function smoothRoadHeights(samples, tilemap, hDim = 129, rect = null) {
  const tDim = hDim - 1;
  let n = 0;
  const smooth = (idx) => {
    samples[idx] = (samples[idx] + samples[idx + hDim] + samples[idx + 1] + samples[idx - hDim] + samples[idx - 1]) / 5;
    n++;
  };
  for (let y = 1; y < hDim - 2; y++) {
    for (let x = 1; x < hDim - 2; x++) {
      if (rect && x >= rect.xMin && x < rect.xMax && y >= rect.yMin && y < rect.yMax) continue;
      const tile = tilemap[y * tDim + x];
      if (tile !== 46 && tile !== 0xff) continue;
      const idx = x * hDim + y;
      smooth(idx); smooth(idx + 1); smooth(idx + hDim); smooth(idx + hDim + 1);
    }
  }
  return n;
}
