// @ts-check

export const SAVE_DATA_PREFIX = 'dagger.save.';
export const SAVE_INFO_PREFIX = 'dagger.saveinfo.';
export const SAVE_SHOT_PREFIX = 'dagger.saveshot.';

export function mintCharacterId() {
  try { const u = globalThis.crypto?.randomUUID?.(); if (u) return u; } catch { }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function characterIdOf(entity) {
  if (!entity) return null;
  if (typeof entity.characterId !== 'string' || !entity.characterId) entity.characterId = mintCharacterId();
  return entity.characterId;
}

export function adoptLegacyCards(storage, characterName, characterId) {
  const stamped = [];
  if (!storage || !characterId) return stamped;
  const keys = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k?.startsWith(SAVE_INFO_PREFIX)) keys.push(k); }
  for (const k of keys) {
    let info;
    try { info = JSON.parse(storage.getItem(k) ?? 'null'); } catch { continue; }
    if (!info || typeof info !== 'object' || info.characterId || (info.characterName ?? '') !== (characterName ?? '')) continue;
    try { storage.setItem(k, JSON.stringify({ ...info, characterId })); stamped.push(k); } catch { }
  }
  return stamped;
}
