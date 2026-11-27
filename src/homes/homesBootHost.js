// @ts-check
// Runs once a boot, after the world loads with the real character. It holds this character's realm deeds on the
// account service and returns its things from homes the account no longer holds. A step not ready yet retries.
import { holdRealmDeeds, homesGoneFrom, homesGoneLine } from './onlineHomes.js';
import { createSceneCache } from '../world/sceneCache.js';

const STAND_LOOKS = 1200;
const STAND_LOOK_MS = 250;

/**
 * @param {{ homesApi: any, onlineHomes: any, realm: any, player: () => any, loaded: () => boolean, stands: () => boolean,
 *   giveOwn: (items: any[]) => void, say: (line: string) => void, wait?: (ms: number) => Promise<void> }} deps
 */
export function createHomesBoot({ homesApi, onlineHomes, realm, player, loaded, stands, giveOwn, say, wait = (ms) => new Promise((r) => { setTimeout(r, ms); }) }) {
  let deedsAsked = false, goneAsked = false;
  /** False while only the boot's stand-in character is loaded; the step is then asked again at the next landing. */
  async function standing() {
    for (let i = 0; !(loaded() && stands()) && i < STAND_LOOKS; i++) await wait(STAND_LOOK_MS);
    return loaded();
  }
  async function holdDeeds() {
    if (deedsAsked || !onlineHomes) return null;
    deedsAsked = true;
    if (!await standing()) { deedsAsked = false; return null; }
    try {
      const held = await holdRealmDeeds(onlineHomes, { houses: player().houses });
      for (const d of held) if (!d.r?.ok) console.warn(`[homes] the deed to house ${d.buildingKey} is not held: ${d.r?.error}`);
      return held;
    } catch (e) {
      console.warn('[homes] the deeds could not be held:', e?.message ?? e);
      return null;
    }
  }
  async function sweepGone() {
    if (goneAsked || !homesApi || !realm) return null;
    goneAsked = true;
    if (!await standing()) { goneAsked = false; return null; }
    try {
      const r = await homesApi.mine();
      if (!r?.ok || !Array.isArray(r.data?.homes)) { goneAsked = false; return null; }
      const p = player();
      // ownNow rechecks the live registry, so a home bought while the list was read is not swept.
      const swept = homesGoneFrom(p.sceneCache ??= createSceneCache(), r.data.homes, { ownNow: (m, k) => !!onlineHomes?.homeAt(m, k)?.own });
      if (swept.own.length) { giveOwn(swept.own); say(homesGoneLine(swept.own)); }
      for (const name of swept.gone) console.log(`[homes] ${name}: no longer the account's - let go`);
      return swept;
    } catch (e) {
      console.warn('[homes] the homes the account holds no more could not be swept:', e?.message ?? e);
      return null;
    }
  }
  return { holdDeeds, sweepGone };
}
