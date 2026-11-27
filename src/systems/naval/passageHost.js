// @ts-check
import { ListPickerWindow } from '../../ui/listPicker.js';
import { YesNoBoxWindow } from '../../ui/yesNoBox.js';
import { addItem } from '../../items/inventory.js';
import { hullBuild } from './navalShips.js';
import { createPassageCastOff } from './passageCastOff.js';
import { playerEntity, surfacePlayer } from '../../characters/playerEntity.js';
import { totalGoldAmount, deductGold } from '../../justice/court.js';
import {
  passageDestinations, charterRecord, PASSAGE_TEXT, PASSAGE_LEAVE_M, PASSAGE_OFF_S, PASSAGE_RESUME_S, PASSAGE_FIRST_S, PASSAGE_RESUMES, PASSAGE_SLOW,
} from './passage.js';

export const hullReach = (hull) => { const b = hullBuild(hull); return Math.max(Math.abs(b.bowZ ?? 0), Math.abs(b.aftZ ?? 0)); };

/** @param {any} deps */
export function createPassageHost(deps) {
  const csa = () => deps.csa?.() ?? null;
  let idle = 0, fails = 0, first = true, said = null, off = 0, clockOf = null;
  const resetClock = (boat, fresh) => { idle = 0; fails = 0; first = fresh; said = null; off = 0; clockOf = boat; };
  const charterBoat = () => csa()?.AllBoats?.find((b) => b?.charter) ?? null;
  const gold = () => Math.max(0, Math.floor(Number(deps.gold ? deps.gold() : totalGoldAmount(playerEntity)) || 0));
  const pay = (n) => { if (deps.pay) deps.pay(n); else { deductGold(playerEntity, n); surfacePlayer(); } };
  const pack = () => deps.pack?.() ?? (playerEntity.items ??= []);
  const say = (text) => deps.talk.say(text);
  const show = (win) => deps.talk.showOverlay(win);
  const feet = () => deps.player.feetAt();
  const aboard = (b) => csa()?.state?.CurrentBoat === b || !!deps.standsOn?.(b) || deps.naval?.()?.boatInPlay?.() === b;
  const journeyLive = () => !!deps.travel?.()?.isTravelActive;
  const stopJourney = () => deps.travel?.()?.clearTravelDestination?.();
  const castOff = createPassageCastOff({ harbours: () => deps.naval?.()?.harbourList?.() ?? [], isWater: (x, z, h) => !!deps.isWater?.(x, z, h) });

  function offer(ship) {
    if (!csa()) { say(PASSAGE_TEXT.noSail); return false; }
    if (charterBoat()) { say(PASSAGE_TEXT.booking); return false; }
    if (deps.ether?.(deps.pixel())) { say(PASSAGE_TEXT.ether); return false; }
    const list = passageDestinations(deps.ports?.() ?? [], deps.pixel(), { hereKey: deps.here?.()?.key ?? null, known: (p) => !!deps.place(p) });
    if (!list.length) { say(PASSAGE_TEXT.none); return false; }
    show(new ListPickerWindow({ items: list.map(PASSAGE_TEXT.row), onPick: (i) => { if (list[i]) ask(ship, list[i]); } }));
    return true;
  }
  function ask(ship, d) {
    show(new YesNoBoxWindow({ rows: PASSAGE_TEXT.ask(ship.name, d.port.name, d.fare, gold()), onYes: () => book(ship, d) }));
  }
  function book(ship, d) {
    const r = csa(), n = deps.naval?.();
    if (!r || !n) { say(PASSAGE_TEXT.noSail); return false; }
    if (charterBoat()) { say(PASSAGE_TEXT.booking); return false; }
    if (gold() < d.fare) { say(PASSAGE_TEXT.poor(d.fare)); return false; }
    const summary = deps.place(d.port);
    if (!summary || !deps.canGo()) return false;
    const record = charterRecord({ to: { name: d.port.name, px: d.port.px, py: d.port.py }, ship: ship.name, captain: ship.captain, fare: d.fare });
    const stood = [...feet()], ride = deps.player.transportMode ?? null;
    const boat = n.charter(ship.id, record);
    if (!boat) { say(PASSAGE_TEXT.gone); return false; }
    let helm = false, sails = false;
    try {
      castOff.begin(boat);
      r.StartSailing(boat);
      helm = r.isSailing() && r.state?.CurrentBoat === boat;
      sails = helm && deps.route(summary, { voyage: true, noWay: () => say(PASSAGE_TEXT.noWay) });
    } catch (err) { console.warn('[passage] her voyage would not begin', err); stopJourney(); }
    if (!sails) {
      try { if (r.isSailing()) r.StopSailing(); } catch (err) { console.warn('[passage] her helm would not be left', err); }
      castOff.forget(boat);
      deps.player.spawn(stood[0], stood[1], stood[2]);
      if (ride != null) deps.remount?.(ride);
      remove(boat);
      if (!helm) say(PASSAGE_TEXT.failed);
      return false;
    }
    // All or nothing: her ship is let go and the fare paid only once the journey is under way.
    n.charterSailed(ship.id);
    pay(d.fare);
    resetClock(boat, false);
    say(PASSAGE_TEXT.booked(ship.name, ship.captain, d.fare, d.port.name));
    return true;
  }
  function remove(boat) {
    const r = csa();
    if (!r || !boat) return false;
    // Lay up first: a lay-up refused while a player is aboard must leave the hold untouched.
    if (!r.LayUpBoat(boat)) return false;
    const held = r.laidUpHold?.(boat.uid) ?? [];
    const goods = held.length > 0;
    if (goods) { const into = pack(); for (const it of held.splice(0)) addItem(into, it); }
    r.forgetHold?.(boat.uid);
    deps.naval?.()?.forgetBoat?.(boat.uid);
    if (goods) say(PASSAGE_TEXT.goods);
    return true;
  }
  function end(boat) {
    const name = boat.charter?.ship ?? null;
    if (!remove(boat)) return false;
    castOff.forget(boat);
    resetClock(null, true);
    say(PASSAGE_TEXT.ended(name));
    return true;
  }
  function frame(dt, paused = false) {
    const r = csa();
    const boat = r ? charterBoat() : null;
    // Not during a world move: the feet are not yet where it put them.
    if (!boat || paused || deps.busy?.()) return;
    if (boat !== clockOf) resetClock(boat, true);
    // A load restores the hull's own flag, so it is set every frame and the crossing never plans a second launch.
    boat.packable = false;
    if (!aboard(boat)) {
      const f = feet(), p = boat.GameObject?.position;
      // Off her past her hull's reach for PASSAGE_OFF_S, so a jump or a fall through a hatch is not leaving.
      const far = !p || !f || Math.hypot(p[0] - f[0], p[2] - f[2]) > PASSAGE_LEAVE_M + hullReach(boat.hull);
      off = far ? off + Math.max(0, dt) : 0;
      if (off >= PASSAGE_OFF_S) end(boat);
      return;
    }
    off = 0;
    const rec = charterRecord(boat.charter);
    if (!rec) return;
    if (journeyLive()) {
      const to = deps.journeyTo?.();
      if (to && (to === 'spot' || to.x !== rec.to.px || to.y !== rec.to.py)) { stopJourney(); say(PASSAGE_TEXT.holds(rec.to.name)); idle = 0; first = true; return; }
      if (deps.naval?.()?.bringIn?.(boat)) { stopJourney(); said = null; say(PASSAGE_TEXT.comesIn(rec.ship, rec.to.name)); }
      idle = 0;
      return;
    }
    const quay = deps.naval?.()?.berthing?.(boat) ?? null;
    if (quay === 'fast') { if (said !== 'fast') { said = 'fast'; if (r.isSailing() && r.state?.CurrentBoat === boat) r.StopSailing(); say(PASSAGE_TEXT.madeFast(rec.ship, rec.to.name)); } idle = 0; return; }
    if (quay === 'in') {
      if (!(r.isSailing() && r.state?.CurrentBoat === boat) && said !== 'helm') { said = 'helm'; say(PASSAGE_TEXT.helm(rec.to.name)); }
      idle = 0;
      return;
    }
    if (quay === 'foul') say(PASSAGE_TEXT.quayFoul);
    idle += Math.max(0, dt);
    if (idle < (first ? PASSAGE_FIRST_S : fails >= PASSAGE_RESUMES ? PASSAGE_RESUME_S * PASSAGE_SLOW : PASSAGE_RESUME_S)) return;
    idle = 0;
    if (!r.isSailing() || r.state?.CurrentBoat !== boat) { if (said !== 'helm') { said = 'helm'; say(PASSAGE_TEXT.helm(rec.to.name)); } return; }
    first = false;
    const summary = deps.place({ name: rec.to.name, px: rec.to.px, py: rec.to.py });
    // An enemy nearby is waited out without spending a try.
    if (!summary || !deps.canGo()) return;
    if (deps.route(summary, { voyage: true, noWay: () => {} })) { fails = 0; said = null; return; }
    if (++fails === PASSAGE_RESUMES) { said = 'stuck'; say(PASSAGE_TEXT.stuck(rec.to.name)); }
  }
  return { offer, book, frame, end, charterBoat, castOff: castOff.step };
}
