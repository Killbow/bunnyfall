// @ts-check
// Decides, before the boot builds anything, whether loading the picked save moves the player to the place it was saved
// in (the world and dungeon arms of worldQuickLoad in world/worldSaveLoad.js). When it does, the boot skips the start
// pixel. It also returns the name of that place for the loading screen.
import { SAVE_VERSION, dungeonPixelFor } from './save.js';
import { savedLanding } from './mineSaveLanding.js';   // BUNNYFALL (caverns): a mine save, or one stranded in the corner, lands at a pixel of its own

/**
 * @param {any} snap
 * @param {{ locationIndex: Map<string, any>, toPixel: (mt: any) => {x:number,y:number}, online: boolean, startCell: {x:number,y:number} }} deps
 * @returns {{ teleports: boolean, place: string | null }}
 */
export function bootLoadPlan(snap, { locationIndex, toPixel, online, startCell }) {
  if (!snap || snap.v !== SAVE_VERSION) return { teleports: false, place: null };
  const dungeon = String(snap.locationKey ?? '').startsWith('dungeon:');
  const landing = savedLanding(snap, { startCell });
  if (landing) return { teleports: true, place: landing.why === 'mine' ? 'Mine' : null };
  const at = snap.locationKey === 'world' ? snap.world?.pixel
    : dungeon ? snap.dungeon?.pixel ?? dungeonPixelFor(snap.locationKey, locationIndex.values(), toPixel) : null;
  if (!at) return { teleports: false, place: null };
  // Online, a dungeon save outside the start cell usually wakes near a temple, town, or graveyard, named later.
  const wakes = dungeon && online && !(at.x === startCell.x && at.y === startCell.y);
  return { teleports: true, place: wakes ? null : locationIndex.get(`${at.x},${at.y}`)?.name ?? null };
}
