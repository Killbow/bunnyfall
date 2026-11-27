// @ts-check
import { membersAt } from './trips.js';
import { firstNameOf } from './lines.js';
import { pointAt, stopAt } from './deepRoute.js';
import { headOf } from './companies.js';

export const DIVER_STAND_M = 5;
export const DIVER_HEEL_M = 3;
export const DIVER_HEEL_STEP_M = 1.2;
export const DEEP_NEAR_M = 15;
export const DEEP_SEE_M = 35;
export const DEEP_HEAR_M = 60;
export const DEEP_KEEP_M = 70;
export const DEEP_FLOOR_DY = 3;
export const DIVER_ARRIVE_SLACK_M = 2;
export const DEEP_RING_S = 2.5;
export const RETREAT_HP = 0.3;
export const RETREAT_BACK_M = 4;
export const DIVER_TRAIL_STEP_M = 0.75;
export const DIVER_TRAIL_MAX = 64;
export const DIVER_TRAIL_JUMP_M = 8;
/** @param {string} name */
export const POACHED_LINE = (name) => `${name}: "That was ours to find."`;

/** @param {{ spawn: (mobileType: number, feet: number[], o: { yaw: number, level: number, gender: string }) => Promise<any>, remove: (rec: any) => void, inPool: (rec: any) => boolean, leader: () => ({ feet: number[], yaw: number } | null), spot: (from: number[], dx: number, dz: number) => number[], owner: () => boolean, relations: () => any, turnKeyOf: (res: any, trip: any) => string, dies: (res: any, trip: any) => boolean, day: () => number, say?: (text: string) => void, door?: any, spawnFoe?: (mobileType: number, feet: number[], o: { yaw: number, level: number, gender: string }) => Promise<any>, slay?: (res: any, t: number, seen: boolean) => void, died?: (res: any, t: number) => void, route?: (trip: any) => any, floor?: (x: number, y: number, z: number) => number[], clearLine?: (a: number[], b: number[]) => boolean, ring?: (feet: number[]) => void, choose?: (lines: string[], options: { code: string, label: string, action: () => void }[]) => any, stopPile?: (key: string) => any, realNow?: () => number, }} deps */
export function createDungeonDivers(deps) {
  /** @type {Map<string, any>} */
  const companies = new Map();
  const ended = new Set();
  const heard = new Set();
  const rings = new Map();
  /** @type {number[][]} */
  const trail = [];
  let leaderWas = /** @type {number[] | null} */ (null);
  const realNow = () => deps.realNow?.() ?? Date.now() / 1000;
  let lastT = 0;

  const takeOut = (rec) => { try { if (deps.inPool(rec)) deps.remove(rec); } catch (e) { console.warn('[divers] a body would not leave', /** @type {any} */ (e)?.message ?? e); } };
  /** @type {Map<string, { parted: boolean, hp: Map<string, number> }>} */
  const leftAs = new Map();
  function letGo(id) {
    const c = companies.get(id);
    if (c) {
      if (leftAs.size > 64) leftAs.clear();
      const hp = new Map();
      for (const [mid, rec] of c.allies) if (!rec.dead && rec.entity?.maxHealth > 0) hp.set(mid, rec.entity.health / rec.entity.maxHealth);
      leftAs.set(id, { parted: c.parted, hp });
    }
    if (!c) return;
    for (const rec of c.allies.values()) if (!rec.dead) takeOut(rec);
    for (const rec of c.foes.values()) if (!rec.dead) takeOut(rec);
    companies.delete(id);
  }
  const turn = (kind, key) => deps.relations?.()?.turn(kind, key);

  /** @param {number[]} feet */
  function drop(feet) {
    if (leaderWas && Math.hypot(feet[0] - leaderWas[0], feet[1] - leaderWas[1], feet[2] - leaderWas[2]) > DIVER_TRAIL_JUMP_M) trail.length = 0;
    leaderWas = [feet[0], feet[1], feet[2]];
    const last = trail[trail.length - 1];
    if (last && Math.hypot(feet[0] - last[0], feet[2] - last[2]) < DIVER_TRAIL_STEP_M) return;
    trail.push([feet[0], feet[1], feet[2]]);
    if (trail.length > DIVER_TRAIL_MAX) trail.shift();
  }
  /** @param {number} i */
  const heelOf = (i) => ({ feet: () => deps.leader()?.feet ?? null, stop: DIVER_HEEL_M + i * DIVER_HEEL_STEP_M, trail: () => trail });

  function meet(trip, members, at = null) {
    const L0 = deps.leader();
    if (!L0) return;
    const L = at ? { feet: at, yaw: Math.atan2(L0.feet[0] - at[0], L0.feet[2] - at[2]) } : L0;
    // Strength counts members as their bodies arrive (`size`) and is read only once none is `pending`; spawns
    // arrive one by one and can fail.
    const was = leftAs.get(trip.id) ?? null;
    const c = { trip, allies: new Map(), foes: new Map(), fell: new Set(), met: true, mode: at ? 'hold' : 'join', at, size: 0, pending: 0, going: null, pile: null, parted: !!was?.parted, said: new Set() };
    companies.set(trip.id, c);
    const rel = deps.relations?.();
    const standing = (m) => rel?.standing(m.id, deps.day()) ?? 'neutral';
    const armed = members.filter((m) => m.cls != null);
    const hostile = deps.spawnFoe ? armed.filter((m) => standing(m) === 'hostile') : [];
    if (hostile.length) {
      hostile.forEach((m, i) => {
        const side = (i - (hostile.length - 1) / 2) * 1.4;
        const feet = deps.spot(L.feet, Math.sin(L.yaw) * DIVER_STAND_M + Math.cos(L.yaw) * side, Math.cos(L.yaw) * DIVER_STAND_M - Math.sin(L.yaw) * side);
        Promise.resolve(deps.spawnFoe?.(m.cls, feet, { yaw: L.yaw + Math.PI, level: m.level ?? 1, gender: m.sex ?? 'male' })).then((rec) => {
          if (!rec) return;
          if (companies.get(trip.id) !== c) { takeOut(rec); return; }
          rec.living = { id: m.id, res: m, town: deps.door ?? null };
          if (rec.entity) rec.entity.name = m.name;
          c.foes.set(m.id, rec);
        }).catch(() => {});
      });
      deps.say?.(`${trip.leader.name}'s company, and ${firstNameOf(hostile[0].name)} draws on you!`);
      return;
    }
    const stand = members.filter((m) => m.cls == null || (standing(m) !== 'enemy' && standing(m) !== 'hostile'));
    if (!stand.some((m) => m.cls != null)) { deps.say?.(`${trip.leader.name}'s company passes you by.`); return; }
    stand.forEach((m, i) => {
      if (m.cls == null) return;
      const side = (i - (stand.length - 1) / 2) * 1.4;
      const back = at ? 1.5 + Math.floor(i / 3) : DIVER_STAND_M + Math.floor(i / 3);
      const dx = -Math.sin(L.yaw) * back + Math.cos(L.yaw) * side, dz = -Math.cos(L.yaw) * back - Math.sin(L.yaw) * side;
      const feet = deps.spot(L.feet, dx, dz);
      c.pending++;
      Promise.resolve(deps.spawn(m.cls, feet, { yaw: L.yaw, level: m.level ?? 1, gender: m.sex ?? 'male' })).then((rec) => {
        c.pending--;
        if (!rec) return;
        if (companies.get(trip.id) !== c) { takeOut(rec); return; }
        c.size++;
        const hp = was?.hp.get(m.id);
        if (hp != null && rec.entity?.maxHealth > 0) rec.entity.health = Math.max(1, Math.round(rec.entity.maxHealth * hp));
        rec.shipmate = true;
        rec.living = { id: m.id, res: m, town: deps.door ?? null };
        if (rec.entity) { rec.entity.name = m.name; rec.entity.team = 'PlayerAlly'; rec.entity.mobileTeam = 'PlayerAlly'; }
        rec.heel = i;
        if (rec.ai && !at) rec.ai.follow = heelOf(i);
        c.allies.set(m.id, rec);
      }).catch(() => { c.pending--; });
    });
    const name = trip.company?.name ?? `${trip.leader.name}'s company`;
    deps.say?.(at ? `You come upon ${name}, at work in ${trip.to?.name ?? 'the deep'}.` : `You meet ${name}, come down into ${trip.to?.name ?? 'the deep'}.`);
  }

  function slain(c, mid, rec, t) {
    c.fell.add(mid);
    deps.slay?.(rec.living.res, t, true);
    const rel = deps.relations?.();
    for (const m of membersAt(c.trip, t)) if (m.id !== mid) rel?.note(m.id, 'slain', deps.day());
  }

  function makeOut(id, c, line) {
    const rel = deps.relations?.();
    let left = 0;
    for (const [mid, rec] of c.allies) {
      if (c.fell.has(mid) || rec.dead) continue;
      const m = rec.living.res;
      const fated = deps.dies(m, c.trip);
      if (fated) turn('spared', deps.turnKeyOf(m, c.trip));
      rel?.note(m.id, fated ? 'saved' : 'helped', deps.day());
      left++;
    }
    if (left) deps.say?.(line);
    letGo(id);
    ended.add(id);
  }

  function nextStop(c, t) {
    if (c.going) return c.going.stop;
    const route = deps.route?.(c.trip);
    if (!route) return null;
    const s = stopAt(route, t);
    if (!s?.at && !s?.between) return null;
    const now = s?.at ?? (s?.between ? s.between[1] : null);
    const i = now ? route.legs.findIndex((l) => l.stop === now) : -1;
    return route.legs[s?.at ? i + 1 : Math.max(0, i)]?.stop ?? null;
  }
  function leadOn(c, t) {
    const route = deps.route?.(c.trip);
    const from = c.going ? route?.legs.findIndex((l) => l.stop === c.going.stop) ?? -1 : -1;
    const s = from >= 0 ? route?.legs[from + 1]?.stop ?? null : nextStop(c, t);
    if (!s) return false;
    const feet = deps.floor ? deps.floor(s.x, s.y, s.z) : [s.x, s.y, s.z];
    for (const rec of c.allies.values()) if (rec.ai && !rec.dead) { rec.ai.follow = { feet: () => feet, stop: 1.5 + (rec.heel ?? 0) * 0.8 }; rec.fellBack = false; }
    c.going = { stop: s, feet };
    c.mode = 'lead';
    return true;
  }
  function join(c) {
    for (const rec of c.allies.values()) if (rec.ai && !rec.dead) { rec.ai.follow = heelOf(rec.heel ?? 0); rec.fellBack = false; }
    c.mode = 'join'; c.going = null;
  }

  return {
    /**
     * @param {{ trip: any, members: any[] }[]} divers
     * @param {number} t
     */
    frame(divers, t) {
      lastT = t;
      const L = deps.leader();
      if (L) drop(L.feet);
      const listed = new Set();
      // The owner election is asked every frame, and a reader that loses it releases its companies so two readers
      // never spawn one company. A company with a living hostile member stays.
      const own = deps.owner();
      if (!own) for (const [id, c] of [...companies]) if (![...c.foes.values()].some((rec) => !rec.dead)) letGo(id);
      for (const { trip, members } of divers) {
        listed.add(trip.id);
        if (companies.has(trip.id) || ended.has(trip.id) || !own || !members.some((m) => m.cls != null)) continue;
        const route = deps.route?.(trip) ?? null;
        if (!route || !route.legs?.length) { meet(trip, members); continue; }
        const p = pointAt(route, t);
        if (!p || !L) continue;
        if (Math.hypot(p.x - L.feet[0], p.z - L.feet[2]) > DEEP_HEAR_M + DIVER_STAND_M) continue;
        const at = deps.floor ? deps.floor(p.x, p.y ?? L.feet[1], p.z) : [p.x, p.y ?? L.feet[1], p.z];
        const d = Math.hypot(at[0] - L.feet[0], at[2] - L.feet[2]);
        const floor = Math.abs(at[1] - L.feet[1]) <= DEEP_FLOOR_DY;
        if (floor && (d <= DEEP_NEAR_M || (d <= DEEP_SEE_M && (deps.clearLine?.(L.feet, at) ?? false)))) { meet(trip, members, at); continue; }
        const s = stopAt(route, t);
        if (s?.fighting && d <= DEEP_HEAR_M) {
          const now = realNow();
          if (!heard.has(trip.id)) { heard.add(trip.id); deps.say?.('You hear fighting ahead.'); }
          if (now >= (rings.get(trip.id) ?? 0)) { rings.set(trip.id, now + DEEP_RING_S); deps.ring?.(at); }
        }
      }
      for (const [id, c] of [...companies]) {
        // A dead body gone from the pool was cut by a load rewind, not killed, so it is forgotten and no turn is
        // written.
        for (const [mid, rec] of [...c.foes]) if (rec.dead && !c.fell.has(mid) && !deps.inPool(rec)) c.foes.delete(mid);
        for (const [mid, rec] of [...c.allies]) if (rec.dead && !c.fell.has(mid) && !deps.inPool(rec)) { c.allies.delete(mid); c.size--; }
        for (const [mid, rec] of c.foes) if (rec.dead && !c.fell.has(mid)) slain(c, mid, rec, t);
        for (const [mid, rec] of c.allies) {
          if (!rec.dead || c.fell.has(mid)) continue;
          c.fell.add(mid);
          if (deps.died) deps.died(rec.living.res, t); else turn('fallen', deps.turnKeyOf(rec.living.res, c.trip));
        }
        const name = c.trip.company?.name ?? `${c.trip.leader.name}'s company`;
        if (t >= c.trip.backT0 || !listed.has(id)) { makeOut(id, c, `${name} make for the surface.`); continue; }
        const standing = [...c.allies.values()].filter((rec) => !rec.dead);
        if (!c.pending && c.size > 1 && standing.length * 2 < c.size) { makeOut(id, c, `${name} have had enough and make for the way out.`); continue; }
        for (const rec of standing) {
          const e = rec.entity;
          if (!e || !rec.ai?.follow || rec.fellBack || !(e.maxHealth > 0) || e.health / e.maxHealth >= RETREAT_HP) continue;
          rec.fellBack = true;
          const f = rec.ai.follow;
          rec.ai.follow = { ...f, stop: (f.stop ?? DIVER_HEEL_M) + RETREAT_BACK_M };
        }
        if (c.mode === 'lead' && c.going && standing.every((rec) => !rec.ai?.feet || Math.hypot(rec.ai.feet[0] - c.going.feet[0], rec.ai.feet[2] - c.going.feet[2]) < (rec.ai.follow?.stop ?? DIVER_HEEL_M) + DIVER_ARRIVE_SLACK_M)) {
          if (!leadOn(c, t)) c.mode = 'hold';
        }
        if (c.mode !== 'join' && deps.stopPile && L) {
          const s = nextStop(c, t);
          const pile = s?.kind === 'treasure' ? deps.stopPile(s.key) : null;
          // Only pieces in the pile when first read count as the company's finds. The set is read again when
          // `roomWords` changes, so a peer's take is never charged to this player.
          if (pile !== c.pile?.pile || pile?.roomWords !== c.pile?.words) c.pile = pile ? { pile, own: new Set(pile.items ?? []), words: pile.roomWords, at: s } : null;
          const head = headOf(standing.map((rec) => rec.living?.res).filter(Boolean));
          const rel = deps.relations?.();
          if (c.pile && head && rel?.standing(head.id, deps.day()) !== 'friend') {
            const items = c.pile.pile.items ?? [];
            const taken = [...c.pile.own].filter((it) => !items.includes(it));
            const near = Math.hypot(c.pile.at.x - L.feet[0], c.pile.at.z - L.feet[2]) < 4;
            if (taken.length && near) {
              for (const rec of standing) rel?.note(rec.living.res.id, 'poached', deps.day());
              if (!c.said.has(c.pile.at.key)) { c.said.add(c.pile.at.key); deps.say?.(POACHED_LINE(firstNameOf(head.name))); }
            }
            for (const it of taken) c.pile.own.delete(it);
          }
        }
        if (c.at && L && c.mode !== 'join' && ![...c.foes.values()].some((rec) => !rec.dead)) {
          // Distance is measured from the nearest standing member, not from where the company is going.
          const feet = standing.map((rec) => rec.ai?.feet).filter(Boolean);
          const ref = c.going?.feet ?? c.at;
          const away = feet.length ? Math.min(...feet.map((f) => Math.hypot(f[0] - L.feet[0], f[2] - L.feet[2]))) : Math.hypot(ref[0] - L.feet[0], ref[2] - L.feet[2]);
          if (away > DEEP_KEEP_M) letGo(id);
        }
      }
    },
    /**
     * @param {any} person
     * @param {() => void} talk
     */
    offers(person, talk) {
      const id = person?.living?.id;
      if (!id || !deps.choose) return false;
      for (const c of companies.values()) {
        if (!c.allies.has(id) || c.parted || c.mode === 'join') continue;
        const name = firstNameOf(person.living.res?.name ?? '');
        const shown = deps.choose([`${name}: "Well met, down here. What'll it be?"`], [
          { code: 'KeyJ', label: 'J: join us', action: () => join(c) },
          { code: 'KeyL', label: 'L: lead on', action: () => { if (!leadOn(c, lastT)) deps.say?.(`${name}: "We’re done here. Nowhere left to lead."`); } },
          { code: 'KeyP', label: 'P: part ways', action: () => { c.parted = true; c.mode = 'hold'; } },
          { code: 'KeyA', label: 'A: talk', action: () => talk() },
          { code: 'Escape', label: 'Esc: goodbye', action: () => {} },
        ]);
        return !!shown;
      }
      return false;
    },
    companies: () => [...companies.values()],
    /**
     * @param {string} tripId
     * @param {string} resId
     */
    stood: (tripId, resId) => { const c = companies.get(tripId); return !!c && (c.allies.has(resId) || c.foes.has(resId)); },
    trail: () => trail,
    clear() { for (const id of [...companies.keys()]) letGo(id); leftAs.clear(); ended.clear(); heard.clear(); rings.clear(); trail.length = 0; leaderWas = null; },
    get size() { return companies.size; },
  };
}
