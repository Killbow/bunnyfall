// @ts-check
import { partiesOfTown, partyAt, wayAt, laneAt, membersAt, remainsOfTown, NATIVE_PER_M, NATIVE_PIXEL, TRIP_REACH_PX } from './trips.js';
import { ENEMY_BASICS } from '../../characters/enemyBasics.js';
import { circleLine, lineMinutes, ROUND_S } from './meetups.js';
import { ROAD_GREETINGS, ROAD_PASS_SCRIPTS, ROAD_PASS_WARNINGS, BAND_WARNINGS, COMPANY_GREETINGS, fillLine, firstNameOf } from './lines.js';
import { byRole, headOf, companiesOf, namedIn } from './companies.js';
import { FIRE_FLAT } from '../survival/camp.js';
import { teamOf, trainOf, campTeam, campTurn, clearOfTeam, fileSpan, LANE_N } from './wagons.js';
import { lwSeed, textSeed } from './seed.js';
import { DAY_MIN, DAY_START_MIN } from './dayPlan.js';
import { LIVING_REFUSAL } from './livingTown.js';
import { TRAVELLER_FAR_M } from '../../world/travellerSprites.js';

export const ROADS_TICK_S = 1;
export const ROADS_PLAY_M = 360;
export const ROADS_VIEW_PX = 6;
export const ROADS_TOWNS_PER_FRAME = 12;
export const ROADS_JUMP_PX = 2;
export const FILE_GAP_N = 72;
export const FILE_SIDE_N = 22;
export const CAMP_RING_N = 90;
export const ROAD_GREET_M = 4;
export const ROAD_GREET_REST_MIN = 120;
export const ROAD_GREET_S = 3.4;
export const FIGHT_RING_N = 64;
export const FOE_RING_N = 190;
export const STRIKE_S = 1.3;
export const corpseLook = () => ENEMY_BASICS[128].corpseTexture;
export const CAMP_SHARE_N = 2400;
export const PASS_N = 1000;
export const CAMP_RING_STEP_N = 14;
export const WAGON_FRONT_N = 60;
export const ABREAST_N = 120;
export const ABREAST_GAP_N = 80;
export const ABREAST_EASE_N = 240;

/**
 * @param {any} trip
 * @param {string} [home]
 * @param {string} [beset]
 */
export function partyLabel(trip, home = '', beset = '') {
  const to = trip.to?.name ?? '';
  const n = trip.party?.length ?? 1;
  const bound = ROAD_LABELS[trip.kind]?.(n) ?? (trip.kind === 'merchant' ? 'Caravan' : trip.kind === 'pilgrim' ? (n > 1 ? 'Pilgrims' : 'Pilgrim')
    : trip.kind === 'courier' ? 'Courier' : trip.kind === 'adventurer' ? (n > 1 ? 'Adventurers' : 'Adventurer') : (n > 1 ? 'Travellers' : 'Pedlar'));
  if (trip.company) return beset ? `${trip.company.name} beset by ${beset}` : to ? `${trip.company.name}, to ${to}` : trip.company.name;
  if (beset) return `${bound} beset by ${beset}`;
  if (trip.robbed) return to ? `${bound} to ${to} (robbed)` : `${bound} (robbed)`;
  if (trip.wild) return `${bound} in the wild`;
  if (trip.market && to) return `${bound} to ${to}'s market`;
  return to ? `${bound} to ${to}` : (home ? `${bound} of ${home}` : bound);
}
/** @type {Record<string, (n: number) => string>} */
const ROAD_LABELS = Object.freeze({
  carter: () => 'Farmer', hunter: () => 'Hunter', patrol: () => 'Patrol', noble: () => 'Procession', minstrel: () => 'Minstrel',
});

/**
 * Shared camps change only where members are drawn; no party's trip timeline moves.
 * @param {{ trip: any, at: any, members?: any[] }[]} camped
 * @returns {Map<string, { x: number, z: number, i0: number, n: number, first: boolean, lit: boolean, k0: number, teams: number, turn: number }>}
 */
export function campGroups(camped) {
  const list = [...camped].sort((a, b) => (a.trip.id < b.trip.id ? -1 : a.trip.id > b.trip.id ? 1 : 0));
  /** @type {Map<string, { x: number, z: number, i0: number, n: number, first: boolean, lit: boolean, k0: number, teams: number, turn: number }>} */
  const out = new Map();
  const done = new Set();
  for (const p of list) {
    if (done.has(p.trip.id)) continue;
    const group = [p];
    done.add(p.trip.id);
    for (let i = 0; i < group.length; i++) {
      for (const q of list) {
        if (done.has(q.trip.id)) continue;
        if (Math.hypot(q.at.x - group[i].at.x, q.at.z - group[i].at.z) <= CAMP_SHARE_N) { group.push(q); done.add(q.trip.id); }
      }
    }
    const n = group.reduce((a, g) => a + (g.members?.length ?? g.trip.party.length), 0);
    const lit = group.some((g) => !g.at.halt);
    const teams = group.reduce((a, g) => { const k = teamOf(g.trip); return a + k.wagons + k.packs; }, 0);
    const turn = campTurn(p.trip);
    let i0 = 0, k0 = 0;
    group.forEach((g, gi) => {
      out.set(g.trip.id, { x: p.at.x, z: p.at.z, i0, n, first: gi === 0, lit, k0, teams, turn });
      i0 += g.members?.length ?? g.trip.party.length;
      const k = teamOf(g.trip);
      k0 += k.wagons + k.packs;
    });
  }
  return out;
}

/**
 * @param {{ trip: any, at: any, members: any[] }[]} walking
 * @param {number} [hitchN]
 * @returns {Map<string, number>}
 */
export function roadLanes(walking, hitchN) {
  const list = walking.map((w) => {
    const back = w.at.phase === 'back';
    const p = laneAt(w.trip.way, /** @type {number} */ (w.at.s), 0);
    const yaw = back ? p.yaw + Math.PI : p.yaw;
    return { id: w.trip.id, pace: w.trip.pace ?? 0, x: p.x, z: p.z, fx: Math.sin(yaw), fz: Math.cos(yaw), span: fileSpan(w.trip, w.members.length, hitchN, FILE_GAP_N) };
  });
  const out = new Map();
  for (const a of list) {
    let k = 0;
    for (const b of list) {
      if (b === a) continue;
      const steps = a.pace > b.pace || (a.pace === b.pace && a.id > b.id);
      if (!steps) continue;
      const same = a.fx * b.fx + a.fz * b.fz;
      if (same <= 0) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const along = dx * a.fx + dz * a.fz, across = Math.abs(dx * a.fz - dz * a.fx);
      const gap = Math.max(along - b.span.behind - a.span.ahead, -a.span.behind - (along + b.span.ahead));
      const wAlong = Math.min(1, Math.max(0, (ABREAST_GAP_N + ABREAST_EASE_N - gap) / ABREAST_EASE_N));
      const wAcross = Math.min(1, Math.max(0, (ABREAST_GAP_N + ABREAST_EASE_N / 2 - across) / (ABREAST_EASE_N / 2)));
      k = Math.max(k, wAlong * wAcross * Math.min(1, same * 2));
    }
    out.set(a.id, LANE_N + ABREAST_N * k);
  }
  return out;
}

/**
 * @param {any} trip
 * @param {any} at
 * @param {{ x: number, z: number, n: number, k0: number, teams: number, turn: number } | null} camp
 * @param {number} t
 */
export function campParkOf(trip, at, camp, t) {
  const cx = camp ? camp.x : at.x, cz = camp ? camp.z : at.z;
  const r = camp ? CAMP_RING_N + Math.max(0, camp.n - 4) * CAMP_RING_STEP_N : CAMP_RING_N;
  return campTeam(trip, cx, cz, r, t, camp ? { k0: camp.k0, n: camp.teams, turn: camp.turn } : null);
}

/**
 * @param {{ trip: any, at: any }[]} walking
 * @param {number} t
 * @returns {{ a: any, b: any, script: readonly string[], warned: any }[]}
 */
export function passingPairs(walking, t) {
  const out = [];
  const list = [...walking].sort((a, b) => (a.trip.id < b.trip.id ? -1 : a.trip.id > b.trip.id ? 1 : 0));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z) > PASS_N) continue;
      const seed = lwSeed(textSeed(a.trip.id), textSeed(b.trip.id), 0x70617373);
      const warned = [a, b].find((p) => p.trip.enc && p.trip.enc.t1 <= t && p.trip.enc.foes?.length);
      const pool = warned ? ROAD_PASS_WARNINGS : ROAD_PASS_SCRIPTS;
      const [first, second] = warned === b ? [b, a] : [a, b];
      out.push({ a: first, b: second, script: pool[seed % pool.length], warned: warned ?? null });
    }
  }
  return out;
}

/**
 * @param {any} trip
 * @param {number} m
 */
export function walkingAt(trip, m) {
  const at = partyAt(trip, m);
  return (at.phase === 'out' || at.phase === 'back') && !at.halt && !at.camp && !at.inn && membersAt(trip, m).length ? at : null;
}

/**
 * Derived only from the clock and both trips, so every client hears the same line at `t`; -1 when none is due.
 * @param {{ a: { trip: any }, b: { trip: any }, script: readonly string[] }} pair
 * @param {number} t
 * @param {number} lineMin
 * @returns {number}
 */
export function passingLine(pair, t, lineMin) {
  const near = (/** @type {number} */ m) => {
    const a = walkingAt(pair.a.trip, m), b = walkingAt(pair.b.trip, m);
    return !!a && !!b && Math.hypot(/** @type {number} */ (a.x) - /** @type {number} */ (b.x), /** @type {number} */ (a.z) - /** @type {number} */ (b.z)) <= PASS_N;
  };
  const beat = Math.floor(t / lineMin);
  if (!near(beat * lineMin)) return -1;
  let k = 0;
  while (k < pair.script.length && near((beat - k - 1) * lineMin)) k++;
  return k < pair.script.length ? k : -1;
}

/**
 * @param {any} trip
 * @param {ReturnType<typeof partyAt>} at
 * @param {any[]} members
 * @returns {{ res: any, x: number, z: number, yaw: number, moving: boolean }[]}
 */
export function fightPlaces(trip, at, members) {
  const out = [];
  const n = members.length;
  const turn = (lwSeed(textSeed(trip.id), 0x66696768) % 628) / 100;
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + turn;
    const r = members[i].cls != null ? FIGHT_RING_N : FIGHT_RING_N * 0.4;
    const x = /** @type {number} */ (at.x) + Math.sin(a) * r, z = /** @type {number} */ (at.z) + Math.cos(a) * r;
    out.push({ res: members[i], x, z, yaw: Math.atan2(x - /** @type {number} */ (at.x), z - /** @type {number} */ (at.z)), moving: false });
  }
  return out;
}

/**
 * @param {any} trip
 * @param {ReturnType<typeof partyAt>} at
 * @param {{ wagons: any[], horses: any[] } | null} [team]
 * @returns {{ key: string, res: any, x: number, z: number, yaw: number }[]}
 */
export function foePlaces(trip, at, team = null) {
  const foes = trip.enc?.foes ?? [];
  const turn = (lwSeed(textSeed(trip.id), 0x666f6573) % 628) / 100;
  return foes.map((type, i) => {
    const a = ((i + 0.5) / foes.length) * Math.PI * 2 + turn;
    let x = /** @type {number} */ (at.x) + Math.sin(a) * FOE_RING_N, z = /** @type {number} */ (at.z) + Math.cos(a) * FOE_RING_N;
    if (team) ({ x, z } = clearOfTeam(x, z, team));
    return { key: `${trip.enc.id}:${i}`, res: { id: `${trip.enc.id}:${i}`, cls: type, sex: 'male', name: '' }, x, z, yaw: Math.atan2(/** @type {number} */ (at.x) - x, /** @type {number} */ (at.z) - z) };
  });
}

/**
 * @param {any} trip
 * @param {ReturnType<typeof partyAt>} at
 * @param {any} [ring]
 * @param {number} [lane]
 * @returns {{ res: any, x: number, z: number, yaw: number, moving: boolean }[]}
 */
export function partyPlaces(trip, at, ring = null, lane = 0) {
  const out = [];
  const n = trip.party.length;
  if (ring && at.camp) {
    const r = CAMP_RING_N + Math.max(0, ring.n - 4) * CAMP_RING_STEP_N;
    for (let i = 0; i < n; i++) {
      const a = ((ring.i0 + i) / ring.n) * Math.PI * 2;
      const x = ring.x + Math.sin(a) * r, z = ring.z + Math.cos(a) * r;
      out.push({ res: trip.party[i], x, z, yaw: Math.atan2(ring.x - x, ring.z - z), moving: false });
    }
    return out;
  }
  if (at.camp || at.halt) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (lwSeed(textSeed(trip.id), 0x63616d70) % 628) / 100;
      const x = /** @type {number} */ (at.x) + Math.sin(a) * CAMP_RING_N, z = /** @type {number} */ (at.z) + Math.cos(a) * CAMP_RING_N;
      out.push({ res: trip.party[i], x, z, yaw: Math.atan2(/** @type {number} */ (at.x) - x, /** @type {number} */ (at.z) - z), moving: false });
    }
    return out;
  }
  const back = at.phase === 'back';
  const file = trip.company ? byRole(trip.party) : trip.party;
  for (let i = 0; i < n; i++) {
    const s = /** @type {number} */ (at.s) + (back ? 1 : -1) * i * FILE_GAP_N;
    const p = wayAt(trip.way, s);
    const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * FILE_SIDE_N;
    const q = lane ? laneAt(trip.way, s, (back ? -1 : 1) * lane + side) : { x: p.x + Math.cos(p.yaw) * side, z: p.z - Math.sin(p.yaw) * side, yaw: p.yaw };
    const yaw = back ? q.yaw + Math.PI : q.yaw;
    out.push({ res: file[i], x: q.x, z: q.z, yaw, moving: true });
  }
  return out;
}

/** @param {{ world: import('./trips.js').TripWorld, mpm: number, clock: () => number, baseRate: () => number, sceneOf: (nx: number, nz: number) => number[], here: () => ({ x: number, z: number } | null), sprites: ReturnType<typeof import('../../world/travellerSprites.js').createTravellerSprites>, memo?: Map<string, any>, relations?: () => any, playerName?: () => string, weather?: () => (string|null), foeName?: (type: number, n: number) => string, fights?: ReturnType<typeof import('./roadFights.js').createRoadFights> | null, slay?: (res: any, t: number, seen: boolean) => void, stands?: ReturnType<typeof import('./roadStands.js').createRoadStands> | null, teams?: ReturnType<typeof import('../../world/roadTeams.js').createRoadTeams> | null, robbed?: (tripId: string) => (number | null), unheard?: (t: number) => any, heard?: (band: any) => any, }} deps */
export function createLivingRoads(deps) {
  /** @type {{ trip: any, at: any }[]} */
  let parties = [];
  /** @type {{ key: string, res: any, x: number, z: number, yaw: number, trip: any }[]} */
  let remains = [];
  /** @type {Map<string, number>} */
  const strikes = new Map();
  /** @type {Set<string>} */
  const busy = new Set();
  let timer = Infinity;
  /** @type {{ key: string, res: any, feet: number[], yaw: number, moving: boolean, distM: number, striking?: boolean, talk?: boolean, flat?: { archive: number, record: number } | null, body?: boolean }[]} */
  const list = [];
  /** @type {Map<string, number>} */
  const greeted = new Map();
  /** @type {{ id: string, text: string, until: number }[]} */
  let greetings = [];
  let realNow = 0;
  const memo = deps.memo ?? new Map();
  const dayOf = (t) => Math.floor((t - DAY_START_MIN) / DAY_MIN);
  /** @type {{ towns: any[], i: number, px: number, py: number, parties: any[], remains: any[] } | null} */
  let sweep = null;
  /** @type {number[]|null} */
  let readAt = null;

  /**
   * @param {number} t
   * @param {number} n
   */
  function sweepOn(t, n) {
    const s = /** @type {NonNullable<typeof sweep>} */ (sweep);
    const o = { mpm: deps.mpm, memo };
    for (let k = 0; k < n && s.i < s.towns.length; k++, s.i++) {
      const town = s.towns[s.i];
      const ps = partiesOfTown(town, s.px, s.py, t, deps.world, o, ROADS_VIEW_PX);
      if (ps) for (const p of ps) s.parties.push(p);
      const rs = remainsOfTown(town, s.px, s.py, t, deps.world, o, ROADS_VIEW_PX);
      if (rs) for (const r of rs) s.remains.push(r);
    }
    if (s.i >= s.towns.length) { parties = s.parties; remains = s.remains; readAt = [s.px, s.py]; sweep = null; }
  }

  // Spread over frames to bound its cost; a first read or a jump past `ROADS_JUMP_PX` reads whole at once so the
  // road never fills in view.
  function refresh(t) {
    const here = deps.here();
    if (!here) { parties = []; remains = []; sweep = null; readAt = null; return; }
    const px = Math.floor(here.x / NATIVE_PIXEL), py = 499 - Math.floor(here.z / NATIVE_PIXEL);
    sweep = { towns: deps.world.townsNear(px, py, ROADS_VIEW_PX + TRIP_REACH_PX), i: 0, px, py, parties: [], remains: [] };
    const jumped = !readAt || Math.max(Math.abs(px - readAt[0]), Math.abs(py - readAt[1])) > ROADS_JUMP_PX;
    sweepOn(t, jumped ? Infinity : ROADS_TOWNS_PER_FRAME);
  }

  /** @param {string} key */
  function strikesNow(key) {
    let next = strikes.get(key);
    if (next == null) { next = realNow + ((lwSeed(textSeed(key), 0x7374) % 1000) / 1000) * STRIKE_S; strikes.set(key, next); }
    if (realNow < next) return false;
    strikes.set(key, next + STRIKE_S * (realNow - next > STRIKE_S ? Math.ceil((realNow - next) / STRIKE_S) : 1));
    return true;
  }

  /**
   * @param {number} dt
   * @param {number[]} eye
   * @param {{ overworld?: { grow?: number, blend?: number } | null, ground?: boolean }} [o]
   */
  function frame(dt, eye, { overworld = null, ground = true } = {}) {
    realNow += dt;
    if (!ground) { list.length = 0; deps.sprites.sync(list); return; }
    const t = deps.clock();
    timer += dt;
    if (sweep) sweepOn(t, ROADS_TOWNS_PER_FRAME);
    else if (timer >= ROADS_TICK_S) { timer = 0; refresh(t); }
    const here = deps.here();
    list.length = 0;
    busy.clear();
    const fights = deps.fights ?? null;
    const reach = overworld ? TRAVELLER_FAR_M + 60 : ROADS_PLAY_M;
    const hitchN = deps.teams?.hitchN?.();
    const ats = new Map(parties.map((p) => [p.trip.id, partyAt(p.trip, t)]));
    /** @type {{ trip: any, at: any, members: any[] }[]} */
    const camped = [], walking = [];
    if (here) {
      for (const p of parties) {
        const at = ats.get(p.trip.id);
        if ((at.phase !== 'out' && at.phase !== 'back') || at.inn) continue;
        if (!at.camp && Math.hypot(/** @type {number} */ (at.x) - here.x, /** @type {number} */ (at.z) - here.z) / NATIVE_PER_M > reach + 40) continue;
        const members = membersAt(p.trip, t);
        if (!members.length) continue;
        (at.camp ? camped : walking).push({ trip: p.trip, at, members });
      }
    }
    const groups = campGroups(camped);
    const lanes = roadLanes(walking, hitchN);
    /**
     * @param {any} trip
     * @param {any} at
     * @param {any[]} members
     */
    const teamAt = (trip, at, members) => (at.camp ? campParkOf(trip, at, groups.get(trip.id) ?? null, t) : trainOf(trip, at, members, t, hitchN, lanes.get(trip.id) ?? LANE_N));
    if (fights) {
      fights.frame(parties.map((p) => {
        const at = ats.get(p.trip.id);
        const k = teamOf(p.trip);
        const team = at.fight && k.wagons + k.packs > 0 && (at.phase === 'out' || at.phase === 'back') ? teamAt(p.trip, at, membersAt(p.trip, t)) : null;
        return { trip: p.trip, at, team };
      }), here, t, { ground: !overworld });
    }
    // Each party is laid out once here and the armed go to `deps.stands` from these places, so a spawned body
    // appears where its party is drawn.
    /** @type {{ p: any, at: any, fight: boolean, live: boolean, allies: any, peerLive: boolean, places: { res: any, x: number, z: number, yaw: number, moving: boolean }[], fire: { x: number, z: number } | null, stood: { wagons: any[], horses: any[] } | null }[]} */
    const drawn = [];
    const horses = [], wagons = [];
    if (here) {
      const rate = deps.baseRate?.() ?? 0;
      for (const p of parties) {
        const at = ats.get(p.trip.id);
        if (at.phase !== 'out' && at.phase !== 'back') continue;
        if (at.inn) continue;
        if (Math.hypot(/** @type {number} */ (at.x) - here.x, /** @type {number} */ (at.z) - here.z) / NATIVE_PER_M > reach + 40) continue;
        const members = membersAt(p.trip, t);
        if (!members.length) continue;
        const fight = !!at.fight;
        const live = !!fights?.stood(p.trip.id);
        const allies = live ? fights?.alliesOf(p.trip.id) : null;
        // When a peer runs this fight, its armed arrive as that peer's allies through the stream, so they are not
        // drawn here.
        const peerLive = fight && !live && !!fights && !overworld && fights.peerStands({ x: /** @type {number} */ (at.x), z: /** @type {number} */ (at.z) }, here);
        const camp = groups.get(p.trip.id) ?? null;
        const ring = fight ? null : camp;
        const team = teamOf(p.trip);
        const trip = deps.robbed?.(p.trip.id) != null ? { ...p.trip, robbed: { t: /** @type {number} */ (deps.robbed(p.trip.id)) } } : p.trip;
        const hasTeam = team.wagons + team.packs > 0;
        const speed = (p.trip.pace / NATIVE_PER_M) * rate;
        let places;
        /** @type {{ wagons: any[], horses: any[] } | null} */
        let stood = null;
        if (hasTeam && !at.camp) {
          const train = trainOf(trip, at, members, t, hitchN, lanes.get(p.trip.id) ?? LANE_N);
          stood = train;
          places = fight ? fightPlaces(p.trip, at, members) : train.people;
          for (const h of train.horses) horses.push({ ...h, moving: h.moving && !fight, speed });
          for (const w of train.wagons) wagons.push({ ...w, moving: w.moving && !fight });
        } else {
          places = fight ? fightPlaces(p.trip, at, members) : partyPlaces(members === p.trip.party ? p.trip : { ...p.trip, party: members }, at, ring, lanes.get(p.trip.id) ?? LANE_N);
          if (hasTeam && at.camp) {
            const parked = teamAt(trip, at, members);
            stood = parked;
            for (const h of parked.horses) horses.push({ ...h, speed: 0 });
            wagons.push(...parked.wagons);
          }
        }
        if (fight && stood) places = places.map((m) => ({ ...m, ...clearOfTeam(m.x, m.z, stood) }));
        let fire = null;
        if (camp?.lit && camp.first) {
          fire = { x: camp.x, z: camp.z };
        }
        drawn.push({ p, at, fight, live, allies, peerLive, places, fire, stood });
      }
    }
    if (deps.stands) {
      const cands = [];
      if (here && !overworld) {
        for (const d of drawn) {
          if (d.fight) continue;
          for (const m of d.places) if (m.res.cls != null) cands.push({ res: m.res, trip: d.p.trip, x: m.x, z: m.z, yaw: m.yaw });
        }
      }
      deps.stands.frame(cands, here, t, { dt, ground: !overworld });
    }
    if (here) {
      for (const { p, at, fight, live, allies, peerLive, places, fire, stood } of drawn) {
        if (fire) {
          const distM = Math.hypot(fire.x - here.x, fire.z - here.z) / NATIVE_PER_M;
          if (distM <= reach) list.push({ key: `fire:${p.trip.id}`, res: { id: `fire:${p.trip.id}`, name: '' }, feet: deps.sceneOf(fire.x, fire.z), yaw: 0, moving: false, distM, talk: false, flat: FIRE_FLAT, body: false });
        }
        for (const m of places) {
          if (allies?.has(m.res.id)) continue;
          if (peerLive && m.res.cls != null) continue;
          if (deps.stands?.stood(m.res.id)) continue;
          const distM = Math.hypot(m.x - here.x, m.z - here.z) / NATIVE_PER_M;
          if (distM > reach) continue;
          if (fight) busy.add(m.res.id);
          list.push({ key: m.res.id, res: m.res, feet: deps.sceneOf(m.x, m.z), yaw: m.yaw, moving: m.moving, distM, striking: fight && m.res.cls != null && strikesNow(m.res.id) });
        }
        if (fight && !live && !peerLive) {
          for (const f of foePlaces(p.trip, at, stood)) {
            const distM = Math.hypot(f.x - here.x, f.z - here.z) / NATIVE_PER_M;
            if (distM > reach) continue;
            list.push({ key: f.key, res: f.res, feet: deps.sceneOf(f.x, f.z), yaw: f.yaw, moving: false, distM, striking: strikesNow(f.key), talk: false });
          }
        }
      }
      if (deps.teams) {
        const near = (/** @type {{ x: number, z: number }} */ q) => Math.hypot(q.x - here.x, q.z - here.z) / NATIVE_PER_M;
        deps.teams.sync(
          horses.filter((h) => near(h) <= reach).map((h) => ({ key: h.key, feet: deps.sceneOf(h.x, h.z), yaw: h.yaw, moving: h.moving, speed: h.speed, distM: near(h) })),
          wagons.filter((w) => near(w) <= reach).map((w) => ({ key: w.key, feet: deps.sceneOf(w.x, w.z), front: deps.sceneOf(w.x + Math.sin(w.yaw) * WAGON_FRONT_N, w.z + Math.cos(w.yaw) * WAGON_FRONT_N), yaw: w.yaw, moving: w.moving, tier: w.tier, s: w.s, hitched: w.hitched, distM: near(w) })),
          { dt, eye, grow: overworld?.grow ?? 1, ground: !overworld });
      }
      for (const r of remains) {
        if (fights?.alliesOf(r.trip.id).has(r.res.id)) continue;
        const distM = Math.hypot(r.x - here.x, r.z - here.z) / NATIVE_PER_M;
        if (distM > reach) continue;
        list.push({ key: r.key, res: r.res, feet: deps.sceneOf(r.x, r.z), yaw: r.yaw, moving: false, distM, talk: false, flat: corpseLook() });
      }
    }
    for (const key of [...strikes.keys()]) if (!list.some((m) => m.key === key)) strikes.delete(key);
    deps.sprites.sync(list, { dt, eye, grow: overworld?.grow ?? 1, fade: overworld?.blend ?? 1, ground: !overworld });
    if (!overworld && dt > 0) greet(t);
  }

  /**
   * @param {string} id
   * @param {number} t
   */
  function companyAt(id, t) {
    const p = parties.find((q) => q.trip.company && q.trip.party.some((x) => x.id === id));
    return p ? { name: p.trip.company.name, head: headOf(membersAt(p.trip, t)) } : hiredAt(id, t);
  }

  /**
   * @param {string} id
   * @param {number} t
   */
  function hiredAt(id, t) {
    for (const q of parties) {
      if (!q.trip.hiredBy) continue;
      const c = companiesOf(deps.world.rosterOf(q.trip.from)).find((x) => x.key === q.trip.hiredBy);
      const slots = new Set(c?.places.map((x) => x.slot) ?? []);
      const of = (/** @type {any} */ m) => slots.has(m.slot);
      if (!c || !q.trip.party.some((x) => x.id === id && of(x))) continue;
      return { name: namedIn(c, q.trip.from?.name ?? '').name, head: headOf(membersAt(q.trip, t).filter(of)) };
    }
    return null;
  }

  function greet(t) {
    for (const m of list) {
      if (m.distM > ROAD_GREET_M || m.talk === false || busy.has(m.res.id)) continue;
      const last = greeted.get(m.res.id);
      // The `t >= last` check drops the greeting rest when the clock goes back on a load.
      if (last != null && t >= last && t - last < ROAD_GREET_REST_MIN) continue;
      greeted.set(m.res.id, t);
      const rel = deps.relations?.() ?? null;
      const company = companyAt(m.res.id, t);
      const word = company?.head?.id ?? m.res.id;
      const standing = rel ? rel.standing(word, dayOf(t)) : 'neutral';
      const known = !!rel?.known(word);
      const pools = company && standing !== 'enemy' && standing !== 'hostile' ? COMPANY_GREETINGS : ROAD_GREETINGS;
      const pool = standing === 'friend' ? pools.friend : standing === 'enemy' || standing === 'hostile' ? ROAD_GREETINGS.enemy
        : known ? pools.known : pools.stranger;
      let text = fillLine(pool[lwSeed(textSeed(m.res.id), Math.floor(t / 7)) % pool.length], { player: deps.playerName?.() ?? '', company: company?.name ?? '' });
      const band = standing === 'enemy' || standing === 'hostile' ? null : deps.unheard?.(t) ?? null;
      if (band) { text = `${text} ${fillLine(BAND_WARNINGS[lwSeed(textSeed(m.res.id), 0x7761726e) % BAND_WARNINGS.length], { band: band.name })}`; deps.heard?.(band); }
      greetings = greetings.filter((g) => g.id !== m.res.id && g.until > realNow);
      greetings.push({ id: m.res.id, text, until: realNow + ROAD_GREET_S });
      rel?.seen(m.res.id, dayOf(t));
    }
  }

  /**
   * @param {number[]} eye
   * @param {number} [range]
   * @returns {{ person: any, text: string, kind: 'talk' }[]}
   */
  function speech(eye, range = 30) {
    const t = deps.clock();
    const rate = deps.baseRate();
    const roundMin = ROUND_S * rate * 1.25, lineMin = lineMinutes(rate);
    greetings = greetings.filter((g) => g.until > realNow);
    const out = [];
    const near = (person) => person?.pos && Math.hypot(person.pos[0] - eye[0], person.pos[2] - eye[2]) <= range;
    if (!deps.sprites.someBody((b) => near(b.person))) return out;
    for (const g of greetings) {
      const b = deps.sprites.bodyOf(g.id);
      if (b && near(b.person)) out.push({ person: b.person, text: g.text, kind: /** @type {'talk'} */ ('talk') });
    }
    const walking = [];
    for (const p of parties) {
      const at = walkingAt(p.trip, t);
      if (at) walking.push({ trip: p.trip, at });
    }
    for (const pair of passingPairs(walking, t)) {
      const k = passingLine(pair, t, lineMin);
      if (k < 0) continue;
      const who = membersAt((k % 2 ? pair.b : pair.a).trip, t)[0];
      const b = who ? deps.sprites.bodyOf(who.id) : null;
      const foe = pair.warned ? (pair.warned.trip.enc.bandName ?? deps.foeName?.(pair.warned.trip.enc.foes[0], 2) ?? 'foes') : '';
      if (b && near(b.person) && !greetings.some((g) => g.id === who.id)) out.push({ person: b.person, text: fillLine(pair.script[k], { foe }), kind: /** @type {'talk'} */ ('talk') });
    }
    for (const p of parties) {
      if (p.trip.party.length < 2) continue;
      const at = partyAt(p.trip, t);
      if ((at.phase !== 'out' && at.phase !== 'back') || at.halt) continue;
      const round = Math.floor(t / roundMin);
      const seed = lwSeed(textSeed(p.trip.id), round);
      const members = membersAt(p.trip, t);
      if (members.length < 2) continue;
      const circle = { members, seed, start: round * roundMin, end: (round + 1) * roundMin, index: 0 };
      const line = circleLine(circle, t, lineMin, { place: p.trip.to?.name, weather: deps.weather?.() ?? null, hour: Math.floor((((t % DAY_MIN) + DAY_MIN) % DAY_MIN) / 60), road: at.camp ? 'camp' : 'walk' });
      if (!line) continue;
      const b = deps.sprites.bodyOf(line.who.id);
      if (b && near(b.person) && !greetings.some((g) => g.id === line.who.id)) out.push({ person: b.person, text: line.text, kind: /** @type {'talk'} */ ('talk') });
    }
    return out;
  }

  /** @returns {{ key: string, at: number[], label: string, kind: string, trip: any }[]} */
  function marks() {
    const t = deps.clock();
    const out = [];
    for (const p of parties) {
      const at = partyAt(p.trip, t);
      if (at.phase !== 'out' && at.phase !== 'back') continue;
      if (at.inn) continue;
      const members = membersAt(p.trip, t);
      if (!members.length) continue;
      const foes = at.fight ? p.trip.enc?.foes ?? [] : [];
      const beset = foes.length ? (p.trip.enc?.bandName ?? deps.foeName?.(foes[0], foes.length) ?? 'foes') : '';
      out.push({ key: `party:${p.trip.id}`, at: deps.sceneOf(/** @type {number} */ (at.x), /** @type {number} */ (at.z)), label: partyLabel({ ...p.trip, party: members, robbed: deps.robbed?.(p.trip.id) != null }, '', beset),
        kind: `${p.trip.kind === 'merchant' ? 'wayfarer caravan' : 'wayfarer'}${beset ? ' fight' : ''}`, trip: p.trip });
    }
    return out;
  }

  return {
    frame,
    speech,
    marks,
    talkSeats: () => deps.sprites.persons(),
    batches: () => (deps.teams ? [...deps.sprites.batches(), ...deps.teams.batches()] : deps.sprites.batches()),
    /**
     * @param {any} r
     * @param {any} [cull]
     */
    drawTeams: (r, cull = null) => deps.teams?.draw(r, null, cull) ?? 0,
    drawTeams3d: (canvas, cam) => deps.teams?.draw3d?.(canvas, cam) ?? 0,
    drawBodies(canvas, proj, view, eye, dt) { deps.sprites.drawBodies?.(canvas, proj, view, eye, dt); },
    /** @param {number[]} o */
    offsetBodies(o) { deps.sprites.offsetBodies?.(o); },
    drawVeiledBodies() { deps.sprites.drawVeiledBodies?.(); },
    parties: () => parties,
    talked(person) {
      const id = person?.living?.id;
      if (!id) return null;
      deps.relations?.()?.note(id, 'talk', dayOf(deps.clock()));
      return id;
    },
    caught(person) {
      const id = person?.living?.id;
      if (!id) return null;
      deps.relations?.()?.note(id, 'crime', dayOf(deps.clock()));
      return id;
    },
    slain(person) {
      const res = person?.living?.res;
      if (!res) return null;
      const t = deps.clock();
      deps.slay?.(res, t, true);
      const p = parties.find((q) => q.trip.party.some((m) => m.id === res.id));
      const rel = deps.relations?.();
      for (const m of p ? membersAt(p.trip, t) : []) if (m.id !== res.id) rel?.note(m.id, 'slain', dayOf(t));
      // Drop any read under way and force a whole read, since a read begun before the death still lists the slain.
      timer = ROADS_TICK_S; sweep = null; readAt = null;
      return res.id;
    },
    toned(person, taste) {
      const id = person?.living?.id;
      const kind = taste > 0 ? 'polite' : taste < 0 ? 'insulted' : null;
      if (!id || !kind) return null;
      deps.relations?.()?.note(id, kind, dayOf(deps.clock()));
      return id;
    },
    regardCard(person) {
      const id = person?.living?.id;
      const rel = deps.relations?.();
      if (!id || !rel) return null;
      const whom = companyAt(id, deps.clock())?.head?.id ?? id, day = dayOf(deps.clock());
      return { regard: rel.regard(whom, day), standing: rel.standing(whom, day) };
    },
    refuses(person) {
      const id = person?.living?.id;
      const rel = deps.relations?.();
      if (!id || !rel) return null;
      const s = rel.standing(companyAt(id, deps.clock())?.head?.id ?? id, dayOf(deps.clock()));
      return s === 'enemy' || s === 'hostile' ? fillLine(LIVING_REFUSAL, { a: firstNameOf(person.nameNPC) }) : null;
    },
    clear() { deps.sprites.clear(); deps.teams?.clear(); deps.fights?.clear(); deps.stands?.clear(); parties = []; remains = []; list.length = 0; greetings = []; timer = Infinity; sweep = null; readAt = null; strikes.clear(); busy.clear(); },
  };
}
