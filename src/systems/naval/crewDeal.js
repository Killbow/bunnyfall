// @ts-check
import { crewSpare, crewRoom, signOffOrder } from './crewTrade.js';
import { playerCrewCount } from './crewLife.js';
import { fleetCrossed } from './fleet.js';
import { charterRecord } from './passage.js';

/**
 * @param {any} boat
 * @param {any} st
 * @param {(boat: any) => readonly { name: string }[]} sync
 * @param {{ awayOf: (uid: any) => { has: (name: string) => boolean } }} companions
 */
export function crewDealOf(boat, st, sync, companions) {
  const d = st.damage;
  const away = () => (boat?.uid ? companions.awayOf(boat.uid) : null);
  const named = () => st.crew.hands.map((h) => ({ name: h.name, role: h.role }));
  function stands() {
    const crewed = !!boat?.crewed && d.maxCrew > 0;
    const hands = crewed ? sync(boat) : [];
    const spare = crewSpare({ hull: boat.hull, crew: d.crew, hands, away: away(), crossed: !!boat.uid && fleetCrossed(boat.uid) });
    return { crewed, charter: !!charterRecord(boat?.charter), crew: d.crew, maxCrew: d.maxCrew, fighting: !!st.inFight, room: crewRoom(d), spare: spare.n, why: spare.why };
  }
  return {
    stands,
    /** @param {number} k */
    signOn(k) {
      const was = d.crew, before = new Set(st.crew.hands.map((h) => h.name));
      d.muster(was + Math.max(0, Math.floor(Number(k) || 0)));
      st.lastCrew = d.crew;
      sync(boat);
      return { n: d.crew - was, joined: named().filter((h) => !before.has(h.name)) };
    },
    /** @param {number} k */
    signOff(k) {
      const n = Math.min(Math.max(0, Math.floor(Number(k) || 0)), stands().spare);
      if (n <= 0) return { n: 0, left: [] };
      const was = d.crew;
      const going = signOffOrder(st.crew.hands, away()).slice(0, Math.max(0, st.crew.hands.length - playerCrewCount(boat.hull, was - n)));
      for (const h of going) st.crew.release(h.name);
      d.discharge(was - n);
      st.lastCrew = d.crew;
      sync(boat);
      return { n: was - d.crew, left: going.map((h) => ({ name: h.name, role: h.role })) };
    },
  };
}
