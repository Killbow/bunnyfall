// @ts-check
// BUNNYFALL: THE PLAYER'S OWN BODY AS A PAPERDOLL. In third person the player is drawn as the front or back paperdoll
// the other players are drawn by (net/remotePlayers.js dollFor: composed once per look, uploaded as a billboard texture),
// in place of Eye Of The Beholder's animated sprites - the back while the camera is behind them, the front otherwise.
//
// A leaf: it composes nothing itself. The host hands it a source - `dolls()` the doll factory (a RemotePlayers),
// `look()` the player's look as the hello carries it (composeLook) and `archive` the doll textures' archive - so this file
// imports nothing of the net and cannot close a cycle with the body.
import { RECORD_OFFSETS } from './eotbBillboard.js';

/** How often the look is asked again (ms): the look is composed from the equip table, and a doll is cached by it. */
export const DOLL_RECHECK_MS = 400;

/** @typedef {{ dolls: () => any, look: () => any, archive: number }} DollSource */

export function createOwnDoll() {
  /** @type {DollSource|null} */ let src = null;
  /** @type {{ rec: string, backRec: string|null, w: number, h: number }|null} */ let doll = null;
  let checkedAt = -Infinity;

  return {
    /** The host's source - once, whenever it has one. */
    setSource(/** @type {DollSource|null} */ s) { src = s; doll = null; checkedAt = -Infinity; },
    get hasSource() { return !!src; },
    /** The picture for the orientation the wheel shows (0 the front .. 4 the back, RECORD_OFFSETS), or null while the doll
     *  is composing or there is no source - the caller draws its sprite then. The last doll stands while a new look composes. */
    pick(/** @type {number} */ orientation, /** @type {number} */ nowMs) {
      if (!src) return null;
      if (nowMs - checkedAt >= DOLL_RECHECK_MS) {
        checkedAt = nowMs;
        try {
          const d = src.dolls()?.dollFor(src.look());
          if (d && typeof d.then !== 'function' && typeof d.rec === 'string') doll = d;
        } catch { /* a look that cannot be composed keeps the sprite */ }
      }
      if (!doll) return null;
      const back = RECORD_OFFSETS[((orientation % 8) + 8) % 8] >= 3 && !!doll.backRec;
      return { archive: src.archive, rec: back ? /** @type {string} */ (doll.backRec) : doll.rec, w: doll.w, h: doll.h };
    },
  };
}
