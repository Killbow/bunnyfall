// @ts-check
import { membersAt, NATIVE_PER_M } from './trips.js';
import { firstNameOf } from './lines.js';
import { killed } from './hideouts.js';

export const DRAW_M = 45;
export const HELP_M = 70;
export const KEEP_M = 200;
export const CALM_S = 8;
export const FIGHT_NEAR_M = 30;

/** @param {{ spawn: (mobileType: number, feet: number[], o: { yaw: number, level: number, allied: boolean, gender: string }) => Promise<any>, remove: (rec: any) => void, inPool: (rec: any) => boolean, ready: () => boolean, sceneOf: (nx: number, nz: number) => number[], relations: () => any, slay: (res: any, t: number, seen: boolean) => void, killed: (res: any, t: number) => void, died: (res: any, t: number) => void, deadAt?: (res: any, t: number) => boolean, fighting: () => boolean, say?: (text: string) => void, door?: any, wanted?: (res: any, trip: any) => (string | null), }} deps */
export function createRoadStands(deps) {
  /** @type {Map<string, { res: any, trip: any, kind: 'foe'|'friend', at: { x: number, z: number }, rec: any, calm: number, failed: boolean }>} */
  const stands = new Map();
  const dayOf = (t) => Math.floor((t - 240) / 1440);

  const takeOut = (rec) => { try { if (rec && deps.inPool(rec)) deps.remove(rec); } catch (e) { console.warn('[road stands] a body would not leave', e?.message ?? e); } };
  function letGo(id) {
    const s = stands.get(id);
    if (!s) return;
    if (!s.rec?.dead) takeOut(s.rec);
    stands.delete(id);
  }

  function stand(c, kind, halt = null) {
    /** @type {{ res: any, trip: any, kind: 'foe'|'friend', at: { x: number, z: number }, rec: any, calm: number, failed: boolean }} */
    const s = { res: c.res, trip: c.trip, kind, at: { x: c.x, z: c.z }, rec: null, calm: 0, failed: false };
    stands.set(c.res.id, s);
    // A failed spawn stays recorded so it is not retried, while `stood` returns false so the roads still draw the
    // member.
    const fail = () => { s.failed = true; };
    Promise.resolve(deps.spawn(c.res.cls, deps.sceneOf(c.x, c.z), { yaw: c.yaw ?? 0, level: c.res.level ?? 1, allied: kind === 'friend', gender: c.res.sex ?? 'male' }))
      .then((rec) => {
        if (!rec) { fail(); return; }
        if (stands.get(c.res.id) !== s) { takeOut(rec); return; }
        rec.living = { id: c.res.id, res: c.res, town: deps.door ?? null };
        if (rec.entity) rec.entity.name = c.res.name;
        if (kind === 'friend') {
          rec.shipmate = true;
          if (rec.entity) { rec.entity.team = 'PlayerAlly'; rec.entity.mobileTeam = 'PlayerAlly'; }
        }
        s.rec = rec;
      })
      .catch(fail);
    const first = firstNameOf(c.res.name);
    deps.say?.(halt ? `${first}: "${halt}"` : kind === 'foe' ? `${first} draws on you!` : `${first} comes to your side.`);
  }

  return {
    /**
     * @param {{ res: any, trip: any, x: number, z: number, yaw?: number }[]} cands
     * @param {{ x: number, z: number } | null} here
     * @param {number} t
     * @param {{ dt?: number, ground?: boolean }} [o]
     */
    frame(cands, here, t, { dt = 0, ground = true } = {}) {
      const can = !!here && ground && deps.ready();
      const rel = deps.relations?.();
      const day = dayOf(t);
      if (can && rel) {
        const fight = deps.fighting();
        for (const c of cands) {
          if (c.res?.cls == null || stands.has(c.res.id)) continue;
          // Road parties refresh once a second, so a member a hand just killed can still appear among `cands`.
          if (deps.deadAt?.(c.res, t)) continue;
          const distM = Math.hypot(c.x - here.x, c.z - here.z) / NATIVE_PER_M;
          const standing = rel.standing(c.res.id, day);
          const halt = distM <= DRAW_M ? deps.wanted?.(c.res, c.trip) ?? null : null;
          if ((standing === 'hostile' || halt) && distM <= DRAW_M) stand(c, 'foe', halt);
          else if (standing === 'friend' && fight && distM <= HELP_M) stand(c, 'friend');
        }
      }
      for (const [id, s] of [...stands]) {
        // A body the pool removed without a kill (a sweep or a mode change) is dropped silently, never counted as a
        // slaying or a death.
        if (s.rec?.dead && !killed(s.rec)) { stands.delete(id); continue; }
        if (s.rec?.dead) {
          // Only a kill with `killedBy` set to 'player' counts as a slaying; an enemy killed by anyone else is dead
          // for good with no report and no regard change.
          if (s.kind === 'foe' && s.rec.killedBy === 'player') {
            deps.slay(s.res, t, true);
            for (const m of membersAt(s.trip, t)) if (m.id !== s.res.id) rel?.note(m.id, 'slain', day);
          } else if (s.kind === 'foe') deps.killed(s.res, t);
          else deps.died(s.res, t);
          stands.delete(id);
          continue;
        }
        const far = !here || Math.hypot(s.at.x - here.x, s.at.z - here.z) / NATIVE_PER_M > KEEP_M;
        if (s.kind === 'friend') s.calm = deps.fighting() ? 0 : s.calm + dt;
        if (far || !can || (s.kind === 'friend' && s.calm >= CALM_S)) letGo(id);
      }
    },
    /** @param {string} id */
    stood: (id) => { const s = stands.get(id); return !!s && !s.failed; },
    stands: () => [...stands.values()],
    clear() { for (const id of [...stands.keys()]) letGo(id); },
    get size() { return stands.size; },
  };
}
