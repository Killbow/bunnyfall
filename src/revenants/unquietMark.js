// @ts-check
// The Unquiet mark: only a marked special enemy, or a revenant already, may rise. The draw hashes the voice id, so it
// moves no shared dice. Elites and champions import this, so it must not pull in the revenant system.
import { mintCharacterId } from '../characters/characterId.js';

export const UNQUIET_MARK = 0.25;

/** @type {null | ((entity: any) => boolean)} */
let _gate = null;
export function setUnquietGate(fn) { _gate = typeof fn === 'function' ? fn : null; }

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const unquietId = (id) => typeof id === 'string' && id.length > 0 && fnv(`${id}|unquiet`) % 1000 < Math.round(UNQUIET_MARK * 1000);

export function markUnquiet(entity) {
  if (!entity || typeof entity !== 'object') return false;
  if (typeof entity.unquiet === 'boolean') return entity.unquiet;
  let open = false;
  try { open = !!_gate?.(entity); } catch { open = false; }
  if (!open) return false;
  entity._voiceId ??= mintCharacterId();
  entity.unquiet = _force ?? unquietId(entity._voiceId);
  return entity.unquiet;
}
// Open-zone and sand enemies are tagged after their promotion draws the mark, so they never count as Unquiet.
export const isUnquiet = (entity) => entity?.unquiet === true && !entity.wildFoe && !entity.wildGiant && !entity.bout;
let _force = null;
export function _forceUnquietForTests(v = null) { _force = v == null ? null : !!v; }
