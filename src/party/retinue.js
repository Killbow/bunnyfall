// Companions and retinue: the naval crew ashore, sworn revenants, and raised minions that
// follow the player, with their packs, party panel cards, and per-frame ticks.
import {
  applySwornStrength, devotedWithYou, forgetSwornMember, isRevenantCompanionKey, leaveRefusal, revenantIdOfKey,
  revenantParty, revenantsWithYou, sendRevenantAway, setRetinueBodies, setRetinueListener, setRetinuePlayer,
  swornFightStep, swornFightWon,
} from '../revenants/revenantCompanions.js';
import {
  COMPANION_SLOTS, companionsWithYou, registerCompanionCount, registerCompanionRoster,
} from '../characters/companionSlots.js';
import { composePartyFx } from '../net/partyBuffs.js';
import { CONTAINER_IMAGES } from '../ui/targetIconPanel.js';
import { createCrewAshore } from '../systems/naval/crewAshore.js';
import { clanName, courtSeats } from '../systems/vampire/clanLaw.js';
import { createHuntersHost } from '../scenes/vampire/huntersHost.js';
import { createNecroHost } from '../systems/necromancy/necroHost.js';
import { createThrallHost } from '../scenes/vampire/thrallHost.js';
import { hubOfRegion } from '../world/regionHubs.js';
import { installBeastOverlay } from '../ui/vampire/beastOverlay.js';
import { installDisciplineKey } from '../ui/vampire/disciplineWheel.js';
import { setBloodlineHost } from '../systems/vampire/bloodlineLeaf.js';
import { createPartyPanel } from '../ui/partyPanel.js';
import { HULL_NAMES as CSA_HULL_NAMES } from '../systems/naval/comeSailAwayBoat.js';
import { DEVOTED } from '../revenants/revenantFeud.js';
import { fetchBytes } from '../scenes/shared.js';
import { inventoryDoorReady } from '../ui/inventoryDoor.js';
import { isBackFacing } from '../characters/enemyMotor.js';
import { madeRuleHere } from '../characters/madeLevel.js';
import { messageBox } from '../ui/notify.js';
import { packCapacityKg } from '../systems/naval/crewCompanions.js';
import { PERSONALITIES } from '../revenants/revenantPersonality.js';
import { playerEntity } from '../characters/playerEntity.js';
import {
  revenantBetrayEvent, revenantFelled, revenantFelledEvent, revenantMomentEvent, revenantRecord, revenantSay,
  revenantSpawnOptions, revenantWarnEvent,
} from '../revenants/revenant.js';
import { setWindupAtMeListener } from '../combat/hostCombat.js';
import { wildEncounterLevel } from '../characters/wildLevel.js';
import { noteFirstUse, wrapTutorialText } from '../ui/tutorials.js';

/** @param {any} shared */
export function createRetinue(shared) {
  const {
    cam, collider, csaOpenListPicker, csaRuntime, gamePaused, hcc, navalOn, palette, player, playerTicker, townTalk,
    walkMode,
  } = shared;
  const openCompanionPack = (rec) => {
    const key = rec?.companion;
    if (isRevenantCompanionKey(key)) return openSwornPack(rec);
    if (!shared.naval?.companionPack?.(key) || !inventoryDoorReady()) return false;
    // A load replaces the party: look the pack up by key on every read, or items duplicate.
    let orphan = null;
    const named = shared.naval?.companionPack?.(key)?.name ?? null;
    const capacity = () => {
      const pack = shared.naval?.companionPack?.(key);
      if (!pack) return { kg: 0, name: named, gone: true };
      const body = crewAshore.bodies().find((f) => f.companion === key) ?? rec;
      return { kg: packCapacityKg(body?.entity ?? null), name: pack.name ?? named };
    };
    const w = shared.makeInventoryWindow({ loot: { items: () => shared.naval?.companionPack?.(key)?.items ?? (orphan ??= []), containerImage: () => CONTAINER_IMAGES.Backpack, playerOwned: true, storage: true, capacity } });
    if (!w) return false;
    if (!shared.modes?.mountWindow?.(w)) { (w.dispose?.bind(w) ?? w._closeSilently?.bind(w))?.(); return false; }
    return true;
  };
  const openSwornPack = (rec) => {
    const id = revenantIdOfKey(rec?.companion);
    const packOf = () => _revenantParty?.packOf(id) ?? null;
    if (!packOf() || !inventoryDoorReady()) return false;
    let orphan = null;
    const named = revenantRecord(playerEntity, id)?.name ?? null;
    const capacity = () => {
      if (!packOf()) return { kg: 0, name: named, gone: true };
      const body = revenantAshore.bodies().find((f) => f.companion === rec.companion) ?? rec;
      return { kg: packCapacityKg(body?.entity ?? null), name: named };
    };
    const pack = { items: () => packOf() ?? (orphan ??= []), containerImage: () => CONTAINER_IMAGES.Backpack, playerOwned: true, storage: true, capacity };
    const w = shared.makeInventoryWindow({ loot: pack });
    if (!w) return false;
    const mounted = !!shared.modes?.mountWindow?.(w);
    if (!mounted) (w.dispose?.bind(w) ?? w._closeSilently?.bind(w))?.();
    return mounted;
  };
  const openRevenantFate = (rec) => {
    const pool = [shared.exteriorFoes, shared.modes?.interiorPool?.(), shared._dungeonPool()].find((p) => p?.fateFor && p.foes?.includes(rec)) ?? null;
    const model = pool?.fateFor(rec) ?? null;
    if (!model || !inventoryDoorReady()) return false;
    const choose = model.choose;
    model.choose = (id) => { if (!model.live() || !choose(id)) townTalk.say(`${model.given ?? 'It'} is gone.`); };
    const w = shared.makeInventoryWindow({ fate: model, loot: { items: () => [], playerOwned: false }, physicalDropOn: () => false });
    if (!w) return false;
    const mounted = !!shared.modes?.mountWindow?.(w);
    if (!mounted) (w.dispose?.bind(w) ?? w._closeSilently?.bind(w))?.();
    else if (rec.yielded) rec.yielded.judging = () => !w.done;
    return mounted;
  };

  function companionPlace({ crew = true } = {}) {
    if ((crew && !navalOn()) || !walkMode || !shared.playerSpawned || shared._loading || shared.modes?.transitioning || shared.travelView?.active || csaRuntime?.isSailing?.()) return null;
    if (madeRuleHere('companions') === 'out') return null;
    const spotOf = (col) => (from, dx, dz) => { const p = [from[0], from[1], from[2]]; try { col?.move(p, dx, 0, dz, 1.8); } catch {} return [p[0], p[1], p[2]]; };
    const mode = shared._mode();
    const standIn = (pool) => (mobile, feet, o) => pool.spawnFoe(mobile, feet, { yaw: o.yaw, gender: o.gender, allied: true, loose: true, transient: true });
    const turnIn = (pool) => (r, feet, yaw) => pool.spawnFoe(r.mobileType, feet, { yaw, feetGiven: true, loose: true, band: false, turned: true, ...revenantSpawnOptions(r, wildEncounterLevel(playerEntity)) });
    if (mode === 'exterior') return { key: shared.exteriorFoes, spawn: standIn(shared.exteriorFoes), remove: (f) => shared.exteriorFoes.removeFoe(f), has: (f) => shared.exteriorFoes.foes.includes(f), spot: spotOf(collider), fx: shared.exteriorFoes.companionFx, turn: turnIn(shared.exteriorFoes) };
    if (mode === 'interior') {
      const pool = shared.modes?.interiorPool?.();
      return pool ? { key: pool, spawn: standIn(pool), remove: (f) => pool.removeFoe(f), has: (f) => pool.foes.includes(f), spot: spotOf(shared.modes?.interiorCollider), fx: pool.companionFx, turn: turnIn(pool) } : null;
    }
    const d = shared._dungeonPool();
    if (!d?.spawnLooseFoe || !d.removeLooseFoe) return null;
    return {
      key: d,
      // The loose lane lets every player in the room see the companion as the player's ally.
      spawn: (mobile, feet, o) => d.spawnLooseFoe(mobile, feet, { yawRad: o.yaw, allied: true, gender: o.gender }),
      remove: (f) => d.removeLooseFoe(f), has: (f) => d.foes.includes(f), spot: spotOf(d.collider), fx: d.companionFx ?? null,
      turn: (r, feet, yaw) => { const so = revenantSpawnOptions(r, wildEncounterLevel(playerEntity)); return d.spawnLooseFoe(r.mobileType, feet, { yawRad: yaw, revenant: r, turned: true, gender: so.gender, level: so.level }); },
    };
  }
  const felledBy = (by, ally) => {
    const r = by ? revenantFelled(playerEntity, by, ally) : null;
    if (r) revenantSay(revenantFelledEvent(r, ally, { archive: by.archive ?? by.mobileArchive ?? null }), (l) => townTalk.say(l));
  };
  const crewCount = () => (navalOn() ? shared.naval?.companions?.party?.length ?? 0 : 0);
  const crewAshore = createCrewAshore({
    party: () => (navalOn() ? shared.naval?.companions ?? null : null),
    place: companionPlace,
    leader: () => (shared.playerSpawned ? { feet: [player.pos[0], player.pos[1], player.pos[2]], yaw: cam.yaw, grounded: !!player.grounded && !player.levitating && !player.swimming } : null),
    now: () => Math.floor(playerTicker.ownMinutes),
    onKnocked: (c, by) => { shared.naval?.companionKnocked?.(c); felledBy(by, c.name); },
    seat: (i) => shared.wagonRiders?.companionSeat(i, hcc.carriesCompanions()) ?? null,
    seatDraw: (i) => shared.wagonRiders?.companionSeatDrawn(i, hcc.carriesCompanions()) ?? null,
  });
  registerCompanionCount('crew', () => (navalOn() ? shared.naval?.companions?.party?.length ?? 0 : 0));
  setRetinuePlayer(playerEntity);
  const _revenantArrivals = new Set();
  const _revenantBetrayals = [];
  const revenantCompanionSay = (kind, id, body = null) => {
    const r = revenantRecord(playerEntity, id);
    if (r) revenantSay(revenantMomentEvent(kind, r, playerEntity?.name, body ? { body } : {}), (l) => townTalk.say(l));
  };
  const _revenantParty = revenantParty({ onWake: (r) => townTalk.say(`${r.name} has recovered, and waits for your call.`) });
  const revenantAshore = createCrewAshore({
    party: () => (shared.playerSpawned ? _revenantParty : null),
    place: () => companionPlace({ crew: false }),
    leader: () => (shared.playerSpawned ? { feet: [player.pos[0], player.pos[1], player.pos[2]], yaw: cam.yaw, grounded: !!player.grounded && !player.levitating && !player.swimming } : null),
    now: () => Math.floor(playerTicker.ownMinutes),
    onKnocked: (c, by) => {
      revenantCompanionSay('downed', c.name, `${c.title ?? 'It'} falls, and is carried off through a portal to recover.`);
      felledBy(by, revenantRecord(playerEntity, c.name)?.given ?? null);
    },
    onStood: (c, rec) => {
      const r = revenantRecord(playerEntity, c.name);
      applySwornStrength(rec.entity, r, { fresh: !(c.maxHealth > 0) });
      rec.revenantCompanion = c.name;
      if (_revenantArrivals.delete(c.name)) revenantCompanionSay('arrive', c.name);
    },
    seat: (i) => shared.wagonRiders?.companionSeat(crewCount() + i, hcc.carriesCompanions()) ?? null,
    seatDraw: (i) => shared.wagonRiders?.companionSeatDrawn(crewCount() + i, hcc.carriesCompanions()) ?? null,
  });
  const necro = createNecroHost({
    place: () => companionPlace({ crew: false }),
    leader: () => (shared.playerSpawned ? { feet: [player.pos[0], player.pos[1], player.pos[2]], yaw: cam.yaw, grounded: !!player.grounded && !player.levitating && !player.swimming } : null),
    now: () => Math.floor(playerTicker.ownMinutes),
    say: (l) => townTalk.say(l),
    playerEntity,
  });
  const thralls = createThrallHost({
    place: () => companionPlace({ crew: false }),
    leader: () => (shared.playerSpawned ? { feet: [player.pos[0], player.pos[1], player.pos[2]], yaw: cam.yaw, grounded: !!player.grounded && !player.levitating && !player.swimming } : null),
    now: () => Math.floor(playerTicker.ownMinutes),
    say: (l) => townTalk.say(l),
    playerEntity,
  });
  const vampireHunters = createHuntersHost({ playerEntity, mode: () => shared._mode(), region: () => shared._questRegionIndex(), now: () => playerTicker.ownMinutes, stand: (mt) => shared._standLooseFoe(mt), say: (l) => townTalk.say(l) });
  /** @type {Map<number, { clan: number, name: string, regionIndex: number }>|null} */
  let _courtSeats = null;
  const courtSeatsHere = () => (_courtSeats ??= courtSeats((r) => hubOfRegion(shared.regionHubs, r)));
  setBloodlineHost({
    seatsWords: () => [...courtSeatsHere().values()].map((v) => `${v.name} (${clanName(v.clan)})`).join(', '),
    // The bloodline's directions also open a quest box, because the HUD line fades before it can be read.
    say: (l) => {
      townTalk.say(l);
      noteFirstUse('vampire-bitten');
      try { shared.showQuestBox?.({ rows: wrapTutorialText(l, 54) }); } catch { /* the HUD line stands */ }
    },
  });
  installBeastOverlay({ entity: playerEntity, now: () => playerTicker.ownMinutes });
  const DISCIPLINE_SEEN_M = 15;
  installDisciplineKey({
    entity: playerEntity, now: () => playerTicker.ownMinutes, region: () => shared._questRegionIndex(), say: (l) => townTalk.say(l),
    seenBy: () => {
      const f = player.feetAt();
      const near = (/** @type {any[]} */ seats) => (seats ?? []).filter((x) => x?.pos && Math.hypot(x.pos[0] - f[0], x.pos[2] - f[2]) <= DISCIPLINE_SEEN_M).length;
      return shared._mode() === 'exterior' ? near(shared._livePersons) : shared._mode() === 'interior' ? near(shared.livingIndoors?.seats?.() ?? []) : 0;
    },
  });
  const noteRevenantArrival = (id) => _revenantArrivals.add(id);
  const _revenantDepartures = [];
  setRetinueListener((kind, r, extra) => {
    if (kind === 'betray') { _revenantArrivals.delete(r.id); _revenantBetrayals.push(r); return; }
    const sentAt = _revenantDepartures.findIndex((d) => d.kind === 'dismiss' && d.r.id === r.id);
    if (kind === 'arrive') { if (sentAt >= 0) _revenantDepartures.splice(sentAt, 1); else noteRevenantArrival(r.id); return; }
    _revenantArrivals.delete(r.id);
    _revenantDepartures.push({ kind, r, items: extra?.items ?? 0 });
  });
  const clearSworn = () => { necro.clear(); thralls.clear(); revenantAshore.clear(); _revenantArrivals.clear(); _revenantDepartures.length = 0; _revenantBetrayals.length = 0; forgetSwornMember(); };
  setRetinueBodies((id) => revenantAshore.bodies().find((b) => b.revenantCompanion === id && !b.dead && !b._knockedOut)?.entity ?? null);
  registerCompanionRoster('crew', () => (navalOn() ? (shared.naval?.companions?.party ?? []).map((c) => ({ name: c.name, role: c.role })) : []));
  const BARK = Object.freeze({ party: 20000, each: 60000, battle: 0.35, kill: 0.55 });
  const _barkAt = new Map();
  let _barkLast = 0;
  function revenantCompanionBarks() {
    const now = Date.now();
    for (const rec of revenantAshore.bodies()) {
      const id = rec.revenantCompanion;
      if (!id || rec.dead || !rec.ai) continue;
      const tgt = rec.ai.target && rec.ai.target.entity ? rec.ai.target : null;
      const was = rec._barkTgt ?? null;
      rec._barkTgt = tgt;
      let kind = null;
      if (was && was !== tgt && (was.dead || !(was.entity?.health > 0))) kind = Math.random() < BARK.kill ? 'kill' : null;
      else if (tgt && !was) kind = Math.random() < BARK.battle ? 'battle' : null;
      if (!kind || now - _barkLast < BARK.party || now - (_barkAt.get(id) ?? -Infinity) < BARK.each) continue;
      _barkLast = now; _barkAt.set(id, now);
      revenantCompanionSay(kind, id);
    }
  }
  let _companionPruneN = 0;
  function partyCompanions() {
    if (madeRuleHere('companions') === 'out') return [];
    const party = navalOn() && !csaRuntime?.isSailing?.() ? shared.naval?.companions?.party ?? [] : [];
    const sworn = swornCards?.() ?? [];
    if (!party.length) return sworn;
    const bodies = new Map(crewAshore.bodies().map((r) => [r.companion, r]));
    return [...party.map((c) => {
      const key = `${c.boat}:${c.name}`, rec = bodies.get(key);
      const e = rec && !rec.dead ? rec.entity : null;
      const hm = e?.maxHealth ?? c.maxHealth ?? 100, h = e ? e.health : c.health ?? hm;
      return { key, name: c.name, role: c.role, h, hm, fx: e ? composePartyFx(e) : [] };
    }), ...sworn];
  }
  function swornCards() {
    if (csaRuntime?.isSailing?.()) return [];
    const bodies = new Map(revenantAshore.bodies().map((r) => [r.companion, r]));
    return revenantsWithYou().map((r) => {
      const key = `rv:${r.id}`, rec = bodies.get(key);
      const body = rec && !rec.dead ? rec.entity : null;
      const hm = body?.maxHealth ?? r.companion?.maxHealth ?? 100, h = body ? body.health : r.companion?.health ?? hm;
      return { key, name: r.name, role: `Sworn · ${PERSONALITIES[r.personality]?.label ?? 'Revenant'}`, h, hm, fx: body ? composePartyFx(body) : [] };
    });
  }
  function makePartyPanel(social) {
    shared.partyPanel = createPartyPanel({ social, art: { fetchBytes, palette }, here: () => shared._partyPose });
    shared.partyPanel.setCompanions(partyCompanions);
    shared.partyPanel.setSpire(() => shared.egClient?.partyRows() ?? null, (acct) => shared.egClient?.watchMember(acct));
    return shared.partyPanel;
  }
  function companionPanelFrame() {
    if (shared.chatLinks && shared.social) return;
    if (!shared.partyPanel) {
      if (!partyCompanions().length) return;
      makePartyPanel(null);
    }
    shared.partyPanel.render({ covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused() });
  }
  function crewAshoreTick() {
    try { companionPanelFrame(); } catch (e) { console.warn('[companions] panel', e?.message ?? e); }
    if (!navalOn()) { crewAshore.clear(); return; }
    if (gamePaused()) return;
    if (++_companionPruneN >= 60) { _companionPruneN = 0; shared.naval?.pruneCompanions?.(); }
    try { crewAshore.frame(); } catch (e) { console.warn('[companions]', e?.message ?? e); }
  }
  function turnSworn(r) {
    revenantSay(revenantBetrayEvent(r, { playerName: playerEntity?.name }), (l) => townTalk.say(l));
    const rec = revenantAshore.bodies().find((b) => b.revenantCompanion === r.id && !b.dead && !b._knockedOut && b.ai?.feet);
    const place = rec ? companionPlace({ crew: false }) : null;
    if (!rec || !place?.turn || place.has?.(rec) === false) return;
    const feet = [rec.ai.feet[0], rec.ai.feet[1], rec.ai.feet[2]], yaw = rec.ai.yaw ?? 0;
    try { place.remove(rec); } catch (e) { console.warn('[companions] a betrayer would not lift', e?.message ?? e); }
    Promise.resolve(place.turn(r, feet, yaw)).then((f) => {
      if (f?.ai && !f.dead) f.ai.makeHostileToPlayer?.(undefined, [player.pos[0], player.pos[1], player.pos[2]]);
    }, (e) => console.warn('[companions] a betrayer would not stand', e?.message ?? e));
  }
  function revenantAshoreTick() {
    if (gamePaused()) return;
    while (_revenantBetrayals.length) turnSworn(_revenantBetrayals.shift());
    necro.tick();
    thralls.tick();
    vampireHunters.tick();
    try { revenantAshore.frame(); } catch (e) { console.warn('[companions] the sworn', e?.message ?? e); }
    while (_revenantDepartures.length) {
      const d = _revenantDepartures.shift();
      const body = d.items ? `It hands you back its pack (${d.items === 1 ? 'one item' : `${d.items} items`}).` : null;
      revenantSay(revenantMomentEvent(d.kind, d.r, playerEntity?.name, body ? { body } : {}), (l) => townTalk.say(l));
    }
    // A load can bring back more crew and sworn than the slots hold; the newest sworn one leaves.
    if (companionsWithYou() > COMPANION_SLOTS) {
      const last = revenantsWithYou().filter((r) => !leaveRefusal(r)).sort((a, b) => (b.swornAt ?? 0) - (a.swornAt ?? 0))[0];
      if (last && sendRevenantAway(last.id, { byYou: false })) townTalk.say(`Your companions are full. ${last.name} steps away to wait.`);
    }
    try { revenantCompanionBarks(); } catch {}
    for (const rec of revenantAshore.bodies()) if (rec.revenantCompanion && !rec.dead && swornFightStep(rec)) swornFightWon(rec.revenantCompanion);
  }
  let _devotedWarnAt = -Infinity;
  setWindupAtMeListener((f) => {
    if (!shared.playerSpawned || !f?.ai?.feet || Date.now() - _devotedWarnAt < DEVOTED.WARN_S * 1000) return;
    if (!isBackFacing(cam.yaw, player.feetAt(), f.ai.feet)) return;
    const r = devotedWithYou();
    if (!r) return;
    _devotedWarnAt = Date.now();
    revenantSay(revenantWarnEvent(r, playerEntity?.name), (l) => townTalk.say(l));
  });
  function navalCompanions(boat) {
    if (!navalOn() || !shared.naval || !boat) return false;
    const rows = shared.naval.companionRows?.(boat, Math.floor(playerTicker.ownMinutes));
    if (!rows) return false;
    if (!rows.length) { messageBox([`The ${CSA_HULL_NAMES[boat.hull] ?? 'boat'} has no hands to spare.`]); return true; }
    csaOpenListPicker(rows.map((r) => (r.disabled ? `${r.label} (${r.why})` : r.label)), (i) => {
      if (shared._csaPicker) { shared.modes?.closeWindow?.(shared._csaPicker); shared._csaPicker = null; }
      if (rows[i]) shared.naval.companionPress?.(boat, rows[i].id, Math.floor(playerTicker.ownMinutes));
    });
    return true;
  }
  function navalCrewCard(boat) {
    const c = shared.naval?.crewOf?.(boat);
    if (!c) return false;
    messageBox(c.crewed ? c.card : [`The ${CSA_HULL_NAMES[boat.hull] ?? 'boat'} carries no crew.`]);
    return true;
  }
  return {
    clearSworn, courtSeatsHere, crewAshore, crewAshoreTick, crewCount, makePartyPanel, navalCompanions, navalCrewCard,
    necro, openCompanionPack, openRevenantFate, revenantAshore, revenantAshoreTick, thralls,
  };
}
