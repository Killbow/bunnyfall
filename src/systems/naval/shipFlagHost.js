// @ts-check
import { flownFlag, flagKey, flagSizeOf } from './shipFlag.js';
import { flyOf, FLAGS_MAX } from '../../render/shipFlagPass.js';

// Each boat waves at a phase hashed from its number, so a fleet at anchor does not wave in step.
export const flagPhaseOf = (uid) => (((Number(uid) >>> 0) * 2654435761) >>> 0) / 0xffffffff * Math.PI * 2;

/**
 * @param {{ myBoats: () => any[], coloursOf: (uid: number) => any, guildArms?: () => any, peerFlags?: () => { boat: any, flag: any }[],
 *   seaFlags?: () => { boat: any, flag: any, phase?: number }[], shown?: () => boolean }} deps
 */
export function createShipFlagHost(deps) {
  /** @type {WeakMap<any, any>} */
  let flown = new WeakMap();
  /** @type {any[]} */
  let list = [];
  const mineOf = (boat) => (boat?.uid ? flownFlag(deps.coloursOf(boat.uid), deps.guildArms?.() ?? null) : null);

  function frame() {
    flown = new WeakMap();
    list = [];
    if (deps.shown && !deps.shown()) return;
    const take = (boat, flag, phase = boat?.uid ?? list.length) => {
      // A boat past the pass cap stays out of flown, so it keeps its pennant instead of an undrawn flag.
      if (!boat || !flag || list.length >= FLAGS_MAX) return;
      const size = flagSizeOf(boat.hull);
      const node = boat.FlagObject;
      if (!size || !node || boat.GameObject?.activeSelf === false || (boat.fade ?? 1) <= 0) return;
      const top = node.position;
      if (!Array.isArray(top) || !top.every(Number.isFinite)) return;
      flown.set(boat, flag);
      list.push({ key: flagKey(flag), flag, top, fly: flyOf(node.forward), size, phase: flagPhaseOf(phase), fade: boat.fade ?? 1 });
    };
    for (const boat of deps.myBoats() ?? []) take(boat, mineOf(boat));
    for (const p of deps.peerFlags?.() ?? []) take(p.boat, p.flag);
    for (const p of deps.seaFlags?.() ?? []) { if (list.length >= FLAGS_MAX) break; take(p.boat, p.flag, p.phase); }
  }

  return {
    frame,
    flies: (boat) => flown.has(boat),
    draws: () => list,
    wireFlag: (boat) => mineOf(boat),
  };
}
