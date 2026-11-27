// @ts-check
// Quest guidance tiers: Journal marks only places the player's map already holds, Town also rings the building the
// latest journal entry names, and Exact marks every live quest resource. Town and Exact need the enhanced skin.

import { isEnhanced } from '../../ui/uiSkin.js';
import { getPref } from '../../ui/uiPrefs.js';
import { clairvoyantNow } from '../../magic/clairvoyance.js';

export const GUIDANCE_PREF = 'questGuidance';

export const GUIDANCE_TIERS = Object.freeze(['journal', 'town', 'exact']);

export const guidanceTier = () => {
  if (clairvoyantNow()) return 'exact';
  const v = isEnhanced() ? getPref(GUIDANCE_PREF) : null;
  return v === 'exact' || v === 'town' ? v : 'journal';
};
export const townTierOn = () => guidanceTier() !== 'journal';

/**
 * @typedef {{ at: number[], name: string, followed: boolean }} QuestMark
 */
export const questEnded = (b) => {
  const q = b?.targetQuest ?? b?.targetResource?.parentQuest ?? null;
  return !!q && (q.questComplete === true || q.questTombstoned === true || q.shelvedAt != null);
};

/**
 * @param {{ stands?: ReadonlyArray<any>|null, foes?: ReadonlyArray<any>|null, people?: ReadonlyArray<any>|null, boxOf: (s: any) => any,
 *   followedId?: string|null, itemName?: (s: any, res: any) => string|null|undefined, foeName?: (f: any) => string|null|undefined,
 *   behaviourOf?: (f: any) => any }} o
 * @returns {QuestMark[]}
 */
export function dungeonQuestMarks({ stands = [], foes = [], people = [], boxOf, followedId = null, itemName = () => null, foeName = () => null, behaviourOf = (f) => f?.questBehaviour ?? null }) {
  /** @type {QuestMark[]} */
  const out = [];
  const followed = (uid) => followedId != null && uid != null && String(uid) === String(followedId);
  for (const s of stands ?? []) {
    const res = s?.behaviour?.targetResource ?? null;
    if (!res || !s.active || s.dead || res.isHidden === true || questEnded(s.behaviour)) continue;
    const box = boxOf(s);
    if (!box?.min || !box?.max) continue;
    const at = [(box.min[0] + box.max[0]) / 2, box.min[1], (box.min[2] + box.max[2]) / 2];
    const name = res.isPerson === true ? (res.displayName || 'Someone') : (itemName(s, res) || 'Quest item');
    out.push({ at, name, followed: followed(s.behaviour.questUID) });
  }
  for (const f of foes ?? []) {
    const b = f ? behaviourOf(f) : null;
    const feet = f?.ai?.feet;
    if (!b || f.dead || !feet || b.targetResource?.isHidden === true || questEnded(b)) continue;
    out.push({ at: [feet[0], feet[1], feet[2]], name: b.targetResource?.displayName || foeName(f) || 'Quest foe', followed: followed(b.questUID) });
  }
  for (const p of people ?? []) {
    const b = p?.questBehaviour;
    const res = b?.targetResource ?? null;
    if (!res || p.active === false || res.isHidden === true || res.isDestroyed === true || questEnded(b)) continue;
    if (![p.x, p.y, p.z].every(Number.isFinite)) continue;
    out.push({ at: [p.x, p.y, p.z], name: res.displayName || 'Someone', followed: followed(b.questUID) });
  }
  return out;
}

/**
 * @param {ReadonlyArray<QuestMark>|null|undefined} marks @param {number[]|null|undefined} feet
 * @returns {number[]|null}
 */
export function questCompassPick(marks, feet) {
  if (!feet || !marks?.length) return null;
  let best = null, bestD = Infinity;
  for (const pass of [true, false]) {
    for (const q of marks) {
      if (pass && !q.followed) continue;
      const d = Math.hypot(q.at[0] - feet[0], q.at[1] - feet[1], q.at[2] - feet[2]);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (best) break;
  }
  return best ? [best.at[0], best.at[2]] : null;
}

/**
 * @param {ReadonlyArray<any>|null|undefined} views @param {number|null|undefined} mapId @param {string|null} [followedId]
 * @returns {Array<{ buildingKey: number, followed: boolean }>}
 */
export function townQuestBuildings(views, mapId, followedId = null) {
  /** @type {Map<number, { buildingKey: number, followed: boolean }>} */
  const out = new Map();
  if (!Number.isFinite(Number(mapId))) return [];
  const here = Number(mapId) >>> 0;
  for (const v of views ?? []) {
    const b = v?.target?.building;
    if (!b || !(b.buildingKey > 0) || (Number(b.mapId) >>> 0) !== here) continue;
    const followed = followedId != null && v.id != null && String(v.id) === String(followedId);
    const had = out.get(b.buildingKey);
    out.set(b.buildingKey, { buildingKey: b.buildingKey, followed: followed || !!had?.followed });
  }
  return [...out.values()];
}

export function townBuildingLocal(summary, side) {
  const p = summary?.position;
  if (!p) return null;
  return [(summary.blockX ?? 0) * side + p[0], (summary.blockY ?? 0) * side + p[2]];
}
