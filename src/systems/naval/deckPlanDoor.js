// @ts-check
import { fleetShip, shipLabel } from './fleet.js';
import { t } from '../../ui/textManager.js';
import { DECK_FITTINGS } from './deckFittings.js';
import { createDeckPlanOverlay } from '../../ui/navalPlunderDoor.js';
import { vertexBox } from './comeSailAwayPool.js';

/**
 * @param {{ pool: any, pipeline: any, act: (uid: number, verb: string, arg?: any) => { ok: boolean, text: string }, show: (overlay: any) => void,
 *   say?: (text: string) => void, overlay?: (deps: any) => any }} deps
 * @returns {(uid: number) => boolean}
 */
export function createDeckPlanDoor(deps) {
  const footprint = (m) => { const b = vertexBox(deps.pipeline?.cpuModels?.get(m)?.positions); return b ? [b.max[0] - b.min[0], b.max[2] - b.min[2]] : null; };
  return function openDeck(uid) {
    const rec = fleetShip(uid);
    const deck = rec ? deps.pool?.deckOf?.(rec.hull) ?? null : null;
    if (!rec || !deck?.count) { deps.say?.(t('naval.deck.unknown', 'The deck isn\'t loaded yet. Place the ship in the world first.')); return false; }
    // Each model is requested, loaded or not: the request pins it, so a house releasing its hold never frees it.
    for (const [m] of DECK_FITTINGS) Promise.resolve(deps.pipeline?.getGpuMesh?.(m)).catch(() => {});
    const w = (deps.overlay ?? createDeckPlanOverlay)({ name: shipLabel(rec), deck, fittings: rec.deck ?? [], footprint, save: (list) => deps.act(uid, 'deck', list) });
    if (w) deps.show(w);
    return !!w;
  };
}
