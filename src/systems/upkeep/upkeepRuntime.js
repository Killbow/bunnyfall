// @ts-check
import { activeHorseItem, birthHorses, isHorseItem, describeHorseLook, horseLookOf } from '../../travel/horseCoats.js';
import { activeWagonItem, wagonHorsesOf, wagonKindOf } from '../../travel/wagonKinds.js';
import {
  steedStats, stepBreath, freshBreath, breathShare, canGallop, steedSpeedScale, teamDraftScale, tendHorses, feedHorse,
  chooseRiddenHorse, horsesIn, steedFoodOf, STEED_TEXT, SKIP_MINUTES, HUNGER, STEED_STATS, STEED_STAT_TEXT, fedUntil,
  FULL_AHEAD, BOND_TIERS,
} from '../../travel/steedCare.js';
import {
  wagonState, wagonSoundness, wagonCondition, wagonConditionMax, rollWear, journeyWear, createWearAccount, wearWagon,
  wagonPace, mendPrice, kitMendWagon, wagonWord, WAGON_UPKEEP_TEXT, THROWN_WEAR, WAGON_KIT_CEILING,
} from '../../travel/wagonUpkeep.js';
import { isWagonKitItem, UPKEEP_ITEM } from './upkeepItemRows.js';
import { registerItemUseHandler } from '../../items/itemTemplates.js';
import { HORSE_MODE, WAGON_MODE, TRANSPORT } from '../../travel/horseCartLaw.js';

export const BREATH_LOW = 0.25;
/** @param {number} bond */
export function bondWay(bond) {
  const next = BOND_TIERS.find((x) => x.min > bond) ?? null;
  return { tierAt: [...BOND_TIERS].reverse().find((x) => bond >= x.min)?.min ?? 0, next: next ? { name: next.name, at: next.min } : null };
}

/**
 * @param {{ items: () => any[], now: () => number, horseCare?: () => any, wagonUpkeep?: () => any,
 *   where?: () => string, stores?: () => any[], say?: (text: string) => void }} deps
 */
export function createUpkeep({ items, now, horseCare = () => null, wagonUpkeep = () => null, where = () => 'with', stores = () => [], say = () => {} }) {
  // Breath lives only here, keyed by horse seed and never saved; a skipped span (SKIP_MINUTES) restores it whole.
  /** @type {Map<number, { spent: number, winded: boolean }>} */
  const breaths = new Map();
  let lastNow = /** @type {number|null} */ (null);
  let tendedAt = /** @type {number|null} */ (null);
  let wasRiding = false, wasWinded = false;
  const wear = createWearAccount();
  let lastState = /** @type {string|null} */ (null);
  let lastWagon = /** @type {any} */ (null);

  const pack = () => { const it = items(); return Array.isArray(it) ? it : []; };
  const store = () => { const s = stores(); return Array.isArray(s) ? s : []; };
  const breathOf = (horse) => { const s = horse?.horseSeed | 0; if (!breaths.has(s)) breaths.set(s, freshBreath()); return /** @type {{ spent: number, winded: boolean }} */ (breaths.get(s)); };
  const ridden = () => activeHorseItem(pack());

  function sayWorn(item, after, wcare) {
    if (!after || after.key === 'sound' || after.key === 'worn') return;
    const name = wagonWord(item), slows = !!wcare?.wearSlows;
    if (after.key === 'failing') say(slows ? WAGON_UPKEEP_TEXT.failing(name) : WAGON_UPKEEP_TEXT.failingBoons(name));
    else say(slows ? WAGON_UPKEEP_TEXT.rickety(name) : WAGON_UPKEEP_TEXT.ricketyBoons(name));
  }

  /**
   * @param {number} dt
   * @param {{ mode?: string, galloping?: boolean, moving?: boolean, metres?: number, road?: boolean, load?: number, wagonGoes?: boolean }} [f]
   */
  function tick(dt, { mode = 'Foot', galloping = false, moving = false, metres = 0, road = true, load = 0, wagonGoes = false } = {}) {
    const its = pack(), t = now();
    if (!Number.isFinite(t)) return;
    const skipped = lastNow != null && t - lastNow >= SKIP_MINUTES;
    const care = horseCare();
    if (care) {
      birthHorses(its);
      if (skipped || tendedAt == null || Math.floor(t) !== tendedAt) {
        const r = tendHorses(its, t, { since: tendedAt ?? lastNow, where: where(), stores: store(), rules: care });
        if (r.ate) say(STEED_TEXT.ateOnTheRoad(r.ate));
        tendedAt = Math.floor(t);
      }
      if (skipped) breaths.clear();
      const horse = activeHorseItem(its);
      const riding = mode === 'Horse';
      if (horse) {
        const st = steedStats(horse, t, care);
        if (st) {
          const b = stepBreath(breathOf(horse), { stats: st.stats, hunger: st.hunger, galloping: riding && galloping, ridden: riding && moving, dt, rules: care });
          breaths.set(horse.horseSeed | 0, b);
          if (b.winded && !wasWinded && riding) say(STEED_TEXT.winded);
          else if (!b.winded && wasWinded && riding) say(STEED_TEXT.rested);
          wasWinded = b.winded;
          if (riding && !wasRiding && st.hunger !== 'fed') say(st.hunger === 'starving' ? STEED_TEXT.starving : 'Your horse is hungry.');
        }
      }
      wasRiding = riding;
    } else {
      breaths.clear(); wasRiding = false; wasWinded = false; tendedAt = null;
      // With horse care Off a horse needs nothing: its food clock moves with time and resumes where Off found it.
      if (lastNow != null && t > lastNow) {
        for (const h of its) if (isHorseItem(h) && Number.isInteger(h.horseFed) && h.horseFed > 0) h.horseFed = Math.round(h.horseFed + (t - lastNow));
      }
    }
    const wcare = wagonUpkeep();
    if (wcare) {
      const w = activeWagonItem(its);
      if (w !== lastWagon) { lastWagon = w; lastState = w ? wagonState(w).key : null; }
      if (w && wagonGoes && metres > 0 && metres < 1000) {
        const r = wear.add(w, rollWear(metres, { kind: wagonKindOf(w), road, load }));
        if (r && r.after.key !== r.before.key) sayWorn(w, r.after, wcare);
      }
      if (w) lastState = wagonState(w).key;
    }
    lastNow = t;
  }

  /**
   * @param {string} mode
   * @param {number} [load]
   */
  function rideScale(mode, load = 0) {
    const its = pack(), t = now();
    const care = horseCare();
    if (mode === 'Horse') {
      if (!care) return 1;
      const st = steedStats(activeHorseItem(its), t, care);
      return st ? steedSpeedScale(st.stats.speed, care) : 1;
    }
    if (mode === 'Cart') {
      let k = 1;
      const w = activeWagonItem(its);
      const wcare = wagonUpkeep();
      if (wcare && w) k *= wagonPace(w, wcare);
      if (care && w) {
        const team = horsesIn(its).slice(0, wagonHorsesOf(wagonKindOf(w)));
        const strengths = team.map((h) => steedStats(h, t, care)?.stats.strength).filter((v) => Number.isFinite(v));
        if (strengths.length) k *= teamDraftScale(strengths.reduce((a, b) => a + b, 0) / strengths.length, load, care);
      }
      return k;
    }
    return 1;
  }

  /**
   * @param {string} mode
   * @param {boolean|null} base
   */
  function gallopGate(mode, base) {
    const care = horseCare();
    if (!care || mode !== 'Horse') return null;
    if (base === false) return false;
    const horse = ridden();
    const st = steedStats(horse, now(), care);
    if (!st) return base;
    return canGallop(breathOf(horse), st.hunger);
  }

  /**
   * @param {string} mode
   * @param {boolean} [runAsked]
   */
  function rideWalks(mode, runAsked = false) {
    const care = horseCare();
    if (!care || mode !== 'Horse') return false;
    if (runAsked && !care.refusedRunWalks) return false;
    return !!steedStats(ridden(), now(), care);
  }

  /** @param {string} mode */
  const riderPaysGallop = (mode) => !(!!horseCare() && mode === 'Horse' && !!ridden());

  /** @param {string} mode */
  function bar(mode) {
    const care = horseCare();
    if (!care || mode !== 'Horse') return null;
    const horse = ridden();
    const st = steedStats(horse, now(), care);
    if (!st) return null;
    const b = breathOf(horse), amount = breathShare(b, st.stats);
    return { amount, low: b.winded || amount < BREATH_LOW || st.hunger === 'starving' };
  }

  function journey(days) {
    const wcare = wagonUpkeep();
    if (!wcare) return null;
    const w = activeWagonItem(pack());
    const r = w ? wearWagon(w, journeyWear(days)) : null;
    if (r && r.after.key !== r.before.key) sayWorn(w, r.after, wcare);
    return r;
  }
  function thrown() {
    const wcare = wagonUpkeep();
    if (!wcare) return null;
    const w = activeWagonItem(pack());
    const r = w ? wearWagon(w, THROWN_WEAR) : null;
    if (r && r.after.key !== r.before.key) sayWorn(w, r.after, wcare);
    return r;
  }

  function supplies() {
    const out = { oats: 0, apples: 0, kits: 0 };
    for (const it of [...pack(), ...store()]) {
      const food = steedFoodOf(it)?.key;
      if (food === 'oats') out.oats += it.stackCount ?? 1;
      else if (food === 'apple') out.apples += it.stackCount ?? 1;
      if (isWagonKitItem(it)) out.kits += it.stackCount ?? 1;
    }
    return out;
  }
  function wagonCard(w, wcare) {
    const s = wagonState(w), share = wagonSoundness(w);
    return {
      name: wagonWord(w), state: s.name, stateKey: s.key, tone: s.tone, condition: wagonCondition(w), max: wagonConditionMax(w), share,
      tier: wcare?.id ?? null, wearSlows: !!wcare?.wearSlows,
      kitWorks: share < WAGON_KIT_CEILING, mend: mendPrice(w), mendAway: mendPrice(w, { away: true }),
    };
  }

  function model({ near = true, name = '' } = {}) {
    const its = pack(), t = now();
    const care = horseCare();
    const wcare = wagonUpkeep();
    const out = { horseCare: !!care, tier: care?.id ?? null, hungerCosts: !!care?.hungerCosts, wagonUpkeep: !!wcare, near: !!near, horses: /** @type {any[]} */ ([]), wagon: /** @type {any} */ (null), ...supplies() };
    horsesIn(its).forEach((h, i) => {
      const own = { i, ridden: i === 0, name: i === 0 && name ? name : null, look: describeHorseLook(horseLookOf(h)) };
      if (!care) { out.horses.push(own); return; }
      const st = steedStats(h, t, care);
      if (!st) return;
      const f = fedUntil(h);
      out.horses.push({
        ...own,
        stats: STEED_STATS.map((k) => ({ key: k, name: STEED_STAT_TEXT[k], born: st.born[k], now: st.stats[k] })),
        ...bondWay(st.bond), bond: st.bond, tier: st.tier, bonus: st.bonus, penalty: st.penalty, hunger: HUNGER[st.hunger].name, hungerKey: st.hunger,
        fedHours: f != null && f > t ? (f - t) / 60 : 0, full: f != null && f - t >= FULL_AHEAD,
        breath: i === 0 ? breathShare(breathOf(h), st.stats) : 1, winded: i === 0 && !!breathOf(h).winded,
      });
    });
    const w = activeWagonItem(its);
    if (wcare && w) out.wagon = wagonCard(w, wcare);
    return out;
  }

  /** @param {string} mode */
  function saddle(mode) {
    const its = pack(), t = now();
    const out = { horse: /** @type {any} */ (null), wagon: /** @type {any} */ (null), ...supplies() };
    const care = horseCare();
    if (care) {
      const h = ridden(), st = steedStats(h, t, care);
      if (st) {
        const riding = mode === 'Horse', b = breathOf(h);
        const horses = horsesIn(its), w = activeWagonItem(its);
        const team = riding || !w ? [h] : horses.slice(0, Math.max(1, wagonHorsesOf(wagonKindOf(w))));
        const needy = team.reduce((a, x) => ((fedUntil(x) ?? Infinity) < (fedUntil(a) ?? Infinity) ? x : a), h);
        const ns = steedStats(needy, t, care) ?? st, f = fedUntil(needy);
        out.horse = {
          breath: riding ? breathShare(b, st.stats) : null, winded: riding && !!b.winded,
          hunger: HUNGER[ns.hunger].name, hungerKey: ns.hunger, fedHours: f != null && f > t ? (f - t) / 60 : 0,
          full: f != null && f - t >= FULL_AHEAD, feed: Math.max(0, horses.indexOf(needy)), team: team.length,
          tier: st.tier, bond: st.bond, ...bondWay(st.bond),
          hungerCosts: !!care.hungerCosts,
        };
      }
    }
    const wcare = wagonUpkeep();
    const w = wcare ? activeWagonItem(its) : null;
    if (w) out.wagon = wagonCard(w, wcare);
    return out;
  }

  /**
   * @param {string} verb
   * @param {any} arg
   * @param {{ near?: boolean, stabled?: boolean, wagonNear?: boolean, pass?: (m: number) => void, who?: string, from?: any[]|null, piece?: any }} [o]
   */
  function act(verb, arg, { near = true, stabled = false, wagonNear = true, pass = () => {}, who = 'Your horse', from = null, piece = null } = {}) {
    const its = pack(), t = now();
    if (verb === 'ride') return chooseRiddenHorse(its, Number(arg) | 0);
    if (verb === 'feed' || verb === 'treat') {
      const care = horseCare();
      if (!care) return { ok: false, text: 'Not here.' };
      const horse = horsesIn(its)[Number(arg) | 0];
      if (!horse) return { ok: false, text: STEED_TEXT.noHorse };
      if (stabled) return { ok: false, text: STEED_TEXT.stabled };
      if (!near) return { ok: false, text: STEED_TEXT.notHere };
      const kind = verb === 'feed' ? 'oats' : 'apple';
      const list = from ?? (steedFoodOf(its.find((x) => steedFoodOf(x)?.key === kind)) ? its : store().some((x) => steedFoodOf(x)?.key === kind) ? store() : its);
      return feedHorse(its, horse, kind, t, (Number(arg) | 0) === 0 ? who : 'Your horse', { from: list, food: piece, rules: care });
    }
    if (verb === 'kit') {
      if (!wagonUpkeep()) return { ok: false, text: 'Not here.' };
      const w = activeWagonItem(its);
      if (!w) return { ok: false, text: WAGON_UPKEEP_TEXT.noWagon };
      if (!wagonNear) return { ok: false, text: WAGON_UPKEEP_TEXT.kitNotNear(wagonWord(w)) };
      const list = from ?? (its.some(isWagonKitItem) ? its : store().some(isWagonKitItem) ? store() : its);
      const kit = piece && isWagonKitItem(piece) && list.includes(piece) ? piece : list.find(isWagonKitItem);
      if (!kit) return { ok: false, text: 'You have no Wagon Repair Kit. A Wagon Yard sells them.' };
      const r = kitMendWagon(w);
      if (!r.ok) return r;
      if ((kit.stackCount ?? 1) > 1) kit.stackCount--; else list.splice(list.indexOf(kit), 1);
      pass(60);
      lastState = wagonState(w).key;
      return r;
    }
    return { ok: false, text: 'Not here.' };
  }

  return {
    tick, rideScale, gallopGate, rideWalks, riderPaysGallop, bar, journey, thrown, model, saddle, act,
    mendPrice: (away = false) => { const w = activeWagonItem(pack()); return w ? mendPrice(w, { away }) : 0; },
    breathOf: () => { const h = ridden(); return h ? { ...breathOf(h) } : null; },
    reset() { breaths.clear(); lastNow = null; tendedAt = null; wasRiding = false; wasWinded = false; lastWagon = null; lastState = null; },
  };
}

/** @param {any} view */
export function horseWhereOf(view) {
  if (!view || !view.persistence || !view.hasHorse) return 'with';
  if (view.transport === TRANSPORT.Horse || view.transport === TRANSPORT.Cart) return 'with';
  if (view.horseMode === HORSE_MODE.FollowingPlayer) return 'with';
  if (view.wagonMode === WAGON_MODE.FollowingPlayer && view.horseMode === HORSE_MODE.HitchedToWagon) return 'with';
  if (view.horseMode === HORSE_MODE.LooseStationary) return 'waiting';
  if (view.horseMode === HORSE_MODE.HitchedToWagon && view.wagonMode === WAGON_MODE.Deployed) return 'waiting';
  return view.horseStabled ? 'stabled' : 'with';
}

export function upkeepReach(runtime, on) {
  const v = on ? runtime?.stableView?.() ?? null : null;
  const persistent = !!v?.persistence;
  return {
    near: !persistent || !!runtime?.canMountHorseFromTransportWindow?.(),
    stabled: horseWhereOf(v) === 'stabled',
    wagonNear: !persistent || !!runtime?.canAccessWagonInventory?.()?.allowed,
    who: v?.horseName || 'Your horse',
  };
}

// The registry holds one handler per template, so the host that registers last answers.
/**
 * @param {ReturnType<typeof createUpkeep>} upkeep
 * @param {{ reach: () => any, pass: (minutes: number) => void, horseCare: () => any, wagonUpkeep: () => any }} o
 */
export function registerUpkeepUses(upkeep, { reach, pass, horseCare, wagonUpkeep }) {
  registerItemUseHandler(UPKEEP_ITEM.Oats, Object.assign((item, collection) => {
    if (!horseCare()) return null;
    const r = upkeep.act('feed', 0, { ...reach(), from: collection, piece: item, pass });
    return { kind: 'upkeep', text: r.text };
  }, { usable: () => !!horseCare() }));
  registerItemUseHandler(UPKEEP_ITEM.WagonKit, Object.assign((item, collection) => {
    if (!wagonUpkeep()) return null;
    const r = upkeep.act('kit', 0, { ...reach(), from: collection, piece: item, pass });
    return { kind: 'upkeep', text: r.text };
  }, { usable: () => !!wagonUpkeep() }));
}

export const horsesBorn = (items) => (Array.isArray(items) ? items.filter(isHorseItem).every((h) => Number.isInteger(h.horseSeed) && h.horseSeed > 0) : true);
