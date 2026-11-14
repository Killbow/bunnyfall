// @ts-check
// At a farm your Company holds, the farmhouse door offers today's chore. Where the door shows no action list, a click
// asks a Y/N question first.
import { ChoiceWindow } from '../ui/talkWindow.js';
import { t } from './textManager.js';
import { farmWordText } from '../net/farmLaw.js';
import { HOME_VERB } from './online/onlineHomes.js';
import { accountRefusalText } from '../net/accountClient.js';

export const FARM_CHORE_VERB = 'farm-chore';
/** @param {string} name */
export const farmChoreDoneText = (name) => t('farm.chore.done', 'You did today\'s chore at {farm}.', { farm: name });

/**
 * @param {{ farms: () => any, say: (s: string) => void, show: (w: any) => void }} deps
 */
export function createFarmDoor({ farms, say, show }) {
  let busy = false;
  const declined = new Set();
  const farmOf = (/** @type {any} */ bd) => (bd?.townMapId ? farms()?.mineHere(bd.townMapId) ?? null : null);
  const open = (/** @type {any} */ bd) => { const f = farmOf(bd); return f && !f.choreDone ? f : null; };

  function run(/** @type {any} */ f) {
    const F = farms();
    if (busy || !F) { say(F ? accountRefusalText('busy') : farmWordText('offline')); return; }
    busy = true;
    Promise.resolve(F.chore(f.mapId))
      .then((r) => say(r?.ok ? farmChoreDoneText(f.name) : farmWordText(r?.error)), () => say(farmWordText('offline')))
      .finally(() => { busy = false; });
  }

  return {
    sig: () => { const F = farms(); return F ? `${F.sig()}|${F.hereKey()}` : ''; },
    verb: FARM_CHORE_VERB,
    rows(/** @type {any} */ bd, /** @type {any[]|null} */ verbs, /** @type {string} */ mode, locked = false) {
      if (mode === 'steal' || !open(bd)) return verbs;
      const enter = locked ? [] : [{ id: HOME_VERB.enter, label: t('farm.door.goIn', 'Go in') }];
      return [...(verbs ?? enter), { id: FARM_CHORE_VERB, label: t('farm.door.chore', 'Do today\'s chore') }];
    },
    /**
     * @param {any} bd
     * @param {string|null} verb
     * @param {{ asked: boolean, listed: boolean, mode: string, onward: () => Promise<any> }} o
     */
    press(bd, verb, { asked, listed, mode, onward }) {
      if (verb === FARM_CHORE_VERB) {
        const f = farmOf(bd);
        if (f?.choreDone) say(farmWordText('farm-chore-done'));
        else if (f) run(f);
        else say(farmWordText('farm-not-ours'));
        return true;
      }
      if (verb != null || listed || asked || mode === 'steal') return false;
      const f = open(bd);
      if (!f || declined.has(f.mapId)) return false;
      show(new ChoiceWindow({
        lines: [t('farm.door.ask', 'Today\'s chore at {farm} is not done yet.', { farm: f.name })],
        options: [
          { code: 'KeyY', label: t('farm.door.askChore', 'Y: do today\'s chore'), action: () => run(f) },
          { code: 'KeyN', label: t('farm.door.askGoIn', 'N: go in'), action: () => { declined.add(f.mapId); Promise.resolve(onward()).catch((e) => console.error(e)); } },
        ],
      }));
      return true;
    },
  };
}
