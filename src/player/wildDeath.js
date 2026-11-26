// @ts-check
// Death in the open zone: what a death keeps, what it drops, and what a killer may take.
import { CROMWARK_ON } from '../world/wild/cromwark.js';
import { WILD_ITEMS_MAX } from '../net/wire.js';
import { wildCartWord } from '../world/wild/wildCart.js';
import { WILD_FALL_PACKS, WILD_FALL_LETTERS } from '../world/wild/wildDropLaw.js';
import { wildInside, wildNear, wildRingAt } from '../world/wildZone.js';

export { WILD_NEVER_GROUPS, keptOnWildDeath, wildCanLose, takeWildDrop, WILD_GOLD_LOSS, takeWildGold, wornOffer, wildRecord, takeWildDeath, wildPickOf, wildDropCandidates, wildCartRecordOf, wildCartMayBeAway, wildTookOf, wildTakeTook, WILD_REVENANTS_MAX, wildSwornAtSide, WILD_PACK, wildPacks, wildPacksOf, WILD_FALL_PACKS, wildTakesPacks } from '../world/wild/wildDropLaw.js';

/** @param {boolean} on @param {any} rec @param {any} mask */
export const wildFallWords = (on, rec, mask) => ({ ...wildCartWord(on, rec, mask), packs: WILD_FALL_PACKS, letters: WILD_FALL_LETTERS });

/** @param {any[]} out @param {{ purse?: number, cart?: number, packs?: Record<string, number>, letters?: Record<string, number> } | null | undefined} gold */
export const wildTookAny = (out, gold) => out.length > 0 || (gold?.purse ?? 0) > 0 || (gold?.cart ?? 0) > 0 || Object.values(gold?.packs ?? {}).some((n) => n > 0) || Object.values(gold?.letters ?? {}).some((n) => n > 0);

export function wildChunks(list, size = WILD_ITEMS_MAX, bytes = Infinity) {
  // A chunk is also capped at `bytes` of JSON so a frame stays under the wire bound (WILD_DATA_MAX).
  const out = [];
  let cur = [], n = 2;
  for (const it of list) {
    const w = JSON.stringify(it).length + 1;
    if (cur.length && (cur.length >= size || n + w > bytes)) { out.push(cur); cur = []; n = 2; }
    cur.push(it); n += w;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * @param {number[]} centre
 * @param {{ bodies?: number[][], clear?: (from: number[], yaw: number) => boolean, yaw?: number, room?: number, step?: number, reach?: number }} [opts]
 * @returns {{ pos: number[], yaw: number }}
 */
export function wildSpawnSpot(centre, { bodies = [], clear = () => true, yaw = 0, room = 2.5, step = 2, reach = 8 } = {}) {
  const free = (p) => bodies.every((b) => !b || Math.hypot(b[0] - p[0], b[2] - p[2]) >= room);
  for (let r = 0; r <= reach; r += step) {
    const n = r === 0 ? 1 : 8;
    for (let k = 0; k < n; k++) {
      const a = yaw + (k * Math.PI * 2) / n;
      const p = [centre[0] + Math.sin(a) * r, centre[1], centre[2] + Math.cos(a) * r];
      if (!free(p)) continue;
      for (let t = 0; t < 4; t++) {
        const face = yaw + (t * Math.PI) / 2;
        if (clear(p, face)) return { pos: p, yaw: face };
      }
    }
  }
  return { pos: [centre[0], centre[1], centre[2]], yaw };
}

/**
 * @param {any} mask @param {{ x: number, y: number }} px @param {{ inDungeon?: boolean, kill?: boolean }} [o]
 * @returns {((hit: any) => boolean)[]} */
export function wildRisePicks(mask, px, { inDungeon = false, kill = true } = {}) {
  const town = (/** @type {any} */ hit) => hit.kind === 'city' || hit.kind === 'temple';
  const out = (/** @type {any} */ hit) => town(hit) && !(mask && wildNear(mask, hit.mapPixel.x, hit.mapPixel.y));
  const inside = !!mask && wildInside(mask, px.x, px.y);
  if (CROMWARK_ON) return [out];
  if (inside && inDungeon) return [(hit) => hit.kind === 'city', out];
  if (inside && !kill) {
    const ring = wildRingAt(px.x, px.y, mask);
    const inZone = (/** @type {any} */ hit) => town(hit) && wildInside(mask, hit.mapPixel.x, hit.mapPixel.y);
    return [(hit) => inZone(hit) && wildRingAt(hit.mapPixel.x, hit.mapPixel.y, mask) === ring, inZone, out];
  }
  return [out];
}
