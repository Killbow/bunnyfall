// @ts-check
// Rolls a silver find once per opened loot container per session, online only. The account service decides what a
// find pays and caps it per day, so a device that lies can only ask more often.
import { findChanceOf, FIND_KINDS } from '../net/marksLaw.js';

// Past the cap the oldest key is dropped and could roll again, which the service's daily cap bounds.
export const SILVER_FINDS_KEPT = 4096;

/** @type {((kind: string) => void) | null} */
let _finder = null;
export function setSilverFinder(fn) { _finder = typeof fn === 'function' ? fn : null; }
export const silverFinderSet = () => _finder !== null;

// Hosts pass a stable key for saved containers, so leaving and coming back rolls nothing again.
let _rolledObjects = new WeakSet();
let _rolledKeys = new Set();
const seen = (c) => (typeof c === 'string' ? _rolledKeys.has(c) : _rolledObjects.has(c));
function remember(c) {
  if (typeof c !== 'string') { _rolledObjects.add(c); return; }
  _rolledKeys.add(c);
  if (_rolledKeys.size > SILVER_FINDS_KEPT) _rolledKeys.delete(_rolledKeys.values().next().value);
}

/** @param {string} kind @param {object|string} container @param {() => number} [roll] */
export function silverFindAt(kind, container, roll = Math.random) {
  if (!_finder || !FIND_KINDS.includes(kind)) return false;
  if (container == null || (typeof container !== 'string' && typeof container !== 'object') || container === '') return false;
  // A container rebuilt fresh on every visit sets `noFind`, so coming back cannot pay again.
  if (typeof container === 'object' && /** @type {any} */ (container).noFind === true) return false;
  if (seen(container)) return false;
  remember(container);
  if (!(roll() < findChanceOf(kind))) return false;
  try { _finder(kind); } catch (e) { console.warn('[silver] a find', /** @type {any} */ (e)?.message ?? e); }
  return true;
}

export function _resetSilverFindsForTests() { _finder = null; _rolledObjects = new WeakSet(); _rolledKeys = new Set(); }
