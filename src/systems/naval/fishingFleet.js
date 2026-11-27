// @ts-check
import { classById } from './navalShips.js';
import { fishersOf, fishingWaters, fishingErrand, fisherCatch, fisherPlace } from './fishingBoats.js';
import { mintMaterialItem } from '../../professions/profItems.js';
import { addItem } from '../../items/inventory.js';

/** @param {any} h */
export function createFishingFleet(h) {
  let rolled = new WeakSet();
  // Seeds sunk or taken from each port today. They survive the sea's clear, so none is placed again today.
  const lostByPort = new Map();
  const lostOf = (key, day) => {
    let d = lostByPort.get(key);
    if (!d || d.day !== day) lostByPort.set(key, (d = { day, seeds: new Set() }));
    return d.seeds;
  };
  const afloat = (e) => e.ship.damage.state === h.seaStates.afloat;

  function placed(hb, f, lights) {
    const cls = classById(f.classId);
    if (!cls) return null;
    const waters = fishingWaters({ harbour: hb.harbour, i: f.i, seed: f.seed, hull: cls.hull, isWater: h.isWater, grid: h.grid(cls.hull) });
    return waters ? fishingErrand({ key: hb.key, waters, lights }) : null;
  }

  function frame(seaY) {
    const feet = h.feet(), w = h.where(), day = w.day ?? 0, lights = !!w.cityLights;
    for (const e of h.sea.values()) if (e.fisher && !e.owner && !afloat(e)) lostOf(e.fisher, day).add(e.ship.seed);
    for (const hb of h.harbours.values()) {
      if (!hb.harbour) continue;
      const d = Math.hypot(hb.harbour.mouth[0] - feet[0], hb.harbour.mouth[1] - feet[2]);
      if (d > h.reach.leave) {
        if (rolled.has(hb.harbour)) for (const e of [...h.sea.values()]) if (!e.owner && e.fisher === hb.key && afloat(e)) h.retire(e);
        rolled.delete(hb.harbour);
        continue;
      }
      if (d > h.reach.stand || !h.rolls(hb.harbour.mouth)) continue;
      const fleet = fishersOf(hb.key, day);
      if (rolled.has(hb.harbour)) {
        const own = new Set(fleet.map((f) => f.seed));
        for (const e of [...h.sea.values()]) if (e.owner && e.retiring && own.has(e.ship.seed) && afloat(e)) { h.adopt(e); e.retiring = false; }
        continue;
      }
      rolled.add(hb.harbour);
      const lost = lostOf(hb.key, day);
      for (const f of fleet) {
        const back = [...h.sea.values()].find((x) => !x.owner && x.retiring && x.ship.seed === f.seed && x.fisher === hb.key);
        if (back) { back.retiring = false; continue; }
        if (lost.has(f.seed) || [...h.sea.values()].some((x) => x.ship.seed === f.seed && x.ship.damage.state !== h.seaStates.sunk)) continue;
        const at = placed(hb, f, lights);
        if (!at) continue;
        // The bob phase comes from the seed, so it takes no draw from the sea's shared stream.
        const e = h.launch({ seed: f.seed, classId: f.classId, variant: 0, pos: [at.pos[0], seaY, at.pos[1]], yaw: at.yaw, errand: at.errand, phase: (f.seed % 628) / 100 });
        if (!e) continue;
        e.fisher = hb.key;
        if (lights) { e.ship.sails = 0; e.ship.sailsWant = 0; }
      }
    }
  }

  function errandOf(ship) {
    const day = h.where().day ?? 0, lights = !!h.where().cityLights;
    const hs = [...h.harbours.values()].filter((x) => x.harbour);
    const place = fisherPlace(ship.seed, hs, [day, day - 1]);
    const hb = place ? hs.find((x) => x.key === place.key) : null;
    const at = hb ? placed(hb, { i: place.i, seed: ship.seed, classId: ship.cls.id }, lights) : null;
    if (!at) return null;
    if (!lights) return { ...at.errand, kind: 'fish' };
    return { ...at.errand, kind: Math.hypot(ship.pos[0] - at.errand.to[0], ship.pos[2] - at.errand.to[1]) <= 20 ? 'anchor' : 'home' };
  }

  function catchOf(cls, seed) {
    const out = [];
    const { count } = fisherCatch(cls.id, seed);
    for (let i = 0; i < count; i++) { const it = mintMaterialItem('food:fish'); if (it) addItem(out, it); }
    return out;
  }

  function clear() { rolled = new WeakSet(); }

  return { frame, errandOf, catchOf, clear };
}
