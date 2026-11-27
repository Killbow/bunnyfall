// @ts-check
import { createLockpickAct } from './lockpickAct.js';
import { lockSeed, lockBand, autoOpens } from './lockpickLaw.js';
import { lockpickCount, spendLockpick } from './lockpickItem.js';
import { createLockEar } from './lockpickSounds.js';
import { createLockpickOverlay } from '../../ui/lockpickDoor.js';
import { lookAtLockText, exteriorLockpickingChance, interiorLockpickingChance, LOCKPICKING_SUCCESS_TEXT } from '../../world/actionSystem.js';
import { tallyCrimeGuildRequirements } from '../../guilds/crimeGuilds.js';
import { playerEntity, surfacePlayer } from '../../characters/playerEntity.js';
import { setMidScreenText } from '../../ui/midScreenText.js';
import { audio as bus } from '../../audio/audio.js';
import { SOUND } from '../../audio/soundClips.js';
import { tallySkill, skillValue, SKILLS } from '../../characters/skills.js';
import { liveStat } from '../../characters/statMods.js';
import { getPref } from '../../ui/uiPrefs.js';
import { t } from '../../ui/textManager.js';

export const OPEN_HOLD_MS = 650;

export const LOCKPICK_HOST_WORDS = Object.freeze({
  need: () => t('lock.need', 'You need a lockpick to pick this lock.'),
  failed: () => t('lock.failed', 'You fail to pick the lock.'),
  door: () => t('lock.what.door', 'the door'),
  // Each container kind has its own phrase because a name inserted into a translated sentence cannot take that
  // language's article or case.
  container: (/** @type {string} */ kind) => (kind === 'crate' ? t('lock.what.crate', 'the crate') : t('lock.what.chest', 'the chest')),
});

/** @param {{ talk?: any, mount?: (overlay: any) => any, line?: (line: string) => void, player?: any, say?: (line: string) => void, audio?: any, changed?: () => void, gentle?: () => boolean, reduced?: () => boolean, rolls?: () => number, overlay?: (deps: any) => any, minigame?: () => boolean }} deps */
export function createLockpickHost({ talk = null, mount = (w) => talk?.showOverlay?.(w), line = (l) => talk?.say?.(l), player = playerEntity, say = setMidScreenText, audio = bus, changed = surfacePlayer,
  gentle = () => getPref('gentleActs') === true, reduced = defaultReduced, rolls = () => Math.random(), overlay = createLockpickOverlay,
  minigame = () => getPref('lockpickMinigame') === true }) {
  let ear = null, dead = false;
  /** @type {any} */
  let open = null;
  const host = {
    /** @param {{ lock: number, chance: number, key: string, what?: string, exterior?: boolean, onOpen?: () => void }} o */
    begin({ lock, chance, key, what = LOCKPICK_HOST_WORDS.door(), exterior = false, onOpen = () => {} }) {
      if (dead || (open && !open.done)) return true;
      if (lockpickCount(player?.items) < 1) { say(LOCKPICK_HOST_WORDS.need()); return true; }
      if (!minigame()) {
        tallySkill(player, SKILLS.Lockpicking, 1);
        if (autoOpens(chance, rolls(), exterior)) onOpen();
        else say(LOCKPICK_HOST_WORDS.failed());
        return true;
      }
      const skill = skillValue(player, SKILLS.Lockpicking);
      const seed = lockSeed(key);
      const act = createLockpickAct({ lock, chance, seed, band: lockBand(liveStat(player, 'agility')), skill, exterior, rng: rolls });
      ear ??= createLockEar({ audio });
      let opened = false;
      const ov = overlay({
        act, what, seed, skill, gentle: gentle(), reduced,
        gone: () => player?.health <= 0,
        difficulty: lookAtLockText(lock, player.level, skill),
        picks: () => lockpickCount(player?.items),
        onAnswer: (/** @type {string} */ a) => {
          ear.cue(a);
          if (a === 'break') {
            spendLockpick(player);
            tallySkill(player, SKILLS.Lockpicking, 1);
            changed();
            if (lockpickCount(player?.items) < 1) ov?.out?.();
          } else if (a === 'open') {
            opened = true;
            tallySkill(player, SKILLS.Lockpicking, 1);
            setTimeout(() => ov?.shut?.(), OPEN_HOLD_MS);
          }
        },
        onClose: (/** @type {boolean} */ self) => { if (open === ov) open = null; if (opened && self && !dead && !(player?.health <= 0)) onOpen(); },
      });
      if (!ov) return true;
      open = ov;
      mount(ov);
      return true;
    },
    /** @param {{ lock: number, skill: number, key: string, enter: () => void }} o */
    frontDoor({ lock, skill, key, enter }) {
      return host.begin({
        lock, chance: exteriorLockpickingChance(lock, skill), exterior: true, key,
        onOpen: () => { tallyCrimeGuildRequirements(player, true, 1); line(LOCKPICKING_SUCCESS_TEXT); audio?.playOneShot?.(SOUND.ActivateLockUnlock, 1); enter(); },
      });
    },
    /** @param {{ lock: number, key: string, what?: string, onOpen?: () => void }} o */
    inside({ lock, key, what, onOpen }) {
      return host.begin({ lock, chance: interiorLockpickingChance(player.level, lock, skillValue(player, SKILLS.Lockpicking)), key, what, onOpen });
    },
    /**
     * @param {any} actions
     * @param {string} place
     */
    wire(actions, place) {
      if (!actions) return;
      actions.onLockpickAttempt = (o) => host.inside({ lock: o.currentLockValue, key: `${place}:${o.key}`, onOpen: () => {
        if (!actions.lockpicked(o)) return;
        if (actions.onLockpickResult) actions.onLockpickResult(o, true);
        else { line(LOCKPICKING_SUCCESS_TEXT); audio?.playOneShot?.(SOUND.ActivateLockUnlock, 1); }
      } });
    },
    get busy() { return !!open && !open.done; },
    dispose() { dead = true; const o = open; open = null; o?.dispose?.(); },
  };
  return host;
}

function defaultReduced() {
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; }
}
