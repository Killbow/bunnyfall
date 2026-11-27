// @ts-check
import {
  bindFestival, festivalLive, festivalShut, festivalAccount, festivalState, festivalFindsToday, festivalWardrobe, hearFestival, offeringMove, townOfferings,
  refreshFestival, buyWare, wearWare, wearAccount, wareItem, loadWardrobe,
} from '../systems/festival/festivalClient.js';
import { setOfferingPlacer, hearthOffering } from '../systems/festival/soulCake.js';
import { cakesText, cakesFoundText, festivalRefusalText, festivalNotice, festivalNightText, lastDayText } from '../systems/festival/festivalWords.js';
import { eventNotice } from '../worldEvents/eventNotices.js';
import { festivalOpen, festivalNext, deadWalk, accountWare, bowlWare, wareById } from '../net/festivalLaw.js';
import { doorFront, offeringSpot } from '../world/witchesDecor.js';
import { FESTIVAL_ARCHIVE, FESTIVAL_ART } from '../world/festivalArt.js';
import { billboardSize } from '../world/rmbFlats.js';
import { flatBatchAabb } from '../render/frustum.js';
import { RAY_DISTANCE, DEFAULT_ACTIVATION_DISTANCE, presentNpcInfoText } from '../player/activate.js';
import { playerEntity } from '../characters/playerEntity.js';
import { characterIdOf } from '../characters/characterId.js';
import { itemLongName } from '../items/itemInfo.js';
import { skyMinutes } from '../world/worldTick.js';
import { dayOfYearFromMinutes } from '../world/gameDate.js';
import { createWyrdOverlay } from '../ui/wyrdDoor.js';
import { noteAct } from '../systems/questlines/qlActs.js';
import { t } from '../ui/textManager.js';

export const OFFERING_REFRESH_MS = 60_000;
export const OFFERING_SET_REACH = 4;
export const OFFERING_LIGHT_DROP = 0.32;
export const offeringKey = (/** @type {number} */ mapId, /** @type {number} */ buildingKey) => `witch:${mapId}:${buildingKey}`;

export const OFFERING_TEXT = Object.freeze({
  whose: (/** @type {string} */ owner) => t('festival.offering.whose', "{owner}'s Hearth Offering", { owner }),
  take: () => t('festival.offering.take', 'Take a Soul Cake'),
  fill: () => t('festival.offering.fill', 'Fill'),
  takeIn: () => t('festival.offering.takeIn', 'Take in'),
  filled: (/** @type {number} */ n) => t('festival.offering.filled', 'The bowl holds {n, plural, one {# Soul Cake} other {# Soul Cakes}}.', { n }),
  tookIn: (/** @type {number} */ n) => (n > 0 ? t('festival.offering.tookIn', 'You take in your offering. +{n, plural, one {# Soul Cake} other {# Soul Cakes}}', { n }) : t('festival.offering.tookInEmpty', 'You take in your offering.')),
  setOut: () => t('festival.offering.setOut', 'You set out your Hearth Offering. Use Fill to put cakes in it.'),
  steal: () => t('festival.offering.steal', 'The Wyrd watch over offerings.'),
});

/** @param {any} deps */
export function createWitchesHost(deps) {
  const { built, renderer, pipeline, onlineHomes, townTalk, state, player, saveSoon } = deps;
  const room = () => deps.online ?? null;
  const online = () => { const o = room(); return !!o && o.status === 'open'; };
  const say = (/** @type {string} */ l) => { if (l) townTalk?.say?.(l); };
  const nowMs = () => { const o = room(); return Date.now() + (o?.clockRead ? o.clockOffsetMs ?? 0 : 0); };
  bindFestival({ online, entity: () => playerEntity, say: (/** @type {string} */ l) => deps.chatNotice?.(l), selfId: () => room()?.id ?? null, saved: () => saveSoon?.changed?.(), room, nowMs, ...(deps.api ? { api: deps.api } : {}) });

  const towns = new Map();
  const stood = new Map();
  const standing = new Map();
  let heard = false, noticed = false, nightSaid = -1, account = /** @type {string|null} */ (null);

  const pixelKey = (/** @type {any} */ e) => `${e.px},${e.py}`;
  /** Each box uses the ray's `{ min, max }` shape; a culling box's 6-array throws in the ray. */
  const _targets = /** @type {import('../player/activate.js').RayTarget[]} */ ([]), _tr = [0, 0, 0];
  const here = () => {
    const c = state?.current;
    const entry = c ? built.get(`${c.x},${c.y}`) : null;
    return entry?.homeTown ? entry : null;
  };
  function spotOf(/** @type {any} */ entry, /** @type {number} */ mapId, /** @type {number} */ bk) {
    if (entry.witchHomes instanceof Map) return entry.witchHomes.get(bk) ?? null;
    const xz = offeringSpot(entry.homeFrames?.get?.(bk), mapId, bk);
    return xz ? [xz[0], entry.witchFloor ?? entry.avgY ?? 0, xz[1]] : null;
  }
  function unstand(/** @type {string} */ key) {
    const s = stood.get(key);
    stood.delete(key);
    if (!s) return;
    for (const r of s.rows) {
      const i = s.entry.batches.indexOf(r.batch);
      if (i >= 0) s.entry.batches.splice(i, 1);
      renderer.destroyBatch(r.batch);
      const j = s.entry.lights.indexOf(r.light);
      if (j >= 0) s.entry.lights.splice(j, 1);
    }
  }
  async function stand(/** @type {any} */ entry, /** @type {number} */ mapId, /** @type {any[]} */ list) {
    const key = pixelKey(entry);
    standing.set(key, list);
    const tex = await pipeline.getTexture(FESTIVAL_ARCHIVE).catch(() => null);
    if (standing.get(key) !== list) return;
    standing.delete(key);
    if (built.get(key) !== entry) return;
    unstand(key);
    const record = FESTIVAL_ART.offering;
    if (!tex || record >= tex.recordCount) return;
    (entry.placeHold ?? pipeline).uploadRecord(FESTIVAL_ARCHIVE, record);
    const size = billboardSize(tex, record);
    const rows = [];
    for (const o of list) {
      const c = spotOf(entry, mapId, o.buildingKey);
      if (!c) continue;
      const batch = renderer.createBillboardBatch(FESTIVAL_ARCHIVE, record, size, [c]);
      batch._box = flatBatchAabb([c], size);
      entry.batches.push(batch);
      const light = [c[0], c[1] + size.h - OFFERING_LIGHT_DROP, c[2]];
      entry.lights.push(light);
      rows.push({ o, c, batch, light });
    }
    stood.set(key, { entry, mapId, list, rows });
  }
  function ask(/** @type {number} */ mapId) {
    let t = towns.get(mapId);
    if (!t) towns.set(mapId, (t = { at: 0, list: null, asking: false }));
    if (t.asking) return;
    t.asking = true;
    const town = t;
    townOfferings(mapId).then((d) => { if (Array.isArray(d?.offerings) && JSON.stringify(d.offerings) !== JSON.stringify(town.list)) town.list = d.offerings; }, () => {})
      .finally(() => { town.at = Date.now(); town.asking = false; });
  }
  const herald = (/** @type {string} */ l) => (deps.eventNotice ?? eventNotice)('festival', l);
  function notice() {
    const now = Date.now();
    if (!festivalOpen(now)) return;
    if (!noticed) { noticed = true; herald(festivalNotice(lastDayText(festivalNext(now)))); }
    const day = dayOfYearFromMinutes(Math.floor(skyMinutes())), night = deadWalk(day, nowMs()) ? day : -1;
    if (night >= 0 && nightSaid !== night && festivalLive()) { nightSaid = night; herald(festivalNightText()); }
  }
  const asks = (/** @type {number} */ mapId) => festivalLive() || (festivalShut() !== 'guest' && festivalState().offerings.some((/** @type {any} */ o) => o.mapId === mapId));
  function tick() {
    for (const [k, s] of stood) if (built.get(k) !== s.entry) stood.delete(k);
    if (deps.mode?.() !== 'exterior') return;
    const who = online() ? festivalAccount() : null;
    if (who !== account) { account = who; heard = false; towns.clear(); for (const k of [...stood.keys()]) unstand(k); }
    const entry = here();
    if (!entry) return;
    if (entry.witchHomes) notice();
    if (!online()) return;
    if (!heard) { heard = true; refreshFestival().catch(() => {}); }
    const key = pixelKey(entry), mapId = entry.homeTown;
    if (!asks(mapId)) { towns.delete(mapId); if (stood.has(key)) unstand(key); return; }
    const t = towns.get(mapId);
    if (!t || (!t.asking && Date.now() - t.at >= OFFERING_REFRESH_MS)) ask(mapId);
    if (t?.list && stood.get(key)?.list !== t.list && standing.get(key) !== t.list) stand(entry, mapId, t.list).catch(() => {});
  }

  function offeringOf(/** @type {unknown} */ key) {
    if (typeof key !== 'string' || !key.startsWith('witch:')) return null;
    const [, m, b] = key.split(':');
    const mapId = Number(m), bk = Number(b);
    for (const s of stood.values()) {
      if (s.mapId !== mapId || built.get(pixelKey(s.entry)) !== s.entry) continue;
      const r = s.rows.find((x) => x.o.buildingKey === bk);
      if (r) return { s, r };
    }
    return null;
  }
  const ownsHome = (/** @type {any} */ s, /** @type {any} */ r) => !!onlineHomes?.homeAt?.(s.mapId, r.o.buildingKey)?.own;
  const townAgain = (/** @type {number} */ mapId) => { const t = towns.get(mapId); if (t) t.at = 0; };
  /** Moves run one after another, so a second take is refused `taken` by the service rather than lost. */
  let moves = Promise.resolve();
  function move(/** @type {'take'|'fill'|'takeIn'} */ m, /** @type {any} */ s, /** @type {any} */ r) {
    const run = async () => {
      const at = { mapId: s.mapId, buildingKey: r.o.buildingKey, ...(m === 'take' ? {} : { character: characterIdOf(playerEntity) }) };
      const res = await offeringMove(m, at).catch(() => null);
      townAgain(s.mapId);
      if (!res?.ok) { say(res?.text ?? festivalRefusalText('offline')); return; }
      say(m === 'take' ? cakesFoundText(1) : m === 'fill' ? OFFERING_TEXT.filled(res.data?.stock ?? 0) : OFFERING_TEXT.tookIn(res.data?.returned ?? 0));
    };
    moves = moves.then(run, run);
    return moves;
  }

  function place() {
    const shut = festivalShut();
    if (shut) return festivalRefusalText(shut);
    const entry = here();
    if (deps.mode?.() !== 'exterior' || player?.riding || !entry) return festivalRefusalText('home');
    const mapId = entry.homeTown;
    if (!onlineHomes?.known?.(mapId)) { onlineHomes?.ensure?.(mapId); return festivalRefusalText('offline'); }
    const feet = player.feetAt(), tr = state.pixelTranslation(entry.px, entry.py, _tr);
    let at = null, cramped = false;
    for (const [bk, f] of entry.homeFrames ?? []) {
      const h = onlineHomes.homeAt(mapId, bk);
      const front = h?.own && !h.hall ? doorFront(f) : null;
      if (!front || Math.hypot(front.c[0] + tr[0] - feet[0], front.c[1] + tr[2] - feet[2]) > OFFERING_SET_REACH) continue;
      if (!spotOf(entry, mapId, bk)) { cramped = true; continue; }
      at = bk;
      break;
    }
    if (at == null) return festivalRefusalText(cramped ? 'room' : 'home');
    offeringMove('set', { mapId, buildingKey: at, character: characterIdOf(playerEntity) })
      .then((r) => { say(r.ok ? OFFERING_TEXT.setOut() : r.text); townAgain(mapId); }, () => {});
    return '';
  }
  setOfferingPlacer(place);

  function shop() {
    const win = createWyrdOverlay({
      state: () => festivalState(), worn: () => festivalWardrobe(), shut: () => festivalShut(), today: () => festivalFindsToday(),
      lastDay: () => lastDayText(festivalNext(Date.now())),
      night: () => deadWalk(dayOfYearFromMinutes(Math.floor(skyMinutes())), nowMs()),
      itemOf: (/** @type {any} */ w) => wareItem(w) ?? (bowlWare(w) ? hearthOffering() : null), nameOf: (/** @type {any} */ item) => itemLongName(item), wearer: playerEntity,
      buy: (/** @type {string} */ id) => buyWare(id),
      wear: (/** @type {any} */ row) => (accountWare(wareById(row.id)) ? wearWare(row.id, !row.worn) : wearAccount(row.kind, row.key, !row.worn)),
      load: () => Promise.all([refreshFestival(), loadWardrobe()]),
      hear: (/** @type {() => void} */ fn) => hearFestival(fn),
    });
    if (!win) return false;
    townTalk?.showOverlay?.(win);
    noteAct('wyrd-met');
    return true;
  }

  return {
    frame() { try { tick(); } catch (e) { console.warn('[witches] frame', /** @type {any} */ (e)?.message ?? e); } },
    targets() {
      _targets.length = 0;
      if (deps.mode?.() !== 'exterior') return _targets;
      for (const [k, s] of stood) {
        if (built.get(k) !== s.entry) continue;
        const tr = state.pixelTranslation(s.entry.px, s.entry.py, _tr);
        for (const r of s.rows) {
          const x = r.batch._box;
          _targets.push({ key: offeringKey(s.mapId, r.o.buildingKey), aabb: { min: [x[0] + tr[0], x[1] + tr[1], x[2] + tr[2]], max: [x[3] + tr[0], x[4] + tr[1], x[5] + tr[2]] }, distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE });
        }
      }
      return _targets;
    },
    hoverName(/** @type {unknown} */ key) {
      const hit = offeringOf(key);
      if (!hit) return null;
      const { s, r } = hit;
      const title = OFFERING_TEXT.whose(r.o.owner), subs = [cakesText(r.o.stock)];
      if (ownsHome(s, r)) return { title, subs, actions: [...(festivalLive() ? [{ id: 'fill', label: OFFERING_TEXT.fill() }] : []), { id: 'takeIn', label: OFFERING_TEXT.takeIn() }] };
      if (r.o.mine) return { title, subs: [...subs, festivalRefusalText('own')] };
      const why = r.o.taken ? 'taken' : r.o.stock < 1 ? 'empty' : null;
      return { title, subs, actions: [{ id: 'take', label: why ? festivalRefusalText(why) : OFFERING_TEXT.take(), disabled: !!why }] };
    },
    activate(/** @type {unknown} */ key, mode = 'grab', /** @type {string|null} */ verb = null) {
      const hit = offeringOf(key);
      if (!hit) return false;
      const { s, r } = hit;
      if (verb == null && mode === 'info') { say(presentNpcInfoText(OFFERING_TEXT.whose(r.o.owner))); return true; }
      if (verb == null && mode === 'steal') { say(OFFERING_TEXT.steal()); return true; }
      if (ownsHome(s, r)) { void move(verb === 'takeIn' || !festivalLive() ? 'takeIn' : 'fill', s, r); return true; }
      if (r.o.mine) { say(festivalRefusalText('own')); return true; }
      void move('take', s, r);
      return true;
    },
    shop,
  };
}
