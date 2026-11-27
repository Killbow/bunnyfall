// Seats and sieges for the world: the battle clock, and entering and leaving a siege or royal fight.
// It also holds seat dressing, arms, edicts, and town economy, siege melee, work, strike, spell, and heal hits,
// and the spectator frame. The siege and royal sessions, the seat book, and the town seats stay in the world.
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
  const battleNowMs = () => Date.now() + shared._sharedOffsetMs;
  const atSeat = (seat) => {
    if (!Array.isArray(seat?.pixel) || (shared.modes?.mode ?? 'exterior') === 'dungeon') return false;
    const p = playerTravelPixel();
    return Math.abs(p.x - seat.pixel[0]) <= 1 && Math.abs(p.y - seat.pixel[1]) <= 1;
  };
  const leaveBattle = () => !!(shared.siegeSession?.leave() || shared.royalSession?.leave());

  const siegeEnter = (seat, fight) => {
    if (!shared.siegeSession) return false;
    let field = null;
    for (const [mapId, t] of siegeFieldsByTown) if (shared.built.has(t.key) && seatAtMapId(townSeats, mapId)?.key === seat.key) { field = siegeFieldWire(t.px, t.py, t.field); break; }
    if (field) shared.royalSession?.leave();
    return shared.siegeSession.enter(seat, fight, field);
  };

  const royalEnter = (seat, royal, watch) => {
    if (!shared.royalSession) return false;
    let field = null;
    for (const [mapId, t] of siegeFieldsByTown) if (shared.built.has(t.key) && seatAtMapId(townSeats, mapId)?.key === seat.key) { field = royalRingWire(t.px, t.py, t.field); break; }
    if (field) shared.siegeSession?.leave();
    return shared.royalSession.enter(seat, royal, field, { watch });
  };
  const seatHere = (mapId) => (seatBook?.open === true ? seatBook.dressed(seatAtMapId(townSeats, mapId)) : null);
  const seatArmsOf = heraldryLookup(() => [shared.guildBook?.guild, seatBook?.data]);
  setTravelViewArmsOf(seatArmsOf);
  setSeatHarbours((mapId) => harbourPortFor(seatHere(mapId), shared.guildBook?.guild?.id ?? null));
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
    tideAt: (region) => seatBook?.tideAt(region) ?? 'calm',
    orcCamp: (site, region) => seatBook?.orcCamp(site, region) ?? Promise.resolve({ counted: false }),
  });
  const townEcon = createTownEconHost({ online: isOnlinePage, townOf: (mapId) => _townOfMapId.get(mapId), seatAt: seatHere, nowMs: battleNowMs, chapters: chapterSheet, clockHeard: () => shared._sharedClockHeard,
    seats: () => (seatBook?.open === true ? seatBook.data?.seats ?? null : null), seatsHeard: () => !seatBook || seatBook.open != null, onBandsReady: () => shared._livingTripMemo.clear(),
    raidedAt: (px, py) => raidingPartiesOn() && raidState().raids.some((r) => r.px === px && r.py === py && raidActive(r, worldMinutes())), regionHere: () => { const p = playerTravelPixel(); try { return maps.getRegionIndexAt(p.x, p.y); } catch { return null; } },
    locAt: (x, y) => locationIndex.get(`${x},${y}`)?.mapTableData ?? null, portLanes: () => (shared._lanesReady && mapDict ? laneNet() : null) });
  setSeaTide(seatBook ? (end) => (seatBook.tideAt(maps.getRegionIndexAt(end.x, end.y)) === 'storms' ? TIDE_EFFECTS.stormsSea : 1) : null);
  registerEntityFold(FESTIVE_FOLD, (e) => (e === playerEntity && seatEdicts.festive() ? festiveMods(STAT_KEYS_ORDER) : EMPTY_MODS));
  setCrimeRepFactor(() => seatEdicts.crimeFactor());

  const siegeMeleeHit = (eye, inViewFn) => {
    const battle = shared.royalSession?.active() ? shared.royalSession : shared.siegeSession;
    const foes = battle?.foes() ?? [];
    if (!foes.length) return (battle === shared.siegeSession && siegeWorkHit()) || shared.wildMeleeHit(eye, inViewFn);
    let best = null, bestD = Infinity;
    const near = shared.peersNear();
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
    if (!best) return battle === shared.siegeSession && siegeWorkHit();
    siegeStrikeOut(best, 'melee', shared.weaponRig.playerWeapon.strikingWeapon, shared.weaponRig.playerWeapon.machine?.state, 0, { off: shared.weaponRig.playerWeapon.offStrike });
    return true;
  };
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
  const siegeStrikeOut = (to, by, weapon, swing, drawMs = 0, { off = false } = {}) => {
    const battle = shared.royalSession?.active() ? shared.royalSession : shared.siegeSession;
    if (!to || !battle?.active() || !battle.foes().includes(to)) return shared.wildStrikeOut(to, by, weapon, swing, drawMs, { off });
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
    const out = [], near = shared.peersNear();
    for (const id of battle.foes()) { const b = shared.duelBodyIn(near, id); if (b) out.push(b); }
    return out;
  };

  const siegeSpellMarks = () => {
    const bodies = battleFoeBodies(shared.siegeSession);
    return bodies.length ? bodies.map((b) => ({ ...b, name: b.name ?? shared.peerName(b.id) ?? 'a foe' })) : shared.wildSpellMarks();
  };
  const siegeSpellOut = (peerId, sp) => {
    if (!shared.siegeSession?.isFoe(peerId)) return shared.wildSpellOut(peerId, sp);
    const { harm } = withoutFirmament(playerEntity, () => siegeSpellNumbers(sp, Math.max(1, Math.trunc(playerEntity.level || 1)), duelStandIn(), playerEntity));
    return harm > 0 && shared.siegeSession.cast(peerId, siegeCastClamp(harm, false));
  };
  const siegeHealOut = (id, frame) => {
    if (!shared.siegeSession?.active() || !shared.siegeSession.mates().includes(id)) return false;
    const { heal } = siegeSpellNumbers(frame?.spell, Math.max(1, Math.trunc(frame?.level || 1)), duelStandIn(), playerEntity);
    return heal > 0 && shared.siegeSession.cast(id, siegeCastClamp(heal, true), true);
  };
  const inSiegeRoom = () => !!shared.online?.room && shared.online.room === shared.siegeSession?.room();
  const battleSpellRefusal = (sp) => (inSiegeRoom() && siegeSpellBarred(sp) ? SIEGE_SPELL_BARRED_TEXT : null);

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
