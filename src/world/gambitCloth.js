// @ts-check
import { CARD_TABLE_W, CARD_TABLE_D, CARD_TABLE_RAIL } from './cardTableProp.js';
import { KG_COLS, KG_ROWS, KG_TILE } from '../net/kingsGambit.js';
import { CARD_W, CARD_L } from './cardMotion.js';

export const GAMBIT_FELT_LONG = CARD_TABLE_W - 2 * CARD_TABLE_RAIL;
export const GAMBIT_FELT_SHORT = CARD_TABLE_D - 2 * CARD_TABLE_RAIL;
// Each surface sits on its own plane above the felt so none z-fights with another.
export const GAMBIT_MAT_LIFT = 0.003;
export const GAMBIT_CARD_LIFT = 0.0015;

/**
 * `flip` lays the board for an online guest, whose relay board `flipGambitState` turns about its middle, so each
 * turned cell lands on the felt where the host's cell lies.
 * @param {{centre: number[], axisYaw: number}} frame
 * @param {number[]} hostFeet
 * @param {{flip?: boolean}} [o]
 */
export function gambitPlaces(frame, hostFeet, { flip = false } = {}) {
  const along = [Math.sin(frame.axisYaw), Math.cos(frame.axisYaw)];
  const across = [Math.cos(frame.axisYaw), -Math.sin(frame.axisYaw)];
  const dx = hostFeet[0] - frame.centre[0], dz = hostFeet[2] - frame.centre[2];
  const da = dx * along[0] + dz * along[1], dq = dx * across[0] + dz * across[1];
  const end = Math.abs(da) > Math.abs(dq);
  const sign = (/** @type {number} */ v) => (v < 0 ? -1 : 1);
  const way = flip ? -1 : 1;
  const toHost = end ? [along[0] * sign(da) * way, along[1] * sign(da) * way] : [across[0] * sign(dq) * way, across[1] * sign(dq) * way];
  const right = [-toHost[1], toHost[0]];
  const cell = end ? GAMBIT_FELT_SHORT / KG_COLS : GAMBIT_FELT_SHORT / KG_ROWS;
  const top = frame.centre[1] + GAMBIT_MAT_LIFT;
  const cx = frame.centre[0], cz = frame.centre[2];
  const point = (/** @type {number} */ u, /** @type {number} */ v) => [cx + right[0] * u + toHost[0] * v, top, cz + right[1] * u + toHost[1] * v];
  const at = (/** @type {number} */ c, /** @type {number} */ r) => point((c - (KG_COLS - 1) / 2) * cell, (r - (KG_ROWS - 1) / 2) * cell);
  const cellAt = (/** @type {number[]|null} */ p) => {
    if (!p) return null;
    const ux = p[0] - cx, uz = p[2] - cz;
    const c = Math.floor((ux * right[0] + uz * right[1]) / cell + KG_COLS / 2);
    const r = Math.floor((ux * toHost[0] + uz * toHost[1]) / cell + KG_ROWS / 2);
    return c >= 0 && c < KG_COLS && r >= 0 && r < KG_ROWS ? [c, r] : null;
  };
  const w = KG_COLS * cell, d = KG_ROWS * cell;
  const corners = [point(-w / 2, d / 2), point(w / 2, d / 2), point(w / 2, -d / 2), point(-w / 2, -d / 2)];
  return { end, cell, top, right, toHost, width: w, depth: d, at, cellAt, corners };
}

export const GAMBIT_CARD_SHARE = 0.64;
export const GAMBIT_WALL_H = 0.024;
export const GAMBIT_PILLAR_H = 0.042;
export const GAMBIT_PILLAR_R = 0.34;
export const GAMBIT_WATER_DROP = 0.0025;
export const GAMBIT_DISC_SHARE = 0.84;
export const GAMBIT_DISC_H = 0.006;
export const GAMBIT_SLOT_DEPTH = 0.003;
export const GAMBIT_SELECT_LIFT = 0.01;
export const gambitCardHeight = (/** @type {number} */ cell) => (GAMBIT_CARD_SHARE * cell * CARD_L) / CARD_W;
export const GAMBIT_CARD_FOOT = GAMBIT_DISC_H - GAMBIT_SLOT_DEPTH;

/**
 * @param {ReturnType<typeof gambitPlaces>} places
 * @param {{tiles: number[], pieces: {id?: number, col: number, row: number}[]}} board
 * @param {number[]} eye
 * @param {number[]} dir
 * @param {number|null} [selected]
 */
export function gambitPressCell(places, board, eye, dir, selected = null) {
  /** @type {{t: number, cell: number[]}|null} */ let best = null;
  const take = (/** @type {number} */ t, /** @type {number[]} */ cell) => { if (t > 0 && (!best || t < best.t)) best = { t, cell }; };
  const planeY = (/** @type {number} */ y) => (Math.abs(dir[1]) > 1e-9 ? (y - eye[1]) / dir[1] : -1);
  const pointAt = (/** @type {number} */ t) => [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
  const local = (/** @type {number[]} */ p, /** @type {number} */ c, /** @type {number} */ r) => {
    const o = places.at(c, r), dx = p[0] - o[0], dz = p[2] - o[2];
    return [(dx * places.right[0] + dz * places.right[1]) / places.cell, (dx * places.toHost[0] + dz * places.toHost[1]) / places.cell];
  };
  const H = gambitCardHeight(places.cell), half = GAMBIT_CARD_SHARE / 2;
  for (const p of board.pieces ?? []) {
    const o = places.at(p.col, p.row), n = places.toHost;
    const den = dir[0] * n[0] + dir[2] * n[1];
    if (Math.abs(den) < 1e-9) continue;
    const t = ((o[0] - eye[0]) * n[0] + (o[2] - eye[2]) * n[1]) / den;
    // The chosen card is tested at its lifted height, matching how gambitTableDraw.js draws it.
    const q = pointAt(t), [u] = local(q, p.col, p.row), y = q[1] - (places.top + GAMBIT_CARD_FOOT + (p.id === selected ? GAMBIT_SELECT_LIFT : 0));
    if (Math.abs(u) <= half && y >= 0 && y <= H) take(t, [p.col, p.row]);
  }
  for (let r = 0; r < KG_ROWS; r++) for (let c = 0; c < KG_COLS; c++) {
    const tile = board.tiles?.[r * KG_COLS + c];
    if (tile !== KG_TILE.wall && tile !== KG_TILE.pillar) continue;
    const t = planeY(places.top + (tile === KG_TILE.wall ? GAMBIT_WALL_H : GAMBIT_PILLAR_H));
    if (t <= 0) continue;
    const [u, v] = local(pointAt(t), c, r);
    if (tile === KG_TILE.wall ? Math.abs(u) <= 0.5 && Math.abs(v) <= 0.5 : Math.hypot(u, v) <= GAMBIT_PILLAR_R) take(t, [c, r]);
  }
  const tm = planeY(places.top);
  if (tm > 0) { const cell = places.cellAt(pointAt(tm)); if (cell) take(tm, cell); }
  return best ? /** @type {any} */ (best).cell : null;
}

export const GAMBIT_LEAN_PITCH = (55 * Math.PI) / 180;
export const GAMBIT_LEAN_FILL = 0.94;

/**
 * @param {ReturnType<typeof gambitPlaces>} places
 * @param {{aspect: number, fovY: number, clear?: {x0: number, x1: number, y0: number, y1: number}, pitch?: number}} view
 */
export function gambitLean(places, { aspect, fovY, clear: given = { x0: 0, x1: 1, y0: 0, y1: 1 }, pitch = GAMBIT_LEAN_PITCH }) {
  const clear = given && given.x1 - given.x0 > 0 && given.y1 - given.y0 > 0 ? given : { x0: 0, x1: 1, y0: 0, y1: 1 };
  const f = [-places.toHost[0] * Math.cos(pitch), -Math.sin(pitch), -places.toHost[1] * Math.cos(pitch)];
  const rt = [places.right[0], 0, places.right[1]];
  const up = [f[1] * rt[2] - f[2] * rt[1], f[2] * rt[0] - f[0] * rt[2], f[0] * rt[1] - f[1] * rt[0]];
  const ty = Math.tan(fovY / 2), tx = ty * aspect;
  const H = gambitCardHeight(places.cell);
  const head = [places.corners[2], places.corners[3]];
  const pts = [...places.corners, ...head.map((p) => [p[0], p[1] + H, p[2]])];
  const centre = [(places.corners[0][0] + places.corners[2][0]) / 2, places.top, (places.corners[0][2] + places.corners[2][2]) / 2];
  const cx0 = clear.x0 * 2 - 1, cx1 = clear.x1 * 2 - 1, cy0 = 1 - clear.y1 * 2, cy1 = 1 - clear.y0 * 2;
  let dist = 1, sx = 0, sy = 0;
  const eyeOf = () => [0, 1, 2].map((i) => centre[i] - f[i] * dist + rt[i] * sx + up[i] * sy);
  const box = () => {
    const e = eyeOf();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const d = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
      const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
      const x = (d[0] * rt[0] + d[1] * rt[1] + d[2] * rt[2]) / (Math.max(z, 1e-6) * tx);
      const y = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / (Math.max(z, 1e-6) * ty);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x0, x1, y0, y1 };
  };
  for (let round = 0; round < 24; round++) {
    const b = box();
    const k = Math.max((b.x1 - b.x0) / ((cx1 - cx0) * GAMBIT_LEAN_FILL), (b.y1 - b.y0) / ((cy1 - cy0) * GAMBIT_LEAN_FILL));
    dist *= Math.max(0.5, Math.min(2, k));
    const n = box();
    const dx = ((cx0 + cx1) - (n.x0 + n.x1)) / 2, dy = ((cy0 + cy1) - (n.y0 + n.y1)) / 2;
    sx -= dx * dist * tx; sy -= dy * dist * ty;
  }
  return { eye: eyeOf(), fwd: f, box: box() };
}

/**
 * @param {{toHost: number[]}} places
 * @param {number} side
 */
export const gambitCardYaw = (places, side) => Math.atan2(places.toHost[0], places.toHost[1]) + (side === 0 ? Math.PI : 0);
