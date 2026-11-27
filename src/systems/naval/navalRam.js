// @ts-check
import { STRUCK_AT, ballMen } from './navalDamage.js';

export const RAM_SPEED = 1.6;
export const RAM_FULL_SPEED = 8;
export const RAM_SHARE = 0.15;
export const GALLEY_SHARE = 0.3;
export const RAM_GLANCE = 0.4;
export const RAM_RECOIL = 0.3;
export const BOW_RECOIL = 2;
export const GALLEY_RAM = 3;
export const RAM_A_MAN = 40;
export const RAM_REACH = 1.2;
export const RAM_MEMORY_S = 0.6;
export const RAM_COOLDOWN_S = 3;

/**
 * @param {{ c: number[], ax: number[], az: number[], h: number[] }} box
 * @param {number[]} p
 * @returns {{ side: boolean, normal: number[] } | null}
 */
export function ramContact(box, p, reach = RAM_REACH) {
  const l = [p[0] - box.c[0], p[1] - box.c[1], p[2] - box.c[2]];
  const x = l[0] * box.ax[0] + l[1] * box.ax[1] + l[2] * box.ax[2];
  const z = l[0] * box.az[0] + l[1] * box.az[1] + l[2] * box.az[2];
  const mx = Math.abs(x) - box.h[0], mz = Math.abs(z) - box.h[2];
  if (mx > reach || mz > reach) return null;
  const side = mx >= mz;
  const a = side ? box.ax : box.az, s = (side ? x : z) < 0 ? -1 : 1;
  const len = Math.hypot(a[0], a[2]) || 1;
  return { side, normal: [(s * a[0]) / len, 0, (s * a[2]) / len] };
}

export function ramClosing(ways, her, normal) {
  let most = -Infinity;
  for (const w of ways) most = Math.max(most, -((w[0] - her[0]) * normal[0] + (w[2] - her[2]) * normal[2]));
  return most;
}

/** @param {{ closing: number, side: boolean, mine: number, hers: number, galley?: boolean }} ram */
export function ramBlow({ closing, side, mine, hers, galley = false }) {
  if (!(closing >= RAM_SPEED)) return 0;
  const pace = Math.min(1, closing / RAM_FULL_SPEED);
  const lesser = Math.max(0, Math.min(Number(mine) || 0, Number(hers) || 0));
  return Math.round((galley ? GALLEY_SHARE : RAM_SHARE) * lesser * pace * (side ? 1 : RAM_GLANCE));
}

// A ram never takes a hull under its line, so it brings a fighting ship to strike her colors and no further.
export const ramLine = (damage) => damage.maxHull * STRUCK_AT;
export const ramRoom = (damage) => Math.max(0, damage.hull - ramLine(damage));
// A whole point short of the ram room, so the rammer's own ram never brings her to strike.
export const recoilRoom = (damage) => Math.max(0, Math.floor(ramRoom(damage) - 1));

export const recoilShare = (galley = false) => RAM_RECOIL * (galley ? 1 / GALLEY_RAM : BOW_RECOIL);
export const ramPaid = (blow, room, k) => (k > 0 ? Math.min(blow, Math.floor(room / k)) : blow);

export const ramMenSaid = (dealt) => Math.round(dealt / RAM_A_MAN);
export const ramMen = (dealt, roll, tough) => ballMen(dealt / RAM_A_MAN, roll, tough);
