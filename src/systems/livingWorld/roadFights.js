// @ts-check
import { membersAt } from './trips.js';
import { NATIVE_PER_M } from './trips.js';
import { lwSeed, textSeed } from './seed.js';
import { clearOfTeam } from './wagons.js';
import { killed } from './hideouts.js';

export const LIVE_M = 150;
export const LIVE_KEEP_M = 260;
export const FOE_STAND_M = Object.freeze([7, 13]);
export const LIVE_GRACE_MIN = 90;
export const ENDED_MAX = 64;

/** @param {{ spawn: (mobileType: number, feet: number[], o: { yaw: number, level: number, allied: boolean, gender: string }) => Promise<any>, remove: (rec: any) => void, inPool: (rec: any) => boolean, owner: (feet: number[]) => boolean, ready: () => boolean, sceneOf: (nx: number, nz: number) => number[], clock: () => number, relations: () => any, turnKeyOf: (res: any, trip: any) => string, dies: (res: any, trip: any) => boolean, died?: (res: any, t: number) => void, door?: any, onTurn?: () => void, }} deps */
export function createRoadFights(deps) {
  /** @type {Map<string, { trip: any, enc: any, at: number[], foes: any[], allies: Map<string, any>, state: 'standing'|'live'|'won'|'lost', fell: Set<string> }>} */
  const fights = new Map();
  const ended = new Set();
  const day = () => Math.floor((deps.clock() - 240) / 1440);

  const takeOut = (rec) => { try { if (deps.inPool(rec)) deps.remove(rec); } catch (e) { console.warn('[road fights] a body would not leave', e?.message ?? e); } };
  function letGo(id) {
    const f = fights.get(id);
    if (!f) return;
    for (const rec of f.allies.values()) if (!rec.dead) takeOut(rec);
    if (f.state !== 'lost') for (const rec of f.foes) takeOut(rec);
    if (f.state === 'won' || f.state === 'lost') { ended.add(id); if (ended.size > ENDED_MAX) ended.delete(ended.values().next().value); }
    fights.delete(id);
  }

  function stand(trip, at, t, team = null) {
    const clear = (/** @type {number} */ x, /** @type {number} */ z) => (team ? clearOfTeam(x, z, team) : { x, z });
    const enc = trip.enc;
    /** @type {{ trip: any, enc: any, at: number[], foes: any[], allies: Map<string, any>, state: 'standing'|'live'|'won'|'lost', fell: Set<string> }} */
    const f = { trip, enc, at: deps.sceneOf(at.x, at.z), foes: [], allies: new Map(), state: 'standing', fell: new Set() };
    fights.set(enc.id, f);
    const [near, far] = FOE_STAND_M;
    const turn = (lwSeed(textSeed(enc.id), 0x6c697665) % 628) / 100;
    const stands = [];
    enc.foes.forEach((type, i) => {
      const a = ((i + 0.5) / enc.foes.length) * Math.PI * 2 + turn;
      const r = (near + ((lwSeed(textSeed(enc.id), i, 0x72) % 1000) / 1000) * (far - near)) * NATIVE_PER_M;
      const { x: nx, z: nz } = clear(at.x + Math.sin(a) * r, at.z + Math.cos(a) * r);
      const feet = deps.sceneOf(nx, nz);
      stands.push(Promise.resolve(deps.spawn(type, feet, { yaw: Math.atan2(f.at[0] - feet[0], f.at[2] - feet[2]), level: enc.level, allied: false, gender: 'male' }))
        .then((rec) => { if (rec) { if (fights.get(enc.id) !== f) takeOut(rec); else { rec._lwFight = enc.id; f.foes.push(rec); } } }));
    });
    const members = membersAt(trip, t);
    const rel = deps.relations?.();
    members.forEach((m, i) => {
      if (m.cls == null) return;
      const standing = rel?.standing(m.id, day());
      if (standing === 'enemy' || standing === 'hostile') return;
      const a = (i / Math.max(1, members.length)) * Math.PI * 2;
      const c = clear(at.x + Math.sin(a) * 64, at.z + Math.cos(a) * 64);
      const feet = deps.sceneOf(c.x, c.z);
      stands.push(Promise.resolve(deps.spawn(m.cls, feet, { yaw: a, level: m.level ?? 1, allied: true, gender: m.sex ?? 'male' }))
        .then((rec) => {
          if (!rec) return;
          if (fights.get(enc.id) !== f) { takeOut(rec); return; }
          rec._lwFight = enc.id;
          rec.shipmate = true;
          rec.living = { id: m.id, res: m, town: deps.door ?? null };
          if (rec.entity) { rec.entity.name = m.name; rec.entity.team = 'PlayerAlly'; rec.entity.mobileTeam = 'PlayerAlly'; }
          f.allies.set(m.id, rec);
        }));
    });
    Promise.all(stands).then(() => { if (fights.get(enc.id) === f && f.state === 'standing') f.state = 'live'; }).catch(() => letGo(enc.id));
  }

  function turn(kind, key) {
    const rel = deps.relations?.();
    if (rel?.turn(kind, key)) deps.onTurn?.();
  }
  function fell(res, trip, t) {
    if (deps.died) { deps.died(res, t); deps.onTurn?.(); } else turn('fallen', deps.turnKeyOf(res, trip));
  }

  // A body counts as down only when `killed`; the pool's 120 m distance cull is shorter than `LIVE_M`, and a culled
  // body is neither a fall nor a win.
  function judge(f, t) {
    if (f.state !== 'live') return;
    for (const [id, rec] of f.allies) {
      if (!killed(rec) || f.fell.has(id)) continue;
      f.fell.add(id);
      fell(rec.living.res, f.trip, t);
    }
    const foesStanding = f.foes.filter((rec) => !rec.dead && deps.inPool(rec));
    const foesFell = f.foes.filter((rec) => killed(rec)).length;
    if (!foesStanding.length && foesFell > 0) {
      f.state = 'won';
      turn('won', f.enc.id);
      const rel = deps.relations?.();
      // Allies still on their feet count at the win even when the road already has them fallen, so a fated ally
      // saved here is spared.
      const standing = new Map(membersAt(f.trip, t).map((m) => [m.id, m]));
      for (const [id, rec] of f.allies) if (!rec.dead && deps.inPool(rec) && rec.living?.res) standing.set(id, rec.living.res);
      for (const m of standing.values()) {
        if (f.fell.has(m.id)) continue;
        const fated = deps.dies(m, f.trip);
        if (fated) turn('spared', deps.turnKeyOf(m, f.trip));
        rel?.note(m.id, fated ? 'saved' : 'helped', day());
      }
      return;
    }
    const armed = [...f.allies.values()];
    if (armed.length && armed.every((rec) => killed(rec)) && foesStanding.length) {
      f.state = 'lost';
      turn('lost', f.enc.id);
    }
  }

  return {
    /**
     * @param {{ trip: any, at: any, team?: { wagons: any[], horses: any[] } | null }[]} parties
     * @param {{ x: number, z: number } | null} here
     * @param {number} t
     * @param {{ ground?: boolean }} [o]
     */
    frame(parties, here, t, { ground = true } = {}) {
      const can = !!here && deps.ready();
      if (can && ground) {
        for (const p of parties) {
          const { trip, at, team = null } = p;
          if (!at?.fight || !trip?.enc?.foes?.length || fights.has(trip.enc.id) || ended.has(trip.enc.id)) continue;
          if (Math.hypot(at.x - here.x, at.z - here.z) / NATIVE_PER_M > LIVE_M) continue;
          if (!deps.owner(deps.sceneOf(at.x, at.z))) continue;
          stand(trip, at, t, team);
        }
      }
      for (const [id, f] of [...fights]) {
        judge(f, t);
        const far = !here || Math.hypot(f.trip.enc.x - here.x, f.trip.enc.z - here.z) / NATIVE_PER_M > LIVE_KEEP_M;
        const late = t > f.enc.t1 + LIVE_GRACE_MIN;
        const walkedOn = f.state === 'won' && t >= f.enc.t1;
        if (far || late || walkedOn || !can) letGo(id);
      }
    },
    /** @param {string} tripId */
    stood(tripId) { for (const f of fights.values()) if (f.trip.id === tripId) return true; return false; },
    /** @param {string} tripId */
    alliesOf(tripId) { for (const f of fights.values()) if (f.trip.id === tripId) return new Set(f.allies.keys()); return new Set(); },
    /**
     * @param {{ x: number, z: number }} at
     * @param {{ x: number, z: number } | null} here
     */
    peerStands(at, here) { return !!here && Math.hypot(at.x - here.x, at.z - here.z) / NATIVE_PER_M <= LIVE_M && !deps.owner(deps.sceneOf(at.x, at.z)); },
    fights: () => [...fights.values()],
    clear() { for (const id of [...fights.keys()]) letGo(id); },
    get size() { return fights.size; },
  };
}
