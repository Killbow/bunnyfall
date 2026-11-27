// @ts-check
import { t } from '../../ui/textManager.js';
import { nextShot } from './shotKinds.js';
import { LOAD_GROUPS, loadGroupOf } from './navalGunnery.js';
import { batteryOf } from './navalShips.js';

export const SHOT_WHEEL_S = 0.18;

const SHOT_WORDS = Object.freeze({
  round: () => t('naval.shot.round', 'Round shot'), grape: () => t('naval.shot.grape', 'Grapeshot'),
  chain: () => t('naval.shot.chain', 'Chain shot'), heated: () => t('naval.shot.heated', 'Heated shot'),
});
const GROUP_WORDS = Object.freeze({
  broadside: () => t('naval.shot.group.broadside', 'Broadsides'), bow: () => t('naval.shot.group.bow', 'Bow chasers'),
  stern: () => t('naval.shot.group.stern', 'Stern guns'),
});
export const shotName = (shot) => (SHOT_WORDS[shot] ?? SHOT_WORDS.round)();
export const groupName = (group) => (GROUP_WORDS[group] ?? GROUP_WORDS.broadside)();

const sidesOf = (group) => (group === 'broadside' ? ['starboard', 'port'] : [group]);
export function gunSideOf(hull, group) {
  return sidesOf(group).find((s) => { const b = batteryOf(hull, s); return !!b && b.gun !== 'barrel'; }) ?? null;
}

/**
 * @param {{ boat: () => any, deck: (boat: any) => any, side: (boat: any) => string | null, aiming: () => boolean,
 *   say?: (text: string, seconds: number) => void, now: () => number }} deps
 */
export function createNavalLoads(deps) {
  let wheelAt = -Infinity;
  function groupAt(boat) {
    const look = loadGroupOf(deps.side(boat));
    const group = look && gunSideOf(boat.hull, look) ? look : LOAD_GROUPS.find((g) => gunSideOf(boat.hull, g)) ?? null;
    return group ? { group, side: gunSideOf(boat.hull, group) } : null;
  }
  function cycle(dir = 1) {
    const boat = deps.boat();
    const at = boat ? groupAt(boat) : null;
    if (!at) return false;
    const deck = deps.deck(boat);
    const shot = nextShot(deck.load(at.side), dir);
    deck.setLoad(at.side, shot);
    deps.say?.(t('naval.shot.loading', '{guns}: {shot}, loading', { guns: groupName(at.group), shot: shotName(shot) }), 1.6);
    return true;
  }
  return {
    cycle,
    wheel(deltaY) {
      if (!deps.aiming() || !deltaY || !deps.boat()) return false;
      const now = deps.now(), quiet = now - wheelAt >= SHOT_WHEEL_S;
      wheelAt = now;
      // Debounced from the last notch, so a trackpad's inertial stream steps once.
      // The wheel stays with the guns inside the quiet time, so the camera zoom never takes it.
      if (quiet) cycle(deltaY > 0 ? 1 : -1);
      return true;
    },
    label(boat) {
      const at = boat ? groupAt(boat) : null;
      return at ? t('naval.shot.button', '{guns}: {shot}', { guns: groupName(at.group), shot: shotName(deps.deck(boat).load(at.side)) }) : null;
    },
  };
}
