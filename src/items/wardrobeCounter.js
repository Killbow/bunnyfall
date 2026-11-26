// @ts-check
// The Wardrobe row at clothing stores, armorers, and weaponsmiths, and the window it opens to wear or clear a look.
import { createWardrobeOverlay } from '../ui/wardrobe/wardrobeDoor.js';
import { isWardrobeShop, wearAppearance, clearAppearance, noteHeldLooks } from './appearances.js';
import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { itemLongName } from './itemInfo.js';
import { refreshPaperDoll } from '../ui/paperDoll.js';
import { audio } from '../audio/audio.js';
import { SOUND } from '../audio/soundClips.js';
import { t } from '../ui/textManager.js';

export const WARDROBE_ROW = () => t('wardrobe.row', 'Wardrobe');

/** @param {{ mount: (w: any) => any, entity?: any, onDressed?: (entity: any) => void }} deps */
export function createWardrobeCounter({ mount, entity = playerEntity, onDressed = (e) => { Promise.resolve().then(() => refreshPaperDoll(e)).catch(() => { }); } }) {
  const row = (/** @type {unknown} */ buildingType) => (isWardrobeShop(buildingType) ? { label: WARDROBE_ROW(), onOpen: () => open() } : undefined);
  function open() {
    // The pack's looks are noted first, so a piece bought a moment ago already counts as a look.
    noteHeldLooks(entity);
    const o = createWardrobeOverlay({ entity, wear, clear, nameOf: (/** @type {any} */ it) => itemLongName(it) });
    return o ? mount(o) : null;
  }
  function wear(/** @type {any} */ item, /** @type {any} */ look) {
    const done = wearAppearance(entity, item, look);
    if (done.ok) { audio.playOneShot(SOUND.GoldPieces, 1); dressed(); }
    return done;
  }
  function clear(/** @type {any} */ item) {
    const done = clearAppearance(entity, item);
    if (done.ok) dressed();
    return done;
  }
  const dressed = () => { surfacePlayer(); onDressed(entity); };
  return { row, open, wear, clear };
}
