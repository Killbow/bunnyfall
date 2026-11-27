// @ts-check
import { treeStats, EMPTY_TREE } from '../net/firmament/firmamentLaw.js';

/** @type {Readonly<Record<string, number>>} */
const NONE = Object.freeze({});
let _tree = /** @type {{ start: string|null, keys: readonly string[] }} */ (EMPTY_TREE);
let _stats = NONE;
let _online = false;
let _mentoring = false;
const _listeners = new Set();
const tell = () => { for (const fn of _listeners) { try { fn(); } catch { } } };

export function setFirmamentTree(tree) {
  _tree = tree?.start ? { start: tree.start, keys: [...(tree.keys ?? [])] } : EMPTY_TREE;
  _stats = treeStats(_tree);
  for (const fn of _listeners) { try { fn(); } catch { } }
}
export function setFirmamentOnline(on) {
  const was = _online;
  _online = !!on;
  if (was !== _online) for (const fn of _listeners) { try { fn(); } catch { } }
}
export function setFirmamentMentoring(on) {
  if (_mentoring === !!on) return;
  _mentoring = !!on;
  tell();
}
export function onFirmamentChange(fn) { if (typeof fn === 'function') _listeners.add(fn); return () => _listeners.delete(fn); }

export const firmamentTree = () => _tree;
export const firmamentInForce = () => _online && !!_tree.start;
export const firmamentStats = () => (firmamentInForce() ? _stats : NONE);
export const firmStat = (key) => (firmamentInForce() && !_mentoring ? _stats[key] ?? 0 : 0);
export const firmActMult = (profession) => 1 + firmStat(`act.${profession}`) / 100;

/**
 * @typedef {'seat'|'unread'|'no-sign'|'mentoring'|'duel'|'active'} FirmamentStatus
 * @param {{ read: boolean, dueling: boolean }} o
 * @returns {FirmamentStatus}
 */
export function firmamentStatus({ read, dueling }) {
  if (!_online) return 'seat';
  if (!_tree.start) return read ? 'no-sign' : 'unread';
  if (_mentoring) return 'mentoring';
  if (dueling) return 'duel';
  return 'active';
}

export function _resetFirmamentLiveForTests() { _tree = EMPTY_TREE; _stats = NONE; _online = false; _mentoring = false; _listeners.clear(); }
