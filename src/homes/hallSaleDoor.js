// @ts-check
import { ChoiceWindow } from '../ui/talkWindow.js';
import { accountRefusalText } from '../net/accountClient.js';
import { hallEntryTurnable, hallSellable, hallOwnerLines, hallSaleLines, hallSoldLine, hallYourGuild } from './onlineHomes.js';
import { t } from '../ui/textManager.js';

/**
 * @param {{ host: any, townTalk: any, homeOnward: (hit: any, entries: any) => () => void,
 *   turnHallEntry: (bd: any, home: any) => void, homeIdOf: (bd: any) => string, homeTownOf: (bd: any) => number }} deps
 */
export function createHallSaleDoor({ host, townTalk, homeOnward, turnHallEntry, homeIdOf, homeTownOf }) {
  function openHallMenu(bd, home, hit, entries) {
    townTalk?.showOverlay?.(new ChoiceWindow({
      lines: hallOwnerLines(home),
      options: [
        { code: 'KeyG', label: t('home.hallMenu.goIn', 'G: go in'), action: homeOnward(hit, entries) },
        ...(hallEntryTurnable(home) ? [{ code: 'KeyW', label: t('home.hallMenu.entry', 'W: who can enter'), action: () => turnHallEntry(bd, home) }] : []),
        ...(hallSellable(home) ? [{ code: 'KeyS', label: t('home.hallMenu.sell', 'S: sell it'), action: () => openHallSale(bd, home) }] : []),
        { code: 'Escape', label: 'Esc: close', action: () => {} },
      ],
    }));
  }
  function openHallSale(bd, home) {
    townTalk?.showOverlay?.(new ChoiceWindow({
      lines: hallSaleLines(home),
      options: [
        { code: 'KeyY', label: 'Y: yes', action: () => sellHallAt(bd, home) },
        { code: 'KeyN', label: 'N: no', action: () => {} },
      ],
    }));
  }
  const _hallSelling = new Set();
  function sellHallAt(bd, home) {
    const id = homeIdOf(bd);
    if (_hallSelling.has(id)) return;
    _hallSelling.add(id);
    const mapId = homeTownOf(bd);
    const name = home?.hall?.name ?? hallYourGuild();
    Promise.resolve(host.guildHall?.sell?.({ mapId, buildingKey: bd.buildingKey }) ?? { ok: false, error: 'no-guild' })
      .then((r) => {
        if (r?.ok || r?.error === 'guild-hall-moved' || r?.error === 'guild-hall-none') host.onlineHomes?.ensure?.(mapId, { force: true });
        townTalk?.say?.(r?.ok ? hallSoldLine(name, r.data?.back) : accountRefusalText(r?.error ?? 'server'));
      })
      .catch((e) => console.error(e))
      .finally(() => { _hallSelling.delete(id); });
  }
  return { openHallMenu, openHallSale };
}
