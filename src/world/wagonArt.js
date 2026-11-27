// @ts-check
import { C, picture, put, get, mix, shade, paintNoise as noise, paintBand as band, planks, GALLEON_TEX_SIZE, ironArt } from './galleonArt.js';
import { mulberry32 } from '../combat/bloodArt.js';

export const WAGON_ARCHIVE = 38181;
export const TEX = Object.freeze({
  floor: 0, side: 1, inner: 2, beam: 3, bench: 4, tyre: 5, wheel: 6, iron: 7,
  openSide: 8, tilt: 9, tiltInner: 10,
  caravanSide: 11, caravanFront: 12, caravanRear: 13, caravanRoof: 14,
  roomSide: 15, roomFront: 16, roomRear: 17, roomCeiling: 18, roomFloor: 19,
  harness: 20,
});
export const WAGON_TILE = Object.freeze({
  floor: [1.6, 1.6], side: [1.6, 1.6], inner: [1.6, 1.6], beam: [1.2, 1.2], bench: [1.2, 1.2], tyre: [1.2, 1.2], wheel: [0, 0],
  iron: [1, 1], openSide: [1.3, 0], tilt: [1.3, 1.3], tiltInner: [1.3, 1.3], caravanSide: [2.9, 0], caravanFront: [0, 0],
  caravanRear: [0, 0], caravanRoof: [1.6, 1.6],
  roomSide: [2.9, 0], roomFront: [0, 0], roomRear: [0, 0], roomCeiling: [1.6, 1.6], roomFloor: [1.6, 1.6],
  harness: [0, 0.5],
});
export const SIDE_Y0 = 0.94, SIDE_Y1 = 3.06;
export const BANDS = Object.freeze({
  openSide: Object.freeze({ y0: SIDE_Y0, y1: SIDE_Y1, recs: Object.freeze([TEX.openSide]) }),
  caravanSide: Object.freeze({ y0: SIDE_Y0, y1: SIDE_Y1, recs: Object.freeze([TEX.caravanSide]) }),
  roomSide: Object.freeze({ y0: SIDE_Y0, y1: SIDE_Y1, recs: Object.freeze([TEX.roomSide]) }),
});
export const OPEN_RAIL_Y = 1.62;

export const K = Object.freeze({
  green: [42, 74, 52], greenLit: [62, 100, 72], greenDark: [24, 44, 30],
  roof: [36, 48, 38], roofLit: [56, 70, 56],
  weather: [118, 108, 92], board: [112, 84, 56], boardDark: [78, 56, 36], nail: [40, 36, 34],
  hub: [58, 40, 24], felloe: [96, 68, 42], spoke: [122, 90, 56],
  lamp: [232, 196, 104],
});

const S = GALLEON_TEX_SIZE;
const line = (img, y, col, x0 = 0, x1 = img.width) => { for (let x = x0; x < x1; x++) put(img, x, y, col); };
const column = (img, x, col, y0 = 0, y1 = img.height) => { for (let y = y0; y < y1; y++) put(img, x, y, col); };
export const sideRow = (y) => Math.max(0, Math.min(S - 1, Math.round(((SIDE_Y1 - y) / (SIDE_Y1 - SIDE_Y0)) * (S - 1))));

export const PAINTS = Object.freeze({
  oak: null, cream: null,
  red: Object.freeze([[138, 38, 30], [166, 56, 42], [92, 24, 18]]),
  blue: Object.freeze([[40, 58, 98], [60, 82, 128], [24, 34, 62]]),
  green: Object.freeze([K.green, K.greenLit, K.greenDark]),
  black: Object.freeze([[34, 32, 32], [56, 52, 50], [16, 14, 14]]),
  white: Object.freeze([[200, 194, 178], [226, 220, 204], [148, 142, 126]]),
  ochre: Object.freeze([[156, 114, 42], [184, 140, 60], [108, 76, 26]]),
  oxblood: Object.freeze([C.oxblood, C.oxbloodLit, [70, 20, 16]]),
  whitewash: Object.freeze([[214, 208, 192], [232, 228, 214], [170, 164, 148]]),
});
export const DYES = Object.freeze({
  red: Object.freeze([[178, 66, 54], [148, 60, 48], [128, 44, 36]]),
  blue: Object.freeze([[78, 100, 146], [70, 86, 116], [52, 70, 108]]),
  green: Object.freeze([[86, 122, 86], [80, 102, 74], [60, 88, 62]]),
  ochre: Object.freeze([[202, 158, 80], [170, 136, 82], [160, 118, 54]]),
  black: Object.freeze([[58, 56, 54], [70, 64, 58], [36, 34, 32]]),
});
const trimFor = (paint) => (paint === 'oxblood' ? [K.green, K.greenLit] : paint === 'white' ? [PAINTS.blue[0], PAINTS.blue[1]] : [C.oxblood, C.oxbloodLit]);
const glass = (img, x, y, rgb) => { put(img, x, y, rgb); img.data[(y * img.width + x) * 4 + 3] = 0; };

export const LOOK_RECORD_STRIDE = 100;
export const LOOK_RECORDS = Object.freeze({
  cart: Object.freeze([TEX.side]),
  openWagon: Object.freeze([TEX.openSide, TEX.tilt, TEX.tiltInner]),
  caravan: Object.freeze([TEX.caravanSide, TEX.caravanFront, TEX.caravanRear, TEX.caravanRoof]),
  walls: Object.freeze([TEX.roomSide, TEX.roomFront, TEX.roomRear]),
  floor: Object.freeze([TEX.roomFloor]),
  ceiling: Object.freeze([TEX.roomCeiling]),
});
export const lookRecord = (rec, i) => rec + LOOK_RECORD_STRIDE * (Number.isInteger(i) && i > 0 ? i : 0);

function floorArt() {
  const img = picture(S, S), n = noise(0xa01, S, S, 8, 8);
  planks(img, { ph: 8, seed: 0xa02, base: (x, y) => mix(mix(C.pine, C.pineGrey, 0.4), K.weather, 0.3 * n(x, y)), tone: 0.1, grain: 0.14, trenail: K.nail });
  return img;
}

function sideArt(paint = null) {
  const img = picture(S, S), n = noise(0xa11, S, S, 8, 8);
  const board = (x, y) => mix(K.board, K.weather, 0.35 + 0.3 * n(x, y));
  planks(img, { ph: 11, lenMin: 64, lenMax: 64, seed: 0xa12, base: paint ? (x, y) => mix(mix(paint[0], paint[1], 0.4 * n(x, y)), board(x, y), 0.18 * n(x, y)) : board, tone: 0.12, grain: paint ? 0.08 : 0.16 });
  for (const sx of [0, 1, 2, 3]) column(img, sx, sx === 3 ? C.seam : mix(K.boardDark, C.oakDark, 0.5));
  for (let y = 0; y < S; y += 11) for (const sx of [1, 2]) put(img, sx, y + 4, K.nail);
  for (let y = 0; y < S; y++) if (y % 11 === 5) { put(img, 6, y, K.nail); put(img, S - 3, y, K.nail); }
  for (const sy of [2, S - 4]) for (let x = 0; x < 9; x++) put(img, x, sy, x === 8 ? C.iron : C.ironLit);
  return img;
}

function innerArt() {
  const img = picture(S, S), n = noise(0xa21, S, S, 8, 8);
  planks(img, { ph: 11, lenMin: 64, lenMax: 64, seed: 0xa22, base: (x, y) => mix(mix(K.board, C.pine, 0.4), C.innerDark, 0.35 * n(x, y)), tone: 0.1, grain: 0.12 });
  return img;
}

function beamArt() {
  const img = picture(S, S), n = noise(0xa31, S, S, 4, 16), r = mulberry32(0xa32);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = mix(C.oakDark, C.oak, 0.6 * n(x, y));
    if (((y * 7 + Math.floor(x / 9)) % 13) === 0) c = shade(c, 0.78);
    if (r() < 0.015) c = C.tar;
    put(img, x, y, c);
  }
  return img;
}

function harnessArt() {
  const img = picture(S, S), n = noise(0xa71, S, S, 4, 16);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const edge = Math.min(x, S - 1 - x) < 6 ? 0.72 : 1;
    let c = shade(mix([92, 58, 32], [128, 84, 48], 0.55 * n(x, y)), edge);
    if ((x === 20 || x === 43) && y % 6 < 3) c = [176, 150, 108];
    put(img, x, y, c);
  }
  return img;
}

function benchArt() {
  const img = picture(S, S), n = noise(0xa41, S, S, 8, 8);
  planks(img, { ph: 16, lenMin: 64, lenMax: 64, seed: 0xa42, base: (x, y) => mix(C.oak, C.oakLit, 0.5 + 0.4 * n(x, y)), tone: 0.08, grain: 0.1 });
  return img;
}

function tyreArt() {
  const img = ironArt();
  const n = noise(0xa51, S, S, 8, 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, mix(get(img, x, y), [120, 108, 88], 0.25 * n(x, y)));
  for (let x = 4; x < S; x += 16) for (const y of [8, 40]) { put(img, x, y, C.ironLit); put(img, x + 1, y, C.iron); }
  return img;
}

function wheelArt() {
  const img = picture(S, S), n = noise(0xa61, S, S, 8, 8);
  const c = (S - 1) / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy) / c, a = Math.atan2(dy, dx);
    let col;
    if (r > 0.86) col = mix(C.iron, C.ironLit, 0.4 * n(x, y));
    else if (r > 0.66) col = mix(K.felloe, C.oakDark, ((Math.floor(((a + Math.PI) / (2 * Math.PI)) * 7) % 2) ? 0.25 : 0) + 0.2 * n(x, y));
    else if (r > 0.3) {
      const k = (((a + Math.PI) / (2 * Math.PI)) * 7) % 1;
      const w = 0.09 + 0.05 * (1 - r);
      col = k < w || k > 1 - w ? mix(K.spoke, C.oakLit, 0.3 * n(x, y)) : shade(mix(C.oakDark, C.tar, 0.5), 0.7);
    } else if (r > 0.22) col = mix(C.iron, C.ironLit, 0.5);
    else if (r > 0.08) col = mix(K.hub, C.oak, 0.5 * n(x, y));
    else col = C.black;
    put(img, x, y, col);
  }
  return img;
}

function openSideArt(dye = null) {
  const img = picture(S, S), n = noise(0xa71, S, S, 8, 8);
  const rail = sideRow(OPEN_RAIL_Y);
  const [cloth, dirt] = dye ?? [C.canvas, C.canvasDirt];
  for (let y = 0; y < rail; y++) for (let x = 0; x < S; x++) {
    let c = mix(cloth, dirt, 0.2 + 0.25 * n(x, y) + 0.3 * (y / rail));
    if (x === 0 || x === 1) c = shade(c, 0.8);
    if (x === S - 1) c = shade(c, 0.9);
    if (y === rail - 2 && x % 6 === 3) c = C.ropeDark;
    put(img, x, y, c);
  }
  planks(img, { y0: rail + 2, y1: S, ph: 7, lenMin: 64, lenMax: 64, seed: 0xa72, base: (x, y) => mix(K.board, K.weather, 0.35 + 0.3 * n(x, y)), tone: 0.12, grain: 0.15 });
  line(img, rail, C.oakLit); line(img, rail + 1, C.oakDark);
  for (const sx of [0, 1, 2]) column(img, sx, mix(K.boardDark, C.oakDark, 0.5), rail, S);
  return img;
}

function tiltArt(inside = false, dye = null) {
  const img = picture(S, S), n = noise(inside ? 0xa82 : 0xa81, S, S, 8, 8);
  const [cloth, dirt, seam] = dye ?? [C.canvas, C.canvasDirt, C.canvasSeam];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = mix(cloth, dirt, 0.2 + 0.3 * n(x, y));
    if (y % 16 === 0) c = seam;
    if (x === 0 || x === 1) c = inside ? mix(C.oak, C.oakDark, 0.5) : shade(c, 0.8);
    if (inside) c = shade(c, 0.62);
    put(img, x, y, c);
  }
  return img;
}

function caravanSideArt(paint = PAINTS.green, name = 'green') {
  const img = picture(S, S), n = noise(0xa91, S, S, 8, 8);
  const [body, bodyLit, bodyDark] = paint, [trim, trimLit] = trimFor(name);
  const skirt = sideRow(CARAVAN_SKIRT_Y), cornice = sideRow(CARAVAN_CORNICE_Y);
  planks(img, { y0: 0, y1: S, ph: 6, lenMin: 64, lenMax: 64, seed: 0xa92, base: (x, y) => mix(body, bodyLit, 0.35 * n(x, y)), seamCol: bodyDark, tone: 0.06, grain: 0.06 });
  band(img, skirt + 1, S, trim, 0xa93, 0.06);
  line(img, skirt, C.gilt); line(img, skirt + 1, C.giltDark);
  band(img, 0, cornice, trim, 0xa94, 0.05);
  line(img, cornice, C.gilt);
  for (let x = 0; x < S; x += 4) put(img, x + 1, cornice - 2, C.giltLit);
  const { y0: wy0, y1: wy1, x0: wx0, x1: wx1 } = CARAVAN_SIDE_WINDOW;
  for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) {
    const edge = y === wy0 || y === wy1 || x === wx0 || x === wx1;
    const bar = x === ((wx0 + wx1) >> 1) || y === ((wy0 + wy1) >> 1);
    if (edge || bar) put(img, x, y, edge ? C.gilt : C.lead);
    else glass(img, x, y, mix(C.glass, C.glassLit, ((x - wx0) + (wy1 - y)) / ((wx1 - wx0) + (wy1 - wy0)) * 0.7));
  }
  for (const [x0, x1] of [[wx0 - 9, wx0 - 1], [wx1 + 1, wx1 + 9]]) for (let y = wy0; y <= wy1; y++) for (let x = x0; x <= x1; x++) {
    put(img, x, y, (x === x0 || x === x1 || y === wy0 || y === wy1) ? trimLit : (y - wy0) % 4 === 0 ? bodyDark : mix(bodyLit, body, 0.4));
  }
  return img;
}

export const CARAVAN_SKIRT_Y = 1.32, CARAVAN_CORNICE_Y = 2.86;
export const CARAVAN_SIDE_WINDOW = Object.freeze({
  y0: sideRow((CARAVAN_SKIRT_Y + CARAVAN_CORNICE_Y + 0.84) / 2), y1: sideRow((CARAVAN_SKIRT_Y + CARAVAN_CORNICE_Y - 0.84) / 2), x0: 22, x1: 42,
});
export const CARAVAN_SIDE_WINDOW_U = (CARAVAN_SIDE_WINDOW.x0 + CARAVAN_SIDE_WINDOW.x1 + 1) / 2 / S;
export const endRow = (y) => Math.max(0, Math.min(S - 1, Math.round(((3.52 - y) / (3.52 - 0.94)) * (S - 1))));
export const CARAVAN_FRONT_WINDOW = Object.freeze({ cx: (S - 1) / 2, cy: endRow(2.55), r: 6.5, glassR: 5.4 });
export const CARAVAN_DOOR = Object.freeze({ y0: endRow(2.9), y1: endRow(0.98), x0: Math.round((S - 1) / 2 - 10), x1: Math.round((S - 1) / 2 + 10) });

function caravanEndArt(door, paint = PAINTS.green, name = 'green') {
  const img = picture(S, S), n = noise(door ? 0xab1 : 0xaa1, S, S, 8, 8);
  const [body, bodyLit, bodyDark] = paint, [trim, trimLit] = trimFor(name);
  planks(img, { ph: 5, lenMin: 64, lenMax: 64, seed: door ? 0xab2 : 0xaa2, base: (x, y) => mix(body, bodyLit, 0.35 * n(x, y)), seamCol: bodyDark, tone: 0.05, grain: 0.05 });
  const eaves = endRow(3.06), skirt = endRow(1.32);
  band(img, skirt + 1, S, trim, 0xaa3, 0.06); line(img, skirt, C.gilt);
  line(img, eaves, C.gilt); line(img, eaves - 1, trimLit);
  const cx = (S - 1) / 2;
  for (let y = 0; y < eaves - 1; y++) for (let x = 0; x < S; x++) {
    const a = Math.atan2(eaves - y, x - cx), r = Math.hypot(x - cx, eaves - y);
    if (r < 4) put(img, x, y, C.giltLit);
    else if (r < 14 && Math.floor((a / Math.PI) * 12) % 2 === 0) put(img, x, y, mix(C.gilt, C.giltDark, r / 14));
  }
  if (!door) {
    const { cy: wy, r: wr, glassR } = CARAVAN_FRONT_WINDOW;
    for (let y = wy - 7; y <= wy + 7; y++) for (let x = Math.round(cx) - 7; x <= Math.round(cx) + 7; x++) {
      const r = Math.hypot(x - cx, y - wy);
      if (r > wr) continue;
      if (r > glassR) put(img, x, y, C.gilt);
      else if (Math.abs(x - cx) < 0.6 || Math.abs(y - wy) < 0.6) put(img, x, y, C.lead);
      else glass(img, x, y, mix(C.glassLit, C.glass, r / 6));
    }
    return img;
  }
  const { y0: dy0, y1: dy1, x0: dx0, x1: dx1 } = CARAVAN_DOOR;
  const grain = noise(0xab3, S, S, 16, 4);
  for (let y = dy0; y <= dy1; y++) for (let x = dx0; x <= dx1; x++) {
    put(img, x, y, shade(mix(C.oak, C.oakDark, 0.3 + 0.4 * grain(x, y)), 1 + 0.06 * (((x - dx0) / 5 | 0) % 2)));
    if ((x - dx0) % 5 === 0) put(img, x, y, C.seam);
    if (y === dy0 || y === dy1 || x === dx0 || x === dx1) put(img, x, y, C.gilt);
  }
  for (const hy of [dy0 + 6, dy1 - 6]) line(img, hy, C.iron, dx0 + 1, dx0 + 10);
  const ry = (dy0 + dy1) >> 1;
  for (const [x, y] of [[dx1 - 4, ry - 1], [dx1 - 5, ry], [dx1 - 3, ry], [dx1 - 4, ry + 1]]) put(img, x, y, C.ironLit);
  for (let y = ry - 9; y <= ry - 5; y++) for (let x = dx1 + 4; x <= dx1 + 6; x++) put(img, x, y, y === ry - 9 ? C.iron : K.lamp);
  return img;
}

function caravanRoofArt(paint = null) {
  const img = picture(S, S), n = noise(0xac1, S, S, 8, 8);
  const [roof, roofLit] = paint ? [mix(paint[0], C.tar, 0.4), mix(paint[1], C.tar, 0.3)] : [K.roof, K.roofLit];
  planks(img, { ph: 8, seed: 0xac2, base: (x, y) => mix(roof, roofLit, 0.4 * n(x, y)), seamCol: C.tar, tone: 0.08, grain: 0.08 });
  return img;
}

function roomBoards(img, wall, seed, rows) {
  const n = noise(seed, S, S, 8, 8);
  const paint = PAINTS[wall];
  const base = paint ? (x, y) => mix(paint[0], paint[1], 0.3 * n(x, y)) : (x, y) => mix(C.oak, C.oakLit, 0.45 * n(x, y));
  planks(img, { ph: 6, lenMin: 64, lenMax: 64, seed: seed + 1, base, seamCol: paint ? paint[2] : C.seam, tone: 0.05, grain: paint ? 0.04 : 0.1 });
  const rail = rows(1.32);
  planks(img, { y0: rail + 1, y1: S, ph: 5, lenMin: 64, lenMax: 64, seed: seed + 2, base: (x, y) => mix(C.oakDark, C.oak, 0.4 * n(x, y)), tone: 0.06, grain: 0.1 });
  line(img, rail, C.oakLit); line(img, rail - 1, C.oakDark);
}
const curtainOf = (wall) => (wall === 'oxblood' || wall === 'ochre' ? K.green : wall === 'blue' ? C.gilt : C.oxblood);

function roomSideArt(wall = 'green') {
  const img = picture(S, S);
  roomBoards(img, wall, 0xb01, sideRow);
  const { y0: wy0, y1: wy1, x0: wx0, x1: wx1 } = CARAVAN_SIDE_WINDOW;
  for (let y = wy0; y <= wy1; y++) for (let x = wx0; x <= wx1; x++) {
    const edge = y === wy0 || y === wy1 || x === wx0 || x === wx1;
    const bar = x === ((wx0 + wx1) >> 1) || y === ((wy0 + wy1) >> 1);
    if (edge || bar) put(img, x, y, edge ? C.oakLit : C.lead);
    else glass(img, x, y, mix(C.glass, C.glassLit, 0.4));
  }
  const cur = curtainOf(wall);
  for (const [x0, x1] of [[wx0 - 6, wx0 - 1], [wx1 + 1, wx1 + 6]]) for (let y = wy0 - 2; y <= wy1 + 3; y++) for (let x = x0; x <= x1; x++) {
    put(img, x, y, shade(cur, (x - x0) % 2 ? 0.82 : 1));
  }
  line(img, wy0 - 3, C.iron, wx0 - 7, wx1 + 8);
  return img;
}

function roomEndArt(door, wall = 'green') {
  const img = picture(S, S);
  roomBoards(img, wall, door ? 0xb21 : 0xb11, endRow);
  const cx = (S - 1) / 2;
  if (!door) {
    const { cy: wy, r: wr, glassR } = CARAVAN_FRONT_WINDOW;
    for (let y = wy - 7; y <= wy + 7; y++) for (let x = Math.round(cx) - 7; x <= Math.round(cx) + 7; x++) {
      const r = Math.hypot(x - cx, y - wy);
      if (r > wr) continue;
      if (r > glassR) put(img, x, y, C.oakLit);
      else if (Math.abs(x - cx) < 0.6 || Math.abs(y - wy) < 0.6) put(img, x, y, C.lead);
      else glass(img, x, y, mix(C.glassLit, C.glass, 0.5));
    }
    return img;
  }
  const { y0: dy0, y1: dy1, x0: dx0, x1: dx1 } = CARAVAN_DOOR;
  const grain = noise(0xb23, S, S, 16, 4);
  for (let y = dy0; y <= dy1; y++) for (let x = dx0; x <= dx1; x++) {
    put(img, x, y, mix(C.oak, C.oakDark, 0.25 + 0.4 * grain(x, y)));
    if ((x - dx0) % 5 === 0) put(img, x, y, C.seam);
    if (y === dy0 || y === dy1 || x === dx0 || x === dx1) put(img, x, y, C.oakDark);
  }
  for (const by of [dy0 + 8, dy1 - 8]) line(img, by, C.oakDark, dx0 + 1, dx1);
  const ry = (dy0 + dy1) >> 1;
  for (let x = dx0 + 2; x <= dx0 + 6; x++) put(img, x, ry, C.ironLit);
  put(img, dx0 + 2, ry - 1, C.iron); put(img, dx0 + 2, ry + 1, C.iron);
  for (const hy of [dy0 + 6, dy1 - 6]) line(img, hy, C.iron, dx1 - 9, dx1);
  return img;
}

function roomCeilingArt(ceiling = 'boards') {
  const img = picture(S, S), n = noise(0xb31, S, S, 8, 8);
  if (ceiling === 'night') {
    const r = mulberry32(0xb32);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, mix([18, 24, 52], [30, 38, 76], 0.5 * n(x, y)));
    for (let k = 0; k < 40; k++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); put(img, x, y, r() < 0.2 ? C.giltLit : [220, 222, 236]); }
    return img;
  }
  const paint = ceiling === 'boards' ? [K.roof, K.roofLit, C.tar] : ceiling === 'oak' ? [C.oak, C.oakLit, C.seam] : PAINTS[ceiling] ?? [K.roof, K.roofLit, C.tar];
  planks(img, { ph: 8, seed: 0xb33, base: (x, y) => mix(paint[0], paint[1], 0.35 * n(x, y)), seamCol: paint[2], tone: 0.05, grain: 0.05 });
  for (let x = 0; x < S; x += 32) column(img, x, C.oakDark);
  return img;
}

function roomFloorArt(floor = 'pine') {
  const img = picture(S, S), n = noise(0xb41, S, S, 8, 8);
  if (floor === 'redRug' || floor === 'blueRug') {
    const [a, b] = floor === 'redRug' ? [[128, 36, 30], [176, 132, 64]] : [[38, 52, 96], [196, 170, 110]];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.max(Math.abs(x - 31.5), Math.abs(y - 31.5));
      let c = mix(a, shade(a, 0.8), 0.4 * n(x, y));
      if (d > 28 || (d > 13 && d < 16) || ((x + y) % 16 === 0 && d < 13) || ((x - y + 64) % 16 === 0 && d < 13)) c = mix(b, a, 0.25 * n(x, y));
      put(img, x, y, c);
    }
    return img;
  }
  if (floor === 'checker') {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, (((x >> 4) + (y >> 4)) % 2 ? mix([40, 36, 34], [58, 52, 48], n(x, y)) : mix([200, 190, 166], [220, 212, 190], n(x, y))));
    return img;
  }
  const wood = floor === 'oak' ? [C.oak, C.oakLit] : floor === 'dark' ? [[60, 44, 30], [80, 60, 40]] : [C.pine, C.pineGrey];
  planks(img, { ph: 8, seed: 0xb42, base: (x, y) => mix(wood[0], wood[1], 0.4 * n(x, y)), tone: 0.08, grain: 0.12, trenail: K.nail });
  return img;
}

export function wagonArt() {
  const painters = {
    floor: floorArt, side: sideArt, inner: innerArt, beam: beamArt, bench: benchArt, tyre: tyreArt, wheel: wheelArt, iron: ironArt,
    openSide: openSideArt, tilt: () => tiltArt(false), tiltInner: () => tiltArt(true),
    caravanSide: () => caravanSideArt(), caravanFront: () => caravanEndArt(false), caravanRear: () => caravanEndArt(true), caravanRoof: () => caravanRoofArt(),
    roomSide: () => roomSideArt(), roomFront: () => roomEndArt(false), roomRear: () => roomEndArt(true), roomCeiling: () => roomCeilingArt(), roomFloor: () => roomFloorArt(),
    harness: harnessArt,
  };
  return Object.entries(TEX).map(([key, rec]) => /** @type {[number, any]} */ ([rec, painters[key]()])).sort((a, b) => a[0] - b[0]);
}

export function wagonLookArt(list, i, name) {
  if (!(Number.isInteger(i) && i > 0) || !LOOK_RECORDS[list]) return [];
  const r = (rec) => lookRecord(rec, i);
  if (list === 'cart') return [[r(TEX.side), sideArt(PAINTS[name])]];
  if (list === 'openWagon') { const d = DYES[name] ?? null; return [[r(TEX.openSide), openSideArt(d)], [r(TEX.tilt), tiltArt(false, d)], [r(TEX.tiltInner), tiltArt(true, d)]]; }
  if (list === 'caravan') {
    const p = PAINTS[name] ?? PAINTS.green;
    return [[r(TEX.caravanSide), caravanSideArt(p, name)], [r(TEX.caravanFront), caravanEndArt(false, p, name)], [r(TEX.caravanRear), caravanEndArt(true, p, name)], [r(TEX.caravanRoof), caravanRoofArt(p)]];
  }
  if (list === 'walls') return [[r(TEX.roomSide), roomSideArt(name)], [r(TEX.roomFront), roomEndArt(false, name)], [r(TEX.roomRear), roomEndArt(true, name)]];
  if (list === 'floor') return [[r(TEX.roomFloor), roomFloorArt(name)]];
  return [[r(TEX.roomCeiling), roomCeilingArt(name)]];
}
export const isGlassRecord = (rec) => /** @type {number[]} */ ([TEX.caravanSide, TEX.caravanFront, TEX.roomSide, TEX.roomFront]).includes(rec % LOOK_RECORD_STRIDE);
