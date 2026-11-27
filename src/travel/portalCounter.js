// @ts-check
import { ServiceFlowWindow } from '../ui/guildServiceWindows.js';
import { HOW_MANY_ITEMS, SPLIT_INPUT_MAX, parseSplitAmount } from '../items/itemTransfer.js';
import { buyPortalStones, portalStoneMax, portalStoneRefusal, portalStoneRefusalText, PORTAL_TEXT } from './portalStone.js';
import { shardsHeld } from '../items/reforge.js';
import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { audio } from '../audio/audio.js';
import { SOUND } from '../audio/soundClips.js';

// The field starts at 1, not at the maximum as the split popup does, so a stray Return cannot spend the whole
// purse.
export const portalCountField = (max) => ({ numeric: true, maxCharacters: SPLIT_INPUT_MAX, initial: '1', label: HOW_MANY_ITEMS(max) });

/** @param {{ say: (line: string) => void, mount: (w: any) => void, entity?: any }} deps */
export function createPortalCounter({ say, mount, entity = playerEntity }) {
  const pack = () => entity.items ?? [];
  const offer = (n) => ({
    rows: [{ text: PORTAL_TEXT.ask(n, shardsHeld(pack())), center: true }],
    buttons: 'YesNo',
    onYes: () => { buy(n); return null; },
    onNo: () => null,
  });
  const count = (max) => ({
    rows: [],
    field: portalCountField(max),
    onInput: (text) => { const n = parseSplitAmount(text, max); return n == null ? null : [offer(n)]; },
  });
  function ask() {
    const max = portalStoneMax(pack());
    if (max < 1) { say(portalStoneRefusalText(pack(), portalStoneRefusal(pack(), 1))); return null; }
    const flow = new ServiceFlowWindow([max === 1 ? offer(1) : count(max)]);
    mount(flow);
    return flow;
  }
  function buy(n) {
    entity.items = entity.items || [];
    const sale = buyPortalStones(entity.items, n);
    if (!sale.ok) { say(portalStoneRefusalText(entity.items, sale.reason)); return false; }
    audio.playOneShot(SOUND.GoldPieces, 1);
    surfacePlayer();
    say(PORTAL_TEXT.bought(n));
    return true;
  }
  return { ask, buy };
}
