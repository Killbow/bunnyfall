// @ts-check
import { accountFestival, equipTitle, equipAura, equipIcon, adoptIdentity, storedSession, serviceBase, readAccount, accountRefusalText } from '../../net/accountClient.js';
import { appStorage } from '../../platform/appStorage.js';
import { registerPlayerKillListener } from '../../player/playerKills.js';
import { hearActs, ACT_KINDS } from '../questlines/qlActs.js';
import { registerModSaveData } from '../../saves/modSaveData.js';
import { KNIGHT_CITY_WATCH } from '../../characters/mobileTypes.js';
import { festivalOpen, isFindSource, wareById, accountWare, bowlWare, festivalWaresHeld, SALE_RID_RE, FIND_CAKES_PER_DAY } from '../../net/festivalLaw.js';
import { utcDay } from '../../net/marksLaw.js';
import { restackSoulCakes, restackHearthOfferings, isHearthOffering } from './soulCake.js';
import { foeFindSource } from './festivalFoes.js';
import { cakesFoundText, festivalRefusalText, isFestivalRefusal, findsFullText } from './festivalWords.js';
import { wyrdPieceById } from '../../items/aetheric.js';
import { mintIliacCard } from '../../cards/iliacItems.js';
import { addItem } from '../../items/inventory.js';

export const FESTIVAL_FIND = 'festival-find';

const NO_DOORS = Object.freeze({ online: () => false, entity: () => null, say: (/** @type {string} */ _l) => {}, selfId: () => null, saved: () => {}, room: () => null, nowMs: () => Date.now() });
/** @type {any} */
let _doors = NO_DOORS;
/** @type {any} */
let _api = null;
/** @typedef {{ cakes: number|null, bowls: number|null, wares: string[], given: number|null, taken: number|null, offerings: any[], open: boolean|null, today: number|null, todayDay: number|null, fullDay: number|null }} FestivalState */
const UNHEARD = Object.freeze({ cakes: null, bowls: null, wares: [], given: null, taken: null, offerings: [], open: null, today: null, todayDay: null, fullDay: null });
let _state = /** @type {FestivalState} */ (UNHEARD), _stateOf = /** @type {string|null} */ (null);
const _hear = new Set();
let _version = 0;
const changed = () => { _version++; for (const fn of _hear) { try { fn(); } catch { } } };

export function bindFestival(doors = null) {
  _doors = doors ? { ...NO_DOORS, ...doors } : NO_DOORS;
  _api = doors ? (doors.api ?? accountFestival({ fetch: (/** @type {any} */ u, /** @type {any} */ i) => globalThis.fetch(u, i), storage: appStorage() })) : null;
  if (doors) refreshFestival().catch(() => {});
  return _api;
}
export const festivalDoors = () => _doors;
export function hearFestival(/** @type {() => void} */ fn) { _hear.add(fn); return () => { _hear.delete(fn); }; }
export const festivalVersion = () => _version;
export const festivalState = () => (_stateOf === festivalAccount() ? _state : UNHEARD);
// Finds, sales, and offerings follow the shared relay clock from the host (`nowMs`); only the decorations use the
// device clock.
export const festivalNowMs = () => _doors.nowMs();
export function festivalShut() {
  if (!_api || !_doors.online()) return 'offline';
  const s = storedSession(appStorage());
  if (!s || s.kind === 'guest') return 'guest';
  if (!festivalOpen(festivalNowMs()) || festivalState().open === false) return 'closed';
  return null;
}
export const festivalAccount = () => _api?.me?.() ?? storedSession(appStorage())?.id ?? null;
export const festivalLive = () => festivalShut() == null;
const refusalText = (/** @type {unknown} */ code) => (isFestivalRefusal(code) || typeof code !== 'string' ? festivalRefusalText(code) : accountRefusalText(code));

function learn(/** @type {any} */ d) {
  if (!d || typeof d !== 'object') return;
  const who = festivalAccount();
  if (who !== _stateOf) { _state = UNHEARD; _stateOf = who; }
  let moved = false;
  const items = _doors.entity()?.items;
  if (Number.isSafeInteger(d.cakes) && d.cakes >= 0) {
    _state = { ..._state, cakes: d.cakes };
    if (Array.isArray(items) && restackSoulCakes(items, d.cakes)) _doors.saved();
    moved = true;
  }
  if (Number.isSafeInteger(d.bowls) && d.bowls >= 0) {
    _state = { ..._state, bowls: d.bowls };
    if (Array.isArray(items) && restackHearthOfferings(items, d.bowls)) _doors.saved();
    moved = true;
  }
  if (Array.isArray(d.wares)) { _state = { ..._state, wares: festivalWaresHeld(d.wares.join(' ')) }; moved = true; }
  for (const k of ['given', 'taken']) if (Number.isSafeInteger(d[k])) { _state = { ..._state, [k]: d[k] }; moved = true; }
  if (Array.isArray(d.offerings)) { _state = { ..._state, offerings: d.offerings }; moved = true; }
  if (typeof d.open === 'boolean') { _state = { ..._state, open: d.open }; moved = true; }
  if (Number.isSafeInteger(d.today) && d.today >= 0) { _state = { ..._state, today: d.today, todayDay: findDay() }; moved = true; }
  if (d.capped === true || d.error === 'capped') { _state = { ..._state, fullDay: findDay() }; moved = true; }
  if (moved) changed();
}

const findDay = () => utcDay(festivalNowMs() / 1000);
export function festivalFindsToday() {
  const s = festivalState(), day = findDay();
  const found = s.today == null ? null : s.todayDay === day ? s.today : 0;
  return { found, max: FIND_CAKES_PER_DAY, full: s.fullDay === day || (found ?? 0) >= FIND_CAKES_PER_DAY, resetMs: (day + 1) * 86_400_000 };
}
let _fullSaid = /** @type {string|null} */ (null);
function sayDayFull() {
  const today = festivalFindsToday();
  if (!today.full) return;
  const key = `${festivalAccount()}:${findDay()}`;
  if (_fullSaid === key) return;
  _fullSaid = key;
  _doors.say(findsFullText(today.max, today.resetMs));
}

export async function refreshFestival() {
  if (!_api || !_doors.online()) return false;
  const r = await _api.mine().catch(() => null);
  if (!r?.ok) return false;
  learn(r.data);
  await resumeSale();
  return true;
}

let _chain = Promise.resolve();
/** @type {WeakSet<object>} */
const _asked = new WeakSet();
const neverPays = (/** @type {any} */ e) => e?.mobileType === KNIGHT_CITY_WATCH || e?.team === 'PlayerAlly' || e?.mobileTeam === 'PlayerAlly';
/** @param {string} source */
export function askFind(source) {
  if (!isFindSource(source) || !festivalLive()) return Promise.resolve(0);
  const run = async () => {
    if (festivalFindsToday().full) { sayDayFull(); return 0; }
    const r = await _api.find(source).catch(() => null);
    const d = r?.ok ? r.data : r;
    const found = r?.ok && Number.isSafeInteger(d?.found) ? d.found : 0;
    learn(d);
    if (found > 0) _doors.say(cakesFoundText(found));
    sayDayFull();
    return found;
  };
  const p = _chain.then(run, run);
  _chain = p.catch(() => 0);
  return p;
}
export function festivalQuestEnded(/** @type {any} */ q) { if (q?.questSuccess) askFind('world'); }
export const festivalBountyPaid = () => askFind('world');

registerPlayerKillListener(FESTIVAL_FIND, (/** @type {any} */ entity) => {
  if (!entity || typeof entity !== 'object' || neverPays(entity) || _asked.has(entity)) return;
  const source = foeFindSource(entity);
  if (!source) return;
  _asked.add(entity);
  askFind(source);
});
const ACT_NOT_FOUND = Object.freeze(['elite-foe-slain', 'wyrd-met']);
let _actTurn = /** @type {Set<string>|null} */ (null);
hearActs(FESTIVAL_FIND, (/** @type {string} */ kind) => {
  const g = ACT_KINDS[/** @type {keyof typeof ACT_KINDS} */ (kind)];
  if (!g || ACT_NOT_FOUND.includes(kind)) return;
  if (!_actTurn) { _actTurn = new Set(); Promise.resolve().then(() => { _actTurn = null; }); }
  if (_actTurn.has(g)) return;
  _actTurn.add(g);
  askFind(g);
});

let _pending = /** @type {{ rid: string, ware: string, account: string } | null} */ (null);
let _asking = /** @type {{ sale: object, p: Promise<any> } | null} */ (null);
export const FESTIVAL_SAVE_VENDOR = 'WitchesFestival';
// Only these refusals mean the server never made the sale; any other result keeps the pending sale to ask again
// with the same id.
export const SALE_FINAL = Object.freeze(['ware', 'rid', 'owned', 'cakes', 'closed', 'rate']);
const validPending = (/** @type {any} */ r) => (r && typeof r.rid === 'string' && SALE_RID_RE.test(r.rid) && wareById(r.ware) && typeof r.account === 'string' && r.account
  ? { rid: r.rid, ware: r.ware, account: r.account } : null);
registerModSaveData(FESTIVAL_SAVE_VENDOR, {
  newSaveData: () => ({ pending: null }),
  getSaveData: () => ({ pending: _pending ? { ..._pending } : null }),
  restoreSaveData: (/** @type {any} */ r) => { _pending = validPending(r?.pending); _asking = null; },
});
export const pendingSale = () => _pending;
export function saleRid(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 12; i++) s += Math.floor(rand() * 16).toString(16);
  return s;
}
export function wareItem(/** @type {any} */ w) {
  if (!w || accountWare(w) || bowlWare(w)) return null;
  if (w.kind === 'piece') { const it = wyrdPieceById(w.key); if (it) it.bound = true; return it; }
  if (w.kind === 'card') return mintIliacCard(w.key);
  return null;
}
// Mints the ware only while this sale is still `_pending`, so a repeated answer for the same id never mints twice.
function landSale(/** @type {object} */ sale, /** @type {any} */ d) {
  if (_pending !== sale) { learn(d); return wareById(d?.ware); }
  _pending = null;
  const w = wareById(d?.ware);
  const items = _doors.entity()?.items;
  const item = wareItem(w);
  if (item && Array.isArray(items)) addItem(items, item);
  learn(d);
  _doors.saved();
  return w;
}
function askSale(/** @type {{ rid: string, ware: string, account: string }} */ sale) {
  if (_asking?.sale === sale) return _asking.p;
  const p = (async () => {
    const r = await _api.buy(sale.ware, sale.rid).catch(() => null);
    if (r?.ok) landSale(sale, r.data);
    else if (r && SALE_FINAL.includes(r.error)) {
      if (_pending === sale) { _pending = null; _doors.saved(); }
      learn(r);
    }
    return r;
  })();
  const asking = { sale, p };
  _asking = asking;
  p.finally(() => { if (_asking === asking) _asking = null; }).catch(() => {});
  return p;
}
/** @param {string} wareId */
export async function buyWare(wareId) {
  const w = wareById(wareId);
  if (!w) return { ok: false, text: festivalRefusalText('ware') };
  const shut = festivalShut();
  if (shut) return { ok: false, text: festivalRefusalText(shut) };
  if (_pending) await resumeSale();
  if (_pending) return { ok: false, text: festivalRefusalText('offline') };
  const sale = { rid: saleRid(), ware: w.id, account: _api.me() ?? '' };
  _pending = sale;
  _doors.saved();
  const r = await askSale(sale);
  if (r?.ok) return { ok: true, text: '' };
  return { ok: false, text: !r || !SALE_FINAL.includes(r.error) ? festivalRefusalText('offline') : refusalText(r.error) };
}
async function resumeSale() {
  if (!_pending || !_api || _pending.account !== _api.me()) return;
  await askSale(_pending);
}

let _wardrobe = /** @type {{ title: string|null, aura: string|null, icon: string|null, titles: string[], auras: string[], icons: string[] } | null} */ (null);
export const festivalWardrobe = () => _wardrobe;
const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
function adoptWardrobe(/** @type {any} */ w) {
  if (!w || typeof w !== 'object') return;
  _wardrobe = { title: w.title ?? null, aura: w.aura ?? null, icon: w.icon ?? null, titles: list(w.titles), auras: list(w.auras), icons: list(w.icons) };
  changed();
}
function accountIo() {
  const storage = appStorage(), s = storedSession(storage);
  return s ? { fetch: (/** @type {any} */ u, /** @type {any} */ i) => globalThis.fetch(u, i), base: serviceBase(storage), secret: s.secret, storage } : null;
}
export async function loadWardrobe() {
  const io = accountIo();
  const r = io ? await readAccount(io).catch(() => null) : null;
  if (!r?.ok) return false;
  adoptWardrobe(r.data?.wardrobe);
  return true;
}
/**
 * @param {'title'|'aura'|'icon'} kind
 * @param {string} key
 */
export async function wearAccount(kind, key, on = true) {
  const io = accountIo();
  if (!io) return { ok: false, text: festivalRefusalText('offline') };
  const want = on ? key : null;
  const r = await (kind === 'title' ? equipTitle(io, want) : kind === 'aura' ? equipAura(io, want) : equipIcon(io, want)).catch(() => null);
  if (!r?.ok) return { ok: false, text: r?.error === 'not-held' ? festivalRefusalText('held') : refusalText(r?.error ?? 'offline') };
  adoptWardrobe(r.data);
  const w = _wardrobe;
  adoptIdentity(io.storage, { glyphs: r.data?.glyphs, glyphsOff: r.data?.glyphsOff, aura: w?.aura ?? null, icon: w?.icon ?? null, secret: io.secret });
  const room = _doors.room();
  room?.adoptIdentity?.({ title: w?.title ?? null, ts: (w?.title ?? null) === (room.title ?? null) ? room.ts : null, glyphs: room.glyphs, level: room.lv, aura: w?.aura ?? null, icon: w?.icon ?? null });
  return { ok: true, text: '' };
}
export async function wearWare(/** @type {string} */ wareId, on = true) {
  const w = wareById(wareId);
  if (!w || !accountWare(w)) return { ok: false, text: festivalRefusalText('ware') };
  return wearAccount(/** @type {'title'|'aura'|'icon'} */ (w.kind), w.key, on);
}

export async function offeringMove(/** @type {'set'|'fill'|'takeIn'|'take'} */ move, /** @type {any} */ at) {
  if (!_api || !_doors.online()) return { ok: false, data: null, text: festivalRefusalText('offline'), error: 'offline' };
  const shut = move === 'takeIn' ? null : festivalShut();
  if (shut) return { ok: false, data: null, text: festivalRefusalText(shut), error: shut };
  const items = _doors.entity()?.items;
  if (move === 'set' && !(Array.isArray(items) && items.some(isHearthOffering))) return { ok: false, data: null, text: festivalRefusalText('item'), error: 'item' };
  const r = await _api[move](at).catch(() => null);
  if (!r?.ok) {
    learn(r);
    const code = move === 'take' && r?.error === 'none' ? 'gone' : r?.error ?? 'offline';
    return { ok: false, data: null, text: refusalText(code), error: code };
  }
  learn(r.data);
  if (move !== 'take') refreshFestival().catch(() => {});
  _doors.saved();
  return { ok: true, data: r.data, text: '' };
}
export async function townOfferings(/** @type {number} */ mapId) {
  if (!_api || !_doors.online()) return null;
  const r = await _api.town(mapId).catch(() => null);
  if (r?.ok && typeof r.data?.open === 'boolean' && r.data.open !== festivalState().open) learn({ open: r.data.open });
  return r?.ok ? r.data : null;
}

export function _resetFestivalClientForTests() {
  _doors = NO_DOORS; _api = null; _pending = null; _asking = null; _wardrobe = null; _chain = Promise.resolve(); _actTurn = null;
  _state = UNHEARD; _stateOf = null; _fullSaid = null;
  _hear.clear(); _version = 0;
}
