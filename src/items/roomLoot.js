// @ts-check
// Shared room loot: every client computes one base list per container from dice seeded by its name, and the room
// word carries only takes against it. The host grants claims; each player's Renown and Luck add a private bonus.
import { groupReferenceLevel } from '../characters/mentorMode.js';
import { RENOWN_LOOT_QUARTERS } from './renownLoot.js';
import { validLootList, LOOT_LIST_MAX, LOOT_STACK_MAX } from './loot.js';
import { addGoldPieces, addItem, isGoldPieces, stacksWith } from './inventory.js';
import { isEquipped, unequipItem } from '../characters/equip.js';
import { notCarried } from '../net/peerWord.js';
import { registerModSaveData } from '../saves/modSaveData.js';
import { healingSupplyChances, mintHealingPotion, mintMagickaPotion } from './healingSupply.js';
import { restLootChances, restItemsAvailable, createRestItem, REST_PILE_CHANCES, REST_FOE_CHANCES } from '../systems/survival/restItems.js';
import { WILD_TEXT } from '../world/wildZone.js';
import { t } from '../ui/textManager.js';

function hashStream(/** @type {string} */ str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function seededRolls(/** @type {string} */ name) {
  const h = hashStream(String(name));
  let a = h(), b = h(), c = h(), d = h();
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

export const signatureOf = (/** @type {string} */ s) => { const h = hashStream(String(s)); return h().toString(36) + h().toString(36); };

export const ROOM_BASE_KINDS = Object.freeze(['loot', 'corpse', 'enc', 'srch']);
export const isRoomBaseKind = (/** @type {string} */ canon) => typeof canon === 'string' && ROOM_BASE_KINDS.includes(canon.split(':')[0]);

export const roomContainerName = (/** @type {string} */ room, /** @type {string} */ canon, /** @type {number} */ g) => `${room}|${canon}#${g}`;

export const ROOM_BASE_LUCK = 50;
export const ROOM_BASE_QUARTERS = RENOWN_LOOT_QUARTERS[0];
export const ROOM_BASE_FIND = 1;
// Must match FOE_LEVEL_MAX in net/wire.js.
export const ROOM_LEVEL_MAX = 100;
export const ROOM_BASE_MAX = 255;

export function roomBaseLevel(/** @type {number} */ own, /** @type {number[]} */ partners = []) {
  const ref = groupReferenceLevel([own, ...(Array.isArray(partners) ? partners : [])]);
  const lv = Math.round(Number.isFinite(ref) ? /** @type {number} */ (ref) : Number(own) || 1);
  return Math.max(1, Math.min(ROOM_LEVEL_MAX, lv));
}

export const roomBaseGender = (/** @type {string} */ name) => (seededRolls(`${name}|gender`)() < 0.5 ? 'male' : 'female');

export const roomRoller = (/** @type {number} */ lv, /** @type {string} */ gender) => ({
  level: lv, gender, stats: { luck: ROOM_BASE_LUCK }, activeEffects: [], items: [],
});

export function validRoomTerms(/** @type {any} */ t) {
  if (!t || typeof t !== 'object') return null;
  if (!Number.isSafeInteger(t.g) || t.g < 0) return null;
  if (!Number.isInteger(t.lv) || t.lv < 1 || t.lv > ROOM_LEVEL_MAX) return null;
  if (t.n !== undefined && (!Number.isInteger(t.n) || t.n < 1 || t.n > 8)) return null;
  if (t.tm !== undefined && !Number.isFinite(t.tm)) return null;
  return { g: t.g, lv: t.lv, n: t.n ?? 1, tm: t.tm ?? 0 };
}
export const sameRoomTerms = (/** @type {any} */ a, /** @type {any} */ b) => !!a && !!b && a.g === b.g && a.lv === b.lv && (a.n ?? 1) === (b.n ?? 1);
export function roomTermsBeat(/** @type {any} */ a, /** @type {any} */ b) {
  if (!b) return true;
  if (a.g !== b.g) return a.g > b.g;
  if (a.tm !== b.tm) return a.tm < b.tm;
  if (a.lv !== b.lv) return a.lv < b.lv;
  if ((a.n ?? 1) !== (b.n ?? 1)) return (a.n ?? 1) < (b.n ?? 1);
  return typeof a.h === 'string' && typeof b.h === 'string' && a.h < b.h;
}

export function baseSignature(/** @type {any[]} */ items) {
  return signatureOf((items ?? []).map((it) => `${it?.group ?? ''}.${it?.templateIndex ?? ''}.${it?.material ?? ''}.${it?.stackCount ?? 1}.${it?.rarity ?? ''}.${Array.isArray(it?.enchantments) ? it.enchantments.length : 0}`).join(','));
}

export const isRoomWord = (/** @type {any} */ rec) => !!rec && typeof rec === 'object' && Number.isSafeInteger(rec.g) && Number.isInteger(rec.lv);

export const ROOM_TAKEN_TEXT = WILD_TEXT.taken;
export const LOOT_SKEW_TEXT = () => t('loot.room.skew', 'Another player here is on a different version of the game, so this can\'t be opened until you are both on the same one.');
export const ROOM_LAPSED_TEXT = () => t('loot.room.lapsed', 'That take was not confirmed in time, so the item is back where it was.');
export const ROOM_CLAIM_TIMEOUT_MS = 4000;
export const ROOM_PUT_RESAY_MS = 1500;
export const ROOM_CLAIMS_MAX = 32;
export const ROOM_ANSWERS_KEPT = 32;
const ROOM_ID_RE = /^[A-Za-z0-9_.:-]{3,80}$/;
export const validRoomId = (/** @type {any} */ id) => typeof id === 'string' && ROOM_ID_RE.test(id);
export const roomClaimId = (/** @type {string} */ who, /** @type {string} */ stamp, /** @type {number} */ n) => `${who}:${stamp}:${n}`;
export const claimOf = (/** @type {any} */ id, /** @type {any} */ from) => typeof id === 'string' && typeof from === 'string' && id.startsWith(`${from}:`);
export const pieceCount = (/** @type {any} */ it) => (Number.isInteger(it?.stackCount) && it.stackCount > 0 ? it.stackCount : 1);

export function validRoomWord(/** @type {any} */ rec) {
  if (!isRoomWord(rec)) return null;
  const terms = validRoomTerms(rec);
  if (!terms) return null;
  if (rec.h !== undefined && (typeof rec.h !== 'string' || !/^[0-9a-z]{1,16}$/.test(rec.h))) return null;
  /** @type {any[] | null} */
  let b = null;
  if (rec.b !== undefined) {
    if (rec.h === undefined || !Array.isArray(rec.b) || rec.b.length > LOOT_LIST_MAX) return null;
    b = [];
    for (const r of rec.b) {
      const one = validLootList([r]);
      // A base record the item law drops makes the word unreadable, since a dropped place shifts every later place.
      if (!one || one.length !== 1) return null;
      b.push(one[0]);
    }
  }
  const x = [];
  if (rec.x !== undefined) {
    if (!Array.isArray(rec.x) || rec.x.length > ROOM_BASE_MAX) return null;
    const seen = new Set();
    for (const i of rec.x) { if (!Number.isInteger(i) || i < 0 || i >= ROOM_BASE_MAX || seen.has(i)) return null; seen.add(i); x.push(i); }
  }
  /** @type {[number, number][]} */
  const c = [];
  if (rec.c !== undefined) {
    if (!Array.isArray(rec.c) || rec.c.length > ROOM_BASE_MAX) return null;
    for (const p of rec.c) {
      if (!Array.isArray(p) || p.length !== 2) return null;
      const [i, n] = p;
      if (!Number.isInteger(i) || i < 0 || i >= ROOM_BASE_MAX || !Number.isInteger(n) || n < 1 || n > LOOT_STACK_MAX) return null;
      c.push([i, n]);
    }
  }
  /** @type {any[] | null} */
  let s = null;
  /** @type {string[] | null} */
  let si = null;
  if (rec.s !== undefined) {
    if (!Array.isArray(rec.s) || rec.s.length > LOOT_LIST_MAX) return null;
    if (rec.si !== undefined && (!Array.isArray(rec.si) || rec.si.length !== rec.s.length)) return null;
    s = []; si = [];
    const ids = new Set();
    for (let i = 0; i < rec.s.length; i++) {
      const one = validLootList([rec.s[i]]);
      const id = rec.si === undefined ? `s:${i}` : rec.si[i];
      if (!one || !validRoomId(id) || ids.has(id)) return null;
      ids.add(id);
      if (one.length) { s.push(one[0]); si.push(id); }
    }
  }
  const q = [];
  if (rec.q !== undefined) {
    if (!Array.isArray(rec.q) || rec.q.length > ROOM_CLAIMS_MAX) return null;
    for (const cl of rec.q) {
      if (!cl || typeof cl !== 'object' || !validRoomId(cl.id) || !Number.isInteger(cl.n) || cl.n < 1 || cl.n > LOOT_STACK_MAX) return null;
      if (cl.tm !== undefined && !Number.isFinite(cl.tm)) return null;
      if ((cl.p === undefined) === (cl.sp === undefined)) return null;
      if (cl.p !== undefined && (!Number.isInteger(cl.p) || cl.p < 0 || cl.p >= ROOM_BASE_MAX)) return null;
      if (cl.sp !== undefined && !validRoomId(cl.sp)) return null;
      q.push({ id: cl.id, ...(cl.p !== undefined ? { p: cl.p } : { sp: cl.sp }), n: cl.n, tm: cl.tm ?? 0 });
    }
  }
  const a = [];
  if (rec.a !== undefined) {
    if (!Array.isArray(rec.a) || rec.a.length > ROOM_CLAIMS_MAX) return null;
    for (const p of rec.a) {
      if (!p || typeof p !== 'object' || !validRoomId(p.id) || (p.tm !== undefined && !Number.isFinite(p.tm))) return null;
      const one = validLootList([p.it]);
      if (!one) return null;
      a.push({ id: p.id, it: one[0] ?? null, tm: p.tm ?? 0 });
    }
  }
  /** @type {[string, number][]} */
  const y = [];
  if (rec.y !== undefined) {
    if (!Array.isArray(rec.y) || rec.y.length > ROOM_ANSWERS_KEPT) return null;
    for (const p of rec.y) {
      if (!Array.isArray(p) || p.length !== 2 || !validRoomId(p[0]) || !Number.isInteger(p[1]) || p[1] < 0 || p[1] > LOOT_STACK_MAX) return null;
      y.push([p[0], p[1]]);
    }
  }
  return { ...terms, ...(rec.h !== undefined ? { h: rec.h } : {}), ...(b ? { b } : {}), x, c, s, si, q, a, y };
}

export const roomState = (/** @type {any} */ terms) => ({
  terms, taken: new Set(), counts: new Map(), stored: /** @type {any[]} */ ([]), ids: /** @type {string[]} */ ([]),
  answers: /** @type {Map<string, number>} */ (new Map()), claims: /** @type {Map<string, any>} */ (new Map()),
  base: /** @type {{ items: any[], full: (number|null)[], h: string, records: any[] } | null} */ (null),
});

export function carriedBase(/** @type {any[]} */ records) {
  const records0 = JSON.parse(JSON.stringify(records));
  const items = records0.map((/** @type {any} */ r) => ({ ...r }));
  return { items, full: items.map((/** @type {any} */ it) => (Number.isInteger(it?.stackCount) ? /** @type {number} */ (it.stackCount) : null)), h: baseSignature(items), records: records0 };
}

export function answerRoomClaim(/** @type {any} */ state, /** @type {string} */ id, /** @type {number} */ g) {
  state.answers.set(id, g);
  state.claims.delete(id);
  while (state.answers.size > ROOM_ANSWERS_KEPT * 4) state.answers.delete(/** @type {string} */ (state.answers.keys().next().value));
}
function hearRoomClaim(/** @type {any} */ state, /** @type {any} */ cl) {
  if (state.answers.has(cl.id) || state.claims.has(cl.id)) return;
  state.claims.set(cl.id, cl);
  while (state.claims.size > ROOM_CLAIMS_MAX * 2) state.claims.delete(state.claims.keys().next().value);
}

// Places gone merge as a union and counts as a minimum, so words land the same in any order and no take is undone.
export function mergeRoomWord(/** @type {any} */ state, /** @type {any} */ w) {
  let st = state;
  let changed = false;
  const carried = st?.terms.h !== undefined;
  if (st && sameRoomTerms(w, st.terms) && (!carried || w.h === st.terms.h)) {
    if ((w.tm ?? 0) < st.terms.tm) st.terms = { ...st.terms, tm: w.tm ?? 0 };
  } else if (!st || (roomTermsBeat(w, st.terms) && (!carried || w.b))) {
    st = roomState({ g: w.g, lv: w.lv, n: w.n ?? 1, tm: w.tm ?? 0, ...(w.b ? { h: w.h } : {}) });
    if (w.b) st.base = carriedBase(w.b);
    changed = true;
  } else {
    for (const cl of [...(w.q ?? []), ...(w.a ?? [])]) hearRoomClaim(st, { ...cl, stale: true });
    return { state: st, changed: false, answered: [] };
  }
  for (const i of w.x ?? []) if (!st.taken.has(i)) { st.taken.add(i); changed = true; }
  for (const [i, n] of w.c ?? []) { const was = st.counts.get(i); if (was === undefined || n < was) { st.counts.set(i, n); changed = true; } }
  if (Array.isArray(w.s)) { st.stored = w.s; st.ids = Array.isArray(w.si) ? w.si : w.s.map((_, i) => `s:${i}`); changed = true; }
  /** @type {[string, number][]} */
  const answered = [];
  for (const [id, g] of w.y ?? []) if (!st.answers.has(id)) { answerRoomClaim(st, id, g); answered.push([id, g]); changed = true; }
  for (const cl of [...(w.q ?? []), ...(w.a ?? [])]) hearRoomClaim(st, cl);
  return { state: st, changed, answered };
}

export const roomClaimOrder = (/** @type {any} */ a, /** @type {any} */ b) => ((a.tm ?? 0) - (b.tm ?? 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The stored list is written new, never in place, so the host's open window keeps the pieces it shows.
export function judgeRoomClaim(/** @type {any} */ state, /** @type {number} */ baseLength, /** @type {(number|null)[]} */ full, /** @type {any} */ cl, /** @type {(it: any) => boolean} */ admit = () => true) {
  if (state.answers.has(cl.id)) return /** @type {number} */ (state.answers.get(cl.id));
  let g = 0;
  if (cl.stale) g = 0;
  else if ('it' in cl) {
    if (cl.it && admit(cl.it) && state.stored.length < LOOT_LIST_MAX && !state.ids.includes(cl.id)) { state.stored = [...state.stored, cl.it]; state.ids = [...state.ids, cl.id]; g = 1; }
  } else if (cl.p !== undefined) {
    if (cl.p < baseLength && !state.taken.has(cl.p)) {
      const have = state.counts.get(cl.p) ?? (Number.isInteger(full[cl.p]) ? /** @type {number} */ (full[cl.p]) : 1);
      g = Math.min(cl.n, have);
      if (g >= have) { state.taken.add(cl.p); state.counts.delete(cl.p); } else state.counts.set(cl.p, have - g);
    }
  } else {
    const at = state.ids.indexOf(cl.sp);
    if (at >= 0) {
      const it = state.stored[at];
      const have = pieceCount(it);
      g = Math.min(cl.n, have);
      const stored = [...state.stored], ids = [...state.ids];
      if (g >= have) { stored.splice(at, 1); ids.splice(at, 1); } else stored[at] = { ...it, stackCount: have - g };
      state.stored = stored; state.ids = ids;
    }
  }
  answerRoomClaim(state, cl.id, g);
  return g;
}

export function composeRoomView(/** @type {any[]} */ base, /** @type {(number|null)[]} */ full, /** @type {any} */ state, /** @type {any[]} */ personal = [], /** @type {any} */ pending = null) {
  const places = pending?.places ?? new Map(), storedOut = pending?.stored ?? new Map();
  const list = [];
  /** @type {Map<any, any>} */
  const seen = new Map();
  base.forEach((it, i) => {
    if (state.taken.has(i)) return;
    const counted = Number.isInteger(full[i]);
    const left = (state.counts.get(i) ?? (counted ? /** @type {number} */ (full[i]) : 1)) - (places.get(i) ?? 0);
    if (left <= 0) return;
    if (counted) it.stackCount = Math.min(left, /** @type {number} */ (full[i]));
    list.push(it);
    seen.set(it, { p: i, n: pieceCount(it) });
  });
  const shown = (/** @type {any} */ it, /** @type {string} */ id) => {
    const left = pieceCount(it) - (storedOut.get(id) ?? 0);
    if (left <= 0) return;
    const piece = { ...it, stackCount: left };
    list.push(piece);
    seen.set(piece, { sp: id, n: left });
  };
  state.stored.forEach((/** @type {any} */ it, /** @type {number} */ k) => shown(it, state.ids[k]));
  for (const p of pending?.puts ?? []) shown(p.it, p.id);
  list.push(...personal);
  return { list, seen };
}

export const roomWord = (/** @type {string} */ k, /** @type {any} */ state, /** @type {string} */ h, /** @type {{ s: any[], si: string[] }} */ stored, /** @type {number|null} */ t = null, /** @type {[string, number][]} */ y = [], /** @type {any[] | null} */ base = null) => {
  const x = [...state.taken].sort((a, b) => a - b);
  const c = [...state.counts].filter(([i]) => !state.taken.has(i)).sort((a, b) => a[0] - b[0]);
  return {
    k, g: state.terms.g, lv: state.terms.lv, ...(state.terms.n > 1 ? { n: state.terms.n } : {}), tm: state.terms.tm, h,
    ...(base ? { b: base.map((r) => ({ ...r })) } : {}),
    ...(x.length ? { x } : {}), ...(c.length ? { c } : {}), s: stored.s.map((it) => ({ ...it })), si: [...stored.si],
    ...(y.length ? { y } : {}), ...(Number.isFinite(t) ? { t } : {}),
  };
};
export const claimWord = (/** @type {string} */ k, /** @type {any} */ state, /** @type {string} */ h, /** @type {any[]} */ q, /** @type {any[]} */ a, /** @type {number|null} */ t = null, /** @type {any[] | null} */ base = null) => ({
  k, g: state.terms.g, lv: state.terms.lv, ...(state.terms.n > 1 ? { n: state.terms.n } : {}), tm: state.terms.tm, h,
  ...(base ? { b: base.map((r) => ({ ...r })) } : {}),
  ...(q.length ? { q: q.map((cl) => ({ ...cl })) } : {}), ...(a.length ? { a: a.map((p) => ({ id: p.id, it: { ...p.it }, tm: p.tm })) } : {}),
  ...(Number.isFinite(t) ? { t } : {}),
});
export const recentAnswers = (/** @type {any} */ state) => [...state.answers].slice(-ROOM_ANSWERS_KEPT);

export function liftPiece(/** @type {any} */ entity, /** @type {any} */ item, /** @type {number} */ n) {
  if (isGoldPieces(item)) { const had = entity.goldPieces ?? 0, t = Math.min(had, n); entity.goldPieces = had - t; return t; }
  let left = n;
  const off = (/** @type {any[]} */ list, /** @type {number} */ at) => {
    const held = list[at], have = pieceCount(held);
    if (have <= left) { if (isEquipped(held)) unequipItem(entity, held); list.splice(at, 1); left -= have; }
    else { held.stackCount = have - left; left = 0; }
  };
  for (const list of [entity.items, entity.bagItems]) {
    if (!Array.isArray(list) || left <= 0) continue;
    const at = list.indexOf(item);
    if (at >= 0) off(list, at);
    for (let i = list.length - 1; i >= 0 && left > 0; i--) if (list[i] !== item && stacksWith(list[i], item)) off(list, i);
  }
  return n - left;
}
export function givePiece(/** @type {any} */ entity, /** @type {any} */ item, /** @type {number} */ n) {
  if (n <= 0) return;
  if (!notCarried([item])?.length) return;
  if (isGoldPieces(item)) { addGoldPieces(entity, n); return; }
  addItem((entity.items ??= []), Number.isInteger(item?.stackCount) ? { ...item, stackCount: n } : item);
}

export function listMovesSince(/** @type {Map<any, any>} */ seen, /** @type {any[]} */ list, /** @type {(it: any) => boolean} */ skip = () => false) {
  const here = new Set(list);
  const takes = [], grows = [], puts = [];
  for (const [obj, info] of [...seen]) {
    const cur = here.has(obj) ? pieceCount(obj) : 0;
    if (cur === info.n) continue;
    if (cur > info.n) { grows.push({ obj, info, by: cur - info.n }); info.n = cur; continue; }
    const k = info.n - cur;
    info.n = cur;
    if (!cur) seen.delete(obj);
    takes.push({ obj, info, k });
  }
  for (const obj of list) if (obj && !seen.has(obj) && !skip(obj)) puts.push(obj);
  return { takes, grows, puts };
}

// An older build sends whole lists, read as a diff against that peer's previous list and never landed whole.
export const legacySig = (/** @type {any} */ it) => [it?.group, it?.templateIndex, it?.material, it?.rarity, Array.isArray(it?.enchantments) ? it.enchantments.length : 0, it?.uid].map((v) => v ?? '').join('.');
export function legacyCounts(/** @type {any[]} */ list) {
  /** @type {Map<string, { n: number, it: any }>} */
  const m = new Map();
  for (const it of list ?? []) {
    const k = legacySig(it), e = m.get(k);
    if (e) e.n += pieceCount(it); else m.set(k, { n: pieceCount(it), it });
  }
  return m;
}
export function legacyDelta(/** @type {Map<string, { n: number, it: any }> | null} */ prev, /** @type {any[]} */ list) {
  const counts = legacyCounts(list);
  /** @type {{ sig: string, n: number }[]} */ const takes = [];
  /** @type {{ sig: string, n: number, it: any }[]} */ const puts = [];
  for (const [sig, was] of prev ?? []) { const now = counts.get(sig)?.n ?? 0; if (now < was.n) takes.push({ sig, n: was.n - now }); }
  for (const [sig, is] of counts) { const was = prev?.get(sig)?.n ?? 0; if (is.n > was) puts.push({ sig, n: is.n - was, it: is.it }); }
  return { takes, puts, counts };
}

export const roomEmptied = (/** @type {any} */ state, /** @type {number} */ baseLength) => state.stored.length === 0 && state.taken.size >= baseLength;

export const bonusShare = (/** @type {number} */ baseP, /** @type {number} */ ownP) => (ownP > baseP && baseP < 1 ? Math.min(1, (ownP - baseP) / (1 - baseP)) : 0);

// Draws once for every chance whatever it lands, so the dice a later draw reads never move.
export function rollBonusSupplies(/** @type {any[]} */ items, /** @type {'enemy'|'pile'} */ side, /** @type {number} */ baseQ, /** @type {number} */ ownQ, /** @type {() => number} */ rolls) {
  const b = healingSupplyChances(baseQ)[side], o = healingSupplyChances(ownQ)[side];
  if (rolls() < bonusShare(b.healing / 100, o.healing / 100)) items.push(mintHealingPotion());
  if (rolls() < bonusShare(b.magicka / 100, o.magicka / 100)) items.push(mintMagickaPotion());
  const table = side === 'pile' ? REST_PILE_CHANCES : REST_FOE_CHANCES;
  const was = new Map(restLootChances(table, baseQ));
  const open = restItemsAvailable();
  for (const [t, pct] of restLootChances(table, ownQ)) {
    const hit = rolls() < bonusShare((was.get(t) ?? 0) / 100, pct / 100);
    if (hit && open) { const it = createRestItem(t); if (it) items.push(it); }
  }
  return items;
}

export const PLAQUE_MINE_TAG = 'yours';

let _personal = new WeakSet();
export const markPersonal = (/** @type {any} */ it) => { if (it && typeof it === 'object') _personal.add(it); return it; };
export const isPersonalLoot = (/** @type {any} */ it) => !!it && typeof it === 'object' && _personal.has(it);

export const ROOM_BONUS_KEPT = 2048;
export const ROOM_BONUS_SAVE_VENDOR = 'RoomLootBonus';
/** @type {Map<string, Set<number>>} */
let _spent = new Map();
export const bonusSpent = (/** @type {string} */ key) => _spent.get(key) ?? new Set();
export function settleBonusSpent(/** @type {string} */ key, /** @type {number[]} */ gone, /** @type {number[]} */ held = []) {
  let s = _spent.get(key);
  if (!s) { if (!gone.length) return; s = new Set(); }
  for (const i of gone) s.add(i);
  for (const i of held) s.delete(i);
  _spent.delete(key);
  if (s.size) _spent.set(key, s);
  while (_spent.size > ROOM_BONUS_KEPT) _spent.delete(/** @type {string} */ (_spent.keys().next().value));
}
export function validBonusRecord(/** @type {any} */ r) {
  /** @type {Map<string, Set<number>>} */
  const out = new Map();
  for (const row of Array.isArray(r?.spent) ? r.spent.slice(-ROOM_BONUS_KEPT) : []) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || row[0].length > 256 || !Array.isArray(row[1])) continue;
    const s = new Set(row[1].filter((i) => Number.isInteger(i) && i >= 0 && i < LOOT_LIST_MAX));
    if (s.size) out.set(row[0], s);
  }
  return out;
}
registerModSaveData(ROOM_BONUS_SAVE_VENDOR, {
  newSaveData: () => ({ spent: [] }),
  getSaveData: () => ({ spent: [..._spent].map(([k, s]) => [k, [...s]]) }),
  restoreSaveData: (r) => { _spent = validBonusRecord(r); },
});
export function _resetRoomLootForTests() { _spent = new Map(); _personal = new WeakSet(); }
