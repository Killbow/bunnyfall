// @ts-check
import { CARD_W, CARD_L, CARD_T, ARC_HEIGHT } from './cardMotion.js';

export const ILIAC_HOLD_GAP = CARD_W * 1.9;
export const ILIAC_SIDE_IN = CARD_L * 1.05;
export const ILIAC_SIDE_STEP = CARD_L * 0.42;
export const ILIAC_SIDE_RISE = CARD_T * 1.5;
export const ILIAC_THROW_S = 0.42;

/**
 * @param {{centre: number[], halfShort?: number, halfLong?: number}} frame
 * @param {number[]} seat0
 * @param {number[]} seat1
 * @param {number} viewer
 */
export function iliacPlaces(frame, seat0, seat1, viewer = 0) {
  const c = frame.centre, top = c[1];
  const toward = (f) => { const dx = f[0] - c[0], dz = f[2] - c[2], n = Math.hypot(dx, dz) || 1; return [dx / n, dz / n]; };
  const d0 = toward(seat0), d1raw = toward(seat1);
  // Seat 1's side is seat 0's line reversed, not its own line: chairs set at an angle would otherwise lay a column
  // over the next holding.
  const d1 = [-d0[0], -d0[1]];
  const dirs = [d0, d1];
  const across = [-d0[1], d0[0]];
  // Cards are read from the chair of the viewer (`d1raw` for seat 1), not from the side where that seat lays its
  // column.
  const me = viewer === 1 ? d1raw : d0;
  const yaw = Math.atan2(-me[0], -me[1]);
  const holding = (h) => [c[0] + across[0] * (h - 1) * ILIAC_HOLD_GAP, top + CARD_T / 2, c[2] + across[1] * (h - 1) * ILIAC_HOLD_GAP];
  const side = (h, p, i) => {
    const b = holding(h), d = dirs[p];
    const out = ILIAC_SIDE_IN + i * ILIAC_SIDE_STEP;
    return [b[0] + d[0] * out, top + CARD_T / 2 + (i + 1) * ILIAC_SIDE_RISE, b[2] + d[1] * out];
  };
  const reach = Math.max(0.25, (frame.halfShort ?? 0.4) - CARD_L * 0.4);
  const from = [d0, d1raw];
  const edge = (p) => [c[0] + from[p][0] * reach, top + 0.12, c[2] + from[p][1] * reach];
  return { holding, side, edge, yaw, viewer };
}

/**
 * @param {any} view
 * @param {ReturnType<typeof iliacPlaces>} places
 * @param {number} t
 * @param {Map<number, number>} landed
 */
export function iliacPoses(view, places, t, landed) {
  const out = [];
  if (!view) return out;
  view.holdings.forEach((hd, h) => {
    out.push({ card: hd.id, pos: places.holding(h), yaw: places.yaw, uid: `h${h}` });
    hd.sides.forEach((list, p) => list.forEach((c, i) => {
      const rest = places.side(h, p, i);
      const at = landed.get(c.uid);
      const k = at === undefined ? 1 : Math.max(0, Math.min(1, (t - at) / ILIAC_THROW_S));
      let pos = rest;
      if (k < 1) {
        const from = places.edge(p);
        const e = k * k * (3 - 2 * k);
        pos = [from[0] + (rest[0] - from[0]) * e, from[1] + (rest[1] - from[1]) * e + Math.sin(Math.PI * k) * ARC_HEIGHT, from[2] + (rest[2] - from[2]) * e];
      }
      out.push({ card: c.down ? null : (c.form ?? c.id ?? null), pos, yaw: places.yaw + (k < 1 ? (1 - k) * 0.6 : 0), uid: c.uid });
    }));
  });
  return out;
}

/**
 * @param {Map<number, number>} landed
 * @param {any} view
 * @param {number} t
 * @param {boolean} [settled]
 */
export function iliacLanded(landed, view, t, settled = false) {
  const on = new Set();
  for (const hd of view?.holdings ?? []) for (const list of hd.sides) for (const c of list) {
    on.add(c.uid);
    if (!landed.has(c.uid)) landed.set(c.uid, settled ? -Infinity : t);
  }
  for (const uid of [...landed.keys()]) if (!on.has(uid)) landed.delete(uid);
  return landed;
}
