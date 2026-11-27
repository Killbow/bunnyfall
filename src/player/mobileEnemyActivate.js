// Activation of a clicked living enemy, ported from PlayerActivate.ActivateMobileEnemy.
// Info, Grab, and Talk name the enemy; Steal runs the pickpocket.

import { PICKPOCKET_DISTANCE, TREASURE_ACTIVATION_DISTANCE, tooFarAwayText, pickFoeHit, DOOR_ACTIVATION_DISTANCE, allyYields } from './activate.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { PLAYER_TARGET, resetAllyTeamOnPlayerAttack } from '../characters/enemyTargets.js';
import { enemyDisplayName } from '../characters/enemyBasics.js';
import { properName } from '../characters/champions.js';
import { pickpocket } from '../talk/talk.js';
import { localizedText, getLocalizedEnemyName } from '../ui/textManager.js';
import { sparedByPlayer } from '../combat/friendlyFire.js';

export const YOU_SEE_A_TEXT = 'You see a %s.';
export const YOU_SEE_PROPER_TEXT = 'You see %s.';
export const YOU_SEE_AN_TEXT = 'You see an %s.';
export function youSeeEnemyText(name) {
  const n = name ?? '';
  const vowel = 'aeiouAEIOU'.includes(n[0] ?? '');
  return (vowel ? localizedText('youSeeAn', YOU_SEE_AN_TEXT) : localizedText('youSeeA', YOU_SEE_A_TEXT)).replaceAll('%s', n);
}

/**
 * @param foe
 * @param distance
 * @param mode
 * @param player
 * @param deps.hud
 * @param deps.midScreen
 * @param deps.modal
 * @param deps.makeEnemiesHostile
 * @param deps.playerFeet
 * @param deps.rolls
 * @param deps.nothingText
 * @param deps.openCompanion
 * @param deps.openLiving
 * @returns
 */
export function activateMobileEnemy(foe, distance, mode, player, {
  hud = null, modal = null, makeEnemiesHostile = null, playerFeet = null,
  rolls = Math.random, nothingText = () => 'You found nothing valuable.',
  midScreen = setMidScreenText,
  openCompanion = null,
  openFate = null,
  openLiving = null,
} = {}) {
  if (!foe || foe.dead) return false;
  if (foe.yielded && !foe.puppet && openFate) {
    if (!(distance <= TREASURE_ACTIVATION_DISTANCE)) { midScreen?.(tooFarAwayText()); return true; }
    openFate(foe);
    return true;
  }
  const entity = foe.entity ?? null;
  if (mode !== 'steal' && openCompanion && foe.companion != null && foe.shipmate === true && !String(foe.companion).startsWith('peer:')) {
    if (distance > TREASURE_ACTIVATION_DISTANCE) { midScreen?.(tooFarAwayText()); return true; }
    if (openCompanion(foe)) return true;
  }
  if (mode !== 'steal' && mode !== 'info' && openLiving && foe.living?.res && foe.shipmate === true) {
    const far = distance > TREASURE_ACTIVATION_DISTANCE;
    if (far) { midScreen?.(tooFarAwayText()); return true; }
    if (openLiving(foe)) return true;
  }
  if (mode !== 'steal') {
    const own = properName(entity);
    const mobileType = foe.mobileType ?? entity?.mobileType ?? -1;
    const name = own ?? enemyDisplayName(mobileType);
    if (name) hud?.(own ? YOU_SEE_PROPER_TEXT.replace('%s', own.replace(/^The /, 'the ')) : youSeeEnemyText(getLocalizedEnemyName(mobileType, name)));
    return true;
  }
  if (!entity?.isClass) return true;
  if (sparedByPlayer(foe)) return true;
  // The attempt flag wraps the distance check, so an enemy already tried gives no output at any range.
  if (entity.pickpocketAttempted) return true;
  if (distance > PICKPOCKET_DISTANCE) { midScreen?.(tooFarAwayText()); return true; }
  entity.pickpocketAttempted = true;
  const r = pickpocket(player, { target: entity, rolls, nothingText });
  if (r.modal) modal?.(r.message); else hud?.(r.message);
  if (!r.success) {
    // The hostile read comes before makeEnemiesHostile, which flips this enemy too.
    if (!foe.ai?.isHostile) makeEnemiesHostile?.();
    foe.ai?.makeEnemyHostileToAttacker?.(PLAYER_TARGET, playerFeet ?? null);
    // The ally revert on the entity is the second half of the hostile call and runs here as well.
    if (foe.ai) resetAllyTeamOnPlayerAttack(foe.ai, foe.entity, foe.mobileType);
  }
  return true;
}

/**
 * @param deps.nearerThan
 * @param deps.doorBehind
 * @param deps.behind
 */
export function tryMobileEnemyActivate(eye, dir, foes, collider, reach, mode, player, deps = {}) {
  const hit = pickFoeHit(eye, dir, foes, collider, reach);
  if (!hit) return false;
  if (!(hit.distance < (deps.nearerThan ?? Infinity))) return false;
  if (allyYields(hit.foe, deps.behind)) return false;
  if (yieldsToDoor(hit.foe, deps.doorBehind, mode)) return false;
  return activateMobileEnemy(hit.foe, hit.distance, mode, player, deps);
}

export function yieldsToDoor(foe, doorBehind, mode = null) {
  if (!foe || foe.companion != null || mode === 'steal') return false;
  return !hostileToMe(foe) && Number.isFinite(doorBehind) && doorBehind <= DOOR_ACTIVATION_DISTANCE;
}

// A streamed puppet is hostile to me only when it is on me, so other players' guards do not block my doors.
export function hostileToMe(foe) {
  if (!foe) return false;
  if (foe.puppet) return !!foe._pupMine;
  return !!foe.ai?.isHostile;
}
