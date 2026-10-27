// @ts-check
// RAM-RETURN (2026-10-26, the owner: "I would like to reintegrate it in a thoughtful way. The major issue was that you
// could easily instability ships just by ramming"; bible/03-World/Naval-Refit.md RAM-RETURN) - THE RAMS AT SEA, wired
// by the naval host (scenes/naval/navalHost.js frame, stepSea - HOST-SPLIT: the module the host wires, as navalHaul.js
// is) over the ram's own law (systems/naval/navalRam.js: the blow, its room, its recoil). The port's own - Daggerfall has
// no sea.
//
//   MY HELM   `helm(boat)`, once a frame on the hulls as that frame poses them (AUDIT NAV1): my stem (the hull's own
//             bowZ) within RAM_REACH of a fighting ship's box, at the way I came in with - the most of the last
//             RAM_MEMORY_S, the collider having taken it at her planking - less her own way along my course. The way is
//             spent on the first ship it strikes; one ram a ship a RAM_COOLDOWN_S. It is an act of fire (the law's, as a
//             ball's), and on a ship another player stands it is said to her stander as a blow. A booked ship's master
//             never rams (FERRY-CLEAR).
//   A GALLEY  `galleys()`, each step of the sea's clock: a captain's galley afloat and fighting - engaged on a ship or
//             closing to board her - whose stem is in THAT ship's hull at RAM_SPEED or more of closing way: a boat of mine
//             if it is me she fights (braced, half; the Captain's Due on it), else a ship of my sea. A galley never rams a
//             ship she is not fighting: a bump between friends is a bump.
//
// A ram lands on a FIGHTING ship alone (`fighting`: afloat, not being boarded) - one whose colours are down is the
// grapples' (BOARD-MAGNET), never the stem's. The blow never takes a hull under its strike (ramRoom), and the rammer's
// recoil never brings her to her own (`recoilRoom`).

import { RAM_SPEED, RAM_REACH, RAM_MEMORY_S, RAM_COOLDOWN_S, ramBlow, ramSquare, ramRoom, recoilRoom, ramRecoil, ramMen, ramMenSaid } from '../../systems/naval/navalRam.js';
import { hullBuild, PLAYER_CREW_TOUGHNESS } from '../../systems/naval/navalShips.js';
import { SHIP_STATES, BRACE_TAKEN } from '../../systems/naval/navalDamage.js';
import { forwardOfYaw, velocityOf } from '../../systems/naval/navalAI.js';
import { insideGrown } from '../../systems/naval/navalShots.js';
import { flatUnit } from '../../systems/naval/navalBallistics.js';
import { navalHitData, NAVAL_HIT_MAX } from '../../systems/naval/navalWire.js';
import { NAVAL_SFX } from '../../systems/naval/navalSounds.js';
import { quatRotate } from '../../world/quat.js';
import { dueOnHull } from './navalSeaSet.js';
import { t } from '../../systems/textManager.js';

/** Whether `p` stands within `r` of `box` on the flat (its two level axes - a galley's stem is read at the sea's height,
 *  whatever her freeboard). */
function flatInside(box, p, r) {
  const l = [p[0] - box.c[0], p[1] - box.c[1], p[2] - box.c[2]];
  const along = (a) => Math.abs(l[0] * a[0] + l[1] * a[1] + l[2] * a[2]);
  return along(box.ax) <= box.h[0] + r && along(box.az) <= box.h[2] + r;
}

/**
 * @param {{ ships: () => Iterable<any>, get: (id: any) => any, myBoats: () => any[], myId: () => string, now: () => number,
 *   seaY: () => number, random: () => number, boatPose: (boat: any) => { position: number[], rotation: number[], velocity: number[] },
 *   hullBox: (boat: any) => any, state: (boat: any) => any, boarding: () => any, called: (e: any) => string,
 *   strike: (e: any, hurt: any, by: any) => void, sendHit: (data: any) => any, charge: (e: any) => void,
 *   hit: (at: number[], dir: number[]) => void, sound: (key: string, at: number[], vol: number) => void,
 *   shake?: (k: number) => void, mid?: (text: string, s: number) => void }} deps
 */
export function createNavalRams(deps) {
  /** When my stem last struck each ship, and when each galley's ram last struck (the sea's clock). */
  const rammedAt = new WeakMap(), galleyAt = new WeakMap();
  /** My boat's forward way over the last RAM_MEMORY_S - [{ t, v }]. */
  let wayIn = [];

  /** A ship a ram lands on: her hull built, afloat, not being boarded. */
  const fighting = (e) => !!e.boat && e.ship.damage.state === SHIP_STATES.afloat && !e.ship.boarded && deps.boarding()?.shipId !== e.id;
  /** The blow felt where it lands: the splinters, the crash and - on my deck - the shake. */
  const landed = (at, dir, shake = 0) => {
    deps.hit(at, dir);
    deps.sound(NAVAL_SFX.hit, at, 1);
    if (shake) deps.shake?.(shake);
  };
  /** A captain's ship takes back her `blow`'s recoil - never brought to her own strike by it. */
  const recoil = (e, blow, now) => e.ship.damage.apply({ hull: Math.min(ramRecoil(blow, true), recoilRoom(e.ship.damage)), sail: 0, crew: 0 }, now);

  /** My helm's ram, on the hulls as this frame poses them. Answers the ship it struck, or null. */
  function helm(boat) {
    if (!boat || boat.charter) { wayIn = []; return null; }   // FERRY-CLEAR: a booked ship's master never rams
    const now = deps.now();
    const pose = deps.boatPose(boat);
    const fwd = flatUnit(quatRotate(pose.rotation, [0, 0, 1])) ?? [0, 0, 1];
    wayIn.push({ t: now, v: pose.velocity[0] * fwd[0] + pose.velocity[2] * fwd[2] });
    while (wayIn.length && now - wayIn[0].t > RAM_MEMORY_S) wayIn.shift();
    const way = wayIn.reduce((m, w) => Math.max(m, w.v), 0);
    if (way < RAM_SPEED) return null;
    const build = hullBuild(boat.hull);
    const stem = [pose.position[0] + fwd[0] * build.bowZ, pose.position[1] + 1, pose.position[2] + fwd[2] * build.bowZ];
    for (const e of deps.ships()) {
      if (!fighting(e) || now - (rammedAt.get(e) ?? -Infinity) < RAM_COOLDOWN_S) continue;
      const box = deps.hullBox(e.boat);
      if (!box || !insideGrown(box, stem, RAM_REACH)) continue;
      const her = velocityOf(e.ship);
      const closing = way - (her[0] * fwd[0] + her[2] * fwd[2]);   // a ship sailing on ahead of the stem takes less of it
      if (closing < RAM_SPEED) continue;
      rammedAt.set(e, now);
      wayIn = [];   // the way spent on her
      const st = deps.state(boat), galley = !!build.ram;
      const blow = ramBlow({ closing, square: ramSquare(fwd, forwardOfYaw(e.ship.yaw)), mine: st.damage.maxHull, hers: e.ship.damage.maxHull, galley });
      const dealt = Math.min(blow, ramRoom(e.ship.damage));   // to her strike, never under it
      landed(stem, fwd, 3);
      deps.mid?.(galley ? t('naval.ram.galley', 'Your ram smashes into the hull!') : t('naval.ram.mine', 'You ram the ship!'), 2);
      deps.charge(e);
      if (!e.owner) deps.strike(e, { hull: dealt, sail: 0, crew: ramMen(dealt, deps.random()) }, deps.myId());
      else deps.sendHit(navalHitData(e.owner, { n: e.n, hull: Math.min(NAVAL_HIT_MAX, dealt), crew: ramMenSaid(dealt), zone: 'holed' }));   // her stander's to take
      const back = Math.round(ramRecoil(blow, galley) * (st.guns.braced ? BRACE_TAKEN : 1));
      st.damage.apply({ hull: Math.min(back, recoilRoom(st.damage)), sail: 0, crew: 0 }, now);
      return e;
    }
    return null;
  }

  /** A galley's ram on a boat of mine she fights - braced, half; the Captain's Due on it. Answers whether it struck. */
  function onMine(e, boat, f, bow, now) {
    const s = e.ship, st = deps.state(boat);
    const box = deps.hullBox(boat);
    if (st.damage.state !== SHIP_STATES.afloat || !box || !flatInside(box, bow, RAM_REACH)) return false;
    const pose = deps.boatPose(boat), v = pose.velocity;
    const closing = s.speed - (v[0] * f[0] + v[2] * f[2]);
    if (closing < RAM_SPEED) return false;
    galleyAt.set(e, now);
    const keel = flatUnit(quatRotate(pose.rotation, [0, 0, 1])) ?? [0, 0, 1];
    const blow = ramBlow({ closing, square: ramSquare(f, keel), mine: s.damage.maxHull, hers: st.damage.maxHull, galley: true });
    const hurt = dueOnHull({ hull: blow * (st.guns.braced ? BRACE_TAKEN : 1), sail: 0 });   // SEA-SET: the Captain's Due
    const dealt = Math.min(Math.round(hurt.hull), ramRoom(st.damage));
    st.damage.apply({ hull: dealt, sail: 0, crew: ramMen(dealt, deps.random(), PLAYER_CREW_TOUGHNESS) }, now);   // CREW-HOLD: my boat's crew
    landed(bow, f, 3.5);
    deps.mid?.(t('naval.ram.taken', '{ship} rams you!', { ship: deps.called(e) }), 2);
    recoil(e, blow, now);
    return true;
  }
  /** A galley's ram on a ship of my sea she fights. */
  function onShip(e, x, f, bow, now) {
    const box = deps.hullBox(x.boat);
    if (!box || !flatInside(box, bow, RAM_REACH)) return;
    const xv = velocityOf(x.ship);
    const closing = e.ship.speed - (xv[0] * f[0] + xv[2] * f[2]);
    if (closing < RAM_SPEED) return;
    galleyAt.set(e, now);
    const blow = ramBlow({ closing, square: ramSquare(f, forwardOfYaw(x.ship.yaw)), mine: e.ship.damage.maxHull, hers: x.ship.damage.maxHull, galley: true });
    const dealt = Math.min(blow, ramRoom(x.ship.damage));
    landed(bow, f);
    deps.strike(x, { hull: dealt, sail: 0, crew: ramMen(dealt, deps.random()) }, e.id);
    recoil(e, blow, now);
  }
  /** Each captain's galley that rams the ship she fights, this step. */
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
      if (x && x !== e && !x.owner && fighting(x)) onShip(e, x, f, bow, now);
    }
  }

  return { helm, galleys };
}
