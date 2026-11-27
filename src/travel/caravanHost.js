// @ts-check
import { counterOf, keepsCounter, reportAt, yields, escortOffer, escortPay, escortNear, FRIEND_DISCOUNT, ESCORT_KEEP_M, ESCORT_LOST_MIN, ESCORT_FIGHT, WARE_KEY } from '../systems/livingWorld/caravanDoor.js';
import { partyAt, membersAt, NATIVE_PER_M, WALK_TO_H } from '../systems/livingWorld/trips.js';
import { firstNameOf } from '../systems/livingWorld/lines.js';
import { mintResident } from '../systems/livingWorld/census.js';
import { placeKeyOf } from '../systems/livingWorld/lives.js';
import { CRIMES } from '../justice/crimes.js';

export const CARAVAN_LINES = Object.freeze({
  ask: (name) => `${name}: "What'll it be, traveler?"`,
  hired: (name, pay) => `${name}: "Good. ${pay} gold when we're in, more for every fight we win. Keep up."`,
  noCoin: (name) => `${name}: "I've no more coin this trip."`,
  bandTook: (name) => `${name}: "Coin? The outlaws took every septim we had, and half the goods besides."`,
  yield: (name) => `${name}: "Take it! Take what you want - just let us be!"`,
  paid: (name, gold) => `${name}: "We're in, and in one piece. ${gold} gold, as agreed."`,
  paidRobbed: (name, gold) => `${name}: "We're in - robbed, but alive. ${gold} gold, as agreed."`,
  broken: (name) => `${name} hired you to keep up. The contract is broken.`,
  turned: (name) => `${name}'s caravan turned back. There is no pay for a road not finished.`,
  fell: (name) => `${name} did not live to pay you.`,
  betrayed: (name) => `${name} hired you to keep the caravan, not to turn on it. There is no pay.`,
});

/**
 * @param {any} trip
 * @param {number} t
 */
export const bandTook = (trip, t) => trip?.robbed?.by != null && t >= trip.robbed.t;

const TRAVELLER_ID = /^L(\d+)\.t\d+(?:~(\d+))?/;
/**
 * The roster holds census ids only, so a newcomer id (`~<gen>`) is minted from the place it holds; a plain roster
 * lookup finds nobody.
 * @param {string} id
 * @param {(mapId: number) => any} townOf
 * @param {(town: any) => any[]} rosterOf
 */
export function travellerOf(id, townOf, rosterOf) {
  const m = TRAVELLER_ID.exec(String(id ?? ''));
  const town = m ? townOf(Number(m[1]) >>> 0) : null;
  if (!m || !town) return null;
  const key = placeKeyOf({ id });
  const place = rosterOf(town).find((r) => r.id === key) ?? null;
  if (!place || m[2] == null) return place;
  return mintResident(town, place.roll ?? 't', place.slot, place.job, { gen: Number(m[2]), home: place.home, work: place.work, faction: place.faction });
}
/**
 * Returns null when no trip matches and undefined while the town's trips are still being planned, so callers ask
 * again later.
 * @param {string} id
 * @param {number} t
 * @param {(mapId: number) => any} townOf
 * @param {(town: any, t: number) => (any[] | undefined)} tripsOf
 */
export function tripOfId(id, t, townOf, tripsOf) {
  const m = TRAVELLER_ID.exec(String(id ?? ''));
  const town = m ? townOf(Number(m[1]) >>> 0) : null;
  if (!town) return null;
  const trips = tripsOf(town, t);
  return trips === undefined ? undefined : trips.find((tr) => tr.id === id) ?? null;
}

/** @param {{ relations: () => any, clock: () => number, day: (t: number) => number, roads: () => any, findTrip: (res: any, t: number) => any, tripById: (id: string, t: number) => any, resOf: (id: string) => any, slainAt: (res: any, t: number) => boolean, stock: (counter: any, trip: any) => any[], openTrade: (o: any) => boolean, openLoot: (o: any) => boolean, choose: (lines: string[], options: { code: string, label: string, action: () => void }[]) => void, say: (text: string) => void, regionAt: (x: number, z: number) => number, charge: (region: number, crime: number) => void, deadAt: (res: any, t: number) => boolean, here: () => ({ x: number, z: number } | null), level: () => number, pay: (gold: number) => void, goldItem: (n: number) => any, online: () => boolean, travelWith?: (trip: any, until: number) => boolean, travelFree?: () => boolean, }} deps */
export function createCaravanHost(deps) {
  /** @type {Map<string, { items: any[], all: any[], rolled: number[], lost: Set<number>, coin: number, robbed: number | null, sig: string }>} */
  const shelves = new Map();
  const yielded = new Set();
  let known = null;
  const rel = () => {
    const r = deps.relations();
    if (r !== known) { known = r; shelves.clear(); yielded.clear(); }
    return r;
  };
  /** @param {string} tripId */
  const robbedOf = (tripId) => { const r = rel(); return shelves.get(tripId)?.robbed ?? r?.wares?.(tripId)?.robbed ?? null; };
  /** @param {any} s */
  const goneOf = (s) => s.all.filter((/** @type {any} */ it) => !s.items.includes(it) && !s.lost.has(it[WARE_KEY])).map((/** @type {any} */ it) => it[WARE_KEY]);
  /** @param {any} s */
  const partOf = (s) => s.all.filter((/** @type {any} */ it) => s.items.includes(it) && (it.stackCount ?? 1) < s.rolled[it[WARE_KEY]]).map((/** @type {any} */ it) => [it[WARE_KEY], it.stackCount ?? 1]);
  /** @param {any} s */
  const wareOf = (s) => [...goneOf(s), ...partOf(s)];
  /** @param {any} s */
  const sigOf = (s) => `${JSON.stringify(wareOf(s))}|${s.coin}|${s.robbed}`;

  function shelfOf(trip, counter, t = deps.clock()) {
    // Call `rel()` first, because a change of character clears this session's shelves.
    const w = rel()?.wares?.(trip.id);
    let s = shelves.get(trip.id);
    if (!s) {
      const all = deps.stock(counter, trip).map((it, i) => { it[WARE_KEY] = i; return it; });
      const rolled = all.map((it) => it.stackCount ?? 1);
      for (const [place, n] of w?.left ?? []) if (all[place] && n < rolled[place]) all[place].stackCount = n;
      // A band hold-up removes every odd-numbered place into `lost`, which never enters the character's record.
      const lost = new Set(bandTook(trip, t) ? all.filter((it) => it[WARE_KEY] % 2 === 1).map((it) => it[WARE_KEY]) : []);
      s = { all, rolled, lost, items: all.filter((it) => !w?.gone?.has(it[WARE_KEY]) && !lost.has(it[WARE_KEY])), coin: w?.coin ?? 0, robbed: w?.robbed ?? null, sig: '' };
      s.sig = sigOf(s);
      if (shelves.size > 64) shelves.delete(/** @type {string} */ (shelves.keys().next().value));
      shelves.set(trip.id, s);
    } else if (!s.lost.size && bandTook(trip, t)) {
      for (const it of s.all) if (it[WARE_KEY] % 2 === 1) { s.lost.add(it[WARE_KEY]); const i = s.items.indexOf(it); if (i >= 0) s.items.splice(i, 1); }
    }
    return s;
  }
  function keep(trip, extraCoin = 0, robbed = undefined) {
    const s = shelves.get(trip.id);
    const w = rel()?.wares?.(trip.id) ?? null;
    const gone = s ? wareOf(s) : [...(w?.gone ?? []), ...(w?.left ?? [])];
    const coin = (s ? s.coin : (w?.coin ?? 0)) + extraCoin;
    const was = robbed === undefined ? (s ? s.robbed : (w?.robbed ?? null)) : robbed;
    if (s) { s.coin = coin; s.robbed = was; s.sig = sigOf(s); }
    rel()?.setWares?.(trip.id, gone, coin, was);
  }
  // A robbed shelf whose record has left the book is written again, so the robbery and the spent purse persist.
  function flush(r = rel()) {
    if (!r) return;
    for (const [id, sh] of shelves) {
      const sig = sigOf(sh);
      if (sig === sh.sig && (sh.robbed == null || r.wares?.(id))) continue;
      sh.sig = sig;
      r.setWares?.(id, wareOf(sh), sh.coin, sh.robbed);
    }
  }

  /**
   * @param {any} rep
   * @param {number} t
   */
  const voidNow = (rep, t) => !rep.witnesses.some((/** @type {string} */ id) => { const w = deps.resOf(id); return w && !deps.deadAt(w, t); });
  // The victim is never a witness, because the lives' book reads the death one frame late.
  function report(trip, t, crime, who = '', victim = '') {
    const at = partyAt(trip, t);
    if (at.x == null) return false;
    const witnesses = membersAt(trip, t).filter((m) => !deps.deadAt(m, t) && m.id !== victim).map((m) => m.id);
    if (!witnesses.length) return false;
    return rel()?.report?.({ crime, region: deps.regionAt(/** @type {number} */ (at.x), /** @type {number} */ (at.z)), at: reportAt(trip, t), who, witnesses, trip: trip.id }, (/** @type {any} */ rep) => voidNow(rep, t)) ?? false;
  }
  const partyOf = (res) => deps.roads()?.parties?.().find((p) => p.trip.party.some((m) => m.id === res?.id))?.trip ?? null;

  function openCounter(trip, res, t, mode = 'Buy') {
    const counter = counterOf(trip);
    if (!counter) return false;
    const s = shelfOf(trip, counter);
    const name = firstNameOf(res.name);
    if (s.robbed != null) {
      const left = bandTook(trip, deps.clock()) ? 0 : Math.max(0, counter.purse - s.coin);
      if (left > 0) { s.items.push(deps.goldItem(left)); keep(trip, left); }
      return deps.openLoot({ items: s.items, title: counter.name });
    }
    const at = partyAt(trip, t);
    const friend = rel()?.standing?.(res.id, deps.day(t)) === 'friend';
    const b = { buildingType: counter.buildingType, quality: counter.quality, name: counter.name, buildingKey: null,
      regionIndex: deps.regionAt(/** @type {number} */ (at.x ?? 0), /** @type {number} */ (at.z ?? 0)), roadDiscount: friend ? FRIEND_DISCOUNT : 0 };
    return deps.openTrade({
      shelf: s, b, mode,
      allow: (mode, staged, price) => {
        if ((mode === 'Sell' || mode === 'SellMagic') && bandTook(trip, deps.clock())) { deps.say(CARAVAN_LINES.bandTook(name)); return false; }
        if ((mode === 'Sell' || mode === 'SellMagic') && s.coin + price > counter.purse) { deps.say(CARAVAN_LINES.noCoin(name)); return false; }
        return true;
      },
      done: (mode, staged, price) => keep(trip, mode === 'Sell' || mode === 'SellMagic' ? price : 0),
      caught: () => {
        const day = deps.day(deps.clock());
        for (const m of membersAt(trip, deps.clock())) rel()?.note?.(m.id, 'crime', day);
        report(trip, deps.clock(), CRIMES.Theft, trip.leader?.name ?? '');
      },
    });
  }

  function hire(trip, res, t) {
    const pay = escortPay(trip, deps.level(), 0, t);
    rel()?.setEscort?.({ trip: trip.id, t, pay, fights: 0, leader: res.id, to: trip.to?.mapId ?? 0, near: t });
    deps.say(CARAVAN_LINES.hired(firstNameOf(res.name), pay));
  }
  function travel(trip, until) {
    if (!deps.travelWith?.(trip, until)) return;
    const c = rel()?.escort?.();
    if (c?.trip === trip.id) rel().setEscort({ ...c, near: Math.max(c.near ?? until, until) });
  }

  function nextStop(trip, t) {
    const stops = [trip.outT1];
    if (trip.enc && trip.enc.t0 > t && trip.enc.t0 < trip.outT1) stops.push(trip.enc.t0 - 1);
    const dusk = Math.floor(t / 1440) * 1440 + WALK_TO_H * 60;
    stops.push(dusk > t ? dusk : dusk + 1440);
    return Math.min(...stops);
  }

  return {
    /**
     * @param {any} person
     * @param {() => void} talk
     */
    offers(person, talk) {
      const res = person?.living?.res;
      if (!res) return false;
      const t = deps.clock();
      const trip = deps.findTrip(res, t);
      if (!trip || trip.leader?.id !== res.id) return false;
      const options = [];
      const name = firstNameOf(res.name);
      const contract = rel()?.escort?.() ?? null;
      const robbed = robbedOf(trip.id) != null;
      if (keepsCounter(trip, res, t)) {
        if (robbed) options.push({ code: 'KeyT', label: 'T: take', action: () => openCounter(trip, res, t) });
        else {
          options.push({ code: 'KeyB', label: 'B: buy', action: () => openCounter(trip, res, t, 'Buy') });
          options.push({ code: 'KeyS', label: 'S: sell', action: () => openCounter(trip, res, t, 'Sell') });
        }
      }
      if (!contract && !robbed && escortOffer(trip, t)) options.push({ code: 'KeyH', label: `H: hire on (${escortPay(trip, deps.level(), 0, t)} gold)`, action: () => hire(trip, res, t) });
      if (contract?.trip === trip.id && !deps.online() && deps.travelWith && deps.travelFree?.() && t < trip.outT1) options.push({ code: 'KeyR', label: 'R: travel on with them', action: () => travel(trip, nextStop(trip, t)) });
      if (!options.length) return false;
      options.push({ code: 'KeyA', label: 'A: talk', action: () => talk() });
      options.push({ code: 'Escape', label: 'Esc: goodbye', action: () => {} });
      deps.choose([CARAVAN_LINES.ask(name)], options);
      return true;
    },
    /**
     * @param {any} res
     * @param {number} t
     */
    slain(res, t) { const trip = partyOf(res); return trip ? report(trip, t, CRIMES.Murder, res.name, res.id) : false; },
    /**
     * @param {any} res
     * @param {number} t
     */
    caught(res, t) { const trip = partyOf(res); return trip ? report(trip, t, CRIMES.Pickpocketing, res.name ?? '') : false; },
    /** @param {string} tripId */
    robbed: (tripId) => robbedOf(tripId),
    step() {
      const t = deps.clock();
      const r = rel();
      if (!r) return;
      flush(r);
      const here = deps.here();
      for (const p of deps.roads()?.parties?.() ?? []) {
        const trip = p.trip;
        if (yielded.has(trip.id) || !counterOf(trip) || robbedOf(trip.id) != null) continue;
        const at = partyAt(trip, t);
        if (!here || at.x == null || Math.hypot(here.x - /** @type {number} */ (at.x), here.z - /** @type {number} */ (at.z)) / NATIVE_PER_M > ESCORT_KEEP_M) continue;
        if (!yields(trip, t, (m) => deps.slainAt(m, t))) continue;
        yielded.add(trip.id);
        keep(trip, 0, t);
        report(trip, t, CRIMES.Theft, trip.leader?.name ?? '');
        deps.say(CARAVAN_LINES.yield(firstNameOf(trip.leader.name)));
      }
      for (const rep of [...(r.reports?.() ?? [])]) {
        // A report whose witnesses are all dead is dropped before it is due, so void reports cannot push real ones
        // out of the full book.
        if (t < rep.at && voidNow(rep, t)) { r.dropReport(rep); continue; }
        if (t < rep.at) continue;
        const trip = rep.trip ? deps.tripById(rep.trip, rep.at) : null;
        if (trip === undefined) continue;
        const stood = trip ? new Set(membersAt(trip, rep.at).map((m) => m.id)) : null;
        const alive = rep.witnesses.some((id) => { const w = deps.resOf(id); return w && (!stood || stood.has(id)) && !deps.deadAt(w, rep.at); });
        if (alive) deps.charge(rep.region, rep.crime);
        if (alive && rep.crime !== CRIMES.Murder && rep.who && rep.region >= 0) r.turn('held', `R${rep.region >>> 0}.${rep.at}~${rep.crime}`, { t: rep.at, who: rep.who });
        r.dropReport(rep);
      }
      let c = r.escort?.();
      if (!c) return;
      const trip = deps.tripById(c.trip, c.t);
      if (trip === undefined) return;
      if (!trip) { r.setEscort(null); return; }
      const lead = c.leader;
      const leader = deps.resOf(lead);
      const name = firstNameOf(leader?.name ?? '');
      const robbedAt = robbedOf(trip.id);
      if ((robbedAt != null && robbedAt >= c.t) || trip.party.some((/** @type {any} */ m) => deps.slainAt(m, t) && !deps.slainAt(m, c.t))) { deps.say(CARAVAN_LINES.betrayed(name)); r.setEscort(null); return; }
      const end = Math.min(t, trip.outT1);
      if ((leader && deps.deadAt(leader, end)) || !membersAt(trip, end).some((m) => m.id === lead)) { deps.say(CARAVAN_LINES.fell(name)); r.setEscort(null); return; }
      if (trip.turned && t >= trip.outT1) { deps.say(trip.fallen?.some((f) => f.res?.id === lead) ? CARAVAN_LINES.fell(name) : CARAVAN_LINES.turned(name)); r.setEscort(null); return; }
      if (trip.enc && trip.enc.t0 >= c.t && r.turns?.().won?.has(trip.enc.id) && !c.fights) { c = { ...c, fights: trip.enc.foes?.length ?? 1 }; r.setEscort(c); }
      if (t < trip.outT0) return;
      const was = Math.max(c.near ?? c.t, c.t, trip.outT0);
      const near = escortNear(trip, here, was, end);
      if (end - near > ESCORT_LOST_MIN) {
        deps.say(CARAVAN_LINES.broken(name));
        if (leader) r.note(leader.id, 'insulted', deps.day(t));
        r.setEscort(null);
        return;
      }
      if (near !== c.near) { c = { ...c, near }; r.setEscort(c); }
      if (t >= trip.outT1) {
        const gold = c.pay + ESCORT_FIGHT * c.fights;
        deps.pay(gold);
        for (const m of membersAt(trip, end)) r.note(m.id, 'helped', deps.day(t));
        deps.say(bandTook(trip, end) ? CARAVAN_LINES.paidRobbed(name, gold) : CARAVAN_LINES.paid(name, gold));
        r.setEscort(null);
      }
    },
    // Call before a save snapshot so shelf changes made since the last step reach the character's record.
    flush: () => flush(),
    /** @param {any} trip */
    shelfOf: (trip) => { const c = counterOf(trip); return c ? shelfOf(trip, c) : null; },
    reset() { shelves.clear(); yielded.clear(); },
  };
}
