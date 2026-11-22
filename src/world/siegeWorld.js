// The world's seats and sieges: the battle clock, entering a seat's siege or royal fight, and
// leaving it. It also holds a seat's dressing, arms, edicts, and town economy, the siege's melee,
// work, strike, spell, and heal hits, and the spectator's frame.
// The siege and royal sessions, the seat book, and the town seats stay in the world.
import { CAPSULE_HEIGHT } from '../player/motor.js';
import { composeLook } from '../net/remotePlayers.js';
import { computeEntityMods, EMPTY_MODS, registerEntityFold } from '../characters/entityMods.js';
import { createSeatEdicts, FESTIVE_FOLD, festiveMods } from '../guilds/seatEdicts.js';
import { createTownEconHost } from '../trade/townEconHost.js';
import { duelAttackerOf, duelStandIn, duelSwingOf, duelWeaponOf, resolveDuelStrike } from '../combat/duelCombat.js';
import { harbourPortFor } from '../net/fortLaw.js';
import { heraldryLookup } from '../ui/heraldrySwatch.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { playerEntity } from '../characters/playerEntity.js';
import { playerMeleeCanHit } from '../combat/playerWeapon.js';
import { raidActive, raidingPartiesOn, raidState } from '../worldEvents/raidingParties.js';
import { royalRingWire, siegeFieldWire } from '../worldEvents/siegeField.js';
import { seatAtMapId } from '../guilds/townSeats.js';
import { setCrimeRepFactor } from '../justice/court.js';
import { setSeatHarbours } from '../travel/travelPorts.js';
import { setSeaTide } from '../travel/travel.js';
import { setTravelViewArmsOf } from '../ui/travelViewHud.js';
import { SIEGE_GATEHOUSE, SIEGE_RAM, SIEGE_REACH, SIEGE_UNITS_PER_M, SIEGE_WORK_IDS } from '../net/siegeRef.js';
import {
  SIEGE_SPELL_BARRED_TEXT, siegeBlowKind, siegeCastClamp, siegeSpellBarred, siegeSpellNumbers,
} from '../combat/siegeCombat.js';
import { STAT_KEYS_ORDER } from '../characters/statMods.js';
import { TIDE_EFFECTS } from '../net/tideLaw.js';
import { withoutFirmament } from '../characters/firmamentPowers.js';
import { worldMinutes } from './worldTick.js';

/** @param {any} shared */
export function createSiegeWorld(shared) {
  const {
    _townOfMapId, chapterSheet, laneNet, locationIndex, mapDict, maps, playerTravelPixel, seatBook, siegeFieldsByTown,
    townSeats,
  } = shared;
  /** AUDIT-SEATS C6: the battles' clock - the relay's, as every relay-stamped time this scene reads (a pass's window, a
   *  tourney's week, a receipt's life). */
  const battleNowMs = () => Date.now() + shared._sharedOffsetMs;
  /** AUDIT-SEATS C1: whether the player still stands at `seat`'s town - its own map pixel or one beside it (the attackers'
   *  camp stands outside the walls), out in its streets or in one of its buildings; a dungeon is no town's street. */
  const atSeat = (seat) => {
    if (!Array.isArray(seat?.pixel) || (shared.modes?.mode ?? 'exterior') === 'dungeon') return false;
    const p = playerTravelPixel();
    return Math.abs(p.x - seat.pixel[0]) <= 1 && Math.abs(p.y - seat.pixel[1]) <= 1;
  };
  /** AUDIT-SEATS C1: THE WAY OUT of whichever is entered, a battle or a Royal Tourney (the HUD's Leave and the card's
   *  Close, the chat's `/leave`) - its own word said; true when there was one to leave. */
  const leaveBattle = () => !!(shared.siegeSession?.leave() || shared.royalSession?.leave());

  /** The Seat tab's door into a battle: the field this game derived for the town (null where it is not built - the player
   *  is not there), then the session. */
  const siegeEnter = (seat, fight) => {
    if (!shared.siegeSession) return false;
    let field = null;
    for (const [mapId, t] of siegeFieldsByTown) if (shared.built.has(t.key) && seatAtMapId(townSeats, mapId)?.key === seat.key) { field = siegeFieldWire(t.px, t.py, t.field); break; }   // the town built: the player is there
    if (field) shared.royalSession?.leave();   // AUDIT-SEATS C2: one battle at a time - the two share the one pass slot and the HUD
    return shared.siegeSession.enter(seat, fight, field);
  };

  /** CROWN1 part two: the Seat tab's door into a Royal Tourney - the crown's ring this game derived from the city (null
   *  where it is not built: the player is not there), then the session; a contender or a spectator. */
  const royalEnter = (seat, royal, watch) => {
    if (!shared.royalSession) return false;
    let field = null;
    for (const [mapId, t] of siegeFieldsByTown) if (shared.built.has(t.key) && seatAtMapId(townSeats, mapId)?.key === seat.key) { field = royalRingWire(t.px, t.py, t.field); break; }
    if (field) shared.siegeSession?.leave();   // AUDIT-SEATS C2: one battle at a time
    return shared.royalSession.enter(seat, royal, field, { watch });
  };
  /** SEAT1a: the seat a location IS, while the seats are open to this account - off the client's own derivation (a seat
   *  it lacks is never drawn, listed or honoured). */
  const seatHere = (mapId) => (seatBook?.open === true ? seatBook.dressed(seatAtMapId(townSeats, mapId)) : null);   // SEAT1c: dressed in its holder
  /** HERALDRY-SHOWN (Seats-Arc 8.1): a guild's heraldry by its tag - the reader's own guild's, then the seats' list's (each
   *  holder and each battle's two) - for the name tags' frames and the Hall of Records' Roll of Arms; null where unknown. */
  const seatArmsOf = heraldryLookup(() => [shared.guildBook?.guild, seatBook?.data]);
  setTravelViewArmsOf(seatArmsOf);   // AUDIT HERALDRY H4: and the Overworld's name face frames a tag as the name over a head does
  // SEAT2b part two (Seats-Arc 7.5: "the town is a Travel Options port for members"): a Harbour standing at a seat my
  // guild holds is a port to the travel map, the ship's rules and the held map (systems/travel/travelPorts.js hasPortFor)
  setSeatHarbours((mapId) => harbourPortFor(seatHere(mapId), shared.guildBook?.guild?.id ?? null));
  // SEAT1d (Seats-Arc 7.2, 7.6): a held seat as this client lives it - its shops' prices for its holder's members and on
  // Market Day, its arrival's news, a Festival's buff, a Curfew's watch and crimes, a Bounty's camps (systems/seatEdicts.js)
  const seatEdicts = createSeatEdicts({
    seatAt: (mapId) => seatHere(mapId),
    here: () => shared._musicLoc?.mapTableData?.mapId,
    seats: () => (seatBook?.open === true ? seatBook.data?.seats ?? [] : []),
    guildId: () => { const g = shared.guildBook; if (g?.stale?.()) g.refresh().catch(() => {}); return g?.guild?.id ?? null; },
    minutes: () => worldMinutes(),
    regionAt: (px, py) => maps.getRegionIndexAt(px, py),
    say: (line, s) => shared.townTalk.say(line, s),
    claim: (site, region) => seatBook?.bounty(site, region) ?? Promise.resolve({ paid: 0 }),
    onFestive: () => computeEntityMods(playerEntity),
    // SEASON1 part two (Seats-Arc 9.3): the land's Tide here; an Orc Raid's camp cleared
    tideAt: (region) => seatBook?.tideAt(region) ?? 'calm',
    orcCamp: (site, region) => seatBook?.orcCamp(site, region) ?? Promise.resolve({ counted: false }),
  });
  // TOWN-ECON TE1 (bible/06-Systems/Town-Economy-Arc.md 3): every town's economy online - its counters' factor, the seat's
  // folded in, and its card on the Held Map and the Overworld (SEAT-TIP's seat card is its guild lines now); TE2 (4): the
  // players' share - the towns' book reads it, keeps the Watch's ticks at a town's pixel and witnesses a town walked into
  const townEcon = createTownEconHost({ online: isOnlinePage, townOf: (mapId) => _townOfMapId.get(mapId), seatAt: seatHere, nowMs: battleNowMs, chapters: chapterSheet, clockHeard: () => shared._sharedClockHeard,   // AUDIT TOWN-ECON LAW-2: the relay's clock, as every shared day is (AUDIT TOWN-ECON 2 CLI-6: a tick's life the relay's once heard); TE3: the chapters' patrons
    seats: () => (seatBook?.open === true ? seatBook.data?.seats ?? null : null), seatsHeard: () => !seatBook || seatBook.open != null, onBandsReady: () => shared._livingTripMemo.clear(),   // unread: nothing said of the area, never "no guild"; AUDIT TOWN-ECON 2 CLI-1: the market's band kept once the shares and the seats have answered, the trips planned before made again
    raidedAt: (px, py) => raidingPartiesOn() && raidState().raids.some((r) => r.px === px && r.py === py && raidActive(r, worldMinutes())), regionHere: () => { const p = playerTravelPixel(); try { return maps.getRegionIndexAt(p.x, p.y); } catch { return null; } },   // AUDIT TOWN-ECON 2 SVC-1: the `/town audit`'s region
    locAt: (x, y) => locationIndex.get(`${x},${y}`)?.mapTableData ?? null, portLanes: () => (shared._lanesReady && mapDict ? laneNet() : null) });   // TE2: a Watch tick is kept where a town stands; SEA-TRADE: a port's town and its lanes (the lanes once they stand - BOOT-TDZ II)
  // SEASON1 part two: a Storm Season's slow sea, on every voyage this client reckons (systems/travel/travel.js) - online alone
  setSeaTide(seatBook ? (end) => (seatBook.tideAt(maps.getRegionIndexAt(end.x, end.y)) === 'storms' ? TIDE_EFFECTS.stormsSea : 1) : null);
  registerEntityFold(FESTIVE_FOLD, (e) => (e === playerEntity && seatEdicts.festive() ? festiveMods(STAT_KEYS_ORDER) : EMPTY_MODS));
  setCrimeRepFactor(() => seatEdicts.crimeFactor());   // SEAT1d: a Curfew's crimes cost twice the legal reputation

  /** SEAT2a part four: THE MELEE ARM IN A SIEGE - the nearest foe (a fighter of the other side) within a weapon's reach,
   *  in view and in sight (the duel's test); my swing rolled on my own sheet against the neutral stand-in, sent to the
   *  relay, which clips it to DFU's range for the weapon my look holds (net/siege/siegeRef.js). True when the swing was theirs. */
  const siegeMeleeHit = (eye, inViewFn) => {
    const battle = shared.royalSession?.active() ? shared.royalSession : shared.siegeSession;   // CROWN1 part two: a Royal Tourney's bout, the same arm
    const foes = battle?.foes() ?? [];
    if (!foes.length) return (battle === shared.siegeSession && siegeWorkHit()) || shared.wildMeleeHit(eye, inViewFn);   // SEAT2b part two (b): no foe - the work in reach; WILD1: no battle at all - a fair player of the open zone
    let best = null, bestD = Infinity;
    const near = shared.peersNear();   // AUDIT SEATS-3 C3: the room's bodies read once for the sweep, not once per foe
    for (const id of foes) {
      const b = shared.duelBodyIn(near, id);
      if (!b) continue;
      const c = [b.feet[0], b.feet[1] + (b.height ?? CAPSULE_HEIGHT) / 2, b.feet[2]];
      const dx = c[0] - eye[0], dy = c[1] - eye[1], dz = c[2] - eye[2];
      const dist = Math.hypot(dx, dy, dz), l = dist || 1;
      const wall = shared.collider.raycast(eye, [dx / l, dy / l, dz / l], dist);
      if (!playerMeleeCanHit(dist, !!inViewFn?.(c), !Number.isFinite(wall) || wall >= dist - 1e-3)) continue;
      if (dist < bestD) { bestD = dist; best = id; }
    }
    if (!best) return battle === shared.siegeSession && siegeWorkHit();   // SEAT2b part two (b): no foe in reach - the work in reach
    siegeStrikeOut(best, 'melee', shared.weaponRig.playerWeapon.strikingWeapon, shared.weaponRig.playerWeapon.machine?.state, 0, { off: shared.weaponRig.playerWeapon.offStrike });
    return true;
  };
  /** SEAT2b part two (b) (Seats-Arc 6.2): MY SWING AT A WORK - an attacker's at the Gatehouse, a defender's at the Ram
   *  before it (siegeSession.workTarget), where my feet stand within a weapon's reach of its body (the Throne's point and
   *  the work's size - the referee allows its slack beyond); rolled on my own sheet as a blow on a foe is, sent to the
   *  relay, which takes a tenth of it into a Gatehouse and the whole into a Ram (net/siege/siegeRef.js refereeWorkBlow - a bow's
   *  shaft batters nothing; the melee arm is a swing's alone). True when the swing was the work's. */
  const siegeWorkHit = () => {
    const to = shared.siegeSession?.workTarget?.() ?? null;
    const at = to ? shared.siegeSession.workPoint() : null;
    if (!at) return false;
    const me = shared.campToWire(shared.player.feetAt());
    const size = to === SIEGE_WORK_IDS.gate ? SIEGE_GATEHOUSE.sizeM : SIEGE_RAM.sizeM;
    if (Math.hypot(me[0] - at[0], me[2] - at[1]) / SIEGE_UNITS_PER_M > SIEGE_REACH.melee + size) return false;
    const weapon = shared.weaponRig.playerWeapon.strikingWeapon;
    const a = withoutFirmament(playerEntity, () => duelAttackerOf(playerEntity, weapon)), w = duelWeaponOf(weapon), sw = duelSwingOf(shared.weaponRig.playerWeapon.machine?.state);
    const r = resolveDuelStrike({ by: 'melee', a, ...(w ? { w } : {}), ...(sw ? { sw } : {}), ...(shared.weaponRig.playerWeapon.offStrike ? { off: true } : {}) }, duelStandIn(playerEntity));
    if (r.dmg > 0) {
      const held = weapon ? (composeLook(playerEntity)?.items ?? []).find((i) => i?.group === 'Weapons' && i.templateIndex === weapon.templateIndex) ?? null : null;
      shared.siegeSession.workBlow(to, { w: weapon ? weapon.templateIndex : -1, m: held?.material ?? 0, d: r.dmg, r: siegeBlowKind('melee') });
    }
    return true;
  };
  /** AUDIT-SEATS G5: MY BLOW ON A BATTLE'S FOE `to` - a swing or a shaft (`by` 'melee' or 'arrow': its kind on the wire,
   *  combat/siegeCombat.js siegeBlowKind - the referee takes a shaft from a bow alone, at a shaft's reach), rolled on my
   *  own sheet against the neutral stand-in (a shaft's the release's StrikeDown and its draw's time), sent to the relay,
   *  which clips it to DFU's range for the weapon my look holds (net/siege/siegeRef.js). True when it was the battle's. */
  const siegeStrikeOut = (to, by, weapon, swing, drawMs = 0, { off = false } = {}) => {
    const battle = shared.royalSession?.active() ? shared.royalSession : shared.siegeSession;
    if (!to || !battle?.active() || !battle.foes().includes(to)) return shared.wildStrikeOut(to, by, weapon, swing, drawMs, { off });   // WILD1: not the battle's - perhaps a fair player of the open zone's
    const a = withoutFirmament(playerEntity, () => duelAttackerOf(playerEntity, weapon)), w = duelWeaponOf(weapon), sw = duelSwingOf(swing);
    const r = resolveDuelStrike({ by, a, ...(w ? { w } : {}), ...(sw ? { sw } : {}), ...(drawMs > 0 ? { at: Math.min(60000, Math.trunc(drawMs)) } : {}), ...(off ? { off } : {}) }, duelStandIn(playerEntity));
    if (r.dmg > 0) {
      const held = weapon ? (composeLook(playerEntity)?.items ?? []).find((i) => i?.group === 'Weapons' && i.templateIndex === weapon.templateIndex) ?? null : null;
      battle.blow(to, { w: weapon ? weapon.templateIndex : -1, m: held?.material ?? 0, d: r.dmg, r: siegeBlowKind(by) });
    }
    return true;
  };

  const battleFoeBodies = (battle) => {
    if (!battle?.active()) return shared.NO_BODIES;
    const out = [], near = shared.peersNear();   // AUDIT SEATS-3 C3: the room's bodies read once a sweep, not once per foe
    for (const id of battle.foes()) { const b = shared.duelBodyIn(near, id); if (b) out.push(b); }
    return out;
  };

  /** AUDIT-SEATS G5: a siege's foes as the cast engine's marks (hostMagic.js duelMarksFor) - my harmful spells reach them,
   *  outside a duel. A Royal Tourney's bout is blows alone (its referee takes no cast). */
  const siegeSpellMarks = () => {
    const bodies = battleFoeBodies(shared.siegeSession);
    return bodies.length ? bodies.map((b) => ({ ...b, name: b.name ?? shared.peerName(b.id) ?? 'a foe' })) : shared.wildSpellMarks();   // SEAT2b part two (c): a guard or a rebel by its own name; WILD1: no siege - the open zone's fair players
  };
  /** AUDIT-SEATS G5: A SPELL OF MINE MET A SIEGE'S FOE - its harm, counted on the neutral stand-in
   *  (combat/siegeCombat.js siegeSpellNumbers), to the referee as a cast (it clips, and bounds the rate). */
  const siegeSpellOut = (peerId, sp) => {
    if (!shared.siegeSession?.isFoe(peerId)) return shared.wildSpellOut(peerId, sp);   // WILD1: not the siege's - perhaps a fair player of the open zone's
    const { harm } = withoutFirmament(playerEntity, () => siegeSpellNumbers(sp, Math.max(1, Math.trunc(playerEntity.level || 1)), duelStandIn(), playerEntity));
    return harm > 0 && shared.siegeSession.cast(peerId, siegeCastClamp(harm, false));
  };
  /** AUDIT-SEATS G5: A GIFT OF MINE ON A SIEGE'S SIDE-MATE - its Heal Health, counted as the mate's own client would land
   *  it, to the referee as a heal (the referee holds the mate's vitality; ALLY-CAST's frame would heal their save). False
   *  for anyone else, or a gift with no heal in it - the ordinary door takes it then. */
  const siegeHealOut = (id, frame) => {
    if (!shared.siegeSession?.active() || !shared.siegeSession.mates().includes(id)) return false;
    const { heal } = siegeSpellNumbers(frame?.spell, Math.max(1, Math.trunc(frame?.level || 1)), duelStandIn(), playerEntity);
    return heal > 0 && shared.siegeSession.cast(id, siegeCastClamp(heal, true), true);
  };
  /** AUDIT-SEATS G5: whether I stand in a siege's own room - its wards hold there (Teleport, Recall, Levitate; the saddle). */
  const inSiegeRoom = () => !!shared.online?.room && shared.online.room === shared.siegeSession?.room();
  /** AUDIT-SEATS G5: the cast engine's word on a spell here (hostMagic.js spellRefusal) - a siege's wards. */
  const battleSpellRefusal = (sp) => (inSiegeRoom() && siegeSpellBarred(sp) ? SIEGE_SPELL_BARRED_TEXT : null);

  /** AUDIT-SEATS G4 (Seats-Arc 6.6, 19: "a free camera (WASD, the mouse, the pad's sticks); nothing they do reaches the
   *  fight"): whether I watch a battle - a siege or a Royal Tourney, on a spectator's pass - from its own room. */
  const spectatingHere = () => {
    const b = shared.siegeSession?.active() ? shared.siegeSession : shared.royalSession;
    return !!b?.active() && b.side() === 'watch' && !!shared.online?.room && shared.online.room === b.room();
  };

  const spectatorFrame = () => {
    const watching = spectatingHere();
    if (watching) { if (!shared._watchedFrom) shared._watchedFrom = shared.campToWire(shared.player.pos); return; }
    if (!shared._watchedFrom) return;
    if ((shared.modes?.mode ?? 'exterior') === 'exterior') {
      const q = shared.campToScene(shared._watchedFrom);
      shared.player.pos[0] = q[0]; shared.player.pos[1] = q[1]; shared.player.pos[2] = q[2];
      shared.player._airVelX = 0; shared.player._airVelZ = 0; shared.player.velY = 0; shared.player.falling = false; shared.player.fallStart = shared.player.pos[1];
    }
    shared._watchedFrom = null;
  };
  return {
    atSeat, battleFoeBodies, battleNowMs, battleSpellRefusal, inSiegeRoom, leaveBattle, royalEnter, seatArmsOf,
    seatEdicts, seatHere, siegeEnter, siegeHealOut, siegeMeleeHit, siegeSpellMarks, siegeSpellOut, siegeStrikeOut,
    spectatingHere, spectatorFrame, townEcon,
  };
}
