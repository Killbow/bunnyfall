// @ts-check
import { KT_STAGE, KT_TEXT, ketchVoyageAt, ketchVoyageOf, ketchBoards, ketchRoomKey } from '../../net/ketch/ketchLaw.js';
import { t } from '../../ui/textManager.js';
import { KT_WORDS, KT_REFUSE_WORDS, ketchRefusal, ketchSkyPhase, ketchWhenLine } from './ketchWords.js';
import {
  KT_CRADLES, KT_BRIDGE_CRADLES, KT_SOCKETS, KT_RESONATORS, KT_HOLD, KT_BRIDGE, KT_LINE, KT_MAIN_TOP, KT_ANCHOR_LIFT, KT_STERN_LIFT, KT_VAULT,
  KT_REACH, KT_LINE_LAND, deckToDungeon, dungeonToDeck, deckZoneAt,
} from '../../net/ketch/ketchDeck.js';
import { KT_BRIDGE_CRADLE0, KT_RESONATOR0, KT_CARRY_PACE } from '../../net/ketch/ketchBrain.js';
import { createKetchLink } from '../../net/ketch/ketchLink.js';
import { createKetchClaims } from '../../net/ketch/ketchClaims.js';
import { instanceOwnerOf } from '../../net/instanceRoom.js';
import { bodySayer } from '../../net/bossBody.js';
import { createKetchFight } from './ketchFight.js';
import { createKetchSky, ketchSkyPose } from './ketchSky.js';
import { bosunLineAt } from '../../world/ketch/ketchModel.js';
import { ketchSpoilsOf, KT_SPOILS_TEXT, KT_SPOILS_KEYS, KT_SPOILS_RECORDS_MAX, KT_SPOILS_GATHERED } from './ketchSpoils.js';
import { createSpoilsPool, recoverSpoils } from '../../worldEvents/spoilsPool.js';
import { createKetchShares, ketchChestMouth } from './ketchShares.js';
import { addItem, addGoldPieces } from '../../items/inventory.js';
import { itemIconColor32 } from '../../ui/itemIconColor32.js';
import { lootPileName } from '../../ui/worldTooltips.js';
import { characterIdOf } from '../../characters/characterId.js';
import { onSlotSaved, onSlotLoaded, enumerateSaves } from '../../saves/saveSlots.js';
import { noteAct } from '../questlines/qlActs.js';
import { registerPlayerDeathSave, hurtPlayer, registerPlayerDamageMod, registerPlayerHold } from '../../characters/playerEntity.js';
import { KT_DOWN_MS, KT_REZ_PCT } from '../../net/ketch/ketchBrain.js';
import { flashPlayerDamage } from '../../ui/damageFlash.js';
import { longitudeLatitudeToMapPixel } from '../../formats/mapsFile.js';
import { spawnedLocationCentreLocal } from '../../world/spawnedDungeons.js';
import { ARENA_REGION, ARENA_LOCATION } from '../../world/arenaCity.js';
import { registerFootSpeedMod } from '../../player/motor.js';
import { tooFarAwayText } from '../../player/activate.js';
import { ketchHudModel, wardenBarModel, drawKetchHud } from '../../ui/ketch/ketchHud.js';
import { drawGateBossBar } from '../../ui/gateBossBar.js';
import { KT_RING_R } from '../../ui/ketch/ketchMapMark.js';

export { KT_CARRY_PACE };
// Matches `SD_CAST_BACK_LOSS` in world/sdSteps.js.
export const KT_CAST_BACK_LOSS = 0.15;
export const KT_FALL_WAKE = 0.25;
export const KT_LINE_SPEED = 11;
export const KT_LET_GO_MS = 1500;
export const KT_DOOR_MS = 20_000;
export const KT_CLIENT_TEXT = Object.freeze({
  get signIn() { return t('ketch.client.signIn', 'Sign in to ride the anchor-lift.'); },
  get older() { return t('ketch.client.older', 'Your game is out of date. Reload or update to board the Ketch.'); },
  get letGo() { return t('ketch.client.letGo', 'You drop the aether cell.'); },
  get handsFull() { return t('ketch.client.handsFull', 'Your hands are full.'); },
  get chest() { return t('ketch.client.chest', 'The Ketchmaster\'s chest'); },
  get chestSub() { return t('ketch.client.chestSub', 'Open your share'); },
  get chestEmpty() { return t('ketch.client.chestEmpty', 'The Ketchmaster\'s chest holds nothing of yours yet.'); },
  get cell() { return t('ketch.client.cell', 'An aether cell'); },
  get cellTake() { return t('ketch.client.cellTake', 'Take it up'); },
  get cellLoose() { return t('ketch.client.cellLoose', 'A dropped aether cell'); },
  get socket() { return t('ketch.client.socket', 'An engine socket'); },
  get socketSet() { return t('ketch.client.socketSet', 'Set your cell'); },
  get resonator() { return t('ketch.client.resonator', 'A false resonator'); },
  get line() { return t('ketch.client.line', 'The bosun\'s line'); },
  get lineSub() { return t('ketch.client.lineSub', 'Ride it to the bridge'); },
  get down() { return t('ketch.client.down', 'The anchor-lift'); },
  get stern() { return t('ketch.client.stern', 'The stern lift'); },
  get downSub() { return t('ketch.client.downSub', 'Ride it down'); },
  get away() { return t('ketch.client.away', 'The Ketch has gone. You are back in the fields outside Daggerfall.'); },
});
export const KT_SHIP_KEY = 'ketch.myShip';
export const ketchShipKept = (w, mine, at, party = null) => (w?.k === 'st' && mine && at && w.n === at.n && Array.isArray(w.cr) && w.cr.some((c) => c?.[0] === mine) ? { n: at.n, a: mine, o: at.owner, p: party ?? null } : null);
export const ketchShipChoice = (n, mine, leader, kept, party = null) => (kept && kept.n === n && kept.a === mine && typeof kept.o === 'string' && kept.o && (kept.p ?? null) === (party ?? null) ? { owner: kept.o } : { captain: leader ?? mine });
// Sits 0.2 m inside the relay reach (`KT_REACH + 0.6` in `ketchBrain.js`), which is judged on the last pose it
// heard, so a press it would silently drop is never sent.
export const KT_PRESS_REACH = KT_REACH + 0.4;
export function ketchPressSpot(key, cl) {
  const k = String(key), n = Number(k.split(':')[2]);
  if (k.startsWith('kt:cr:')) return KT_CRADLES[n] ?? null;
  if (k.startsWith('kt:bc:')) return KT_BRIDGE_CRADLES[n] ?? null;
  if (k.startsWith('kt:sk:')) return KT_SOCKETS[n] ?? null;
  if (k.startsWith('kt:rs:')) return KT_RESONATORS[n] ?? null;
  if (k.startsWith('kt:lo:')) { const l = (cl?.lo ?? []).find((q) => q[0] === n); return l ? [l[1], l[3]] : null; }
  return null;
}
export const ketchPressFar = (key, cl, feet) => { const s = ketchPressSpot(key, cl); return !!s && !!feet && Math.hypot(feet[0] - s[0], feet[2] - s[1]) > KT_PRESS_REACH; };
/**
 * @param {{ carrying: boolean, sheathed: (boolean|undefined), forced: boolean, letGoAt: number }} st
 * @param {number} t
 * @param {() => boolean} sendDrop
 * @returns {{ forced: boolean, letGoAt?: number, sheathe?: boolean, say?: ('handsFull'|'letGo'|null) }}
 */
export function ketchCarryStep(st, t, sendDrop) {
  if (!st.carrying) return { forced: false };
  if (t - st.letGoAt < KT_LET_GO_MS) return { forced: st.forced };
  if (st.forced && st.sheathed === false) return sendDrop() ? { forced: false, letGoAt: t, say: 'letGo' } : { forced: true, sheathe: true };
  if (!st.sheathed) return { forced: true, sheathe: true, say: st.forced ? null : 'handsFull' };
  return { forced: true };
}
// A busy door closes the socket to retry rather than terminally, so a ship not heard within `KT_DOOR_MS` of
// boarding walks the player down with the busy line.
export const ketchShipUnheard = (V, sinceMs) => !(V?.n >= 0) && sinceMs > KT_DOOR_MS;
const NONE = Object.freeze([]);
const BOX = 0.55;
// Daggerfall map pixel, the value `longitudeLatitudeToMapPixel` gives for its map row.
export const KT_CITY_PX = Object.freeze({ x: 207, y: 213 });
const target = (key, x, y, z, h = 1.2, half = BOX, reach = KT_REACH + 0.4) => { const p = deckToDungeon(x, y, z); return { key, aabb: { min: [p[0] - half, p[1], p[2] - half], max: [p[0] + half, p[1] + h, p[2] + half] }, distance: reach + 2, reach }; };

/** @param {{ renderer?: any, gl?: any, getTexture?: any, uploadRecordFrame?: any, audio?: any, online: () => any, modes: () => any, social?: () => any, account: { me: () => (string|null), claim: (r: string, cid: string) => Promise<any> }, entity: any, player: any, cam: any, now: () => number, maps?: any, state?: any, heightAt?: (x: number, z: number) => number, collider?: () => any, feetOutside?: () => (number[]|null), site?: () => any, peers?: () => Array<{ sub: string, pos: number[] }>, say?: (text: string) => void, mid?: (text: string) => void, save?: (e: any, el: string) => number, store?: any, hudHidden?: () => boolean, spent?: (n: number) => boolean, changed?: () => void, }} deps */
export function createKetchClient(deps) {
  const { online, modes, account, entity, player, cam, now } = deps;
  const say = deps.say ?? (() => {}), mid = deps.mid ?? say, social = deps.social ?? (() => null), peers = deps.peers ?? (() => NONE);
  const me = () => account.me?.() ?? null;
  const ship = () => modes()?.ktShip?.() ?? null;
  const onShip = () => !!ship();
  const feetDeck = () => { if (!onShip()) return null; const f = player.feetAt(); return dungeonToDeck(f[0], f[1], f[2]); };
  const link = createKetchLink({ now, say: (t) => mid(t), me });
  let shipMem = null;
  const keptShip = () => { if (shipMem) return shipMem; try { return deps.store?.get?.(KT_SHIP_KEY) ?? null; } catch { return null; } };
  const keepShip = (m) => { shipMem = m; try { deps.store?.set?.(KT_SHIP_KEY, m); } catch { } };
  const who = () => characterIdOf(entity);
  const dungeonRay = (from, dir, len) => { const c = modes()?.dungeonCtx?.collider; const h = c?.raycastHit ? c.raycastHit(from, dir, len) : { dist: c?.raycast?.(from, dir, len) ?? Infinity, normal: null }; return Number.isFinite(h?.dist) ? h : null; };
  const takeSpoil = (p) => { if (p.kind === 'gold') addGoldPieces(entity, p.gold); else if (p.item) addItem(entity.items, p.item); };
  const spoils = createSpoilsPool({
    renderer: deps.renderer, gl: deps.gl, getTexture: deps.getTexture, uploadRecordFrame: deps.uploadRecordFrame, audio: deps.audio,
    ray: dungeonRay, now, take: takeSpoil, say: (text) => (text === KT_SPOILS_GATHERED ? say(KT_SPOILS_TEXT.gathered) : mid(text)),
    store: deps.store ?? null, who, me, iconOf: (item) => itemIconColor32(item, { identity: entity }), itemName: (item) => lootPileName([item]),
    onSpent: (day) => { const k = ketchSpoilsOf(day); return !k || deps.spent?.(k.d) === true; },
    keys: KT_SPOILS_KEYS, recordsMax: KT_SPOILS_RECORDS_MAX, gathered: KT_SPOILS_GATHERED,
  });
  onSlotSaved((id) => { try { spoils.saved(id); } catch (e) { console.warn('[kt] spoils', e?.message ?? e); } });
  onSlotLoaded((id) => { try { spoils.loaded(id); } catch (e) { console.warn('[kt] spoils', e?.message ?? e); } });
  const shares = createKetchShares({ store: deps.store ?? null, pool: spoils, level: () => entity.level ?? 1, me, aboard: () => onShip(), say: (t) => mid(t), changed: () => deps.changed?.() });
  const claims = createKetchClaims({
    claim: (r, cid) => account.claim(r, cid), store: deps.store ? { get: (k) => deps.store.get(k), set: (k, v) => deps.store.set(k, v) } : null,
    nowS: () => Math.floor(now() / 1000), say, me, paid: (c) => paid(c),
  });
  const fight = createKetchFight({
    renderer: deps.renderer, gl: deps.gl, getTexture: deps.getTexture, uploadRecordFrame: deps.uploadRecordFrame, audio: deps.audio, link, now,
    cam: () => cam.pos, feet: () => (onShip() ? player.feetAt() : null), grounded: () => !!player.grounded, player: () => entity,
    save: deps.save, strike: (d, how) => modes()?.dungeonCtx?.strikePlayer?.(d, how), say: (t) => mid(t),
    sendHit: (h) => !!online()?.sendKetch?.('hit', h), onStruck: () => struck(),
  });
  let cityRow;
  const _t = [0, 0, 0];
  const cityRead = () => { if (cityRow === undefined) { try { const loc = deps.maps?.getLocation?.(ARENA_REGION, ARENA_LOCATION) ?? null; const px = loc ? longitudeLatitudeToMapPixel(loc.mapTableData.longitude, loc.mapTableData.latitude) : null; cityRow = loc && px ? { px, local: spawnedLocationCentreLocal(loc) } : null; } catch { cityRow = null; } } return cityRow; };
  /** @returns {[number, number]|null} */
  const city = () => { const c = cityRead(); if (!c || !deps.state?.pixelTranslation) return null; const t = deps.state.pixelTranslation(c.px.x, c.px.y, _t); return [t[0] + c.local[0], t[2] + c.local[1]]; };
  const frameY = () => { const c = cityRead(); return c && deps.state?.pixelTranslation ? deps.state.pixelTranslation(c.px.x, c.px.y, _t)[1] : 0; };
  const sky = createKetchSky({
    renderer: deps.renderer, collider: deps.collider, city, groundAt: (x, z) => deps.heightAt?.(x, z) ?? NaN, frameY, now,
    feet: () => deps.feetOutside?.() ?? null, say: (t) => mid(t), onBoard: () => { void board(); }, mayBoard: () => !boarding && !onShip(),
  });
  const sayBody = bodySayer((v) => !!online()?.sendKetch?.('vt', { v }));
  const said = new Set();
  let sawPhase = null;
  function voyageWords(t) {
    const v = ketchVoyageAt(t), key = `${v.n}:${v.phase}`;
    if (v.phase === 'away') { if (sawPhase && sawPhase.n === v.n - 1 && !said.has(`${v.n - 1}:gone`)) { said.add(`${v.n - 1}:gone`); say(KT_WORDS.departed); } sawPhase = null; return v; }
    if (!said.has(key)) {
      said.add(key);
      say(v.phase === 'sighted' ? KT_WORDS.sighted : v.phase === 'docked' ? KT_WORDS.arrived : KT_WORDS.departing);
    }
    sawPhase = { n: v.n, phase: v.phase };
    return v;
  }
  let boarding = false, boardedAt = -Infinity, wasOnShip = false, falling = null, wake = null;
  async function board() {
    if (boarding || onShip()) return false;
    const o = online(), t = now(), v = ketchVoyageAt(t);
    if (!o || o.status !== 'open') { mid(KT_REFUSE_WORDS.offline); return false; }
    if (!o.ktOk) { mid(KT_CLIENT_TEXT.older); return false; }
    if (v.phase !== 'docked' || !ketchBoards(v.n, t)) { mid(v.phase === 'departing' ? KT_REFUSE_WORDS.closed : KT_REFUSE_WORDS.away); return false; }
    const mine = me();
    if (!mine) { mid(KT_CLIENT_TEXT.signIn); return false; }
    if (!(entity.health > 0)) return false;
    boarding = true;
    try {
      const pick = ketchShipChoice(v.n, mine, social()?.party?.leader ?? null, keptShip(), social()?.party?.id ?? null);
      const owner = pick.owner ?? await instanceOwnerOf(pick.captain);
      if (!ketchRoomKey(v.n, owner)) { mid(KT_REFUSE_WORDS.busy); return false; }
      mid(KT_WORDS.boarding);
      const ok = !!(await modes()?.enterKetch?.({ n: v.n, owner, site: deps.site?.() ?? null }));
      if (ok) { boardedAt = Date.now(); noteAct('ketch-boarded'); }
      return ok;
    } catch (e) { console.warn('[kt] boarding', e?.message ?? e); mid(KT_REFUSE_WORDS.busy); return false; } finally { boarding = false; }
  }
  function leave(text) {
    if (!onShip()) return false;
    if (!modes()?.ktLeave?.()) return false;
    if (text) mid(text);
    sky.hold();
    return true;
  }
  let down = null;
  function lieDown(why) {
    if (down) return true;
    const lp = online()?._pose ?? null, f = player.feetAt?.() ?? null;
    if (!onShip() || falling || !lp || !Number.isFinite(lp.x) || !Array.isArray(f) || !((online()?.peers?.size ?? 0) > 0)) return false;
    down = { why, until: Date.now() + KT_DOWN_MS, spot: [lp.x, lp.y ?? 0, lp.z], hold: [...f] };
    if (link.carrying()) online()?.sendKetch?.('drop');
    entity.health = Math.max(1, Math.min(entity.health, 1));
    mid(t('kt.down', 'You are down. A crewmate can raise you within {s} seconds.', { s: KT_DOWN_MS / 1000 }));
    return true;
  }
  function downFrame() {
    if (!down) return;
    if (Date.now() >= down.until) { const why = down.why; down = null; fall(why); return; }
    modes()?.ktPlace?.(down.hold, null);
  }
  registerPlayerDamageMod('kt-down', (_e, d) => (down ? 0 : d));
  registerPlayerHold('kt-down', () => !!down);
  function fall(why) {
    if (!onShip() || falling) return;
    falling = { why, at: Date.now() };
    if (link.carrying()) online()?.sendKetch?.('drop');
    leave(null);
  }
  let letGoAt = -Infinity, forced = false;
  const weapon = () => modes()?.dungeonCtx?.weaponRig?.()?.playerWeapon ?? null;
  function struck() { if (link.carrying()) online()?.sendKetch?.('hurt'); }
  function carryFrame(t) {
    const pw = weapon();
    const s = ketchCarryStep({ carrying: onShip() && link.carrying() && !!pw, sheathed: pw?.sheathed, forced, letGoAt }, t, () => !!online()?.sendKetch?.('drop'));
    forced = s.forced;
    if (s.letGoAt != null) letGoAt = s.letGoAt;
    if (s.sheathe && pw) pw.sheathed = true;
    if (s.say) mid(KT_CLIENT_TEXT[s.say]);
  }
  registerFootSpeedMod('kt-carry', () => (onShip() && link.carrying() ? KT_CARRY_PACE : 1));
  let ride = null;
  function rideFrame() {
    if (!ride) return;
    if (!onShip()) { ride = null; return; }
    const u = Math.min(1, (performance.now() - ride.t0) / ride.ms), p = bosunLineAt(u);
    const at = u >= 1 ? deckToDungeon(KT_LINE_LAND.x, 0.1, KT_LINE_LAND.z) : deckToDungeon(p[0], p[1] - 1.9, p[2]);
    modes()?.ktPlace?.(at, u >= 1 ? KT_LINE_LAND.yaw : null);
    if (u >= 1) ride = null;
  }
  function takeLine() {
    const a = bosunLineAt(0), b = bosunLineAt(1), len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    ride = { t0: performance.now(), ms: (len / KT_LINE_SPEED) * 1000 };
    if (link.carrying()) online()?.sendKetch?.('drop');
    mid(KT_WORDS.lineTaken);
  }
  function paid(c) {
    if (c && Number.isSafeInteger(c.c)) shares.paid(c);
  }
  function openChest() {
    const at = ketchChestMouth(), f = player.feetAt();
    if (!shares.chest(at, Math.atan2(f[0] - at[0], f[2] - at[2]))) mid(KT_CLIENT_TEXT.chestEmpty);
  }
  const _targets = [];
  function targets() {
    _targets.length = 0;
    if (!onShip()) return NONE;
    const V = link.state(), cl = V.cl, ws = V.ws, carrying = link.carrying();
    if (cl && !carrying) {
      if (V.sg === KT_STAGE.engine) cl.cr.forEach((c, j) => { if (c === 1) _targets.push(target(`kt:cr:${j}`, KT_CRADLES[j][0], KT_HOLD.y, KT_CRADLES[j][1])); });
      if (V.sg === KT_STAGE.bridge && ws?.ph === 2 && ws.ward) cl.br.forEach((c, j) => { if (c === 1) _targets.push(target(`kt:bc:${j}`, KT_BRIDGE_CRADLES[j][0], KT_BRIDGE.y, KT_BRIDGE_CRADLES[j][1])); });
      for (const l of cl.lo ?? NONE) _targets.push(target(`kt:lo:${l[0]}`, l[1], l[2], l[3], 1.1));
    }
    if (cl && carrying) {
      if (V.sg === KT_STAGE.engine) cl.sk.forEach((v, j) => { if (v === 0) _targets.push(target(`kt:sk:${j}`, KT_SOCKETS[j][0], KT_HOLD.y, KT_SOCKETS[j][1], 1.6)); });
      if (ws?.ph === 2 && ws.ward) (ws.rs ?? NONE).forEach((v, k) => { if (v === 0) _targets.push(target(`kt:rs:${k}`, KT_RESONATORS[k][0], KT_BRIDGE.y, KT_RESONATORS[k][1], 4.2, 1.2)); });
    }
    if (V.sg >= KT_STAGE.bridge) _targets.push(target('kt:line', KT_LINE.x, KT_MAIN_TOP.y, KT_LINE.z, 3.4, 0.5));
    _targets.push(target('kt:down', KT_ANCHOR_LIFT.x, 0, KT_ANCHOR_LIFT.z, 3, KT_ANCHOR_LIFT.r - 0.4));
    if (V.sg >= KT_STAGE.vault) {
      _targets.push(target('kt:stern', KT_STERN_LIFT.x, 0, KT_STERN_LIFT.z, 3, KT_STERN_LIFT.r - 0.4));
      _targets.push(target('kt:vault', KT_VAULT.x, 0, KT_VAULT.z, 1.3, 0.9));
    }
    return _targets;
  }
  function name(key) {
    const k = String(key);
    if (k.startsWith('kt:cr:') || k.startsWith('kt:bc:')) return { title: KT_CLIENT_TEXT.cell, subs: [KT_CLIENT_TEXT.cellTake] };
    if (k.startsWith('kt:lo:')) return { title: KT_CLIENT_TEXT.cellLoose, subs: [KT_CLIENT_TEXT.cellTake] };
    if (k.startsWith('kt:sk:')) return { title: KT_CLIENT_TEXT.socket, subs: [KT_CLIENT_TEXT.socketSet] };
    if (k.startsWith('kt:rs:')) return { title: KT_CLIENT_TEXT.resonator, subs: [KT_CLIENT_TEXT.socketSet] };
    if (k === 'kt:line') return { title: KT_CLIENT_TEXT.line, subs: [KT_CLIENT_TEXT.lineSub] };
    if (k === 'kt:down') return { title: KT_CLIENT_TEXT.down, subs: [KT_CLIENT_TEXT.downSub] };
    if (k === 'kt:stern') return { title: KT_CLIENT_TEXT.stern, subs: [KT_CLIENT_TEXT.downSub] };
    if (k === 'kt:vault') { const m = me(); return { title: KT_CLIENT_TEXT.chest, subs: shares.owed().some((e) => !m || e.s === m) ? [KT_CLIENT_TEXT.chestSub] : [] }; }
    return null;
  }
  function press(key) {
    const k = String(key), o = online(), n = Number(k.split(':')[2]);
    if (!onShip() || !(entity.health > 0)) return false;
    if (ketchPressFar(k, link.state().cl, feetDeck())) { mid(tooFarAwayText()); return true; }
    if (k.startsWith('kt:cr:')) return !!o?.sendKetch?.('pick', { c: n });
    if (k.startsWith('kt:bc:')) return !!o?.sendKetch?.('pick', { c: KT_BRIDGE_CRADLE0 + n });
    if (k.startsWith('kt:lo:')) return !!o?.sendKetch?.('pick', { l: n });
    if (k.startsWith('kt:sk:')) return !!o?.sendKetch?.('bank', { s: n });
    if (k.startsWith('kt:rs:')) return !!o?.sendKetch?.('bank', { s: KT_RESONATOR0 + n });
    if (k === 'kt:line') { if (link.state().sg >= KT_STAGE.bridge) takeLine(); else mid(KT_WORDS.bridgeBarred); return true; }
    if (k === 'kt:down' || k === 'kt:stern') return leave(KT_WORDS.lowered);
    if (k === 'kt:vault') { openChest(); return true; }
    return false;
  }
  let hudUp = false, barUp = false;
  function aboardFrame(t) {
    const V = link.state(), f = feetDeck(), zone = f ? deckZoneAt(f[0], f[1], f[2]) : null, o = online();
    if (o?.terminal && o.status !== 'open' && Date.now() - boardedAt > 1500) {
      if (o.error === KT_TEXT.refuse.crew) keepShip(null);
      leave(o.error ? ketchRefusal(o.error) : KT_CLIENT_TEXT.away); return;
    }
    if (ketchShipUnheard(V, Date.now() - boardedAt)) { leave(KT_REFUSE_WORDS.busy); return; }
    const sh = ship();
    if (sh && t >= ketchVoyageOf(sh.n).endAt) { leave(KT_CLIENT_TEXT.away); return; }
    if (zone === 'bridge' && entity.health > 0 && link.inDue(t) && o?.sendKetch?.('in', { lv: Math.max(1, entity.level | 0) })) link.sentIn(t);
    // Health is reported for the whole voyage because the relay counts every blow taken aboard, including those
    // before the Warden fight.
    if (entity.health > 0 && entity.maxHealth > 0) sayBody(entity.health / entity.maxHealth, performance.now());
    try { fight.frame(); } catch (e) { console.warn('[kt] fight', e?.message ?? e); }
    carryFrame(t);
    rideFrame();
    try { spoils.frame(); } catch (e) { console.warn('[kt] spoils', e?.message ?? e); }
    const hidden = !!deps.hudHidden?.();
    drawKetchHud(ketchHudModel(V, t, { carrying: link.carrying() }), { hidden });
    hudUp = true;
    const bar = V.ws && (zone === 'bridge' || zone === 'gangway' || zone === 'cabin') ? wardenBarModel(V.ws, t, ketchVoyageOf(V.n).endAt) : null;
    if (bar || barUp) { drawGateBossBar(bar, { hidden }); barUp = !!bar; }
  }
  function offShip() {
    if (hudUp) { drawKetchHud(null); hudUp = false; }
    if (barUp) { drawGateBossBar(null); barUp = false; }
    link.leave(); fight.leave(); ride = null; forced = false;
    void shares.give();
    try { spoils.gather(); deps.changed?.(); } catch (e) { console.warn('[kt] spoils', e?.message ?? e); }
  }

  registerPlayerDeathSave('kt-fall', () => { if (!onShip()) return false; if (!lieDown('death')) fall('death'); return true; });

  return {
    word(w) {
      if (!w) return;
      if (w.k === 'rcpt') { claims.add(w.r); return; }
      if (w.k === 'bd') { if (!lieDown('count')) fall('count'); return; }
      if (w.k === 'rez' && w.s === me() && down) { down = null; entity.health = Math.max(1, Math.round((entity.maxHealth ?? 1) * KT_REZ_PCT)); mid(t('kt.raised', '{name} raises you.', { name: w.by || t('resurrect.companion', 'Your companion') })); return; }
      if (w.k === 'rez' && w.s !== me()) say(t('kt.raisedOther', '{by} raises {name}.', { by: w.by, name: w.n }));
      if (!onShip()) return;
      const kept = ketchShipKept(w, me(), ship(), social()?.party?.id ?? null);
      if (kept) keepShip(kept);
      link.word(w);
      if (w.k === 'bank' && w.s === me()) noteAct('ketch-cell-banked');
    },
    frame() {
      const t = now();
      voyageWords(t);
      const aboard = onShip();
      if (aboard && !wasOnShip) { link.leave(); fight.leave(); }
      if (!aboard && wasOnShip) offShip();
      wasOnShip = aboard;
      if (aboard) { downFrame(); aboardFrame(t); }
      const o = online();
      if (o) o.poseDown = aboard && down ? () => down?.spot ?? null : null;
      if (!aboard) {
        down = null;
        if ((modes()?.mode ?? 'exterior') === 'exterior') {
          try { sky.frame(); } catch (e) { console.warn('[kt] sky', e?.message ?? e); }
          if (falling) {
            falling = null;
            if (entity.maxHealth > 0) entity.health = Math.max(entity.health, Math.max(1, Math.round(entity.maxHealth * KT_FALL_WAKE)));
            mid(KT_WORDS.died);
          }
        }
      }
      claims.tick();
    },
    drawSky: (r) => ((modes()?.mode ?? 'exterior') === 'exterior' ? sky.draw(r) : 0),
    castBack() {
      if (entity.health > 0) { const n = Math.max(1, Math.round((entity.maxHealth ?? 0) * KT_CAST_BACK_LOSS)); hurtPlayer(entity, n, { bypassShield: true, spare: () => {} }); flashPlayerDamage(n); }
      if (link.carrying()) online()?.sendKetch?.('drop');
      mid(KT_WORDS.castBack);
    },
    boss: () => fight.bossTarget(),
    bossHit: (h) => fight.bossHit(h),
    forks: () => fight.forkTargets(),
    forkHit: (h) => fight.forkHit(h),
    hostTargets: () => fight.hostTargets(),
    hostHit: (h) => fight.hostHit(h),
    batches: () => fight.batches(),
    voyage: () => link.state(),
    now: () => now(),
    clock: () => now() / 1000,
    carried() {
      const out = [];
      const cs = link.carriers(), mine = me();
      for (const sub of cs) {
        if (sub === mine) { const f = player.feetAt(), y = cam.yaw ?? 0; out.push([f[0] + Math.sin(y) * 0.5, f[1] + 0.85, f[2] + Math.cos(y) * 0.5]); continue; }
        const p = peers().find((q) => q.sub === sub)?.pos;
        if (p) out.push([p[0], p[1] + 0.85, p[2]]);
      }
      return out;
    },
    targets, name, press,
    spoils,
    spoilsHeld: (id) => { try { return spoils.heldIds?.(id) ?? []; } catch { return []; } },
    spoilsLanded(id, ids) { try { spoils.saved(id, ids); } catch (e) { console.warn('[kt] spoils', e?.message ?? e); } },
    recoverSpoils(id, inSave = null) {
      try { if (recoverSpoils(deps.store ?? null, takeSpoil, { who: id, saves: enumerateSaves().info.values(), onHanded: (rec) => spoils.adopt(rec), key: KT_SPOILS_KEYS.store, inSave })) mid(KT_SPOILS_TEXT.granted); } catch (e) { console.warn('[kt] spoils', e?.message ?? e); }
      void shares.give();
    },
    lights: () => [...fight.lights(), ...(spoils.lights?.() ?? NONE)],
    halos: (list) => fight.halos(list),
    drawPass(proj, view, eye, seconds, fog) {
      const a = fight.drawPass(proj, view, eye, seconds, fog), b = !!spoils.drawPass?.(proj, view, eye, seconds, fog);
      return a || b;
    },
    offerBodies: (lane) => fight.offerBodies(lane),
    onTraverse: () => { const f = feetDeck(); const z = f ? deckZoneAt(f[0], f[1], f[2]) : null; return z === 'sailwalk' || z === 'top'; },
    mapMark() {
      const t = now(), pose = ketchSkyPose(t);
      if (!pose) return null;
      const lines = [ketchSkyPhase(pose.phase), ketchWhenLine(t)];
      const px = cityRead()?.px ?? KT_CITY_PX;
      return { day: pose.v.n, cx: px.x + 0.5, cy: px.y + 0.5, r: KT_RING_R, label: KT_WORDS.name, phase: pose.phase, tip: { title: KT_WORDS.name, lines } };
    },
    crew: () => link.state().crew,
    aboard: () => onShip(),
    board,
    link, claims, fight, sky,
  };
}
