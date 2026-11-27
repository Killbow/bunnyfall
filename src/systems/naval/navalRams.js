// @ts-check
import { RAM_SPEED, RAM_MEMORY_S, RAM_COOLDOWN_S, ramContact, ramClosing, ramBlow, ramLine, ramRoom, recoilRoom, recoilShare, ramPaid, ramMen, ramMenSaid } from './navalRam.js';
import { hullBuild, PLAYER_CREW_TOUGHNESS } from './navalShips.js';
import { SHIP_STATES, BRACE_TAKEN } from './navalDamage.js';
import { forwardOfYaw, velocityOf } from './navalAI.js';
import { flatUnit } from './navalBallistics.js';
import { navalHitData, NAVAL_HIT_MAX } from './navalWire.js';
import { NAVAL_SFX } from './navalSounds.js';
import { captainsDue } from '../../items/sigilSetPowers.js';
import { quatRotate } from '../../world/quat.js';
import { t } from '../../ui/textManager.js';

/**
 * @param {{ ships: () => Iterable<any>, get: (id: any) => any, myBoats: () => any[], myId: () => string, now: () => number,
 *   seaY: () => number, random: () => number, boatPose: (boat: any) => { position: number[], rotation: number[], velocity: number[] },
 *   hullBox: (boat: any) => any, state: (boat: any) => any, boarding: () => any, called: (e: any) => string,
 *   fair: (e: any) => boolean, strike: (e: any, hurt: any, by: any) => void, sendHit: (data: any) => any, charge: (e: any) => void,
 *   hit: (at: number[], dir: number[]) => void, sound: (key: string, at: number[], vol: number) => void,
 *   shake?: (k: number) => void, mid?: (text: string, s: number) => void, due?: () => { hull: number } }} deps
 */
export function createNavalRams(deps) {
  const rammedAt = new WeakMap(), galleyAt = new WeakMap();
  let wayIn = [];
  const due = () => (deps.due ?? captainsDue)().hull;

  const fighting = (e) => e.ship.damage.state === SHIP_STATES.afloat && !e.ship.boarded && deps.boarding()?.shipId !== e.id;
  const landed = (at, dir, shake = 0) => {
    deps.hit(at, dir);
    deps.sound(NAVAL_SFX.hit, at, 1);
    if (shake) deps.shake?.(shake);
  };
  const recoil = (e, blow, now) => e.ship.damage.apply({ hull: Math.min(Math.round(blow * recoilShare(true)), recoilRoom(e.ship.damage)), sail: 0, crew: 0 }, now);
  const galleyBlow = (e, closing, side, hers) => ramPaid(ramBlow({ closing, side, mine: e.ship.damage.maxHull, hers, galley: true }), recoilRoom(e.ship.damage), recoilShare(true));

  function helm(boat) {
    if (!boat || boat.charter) { wayIn = []; return null; }
    const now = deps.now();
    const pose = deps.boatPose(boat);
    const fwd = flatUnit(quatRotate(pose.rotation, [0, 0, 1])) ?? [0, 0, 1];
    // The way is remembered over RAM_MEMORY_S because the collider stops her at the other hull's planking.
    wayIn.push({ t: now, v: [pose.velocity[0], 0, pose.velocity[2]] });
    while (wayIn.length && now - wayIn[0].t > RAM_MEMORY_S) wayIn.shift();
    if (!wayIn.some((w) => w.v[0] * fwd[0] + w.v[2] * fwd[2] >= RAM_SPEED)) return null;
    const st = deps.state(boat);
    if (st.damage.state !== SHIP_STATES.afloat) return null;
    const build = hullBuild(boat.hull), galley = !!build.ram;
    const stem = [pose.position[0] + fwd[0] * build.bowZ, pose.position[1] + 1, pose.position[2] + fwd[2] * build.bowZ];
    for (const e of deps.ships()) {
      if (!e.boat || !fighting(e) || now - (rammedAt.get(e) ?? -Infinity) < RAM_COOLDOWN_S) continue;
      const box = deps.hullBox(e.boat);
      const at = box ? ramContact(box, stem) : null;
      // A lawful ship at peace with me is bumped, never rammed, so a ram is never the first act of fire on her.
      if (!at || !deps.fair(e)) continue;
      const k = recoilShare(galley) * (st.guns.braced ? BRACE_TAKEN : 1) * due();
      const closing = ramClosing(wayIn.map((w) => w.v), velocityOf(e.ship), at.normal);
      const blow = ramPaid(ramBlow({ closing, side: at.side, mine: st.damage.maxHull, hers: e.ship.damage.maxHull, galley }), recoilRoom(st.damage), k);
      if (blow < 1) continue;
      // The way is spent on the first ship it strikes.
      rammedAt.set(e, now);
      wayIn = [];
      const dealt = Math.min(blow, ramRoom(e.ship.damage));
      landed(stem, fwd, 3);
      deps.mid?.(galley ? t('naval.ram.galley', 'Your ram smashes into the hull.') : t('naval.ram.mine', 'You ram the ship.'), 2);
      deps.charge(e);
      if (!e.owner) deps.strike(e, { hull: blow, sail: 0, crew: ramMen(dealt, deps.random()), floor: ramLine(e.ship.damage) }, deps.myId());
      // Another player's ship takes the ram on her own client, down to her own line.
      else deps.sendHit(navalHitData(e.owner, { n: e.n, hull: Math.min(NAVAL_HIT_MAX, Math.ceil(dealt)), crew: ramMenSaid(dealt), zone: 'holed', ram: true }));
      st.damage.apply({ hull: Math.min(Math.round(blow * k), recoilRoom(st.damage)), sail: 0, crew: 0 }, now);
      return e;
    }
    return null;
  }

  function onMine(e, boat, f, bow, now) {
    if (boat.charter) return false;
    const s = e.ship, st = deps.state(boat);
    const box = deps.hullBox(boat);
    const at = box && st.damage.state === SHIP_STATES.afloat ? ramContact(box, bow) : null;
    if (!at) return false;
    const pose = deps.boatPose(boat);
    const blow = galleyBlow(e, ramClosing([velocityOf(s)], [pose.velocity[0], 0, pose.velocity[2]], at.normal), at.side, st.damage.maxHull);
    const hurt = Math.round(blow * (st.guns.braced ? BRACE_TAKEN : 1) * due());
    const dealt = Math.min(hurt, ramRoom(st.damage));
    if (blow < 1 || !(dealt > 0)) return false;
    galleyAt.set(e, now);
    st.damage.apply({ hull: hurt, sail: 0, crew: ramMen(dealt, deps.random(), PLAYER_CREW_TOUGHNESS) }, now, { floor: ramLine(st.damage) });
    landed(bow, f, 3.5);
    deps.mid?.(t('naval.ram.taken', '{ship} rams you.', { ship: deps.called(e) }), 2);
    recoil(e, blow, now);
    return true;
  }
  function onShip(e, x, f, bow, now) {
    const box = deps.hullBox(x.boat);
    const at = box ? ramContact(box, bow) : null;
    if (!at) return;
    const blow = galleyBlow(e, ramClosing([velocityOf(e.ship)], velocityOf(x.ship), at.normal), at.side, x.ship.damage.maxHull);
    const dealt = Math.min(blow, ramRoom(x.ship.damage));
    if (blow < 1 || !(dealt > 0)) return;
    galleyAt.set(e, now);
    landed(bow, f);
    deps.strike(x, { hull: blow, sail: 0, crew: ramMen(dealt, deps.random()), floor: ramLine(x.ship.damage) }, e.id);
    recoil(e, blow, now);
  }
  function galleys() {
    const now = deps.now();
    for (const e of deps.ships()) {
      const s = e.ship;
      if (e.owner || !hullBuild(s.hull).ram || s.damage.state !== SHIP_STATES.afloat || s.boarded || s.speed < RAM_SPEED) continue;
      if ((s.mode !== 'engage' && s.mode !== 'board') || now - (galleyAt.get(e) ?? -Infinity) < RAM_COOLDOWN_S) continue;
      const f = forwardOfYaw(s.yaw), bowZ = hullBuild(s.hull).bowZ;
      const bow = [s.pos[0] + f[0] * bowZ, deps.seaY() + 1, s.pos[2] + f[2] * bowZ];
      if (s.target === deps.myId()) { for (const b of deps.myBoats()) if (onMine(e, b, f, bow, now)) break; continue; }
      const x = deps.get(s.target);
      if (x?.boat && x !== e && !x.owner && fighting(x)) onShip(e, x, f, bow, now);
    }
  }

  return {
    helm,
    galleys,
    peer(e, hurt) {
      if (!fighting(e)) return false;
      hurt.floor = ramLine(e.ship.damage);
      return true;
    },
    clear() { wayIn = []; },
  };
}
