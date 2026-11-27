// @ts-check
// Spoils are local to this player and never sent. The device record of rolled pieces is written before the receipt
// is marked spent, and it clears only when a save of its character lands (`saved`), never by clock.
import { rollSpoils, nameEmbers, sigilStone } from './gateSpoils.js';
import { seededRng } from '../weather/wind.js';
import { spewLaunches, spewPiece, flySpew, keepLaunch, floorRayAt } from '../world/gateSpew.js';
import { SpoilsGlowRenderer, tierColour } from '../render/spoilsGlow.js';
import { RARITIES } from '../items/lootRarity.js';
import { RANDOM_TREASURE_ARCHIVE, RANDOM_TREASURE_ICONS, validLootItem } from '../items/loot.js';
import { isIliacCard, iliacCardName } from '../cards/iliacItems.js';
import { billboardSize } from '../world/rmbFlats.js';
import { SOUND } from '../audio/soundClips.js';
import { CLIPS } from '../items/handheldTorches.js';
import { RAY_DISTANCE, TREASURE_ACTIVATION_DISTANCE } from '../player/activate.js';
import { adoptLight } from '../render/lightId.js';
import { LOST_OWED_MAX_MS } from '../net/lostLaw.js';
import { t } from '../ui/textManager.js';

export const SPOILS_ICON_M_PER_PX = 0.022;
export const SPOILS_ICON_MAX_M = 1.1;
// Pseudo-archive id for uploaded item pictures; it is registered in `src/world/eliteGates/pseudoArchives.js` and
// must stay unique.
export const SPOILS_ICON_ARCHIVE = 38121;
export function iconSize(width, height) {
  const k = Math.min(SPOILS_ICON_M_PER_PX, SPOILS_ICON_MAX_M / Math.max(1, width, height));
  return { w: Math.max(1, width) * k, h: Math.max(1, height) * k };
}
export const SPOIL_KEY = 'spoil:';
export const SPOIL_GOLD_KEY = 'spoilGold:';
export const SPOIL_BOX_HALF_M = 0.45;
export const SPOIL_BOX_MIN_H = 0.5;
export const SPOILS_RISE_MS = 400;
export const SPOILS_LIGHT = Object.freeze({ range: 5, k: 1.3, up: 0.6 });
// Device storage keys for unsaved spoils records and spent-receipt marks; renaming them loses both on existing
// devices.
export const SPOILS_STORE_KEY = 'wb5.spoils';
export const SPOILS_DAY_KEY = 'wb5.spoilsDay';
export const SPOILS_KEYS = Object.freeze({ store: SPOILS_STORE_KEY, day: SPOILS_DAY_KEY });
export const SIGIL_TIER = 'artifact';

export const SPOILS_TEXT = Object.freeze({
  gold: (n) => `You take ${n} gold pieces.`,
  item: (name, tier) => (tier && tier !== 'common' ? `You take ${name} (${RARITIES[tier]?.label ?? tier}).` : `You take ${name}.`),
  gathered: 'The spoils of the Burning Court are in your pack.',
  goldName: (n) => `${n} Gold Pieces`,
  granted: 'Your share of the Burning Court\'s spoils is in your pack.',
  rite: 'An ember from the broken rite is in your pack.',
});

/**
 * @param {number} seed
 * @param {number} level
 * @param {{ x?: string, r?: number, p?: number }|null} [claims]
 */
export function spoilsList(seed, level, claims = null) {
  const look = seededRng((seed ^ 0x5eed) >>> 0);
  const flat = () => RANDOM_TREASURE_ICONS[Math.floor(look() * RANDOM_TREASURE_ICONS.length)];
  if (claims?.x === 'rite') return [{ kind: 'item', item: sigilStone(), tier: SIGIL_TIER, record: flat() }];
  const s = rollSpoils(seed, level, claims?.p ?? 0);
  // The seeded `flat()` draws run in a fixed order, and gilded and portent pieces draw theirs last, so a new draw
  // anywhere but the end changes every later picture.
  const firstPortent = s.pieces.length - (s.portent ?? 0);
  const pieces = s.pieces.map((p, i) => ({ kind: 'item', item: p.item, tier: p.tier, record: p.tier === 'gilded' || i >= firstPortent ? null : flat() }));
  const ember = { kind: 'item', item: s.sigil, tier: SIGIL_TIER, record: flat() };
  const gold = { kind: 'gold', gold: s.gold, tier: 'common', record: flat() };
  const card = s.card ? [{ kind: 'item', item: s.card, tier: 'aetheric', record: flat() }] : [];
  const gems = (s.gems ?? []).map((g) => ({ kind: 'item', item: g, tier: 'common', record: flat() }));
  for (const p of pieces) if (p.record === null) p.record = flat();
  return [
    ...pieces,
    ...card,
    ...gems,
    ember,
    ...(claims?.r === 1 ? [{ ...ember, item: sigilStone() }] : []),
    gold,
  ];
}

// Every spoils pool's grant takes this one Web Lock, so two tabs on one device cannot both grant the same receipt.
export const spoilsLock = (fn) => { const locks = globalThis.navigator?.locks; return locks?.request ? locks.request('wb5.spoils', () => fn()) : Promise.resolve().then(fn); };

export function spoilsStore(storage) {
  const mem = new Map();
  return {
    get(k) {
      if (mem.has(k)) return mem.get(k);
      try { const v = storage?.getItem?.(k); return v ? JSON.parse(v) : null; } catch { return null; }
    },
    set(k, v) {
      try { if (!storage?.setItem) throw new Error('no storage'); storage.setItem(k, JSON.stringify(v)); mem.delete(k); }
      catch { mem.set(k, JSON.parse(JSON.stringify(v ?? null))); }
    },
    hold(k, v) { mem.set(k, JSON.parse(JSON.stringify(v ?? null))); },
    persisted: (k) => !mem.has(k),
    remove(k) { mem.delete(k); try { storage?.removeItem?.(k); } catch { } },
  };
}
const NONE = Object.freeze([]);
export const SPOILS_RECORD_V = 2;
export const spoilsLevel = (playerLevel, claimLevel) => Math.max(1, Math.min(Math.max(1, playerLevel | 0), Number.isSafeInteger(claimLevel) && claimLevel >= 1 ? claimLevel : Infinity));
export const SPOILS_RECORDS_MAX = 8;
export const SPOILS_SPENT_MAX = 32;
export const SPOILS_SPENT_RESEND_MS = 5000;
export const spentKey = (day, acct) => `${day}:${acct ?? ''}`;
export const LOST_RETRY_MS = 30_000;
export const LOST_RETRY_MAX_MS = 30 * 60_000;
export const LOST_FIRST_MS = 20_000;
export const LOST_TEXT = Object.freeze({
  mailed: () => t('spoils.lost.mailed', 'Loot you left on the floor will be sent to your mailbox, next to the hourglass in the pause menu.'),
  back: () => t('spoils.lost.back', 'Loot you left on the floor could not be sent to your mailbox, so it was placed in your pack.'),
});
export const mailOf = (r) => (Array.isArray(r?.mail) ? r.mail.filter((m) => m && Number.isSafeInteger(m.i) && m.piece?.kind === 'item') : []);
// Older builds stored a single record object instead of a list.
const recordsOf = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);

export const savedSince = (saves, who, at) => who != null && [...(saves ?? [])].some((i) => i?.characterId === who && (i.dateAndTime?.realTime ?? 0) > at);

function keptPiece(p) {
  if (p?.kind === 'gold') return Number.isSafeInteger(p.gold) && p.gold > 0 ? { ...p } : null;
  const item = p?.kind === 'item' ? validLootItem(p.item) : null;
  if (item) nameEmbers([item]);
  return item ? { ...p, item } : null;
}

/**
 * @param {{ get: (k: string) => any, remove: (k: string) => void, set?: (k: string, v: any) => void }} store
 * @param {(piece: any) => void} take
 * @param {{ who?: string|null, saves?: Iterable<any>, onHanded?: ((rec: any) => void)|null, key?: string, inSave?: readonly string[]|null }} [opts]
 */
export function recoverSpoils(store, take, { who = null, saves = [], onHanded = null, key = SPOILS_STORE_KEY, inSave = null } = {}) {
  let v = null;
  try { v = store.get(key); } catch { v = null; }
  if (!v) return 0;
  const infos = [...(saves ?? [])];
  const all = recordsOf(v), left = [];
  let n = 0;
  for (const rec of all) {
    if (!rec || typeof rec !== 'object' || !Array.isArray(rec.pieces) || !Number.isFinite(rec.at)) continue;
    if (rec.who != null && rec.who !== who) { left.push(rec); continue; }
    // Only records older than `SPOILS_RECORD_V` use the save-timestamp rule; current records clear only through the
    // pool's `saved`.
    if (rec.v !== SPOILS_RECORD_V && savedSince(infos, rec.who ?? who, rec.at)) continue;
    if (rec.v === SPOILS_RECORD_V && inSave?.includes(rec.id)) { left.push(rec); onHanded?.(rec); continue; }
    for (const p of rec.pieces) { const q = keptPiece(p); if (q) { take(q); n++; } }
    left.push(rec);
    if (rec.v === SPOILS_RECORD_V) onHanded?.(rec);
  }
  if (left.length !== all.length || !Array.isArray(v)) {
    try { if (left.length) store.set?.(key, left); else store.remove(key); } catch { }
  }
  return n;
}

/** @param {{ renderer?: any, gl?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, audio?: any, ray: (from: number[], dir: number[], len: number) => ({dist: number, normal?: number[]}|null), now: () => number, take: (piece: any) => void, say?: (text: string) => void, store?: { get: (k: string) => any, set: (k: string, v: any) => void, remove: (k: string) => void, hold?: (k: string, v: any) => void, persisted?: (k: string) => boolean }|null, who?: () => string|null, wall?: () => number, iconOf?: ((item: any) => Promise<{key: string, width: number, height: number, colors: ArrayLike<number>}|null>)|null, onSpent?: (day: number|string) => (boolean|void), keys?: { store: string, day: string }, recordsMax?: number, itemName?: ((item: any) => string)|null, me?: () => (string|null), gathered?: string, mail?: { ready: () => boolean, send: (o: { day: any, pieces: Array<{ i: number, item: any }> }) => Promise<'ok'|'refused'|'later'>, sent?: () => void, say?: (text: string) => void } | null, later?: (fn: () => void, ms: number) => any, }} deps */
export function createSpoilsPool({
  renderer = null, gl = null, getTexture = null, uploadRecordFrame = null, audio = null,
  ray, now, take, say = () => {}, store = null, who = () => null, wall = () => Date.now(), iconOf = null, gathered = SPOILS_TEXT.gathered,
  onSpent = () => {}, keys = SPOILS_KEYS, recordsMax = SPOILS_RECORDS_MAX, itemName = (item) => item?.name ?? 'Something',
  me = () => null, mail = null, later = (fn, ms) => globalThis.setTimeout?.(fn, ms),
}) {
  const STORE_KEY = keys.store, DAY_KEY = keys.day;
  let glow = null;
  try { if (gl) glow = new SpoilsGlowRenderer(gl); } catch (e) { console.warn('[gate] the spoils\' glow would not build', e?.message ?? e); glow = null; }
  let rec = null, t0 = 0, from = null, launches = [];
  // The collider ignores hits nearer than 0.1 mm, so a step starting just above the floor can miss it; the
  // floor plane from `keep` backs up the world ray.
  let flyRay = ray;
  /** @type {Array<{ piece: any, fly: any, left: boolean, restAt: number, taken: boolean, batch: any, sprite: any, batchIcon: boolean, h: number, target: any }>} */
  let floor = [];
  let lastT = 0, tex = null, texLoading = null;
  const _targets = [];

  const keep = (k, v) => { try { store?.set(k, v); } catch { } };
  const read = (k) => { try { return store?.get(k) ?? null; } catch { return null; } };
  const held = new Map();
  const ackOnSave = new Map();
  let spewId = null;
  const OWED_KEY = `${DAY_KEY}.owed`;
  const owedWords = () => { const v = read(OWED_KEY); return Array.isArray(v) ? v.filter((o) => o && typeof o === 'object' && o.d != null) : []; };
  const meNow = () => { try { return me() ?? null; } catch { return null; } };
  const mine = (acct) => { const m = meNow(); return !acct || m == null || m === acct; };
  const said = (day, acct = '') => {
    let went = false;
    if (mine(acct)) { try { went = onSpent(day) !== false; } catch { went = false; } }
    if (!went) { const o = owedWords(); if (!o.some((w) => w.d === day && w.a === acct)) keep(OWED_KEY, [...o, { d: day, a: acct }].slice(-SPOILS_SPENT_MAX)); }
  };
  const spentHere = new Set();
  function spentOn(day, acct) {
    if (spentHere.has(spentKey(day, acct))) return true;
    const kept = read(DAY_KEY);
    return kept === day || (Array.isArray(kept) && (kept.includes(spentKey(day, acct)) || kept.includes(spentKey(day, '*'))));
  }
  // Only this account's own mark is reported to the hub. An older build's wildcard mark blocks the spoils locally
  // but is never sent, or the hub would drop another account's receipt.
  function spentBy(day, acct) {
    if (spentHere.has(spentKey(day, acct))) return true;
    const kept = read(DAY_KEY);
    return Array.isArray(kept) && kept.includes(spentKey(day, acct));
  }
  function trimRecords(list) {
    let over = list.filter((r) => !mailOf(r).length).length - recordsMax;
    return over <= 0 ? list : list.filter((r) => mailOf(r).length > 0 || over-- <= 0);
  }
  function rewrite(id, fn) {
    const all = recordsOf(read(STORE_KEY));
    let was = null;
    const out = [];
    for (const r of all) {
      if (r?.id !== id || was) { out.push(r); continue; }
      was = r;
      const next = fn(r);
      if (next) out.push(next);
    }
    if (!was) return null;
    if (out.length) keep(STORE_KEY, out); else { try { store?.remove(STORE_KEY); } catch { } }
    return was;
  }
  // The record is written before the spent mark, and the mark is persisted only when the record is, so a crash
  // never leaves a spent receipt with no saved pieces.
  function spend(day, acct, list, owner = who()) {
    spentHere.add(spentKey(day, acct));
    const w = owner, at = wall();
    const id = `${day}:${w ?? ''}:${at}`;
    const recs = recordsOf(read(STORE_KEY)).filter((r) => r && !(r.day === day && r.who === w));
    keep(STORE_KEY, trimRecords([...recs, { v: SPOILS_RECORD_V, id, day, at, who: w, pieces: list }]));
    const durable = store?.persisted?.(STORE_KEY) ?? true;
    const kept = read(DAY_KEY);
    const marks = [...(Array.isArray(kept) ? kept : Number.isSafeInteger(kept) ? [spentKey(kept, '*')] : []), spentKey(day, acct)].slice(-SPOILS_SPENT_MAX);
    if (durable) { keep(DAY_KEY, marks); said(day, acct); }
    else { try { store?.hold?.(DAY_KEY, marks); } catch { } ackOnSave.set(id, { day, acct }); }
    return id;
  }

  function loadTex() {
    if (tex || texLoading || !getTexture) return;
    texLoading = Promise.resolve().then(() => getTexture(RANDOM_TREASURE_ARCHIVE)).then((t) => { tex = t ?? null; }, () => { tex = null; });
  }
  function askSprite(f) {
    if (f.sprite || f.piece.kind !== 'item' || !iconOf || !renderer?.uploadTexture) { f.sprite ??= 'none'; return; }
    f.sprite = 'asked';
    Promise.resolve().then(() => iconOf(f.piece.item)).then((img) => {
      if (!img?.colors || !(img.width > 0) || !(img.height > 0)) { f.sprite = 'none'; return; }
      const record = `icon:${img.key ?? floor.indexOf(f)}`;
      renderer.uploadTexture(SPOILS_ICON_ARCHIVE, record, img);
      f.sprite = { record, ...iconSize(img.width, img.height) };
    }, () => { f.sprite = 'none'; });
  }
  function batchOf(f) {
    const icon = f.sprite && typeof f.sprite === 'object';
    if (f.batch && !icon === !f.batchIcon) return f.batch;
    if (f.batch) { renderer?.destroyBillboardBatch?.(f.batch); f.batch = null; }
    if (!renderer?.createBillboardBatch) return null;
    try {
      if (icon) {
        f.batch = renderer.createBillboardBatch(SPOILS_ICON_ARCHIVE, f.sprite.record, { w: f.sprite.w, h: f.sprite.h }, [[0, 0, 0]]);
        f.h = f.sprite.h;
      } else {
        if (!tex) return null;
        if (!renderer.textures?.has?.(`${RANDOM_TREASURE_ARCHIVE}_${f.piece.record}#0`)) uploadRecordFrame?.(RANDOM_TREASURE_ARCHIVE, f.piece.record, 0);
        const size = billboardSize(tex, f.piece.record);
        f.batch = renderer.createBillboardBatch(RANDOM_TREASURE_ARCHIVE, f.piece.record, size, [[0, 0, 0]]);
        f.batch.frame = 0;
        f.h = size.h;
      }
      f.batchIcon = icon;
      f.batch.origin = [...f.fly.pos];
    } catch { f.batch = null; }
    return f.batch;
  }
  function takeOne(f) {
    if (f.taken) return;
    f.taken = true;
    take(f.piece);
    const name = (/** @type {any} */ item) => (isIliacCard(item) ? iliacCardName(item) : item.name);
    say(f.piece.kind === 'gold' ? SPOILS_TEXT.gold(f.piece.gold) : SPOILS_TEXT.item(name(f.piece.item), f.piece.tier));
    if (f.batch) { renderer?.destroyBillboardBatch?.(f.batch); f.batch = null; }
    if (spewId && floor.every((g) => g.taken)) { held.set(spewId, { who: who(), day: rec?.day }); spewId = null; }
  }

  const sending = new Set();
  let retryTimer = null, idleRounds = 0;
  const sayMail = (/** @type {string} */ text) => { try { (mail?.say ?? say)(text); } catch { } };
  const retryMail = (ms = LOST_RETRY_MS) => {
    if (!mail || retryTimer) return;
    try { retryTimer = later(() => { retryTimer = null; sendMail().catch(() => {}); }, ms) ?? null; } catch { retryTimer = null; }
  };
  function owedToMail(left) {
    const items = left.filter((f) => f.piece.kind === 'item');
    if (!mail || !spewId || !rec || !items.length) return [];
    let ready = false;
    try { ready = mail.ready() && mine(rec.acct); } catch { ready = false; }
    // Only a record persisted on the device can owe the mailbox. A memory-only record dies with the tab and its
    // receipt is granted again, so its items go to the pack.
    if (!ready || store?.persisted?.(STORE_KEY) === false) return [];
    const at = new Map(items.map((f) => [floor.indexOf(f), f]));
    const acct = rec.acct ?? '';
    const kept = rewrite(spewId, (r) => ({ ...r, acct, pieces: (r.pieces ?? []).filter((/** @type {any} */ _p, /** @type {number} */ i) => !at.has(i)), mail: [...mailOf(r), ...[...at].map(([i, f]) => ({ i, piece: f.piece }))], mailAt: wall() }));
    if (!kept) return [];
    for (const f of items) { f.taken = true; if (f.batch) { renderer?.destroyBillboardBatch?.(f.batch); f.batch = null; } }
    return items;
  }
  function mailLanded(id, sent) {
    const gone = new Set(sent.map((/** @type {any} */ x) => x.i));
    rewrite(id, (r) => {
      const owed = mailOf(r).filter((x) => !gone.has(x.i));
      if (owed.length) return { ...r, mail: owed };
      const { mail: _mail, mailAt: _at, ...rest } = r;
      return rest.pieces?.length ? rest : null;
    });
    try { mail?.sent?.(); } catch { }
  }
  // The record is rewritten before the pack takes the pieces, so a crash in between hands them back from the record
  // at the next boot.
  function mailBack(id) {
    const r0 = recordsOf(read(STORE_KEY)).find((r) => r?.id === id);
    if (!r0 || (r0.who != null && r0.who !== who())) return false;
    const back = mailOf(r0);
    rewrite(id, (r) => { const { mail: _mail, mailAt: _at, ...rest } = r; return { ...rest, pieces: [...(rest.pieces ?? []), ...back.map((x) => x.piece)] }; });
    for (const x of back) { const q = keptPiece(x.piece); if (q) take(q); }
    held.set(id, { who: who(), day: r0.day });
    sayMail(LOST_TEXT.back());
    return true;
  }
  async function sendMail() {
    if (!mail) return 0;
    let owing = 0, landed = 0;
    for (const r of recordsOf(read(STORE_KEY))) {
      const owed = mailOf(r);
      if (!owed.length) continue;
      if (sending.has(r.id)) { owing++; continue; }
      const late = !(wall() - (Number(r.mailAt) || 0) < LOST_OWED_MAX_MS);
      /** @type {'ok'|'refused'|'later'} */
      let word = 'refused';
      if (!late) {
        if (!mine(r.acct)) { owing++; continue; }
        sending.add(r.id);
        try { word = await mail.send({ day: r.day, pieces: owed.map((x) => ({ i: x.i, item: x.piece.item })) }); } catch { word = 'later'; } finally { sending.delete(r.id); }
      }
      if (word === 'ok') { mailLanded(r.id, owed); landed++; continue; }
      if (word === 'refused' && mailBack(r.id)) continue;
      owing++;
    }
    if (landed) idleRounds = 0; else if (owing) idleRounds++;
    if (owing) retryMail(Math.min(LOST_RETRY_MAX_MS, LOST_RETRY_MS * 2 ** Math.max(0, idleRounds - 1)));
    return owing;
  }
  function gatherFloor() {
    const left = floor.filter((f) => !f.taken);
    const mailed = owedToMail(left);
    floor.forEach((f) => takeOne(f));
    if (spewId) { held.set(spewId, { who: who(), day: rec?.day }); spewId = null; }
    rec = null; floor = []; launches = [];
    if (left.length > mailed.length) say(gathered);
    if (mailed.length) { sayMail(LOST_TEXT.mailed()); sendMail().catch(() => {}); }
    return left.length;
  }
  if (mail) retryMail(LOST_FIRST_MS);

  function pieceAt(key) {
    if (typeof key !== 'string' || !floor.length) return null;
    const gold = key.startsWith(SPOIL_GOLD_KEY);
    if (!gold && !key.startsWith(SPOIL_KEY)) return null;
    const i = Number(key.slice(gold ? SPOIL_GOLD_KEY.length : SPOIL_KEY.length));
    const f = Number.isInteger(i) ? floor[i] : null;
    if (!f || f.taken || !f.fly.rest || (f.piece.kind === 'gold') !== gold) return null;
    return f;
  }

  return {
    take(piece) { take(piece); },
    resendSpent() {
      const list = owedWords();
      if (!list.length) return 0;
      const left = list.filter((w) => { if (!mine(w.a)) return true; try { return onSpent(w.d) === false; } catch { return true; } });
      if (left.length !== list.length) { if (left.length) keep(OWED_KEY, left); else { try { store?.remove(OWED_KEY); } catch { } } }
      return left.length;
    },
    spew({ day, seed, level, at, bearing, acct = '', keep = null, claims = null, roll = null }) {
      if (spentOn(day, acct)) { if (spentBy(day, acct)) said(day, acct); return false; }
      // A new burst gathers any floor not yet left first, or those leftovers would end up in no pack and on no
      // floor.
      if (rec) gatherFloor();
      rec = { day, acct };
      t0 = now(); lastT = t0; from = [...at];
      const list = typeof roll === 'function' ? roll() : spoilsList(seed >>> 0, Math.max(1, level | 0), claims);
      launches = spewLaunches(seededRng(((seed >>> 0) ^ 0x5a5a) >>> 0), list.length, bearing);
      if (keep) launches = launches.map((l) => keepLaunch(from, l, keep));
      const plane = keep && Number.isFinite(keep.floorY) ? floorRayAt(keep.floorY) : null;
      flyRay = plane ? (a, d, l) => ray?.(a, d, l) ?? plane(a, d, l) : ray;
      floor = list.map((piece, i) => ({ piece, fly: spewPiece(from, launches[i]), left: false, restAt: 0, taken: false, batch: null, sprite: null, batchIcon: false, h: 0, target: null }));
      spewId = spend(day, acct, list);
      loadTex();
      for (const f of floor) askSprite(f);
      return true;
    },
    /** @param {{ day: any, seed?: number, level?: number, acct?: string, roll?: (() => any[]) | null, text?: string, owner?: any, kept?: string | null, claims?: any }} o */
    grant({ day, seed, level, acct = '', roll = null, text = SPOILS_TEXT.granted, owner = undefined, kept = null, claims = null }) {
      if (spentOn(day, acct)) { if (spentBy(day, acct)) said(day, acct); return false; }
      const list = typeof roll === 'function' ? roll() : spoilsList(seed >>> 0, Math.max(1, level | 0), claims);
      if (owner !== undefined && owner !== who()) { spend(day, acct, list, owner); if (kept) say(kept); return true; }
      const id = spend(day, acct, list);
      for (const piece of list) take(piece);
      held.set(id, { who: who(), day });
      say(text);
      return true;
    },
    loaded(whoLoaded) {
      let n = 0;
      for (const [id, h] of held) if (h.who === whoLoaded) { held.delete(id); n++; }
      return n;
    },
    adopt(recOrId) { const r = typeof recOrId === 'string' ? { id: recOrId } : recOrId; if (r?.id) held.set(r.id, { who: r.who ?? who(), day: r.day }); },
    // A realm checkpoint lands after it is composed, so it passes these ids to `saved` to clear only the records it
    // actually holds.
    heldIds(whoSaved) { return [...held].filter(([, h]) => h.who === whoSaved).map(([id]) => id); },
    saved(whoSaved, only = null) {
      if (whoSaved == null || !held.size) return 0;
      const ids = new Set([...held].filter(([id, h]) => h.who === whoSaved && (!only || only.includes(id))).map(([id]) => id));
      if (!ids.size) return 0;
      const all = recordsOf(read(STORE_KEY));
      const left = all.flatMap((r) => (!(r && ids.has(r.id)) ? [r] : mailOf(r).length ? [{ ...r, pieces: [] }] : []));
      const cleared = all.filter((r) => r && ids.has(r.id)).length;
      if (cleared) { if (left.length) keep(STORE_KEY, left); else { try { store?.remove(STORE_KEY); } catch { } } }
      for (const id of ids) {
        held.delete(id);
        const a = ackOnSave.get(id);
        if (a) {
          ackOnSave.delete(id);
          const kept = read(DAY_KEY);
          keep(DAY_KEY, [...(Array.isArray(kept) ? kept : []), spentKey(a.day, a.acct)].filter((v, i, xs) => xs.indexOf(v) === i).slice(-SPOILS_SPENT_MAX));
          said(a.day, a.acct);
        }
      }
      return cleared;
    },
    frame(onRest = null) {
      if (!rec) return;
      const t = now(), dt = Math.max(0, Math.min(0.1, (t - lastT) / 1000));
      lastT = t;
      loadTex();
      floor.forEach((f, i) => {
        if (f.taken) return;
        if (!f.left) { if (t - t0 < launches[i].at) return; f.left = true; }
        if (!f.fly.rest) {
          const what = flySpew(f.fly, dt, flyRay);
          if (what === 'bounce' || what === 'rest') audio?.play3d?.(CLIPS.drop, [...f.fly.pos], 1, { maxDistance: 24 });
          if (f.fly.rest) {
            f.restAt = t;
            if ((RARITIES[f.piece.tier]?.rank ?? 0) >= RARITIES.rare.rank) audio?.play3d?.(SOUND.MakeItem, [...f.fly.pos], 1, { maxDistance: 30 });
            try { onRest?.(f.fly.pos, f.piece.tier, f.piece.kind); } catch { }
          }
        }
        const b = batchOf(f);
        if (b) { b.origin[0] = f.fly.pos[0]; b.origin[1] = f.fly.pos[1]; b.origin[2] = f.fly.pos[2]; }
      });
    },
    targets() {
      if (!floor.length) return NONE;
      _targets.length = 0;
      floor.forEach((f, i) => {
        if (f.taken || !f.left || !f.fly.rest) return;
        if (!f.target) {
          const [x, y, z] = f.fly.pos, h = Math.max(SPOIL_BOX_MIN_H, f.h || 0);
          f.target = { key: `${f.piece.kind === 'gold' ? SPOIL_GOLD_KEY : SPOIL_KEY}${i}`, aabb: { min: [x - SPOIL_BOX_HALF_M, y, z - SPOIL_BOX_HALF_M], max: [x + SPOIL_BOX_HALF_M, y + h, z + SPOIL_BOX_HALF_M] }, distance: RAY_DISTANCE, reach: TREASURE_ACTIVATION_DISTANCE };
        } else if (f.h > 0) f.target.aabb.max[1] = f.target.aabb.min[1] + Math.max(SPOIL_BOX_MIN_H, f.h);
        _targets.push(f.target);
      });
      return _targets;
    },
    nameOf(key) {
      const f = pieceAt(key);
      if (!f) return null;
      if (f.piece.kind === 'gold') return { title: SPOILS_TEXT.goldName(f.piece.gold) };
      const label = f.piece.tier && f.piece.tier !== 'common' ? RARITIES[f.piece.tier]?.label : null;
      return { title: itemName(f.piece.item), subs: label ? [label] : [] };
    },
    contentsOf(key) { const f = pieceAt(key); return f && f.piece.kind === 'item' ? [f.piece.item] : null; },
    pick(key) { const f = pieceAt(key); if (!f) return false; takeOne(f); return true; },
    batches: () => (floor.length ? floor.filter((f) => f.batch && !f.taken && f.left).map((f) => f.batch) : NONE),
    lights() {
      if (!floor.length) return NONE;
      const out = [];
      for (const f of floor) {
        if (f.taken || !f.fly.rest || (RARITIES[f.piece.tier]?.rank ?? 0) < RARITIES.rare.rank) continue;
        const c = tierColour(f.piece.tier), k = SPOILS_LIGHT.k * Math.min(1, (now() - f.restAt) / SPOILS_RISE_MS);
        out.push(adoptLight({ x: f.fly.pos[0], y: f.fly.pos[1] + SPOILS_LIGHT.up, z: f.fly.pos[2], range: SPOILS_LIGHT.range, color: c.map((v) => v * k) }, f));
      }
      return out;
    },
    drawPass(proj, view, eye, seconds, fog = null) {
      if (!glow || !floor.length) return false;
      const t = now();
      const lines = floor.filter((f) => !f.taken && f.fly.rest).map((f) => ({ root: [f.fly.pos[0], f.fly.pos[1] + f.h, f.fly.pos[2]], tier: f.piece.tier, alpha: Math.min(1, (t - f.restAt) / SPOILS_RISE_MS) }));
      glow.draw(lines, proj, view, eye, seconds, fog);
      return glow.drawn > 0;
    },
    gather: gatherFloor,
    mailOwed: () => sendMail(),
    state: () => ({ day: rec?.day ?? null, pieces: floor.map((f) => ({ kind: f.piece.kind, tier: f.piece.tier, left: f.left, rest: f.fly.rest, taken: f.taken, pos: [...f.fly.pos], icon: !!f.batchIcon, h: f.h })) }),
  };
}
