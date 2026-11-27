// @ts-check
// Only the striker's client asks the service for a find: the owner asks for its own kills through the death
// handler, and a joiner asks through `egFindStruck`. A room body's raise is not a kill and never asks.
import { registerEnemyDeathHandler } from '../../characters/corpseMarker.js';
import { restackWeirKeys, throwWeirKeyFace, setWeirKeyFacesHere } from './weirKey.js';
import { DUNGEON_TIERS, dungeonTier } from '../../world/dungeonTier.js';

export const EG_FIND_HANDLER = 'eg-find';
export const EG_FIND_TEXT = Object.freeze({ found: 'A Weir Key falls from the body.' });

export const egFindAsks = (/** @type {any} */ entity, /** @type {any} */ tier, /** @type {any} */ online) => online === true && entity?.eliteFoe === true && DUNGEON_TIERS.includes(tier);

/**
 * The pack restacks to the balance less every face still lying on a body, including this one, so two finds before
 * looting show the right count.
 * @param {any} entity
 * @param {any[]} pack
 * @param {number} keys
 */
export function egFindThrow(entity, pack, keys) {
  if (Array.isArray(entity?.items)) throwWeirKeyFace(entity.items);
  restackWeirKeys(pack, keys);
}

/**
 * @param {string|undefined|null} mode
 * @param {any} modes
 */
export const egFindPlace = (mode, modes) => (mode === 'dungeon' && modes?.dungeonLocation
  ? { tier: dungeonTier(modes.dungeonLocation), visit: modes.dungeonCtx ?? modes.dungeonLocation } : null);

let _registered = null;
export const egFindStruck = (/** @type {any} */ entity, room = false) => _registered?.struck(entity, room) ?? Promise.resolve(false);
export const egFindKill = (/** @type {any} */ entity, /** @type {string|null} */ by = null) => _registered?.death(entity, by, true) ?? Promise.resolve(false);
/** @param {{ ask: (tier: string) => Promise<any>, placeNow?: () => ({ tier: string|null, visit: unknown }|null), tierNow?: () => string|null, selfId: () => string|null, online: () => boolean, say?: (line: string) => void, throwKey: (entity: any, keys: number) => void }} doors */
export function registerEgFind({ ask, placeNow = undefined, tierNow = undefined, selfId, online, say = () => {}, throwKey }) {
  const asked = new WeakSet();
  const where = () => { if (placeNow) return placeNow(); const tier = tierNow?.() ?? null; return tier == null ? null : { tier, visit: true }; };
  // Thrown faces count as lying only within the current visit, since a later or rebuilt dungeon holds none of the
  // earlier bodies.
  const here = () => where()?.visit ?? null;
  setWeirKeyFacesHere(here);
  /**
   * @param {any} entity
   * @param {boolean} [room]
   */
  async function find(entity, room = false) {
    const at = where(), tier = at?.tier ?? null;
    if (!egFindAsks(entity, tier, online()) || asked.has(entity)) return false;
    asked.add(entity);
    let a = null;
    try { a = await ask(/** @type {string} */ (tier)); } catch { return false; }
    const d = a?.ok ? a.data : null;
    if (d?.found !== true || !Number.isSafeInteger(d.keys)) return false;
    // An answer that lands in a different visit puts the key in the pack, because the body it was asked for is
    // gone.
    throwKey(room || here() !== at?.visit ? null : entity, d.keys);
    say(EG_FIND_TEXT.found);
    return true;
  }
  /**
   * @param {any} entity
   * @param {string|null} [by]
   * @param {boolean} [room]
   */
  const death = (entity, by = null, room = false) => (by == null || by === selfId() ? find(entity, room) : Promise.resolve(false));
  registerEnemyDeathHandler(EG_FIND_HANDLER, (/** @type {any} */ entity, /** @type {any} */ opts = {}) => { if (opts.room) return; death(entity, opts.by ?? null).catch((e) => console.warn('[eg] find failed', e?.message ?? e)); });
  const reg = { death, struck: (/** @type {any} */ entity, room = false) => find(entity, room), dispose: () => { registerEnemyDeathHandler(EG_FIND_HANDLER, null); if (_registered === reg) { _registered = null; setWeirKeyFacesHere(null); } } };
  _registered = reg;
  return reg;
}
