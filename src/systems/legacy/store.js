// @ts-check
// A family lives in app storage under `FAMILY_KEY_PREFIX`, apart from any save, with a copy in each member save.
// The birth handoff uses tab storage so it survives the reload and no other tab takes it. Storage can throw in
// privacy modes, so every access is guarded.
import { readFamily, FAMILY_VERSION, nameAtSeat, nameHouse, leanRecord } from './family.js';
import { mergeNews, mergeHeard } from './influence.js';
import { takeRevived } from './revived.js';

export const FAMILY_KEY_PREFIX = 'dagger.legacy.family.';
export const BIRTH_KEY = 'dagger.legacy.birth';
export const BIRTH_MAX_AGE_MS = 10 * 60 * 1000;

const keyOf = (id) => `${FAMILY_KEY_PREFIX}${id}`;

export function loadFamily(storage, id) {
  if (!storage || !id) return null;
  try { return readFamily(JSON.parse(storage.getItem(keyOf(id)) ?? 'null')); } catch { return null; }
}

const seenRevs = new WeakMap();
export function noteSeen(family, rev) {
  if (family && typeof family === 'object' && Number.isSafeInteger(rev)) seenRevs.set(family, rev);
}
export const seenRevOf = (family) => (family && typeof family === 'object' ? seenRevs.get(family) ?? null : null);

/**
 * A copy is stale when the stored rev differs from `base`, the rev it was made from. A stale copy takes in the
 * stored facts and is written one past both.
 * @param {any} storage
 * @param {any} family
 * @param {number|null} [base]
 */
export function storeFamily(storage, family, base = seenRevOf(family)) {
  if (!storage || !family?.id) return false;
  try {
    const was = loadFamily(storage, family.id);
    if (was && (base != null ? was.rev !== base : was.rev >= family.rev)) {
      mergeFacts(family, was);
      family.rev = Math.max(was.rev, family.rev) + 1;
    }
    leanRecord(family);
    storage.setItem(keyOf(family.id), JSON.stringify(family));
    seenRevs.set(family, family.rev);
    return true;
  } catch { return false; }
}

// These fields come as a whole from the copy that saved the member last (`savedAt`), and a field that copy lacks is
// deleted.
export const MEMBER_SAVE_FIELDS = Object.freeze(['given', 'surname', 'gender', 'race', 'raceId', 'face', 'careerIndex', 'className', 'career', 'groups',
  'level', 'stats', 'skills', 'leveling', 'standing', 'look', 'parked', 'deedsTaken']);

// Each copy mints ids from its own `nextId`, so one id in two copies can name two different people.
export function samePerson(p, o) {
  if (!p || !o || (p.kind ?? 'member') !== (o.kind ?? 'member')) return false;
  if ((p.residentId ?? null) !== (o.residentId ?? null) || (p.realm?.sid ?? null) !== (o.realm?.sid ?? null)) return false;
  if ((Number(p.born) || 0) !== (Number(o.born) || 0)) return false;
  const a = [...(p.parents ?? [])].sort((x, y) => x - y), b = [...(o.parents ?? [])].sort((x, y) => x - y);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function rekeyClashes(mine, other) {
  const theirs = new Map((other?.people ?? []).map((o) => [o.id, o]));
  const clash = (mine?.people ?? []).filter((p) => theirs.has(p.id) && !samePerson(p, theirs.get(p.id)));
  /** @type {Map<number, number>} */
  const moved = new Map();
  if (!clash.length) return moved;
  let next = Math.max(mine.nextId | 0, other.nextId | 0, ...mine.people.map((p) => p.id + 1), ...other.people.map((o) => o.id + 1));
  for (const p of clash) moved.set(p.id, next++);
  const to = (/** @type {number} */ id) => (moved.has(id) ? /** @type {number} */ (moved.get(id)) : id);
  for (const p of mine.people) {
    p.id = to(p.id);
    p.parents = (p.parents ?? []).map(to);
    p.children = (p.children ?? []).map(to);
    if (p.spouse != null) p.spouse = to(p.spouse);
  }
  mine.currentId = to(mine.currentId);
  if (mine.pending) mine.pending.fallenId = to(mine.pending.fallenId);
  for (const r of mine.remains ?? []) {
    if (Number.isInteger(r.of) && moved.has(r.of)) { r.of = to(r.of); r.id = `r${r.of}`; }
    if (Number.isInteger(r.by)) r.by = to(r.by);
  }
  for (const h of mine.houses ?? []) { if (Number.isInteger(h.by)) h.by = to(h.by); if (Number.isInteger(h.from)) h.from = to(h.from); }
  mine.nextId = next;
  return moved;
}

// Facts are only ever added: a death or retirement either copy knows survives. A pending fall from the other copy
// is taken only while this copy has not heard of that death.
export function mergeFacts(mine, other) {
  if (!mine || !other || mine.id !== other.id) return mine;
  rekeyClashes(mine, other);
  const knew = new Map(mine.people.map((p) => [p.id, !!p.died]));
  for (const o of other.people) {
    const p = mine.people.find((x) => x.id === o.id);
    if (!p) { mine.people.push(JSON.parse(JSON.stringify(o))); continue; }
    if (!p.died && o.died) p.died = o.died;
    if (p.retired == null && o.retired != null) p.retired = o.retired;
    p.toll = Math.max(p.toll | 0, o.toll | 0);
    p.lived = Math.max(p.lived | 0, o.lived | 0);
    if (!p.characterId && o.characterId) p.characterId = o.characterId;
    if ((Number(o.savedAt) || 0) > (Number(p.savedAt) || 0)) {
      for (const k of MEMBER_SAVE_FIELDS) {
        if (o[k] === undefined) delete p[k];
        else p[k] = o[k] && typeof o[k] === 'object' ? JSON.parse(JSON.stringify(o[k])) : o[k];
      }
      p.savedAt = o.savedAt;
    }
    if (!p.standing && o.standing) p.standing = JSON.parse(JSON.stringify(o.standing));
    if (p.died) delete p.heard;
    else if (p.heard || o.heard) { const h = mergeHeard(p.heard, o.heard); if (h) p.heard = h; else delete p.heard; }
    if (p.childDay == null && o.childDay != null && p.spouse === o.spouse) p.childDay = o.childDay;
    for (const c of o.children ?? []) if (!p.children.includes(c)) p.children.push(c);
  }
  // A recorded spouse survives the merge. The other copy's spouse replaces this one only when this spouse is dead
  // and the other wedding is newer.
  const byId = new Map(mine.people.map((p) => [p.id, p]));
  for (const o of other.people) {
    const p = byId.get(o.id);
    if (!p || o.spouse == null || p.spouse === o.spouse) continue;
    const mineDead = p.spouse != null && !!byId.get(p.spouse)?.died;
    if (p.spouse != null && !(mineDead && (Number(o.wedAt) || 0) > (Number(p.wedAt) || 0))) continue;
    p.spouse = o.spouse;
    p.wedAt = o.wedAt ?? p.wedAt ?? null;
    p.childDay = o.childDay ?? null;
  }
  for (const r of other.remains ?? []) if (!(mine.remains ??= []).some((x) => x.id === r.id)) mine.remains.push(JSON.parse(JSON.stringify(r)));
  for (const h of other.houses ?? []) {
    const same = (x) => (x.mapId | 0) === (h.mapId | 0) && (x.buildingKey | 0) === (h.buildingKey | 0);
    if (!(mine.houses ??= []).some(same)) mine.houses.push({ ...h });
  }
  if (!mine.pending && other.pending && knew.get(other.pending.fallenId) === false) mine.pending = JSON.parse(JSON.stringify(other.pending));
  // The seat with the later `at` wins, whichever copy is newer by rev.
  if (other.seat && (!mine.seat || (Number(other.seat.at) || 0) > (Number(mine.seat.at) || 0))) mine.seat = { ...other.seat };
  // The house name comes from either copy's surname, never from the seat, so a copy that never learned the name
  // cannot rename the house after a seat move.
  const houseName = String(mine.surname ?? '').trim() || String(other.surname ?? '').trim();
  if (houseName) nameHouse(mine, houseName);
  nameAtSeat(mine);
  if (!mine.home && other.home) mine.home = { ...other.home };
  mine.news = mergeNews(mine.news, other.news);
  mine.nextId = Math.max(mine.nextId | 0, other.nextId | 0, ...mine.people.map((p) => p.id + 1));
  // Revival stamps apply after the facts merge, so a death taken in from a stale copy is dropped again.
  takeRevived(mine, other);
  return mine;
}

export function listFamilies(storage) {
  const out = [];
  if (!storage) return out;
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k?.startsWith(FAMILY_KEY_PREFIX)) continue;
      const f = loadFamily(storage, k.slice(FAMILY_KEY_PREFIX.length));
      if (f) out.push(f);
    }
  } catch { }
  return out.sort((a, b) => b.founded - a.founded || (a.id < b.id ? -1 : 1));
}

export function leaveBirth(tab, birth, now = Date.now()) {
  if (!tab) return false;
  try { tab.setItem(BIRTH_KEY, JSON.stringify({ v: FAMILY_VERSION, ...birth, at: now })); return true; } catch { return false; }
}

// The birth stays stored until the born member's first save calls `clearBirth`, so a failed boot can retry. A
// reload births no one twice because the person carries their character id.
export function readBirth(tab, personId, now = Date.now()) {
  if (!tab) return null;
  let b = null;
  try { b = JSON.parse(tab.getItem(BIRTH_KEY) ?? 'null'); } catch { return null; }
  return birthOf(b, personId, now);
}
export function clearBirth(tab) {
  try { tab?.removeItem(BIRTH_KEY); } catch { }
}

function birthOf(b, personId, now) {
  if (!b || b.v !== FAMILY_VERSION || typeof b.familyId !== 'string') return null;
  if (!(now - (Number(b.at) || 0) <= BIRTH_MAX_AGE_MS)) return null;
  if (String(b.personId) !== String(personId)) return null;
  return {
    familyId: b.familyId, personId: Number(b.personId), region: String(b.region ?? ''), loc: String(b.loc ?? ''), estate: Math.max(0, Number(b.estate) | 0),
    ...(b.newborn === true ? { newborn: true } : {}),
  };
}

export function newestSaveOf(info, characterId) {
  let best = -1;
  let bestT = -Infinity;
  for (const [key, card] of info ?? []) {
    if (!characterId || card?.characterId !== characterId) continue;
    const t = Number(card?.dateAndTime?.realTime) || 0;
    if (t > bestT) { bestT = t; best = key; }
  }
  return best;
}
