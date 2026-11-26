// @ts-check
// `LivingTown` replaces the `TownPopulation` pool and keeps its shape: `pool` rows, `update()`, `retire(person)`,
// `nav`, and `maxPopulation`. The talk ray, the watch conversion, the trample, and the draw treat a resident as a
// walker.
import { POP_RECYCLE_DISTANCE, maxPopulationFor, popAllowChange } from '../../characters/townPopulation.js';
import { PERSON_MOVE_SPEED } from '../../characters/mobilePerson.js';
import { townPlaces, exitToward, harbourDock, streetGeometry } from './places.js';
import { townCensus, isHome, watchShiftSize } from './census.js';
import { dayPlan, entryAt, isOutdoor, walkMinutes, DAY_START_MIN, DAY_MIN, GUILD_DAY_OFFSETS } from './dayPlan.js';
import { townClassOf, stillRoleOf, stillFlatOf } from './looks.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { NAV_CELL } from '../../world/cityNavigation.js';
import { createPathBook, pointOnLine } from './townPaths.js';
import { spotCircles, spotRound, circleLine, circlesStands, aloneStand, aloneStands, ROUND_S, GATHER_BEAT_S, lineMinutes, ALONE_FAR_M, SPACE_M } from './meetups.js';
import { spotIncidents, stirLine, stirLoud, smallVoice, gateWord } from './stir.js';
import { LIVING_GREETINGS, LIVING_KEEPSAKE, WATCH_GREETINGS, HEARD_GREETINGS, watchBand, fillLine, firstNameOf, CHAPTER_NEWS, CHAPTER_NEWS_DAYS, townEconNews, TOWN_ECON_NEWS_DAYS, CHAPTER_EVENT_NEWS } from './lines.js';
import { keepsakeFor } from './keepsake.js';
import { lwSeed, textSeed } from './seed.js';
import { placeKeyOf } from './lives.js';
import { NEWS_DAYS } from './trips.js';
import { patronVisits, patronOf, PATRON_DELAY_DAYS } from './patrons.js';
import { tavernProgress } from '../../guilds/bunnyMembership.js';
import { carriedNews, reputeOf, reputeKind, regardWithRepute, heardOf } from './carried.js';

export const householdKeyOf = (res) => res?.household ?? (res?.home == null ? null : `H${res.home}`);

// A crew's arrival is read from both the ships' clock and the sky clock, which drift slightly, so its day is
// replanned only past this change.
export const CREW_REPLAN_MIN = 5;
export const LIVING_TICK_S = 0.25;
export const LIVING_RANGE = POP_RECYCLE_DISTANCE;
export const PATHS_PER_FRAME = 4;
export const WALK_FAST = 1.6;
export const CATCH_UP = 0.35;
export const SNAP_M = 30;
export const DOOR_POP_MIN = 2;
export const STAND_WALL_M = 0.95;
export const DOOR_KEEP_M = 1.5;
export const PANIC_M = 10;
export const FLEE_SPEED = PERSON_MOVE_SPEED * 2;
export const FLEE_WARY_M = PANIC_M * 2;
export const FLEE_HOLD_S = 4;
// Stays below SNAP_M so a resident who ran walks back to their day instead of snapping to it.
export const FLEE_FAR_M = 20;
export const PAIR_SIDE_M = 0.9;
export const PAIR_BEHIND_M = 1.2;
export const GREET_RANGE = 3.2;
export const LINE_RANGE = 24;
export const GREET_REST_MIN = 90;
export const ARRIVAL_JUMP_MIN = 15;
export const ARRIVAL_STEP_M = 40;
export const ARRIVAL_PATHS_PER_FRAME = 32;
export const PATH_CELLS = 8000;
export const ARRIVAL_PATH_CELLS = 24000;
export const ARRIVAL_SHOW_S = 1.5;
export const CENSUS_PATHS = 4;
export const WALK_STRAY_M = 48;

export const FILE_MIN = 0.25;
export const FILE_M = 1.2;
export const DODGE_AHEAD_M = 2.4;
export const DODGE_SIDES = Object.freeze([0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35]);
export const DODGE_SPEED = 1;
export const DODGE_SETTLE_M = 0.6;
// Slack so a step aside exactly SPACE_M from another still passes the spacing check after float rounding.
const SPACE_EPS = 1e-6;

/**
 * @param {{ from?: { x: number, z: number }, to?: { x: number, z: number } }} e
 * @param {number[]} p
 */
export function walkGap(e, p) {
  const a = /** @type {{ x: number, z: number }} */ (e.from), b = /** @type {{ x: number, z: number }} */ (e.to);
  const gx = Math.max(Math.min(a.x, b.x) - p[0], 0, p[0] - Math.max(a.x, b.x));
  const gz = Math.max(Math.min(a.z, b.z) - p[2], 0, p[2] - Math.max(a.z, b.z));
  return Math.hypot(gx, gz);
}
export const TALK_PULL_M = ALONE_FAR_M;
/**
 * @param {{ res: Resident, d: number }[]} wanted
 * @param {(id: string) => any} circleOf
 * @param {number} cap
 * @returns {Set<Resident>}
 */
export function keepUnits(wanted, circleOf, cap) {
  /** @type {Map<any, { res: Resident[], d: number }>} */
  const units = new Map();
  for (const w of wanted) {
    const c = circleOf(w.res.id);
    const key = c ?? w.res, d = c ? w.d - TALK_PULL_M : w.d;
    const u = units.get(key);
    if (u) { u.res.push(w.res); u.d = Math.min(u.d, d); } else units.set(key, { res: [w.res], d });
  }
  const keep = new Set();
  for (const u of [...units.values()].sort((a, b) => a.d - b.d || (a.res[0].id < b.res[0].id ? -1 : 1))) {
    if (keep.size + u.res.length <= cap) for (const r of u.res) keep.add(r);
  }
  return keep;
}
export const GREET_S = 3.4;
export const LINE_HEAD_M = 2.1;
export const LIVING_REFUSAL = '{a} turns away from you.';
export const WITNESS_M = LINE_RANGE;
export const DEED_KNOWN_MIN = 60;

// Each day cache holds the neighboring day in `other`, one deep, because around the 04:00 day turn some readers
// still read yesterday's plans and walks while others read today's.

/**
 * @template {{ day: number, other?: any }} T
 * @param {T|null|undefined} cur
 * @param {number} day
 * @returns {T|null}
 */
export function swapDay(cur, day) {
  const o = cur?.other;
  if (!cur || !o || o.day !== day) return null;
  cur.other = null;
  o.other = cur;
  return o;
}

/**
 * @template {{ day: number, other?: any }} T
 * @param {T|null|undefined} cur
 * @param {number} day
 * @returns {T|null}
 */
export function besideDay(cur, day) {
  const o = !cur ? null : cur.day !== day ? cur : (cur.other ?? null);
  if (o) o.other = null;
  return o;
}

/**
 * @param {import('./places.js').Places} places
 * @param {boolean} [temples]
 * @returns {number[]}
 */
export function townChapters(places, temples = false) {
  const out = new Set();
  for (const [key, t] of places.types) {
    if (t !== BUILDING_TYPES.GuildHall && !(temples && t === BUILDING_TYPES.Temple)) continue;
    const f = places.factions?.get(key) ?? 0;
    if (f) out.add(f);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * @typedef {import('./census.js').Resident} Resident
 * @typedef {import('./dayPlan.js').Entry} Entry
 * @typedef {{ person: any, active: boolean, scheduleEnable: boolean, scheduleRecycle: boolean, visible: boolean, res: Resident|null, mine: boolean, arrival: boolean, paused?: boolean, flee?: { at: number[], left: number, from: number[] } | null, side?: number, halt?: boolean }} Row
 */

export class LivingTown {
  /**
   * @param {any} nav
   * @param {{ town: import('./census.js').LwTown, buildings: readonly import('./census.js').LwBuilding[], doors: readonly { key: number, x: number, z: number, nx: number, nz: number }[], makePerson: (archive: number, guard: boolean) => any, clock: () => number, rate: () => number, mpm: number, suppressSpawns?: () => boolean, relations?: () => (ReturnType<typeof import('./relations.js').createRelations> | null), playerName?: () => string, weather?: () => (string|null), townName?: string, regionName?: string, carriedOf?: (day: number) => (any[] | null), tripsOf?: (day: number) => ({ away: Map<string, { t0: number, t1: number, yaw: number, armed: boolean, dock?: boolean }[]>, visitors: { res: Resident, inT: number, outT: number, yaw: number, trip?: any, dock?: boolean }[], holders?: Map<string, Resident|null>, news?: { kind: string, who: string, foe: string, place: string }[], places?: string[] } | undefined), armOf?: (res: Resident) => ({ mobileType: number, basics: any, archive: number, frameCount: (record: number) => number, sex?: 'male'|'female' } | null), flatOf?: (flat: { archive: number, record: number }) => ({ archive: number, record: number, frameCount: number } | null), ashore?: (res: Resident) => ('home'|'sea'|'abroad'|null), crews?: () => { res: Resident, inT: number, outT: number, berth?: { lane: { key: string }, k: number } }[], harbour?: () => ({ x: number, z: number } | null), holderOf?: (res: Resident, day: number) => (Resident|null), deadAt?: (res: Resident, t: number) => boolean, slay?: (res: Resident, t: number, seen: boolean) => void, killed?: (res: Resident, t: number) => void, sees?: (from: number[], to: number[]) => boolean, legalStanding?: (region: number) => ({ rep: number, known: boolean } | null), keepsakes?: () => readonly any[], takeKeepsake?: (item: any) => void, extraPeople?: (day: number, town: LivingTown) => readonly Resident[], familyNews?: (t: number) => readonly any[] | null, chapterOf?: (faction: number) => ({ band: string, name: string, event?: string | null, shut?: boolean } | null), econBandOf?: () => (string | null), dangers?: () => (readonly number[][] | null), patronsOf?: () => ({ v: number, told: readonly { door: number, t: number, seed: number }[], traders: readonly number[] } | null), }} o
   */
  constructor(nav, o) {
    this.nav = nav;
    this.o = o;
    this.places = townPlaces(nav, o.doors, o.buildings);
    this._bandOf = o.chapterOf ? (/** @type {number} */ f) => this._chapterRead().bands.get(f) ?? null : null;
    /** @type {{ t: number, s: string, bands: Map<number, string> } | null} */
    this._stamp = null;
    this._street = streetGeometry(this.nav, this.places);
    this._wide = streetGeometry(this.nav, this.places, STAND_WALL_M);
    /** @type {Map<string, { ix: number, iz: number, out: { x: number, z: number } }>} */ this._offKept = new Map();
    this.residents = townCensus(o.town, o.buildings, new Set(this.places.doors.keys()));
    this._watchSize = watchShiftSize(o.town);
    this.maxPopulation = maxPopulationFor(o.town.blocks);
    /** @type {Row[]} */
    this.pool = [];
    /** @type {Map<string, { day: number, plan: Entry[], roads?: boolean, inT?: number, home?: number|null, other?: any, sheet?: string, pv?: number, pe?: string, pb?: string }>} */
    this._plans = new Map();
    this._paths = createPathBook(nav);
    this._timer = Infinity;
    /** @type {Map<string, number>} */
    this._taken = new Map();
    /** @type {Set<string>} */
    this._lent = new Set();
    /** @type {ReadonlySet<string>} */
    this._peerLent = new Set();
    /** @type {Map<string, number>} */
    this._lag = new Map();
    /** @type {Map<string, { circle: any, place: { x: number, z: number, yaw: number }, spot: any }>} */
    this._inCircle = new Map();
    /** @type {Map<string, { x: number, z: number }[]>} */
    this._circled = new Map();
    /** @type {Map<string, any>} */
    this._holding = new Map();
    /** @type {Map<string, { inc: import('./stir.js').Incident, pair: any, spot: any, other: string, keeps: string }>} */
    this._inStir = new Map();
    /** @type {Map<string, { spot: any, x: number, z: number, yaw: number }>} */
    this._aloneAt = new Map();
    /** @type {Map<string, { sig: string, got: Map<string, { x: number, z: number, yaw: number }> }>} */
    this._aloneKeep = new Map();
    /** @type {number} */
    this._planGen = 0;
    /** @type {{ day: number, gen: number, from: Map<string, { t0: number, id: string, e: Entry }[]>, other?: any } | null} */
    this._departures = null;
    /** @type {Map<string, { t: number, said: boolean }>} */
    this._greeted = new Map();
    /** @type {Map<string, any>} */
    this._scripts = new Map();
    /** @type {Map<number, { sig: number, rate: number, gen: number, by: Map<string, import('./stir.js').Incident[]>, spots: Map<string, any> }>} */
    this._stirDays = new Map();
    /** @type {Map<number, { roads: any, rate: number, by: Map<string, ReturnType<LivingTown['_gateOf']>> }>} */
    this._gateKeep = new Map();
    /** @type {Map<string, { inc: import('./stir.js').Incident, mid: { x: number, z: number } }>} */
    this._stirAt = new Map();
    /** @type {Map<string, import('./stir.js').Incident>} */
    this._stirVoice = new Map();
    /** @type {{ person: any, text: string, until: number }[]} */
    this._greetings = [];
    /** @type {Map<number, any>} */
    this._patronDays = new Map();
    /** @type {Map<number, { extra: readonly Resident[]|null, by: Map<string, Resident|null> }>} */
    this._holders = new Map();
    /** @type {{ visits: any, m: number, v: number, out: any[] } | null} */
    this._carriedMemo = null;
    /** @type {{ v: number, map: Map<string, any[]> } | null} */
    this._deedsKept = null;
    this._now = 0;
    this._ticking = false;
    this._roadsMiss = null;
    this._realNow = 0;
    /** @type {number|null} */
    this._lastClock = null;
    /** @type {number[]|null} */
    this._lastPlayer = null;
    this._arriving = false;
    this._arrivalUntil = -Infinity;
    this._onStreet = false;
    /**
     * The live list and its rows are reused and refilled each frame, so callers must not hold them across frames.
     * @type {any[]}
     */
    this._live = [];
    /** @type {{ person: any, out: any }[]} */
    this._rows = [];
    /** @type {{ day: number, roads: any, extra?: readonly Resident[]|null, list: Resident[], other?: any } | null} */
    this._people = null;
    /** @type {number[]|null} */
    this._homes = null;
    /** @type {Map<string, { res: Resident, inT: number, outT: number, berth?: { lane: { key: string }, k: number } }>} */
    this._crewOf = new Map();
    /** @type {any} */
    this._harbourDock = null;
    /** @type {string|null} */
    this._harbourMiss = null;
  }

  dockSpot() {
    if (this.places.dock.length) return this.places.dock[0];
    if (this._harbourDock) return this._harbourDock;
    const h = this.o.harbour?.() ?? null;
    if (!h) return null;
    // A failed harbour search is cached by the nav cell of the berth, not its position, because the host returns
    // the berth slightly off after a floating-origin shift.
    const berth = `${Math.floor(h.x / NAV_CELL)},${Math.floor(h.z / NAV_CELL)}`;
    if (this._harbourMiss === berth) return null;
    this._harbourDock = harbourDock(this.nav, this.places, h.x, h.z);
    if (this._harbourDock) { this.places.dock.push(this._harbourDock); this._plans.clear(); }
    if (!this._harbourDock) this._harbourMiss = berth;
    return this._harbourDock;
  }

  /** @param {Resident} res */
  _gone(res) {
    const a = this.o.ashore?.(res) ?? null;
    return a === 'sea' || a === 'abroad';
  }

  /** @returns {Resident[]} */
  _crewsNow() {
    const got = this.o.crews?.() ?? [];
    this._crewOf = new Map(got.map((c) => [c.res.id, c]));
    return got.map((c) => c.res);
  }

  /** @param {number} t */
  dayOf(t) { return Math.floor((t - DAY_START_MIN) / DAY_MIN); }

  _chapterRead() {
    const t = Math.floor(this.o.clock());
    if (this._stamp?.t !== t) {
      /** @type {Map<number, string>} */
      const bands = new Map();
      for (const f of townChapters(this.places)) { const c = this.o.chapterOf?.(f); const b = c?.shut ? 'shut' : c?.band; if (b) bands.set(f, b); }
      this._stamp = { t, bands, s: [...bands].map(([f, b]) => `${f}:${b}`).join() };
    }
    return this._stamp;
  }
  _chapterStamp() { return this.o.chapterOf ? this._chapterRead().s : ''; }

  /** @param {number} t */
  chapterNews(t) {
    if (!this.o.chapterOf) return [];
    const d = ((this.dayOf(t) % 7) + 7) % 7;
    return townChapters(this.places, true).flatMap((f) => {
      const w = lwSeed(this.o.town.mapId, f, 0x63686170) % 7;
      if (!GUILD_DAY_OFFSETS.slice(0, CHAPTER_NEWS_DAYS).some((o) => d === (w + o) % 7)) return [];
      const c = this.o.chapterOf?.(f);
      const kind = c?.shut ? 'shut' : c?.event && /** @type {Record<string, unknown>} */ (CHAPTER_EVENT_NEWS)[c.event] ? c.event : c?.band;
      return c && kind && (/** @type {Record<string, unknown>} */ (CHAPTER_EVENT_NEWS)[kind] || /** @type {Record<string, unknown>} */ (CHAPTER_NEWS)[kind]) ? [{ kind, chapter: true, guild: c.name, who: '', foe: '', place: '' }] : [];
    });
  }

  /** @param {number} t */
  econNews(t) {
    const band = this.o.econBandOf?.() ?? null;
    const kind = typeof band === 'string' ? band.toLowerCase() : null;
    if (!kind || !Object.prototype.hasOwnProperty.call(townEconNews(), kind)) return [];
    const d = ((this.dayOf(t) % 7) + 7) % 7;
    const w = lwSeed(this.o.town.mapId, 0x65636f6e) % 7;
    return GUILD_DAY_OFFSETS.slice(0, TOWN_ECON_NEWS_DAYS).some((o) => d === (w + o) % 7) ? [{ kind, econ: true, who: '', foe: '', place: '' }] : [];
  }

  /**
   * @param {Resident} res
   * @param {number} day
   */
  planOf(res, day) {
    let e = this._plans.get(res.id);
    if (e && e.day !== day) { const o = swapDay(e, day); if (o) this._plans.set(res.id, e = o); }
    const crew = this._crewOf.get(res.id) ?? null;
    const sheet = this._chapterStamp();
    // Only plans that read the patrons' word carry `pb`, so crew and visitor plans are never replanned for a new
    // patrons' version.
    if (!e || e.day !== day || e.home !== res.home || (e.sheet ?? '') !== sheet || (crew && !(Math.abs((e.inT ?? -Infinity) - crew.inT) <= CREW_REPLAN_MIN)) || (e.pb !== undefined && e.pv !== this._patronV() && !this._patronsKept(e, res, day))) {
      const other = besideDay(e, day);
      const roads = this._roadsOf(day);
      const visit = roads?.visitorOf.get(res.id) ?? null;
      let plan, signed = null;
      if (crew) {
        const dock = this.dockSpot() ?? this.places.square ?? null;
        const D0 = day * DAY_MIN + DAY_START_MIN;
        const away = [{ t0: D0 - DAY_MIN, t1: crew.inT, exit: dock, armed: false }, { t0: crew.outT, t1: D0 + 2 * DAY_MIN, exit: dock, armed: false }];
        plan = dayPlan(res, this.places, day, { mpm: this.o.mpm, visitor: true, home: this._lodging(res), away, bandOf: this._bandOf });
        e = { day, plan, roads: true, inT: crew.inT, home: res.home, other, sheet };
        this._planGen++;
        this._plans.set(res.id, e);
        return e.plan;
      }
      if (visit) {
        const exit = visit.dock ? (this.dockSpot() ?? exitToward(this.places, visit.yaw)) : exitToward(this.places, visit.yaw);
        const D0 = day * DAY_MIN + DAY_START_MIN;
        const halt = visit.dock ? 0 : this._gateHalt(exit, visit.inT, day);
        const away = [{ t0: D0 - DAY_MIN, t1: visit.inT, exit, armed: false, halt }, { t0: visit.outT, t1: D0 + 2 * DAY_MIN, exit, armed: false }];
        plan = dayPlan(res, this.places, day, { mpm: this.o.mpm, visitor: true, home: this._lodging(res), away, bandOf: this._bandOf });
      } else {
        const away = (roads?.away.get(res.id) ?? []).map((w) => ({ t0: w.t0, t1: w.t1, exit: w.dock ? (this.dockSpot() ?? exitToward(this.places, w.yaw)) : exitToward(this.places, w.yaw), armed: w.armed }));
        plan = dayPlan(res, this.places, day, { mpm: this.o.mpm, away, watch: this._watchSize, bandOf: this._bandOf, ...this._patronsFor(res, day) });
        signed = this._patronSign(res, day);
      }
      e = { day, plan, roads: !!roads, home: res.home, other, sheet, ...signed };
      this._planGen++;
      this._plans.set(res.id, e);
    }
    return e.plan;
  }

  _patronV() { return this.o.patronsOf?.()?.v ?? 0; }
  /**
   * @param {any} res
   * @param {number} day
   * @returns {{ errands?: any[], browse?: any[] }}
   */
  _patronsFor(res, day) {
    const d = this._patronDayOf(day);
    if (!d) return {};
    const errands = d.byRes.get(res.id)?.errands ?? [];
    return { ...(errands.length ? { errands } : {}), ...(d.browse.length ? { browse: d.browse } : {}) };
  }

  /**
   * Sales are dealt over census household places, never the day's people, so every reader deals them alike; a place
   * vacant on this reader walks none.
   * @param {number} day
   * @returns {{ v: number, by: Map<string, Resident|null>, byRes: Map<string, { errands: any[], sig: string }>, browse: any[], browseSig: string } | null}
   */
  _patronDayOf(day) {
    const p = this.o.patronsOf?.();
    if (!p) return null;
    const by = this._householdsOf(day);
    let d = this._patronDays.get(day);
    if (!d || d.v !== p.v || d.by !== by) {
      /** @type {Map<string, { errands: any[], sig: string }>} */
      const byRes = new Map();
      for (const v of patronVisits(p.told ?? [], day, this.residents)) {
        const res = by.get(v.resId) ?? null;
        if (!res) continue;
        if (!byRes.has(res.id)) byRes.set(res.id, { errands: [], sig: '' });
        const x = /** @type {{ errands: any[], sig: string }} */ (byRes.get(res.id));
        x.errands.push({ at: this.places.doors.get(v.door) ?? null, from: v.from, dur: v.dur });
        x.sig += `${v.door}:${v.from}:${v.dur};`;
      }
      const browse = (p.traders ?? []).map((k) => this.places.doors.get(k)).filter(Boolean);
      d = { v: p.v, by, byRes, browse, browseSig: browse.map((s) => s.key).join() };
      this._patronDays.set(day, d);
      for (const k of this._patronDays.keys()) if (k < day - 1 || k > day + 1) this._patronDays.delete(k);
    }
    return d;
  }

  /**
   * @param {Resident} res
   * @param {number} day
   */
  _patronSign(res, day) {
    const d = this._patronDayOf(day);
    return { pv: this._patronV(), pe: d?.byRes.get(res.id)?.sig ?? '', pb: d?.browseSig ?? '' };
  }

  /**
   * @param {any} e
   * @param {Resident} res
   * @param {number} day
   */
  _patronsKept(e, res, day) {
    const s = this._patronSign(res, day);
    if (s.pe !== e.pe || s.pb !== e.pb) return false;
    e.pv = s.pv;
    return true;
  }

  /**
   * Holders come from the lives alone, never `_roadsOf`: reading another day's roads is a full cold read and evicts
   * today's cached roads.
   * @param {number} day
   * @returns {Map<string, Resident|null>}
   */
  _householdsOf(day) {
    const extra = this.o.extraPeople?.(day, this) ?? null;
    const kept = this._holders.get(day);
    if (kept && kept.extra === extra) return kept.by;
    const hold = this.o.holderOf;
    /** @type {Map<string, Resident|null>} */
    const by = new Map();
    for (const r of this.residents) {
      if (r.roll !== 'h' || r.guard) continue;
      const x = hold ? hold(r, day) : r;
      by.set(r.id, x ? (x.id === r.id ? r : { ...x, home: r.home }) : (extra?.find((m) => placeKeyOf(m) === r.id) ?? null));
    }
    if (this._holders.size > 40) this._holders.clear();
    this._holders.set(day, { extra, by });
    return by;
  }

  _roadsOf(day) {
    if (!this.o.tripsOf) return null;
    if (this._roads?.day === day) return this._roads;
    const kept = swapDay(this._roads, day);
    if (kept) return (this._roads = kept);
    // While a way the trips need is unasked, `tripsOf` returns undefined. The miss is cached for the rest of the
    // tick (`_tick` clears it at both ends) so each plan does not ask again.
    if (this._roadsMiss === day) return null;
    const got = this.o.tripsOf(day);
    if (!got) { if (this._ticking) this._roadsMiss = day; return null; }
    this._roads = { day, away: got.away, visitorOf: new Map(got.visitors.map((v) => [v.res.id, v])), visitors: got.visitors.map((v) => v.res),
      holders: got.holders ?? null, news: got.news ?? null, places: got.places ?? null,
      other: besideDay(this._roads, day) };
    this._people = null;
    for (const [id, e] of this._plans) {
      if (e.day === day && !e.roads) { if (e.other) this._plans.set(id, e.other); else this._plans.delete(id); }
      else if (e.other?.day === day && !e.other.roads) e.other = null;
    }
    return this._roads;
  }

  /**
   * Sorted by id so every reader deals the tavern's rooms alike in `livingIndoors.js` `bedsOf`.
   * @param {number} key
   * @param {number} day
   * @returns {Resident[]}
   */
  lodgersAt(key, day) {
    if (this.places.types.get(key) !== BUILDING_TYPES.Tavern) return [];
    const roads = this._roadsOf(day);
    const out = [];
    for (const res of this.peopleOf(day).concat(this._crewsNow())) {
      if (res.work === key) continue;
      const lodged = this._crewOf.has(res.id) || roads?.visitorOf.has(res.id) ? this._lodging(res) : (res.home != null ? this.places.doors.get(res.home) ?? null : null);
      if (lodged?.building === key) out.push(res);
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /**
   * The halt reads the plans alone, so every reader halts a stranger alike.
   * @param {any} exit
   * @param {number} inT
   * @param {number} day
   * @returns {number}
   */
  _gateHalt(exit, inT, day) {
    if (!exit?.key || !this.places.exits.includes(exit)) return 0;
    const gate = this._gateOf(exit, day);
    const w = gateWord(exit.key, day, inT, this._baseRate());
    if (!w || !gate.keeps(inT, w.halt) || gate.short.has(inT)) return 0;
    const by = gate.held.get(w.round);
    return by === undefined || by === inT ? w.halt : 0;
  }

  /**
   * @param {any} exit
   * @param {number} day
   * @returns {{ keeps: (inT: number, halt: number) => boolean, held: Map<number, number>, short: Set<number> }}
   */
  _gateOf(exit, day) {
    const roads = this._roadsOf(day), rate = this._baseRate();
    let keep = this._gateKeep.get(day);
    if (!keep || keep.roads !== roads || keep.rate !== rate) {
      this._gateKeep.set(day, keep = { roads, rate, by: new Map() });
      for (const d of this._gateKeep.keys()) if (d < day - 1 || d > day + 1) this._gateKeep.delete(d);
    }
    const known = keep.by.get(exit.key);
    if (known) return known;
    const posts = this.peopleOf(day).filter((g) => g.job === 'guard' && !roads?.visitorOf?.has(g.id))
      .flatMap((g) => this.planOf(g, day).filter((e) => e.kind === 'post' && e.duty && e.at?.key === exit.key));
    const keeps = (/** @type {number} */ inT, /** @type {number} */ halt) => posts.some((e) => e.t0 <= inT && e.t1 >= inT + halt);
    /** @type {Map<number, any[]>} */
    const parties = new Map();
    for (const v of roads?.visitorOf?.values() ?? []) {
      if (v.dock || exitToward(this.places, v.yaw) !== exit) continue;
      const l = parties.get(v.inT) ?? [];
      l.push(v);
      parties.set(v.inT, l);
    }
    const got = { keeps, held: new Map(), short: new Set() };
    keep.by.set(exit.key, got);
    for (const inT of [...parties.keys()].sort((a, b) => a - b)) {
      const w = gateWord(exit.key, day, inT, rate);
      if (!w || got.held.has(w.round) || !keeps(inT, w.halt)) continue;
      if (parties.get(inT)?.some((v) => !(inT + w.halt + walkMinutes(exit, this._lodging(v.res), this.o.mpm) < v.outT))) { got.short.add(inT); continue; }
      got.held.set(w.round, inT);
    }
    return got;
  }

  /** @param {string} id */
  _stirring(id) {
    const x = this._inStir.get(id);
    return !!x && this._now >= x.inc.t0 && this._now < x.inc.end;
  }

  /**
   * @param {{ id: string }} res
   * @returns {string | null}
   */
  _homeOf(res) {
    return this._roads?.visitorOf?.get(res.id)?.trip?.from?.name || null;
  }

  _lodging(res) {
    const taverns = [...this.places.doors.entries()].filter(([k]) => this.places.types.get(k) === BUILDING_TYPES.Tavern).map(([, s]) => s);
    return taverns.length ? taverns[lwSeed(textSeed(res.id), 0x6c6f6467) % taverns.length] : (this.places.square ?? null);
  }

  /** @param {number} day */
  peopleOf(day) {
    const roads = this._roadsOf(day);
    const v = roads?.visitors;
    const extra = this.o.extraPeople?.(day, this) ?? null;
    if (this._people && this._people.day !== day) this._people = swapDay(this._people, day) ?? this._people;
    if (this._people?.day === day && this._people.roads === roads && this._people.extra === extra) return this._people.list;
    const h = roads?.holders;
    const hold = this.o.holderOf;
    const own = h || hold ? this.residents.flatMap((r) => {
      const x = h?.has(r.id) ? h.get(r.id) : (hold && r.roll !== 't' ? hold(r, day) : r);
      return !x ? [] : [x.id === r.id ? r : { ...x, home: r.home }];
    }) : this.residents;
    const list = v?.length || extra?.length ? own.concat(v ?? [], extra ?? []) : own;
    this._people = { day, roads, extra, list, other: besideDay(this._people, day) };
    return list;
  }

  /** @param {string} seed */
  homeFor(seed) {
    this._homes ??= [...this.places.doors.keys()].filter((k) => isHome(this.places.types.get(k))).sort((a, b) => a - b);
    return this._homes.length ? this._homes[lwSeed(textSeed(String(seed)), 0x686f6d65) % this._homes.length] : 0;
  }

  /**
   * @param {Resident} res
   * @param {number} t
   */
  entryOf(res, t) {
    const plan = this.planOf(res, this.dayOf(t));
    const i = entryAt(plan, t);
    return i >= 0 ? { e: plan[i], prev: plan[i - 1] ?? null, next: plan[i + 1] ?? null } : null;
  }

  /**
   * @param {number} key
   * @param {number} t
   * @returns {{ res: Resident, e: Entry }[]}
   */
  insideAt(key, t) {
    const day = this.dayOf(t);
    const house = isHome(this.places.types.get(key) ?? -1);
    const out = [];
    for (const res of this.peopleOf(day).concat(this._crewsNow())) {
      if (this._taken.get(res.id) === day || this._away(res) || this._gone(res) || this.o.deadAt?.(res, t)) continue;
      const at = this.entryOf(res, t);
      // Plans budget a walk longer than its line takes, so one who arrived early counts as inside with the stay
      // they walked to.
      const early = at?.e?.kind === 'walk' && at.next && !isOutdoor(at.next) && at.next.kind !== 'walk' && at.next.at?.building === key && !this.where(res, t, false);
      const e = early ? at.next : at?.e;
      if (!e || e.kind === 'walk' || isOutdoor(e) || e.at?.building !== key) continue;
      if (e.kind === 'sleep' || (e.kind === 'work' && !house && res.work === key)) continue;
      if (this.where(res, t, false)) continue;
      out.push({ res, e });
    }
    return out.sort((a, b) => (a.res.id < b.res.id ? -1 : 1));
  }

  /**
   * @param {number} key
   * @returns {Resident[]}
   */
  sleepersAt(key) {
    const t = this._now, day = this.dayOf(t);
    const out = [];
    for (const res of this.peopleOf(day)) {
      if (this._taken.get(res.id) === day || this._away(res) || this._gone(res) || this.o.deadAt?.(res, t)) continue;
      const e = this.entryOf(res, t)?.e;
      if (e?.kind === 'sleep' && e.at?.building === key) out.push(res);
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /**
   * @param {Resident} res
   * @param {boolean} seen
   */
  slainAsleep(res, seen) {
    const day = this.dayOf(this._now);
    const rel = this.o.relations?.();
    this.o.slay?.(res, this._now, seen);
    for (const kin of this.kinOf(res)) rel?.note(kin.id, 'slain', day);
    this._take(res);
    return res.id;
  }

  /** @param {Resident} res */
  wokeBitten(res) {
    this.o.relations?.()?.note(res.id, 'crime', this.dayOf(this._now));
    return res.id;
  }

  _line(e, search) {
    const a = e.from.cell, b = e.to.cell;
    const known = this._paths.get(a, b);
    if (known !== undefined || !search) return known;
    return this._paths.want(a, b, this._onStreet);
  }

  _walked(e, line, t) {
    const dur = Math.max(1e-6, e.t1 - e.t0);
    const v = Math.min(this.o.mpm * WALK_FAST, Math.max(this.o.mpm, line.len / dur));
    return { s: (t - e.t0) * v, arrive: e.t0 + line.len / v };
  }

  /**
   * @param {Resident} res
   * @param {number} t
   * @param {boolean} search
   * @returns {{ x: number, z: number, yaw: number, moving: boolean, e: Entry, pending?: boolean, fromDoor?: boolean } | null}
   */
  where(res, t, search) {
    const at = this.entryOf(res, t);
    if (!at) return null;
    let e = at.e, after = at.next;
    if (e.kind !== 'walk' && at.prev?.kind === 'walk') {
      const line = this._line(at.prev, search);
      if (line && this._walked(at.prev, line, t).arrive > t) { after = e; e = at.prev; }
    }
    if (e.kind === 'walk') {
      const line = this._line(e, search);
      if (line === undefined) return { x: e.from.x, z: e.from.z, yaw: 0, moving: false, e, pending: true };
      if (line === null) return null;
      const w = this._walked(e, line, t);
      if (w.s < line.len) {
        const p = e.pair === 1 ? this._atShoulder(line, w.s) : pointOnLine(line, Math.max(0, w.s - this._fileOf(res, e) * FILE_M));
        return { x: p.x, z: p.z, yaw: p.yaw, moving: true, e, fromDoor: e.from.kind === 'door' && (t - e.t0) < DOOR_POP_MIN };
      }
      if (!after || !isOutdoor(after) || after.kind === 'walk') return null;
      e = after;
    }
    if (!isOutdoor(e)) return null;
    const c = this._inCircle.get(res.id);
    const inCircle = !!c && c.spot === e.at;
    const alone = inCircle ? null : this._aloneAt.get(res.id);
    const st = inCircle ? c.place : alone && alone.spot === e.at ? alone : aloneStand(e.at, res.id, this._street);
    const mine = this._inStir.get(res.id);
    const other = mine?.spot === e.at ? this._aloneAt.get(mine.other) : null;
    const loud = mine?.spot === e.at ? null : this._stirAt.get(e.at.key)?.mid;
    const yaw = other?.spot === e.at ? Math.atan2(other.x - st.x, other.z - st.z) : e.kind === 'post' && !inCircle ? e.at.yaw : loud ? Math.atan2(loud.x - st.x, loud.z - st.z) : st.yaw;
    if (e.kind === 'post') return { x: st.x, z: st.z, yaw, moving: false, e };
    const off = this._offWall(res.id, e.at, st);
    return off ? { x: off.x, z: off.z, yaw: Math.atan2(e.at.x - off.x, e.at.z - off.z), moving: false, e } : { x: st.x, z: st.z, yaw, moving: false, e };
  }

  /**
   * Walls render beyond their grid footprint, so a stand within STAND_WALL_M of a covered cell, or within
   * DOOR_KEEP_M of a door, moves to the nearest clear place.
   * @param {string} id
   * @param {any} spot
   * @param {{ x: number, z: number }} st
   * @returns {{ x: number, z: number } | null}
   */
  _offWall(id, spot, st) {
    const door = spot?.kind === 'door';
    const bad = (x, z) => !this._wide.holds(x, z) || (door && Math.hypot(x - spot.x, z - spot.z) < DOOR_KEEP_M);
    if (!bad(st.x, st.z)) return null;
    const kept = this._offKept.get(id);
    if (kept && kept.ix === st.x && kept.iz === st.z) return kept.out;
    const out0 = Math.atan2(st.x - spot.x, st.z - spot.z);
    /** @type {{ x: number, z: number } | null} */ let found = null;
    for (let r = 0.2; r <= 3.2 && !found; r += 0.2) {
      for (let j = 0; j < 16 && !found; j++) {
        const a = out0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * (Math.PI / 8);
        const x = st.x + Math.sin(a) * r, z = st.z + Math.cos(a) * r;
        if (!bad(x, z) && this._street.clear(st.x, st.z, x, z)) found = { x, z };
      }
    }
    if (this._offKept.size > 4000) this._offKept.clear();
    this._offKept.set(id, { ix: st.x, iz: st.z, out: /** @type {any} */ (found) });
    return found;
  }

  /**
   * @param {any} line
   * @param {number} s
   * @returns {{ x: number, z: number, yaw: number }}
   */
  _atShoulder(line, s) {
    const p = pointOnLine(line, s);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    for (const side of [PAIR_SIDE_M, -PAIR_SIDE_M]) {
      const x = p.x + rx * side, z = p.z + rz * side;
      if (this._street.holds(x, z)) return { x, z, yaw: p.yaw };
    }
    const b = pointOnLine(line, Math.max(0, s - PAIR_BEHIND_M));
    return { x: b.x, z: b.z, yaw: p.yaw };
  }

  /**
   * File order comes from the whole census and visitors, earlier walk first and then lower id, so every reader
   * forms the same company.
   * @param {Resident} res
   * @param {Entry} e
   * @returns {number}
   */
  _fileOf(res, e) {
    if (!e.from) return 0;
    const list = this._walksFrom(this.dayOf(e.t0)).get(e.from.key);
    if (!list) return 0;
    let i = list.findIndex((w) => w.e === e || (w.id === res.id && w.t0 === e.t0));
    if (i < 0) return 0;
    let k = 0;
    while (i > 0 && list[i].t0 - list[i - 1].t0 <= FILE_MIN) { i--; k++; }
    return k;
  }

  /** @param {number} day */
  _walksFrom(day) {
    if (this._departures && this._departures.day !== day) this._departures = swapDay(this._departures, day) ?? this._departures;
    const d = this._departures;
    if (d && d.day === day && d.gen === this._planGen) return d.from;
    /** @type {Map<string, { t0: number, id: string, e: Entry }[]>} */
    const from = new Map();
    for (const res of [...this.peopleOf(day), ...[...this._crewOf.values()].map((c) => c.res)]) {
      for (const e of this.planOf(res, day)) {
        if (e.kind !== 'walk' || e.pair != null || !e.from) continue;
        const list = from.get(e.from.key) ?? [];
        list.push({ t0: e.t0, id: res.id, e });
        from.set(e.from.key, list);
      }
    }
    for (const list of from.values()) list.sort((a, b) => a.t0 - b.t0 || (a.id < b.id ? -1 : 1));
    this._departures = { day, gen: this._planGen, from, other: besideDay(this._departures, day) };
    return from;
  }

  _rowOf(res) { return this.pool.find((r) => r.res === res) ?? null; }

  _freeRow() {
    for (const r of this.pool) if (!r.active && !r.res) return r;
    if (this.pool.length >= this.maxPopulation) return null;
    const row = { person: this.o.makePerson(this.residents[0]?.archive ?? 0, false), active: false, scheduleEnable: false, scheduleRecycle: false, visible: false, res: null, mine: true, arrival: false, paused: false };
    this.pool.push(row);
    return row;
  }

  _dress(row, res) {
    const p = row.person;
    p.setIdentity(res.archive, res.guard);
    p.gender = res.gender;
    p.nameNPC = res.name;
    p.personFaceRecordId = res.face;
    p._talkSeed = lwSeed(textSeed(res.id), 0x74616c6b) & 0x7fffffff;
    p.pickpocketAttempted = false;
    p.living = { id: res.id, res, town: this };
    row.res = res;
  }

  _free(row) {
    row.active = false; row.scheduleEnable = false; row.scheduleRecycle = false; row.visible = false; row.arrival = false; row.paused = false; row.flee = null; row.side = 0; row.halt = false;
    if (row.res) this._lag.delete(row.res.id);
    row.res = null;
    if (row.person) row.person.living = null;
  }

  /** @param {Resident} res */
  _take(res) { this._taken.set(res.id, this.dayOf(this._now)); }

  /** @param {Resident} res */
  _away(res) { return this._lent.has(res.id) || this._peerLent.has(res.id); }

  /** @param {Resident} res */
  lend(res) {
    this._lent.add(res.id);
    this._taken.delete(res.id);
    for (const r of this.pool) if (r.res?.id === res.id) this._free(r);
  }

  /** @param {string} id */
  residentOf(id) {
    const day = this.dayOf(this._liveMinute());
    return this.peopleOf(day).find((r) => r.id === id) ?? [...this._crewOf.values()].find((c) => c.res.id === id)?.res ?? null;
  }

  /** @param {Resident} res */
  back(res) { this._lent.delete(res.id); }

  /** @param {ReadonlySet<string>} ids */
  peerLend(ids) {
    this._peerLent = ids;
    if (ids.size) for (const r of this.pool) if (r.res && ids.has(r.res.id)) this._free(r);
  }

  _hidden(dx, dz, viewYaw) { return popAllowChange(dx, dz, viewYaw); }

  /**
   * @param {Row} row
   * @param {any} p
   * @param {readonly number[][] | null} dangers
   * @param {number} dt
   */
  _fright(row, p, dangers, dt) {
    let near = null, best = Infinity;
    for (const d of dangers ?? []) { const m = Math.hypot(d[0] - p.pos[0], d[1] - p.pos[2]); if (m < best) { best = m; near = d; } }
    const run = best < PANIC_M;
    if (run || (row.flee && best < FLEE_WARY_M)) row.flee = { at: near, left: FLEE_HOLD_S, from: row.flee?.from ?? [p.pos[0], p.pos[2]] };
    else if (row.flee && (row.flee.left -= dt) <= 0) row.flee = null;
    if (!row.flee) return null;
    const far = Math.hypot(p.pos[0] - row.flee.from[0], p.pos[2] - row.flee.from[1]) >= FLEE_FAR_M;
    return { at: row.flee.at, run: run && !far };
  }

  /**
   * @param {any} p
   * @param {{ at: number[], run: boolean }} fear
   * @param {number} dt
   */
  _run(p, fear, dt) {
    p.moving = false;
    if (!fear.run) return;
    const away = Math.atan2(p.pos[0] - fear.at[0], p.pos[2] - fear.at[1]), stride = FLEE_SPEED * dt;
    for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, Math.PI / 2, -Math.PI / 2]) {
      const a = away + turn, x = p.pos[0] + Math.sin(a) * stride, z = p.pos[2] + Math.cos(a) * stride;
      if (!this._street.clear(p.pos[0], p.pos[2], x, z)) continue;
      p.pos[0] = x; p.pos[2] = z; p.pos[1] = p.groundY(x, z); p.yaw = a; p.moving = true;
      p.pace = FLEE_SPEED / PERSON_MOVE_SPEED;
      return;
    }
  }

  _tick(playerPos, viewYaw) {
    this._ticking = true; this._roadsMiss = null;
    try { this._tickNow(playerPos, viewYaw); } finally { this._ticking = false; this._roadsMiss = null; }
  }

  _tickNow(playerPos, viewYaw) {
    const t = this._now;
    const day = this.dayOf(t);
    // The watch conversion frees a pool row inline, so an inactive row with a resident means that resident is
    // taken; `lend` undoes the take.
    for (const r of this.pool) if (r.res && !r.active) { this._take(r.res); this._free(r); }
    const roundMin = ROUND_S * this._baseRate();
    // The deal reads the plans, so residents gone from this street alone (taken, struck down, lent) are still dealt
    // and then left out as `absent`. This keeps every reader dealing the same pairs.
    /** @type {Map<string, { who: Resident, t0: number, t1: number }[]>} */
    const presence = new Map();
    /** @type {Map<string, any>} */
    const spotOf = new Map();
    const absent = new Set();
    const alive = [];
    const everyone = [];
    const lent = [];
    const wanted = [];
    /** @type {{ res: Resident, gap: number }[]} */
    const pending = [];
    if (this.o.harbour && !this.places.dock.length && !this._harbourDock) this.dockSpot();
    for (const res of [...this.peopleOf(day), ...this._crewsNow()]) {
      const away = this._away(res);
      if (!away && this._gone(res)) continue;
      if (away) lent.push(res);
      // The lent stay in census order so `_stirOf` and the deal see the same list on every reader.
      everyone.push(res);
      const plan = this.planOf(res, day);
      for (let i = Math.max(0, entryAt(plan, t)); i >= 0 && plan[i].t1 > t - 2 * roundMin; i--) {
        const e = plan[i];
        if (e.t0 > t || e.kind === 'walk' || !isOutdoor(e)) continue;
        const list = presence.get(e.at.key) ?? [];
        list.push({ who: res, t0: e.t0, t1: e.t1 });
        presence.set(e.at.key, list);
        spotOf.set(e.at.key, e.at);
      }
      if (away) continue;
      if (this._taken.get(res.id) === day || this.o.deadAt?.(res, t)) {
        absent.add(res.id);
        const row = this._rowOf(res);
        if (row) this._free(row);
        continue;
      }
      alive.push(res);
    }
    this._inCircle.clear();
    this._circled.clear();
    this._holding.clear();
    this._inStir.clear();
    this._stirAt.clear();
    this._stirVoice.clear();
    for (const res of lent) absent.add(res.id);
    const stirs = this._stirOf(day, everyone);
    for (const key of new Set([...presence.keys(), ...stirs.by.keys()])) {
      const list = presence.get(key) ?? [];
      const round = spotRound(key, t, roundMin);
      const inc = (stirs.by.get(key) ?? []).find((x) => x.round === round.round) ?? null;
      if (list.length < 2 && !inc) continue;
      const spot = spotOf.get(key) ?? stirs.spots.get(key);
      if (inc && inc.members.every((m) => !absent.has(m.id))) {
        const unit = { members: inc.members, seed: inc.seed, start: round.start, end: round.end, from: inc.from };
        const keeps = inc.members[inc.anchor].id;
        inc.members.forEach((m, i) => this._inStir.set(m.id, { inc, pair: unit, spot, other: inc.members[1 - i].id, keeps }));
        if (inc.guard && !absent.has(inc.guard.id)) this._stirVoice.set(inc.guard.id, inc);
      }
      const now = spotCircles(key, list, t, roundMin);
      if (!now.length) continue;
      /** @type {Map<string, { x: number, z: number }>} */
      const stood = new Map();
      const before = spotCircles(key, list, now[0].start - 1e-6, roundMin);
      circlesStands(spot, before, this._street).forEach((places, ci) => places.forEach((st, i) => stood.set(before[ci].members[i].id, st)));
      const inInc = (/** @type {string} */ id) => !!inc && inc.members.some((m) => m.id === id);
      const laid = circlesStands(spot, now, this._street);
      // Every place the deal lays stays taken, including places of struck-down and lent members, so a local absence
      // never frees a place for people standing alone on this reader.
      this._circled.set(key, laid.flat());
      for (const [ci, dealt] of now.entries()) {
        const places = laid[ci];
        let far = 0;
        dealt.members.forEach((m, i) => { if (inInc(m.id)) return; const was = stood.get(m.id) ?? aloneStand(spot, m.id, this._street); far = Math.max(far, Math.hypot(places[i].x - was.x, places[i].z - was.z)); });
        const from = dealt.start + (far / PERSON_MOVE_SPEED + GATHER_BEAT_S) * this._baseRate();
        const members = dealt.members.filter((m) => !absent.has(m.id) && !inInc(m.id));
        dealt.members.forEach((m, i) => { if (!inInc(m.id) && (members.length < 2 || !members.includes(m))) this._holding.set(m.id, { spot, ...places[i] }); });
        if (members.length < 2) continue;
        const circle = { ...dealt, members, from };
        dealt.members.forEach((m, i) => { if (!absent.has(m.id) && !inInc(m.id)) this._inCircle.set(m.id, { circle, place: places[i], spot }); });
      }
    }
    this._spaceAlone(everyone, t);
    for (const [id, x] of this._inStir) {
      if (x.inc.members[0].id !== id || !stirLoud(x.inc, t)) continue;
      const a = this._aloneAt.get(id), b = this._aloneAt.get(x.other);
      if (a?.spot === x.spot && b?.spot === x.spot) this._stirAt.set(x.spot.key, { inc: x.inc, mid: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 } });
    }
    // Stands are read after this beat's deal above; reading them first places an arriving street by the last beat's
    // circles.
    for (const res of alive) {
      const at = this.entryOf(res, t);
      if (!at) continue;
      const w = this.where(res, t, false);
      if (!w) continue;
      if (w.pending) { const gap = walkGap(w.e, playerPos); if (gap < LIVING_RANGE + WALK_STRAY_M) pending.push({ res, gap }); continue; }
      const d = Math.hypot(w.x - playerPos[0], w.z - playerPos[2]);
      if (d < LIVING_RANGE) wanted.push({ res, d });
    }
    // Unsearched walks that may pass near the player are searched here, because only a row on the street searches
    // its own walk.
    if (pending.length) {
      pending.sort((a, b) => a.gap - b.gap || (a.res.id < b.res.id ? -1 : 1));
      this._paths.budget(this._standing() ? ARRIVAL_PATHS_PER_FRAME : CENSUS_PATHS);
      for (const { res } of pending) {
        const w = this.where(res, t, true);
        if (!w || w.pending) continue;
        const d = Math.hypot(w.x - playerPos[0], w.z - playerPos[2]);
        if (d < LIVING_RANGE) wanted.push({ res, d });
      }
    }
    const keep = keepUnits(wanted, (id) => this._inCircle.get(id)?.circle ?? this._inStir.get(id)?.pair, this.maxPopulation);
    for (const r of this.pool) if (r.active && r.res) r.scheduleRecycle = !keep.has(r.res);
    if (this.o.suppressSpawns?.()) return;
    for (const res of keep) {
      if (this._rowOf(res)) continue;
      const row = this._freeRow();
      if (!row) break;
      this._dress(row, res);
      row.active = true; row.scheduleEnable = true; row.visible = false; row.scheduleRecycle = false;
      row.arrival = this._standing();
    }
  }

  /**
   * Incidents are dealt over everyone the plans place except `o.extraPeople`, which other readers lack, so every
   * reader deals the same incidents.
   * @param {number} day
   * @param {readonly Resident[]} everyone
   * @returns {{ by: Map<string, import('./stir.js').Incident[]>, spots: Map<string, any> }}
   */
  _stirOf(day, everyone) {
    const rate = this._baseRate();
    const extra = this.o.extraPeople?.(day, this);
    const beyond = extra?.length ? new Set(extra.map((r) => r.id)) : null;
    const dealt = beyond ? everyone.filter((r) => !beyond.has(r.id)) : everyone;
    const sig = textSeed(dealt.map((r) => r.id).join(','));
    const kept = this._stirDays.get(day);
    if (kept && kept.sig === sig && kept.rate === rate && kept.gen === this._planGen) return kept;
    /** @type {Map<string, import('./stir.js').SpotStay[]>} */
    const stays = new Map();
    /** @type {Map<string, any>} */
    const spots = new Map();
    for (const res of dealt) {
      for (const e of this.planOf(res, day)) {
        if (e.kind === 'walk' || !isOutdoor(e) || !e.at?.key) continue;
        const list = stays.get(e.at.key) ?? [];
        list.push({ who: res, kind: e.kind, t0: e.t0, t1: e.t1, duty: !!e.duty, pair: e.pair ?? null });
        stays.set(e.at.key, list);
        spots.set(e.at.key, e.at);
      }
    }
    /** @type {Map<string, import('./stir.js').Incident[]>} */
    const by = new Map();
    for (const [key, list] of stays) {
      const got = spotIncidents(key, list, day, this.o.town.mapId, lineMinutes(rate), rate);
      if (got.length) by.set(key, got);
    }
    const got = { sig, rate, gen: this._planGen, by, spots };
    this._stirDays.set(day, got);
    for (const d of this._stirDays.keys()) if (d < day - 1) this._stirDays.delete(d);
    return got;
  }

  /**
   * Placed by the plans alone, first bound for the spot first and then lower id, so every reader places alike and
   * no newcomer takes an earlier arrival's place.
   * @param {readonly Resident[]} everyone
   * @param {number} t
   */
  _spaceAlone(everyone, t) {
    /** @type {Map<string, { spot: any, who: { id: string, t0: number }[] }>} */
    const at = new Map();
    for (const res of everyone) {
      const plan = this.planOf(res, this.dayOf(t)), i = entryAt(plan, t);
      if (i < 0) continue;
      const e = plan[i].kind === 'walk' ? plan[i + 1] : plan[i];
      if (!e) continue;
      if (e.kind === 'walk' || !isOutdoor(e) || !e.at) continue;
      if (this._inCircle.get(res.id)?.spot === e.at || this._holding.get(res.id)?.spot === e.at) continue;
      let j = i;
      if (plan[j].kind !== 'walk') {
        while (j > 0 && plan[j - 1].at === e.at && plan[j - 1].kind !== 'walk' && isOutdoor(plan[j - 1])) j--;
        if (j > 0 && plan[j - 1].kind === 'walk' && plan[j - 1].to === e.at) j--;
      }
      const since = plan[j].t0;
      const k = e.at.key, list = at.get(k) ?? { spot: e.at, who: [] };
      list.who.push({ id: res.id, t0: since });
      at.set(k, list);
    }
    const circled = this._circled;
    /** @type {Map<string, Map<string, string>>} */
    const beside = new Map();
    for (const [id, x] of this._inStir) {
      if (id === x.keeps) continue;
      const m = beside.get(x.spot.key) ?? new Map();
      m.set(id, x.keeps);
      beside.set(x.spot.key, m);
    }
    this._aloneAt.clear();
    for (const [id, h] of this._holding) this._aloneAt.set(id, h);
    for (const [k, { spot, who }] of at) {
      who.sort((a, b) => a.t0 - b.t0 || (a.id < b.id ? -1 : 1));
      const ids = who.map((w) => w.id), taken = circled.get(k) ?? [], by = beside.get(k) ?? null;
      const sig = `${ids.join(',')}|${taken.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(';')}|${by ? [...by].map(([a, b]) => `${a}>${b}`).join(',') : ''}`;
      let kept = this._aloneKeep.get(k);
      if (!kept || kept.sig !== sig) this._aloneKeep.set(k, kept = { sig, got: aloneStands(spot, ids, taken, this._street, by) });
      for (const [id, st] of kept.got) this._aloneAt.set(id, { spot, ...st });
    }
    for (const k of this._aloneKeep.keys()) if (!at.has(k)) this._aloneKeep.delete(k);
  }

  // Prefers the clock because `_now` stops while the street is still: it holds the minute the player went in, or 0
  // after loading indoors.
  _liveMinute() { return this.o.clock?.() ?? this._now; }

  _standing() { return this._realNow <= this._arrivalUntil; }

  _baseRate() { return PERSON_MOVE_SPEED / Math.max(1e-6, this.o.mpm); }

  /**
   * @param {number} dt
   * @param {number[]} playerPos
   * @param {number} viewYaw
   * @param {number[]} cameraPos
   * @param {boolean} _isDay
   * @param {(person: any) => boolean} [wantsToStopFn]
   */
  update(dt, playerPos, viewYaw, cameraPos, _isDay, wantsToStopFn = () => false) {
    this._now = this.o.clock();
    this._realNow += dt;
    this._timer += dt;
    const stepped = this._lastPlayer ? Math.hypot(playerPos[0] - this._lastPlayer[0], playerPos[2] - this._lastPlayer[2]) : 0;
    this._arriving = this._lastClock === null || Math.abs(this._now - this._lastClock) > ARRIVAL_JUMP_MIN || stepped > ARRIVAL_STEP_M;
    this._lastClock = this._now;
    this._lastPlayer = [playerPos[0], playerPos[1], playerPos[2]];
    if (this._arriving) { this._timer = LIVING_TICK_S; this._arrivalUntil = this._realNow + ARRIVAL_SHOW_S; }
    const standing = this._standing();
    this._paths.cells(standing ? ARRIVAL_PATH_CELLS : PATH_CELLS);
    if (this._timer >= LIVING_TICK_S) { this._timer = 0; this._tick(playerPos, viewYaw); }
    this._paths.budget(standing && this.pool.some((r) => r.arrival) ? ARRIVAL_PATHS_PER_FRAME : PATHS_PER_FRAME);
    const rate = this.o.rate();
    const scale = Math.max(1, rate / this._baseRate());
    const out = this._live;
    out.length = 0;
    const seats = this._rows;
    this._onStreet = true;
    const dangers = this.o.dangers?.() ?? null;
    for (const row of this.pool) {
      if (!row.active || !row.res) continue;
      const res = row.res, p = row.person;
      const fear = row.visible ? this._fright(row, p, dangers, dt) : null;
      const stop = row.visible && dt > 0 && !fear ? !!wantsToStopFn(p) : false;
      p.pace = 1;
      let lag = this._lag.get(res.id) ?? 0;
      if (stop || row.paused || fear) lag += dt * rate;
      else if (lag > 0) lag = Math.max(0, lag - dt * rate * CATCH_UP);
      const w = this.where(res, this._now - lag, true);
      if (!w) { this._free(row); continue; }
      if (w.e.kind !== 'walk') lag = 0;
      if (lag > 0) this._lag.set(res.id, lag); else this._lag.delete(res.id);
      row.paused = !!w.pending && row.visible;
      row.halt = stop || row.paused;
      if (fear) this._run(p, fear, dt);
      else if (w.pending) { if (!row.visible) continue; p.moving = false; }
      else {
        const d0 = Math.hypot(w.x - p.pos[0], w.z - p.pos[2]);
        const step = PERSON_MOVE_SPEED * WALK_FAST * dt * scale;
        if (!row.visible || d0 > Math.max(SNAP_M, step * 3)) { p.pos[0] = w.x; p.pos[2] = w.z; p.yaw = w.yaw; p.moving = w.moving; row.side = 0; }
        else if (stop) p.moving = false;
        else {
          const g = this._dodge(row, p, w, dt);
          const dx0 = g.x - p.pos[0], dz0 = g.z - p.pos[2];
          const d = Math.hypot(dx0, dz0);
          if (d > 0.05) {
            let vx = dx0, vz = dz0, vd = d;
            if (!w.moving) {
              const ox = w.e.at.x - p.pos[0], oz = w.e.at.z - p.pos[2], od = Math.hypot(ox, oz);
              if (od > 0.05 && !this._street.clear(p.pos[0], p.pos[2], g.x, g.z)) { vx = ox; vz = oz; vd = od; }
            }
            const k = Math.min(1, step / vd);
            p.pos[0] += vx * k; p.pos[2] += vz * k;
            p.yaw = w.moving ? w.yaw : Math.atan2(vx, vz);
            p.moving = true;
          } else { p.pos[0] = g.x; p.pos[2] = g.z; p.yaw = w.yaw; p.moving = w.moving; }
        }
        p.pos[1] = p.groundY(p.pos[0], p.pos[2]);
      }
      const dx = p.pos[0] - playerPos[0], dz = p.pos[2] - playerPos[2];
      const dist = Math.hypot(dx, dz);
      const allowChange = this._hidden(dx, dz, viewYaw);
      if (res.guard && p.guard !== !!w.e.duty && (!row.visible || allowChange)) p.setIdentity(w.e.duty ? res.archive : (res.civvies ?? res.archive), !!w.e.duty);
      const cls = townClassOf(res);
      if ((cls ?? null) !== (p.cls ?? null) && typeof p.arm === 'function' && (!row.visible || allowChange)) { if (cls == null) p.arm(null); else { const look = this.o.armOf?.(cls === res.cls ? res : { ...res, cls }) ?? null; if (look) p.arm(look); } }
      if (typeof p.still === 'function') {
        const role = !p.moving && this._inCircle.get(res.id)?.spot !== w.e.at && !(this._stirring(res.id) && this._inStir.get(res.id)?.spot === w.e.at) ? stillRoleOf(res, w.e) : null;
        const want = role ? stillFlatOf(res, role) : null;
        const has = p.stillLook;
        // Two roles can share one flat, so the role is compared along with the archive and record.
        if ((want?.archive ?? -1) !== (has?.archive ?? -1) || (want?.record ?? -1) !== (has?.record ?? -1) || (want && (p.stillRole ?? null) !== role)) {
          if (!want) p.still(null);
          else if (!row.visible || allowChange) { const look = this.o.flatOf?.(want) ?? null; if (look) p.still(look, role); }
        }
      }
      if (row.scheduleRecycle && allowChange) { this._free(row); continue; }
      if (row.scheduleEnable && !w.pending && (allowChange || w.fromDoor || (row.arrival && standing))) { row.scheduleEnable = false; row.visible = true; row.arrival = false; }
      if (!row.visible) continue;
      const frameOut = p.update(dt, cameraPos, stop);
      const seat = seats[out.length] ??= { person: null, out: null };
      seat.person = p; seat.out = frameOut;
      out.push(seat);
      if (dt > 0 && !fear) this._greet(res, p, dist, stop);
    }
    this._onStreet = false;
    this._paths.run();
    return out;
  }

  /**
   * Sides are tried nearest first with right before left, so two walkers meeting head-on both keep right; the step
   * aside is local and never touches the shared plans.
   * @param {Row} row
   * @param {any} p
   * @param {{ x: number, z: number, yaw: number, moving: boolean }} w
   * @param {number} dt
   * @returns {{ x: number, z: number }}
   */
  _dodge(row, p, w, dt) {
    const tx = w.x, tz = w.z;
    const toX = tx - p.pos[0], toZ = tz - p.pos[2];
    const yaw = w.moving ? w.yaw : Math.atan2(toX, toZ);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const cur = row.side ?? 0;
    let want = row.halt ? cur : 0;
    if (!row.halt && (w.moving || Math.hypot(toX, toZ) > DODGE_SETTLE_M)) {
      const far = Math.max(...DODGE_SIDES) + SPACE_M;
      const back = Math.min(0, -toX * fx - toZ * fz) - SPACE_M;
      /** @type {number[]} */
      const inWay = [];
      for (const o of this.pool) {
        if (o === row || !o.active || !o.visible || !o.res) continue;
        const q = o.person, dx = q.pos[0] - tx, dz = q.pos[2] - tz;
        const a = dx * fx + dz * fz, s = dx * rx + dz * rz;
        if (a < back || a > DODGE_AHEAD_M || Math.abs(s) > far) continue;
        if (q.moving && !o.halt && Math.sin(q.yaw) * fx + Math.cos(q.yaw) * fz > 0.7 && (a > SPACE_M || o.res.id > row.res.id)) continue;
        inWay.push(s);
      }
      if (inWay.length) {
        want = cur;
        for (const c of [...DODGE_SIDES].sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur) || b - a)) {
          if (inWay.every((s) => Math.abs(s - c) >= SPACE_M - SPACE_EPS) && this._street.holds(tx + rx * c, tz + rz * c)) { want = c; break; }
        }
      }
    }
    let side = cur + Math.max(-DODGE_SPEED * dt, Math.min(DODGE_SPEED * dt, want - cur));
    if (side !== 0 && !this._street.holds(tx + rx * side, tz + rz * side)) side = 0;
    row.side = side;
    return { x: tx + rx * side, z: tz + rz * side };
  }

  _greet(res, person, dist, stopped) {
    if (dist > GREET_RANGE || this._inCircle.has(res.id) || this._stirring(res.id)) return;
    const last = this._greeted.get(res.id);
    // The `_now >= last.t` check drops the rest after a load moves the clock backward.
    if (last && this._now >= last.t && this._now - last.t < GREET_REST_MIN && (last.said || !stopped)) return;
    const text = this.greetingFor(res, this._now, stopped);
    this._greeted.set(res.id, { t: this._now, said: text != null });
    if (text == null) return;
    this._greetings = this._greetings.filter((g) => g.person !== person && g.until > this._realNow);
    this._greetings.push({ person, text, until: this._realNow + GREET_S });
  }

  /**
   * @param {Resident} res
   * @param {number} t
   * @param {boolean} stopped
   * @returns {string|null}
   */
  greetingFor(res, t, stopped) {
    const rel = this.o.relations?.() ?? null;
    const day = this.dayOf(t);
    const standing = rel ? rel.standing(res.id, day) : 'neutral';
    const cold = standing === 'enemy' || standing === 'hostile';
    const law = !cold && res.guard && this.entryOf(res, t)?.e.duty ? this.o.legalStanding?.(this.o.town.region) ?? null : null;
    const pool = law ? WATCH_GREETINGS[watchBand(law.rep, law.known)] : standing === 'friend' ? LIVING_GREETINGS.friend : cold ? LIVING_GREETINGS.enemy
      : rel?.known(res.id) ? LIVING_GREETINGS.known : LIVING_GREETINGS.stranger;
    const seldom = pool === LIVING_GREETINGS.stranger || pool === WATCH_GREETINGS.citizen;
    if (seldom && !stopped && (lwSeed(textSeed(res.id), Math.floor(t)) % 4) !== 0) return null;
    rel?.seen(res.id, day);
    const deed = pool === LIVING_GREETINGS.stranger ? heardOf(this.reputeAt(t).deeds, lwSeed(textSeed(res.id), Math.floor(t / 7), 0x68656172)) : null;
    const said = deed ? HEARD_GREETINGS[/** @type {keyof typeof HEARD_GREETINGS} */ (reputeKind(deed))] : pool;
    return fillLine(said[lwSeed(textSeed(res.id), Math.floor(t / 7)) % said.length], { player: this.o.playerName?.() ?? '', town: this.o.townName ?? '',
      ...(deed ? { who: deed.kind === 'routed' ? deed.who : firstNameOf(deed.who), foe: deed.foe, place: deed.place } : {}) });
  }

  /**
   * @param {number[]} eye
   * @param {number} [range]
   * @returns {{ person: any, text: string, kind: 'talk'|'shout'|'sing' }[]}
   */
  speech(eye, range = LINE_RANGE) {
    const out = [];
    if (!this.pool.some((row) => row.visible && row.res && !row.flee && !(Math.hypot(row.person.pos[0] - eye[0], row.person.pos[2] - eye[2]) > range))) return out;
    const rate = this._baseRate();
    const lineMin = lineMinutes(rate);
    const ctx = this.lineCtx(this._now);
    const fromTavern = (/** @type {any} */ e) => e.from?.kind === 'door' && this.typeOf(e.from.building) === BUILDING_TYPES.Tavern;
    this._greetings = this._greetings.filter((g) => g.until > this._realNow);
    if (this._scripts.size > 4096) this._scripts.clear();
    const standing = new Set(this.pool.filter((r) => r.visible && r.res && !r.person.moving && !r.flee).map((r) => r.res.id));
    for (const row of this.pool) {
      if (!row.visible || !row.res || row.flee) continue;
      const p = row.person;
      if (Math.hypot(p.pos[0] - eye[0], p.pos[2] - eye[2]) > range) continue;
      const id = row.res.id;
      const c = this._inCircle.get(id);
      const own = this._inStir.get(id)?.inc ?? null;
      const inc = own ?? this._stirVoice.get(id) ?? null;
      if (inc) {
        const line = stirLine(inc, this._now, lineMin, inc.kind === 'gate' || inc.kind === 'challenge' ? { ...ctx, home: this._homeOf(inc.members[1]) } : ctx);
        if (line && line.who.id === id && inc.members.every((m) => standing.has(m.id)) && standing.has(id)) {
          out.push({ person: p, text: line.text, kind: line.loud ? 'shout' : 'talk' });
          continue;
        }
        if (own && this._stirring(id)) continue;
      }
      if (c) {
        if (this._stirAt.has(c.spot.key)) continue;
        const line = circleLine(c.circle, this._now, lineMin, ctx, this._scripts);
        if (line && line.who.id === row.res.id && c.circle.members.every((m) => standing.has(m.id))) out.push({ person: p, text: line.text, kind: /** @type {'talk'} */ ('talk') });
        continue;
      }
      const g = this._greetings.find((x) => x.person === p);
      if (g) { out.push({ person: p, text: g.text, kind: 'talk' }); continue; }
      // A held walker trails its day by its owed minutes, so its entry is read at `_now` less its lag.
      const at = this.entryOf(row.res, this._now - (this._lag.get(id) ?? 0));
      const v = at ? smallVoice(row.res, at.e, this._now, rate, ctx, fromTavern) : null;
      if (v && (v.kind === 'sing' || !p.moving)) out.push({ person: p, text: v.text, kind: v.kind });
    }
    return out;
  }

  /**
   * @param {number} t
   * @returns {{ town?: string, region?: string, weather: string|null, hour: number, news: any[]|null, places: readonly string[]|null, player?: string }}
   */
  lineCtx(t) {
    const hour = Math.floor((((t % DAY_MIN) + DAY_MIN) % DAY_MIN) / 60);
    /** @type {{ town?: string, region?: string, weather: string|null, hour: number, news: any[]|null, places: readonly string[]|null, player?: string }} */
    const ctx = { town: this.o.townName, region: this.o.regionName, weather: this.o.weather?.() ?? null, hour, news: this._roads?.news ?? null, places: this._roads?.places ?? null };
    const deeds = this.deedNews(t);
    if (deeds.length) ctx.news = [...(ctx.news ?? []), ...deeds];
    const kin = this.o.familyNews?.(t) ?? [];
    if (kin.length) ctx.news = [...(ctx.news ?? []), ...kin];
    const chapters = this.chapterNews(t);
    if (chapters.length) ctx.news = [...(ctx.news ?? []), ...chapters];
    const trade = this.econNews(t);
    if (trade.length) ctx.news = [...(ctx.news ?? []), ...trade];
    const carried = this.carriedAt(t);
    if (carried.length) ctx.news = [...(ctx.news ?? []), ...carried];
    ctx.player = this.o.playerName?.() ?? '';
    return ctx;
  }

  /** @param {number} [t] */
  carriedAt(t = this._now) {
    const visits = this._roads ? this.o.carriedOf?.(this._roads.day) : null;
    if (!visits?.length) return [];
    const v = this.o.relations?.()?.turnsVersion?.() ?? 0, m = Math.floor(t);
    const c = this._carriedMemo;
    if (c && c.visits === visits && c.m === m && c.v === v) return c.out;
    const own = [...this._roadNewsAt(t), ...this.deedNews(t)];
    if (this._deedsKept?.v !== v) this._deedsKept = { v, map: new Map() };
    const kept = this._deedsKept.map, region = this.o.town.region ?? null;
    const deedsAt = (/** @type {any} */ town, /** @type {number} */ minute) => {
      const k = `${town.mapId >>> 0}:${minute}`;
      let d = kept.get(k);
      if (!d) {
        // Routed and held tales of this town's own region are already its own news, so carried copies are dropped.
        d = this.deedNews(minute, town).filter((x) => !((x.kind === 'routed' || x.kind === 'held') && region != null && town.region === region));
        if (kept.size > 4096) kept.clear();
        kept.set(k, d);
      }
      return d;
    };
    const out = carriedNews(visits, t, { own, deedsAt, here: this.o.town.mapId });
    this._carriedMemo = { visits, m, v, out };
    return out;
  }

  /**
   * The day's road news is read whole at noon, so items timed after `t` are filtered out until their minute.
   * @param {number} t
   */
  _roadNewsAt(t) {
    const news = this._roads?.news ?? [];
    return news.every((n) => n.t <= t) ? news : news.filter((n) => n.t <= t);
  }

  /** @param {number} [t] */
  reputeAt(t = this._now) {
    const repute = reputeOf([...this._roadNewsAt(t), ...this.deedNews(t), ...this.carriedAt(t)]);
    repute.regard = Math.min(100, repute.regard + Number(tavernProgress().cities[String(this.o.town.mapId)] ?? 0));
    return repute;
  }

  /**
   * @param {number} seed
   * @param {number} t
   */
  patronOfSale(seed, t) {
    const place = patronOf(seed, this.residents);
    return place ? this._householdsOf(this.dayOf(t) + PATRON_DELAY_DAYS).get(place.id) ?? null : null;
  }

  /**
   * @param {Resident} res
   * @param {number} [t]
   */
  regardOf(res, t = this._now) {
    const rel = this.o.relations?.();
    return regardWithRepute(!!rel?.known(res.id), rel?.regard(res.id, this.dayOf(t)) ?? 0, this.reputeAt(t).regard);
  }

  talkBeat() {
    return { roundMin: ROUND_S * this._baseRate(), lineMin: lineMinutes(this._baseRate()) };
  }

  /** @param {number} key */
  typeOf(key) {
    return this.places.types.get(key) ?? -1;
  }

  retire(person) {
    for (const r of this.pool) {
      if (r.person !== person) continue;
      if (r.res) this._take(r.res);
      this._free(r);
      return true;
    }
    return false;
  }

  talked(person) {
    const id = person?.living?.id;
    if (!id) return null;
    this.o.relations?.()?.note(id, 'talk', this.dayOf(this._liveMinute()));
    return id;
  }

  caught(person) {
    const id = person?.living?.id;
    if (!id) return null;
    const day = this.dayOf(this._now);
    const rel = this.o.relations?.();
    rel?.note(id, 'crime', day);
    for (const w of this.witnesses(person.pos, id)) rel?.note(w.id, 'crime', day);
    return id;
  }

  /**
   * @param {number[]|null|undefined} at
   * @param {string|null} [exceptId]
   * @returns {Resident[]}
   */
  witnesses(at, exceptId = null) {
    if (!at) return [];
    const out = [];
    for (const row of this.pool) {
      if (!row.visible || !row.res || row.res.id === exceptId) continue;
      const p = row.person.pos;
      if (Math.hypot(p[0] - at[0], p[2] - at[2]) > WITNESS_M) continue;
      if (this.o.sees && !this.o.sees([p[0], p[1] + 1.6, p[2]], [at[0], at[1] + 1, at[2]])) continue;
      out.push(row.res);
    }
    return out;
  }

  /**
   * @param {Resident} res
   * @returns {Resident[]}
   */
  kinOf(res) {
    const day = this.dayOf(this._now);
    const visit = this._roads?.visitorOf.get(res.id) ?? null;
    if (visit) return visit.trip.party.filter((m) => m.id !== res.id);
    const crew = this._crewOf.get(res.id) ?? null;
    if (crew) return [...this._crewOf.values()].filter((c) => c.res.id !== res.id && c.berth?.lane?.key === crew.berth?.lane?.key && c.berth?.k === crew.berth?.k).map((c) => c.res);
    const hh = householdKeyOf(res);
    if (hh == null) return [];
    return this.peopleOf(day).filter((r) => r.id !== res.id && householdKeyOf(r) === hh);
  }

  slain(person) {
    const res = person?.living?.res;
    if (!res || person.living.town !== this) return null;
    const day = this.dayOf(this._now);
    const rel = this.o.relations?.();
    const seen = this.witnesses(person.pos, res.id);
    this.o.slay?.(res, this._now, seen.length > 0);
    for (const kin of this.kinOf(res)) rel?.note(kin.id, 'slain', day);
    for (const w of seen) rel?.note(w.id, 'crime', day);
    this._lent.delete(res.id);
    this._take(res);
    return res.id;
  }

  killed(person) {
    const res = person?.living?.res;
    if (!res || person.living.town !== this) return null;
    this.o.killed?.(res, this._now);
    this._lent.delete(res.id);
    this._take(res);
    return res.id;
  }

  struck(person) {
    const res = person?.living?.res;
    if (!res || person.living.town !== this) return null;
    const day = this.dayOf(this._now);
    const rel = this.o.relations?.();
    rel?.note(res.id, 'struck', day);
    for (const w of this.witnesses(person.pos, res.id)) rel?.note(w.id, 'crime', day);
    return res.id;
  }

  /**
   * @param {any} person
   * @param {number} taste
   */
  toned(person, taste) {
    const id = person?.living?.id;
    const kind = taste > 0 ? 'polite' : taste < 0 ? 'insulted' : null;
    if (!id || !kind) return null;
    this.o.relations?.()?.note(id, kind, this.dayOf(this._liveMinute()));
    return id;
  }

  /**
   * @param {number} [t]
   * @param {{ mapId: number, region?: number }} [town]
   * @returns {{ kind: string, who: string, foe: string, place: string, t: number, seen: boolean, watch?: boolean }[]}
   */
  deedNews(t = this._now, town = this.o.town) {
    const turns = this.o.relations?.()?.turns?.();
    if (!turns || (!turns.slain?.size && !turns.died?.size && !turns.killed?.size && !turns.home?.size && !turns.routed?.size && !turns.held?.size)) return [];
    const prefix = `L${town.mapId >>> 0}.`;
    const out = [];
    for (const kind of /** @type {const} */ (['slain', 'died', 'killed'])) {
      for (const [key, h] of turns[kind] ?? []) {
        const known = h.t + DEED_KNOWN_MIN;
        if (!key.startsWith(prefix) || !(known <= t && t - known < NEWS_DAYS * DAY_MIN)) continue;
        const place = key.slice(0, key.lastIndexOf('@'));
        const res = this.residents.find((r) => placeKeyOf(r) === place);
        const who = h.who || res?.name || '';
        if (who) out.push({ kind, who, foe: '', place: '', t: known, seen: !!h.seen, watch: !!res?.guard });
      }
    }
    for (const [key, h] of turns.home ?? []) {
      const known = h.t + DEED_KNOWN_MIN;
      if (!key.startsWith(prefix) || known > t || t - known >= NEWS_DAYS * DAY_MIN || !h.who) continue;
      out.push({ kind: 'home', who: h.who, foe: '', place: '', t: known, seen: true });
    }
    const region = `O${(town.region ?? -1) >>> 0}.`;
    for (const [key, h] of turns.routed ?? []) {
      const known = h.t + DEED_KNOWN_MIN;
      if (!key.startsWith(region) || known > t || t - known >= NEWS_DAYS * DAY_MIN || !h.who) continue;
      out.push({ kind: 'routed', who: h.who, foe: '', place: '', t: known, seen: true });
    }
    const charged = `R${(town.region ?? -1) >>> 0}.`;
    for (const [key, h] of turns.held ?? []) {
      const known = h.t + DEED_KNOWN_MIN;
      if (!key.startsWith(charged) || known > t || t - known >= NEWS_DAYS * DAY_MIN || !h.who) continue;
      out.push({ kind: 'held', who: h.who, foe: '', place: '', t: known, seen: true });
    }
    return out.sort((a, b) => b.t - a.t);
  }

  /**
   * @param {any} person
   * @returns {string[]|null}
   */
  moment(person) {
    const res = person?.living?.res;
    if (!res || res.household != null) return null;
    const item = keepsakeFor(this.o.keepsakes?.() ?? [], res.town, res.home, res.id, (id) => this._homeOfPlace(id));
    if (!item) return null;
    this.o.takeKeepsake?.(item);
    const rel = this.o.relations?.();
    const now = this.o.clock?.() ?? this._now;
    const day = this.dayOf(now);
    rel?.note(res.id, 'saved', day);
    // Home keys repeat across towns, so kin are filtered to the resident's own town.
    for (const k of this.kinOf(res)) if (k.town === res.town) rel?.note(k.id, 'helped', day);
    rel?.turn('home', `${item.livingKeepsake.id}@home`, { t: now, who: item.livingKeepsake.name });
    const words = LIVING_KEEPSAKE[lwSeed(textSeed(res.id), textSeed(item.livingKeepsake.id)) % LIVING_KEEPSAKE.length];
    return words.map((w) => fillLine(w, { who: firstNameOf(item.livingKeepsake.name), player: this.o.playerName?.() ?? '' }));
  }

  /** @param {string} id */
  _homeOfPlace(id) {
    const place = String(id ?? '').split('~')[0];
    return this.residents.find((r) => r.id === place)?.home ?? null;
  }

  regardCard(person) {
    const id = person?.living?.id;
    const rel = this.o.relations?.();
    if (!id || !rel) return null;
    const day = this.dayOf(this._liveMinute());
    return { regard: rel.regard(id, day), standing: rel.standing(id, day) };
  }

  refuses(person) {
    const id = person?.living?.id;
    const rel = this.o.relations?.();
    if (!id || !rel) return null;
    const s = rel.standing(id, this.dayOf(this._liveMinute()));
    return s === 'enemy' || s === 'hostile' ? fillLine(LIVING_REFUSAL, { a: firstNameOf(person.nameNPC) }) : null;
  }
}
