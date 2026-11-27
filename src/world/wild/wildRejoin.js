// @ts-check
import { WILD_DEATH_HOLD_S, setWildDeath } from '../wildZone.js';

export const WILD_REJOIN_KNOWN_MS = (WILD_DEATH_HOLD_S + 30) * 1000;

/**
 * @typedef {object} WildRejoinDeath
 * @property {number} servedS
 * @property {number[] | null} p
 */

/**
 * @typedef {object} WildBody
 * @property {number[]} p
 * @property {string} room
 * @property {string | null} dungeon
 * @property {{ x: number, y: number } | null} px
 */

/**
 * @typedef {object} WildPlace
 * @property {string | null} dungeon
 * @property {{ x: number, y: number } | null} px
 */

/**
 * @param {{ now?: () => number, present?: () => void, place?: () => WildPlace }} [o]
 */
export function createWildRejoin({ now = () => Date.now(), present = () => {}, place = () => ({ dungeon: null, px: null }) } = {}) {
  let ownDeathAt = -Infinity;
  /** @type {WildRejoinDeath | null} */
  let waiting = null;
  return {
    /**
     * @param {number[]} p
     * @param {string} room
     * @returns {WildBody}
     */
    bodyAt(p, room) {
      const here = place();
      return { p: [...p], room, dungeon: here.dungeon ?? null, px: here.px ?? null };
    },
    begin() {
      const death = waiting && now() - ownDeathAt < WILD_REJOIN_KNOWN_MS ? waiting : null;
      ownDeathAt = now();
      waiting = null;
      return death;
    },
    /**
     * @param {{ ms: number, r?: string, p?: number[] }} word
     * @param {{ alive: boolean }} state
     * @returns {WildRejoinDeath | null}
     */
    heard(word, { alive }) {
      if (!alive || now() - ownDeathAt < WILD_REJOIN_KNOWN_MS) return null;
      if (!(Number.isFinite(word?.ms) && word.ms > 0)) return null;
      ownDeathAt = now();
      const servedS = Math.max(0, WILD_DEATH_HOLD_S - Math.ceil(word.ms / 1000));
      waiting = { servedS, p: Array.isArray(word.p) ? [...word.p] : null };
      setWildDeath({ kill: true, dropped: 0, served: servedS });
      present();
      return waiting;
    },
  };
}
