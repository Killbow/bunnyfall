// @ts-check
import { fleetShip, titleDeed, forgetShip, shipLabel, fleetCrossed } from './fleet.js';
import {
  SHIPYARD_HULLS, shipSpec, shipyardItem, shipBuyPrice, shipSalePrice, shipWorth, saleRefusal, SHIPYARD_TEXT, BOAT_DEED_TEMPLATE, BOAT_PARTS_TEMPLATE,
} from './shipyards.js';
import { recruitsOf, enlistPlan, recruitFee, hireCharge, recruitDay, CREW_HALL_TEXT } from './crewHall.js';
import { DOCK_REFUSED } from './quays.js';
import { CREWED_HULLS } from './fleetHost.js';
import { MOBILE } from './navalBoarding.js';
import { createCrewSignBook } from './crewSignBook.js';
import { crewSignOf } from '../../net/crewSignLaw.js';

export const SHIPYARD_PAGES = Object.freeze(['ships', 'fleet', 'yard', 'refits', 'crew']);
// A laid-up ship counts as at hand at any port, since the fleet can bring it round.
export const AT_HAND = Object.freeze(['here', 'sailing', 'laidup']);
const said = (ok, text, extra = {}) => ({ ok, text, ...extra });

/** @param {any} deps */
export function createShipyardHost(deps) {
  const fleet = () => deps.fleet?.() ?? null;
  const naval = () => deps.naval?.() ?? null;
  const csa = () => deps.csa?.() ?? null;
  const gold = () => Math.max(0, Math.floor(Number(deps.gold?.() ?? 0) || 0));
  const skills = () => deps.skills?.() ?? { mercantile: 0, personality: 50 };
  const signs = deps.signs ?? createCrewSignBook({ live: () => !!deps.online?.(), character: () => deps.online?.() || null });
  const held = new Set();
  const letGo = (hand) => { if (hand?.hall && signs.live()) signs.release(hand.hall); };

  function ships() {
    const f = fleet();
    if (!f) return [];
    const rows = f.model().ships;
    return rows.map((row) => ({ row, rec: fleetShip(row.uid), at: f.whereIs(fleetShip(row.uid)) }));
  }
  function holdOf(s) {
    if (s.at.where === 'here' || s.at.where === 'sailing') return s.at.boat?.Cargo?.Items?.length ?? 0;
    const held = csa()?.state?.PackedCargoes?.get?.(String(s.row.uid));
    return held?.length ?? 0;
  }
  const ashoreOf = (s) => (deps.ashore ? deps.ashore(s.row.uid) : s.at.boat ? naval()?.awayOf?.(s.at.boat)?.size ?? 0 : 0);
  function serving(list) {
    const out = new Set();
    for (const s of list) if (CREWED_HULLS.includes(s.row.hull) && s.at.boat) for (const h of naval()?.crewHands?.(s.at.boat) ?? []) if (h.hall) out.add(h.hall);
    return out;
  }

  function saleWhy(s) {
    const why = saleRefusal({
      where: s.at.where, hold: holdOf(s), ashore: ashoreOf(s), fighting: !!s.row.status?.inFight,
      aboard: s.at.boat && s.at.where === 'here' ? deps.passengersAboard?.(s.at.boat) ?? 0 : 0, atPort: true, crossed: fleetCrossed(s.row.uid),
    });
    if (why) return why;
    if ((deps.cabinHolds?.(s.row.uid) ?? 0) > 0) return 'Empty the cabin first. Anything left in it is sold with the ship.';
    return null;
  }
  function saleOf(s) {
    const st = s.row.status;
    const share = st && st.maxHull > 0 ? st.hull / st.maxHull : 1;
    const worth = shipWorth(s.rec, share);
    return { worth, offer: shipSalePrice(worth, skills()) };
  }

  /**
   * @param {any} site
   * @param {{ page?: string, uid?: number|null }} [view]
   */
  function model(site, view = {}) {
    const page = SHIPYARD_PAGES.includes(/** @type {any} */ (view.page)) ? view.page : 'ships';
    const purse = gold(), sk = skills();
    const list = ships();
    const base = {
      page, title: site?.name ?? 'The Shipyard', keeper: site?.keeper?.name ?? '', crewName: site?.crewName ?? 'The Crew Hall',
      crewmaster: site?.crewmaster?.name ?? '', town: site?.townName ?? '', gold: purse, sailing: !!csa(), sea: !!naval(),
    };
    const atHand = list.filter((s) => AT_HAND.includes(s.at.where));
    const pick = (cands) => cands.find((s) => s.row.uid === view.uid) ?? cands[0] ?? null;
    const choice = (cands) => cands.map((s) => ({ uid: s.row.uid, label: s.row.label, hullName: s.row.hullName }));
    if (page === 'ships') {
      return {
        ...base,
        ships: SHIPYARD_HULLS.map((hull) => {
          const spec = shipSpec(hull), price = shipBuyPrice(spec.price, sk);
          return { ...spec, asked: price, docks: !DOCK_REFUSED.includes(hull), why: !csa() ? SHIPYARD_TEXT.noSail : purse < price ? SHIPYARD_TEXT.short(price) : null };
        }),
      };
    }
    if (page === 'fleet') {
      return {
        ...base,
        fleet: list.map((s) => {
          const { worth, offer } = saleOf(s);
          return { ...s.row, worth, offer, sell: saleWhy(s) };
        }),
      };
    }
    if (page === 'yard') {
      const cands = atHand.filter((s) => s.row.can?.yard == null);
      const s = pick(cands);
      return { ...base, choices: choice(cands), uid: s?.row.uid ?? null, ship: s?.row ?? null, yard: s && s.at.boat ? naval()?.yardModelOf?.(s.at.boat) ?? null : null,
        why: !naval() ? 'Turn on Naval Combat to use the shipwrights.' : cands.length ? null : 'No ship of yours lies at this port or laid up.' };
    }
    if (page === 'refits') {
      const cands = atHand.filter((s) => s.row.can?.refit == null || s.row.loan);
      const s = pick(cands);
      return { ...base, choices: choice(cands), uid: s?.row.uid ?? null, ship: s?.row ?? null, refit: s ? fleet()?.offer?.(s.row.uid) ?? null : null,
        why: cands.length ? null : 'No ship of yours lies at this port or laid up.' };
    }
    const crewed = atHand.filter((s) => CREWED_HULLS.includes(s.row.hull) && s.at.boat);
    const s = pick(crewed);
    const day = Math.floor(Number(deps.day?.() ?? 0) || 0);
    const signed = signs.taken(site?.mapId ?? 0, day);
    const recruits = recruitsOf({ mapId: site?.mapId ?? 0, day, regionIndex: site?.regionIndex ?? -1, serving: serving(list) })
      .filter((r) => !signed.slots.has(crewSignOf(r.id)?.slot ?? -1));
    let room = null, hands = [];
    if (s && naval()) {
      const away = naval().awayOf?.(s.at.boat);
      hands = naval().crewHands(s.at.boat).map((h, i) => ({ name: h.name, role: h.role, fights: h.fights | 0, boardings: h.boardings | 0, mobile: h.mobile, bard: h.mobile === MOBILE.Bard, gender: h.gender, ashore: !!away?.has?.(i) }));
      const st = s.row.status;
      room = st ? enlistPlan({ hull: s.row.hull, crew: st.crew, maxCrew: st.maxCrew, hands: hands.length }) : null;
    }
    const fighting = !!s?.row.status?.inFight;
    const swappable = hands.some((h) => !h.ashore);
    const priceOf = (r) => (room?.ok ? hireCharge(r.fee, room.raise) : r.fee);
    const whyOf = (r) => (!naval() ? CREW_HALL_TEXT.noSea : !s ? CREW_HALL_TEXT.noShip : fighting ? CREW_HALL_TEXT.fighting
      : room && !room.ok && !room.full ? room.why : room?.full && !swappable ? CREW_HALL_TEXT.ashore('The whole crew')
        : purse < priceOf(r) ? CREW_HALL_TEXT.short(priceOf(r)) : null);
    return {
      ...base, choices: choice(crewed), uid: s?.row.uid ?? null, ship: s?.row ?? null, hands, room, fighting,
      recruits: recruits.map((r) => ({ ...r, price: priceOf(r), swap: !!room?.full, why: whyOf(r) })),
      why: !naval() ? CREW_HALL_TEXT.noSea : crewed.length ? (fighting ? CREW_HALL_TEXT.fighting : null) : CREW_HALL_TEXT.noShip,
      wait: signed.wait,
    };
  }

  /**
   * @param {any} site
   * @param {string} verb
   * @param {any} [a]
   * @param {any} [b]
   */
  function act(site, verb, a, b) {
    const f = fleet();
    if (verb === 'buy') {
      const hull = Number(a);
      if (!SHIPYARD_HULLS.includes(hull)) return said(false, 'The shipmaster builds no such ship.');
      if (!csa()) return said(false, SHIPYARD_TEXT.noSail);
      const price = shipBuyPrice(shipSpec(hull).price, skills());
      if (gold() < price) return said(false, SHIPYARD_TEXT.short(price));
      const it = shipyardItem(hull, deps.mintUid());
      // The carry check runs before payment, so a refused purchase spends no gold.
      if (it.templateIndex !== BOAT_DEED_TEMPLATE && deps.canCarry && !deps.canCarry(it)) return said(false, SHIPYARD_TEXT.heavy(it.name));
      deps.pay?.(price);
      if (it.templateIndex === BOAT_DEED_TEMPLATE) {
        const rec = titleDeed(it, { port: site?.townName ? { name: site.townName } : null });
        deps.traded?.();
        deps.changed?.();
        return said(true, SHIPYARD_TEXT.bought(shipLabel(rec), site?.townName), { uid: it.UID, page: 'fleet' });
      }
      deps.addToPack?.(it);
      deps.traded?.();
      return said(true, SHIPYARD_TEXT.boughtParts(it.name), { uid: it.UID });
    }
    const uid = Number(a);
    const rec = fleetShip(uid);
    if (!f || !rec) return said(false, 'No such ship of yours.');
    const s = ships().find((x) => x.row.uid === uid);
    if (!s) return said(false, 'No such ship of yours here.');
    const name = shipLabel(rec);
    if (verb === 'sell') {
      const why = saleWhy(s);
      if (why) return said(false, why);
      const { offer } = saleOf(s);
      const c = csa();
      // Cancel a placement armed with this ship's item first, or its click would place the sold ship again.
      if (c?.state?.placing && c.state.placeItem?.UID === uid) c.StopPlacing?.();
      if (s.at.where === 'here' && !csa()?.LayUpBoat?.(s.at.boat)) return said(false, 'The ship couldn\'t be brought in to be sold.');
      if (s.at.where === 'packed') {
        const pack = deps.pack?.() ?? [];
        const i = pack.findIndex((it) => it?.templateIndex === BOAT_PARTS_TEMPLATE && it.UID === uid);
        if (i >= 0) pack.splice(i, 1);
      }
      deps.cabinSold?.(uid, site?.regionIndex ?? 0);
      if (s.at.boat) for (const h of naval()?.crewHands?.(s.at.boat) ?? []) letGo(h);
      forgetShip(uid);
      (deps.forgetBoat ?? ((u) => naval()?.forgetBoat?.(u)))(uid);
      csa()?.forgetHold?.(uid);
      deps.credit?.(offer);
      deps.traded?.();
      deps.changed?.();
      return said(true, SHIPYARD_TEXT.sold(name, offer), { gold: offer });
    }
    if (verb === 'summon' || verb === 'away' || verb === 'rename' || verb === 'refit' || verb === 'role') {
      // The mod keeps an armed placement, so a new summons cancels it, or the next click places the other ship.
      if (verb === 'summon') { const c = csa(); if (c?.state?.placing) c.StopPlacing?.(); }
      return f.act(uid, verb === 'refit' ? 'refit' : verb, b);
    }
    if (verb === 'hire' || verb === 'payoff') {
      const n = naval();
      if (!n) return said(false, CREW_HALL_TEXT.noSea);
      if (!CREWED_HULLS.includes(rec.hull) || !s.at.boat || !AT_HAND.includes(s.at.where)) return said(false, CREW_HALL_TEXT.noShip);
      if (s.row.status?.inFight) return said(false, CREW_HALL_TEXT.fighting);
      if (verb === 'payoff') {
        const r = n.releaseHand(s.at.boat, String(b ?? ''));
        if (!r.ok) return said(false, r.text);
        letGo(r.hand);
        return said(true, r.next ? CREW_HALL_TEXT.steppedUp(r.hand.name, name, r.next.name) : CREW_HALL_TEXT.paidOff(r.hand.name, name));
      }
      const plan = hirePlan(site, s, rec, n, name, b);
      if (!plan.go) return plan;
      // Online, the service holds the recruit first. The act then reruns with the hold, since the world may have
      // changed meanwhile, and a refused rerun releases a hold that this call took.
      if (!signs.live() || held.has(plan.recruit.id)) return plan.go();
      const id = plan.recruit.id;
      return signs.sign(id).then((k) => {
        if (!k.ok) return said(false, k.text);
        held.add(id);
        let r;
        try { r = act(site, verb, a, b); } finally { held.delete(id); }
        if (!r?.ok && k.fresh) signs.release(id);
        return r;
      });
    }
    return said(false, 'Not here.');
  }

  /**
   * @param {any} site
   * @param {any} s
   * @param {any} rec
   * @param {any} n
   * @param {string} name
   * @param {any} b
   * @returns {any}
   */
  function hirePlan(site, s, rec, n, name, b) {
    const id = typeof b === 'object' && b ? b.id : b;
    const replace = typeof b === 'object' && b && typeof b.replace === 'string' && b.replace ? b.replace : null;
    const day = deps.day?.() ?? 0;
    const all = recruitsOf({ mapId: site?.mapId ?? 0, day, regionIndex: site?.regionIndex ?? -1, serving: serving(ships()) });
    const recruit = all.find((r) => r.id === id);
    if (!recruit) return said(false, recruitDay(id) !== Math.floor(Number(day) || 0) ? CREW_HALL_TEXT.newDay : CREW_HALL_TEXT.gone);
    const fee = recruitFee(recruit.grade, recruit.trade);
    if (replace) {
      if (gold() < fee) return said(false, CREW_HALL_TEXT.short(fee));
      return { recruit, go: () => {
        const r = n.swapHand(s.at.boat, replace, recruit);
        if (!r.ok) return said(false, r.text);
        deps.pay?.(fee);
        letGo(r.out);
        return said(true, CREW_HALL_TEXT.swapped(recruit.name, r.hand.role, name, r.out?.name ?? replace));
      } };
    }
    const st = s.row.status;
    const plan = st ? enlistPlan({ hull: rec.hull, crew: st.crew, maxCrew: st.maxCrew, hands: n.crewHands(s.at.boat).length }) : null;
    const cost = plan?.ok ? hireCharge(fee, plan.raise) : fee;
    if (gold() < cost) return said(false, CREW_HALL_TEXT.short(cost));
    return { recruit, go: () => {
      const r = n.enlistHand(s.at.boat, recruit);
      if (!r.ok) return said(false, r.full ? CREW_HALL_TEXT.full : r.text);
      deps.pay?.(hireCharge(fee, r.raise ?? 0));
      return said(true, CREW_HALL_TEXT.signed(recruit.name, r.hand.role, name));
    } };
  }

  return { model, act };
}
