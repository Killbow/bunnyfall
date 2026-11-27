// @ts-check
// The one door into a ship's hold: the ship at hand (helm, deck, or cabin), else the last helm taken, else the
// first ship in the fleet book. The hold is the player's own save data, so opening it from afar shares nothing.
import { cargoLootTarget } from './comeSailAwayItems.js';
import { CARGO_CONTAINER_IMAGE } from './comeSailAwayBoat.js';
import { seaHoldShut, seaHoldShutText } from './seaHoldGuard.js';
import { t } from '../../ui/textManager.js';
import { fleetShips, titleOf as titleDeedOf } from './fleet.js';

export const HULL_HOLDS = Object.freeze([false, true, true, true, true]);
export const holdsCargo = (hull) => !!HULL_HOLDS[hull];
// Every boat has cargo, and the sea can fill a Rowboat that has no box to open it by.
const opens = (hull, items) => holdsCargo(hull) || (Array.isArray(items) && items.length > 0);

/**
 * @param {any} deps
 */
export function createHoldDoor(deps) {
  let lastHelm = null;
  const csa = () => deps.csa?.() ?? null;
  const afloat = (uid) => (csa()?.AllBoats ?? []).find((b) => b?.uid != null && String(b.uid) === String(uid)) ?? null;
  const said = (ok, text) => { if (text) deps.say?.(text); return ok; };
  const ships = () => deps.ships?.() ?? fleetShips();

  function atHand() {
    const r = csa();
    if (r?.isSailing?.() && r.state?.CurrentBoat) return r.state.CurrentBoat;
    const deck = deps.aboard?.() ?? null;
    if (deck) return deck;
    const cabin = deps.cabin?.() ?? null;
    return cabin ? afloat(cabin.uid) : null;
  }

  const titleOf = (uid) => { const n = uid != null ? deps.nameOf?.(uid) ?? '' : ''; return n ? t('naval.hold.titleNamed', '{name}\'s hold', { name: n }) : t('naval.hold.title', 'Ship\'s hold'); };

  function openBoat(boat) {
    if (!boat?.Cargo) return said(false, t('naval.hold.none', 'There\'s no hold here.'));
    if (!opens(boat.hull, boat.Cargo.Items)) return said(false, t('naval.hold.rowboat', 'Rowboats have no hold.'));
    if (seaHoldShut(boat.uid)) return said(false, seaHoldShutText());
    return !!deps.openHold?.({ ...cargoLootTarget(boat.Cargo), title: titleOf(boat.uid) });
  }

  function openShip(uid) {
    const boat = afloat(uid);
    if (boat) return openBoat(boat);
    const rec = ships().find((s) => String(s.uid) === String(uid)) ?? null;
    if (!rec) return said(false, t('naval.hold.notYours', 'You don\'t own that ship.'));
    const r = csa();
    if (!holdsCargo(rec.hull) && !r?.laidUpHold?.(uid)?.length) return said(false, t('naval.hold.rowboat', 'Rowboats have no hold.'));
    if (!r?.laidUpHold) return said(false, t('naval.hold.noSea', 'Come Sail Away is not running.'));
    const items = r.laidUpHold(uid);
    const parts = deps.partsOf?.(uid) ?? null;
    // Parts weigh her timbers alone, so nothing stowed here makes them heavier.
    const onClose = parts ? () => {
      const at = items.indexOf(parts);
      if (at >= 0) { items.splice(at, 1); deps.toPack?.(parts); }
    } : null;
    return !!deps.openHold?.({ ...cargoLootTarget({ Items: items, ContainerImage: CARGO_CONTAINER_IMAGE, playerOwned: true }), title: titleOf(uid), ...(onClose ? { onClose } : {}) });
  }

  return {
    atHand, openBoat, openShip,
    press() {
      const here = atHand();
      if (here && (!here.Cargo || opens(here.hull, here.Cargo.Items))) return openBoat(here);
      const mine = ships().filter((s) => holdsCargo(s.hull) && (afloat(s.uid) || deps.partsOf?.(s.uid) || titleDeedOf(s.uid)));
      const pick = (lastHelm != null && mine.find((s) => String(s.uid) === String(lastHelm))) || mine[0] || null;
      if (!pick) return said(false, t('naval.hold.noShip', 'You have no ship with a hold.'));
      return openShip(pick.uid);
    },
    frame() {
      const r = csa();
      const b = r?.isSailing?.() ? r.state?.CurrentBoat : null;
      if (b?.uid != null && holdsCargo(b.hull)) lastHelm = b.uid;
    },
    get lastHelm() { return lastHelm; },
  };
}
