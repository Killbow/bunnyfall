// @ts-check
import { eventTimerRows } from './eventTimers.js';
import { PIXEL_M, gateTimes } from '../net/gateLaw.js';
import { serpentTimes, serpentBossOf } from '../net/serpentLaw.js';
import { starTimes } from '../net/starfall/starfallLaw.js';
import { STAR_WARN_MS } from '../systems/starfall/starfallClient.js';
import { t } from '../ui/textManager.js';
import { EVENT_KINDS, EVENT_KIND_ORDER } from '../mods/features.js';

export const EVENT_BOARD_KINDS = Object.freeze(EVENT_KIND_ORDER.filter((k) => EVENT_KINDS[k].row));
export const EVENT_SINGLE_KINDS = Object.freeze(EVENT_KIND_ORDER.filter((k) => EVENT_KINDS[k].single));
export const EVERY_EVENT_KIND = (/** @type {string} */ _kind) => true;
export const EVENT_SOON_MS = 15 * 60_000;
export const EVENT_BOARD_ROWS = 3;
export const EVENT_BOARD_RAIDS = 2;
export const EVENT_RAID_REACH_M = 25_000;
export const EVENT_TOAST_MS = 9000;
export const EVENT_NOTE_MIN_MS = 5000;
export const EVENT_TOASTS_SHOWN = 1;
export const EVENT_TOASTS_KEPT = 6;
export const EVENT_TOAST_NOTES = 3;
// A note repeated within this time is dropped, because the same line can arrive through two paths.
export const EVENT_NOTE_SAME_MS = 60_000;
// Covers the 500 ms between board reads and the relay's lag behind its own clock.
export const EVENT_SEED_GRACE_MS = 5000;

export const EVENT_KIND_TEXT = Object.freeze(Object.fromEntries(EVENT_KIND_ORDER.map((k) => [k, () => EVENT_KINDS[k].label])));
export const EVENT_PARTY_TEXT = Object.freeze({
  orcs: () => t('events.party.orcs', 'Orcs'),
  bandits: () => t('events.party.bandits', 'Bandits'),
  knights: () => t('events.party.knights', 'Knights'),
});
export const EVENT_BOARD_TEXT = Object.freeze({
  title: () => t('events.board.title', 'World Events'),
  more: (n) => t('events.board.more', '{n, plural, one {1 more in Timers} other {# more in Timers}}', { n }),
  left: (time) => t('events.board.left', '{time} left', { time }),
  starts: (time) => t('events.board.starts', 'in {time}', { time }),
  soon: () => t('events.toast.soon', 'Starting soon'),
  begun: () => t('events.toast.begun', 'Under way'),
  here: () => t('events.way.here', 'Nearby'),
  way: (km, dir) => t('events.way.km', '{km, number} km {dir}', { km, dir }),
  near: (place) => t('events.where.near', 'Near {place}', { place }),
  off: (place) => t('events.where.off', 'Off {place}', { place }),
  gateOpens: () => t('events.gate.opens', 'Dagon\'s Breach opens'),
  gateOpen: () => t('events.gate.open', 'Dagon\'s Breach is open'),
  gateSoon: () => t('events.gate.soon', 'Its omen burns in the sky'),
  gateLive: () => t('events.gate.live', 'It seals when this runs out'),
  serpentRises: (boss) => t('events.serpent.rises', '{boss} rises', { boss }),
  serpentHunts: (boss) => t('events.serpent.hunts', '{boss} hunts', { boss }),
  serpentSoon: () => t('events.serpent.soon', 'The harbor bells are ringing'),
  serpentLive: () => t('events.serpent.live', 'It dives when this runs out'),
  superStands: (name) => t('events.super.stands', '{name} stands', { name }),
  superLive: () => t('events.super.live', 'It fades away unbeaten when this runs out'),
  raid: (town) => t('events.raid.title', 'Raid on {town}', { town }),
  raidKind: (kind, town) => t('events.raid.titleKind', '{kind}: {town}', { kind, town }),
  raidComing: (party) => t('events.raid.coming', '{party} gather to attack', { party }),
  raidLive: (party) => t('events.raid.live', '{party} attacking', { party }),
  raidCount: (n, of) => t('events.raid.count', 'Raiders down: {n} of {of}', { n, of }),
  alone: (kind, title, clock) => t('events.news.alone', '{kind}: {title}, {clock}', { kind, title, clock }),
});
const DIRS = Object.freeze([
  () => t('events.dir.n', 'N'), () => t('events.dir.ne', 'NE'), () => t('events.dir.e', 'E'), () => t('events.dir.se', 'SE'),
  () => t('events.dir.s', 'S'), () => t('events.dir.sw', 'SW'), () => t('events.dir.w', 'W'), () => t('events.dir.nw', 'NW'),
]);

const byTime = (a, b) => (a.live === b.live ? a.at - b.at : a.live ? -1 : 1);
const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const isPixel = (p) => !!p && Number.isFinite(p.px) && Number.isFinite(p.py);
const idNumber = (id) => Number(String(id).split(':')[1]);

/**
 * @param {{ x: number, y: number } | null | undefined} from
 * @param {{ px: number, py: number } | null | undefined} to
 */
export function eventWay(from, to) {
  if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.y) || !isPixel(to)) return null;
  const dx = (/** @type {any} */ (to).px - from.x) * PIXEL_M, dy = (/** @type {any} */ (to).py - from.y) * PIXEL_M;
  const m = Math.hypot(dx, dy);
  if (m < 1) return { m: 0, dir: '', text: EVENT_BOARD_TEXT.here() };
  // Map y runs south, so north is negative y and the angle turns clockwise from north.
  const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  const dir = DIRS[Math.round(deg / 45) % 8]();
  const tenths = Math.round(m / 100) / 10;
  const km = tenths < 10 ? tenths : Math.round(m / 1000);
  return { m, dir, text: EVENT_BOARD_TEXT.way(km, dir) };
}

// The row id `raid:<raidKey>` must match the id `raidingParties.js` passes to `eventNotice`, so the raid's lines
// join this row's card.
function raidRow(r, now, src, soonMs) {
  const way = eventWay(src?.pixel, r);
  const type = String(r.type ?? '');
  const party = EVENT_PARTY_TEXT[type]?.() ?? (capital(type) || null);
  const live = r.startMs <= now;
  const counted = live && Number.isFinite(r.n) && Number.isFinite(r.tg) && r.tg > 0 ? EVENT_BOARD_TEXT.raidCount(Math.min(r.n, r.tg), r.tg) : null;
  const count = live && r.obj ? [r.obj, counted].filter(Boolean).join(' - ') : counted;
  const kindOn = live && r.obj && r.kind;
  return {
    id: r.key ? `raid:${r.key}` : `raid:${r.name}:${r.startMs}`, kind: 'raid', title: kindOn ? EVENT_BOARD_TEXT.raidKind(r.kind, r.name) : EVENT_BOARD_TEXT.raid(r.name), where: r.region || null,
    detail: count ?? (party ? (live ? EVENT_BOARD_TEXT.raidLive(party) : EVENT_BOARD_TEXT.raidComing(party)) : null),
    live, at: live ? r.endMs : r.startMs, way, since: live ? r.startMs : r.startMs - soonMs,
    announce: (!!src?.region && r.region === src.region) || (!!way && way.m <= EVENT_RAID_REACH_M),
  };
}

function timerRow(r, src) {
  const row = { id: r.id, kind: r.kind, title: r.title, where: r.where, detail: r.detail, live: r.live, at: r.at, way: null, since: NaN, announce: true };
  if (r.kind === 'gate') {
    const T = gateTimes(idNumber(r.id)), site = src?.gate?.site;
    Object.assign(row, { title: r.live ? EVENT_BOARD_TEXT.gateOpen() : EVENT_BOARD_TEXT.gateOpens(), detail: r.live ? EVENT_BOARD_TEXT.gateLive() : EVENT_BOARD_TEXT.gateSoon(), since: r.live ? T.openAt : T.omenAt });
    if (r.where && src?.gate?.place) { row.where = EVENT_BOARD_TEXT.near(src.gate.place); row.way = isPixel(site) ? eventWay(src?.pixel, site) : null; }
  } else if (r.kind === 'serpent') {
    const day = idNumber(r.id), T = serpentTimes(day), boss = serpentBossOf(day).name, site = src?.serpent?.site;
    Object.assign(row, { title: r.live ? EVENT_BOARD_TEXT.serpentHunts(boss) : EVENT_BOARD_TEXT.serpentRises(boss), detail: r.live ? EVENT_BOARD_TEXT.serpentLive() : EVENT_BOARD_TEXT.serpentSoon(), since: r.live ? T.riseAt : T.omenAt });
    if (r.where && src?.serpent?.place) { row.where = EVENT_BOARD_TEXT.off(src.serpent.place); row.way = isPixel(site) ? eventWay(src?.pixel, site) : null; }
  } else if (r.kind === 'super') {
    const site = src?.sd?.site, place = src?.sd?.place ?? site?.cityName ?? null, rec = src?.sd?.rec;
    Object.assign(row, { title: EVENT_BOARD_TEXT.superStands(src?.sd?.name || EVENT_KIND_TEXT.super()), detail: EVENT_BOARD_TEXT.superLive(), since: Number.isFinite(rec?.foundAt) ? rec.foundAt : NaN });
    if (r.where && place) { row.where = EVENT_BOARD_TEXT.near(place); row.way = isPixel(site) ? eventWay(src?.pixel, site) : null; }
  } else if (r.kind === 'star') {
    const [n, k] = String(r.id).slice(5).split('.').map(Number), T = starTimes(n, k);
    row.since = r.live ? T.fallAt : T.fallAt - STAR_WARN_MS;
    row.way = r.where && isPixel(r) ? eventWay(src?.pixel, /** @type {any} */ (r)) : null;
  }
  return row;
}

/**
 * @param {any} src
 * @param {{ soonMs?: number, max?: number, raids?: number, shown?: (kind: string) => boolean }} [o]
 */
export function eventBoardModel(src, { soonMs = EVENT_SOON_MS, max = EVENT_BOARD_ROWS, raids = EVENT_BOARD_RAIDS, shown = EVERY_EVENT_KIND } = {}) {
  const now = Number(src?.now);
  if (!Number.isFinite(now)) return { rows: [], more: 0, all: [], every: [], now: NaN };
  const near = (r) => r.live || (!!r.where && r.at - now <= soonMs);
  const timers = [];
  for (const r of eventTimerRows({ ...src, raids: null })) {
    if (r.kind === 'raid' || !EVENT_BOARD_KINDS.includes(r.kind) || r.shut || !near(r)) continue;
    timers.push(timerRow(r, src));
  }
  const raidRows = (Array.isArray(src?.raids) ? src.raids : [])
    .filter((r) => r && typeof r.name === 'string' && Number.isFinite(r.startMs) && Number.isFinite(r.endMs) && !r.done && r.endMs > now && r.startMs - now <= soonMs)
    .map((r) => raidRow(r, now, src, soonMs))
    .sort((a, b) => (a.way && b.way ? a.way.m - b.way.m : a.at - b.at));
  const every = [...timers, ...raidRows].sort(byTime);
  const on = (r) => !!shown(r.kind);
  const rows = [...timers.filter(on), ...raidRows.filter(on).slice(0, Math.max(0, raids))].sort(byTime);
  const all = every.filter(on);
  const cut = Math.max(0, max);
  return { rows: rows.slice(0, cut), more: all.length - Math.min(cut, rows.length), all, every, now };
}

/**
 * A row seen for the first time is announced only when its `since` falls within `EVENT_SEED_GRACE_MS` of the first
 * read, so a page opened mid-event shows no burst of news.
 * @param {ReadonlyArray<any>} rows
 * @param {Map<string, boolean>} seen
 * @param {number|null} watchFrom
 * @param {(kind: string) => boolean} [shown]
 */
export function eventAnnouncements(rows, seen, watchFrom, shown = EVERY_EVENT_KIND) {
  const out = [];
  const here = new Set();
  const watching = watchFrom != null && Number.isFinite(watchFrom);
  for (const r of rows ?? []) {
    here.add(r.id);
    const was = seen.get(r.id);
    seen.set(r.id, !!r.live);
    if (!watching || !r.announce || !shown(r.kind)) continue;
    if (was === undefined) {
      if (Number.isFinite(r.since) && r.since >= /** @type {number} */ (watchFrom) - EVENT_SEED_GRACE_MS) out.push({ id: r.id, kind: r.kind, phase: r.live ? 'begun' : 'soon' });
    } else if (!was && r.live) out.push({ id: r.id, kind: r.kind, phase: 'begun' });
  }
  // Rows missing from `rows` are forgotten, so the caller passes the model's `every` list; the cut list would
  // re-announce a row when it returns.
  for (const id of [...seen.keys()]) if (!here.has(id)) seen.delete(id);
  return out;
}

/** @param {{ lifeMs?: number, shown?: number, kept?: number, notes?: number }} [o] */
export function createEventToasts({ lifeMs = EVENT_TOAST_MS, shown = EVENT_TOASTS_SHOWN, kept = EVENT_TOASTS_KEPT, notes = EVENT_TOAST_NOTES } = {}) {
  /** @type {Array<{ key: number, kind: string, id: string|null, phase: string|null, notes: string[], age: number }>} */
  let list = [];
  let nextKey = 1;
  const said = new Map();
  const single = (kind) => EVENT_SINGLE_KINDS.includes(kind);
  const isShown = (c) => list.indexOf(c) < shown;
  const make = (kind, id, phase, note) => {
    const c = { key: nextKey++, kind, id, phase, notes: note ? [note] : [], age: 0 };
    list.push(c);
    while (list.length > Math.max(shown, kept)) {
      const waiting = list.slice(shown);
      const bare = waiting.find((x) => !x.notes.length);
      list.splice(list.indexOf(bare ?? waiting[0]), 1);
    }
    return c;
  };
  return {
    announce({ id, kind, phase }) {
      const c = list.find((x) => x.id === id) ?? (single(kind) ? list.find((x) => x.kind === kind && x.id === null) : null);
      if (c) { c.id = id; c.phase = phase; return c; }
      return make(kind, id, phase, null);
    },
    note(kind, text, nowMs = 0, id = null) {
      const s = String(text ?? '').trim();
      if (!s) return null;
      const last = said.get(s);
      if (Number.isFinite(last) && nowMs - /** @type {number} */ (last) < EVENT_NOTE_SAME_MS) return null;
      said.set(s, nowMs);
      for (const [k, at] of said) if (nowMs - at >= EVENT_NOTE_SAME_MS) said.delete(k);
      const mine = (x) => x.notes.length < notes && (id ? x.id === id : single(kind) && x.kind === kind);
      const c = list.find(mine);
      if (c) {
        if (!c.notes.includes(s)) c.notes.push(s);
        if (isShown(c)) c.age = Math.min(c.age, Math.max(0, lifeMs - EVENT_NOTE_MIN_MS));
        return c;
      }
      return make(kind, id, null, s);
    },
    step(dtMs) {
      const d = Math.max(0, Number(dtMs) || 0);
      for (let i = 0; i < Math.min(shown, list.length); i++) list[i].age += d;
      list = list.filter((c) => c.age < lifeMs);
    },
    take(key) { list = list.filter((c) => c.key !== key); },
    drop(kind) { list = list.filter((c) => c.kind !== kind); },
    cards: () => list.slice(0, shown),
    waiting: () => Math.max(0, list.length - shown),
    clear() { list = []; said.clear(); },
  };
}
