// @ts-check
import { validStaffEvent, staffEventKey, staffEventIdOf, isAreaEvent, STAFF_EVENTS_MAX } from '../net/staffEvent/staffEventLaw.js';

/** @typedef {{ staff: import('../net/staffEvent/staffEventLaw.js').StaffEvent, key: string, regionIndex: number, locationIndex: number, locationName: string, px: number, py: number, startMinute: number, endMinute: number, attackAmount: number, type: number, killed: number, struck: boolean, announced: boolean, cleansed: boolean, routed: boolean, bossFc: number, bossUp: 0|1, bossDown: 0|1, bossSaid: number, mine: number, fillS?: number, bossLostAt?: number, handSeen: number, midStood?: number, clearSince?: number, clearWait?: Set<any> }} StaffRaid */

/** @type {Map<string, StaffRaid>} */
let _raids = new Map();
/** @type {Map<string, { n: number, bd: 0|1, bu: 0|1, bk: 0|1, fc: number, md?: number, mu?: number }>} */
let _ledgers = new Map();
/**
 * Ended event ids, so a book that arrives late cannot bring an ended event back.
 * @type {Set<string>}
 */
let _ended = new Set();
const ENDED_KEPT = 32;

/**
 * @param {import('../net/staffEvent/staffEventLaw.js').StaffEvent} e
 * @returns {StaffRaid}
 */
const raidOf = (e) => ({
  staff: e, key: staffEventKey(e.id), regionIndex: e.rg, locationIndex: e.loc, locationName: e.nm, px: e.px, py: e.py,
  startMinute: -Infinity, endMinute: Infinity, attackAmount: e.n, type: 9, killed: 0, struck: false, announced: false,
  cleansed: false, routed: false, bossFc: -1, bossUp: 0, bossDown: 0, bossSaid: -1, mine: 0, fillS: undefined, handSeen: e.fb,
});

const endOne = (/** @type {string} */ id) => {
  const r = _raids.get(id);
  if (r) r.cleansed = true;
  _ended.add(id);
  while (_ended.size > ENDED_KEPT) _ended.delete(_ended.values().next().value);
};

/** @param {any[]} list */
export function staffEventBook(list) {
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list.slice(0, STAFF_EVENTS_MAX) : []) {
    const e = validStaffEvent(raw);
    if (!e || _ended.has(e.id)) continue;
    seen.add(e.id);
    const had = _raids.get(e.id);
    if (had) { had.staff = e; had.attackAmount = e.n; } else _raids.set(e.id, raidOf(e));
  }
  for (const id of [..._raids.keys()]) if (!seen.has(id) && !_raids.get(id)?.cleansed) endOne(id);
  return [..._raids.values()].filter((r) => !r.cleansed).length;
}
export const staffEventEnd = (/** @type {string} */ id) => { endOne(id); return true; };
/** @param {{ id: string, n: number, bd: 0|1, bu: 0|1, bk: 0|1, fc: number, md?: number, mu?: number }} st */
export function staffEventLedger(st) {
  if (!_raids.has(st.id)) return false;
  _ledgers.set(st.id, { n: st.n, bd: st.bd, bu: st.bu, bk: st.bk, fc: st.fc, md: st.md ?? 0, mu: st.mu ?? 0 });
  return true;
}
/** @param {string} id */
export const staffLedgerOf = (id) => _ledgers.get(id) ?? null;

/** @returns {StaffRaid[]} */
export const staffRaids = () => [..._raids.values()].filter((r) => !r.cleansed);
/**
 * An event boss from a peer may claim the larger of the typed `hp` and the normal bound for its kind times `bh`.
 * Otherwise `grantHost.js` rejects it as a plain elite.
 * @param {string} key
 * @param {number} normal
 * @returns {number|null}
 */
export function staffBossBound(key, normal) {
  const r = staffRaids().find((x) => x.key === key);
  if (!r) return null;
  return Math.max(r.staff.hp ?? 0, Math.round(normal * Math.min(100, Math.max(1, r.staff.bh ?? 10))));
}
export const staffRaidsEnded = () => [..._raids.values()].filter((r) => r.cleansed && !r.routed);
/** @param {string} key */
export const staffRaidOfKey = (key) => { const id = staffEventIdOf(key); return id ? _raids.get(id) ?? null : null; };

/**
 * @param {{regionIndex: number, locationIndex: number}|null} town
 * @param {{x: number, y: number}|null} px
 * @param {boolean} outdoors
 */
export function staffRaidHere(town, px, outdoors) {
  for (const r of _raids.values()) {
    if (r.cleansed) continue;
    if (isAreaEvent(r.staff) ? outdoors && !!px && px.x === r.px && px.y === r.py : !!town && town.regionIndex === r.regionIndex && town.locationIndex === r.locationIndex) return r;
  }
  return null;
}

/**
 * @param {StaffRaid} r
 * @param {() => number} random
 */
export const staffRaider = (r, random) => r.staff.mt[Math.min(r.staff.mt.length - 1, Math.floor(random() * r.staff.mt.length))];
/**
 * @param {StaffRaid} r
 * @param {number} standing
 * @param {number} cap
 */
export function staffRaidRoom(r, standing, cap) {
  if (standing >= cap) return false;
  const n = Math.max(_ledgers.get(r.staff.id)?.n ?? 0, r.killed);
  return n + standing < r.staff.n;
}
/** @param {StaffRaid} r */
export function staffMidWanted(r) {
  const led = _ledgers.get(r.staff.id);
  if (!led || !(r.staff.mb > 0)) return 0;
  const next = Math.max(led.mu ?? 0, r.midStood ?? 0) + 1;
  return next <= (led.md ?? 0) ? next : 0;
}
/** @param {StaffRaid} r */
export function staffBossWanted(r) {
  const led = _ledgers.get(r.staff.id);
  if (!led || !led.bd || led.bu || led.bk) return -1;
  return r.bossFc === led.fc ? -1 : led.fc;
}
/** @param {StaffRaid} r */
export const staffBossByHand = (r) => (r.staff.fb ?? 0) > (r.handSeen ?? 0);
/**
 * The cell never calls a boss again once told it spawned, so a lost boss is respawned for the same call. The wait
 * lets a departed runner's boss transfer first.
 * @param {StaffRaid} r
 * @param {boolean} standing
 * @param {number} nowMs
 */
export function staffBossLost(r, standing, nowMs) {
  const led = _ledgers.get(r.staff.id);
  if (!led || !led.bd || !led.bu || led.bk || standing || (r.bossDown && r.bossFc === led.fc)) { r.bossLostAt = undefined; return -1; }
  r.bossLostAt ??= nowMs;
  if (nowMs - r.bossLostAt < STAFF_BOSS_LOST_MS) return -1;
  r.bossLostAt = undefined;
  return led.fc;
}
export const STAFF_BOSS_LOST_MS = 8000;
/** @param {StaffRaid} r */
export function staffBossToSay(r) {
  const led = _ledgers.get(r.staff.id);
  if (!led || !led.bd || !led.bu || r.bossSaid === led.fc) return -1;
  r.bossSaid = led.fc;
  return led.fc;
}

/** @param {string|null|undefined} key */
export const staffBossNameOf = (key) => (typeof key === 'string' ? (staffRaidOfKey(key)?.staff.bn ?? '') : '');

/**
 * @param {number} nowMs
 * @param {(region: number) => string} [regionName]
 */
export function staffMapMarks(nowMs, regionName = () => '') {
  const out = [];
  for (const r of staffRaids()) {
    const e = r.staff;
    const place = r.locationName || regionName(r.regionIndex) || 'An area';
    const led = _ledgers.get(e.id);
    const lines = [regionName(r.regionIndex) && regionName(r.regionIndex) !== place ? `${place}, ${regionName(r.regionIndex)}` : place];
    if (e.tx) lines.push(e.tx.slice(0, 90));
    if (led?.bu && !led.bk) lines.push(`${e.bn || 'A mighty foe'} stands`);
    if (e.ue > 0) { const m = Math.max(0, Math.ceil((e.ue - nowMs) / 60000)); lines.push(m >= 60 ? `Ends in about ${Math.round(m / 60)} h` : m > 0 ? `Ends in ${m} min` : 'Ending now'); }
    out.push({ key: r.key, px: r.px, py: r.py, label: e.lb || `${place} · under attack`, tip: { title: 'Event', lines } });
  }
  return out;
}

export function _resetStaffEvents() { _raids = new Map(); _ledgers = new Map(); _ended = new Set(); }
