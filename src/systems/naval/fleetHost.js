// @ts-check
import {
  fleetShip, fleetShips, fleetBook, titleOf, titleDeedsIn, knowShip, renameShip, addRefit, setShipPort, retitle, refitOf, loanOwed, settleCredit,
  shipLabel, upgradeCost, materialCount, UPGRADE_LINES, UPGRADE_TIERS, MATERIALS, BOAT_PARTS_TEMPLATE, setShipColours,
  REFIT_NUMERALS, meltCounts, materialsFor, takeAllMaterials, refitShare, setShipLivery, setShipCabin, setShipFittings, setShipPlaque,
} from './fleet.js';
import { captainRefit } from './captainTree.js';
import { flagSizeOf } from './shipFlag.js';
import { liveryPartsOf, isPaint } from './shipLivery.js';
import { cabinShipType } from './sailingCabin.js';
import { SHIP_TYPES } from '../../trade/banking.js';
import { HULL_NAMES, HULL_PRICES } from './comeSailAwayBoat.js';
import { mintDeed } from './comeSailAwayItems.js';
import { TERRAIN_EDGE } from './comeSailAway.js';
import { batteriesOf } from './navalShips.js';
import { CREW_ORDERS, CREW_ROLES } from './shipCrew.js';
import { MOBILE } from './navalBoarding.js';
import { optionPath } from '../../ui/settingsMap.js';
import { holdsCargo } from './holdDoor.js';
import { t } from '../../ui/textManager.js';
import { etherWildRingAt } from '../../world/wild/etherWild.js';
import { inEther } from '../../world/ethericSea.js';

export const CREWED_HULLS = Object.freeze([2, 3, 4]);
export const hasGuns = (hull) => batteriesOf(hull).some((b) => b.gun !== 'barrel');
const COMPASS = Object.freeze(['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east']);
export function compassWay(dx, dy) {
  if (!dx && !dy) return null;
  const turn = Math.round(Math.atan2(-dy, dx) / (Math.PI / 4));
  return COMPASS[(turn + 8) % 8];
}

export function createFleetHost(deps) {
  const csa = () => deps.csa?.() ?? null;
  const naval = () => deps.naval?.() ?? null;
  const pack = () => deps.pack?.() ?? [];
  const placed = () => (csa()?.AllBoats ?? []).filter((b) => b?.uid && !b.charter);
  const partsOf = (uid) => pack().find((it) => it?.templateIndex === BOAT_PARTS_TEMPLATE && it.UID === uid) ?? null;
  const standIn = (rec) => ({ uid: rec.uid, hull: rec.hull, variant: rec.variant, crewed: CREWED_HULLS.includes(rec.hull), Cargo: { Items: csa()?.laidUpHold?.(rec.uid) ?? [] }, laidUp: true });

  // A placing can be cancelled: clear her old port only once she lies on a new map pixel.
  const handed = new Map();
  function sweep() {
    titleDeedsIn(pack(), { except: csa()?.state?.placeItem ?? null });
    for (const b of placed()) knowShip(b.uid, b.hull, b.variant, b.itemValue);
    for (const [uid, h] of handed) {
      if (csa()?.state?.placeItem?.UID === uid) continue;
      handed.delete(uid);
      const b = placed().find((x) => x.uid === uid);
      if (b && (b.MapPixel?.X !== h.px?.X || b.MapPixel?.Y !== h.px?.Y) && fleetShip(uid)?.port === h.port) setShipPort(uid, null);
    }
    settleCredit(deps.accounts?.());
    for (const it of pack()) if (it?.templateIndex === BOAT_PARTS_TEMPLATE && it.UID) knowShip(it.UID, Math.floor((it.message | 0) / 10), (it.message | 0) % 10, it.value);
  }

  function whereIs(rec) {
    const r = csa();
    const boat = placed().find((b) => b.uid === rec.uid) ?? null;
    if (boat) {
      const sailing = !!r?.isSailing?.() && r.state?.CurrentBoat === boat;
      return { where: sailing ? 'sailing' : boat.GameObject?.activeSelf ? 'here' : 'away', boat };
    }
    if (partsOf(rec.uid)) return { where: 'packed', boat: null };
    if (titleOf(rec.uid)) return { where: 'laidup', boat: standIn(rec) };
    return { where: 'lost', boat: null };
  }
  function bearing(boat) {
    const w = deps.where?.() ?? null;
    if (!w || !boat) return { metres: null, way: null };
    if (boat.GameObject?.activeSelf && w.feet) {
      const p = boat.GameObject.position;
      return { metres: Math.round(Math.hypot(p[0] - w.feet[0], p[2] - w.feet[2])), way: null };
    }
    const mp = boat.MapPixel;
    if (!mp || !w.pixel) return { metres: null, way: null };
    const dx = mp.X - w.pixel.X, dy = mp.Y - w.pixel.Y;
    return { metres: Math.round(Math.hypot(dx, dy) * TERRAIN_EDGE), way: compassWay(dx, dy) };
  }

  function refusals(rec, at) {
    const w = deps.where?.() ?? {};
    const r = csa(), n = naval();
    const st = at.boat ? n?.fleetStatus?.(at.boat) ?? null : null;
    const crewed = CREWED_HULLS.includes(rec.hull);
    const inFight = !!st?.inFight || (at.where !== 'laidup' && at.where !== 'packed' && !!n?.hostileNear?.());
    const atPort = !!deps.nearPort?.();
    const loan = loanOwed(rec, deps.accounts?.());
    const sailing = !!r?.isSailing?.();
    const apart = !!deps.veilApart?.(rec, at.boat ?? null);
    // Online, the open sea past Veilhaven is a PvP zone. No Fleet order moves a ship into, out of, or about it
    // unless the player is at a port isle (Veilhaven included) and not at a helm.
    const atPortIsle = atPort && !sailing && inEther(w.pixel?.X, w.pixel?.Y);
    const openSea = !!w.sea && !atPortIsle && (etherWildRingAt(w.pixel?.X, w.pixel?.Y) > 0 || (!!at.boat?.MapPixel && etherWildRingAt(at.boat.MapPixel.X, at.boat.MapPixel.Y) > 0));
    const summon = !r ? 'Come Sail Away is not running.'
      : at.where === 'sailing' || at.where === 'here' ? 'This ship is already here.'
      : at.where === 'packed' ? 'This ship is in your pack. Launch it from its parts.'
      : w.inside ? 'Go outdoors to summon a ship.'
      : sailing ? 'Not while you are at a helm.'
      : inFight ? 'Not while the ship is in combat.'
      : apart ? 'This ship is on the other side of the Veil. Sail it across yourself.'
      : openSea ? t('naval.fleet.openSeaSummon', 'Not on the open sea. Sail the ship there yourself.')
      : !atPort ? 'Ships can only be summoned to a port. Go to one first.'
      : null;
    const away = !r ? 'Come Sail Away is not running.'
      : at.where === 'laidup' ? 'This ship is already laid up.'
      : at.where === 'packed' ? 'This ship is in your pack.'
      : at.where === 'sailing' ? 'Not while you are at the helm.'
      : inFight ? 'Not while the ship is in combat.'
      : !crewed && at.where !== 'here' ? 'This ship has no crew to sail it to port. Go to it yourself.'
      : apart ? 'This ship is on the other side of the Veil. The crew won\'t take it across without you.'
      : openSea ? t('naval.fleet.openSeaAway', 'Not on the open sea. The crew won\'t sail it through without you.')
      : (deps.passengersAboard?.(at.boat) ?? 0) > 0 ? 'Another player is aboard.'
      : null;
    const repair = !crewed ? 'This ship has no crew to make repairs.'
      : at.where === 'packed' ? 'This ship is in your pack.'
      : !st ? 'Not here.'
      : st.crew <= 0 ? 'This ship has no crew aboard. Hire crew at a shipwright.'
      : !st.wants && !st.fire ? 'This ship doesn\'t need repairs.'
      : st.inFight ? 'The crew is busy fighting.'
      : null;
    const yard = !n ? `Shipwrights need Naval Combat turned on (${optionPath('feat:naval-combat')}).`
      : !atPort ? 'A shipwright works at a port.'
      : at.where === 'away' || at.where === 'packed' ? 'Bring the ship to this port first.'
      : inFight ? 'Not while the ship is in combat.'
      : null;
    const refit = loan ? `This ship was bought on credit. Pay the ${loan.owed} gold owed to ${deps.regionName?.(loan.region) ?? 'the bank'} first.`
      : !atPort ? 'Ships are refitted at a port.'
      : at.where === 'away' || at.where === 'packed' ? 'Bring the ship to this port first.'
      : inFight ? 'Not while the ship is in combat.'
      : null;
    return { summon, away, repair, yard, refit, st, loan };
  }

  const n0 = () => naval();
  function handsOf(boat) {
    const away = n0()?.awayOf?.(boat) ?? null;
    return (n0()?.crewHands?.(boat) ?? []).map((h, i) => ({ name: h.name, role: h.role, bard: h.mobile === MOBILE.Bard, fights: h.fights | 0, boardings: h.boardings | 0, prior: h.prior | 0, ashore: !!away?.has(i) }));
  }
  function model() {
    sweep();
    const order = { sailing: 0, here: 1, laidup: 2, away: 3, packed: 4 };
    const rows = [];
    for (const rec of fleetShips()) {
      const at = whereIs(rec);
      if (at.where === 'lost') continue;
      const why = refusals(rec, at);
      const b = at.where === 'away' || at.where === 'here' || at.where === 'sailing' ? bearing(at.boat) : { metres: null, way: null };
      rows.push({
        uid: rec.uid, hull: rec.hull, variant: rec.variant, hullName: HULL_NAMES[rec.hull], name: rec.name, label: shipLabel(rec),
        value: Number.isFinite(rec.value) ? rec.value : HULL_PRICES[rec.hull], where: at.where, metres: b.metres, way: b.way,
        port: rec.port?.name ?? null, crewed: CREWED_HULLS.includes(rec.hull), guns: hasGuns(rec.hull),
        docked: at.where === 'here' || at.where === 'sailing' ? n0()?.dockedAt?.(at.boat) ?? null : at.where === 'away' ? rec.port?.name ?? null : null,
        status: why.st, upgrades: { ...rec.upgrades }, loan: why.loan,
        hands: CREWED_HULLS.includes(rec.hull) && at.boat ? handsOf(at.boat) : [],
        hold: holdsCargo(rec.hull),
        flag: !!flagSizeOf(rec.hull), colours: rec.colours ?? null,
        paints: liveryPartsOf(rec.hull), livery: rec.livery ?? null,
        cabin: cabinShipType(rec.hull) !== SHIP_TYPES.None ? rec.cabin ?? 0 : null,
        fittings: rec.deck?.length ?? 0,
        plaque: !!rec.plaque, named: !!rec.name,
        can: { summon: why.summon, away: why.away, repair: why.repair, yard: why.yard, refit: why.refit },
      });
    }
    rows.sort((a, b) => order[a.where] - order[b.where] || a.label.localeCompare(b.label));
    return { ships: rows, gold: deps.gold?.() ?? 0, atPort: !!deps.nearPort?.(), guildArms: deps.guildArms?.() ?? null };
  }

  function offer(uid) {
    const rec = fleetShip(uid);
    if (!rec) return null;
    const at = whereIs(rec);
    const why = refusals(rec, at).refit;
    const lists = [pack(), at.boat?.Cargo?.Items ?? []];
    const gold = deps.gold?.() ?? 0;
    const level = captainLevel();
    const rows = UPGRADE_LINES.filter((l) => !l.guns || hasGuns(rec.hull)).map((l) => {
      const tier = Math.max(0, Math.min(UPGRADE_TIERS, rec.upgrades[l.id] | 0));
      const cost = upgradeCost(rec.hull, l.id, tier);
      const melts = cost ? meltCounts(lists, cost.mats) : [];
      const mats = cost ? cost.mats.map((m, i) => ({ kind: m.kind, label: MATERIALS[m.kind].label, hint: MATERIALS[m.kind].hint, n: m.n, have: materialCount(lists, m.kind), melt: melts[i] })) : [];
      const locked = !!cost && cost.level > level;
      const afford = !!cost && !locked && gold >= cost.gold && materialsFor(lists, cost.mats);
      return {
        id: l.id, label: l.label, what: l.what, per: l.per, tier, max: UPGRADE_TIERS, share: refitShare(l.id, tier),
        next: cost ? { gold: cost.gold, mats, level: cost.level, locked, share: refitShare(l.id, tier + 1) } : null, afford,
      };
    });
    return { why, rows, gold, level };
  }
  const captainLevel = () => deps.captain?.()?.captain?.().level ?? 1;

  const said = (ok, text, door = null) => ({ ok, text, ...(door ? { door } : {}) });

  function act(uid, verb, arg) {
    const rec = fleetShip(uid);
    if (!rec) return said(false, 'No such ship of yours.');
    const at = whereIs(rec);
    const why = refusals(rec, at);
    const r = csa(), n = naval();
    const name = shipLabel(rec);
    if (verb === 'rename') {
      const v = renameShip(uid, arg);
      if (!v.ok) return said(false, v.reason);
      deps.changed?.();
      return said(true, v.name ? `Ship renamed to ${v.name}.` : `Name cleared. The ship is shown as ${shipLabel(rec)}.`);
    }
    if (verb === 'plaque') {
      if (!rec.name) return said(false, t('naval.plaque.unnamed', 'Give the ship a name first.'));
      if (!setShipPlaque(uid, arg)) return said(false, t('naval.plaque.bad', 'That\'s not a valid option.'));
      deps.changed?.();
      return said(true, rec.plaque ? t('naval.plaque.shown', 'Ship name shown on the bow.') : t('naval.plaque.hidden', 'Ship name hidden.'));
    }
    if (verb === 'colours') {
      if (!flagSizeOf(rec.hull)) return said(false, t('naval.flag.noMast', 'This ship has no masthead for a flag.'));
      if (!setShipColours(uid, arg ?? null)) return said(false, t('naval.flag.bad', 'That flag can\'t be used.'));
      deps.changed?.();
      return said(true, arg ? t('naval.flag.hoisted', 'New flag raised.') : t('naval.flag.struck', 'Flag removed. The ship flies the default pennant.'));
    }
    if (verb === 'livery') {
      if (!liveryPartsOf(rec.hull).length) return said(false, t('naval.paint.none', 'This ship can\'t be painted.'));
      const below = cabinShipType(rec.hull) !== SHIP_TYPES.None, cabin = arg?.cabin ?? 0;
      // Both paints are checked before either is set, so a refused paint leaves the ship as she was.
      if ((below && !isPaint(cabin)) || !setShipLivery(uid, arg ?? null)) return said(false, t('naval.paint.bad', 'Unknown paint.'));
      if (below) setShipCabin(uid, cabin);
      deps.changed?.();
      return said(true, rec.livery || rec.cabin ? t('naval.paint.done', 'Ship painted. Other players will see it.') : t('naval.paint.bare', 'Paint removed. The ship is back to its original look.'));
    }
    if (verb === 'deck') {
      if (!setShipFittings(uid, arg ?? [])) return said(false, t('naval.deck.bad', 'Those fittings can\'t be placed on this ship.'));
      deps.changed?.();
      return said(true, rec.deck.length ? t('naval.deck.set', 'Deck layout saved: {n, plural, one {# fitting} other {# fittings}}.', { n: rec.deck.length }) : t('naval.deck.clear', 'Deck cleared.'));
    }
    if (verb === 'deckPlan') {
      if (!deps.openDeck) return said(false, t('naval.hold.noSea', 'Come Sail Away is not running.'));
      return said(true, t('naval.deck.opened', 'Deck plan opened.'), () => !!deps.openDeck(uid));
    }
    if (verb === 'role') {
      if (!CREWED_HULLS.includes(rec.hull) || !at.boat) return said(false, 'This ship has no crew.');
      if (!arg || !(/** @type {readonly string[]} */ (CREW_ROLES).includes(arg.role) || arg.role === 'Bard')) return said(false, 'There\'s no such post on this ship.');
      const r2 = n?.assignRole?.(at.boat, arg.name, arg.role) ?? { ok: false, text: 'Not here.' };
      return said(r2.ok, r2.text);
    }
    if (verb === 'summon') {
      if (why.summon) return said(false, why.summon);
      const title = titleOf(uid);
      const berth = n?.freeBerth?.(rec.hull) ?? null;
      if (berth) {
        const boat = r.SummonBoat(uid, title, fleetBook(), berth.position, berth.direction, deps.terrainAt?.(berth.position) ?? null);
        if (!boat) return said(false, 'The ship couldn\'t be brought here.');
        setShipPort(uid, null);
        return said(true, `${name} is brought to ${berth.harbour ? `${berth.harbour}'s` : 'the'} quay and moored.`);
      }
      if (!title && at.where !== 'away') return said(false, 'The ship couldn\'t be brought here.');
      return said(true, `Choose where ${name} lies: click the water near the quay.`, () => {
        const t = title ?? mintDeed(rec.hull, rec.variant, uid, rec.value);
        // A small boat with no title is placed from a one-off deed in its own list, never minted into the book.
        const list = title ? fleetBook() : [t];
        handed.set(uid, { port: rec.port, px: at.boat?.MapPixel ? { X: at.boat.MapPixel.X, Y: at.boat.MapPixel.Y } : null });
        r.StartPlacing(t, () => list);
        return true;
      });
    }
    if (verb === 'away') {
      if (why.away) return said(false, why.away);
      const near = deps.nearestPort?.() ?? null;
      knowShip(uid, at.boat.hull, at.boat.variant, at.boat.itemValue);
      retitle(uid);
      if (!r.LayUpBoat(at.boat)) return said(false, 'The ship couldn\'t be laid up.');
      setShipPort(uid, near ? { name: near.name, ether: !!near.ether } : null);
      return said(true, near ? `${name} sails for ${near.name}, and is laid up there.` : `${name} is laid up.`);
    }
    if (verb === 'repair') {
      if (why.repair) return said(false, why.repair);
      if (at.boat && at.boat === n?.boatInPlay?.()) {
        const o = n.giveOrder(at.boat, CREW_ORDERS.repair);
        return said(!!o.ok, o.said ?? 'The crew starts repairs.');
      }
      const out = n?.repairAway?.(at.boat) ?? { ok: false, text: 'Not here.' };
      return said(out.ok, out.text);
    }
    if (verb === 'hold') {
      if (!holdsCargo(rec.hull)) return said(false, t('naval.hold.rowboat', 'Rowboats have no hold.'));
      if (!deps.openHold) return said(false, t('naval.hold.noSea', 'Come Sail Away is not running.'));
      return said(true, t('naval.hold.opened', 'Hold opened.'), () => !!deps.openHold(uid));
    }
    if (verb === 'yard') {
      if (why.yard) return said(false, why.yard);
      const boat = at.boat;
      return said(true, 'The shipwright inspects the ship.', () => !!n.openYard(boat));
    }
    if (verb === 'refit') {
      if (why.refit) return said(false, why.refit);
      const o = offer(uid);
      const row = o?.rows.find((x) => x.id === arg);
      if (!row || !row.next) return said(false, 'This ship has every refit of that kind.');
      if (row.next.locked) return said(false, t('naval.refit.level', '{metal} refits need captain level {level}.', { metal: row.next.mats[0].label, level: row.next.level }));
      if ((deps.gold?.() ?? 0) < row.next.gold) return said(false, `The shipwright asks ${row.next.gold} gold.`);
      const lists = [pack(), at.boat?.Cargo?.Items ?? []];
      for (const m of row.next.mats) if (materialCount(lists, m.kind) < m.n) return said(false, `The shipwright needs ${m.n} ${m.label} (you have ${m.have}).`);
      if (!materialsFor(lists, row.next.mats)) return said(false, t('naval.refit.short', 'Not enough materials. One item cannot count for two requirements.'));
      takeAllMaterials(lists, row.next.mats);
      deps.pay?.(row.next.gold);
      addRefit(uid, row.id);
      n?.refitBoat?.(at.boat);
      if (at.boat && r?.state?.CurrentBoat === at.boat) r.UpdateBoatCargoMod?.(at.boat);
      deps.changed?.();
      return said(true, `${name}'s ${row.label.toLowerCase()} is refitted (${REFIT_NUMERALS[row.tier + 1]}).`);
    }
    return said(false, 'Not here.');
  }

  const refit = (boat) => {
    if (!boat?.uid) return null;
    const rec = fleetShip(boat.uid);
    return rec ? captainRefit(refitOf(rec), deps.captain?.()?.stats?.() ?? null) : refitOf(null);
  };
  function restat() {
    const n = naval(), r = csa();
    const standing = new Map(placed().map((b) => [b.uid, b]));
    // Laid-up and packed ships too: the sea fight keeps their state by number, and a summons uses it.
    for (const rec of fleetShips()) n?.refitBoat?.(standing.get(rec.uid) ?? { uid: rec.uid, hull: rec.hull });
    if (r?.state?.CurrentBoat) r.UpdateBoatCargoMod?.(r.state.CurrentBoat);
  }
  const nameOf = (boat) => (boat?.uid ? fleetShip(boat.uid)?.name ?? '' : '');

  return { model, offer, act, sweep, refit, restat, nameOf, whereIs };
}
