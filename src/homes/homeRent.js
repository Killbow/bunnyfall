// @ts-check
import {
  RENT_DAYS, RENT_DAYS_MAX, RENT_ROOMS_MAX, rentCost, rentPriceOk, rentRoomOk, rentAnchorOf, rentDaysLeft, rentUntil, RENT_PRICE_MIN, RENT_PRICE_MAX,
} from '../net/homeLaw.js';
import { ARENA_TEXT } from '../arena/arenaText.js';
import { goldSum, EMPIRE_ACCOUNT_WORDS } from './homeWords.js';
import { walletReserve } from '../net/realmGoldLaw.js';

export const RENT_VERB = 'home-rent';
export const RENT_PRICE_STEPS = Object.freeze([-100, -10, 10, 100]);
export const RENT_PRICE_FIRST = 50;

export const rentRowLabel = (from) => `Rent a room: from ${goldSum(from)} gold a day`;
export const rentTenantLabel = (daysLeft) => `Renew your room: ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
export const rentWelcomeLine = (daysLeft) => `You rent a room here, with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left. You can rest here.`;
export const rentPickLines = (owner) => [`Rooms to rent in ${owner}'s home.`, `The rent is paid now, from your purse and ${EMPIRE_ACCOUNT_WORDS}.`];
export const rentDaysLines = (room, price) => [`Room ${room} - ${goldSum(price)} gold a day.`, 'For how many days? These are real days.'];
export const rentConfirmLines = (room, days, price) => [`Rent room ${room} for ${days} day${days === 1 ? '' : 's'}?`, `It costs ${goldSum(rentCost(price, days))} gold.`];
export const rentDoneLine = (room, days) => `Room ${room} is yours for ${days} day${days === 1 ? '' : 's'}. The door will open for you.`;
export const rentShortLine = (cost) => `You need ${goldSum(cost)} gold, in your purse and ${EMPIRE_ACCOUNT_WORDS} together.`;
export const RENT_NONE_FREE = 'No room here is free to rent right now.';
export const RENT_REALM_ONLY = 'Only an online character can rent a room.';

export const homeBedIsMine = (home, nowS) => !!home && (home.own === true || !!(home.hall && home.member) || rentDaysLeft(home.tenant, nowS) > 0);

export const rentDayRows = (room, nowS) => RENT_DAYS.filter((d) => rentUntil(nowS, room?.yours ? room.until : 0, d) != null);
export const RENT_FULL_LINE = `Your room is paid for ${RENT_DAYS_MAX} days ahead, the most allowed. Renew it once some of those days have passed.`;
export function rentNoneLine(rooms, nowS) {
  const mine = (rooms ?? []).find((r) => r.yours && !r.listed);
  if (!mine) return RENT_NONE_FREE;
  const left = rentDaysLeft(mine.until, nowS);
  return `Room ${mine.room} is no longer offered to rent. It is yours for ${left} more day${left === 1 ? '' : 's'}, and cannot be renewed.`;
}

export async function homeRooms(api, mapId, buildingKey, character = null) {
  const r = await api.rooms(mapId, buildingKey, character);
  if (!r?.ok) return { ok: false, error: r?.error ?? 'server' };
  const d = r.data ?? {};
  const rooms = (Array.isArray(d.rooms) ? d.rooms : []).filter((x) => rentRoomOk(x?.room) && rentPriceOk(x?.price) && (rentAnchorOf(x?.anchor) || (x?.moved === true && x.anchor == null)))
    .map((x) => ({
      room: x.room, anchor: rentAnchorOf(x.anchor), price: x.price, listed: x.listed === true, taken: x.taken === true, yours: x.yours === true,
      until: Number.isSafeInteger(x.until) ? x.until : null, tenant: typeof x.tenant === 'string' ? x.tenant : null,
      ...(x.moved === true ? { moved: true } : {}),
    }));
  const n = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);
  return { ok: true, rooms, due: n(d.due), owner: typeof d.owner === 'string' ? d.owner : '', mine: d.mine === true, now: n(d.now) };
}

export const rentable = (rooms) => (rooms ?? []).filter((r) => r.listed && (!r.taken || r.yours));

/**
 * @param {{ api: any, homes?: any, realm?: any, wallet: { gold: number, pay: (n: number) => ((() => void) | void), credit?: (n: number) => void },
 *   mapId: number, buildingKey: number, character: string|null, room: number, days: number, price: number }} o
 */
export async function rentHomeRoom({ api, homes = null, realm = null, wallet, mapId, buildingKey, character, room, days, price }) {
  const cost = rentCost(price, days);
  if (!cost || !rentRoomOk(room)) return { ok: false, error: 'bad-room' };
  if (!realm?.act) return { ok: false, error: 'realm-only' };
  if (!(wallet.gold >= cost)) return { ok: false, error: 'gold' };
  const r = await realm.act({
    reserve: walletReserve(wallet, cost).reserve,
    call: (/** @type {any} */ at) => api.rentRoom({ mapId, buildingKey, character, room, days, price, realm: at }),
  });
  if (!r?.ok) return { ok: false, error: r?.error ?? 'server' };
  homes?.ensure?.(mapId, { force: true });
  return { ok: true, until: Number.isSafeInteger(r.data?.until) ? r.data.until : null, cost };
}

export async function collectHomeRent({ api, realm = null, wallet, mapId, buildingKey, character }) {
  if (!realm?.act) return { ok: false, error: 'realm-only' };
  let gold = 0;
  const r = await realm.act({
    needsAnswer: true,
    apply: (/** @type {any} */ res) => { gold = Math.max(0, Number(res?.data?.gold) || 0); if (gold > 0) wallet.credit?.(gold); },
    call: (/** @type {any} */ at) => api.collectRent({ mapId, buildingKey, character, realm: at }),
  });
  return r?.ok ? { ok: true, gold } : { ok: false, error: r?.error ?? 'server' };
}

export const rentPriceStep = (price, step) => Math.min(RENT_PRICE_MAX, Math.max(RENT_PRICE_MIN, (rentPriceOk(price) ? price : RENT_PRICE_FIRST) + step));

/**
 * @param {{ id: number, name: string, eye: number[] }[]} found
 * @param {any[]} offers
 * @param {(p: number[]) => ({ id: number }|null)} roomOf
 * @param {number[]} origin
 */
export function rentRoomsView(found, offers, roomOf, origin) {
  const used = new Set();
  const held = new Set((offers ?? []).map((x) => x.room));
  let next = null;
  for (let n = 1; n <= RENT_ROOMS_MAX && next == null; n++) if (!held.has(n)) next = n;
  const rows = (found ?? []).map((f) => {
    const o = (offers ?? []).find((x) => !used.has(x.room) && Array.isArray(x.anchor) && roomOf([origin[0] + x.anchor[0], origin[1] + x.anchor[1], origin[2] + x.anchor[2]])?.id === f.id) ?? null;
    if (o) used.add(o.room);
    // An offer keeps its own number; an unoffered room takes its own id when free, else the first free number.
    // Hanging a door can renumber the found rooms, so offers match rooms by anchor, never by the finder's id.
    const number = o ? o.room : rentRoomOk(f.id) && !held.has(f.id) ? f.id : next;
    return { id: f.id, name: f.name, eye: f.eye, offer: o, number, offerable: number != null };
  });
  for (const o of offers ?? []) if (!used.has(o.room)) rows.push({ id: null, name: Array.isArray(o.anchor) ? `Room ${o.room} (its walls have changed)` : ARENA_TEXT.homeMove.roomMoved(o.room), eye: null, offer: o, number: o.room, offerable: false });
  return rows;
}

export function rentRowSub(row, nowS) {
  const o = row.offer;
  if (!o) return row.offerable ? 'Not offered to rent' : `Only ${RENT_ROOMS_MAX} rooms can be offered`;
  if (o.taken) return `Rented by ${o.tenant ?? 'a tenant'} · ${rentDaysLeft(o.until, nowS)} day${rentDaysLeft(o.until, nowS) === 1 ? '' : 's'} left${o.listed ? '' : ', then no longer offered'}`;
  if (!o.listed) return 'No longer offered to rent';
  return `Offered at ${goldSum(o.price)} gold a day`;
}
export const rentAnchorOfRoom = (room, origin) => rentAnchorOf([room.eye[0] - origin[0], room.eye[1] - origin[1], room.eye[2] - origin[2]]);
export const RENT_DAY_ROWS = RENT_DAYS;
