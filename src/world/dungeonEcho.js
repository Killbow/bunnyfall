// @ts-check

import { isActionDoorObject, PLAY_DEPTH_MAX } from './actionSystem.js';
import { sceneCompassWord } from '../ui/compassWords.js';

export const ECHO_NEAR_M = 3;
export const ECHO_VERT_M = 2.5;
export const ECHO_FLAT_M = 1.5;
export const ECHO_FIND_M = 12;
export const ECHO_MAP_MAX = 8;
export const ECHO_LOOK_S = 0.25;
export const ECHO_CHAIN_MAX = PLAY_DEPTH_MAX;
export const ECHO_PREF = 'dungeonEchoes';

export function wayWord(dx, dy, dz, who = 'you') {
  const up = dy > ECHO_VERT_M ? `above ${who}` : dy < -ECHO_VERT_M ? `below ${who}` : '';
  const way = Math.hypot(dx, dz) >= ECHO_FLAT_M ? `to the ${sceneCompassWord(dx, dz)}` : '';
  if (up && way) return `${up}, ${way}`;
  return up || way || 'close by';
}

export const isEchoMover = (o) => !!o && (o.kind === 'action' || o.kind === 'moveFlat' || o.kind === 'door');

// Read this before the play (the action system notifies the observer first); a chained unlock, an open on an open
// door, or a relay leaves it unchanged.
export const echoState = (o) => `${o?.state ?? ''}|${o?.moveState ?? ''}`;
export const echoMoved = (o, before) => echoState(o) !== before;

export function echoVerb(o) {
  if (isActionDoorObject(o)) return 'A door swings';
  if (o?.kind === 'moveFlat') return 'Something shifts';
  return 'Stone grinds';
}

export function echoLine(o, from, at) {
  const where = wayWord(at[0] - from[0], at[1] - from[1], at[2] - from[2]);
  return `${echoVerb(o)} somewhere ${where}.`;
}

/**
 * @param {(o: any) => any} next
 * @param {any} o
 */
export function chainMovers(next, o, max = ECHO_CHAIN_MAX) {
  const out = [];
  if (!o || typeof next !== 'function') return out;
  const seen = new Set([o]);
  let n = next(o);
  for (let i = 0; n && i < max && !seen.has(n); i++) {
    seen.add(n);
    if (isEchoMover(n)) out.push(n);
    n = next(n);
  }
  return out;
}

export const boxMiddle = (box) => [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];

/**
 * @param {any} o
 * @param {(o: any) => any} next
 * @param {(o: any) => any} boxOf
 */
export function examineLine(o, next, boxOf) {
  const from = o && boxOf(o);
  if (!from) return null;
  for (const m of chainMovers(next, o)) {
    const box = boxOf(m);
    if (!box) continue;
    const a = boxMiddle(from), b = boxMiddle(box);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    return d <= ECHO_NEAR_M ? 'Works something close by' : `Works something ${wayWord(b[0] - a[0], b[1] - a[1], b[2] - a[2], 'it')}`;
  }
  return null;
}

export function createEchoBook({ max = ECHO_MAP_MAX } = {}) {
  /** @type {Array<{ key: string, at: number[] }>} */
  let list = [];
  return {
    /**
     * @param {string} key
     * @param {number[]} at
     */
    add(key, at) {
      list = list.filter((e) => e.key !== key);
      list.push({ key, at: [at[0], at[1], at[2]] });
      if (list.length > max) list = list.slice(list.length - max);
      return list.length;
    },
    has: (key) => list.some((e) => e.key === key),
    /** @param {(e: { key: string, at: number[] }) => boolean} found */
    take(found) {
      const out = [], keep = [];
      for (const e of list) (found(e) ? out : keep).push(e);
      list = keep;
      return out;
    },
    points: () => list.map((e) => e.at),
    get size() { return list.length; },
    clear() { list = []; },
  };
}
