// @ts-check
// The player's body drawn as the front or back paperdoll in third person. It imports no net code.
import { RECORD_OFFSETS } from './eotbBillboard.js';

export const DOLL_RECHECK_MS = 400;

/** @typedef {{ dolls: () => any, look: () => any, archive: number }} DollSource */

export function createOwnDoll() {
  /** @type {DollSource|null} */ let src = null;
  /** @type {{ rec: string, backRec: string|null, w: number, h: number }|null} */ let doll = null;
  let checkedAt = -Infinity;

  return {
    setSource(/** @type {DollSource|null} */ s) { src = s; doll = null; checkedAt = -Infinity; },
    get hasSource() { return !!src; },
    pick(/** @type {number} */ orientation, /** @type {number} */ nowMs) {
      if (!src) return null;
      if (nowMs - checkedAt >= DOLL_RECHECK_MS) {
        checkedAt = nowMs;
        try {
          const d = src.dolls()?.dollFor(src.look());
          if (d && typeof d.then !== 'function' && typeof d.rec === 'string') doll = d;
        } catch {}
      }
      if (!doll) return null;
      const behind = RECORD_OFFSETS[((orientation % 8) + 8) % 8] >= 3;
      const back = behind && !!doll.backRec;
      return { archive: src.archive, rec: back ? /** @type {string} */ (doll.backRec) : doll.rec, w: doll.w, h: doll.h };
    },
  };
}
