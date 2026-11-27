// The world's spoils: the gate, raid, serpent, and Abyss spoils pools with their save-slot hooks,
// the Abyss receipts and voice, and the lost-spoils recovery at startup. It also holds the sigil
// broker, the insignia and panoply, the staff event silver claim, and a granted deed's hold.
// The spoils store and the online hosts stay in the world.
import {
  accountRefusalText, adoptIdentity as adoptSessionIdentity, buyInsignia, claimEventReceipt, equipAura, equipTitle,
  readAccount, serviceBase, storedSession,
} from '../net/accountClient.js';
import { addGoldPieces, addItem } from '../items/inventory.js';
import { appStorage } from '../platform/appStorage.js';
import { audio } from '../audio/audio.js';
import { AURA_TEXT, TITLE_TEXT } from '../ui/playerBadge.js';
import { BREACH_BOOK_TEXT, breachBookFor } from '../worldEvents/breachBook.js';
import {
  brokerBought, brokerDay, brokerOwedText, brokerStock, lockedStonesIn, makeBrokerSale, spendableStonesIn, stoneCount,
  stonesText,
} from '../worldEvents/sigilBroker.js';
import { cannotCarryText, planTake } from '../items/itemTransfer.js';
import { characterIdOf } from '../characters/characterId.js';
import { checkpointLanded, homeClaimLayout } from '../homes/onlineHomes.js';
import { createBrokerOverlay } from '../ui/brokerDoor.js';
import { createSdVoice, SD_VOICE_RANK } from '../worldEvents/sdVoice.js';
import {
  createSpoilsPool, recoverSpoils, SPOILS_SPENT_RESEND_MS, SPOILS_TEXT, spoilsLevel, spoilsLock,
} from '../worldEvents/spoilsPool.js';
import { EG_SINK_EMBERS } from '../net/eliteGates/egPay.js';
import { enumerateSaves, onSlotSaved } from '../saves/saveSlots.js';
import { INSIGNIA, insigniaRefusal } from '../net/insignia.js';
import { itemIconColor32 } from '../ui/itemIconColor32.js';
import { itemLongName } from '../items/itemInfo.js';
import { lootPileName } from '../ui/worldTooltips.js';
import { lostSpoilsMail } from '../net/lostSpoils.js';
import { PANOPLY_NAMES, panoplyRows } from '../ui/brokerWindow.js';
import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { RAID_SPOILS_KEYS, RAID_SPOILS_RECORDS_MAX, RAID_SPOILS_TEXT } from '../worldEvents/raidSpoils.js';
import { readSdReceipt } from '../net/sdReceipt.js';
import {
  SD_SPOILS_KEYS, SD_SPOILS_RECORDS_MAX, SD_SPOILS_TEXT, sdSpoilsDay, sdSpoilsList, sdSpoilsSlot,
} from '../worldEvents/sdSpoilsRoll.js';
import { sdBarNear } from '../ui/sdRemnantBar.js';
import { dungeonToRealm as sdDungeonToRealm } from '../net/sdBrain.js';
import {
  SERPENT_SPOILS_KEYS, SERPENT_SPOILS_RECORDS_MAX, SERPENT_SPOILS_TEXT,
} from '../worldEvents/serpentSpoils.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { SOUND } from '../audio/soundClips.js';
import { staffRaidOfKey as staffEventRaidOf } from '../worldEvents/staffEvents.js';
import { wireRealmHolds } from '../homes/realmHoldHost.js';

/** @param {any} shared */
export function createSpoilsWorld(shared) {
  const {
    _accountGates, _mode, _realmSaveHooks, _spoilsStore, getTexture, onlineCheckpointLanded, onlineHomes, player,
    realmSession, renderer, socialLink, townTalk, uploadRecordFrame,
  } = shared;
  async function holdGrantedDeed({ region, mapId, buildingKey }) {
    if (!onlineHomes || !checkpointLanded(await onlineCheckpointLanded())) return { ok: false, error: 'offline' };
    return onlineHomes.holdDeed({ region, mapId, buildingKey, layout: homeClaimLayout(mapId) });
  }

  const takeSpoil = (p) => { if (p.kind === 'gold') addGoldPieces(playerEntity, p.gold); else if (p.item) addItem(playerEntity.items, p.item); };
  const takeGateSpoil = (p) => {
    takeSpoil(p);
    const book = p.kind === 'item' ? breachBookFor(p.item) : null;
    if (book) { addItem(playerEntity.items, book); shared.chatNotice(BREACH_BOOK_TEXT); }
  };
  const lostMail = lostSpoilsMail({ box: () => shared.postBox, say: (text) => shared.chatNotice(text) });
  const spoilsPool = createSpoilsPool({
    renderer, gl: renderer.gl, getTexture, uploadRecordFrame, audio, mail: lostMail,
    ray: (from, dir, len) => { const c = shared.modes?.dungeonCtx?.collider; const h = c?.raycastHit ? c.raycastHit(from, dir, len) : { dist: c?.raycast?.(from, dir, len) ?? Infinity, normal: null }; return Number.isFinite(h?.dist) ? h : null; },
    now: () => Date.now() + shared._sharedOffsetMs,
    take: takeGateSpoil,
    say: (text) => setMidScreenText(text),
    store: _spoilsStore,
    who: () => characterIdOf(playerEntity),
    iconOf: (item) => itemIconColor32(item, { identity: playerEntity }),
    onSpent: (day) => socialLink()?.sendGateSpent?.(day) === true,
    me: _accountGates.me,
    itemName: (item) => lootPileName([item]),
  });
  const raidSpoils = createSpoilsPool({
    ray: () => null, now: () => Date.now() + shared._sharedOffsetMs, take: takeSpoil, say: (text) => setMidScreenText(text),
    store: _spoilsStore, who: () => characterIdOf(playerEntity), keys: RAID_SPOILS_KEYS, recordsMax: RAID_SPOILS_RECORDS_MAX,
  });
  onSlotSaved((characterId) => { try { spoilsPool.saved(characterId); } catch (e) { console.warn('[gate] spoils', e?.message ?? e); } });
  _realmSaveHooks.held = (who) => { try { return [...(spoilsPool?.heldIds?.(who) ?? []), ...(raidSpoils?.heldIds?.(who) ?? []), ...(serpentSpoils?.heldIds?.(who) ?? []), ...(sdSpoilsPool?.heldIds?.(who) ?? []), ...(shared.starfall?.spoilsHeld(who) ?? []), ...(shared.ketch?.spoilsHeld(who) ?? [])]; } catch { return null; } };
  wireRealmHolds(realmSession, { say: (t) => townTalk.say(t), entity: playerEntity });
  _realmSaveHooks.landed = (who, ids) => { try { spoilsPool?.saved(who, ids); } catch (e) { console.warn('[gate] spoils', e?.message ?? e); } try { raidSpoils?.saved(who, ids); } catch (e) { console.warn('[raid] spoils', e?.message ?? e); } try { serpentSpoils?.saved(who, ids); } catch (e) { console.warn('[serpent] spoils', e?.message ?? e); } try { sdSpoilsPool?.saved(who, ids); } catch (e) { console.warn('[sd] spoils', e?.message ?? e); } shared.starfall?.spoilsSaved(who, ids); shared.ketch?.spoilsLanded(who, ids); };
  onSlotSaved((characterId) => { try { raidSpoils.saved(characterId); } catch (e) { console.warn('[raid] spoils', e?.message ?? e); } });
  const serpentSpoils = createSpoilsPool({
    ray: () => null, now: () => Date.now() + shared._sharedOffsetMs, take: takeGateSpoil, say: (text) => setMidScreenText(text),
    store: _spoilsStore, who: () => characterIdOf(playerEntity), keys: SERPENT_SPOILS_KEYS, recordsMax: SERPENT_SPOILS_RECORDS_MAX,
  });
  onSlotSaved((characterId) => { try { serpentSpoils.saved(characterId); } catch (e) { console.warn('[serpent] spoils', e?.message ?? e); } });
  const sdVoiceCovered = () => !!shared.modes?.dungeonCtx?.overlayWindow?.() || !!shared.modes?.dungeonCtx?.uiOverlayActive;
  const sdVoice = createSdVoice({ show: (t, secs) => setMidScreenText(t, secs), now: () => performance.now(), covered: sdVoiceCovered });
  const sdSay = (t, rank = SD_VOICE_RANK.turn, key = null) => { sdVoice.say(t, rank, key); return true; };
  const sdNearArena = () => {
    if (shared.modes?.sdRealmSlot?.() == null) return false;
    const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]);
    return sdBarNear(x, z);
  };
  let _sdVoiceIn = false;
  const sdVoiceFrame = () => {
    const inHour = shared.modes?.sdRealmSlot?.() != null;
    if (_sdVoiceIn && !inHour) sdVoice.leave();
    _sdVoiceIn = inHour;
    sdVoice.frame();
  };
  const sdSpoilsPool = createSpoilsPool({
    renderer, gl: renderer.gl, getTexture, uploadRecordFrame, audio, mail: lostMail,
    ray: (from, dir, len) => { const c = shared.modes?.dungeonCtx?.collider; const h = c?.raycastHit ? c.raycastHit(from, dir, len) : { dist: c?.raycast?.(from, dir, len) ?? Infinity, normal: null }; return Number.isFinite(h?.dist) ? h : null; },
    now: () => Date.now() + shared._sharedOffsetMs, take: takeSpoil, say: (text) => (text === SD_SPOILS_TEXT.gathered ? shared.chatNotice(text) : sdSay(text, SD_VOICE_RANK.note)),
    store: _spoilsStore, who: () => characterIdOf(playerEntity),
    iconOf: (item) => itemIconColor32(item, { identity: playerEntity }),
    onSpent: (day) => { const s = sdSpoilsSlot(day); return s == null || socialLink()?.sendSdSpent?.(s) === true; },
    me: _accountGates.me,
    keys: SD_SPOILS_KEYS, recordsMax: SD_SPOILS_RECORDS_MAX,
    itemName: (item) => lootPileName([item]), gathered: SD_SPOILS_TEXT.gathered,
  });
  onSlotSaved((characterId) => { try { sdSpoilsPool.saved(characterId); } catch (e) { console.warn('[sd] spoils', e?.message ?? e); } });

  function sdSpoilsReceipt(r, room) {
    const c = readSdReceipt(r);
    if (!c) return;
    // A receipt for the Hour the player is in waits for its throw, whichever link delivered it.
    if (shared.modes?.sdRealmSlot?.() === c.d) { shared._sdReceipts.set(c.d, r); return; }
    grantSdSpoils(c);
  }
  function grantSdSpoils(c) {
    const level = spoilsLevel(playerEntity.level ?? 1, c.l);
    spoilsLock(() => sdSpoilsPool.grant({ day: sdSpoilsDay(c.d), acct: c.s, roll: () => sdSpoilsList(c.c, level), text: SD_SPOILS_TEXT.granted }))
      .catch((e) => console.warn('[sd] spoils', e?.message ?? e));
  }
  function sdReceiptsLeft() {
    for (const r of shared._sdReceipts.values()) { const c = readSdReceipt(r); if (c) grantSdSpoils(c); }
    shared._sdReceipts.clear();
  }

  const spoilsRecoverFrame = () => {
    if (!shared.playerSpawned) return;
    const who = characterIdOf(playerEntity);
    if (who === shared._spoilsAskedFor) return;
    shared._spoilsAskedFor = who;
    try { if (recoverSpoils(_spoilsStore, takeGateSpoil, { who, saves: enumerateSaves().info.values(), onHanded: (rec) => spoilsPool.adopt(rec), inSave: shared._spoilsInSave })) setMidScreenText(SPOILS_TEXT.gathered); } catch (e) { console.warn('[gate] spoils', e?.message ?? e); }
    try { if (recoverSpoils(_spoilsStore, takeSpoil, { who, saves: enumerateSaves().info.values(), onHanded: (rec) => raidSpoils.adopt(rec), key: RAID_SPOILS_KEYS.store, inSave: shared._spoilsInSave })) setMidScreenText(RAID_SPOILS_TEXT.recovered); } catch (e) { console.warn('[raid] spoils', e?.message ?? e); }
    try { if (recoverSpoils(_spoilsStore, takeGateSpoil, { who, saves: enumerateSaves().info.values(), onHanded: (rec) => serpentSpoils.adopt(rec), key: SERPENT_SPOILS_KEYS.store, inSave: shared._spoilsInSave })) setMidScreenText(SERPENT_SPOILS_TEXT.recovered); } catch (e) { console.warn('[serpent] spoils', e?.message ?? e); }
    try { if (recoverSpoils(_spoilsStore, takeSpoil, { who, saves: enumerateSaves().info.values(), onHanded: (rec) => sdSpoilsPool.adopt(rec), key: SD_SPOILS_KEYS.store, inSave: shared._spoilsInSave })) setMidScreenText(SD_SPOILS_TEXT.recovered); } catch (e) { console.warn('[sd] spoils', e?.message ?? e); }
    shared.starfall?.recoverSpoils(who, shared._spoilsInSave);
    shared.ketch?.recoverSpoils(who, shared._spoilsInSave);
    shared._spoilsInSave = null;
  };

  const resendSpentWords = () => {
    const t = performance.now();
    if (t - shared._spentResendAt < SPOILS_SPENT_RESEND_MS) return;
    shared._spentResendAt = t;
    if (socialLink()?.status !== 'open') return;
    try { for (const pool of [spoilsPool, sdSpoilsPool, shared.ketch?.spoils]) pool?.resendSpent?.(); } catch (e) { console.warn('[spoils] owed words', e?.message ?? e); }
  };

  const _brokerNow = () => Date.now() + shared._sharedOffsetMs;

  let _brokerStock = null;
  const brokerStockNow = () => {
    const day = brokerDay(_brokerNow());
    if (_brokerStock?.day !== day) _brokerStock = { day, offers: brokerStock(day) };
    return _brokerStock.offers;
  };
  const brokerBuy = (offer) => {
    if (!shared.sigilBroker?.stands() || _mode() !== 'exterior') return { ok: false, reason: 'gone' };
    playerEntity.items = playerEntity.items || [];
    const sale = makeBrokerSale(offer, {
      items: playerEntity.items, day: brokerDay(_brokerNow()),
      canCarry: (item, rest) => planTake(item, { bag: rest, entity: playerEntity, dryRun: true }).ok,
    });
    if (!sale.ok) return sale.reason === 'heavy' ? { ...sale, text: cannotCarryText() } : sale;
    audio.playOneShot(SOUND.GoldPieces, 1);
    surfacePlayer();
    return sale;
  };

  const claimStaffEventSilver = (/** @type {string} */ r, /** @type {any} */ c) => {
    const ev = staffEventRaidOf(`s.${c?.v}`)?.staff;
    const io = insigniaIo();
    if (!ev?.sv || !io || shared._eventClaimed.has(c.v)) return;
    shared._eventClaimed.add(c.v);
    claimEventReceipt(io, r).then((a) => { if (a?.paid > 0) townTalk.say(`You are paid ${a.paid} Imperial Argents for the fight.`); else shared._eventClaimed.delete(c.v); }).catch(() => shared._eventClaimed.delete(c.v));
  };
  const insigniaIo = () => { const st = appStorage(); const ses = storedSession(st); return ses ? { fetch: (u, i) => globalThis.fetch(u, i), base: serviceBase(st), secret: ses.secret, account: ses.id ?? null } : null; };

  const insigniaAdopt = (w) => { if (w && typeof w === 'object') shared._insignia = { ...shared._insignia, loaded: true, held: Array.isArray(w.insignia) ? w.insignia : shared._insignia.held, title: w.title ?? null, aura: w.aura ?? null }; };
  async function insigniaLoad() {
    const io = insigniaIo();
    if (!io) { shared._insignia = { ...shared._insignia, loaded: true, held: [], title: null, aura: null }; return; }
    try { const r = await shared.brokerOwed.settled(() => readAccount(io)); if (r.ok) insigniaAdopt(r.data?.wardrobe); } catch { }
  }
  const insigniaRows = () => INSIGNIA.filter((o) => !o.currency).map((o) => ({
    ...o, name: o.kind === 'title' ? TITLE_TEXT[o.key] ?? o.key : AURA_TEXT[o.key] ?? o.key,
    owned: shared._insignia.held.includes(o.id), worn: o.kind === 'title' ? shared._insignia.title === o.key : shared._insignia.aura === o.key,
  }));
  const insigniaSelf = (answer, secret) => {
    shared.online?.adoptIdentity?.({ title: shared._insignia.title, glyphs: shared.online.glyphs, level: shared.online.lv, aura: shared._insignia.aura });
    adoptSessionIdentity(appStorage(), { glyphs: answer?.glyphs, glyphsOff: answer?.glyphsOff, aura: shared._insignia.aura, secret });
  };
  async function insigniaBuy(offer) {
    if (shared._insignia.busy) return { ok: false, text: 'The Broker is busy.' };
    const io = insigniaIo();
    const why = insigniaRefusal(offer, { held: shared._insignia.held, stones: stoneCount(spendableStonesIn(playerEntity.items ?? [])), online: !!io && !!shared.online });
    if (why === 'owned') return { ok: false, text: 'Your account already owns that.' };
    if (why === 'offline') return { ok: false, text: 'Sign in and go online to buy insignia.' };
    if (why === 'stones') return { ok: false, text: `You need ${stonesText(offer.price)}.` };
    if (why) return { ok: false, text: 'The Broker will not sell that.' };
    shared._insignia.busy = true;
    try {
      playerEntity.items = playerEntity.items || [];
      // The price is held first and returned unless the service confirms the sale.
      // A lost reply is looked up by request id.
      const r = await shared.brokerOwed.insignia(offer, (id, rid) => buyInsignia(io, id, rid));
      if (!r.ok) return { ok: false, text: r.error === 'stones' ? `You need ${stonesText(offer.price)}.` : r.error === 'unheard' ? brokerOwedText() : r.error === 'short' ? accountRefusalText('short') : accountRefusalText(r.error) };
      insigniaAdopt(r.data);
      audio.playOneShot(SOUND.GoldPieces, 1);
      surfacePlayer();
      const name = insigniaRows().find((x) => x.id === offer.id)?.name ?? offer.key;
      return { ok: true, text: `Bought: ${name}, for ${stonesText(offer.price)}.` };
    } catch { return { ok: false, text: accountRefusalText('offline') }; } finally { shared._insignia.busy = false; }
  }
  async function insigniaWear(offer) {
    if (shared._insignia.busy) return { ok: false, text: 'The Broker is busy.' };
    const io = insigniaIo();
    if (!io) return { ok: false, text: 'Sign in to wear insignia.' };
    const row = insigniaRows().find((x) => x.id === offer.id);
    if (!row?.owned) return { ok: false, text: 'Your account does not own that.' };
    shared._insignia.busy = true;
    try {
      const want = row.worn ? null : row.key;
      const r = offer.kind === 'title' ? await equipTitle(io, want) : await equipAura(io, want);
      if (!r.ok) return { ok: false, text: accountRefusalText(r.error) };
      insigniaAdopt(r.data);
      insigniaSelf(r.data, io.secret);
      return { ok: true, text: want ? `Wearing ${row.name}.` : `${row.name} taken off.` };
    } catch { return { ok: false, text: accountRefusalText('offline') }; } finally { shared._insignia.busy = false; }
  }
  const openBroker = () => {
    const win = createBrokerOverlay({
      stock: brokerStockNow, day: () => brokerDay(_brokerNow()), now: _brokerNow,
      items: () => spendableStonesIn(playerEntity.items ?? []), locked: () => stoneCount(lockedStonesIn(playerEntity.items ?? [])),
      bought: () => brokerBought(brokerDay(_brokerNow())), buy: brokerBuy,
      wearer: playerEntity, nameOf: (item) => itemLongName(item),
      insignia: insigniaRows, insigniaLoad, buyInsignia: insigniaBuy, wearInsignia: insigniaWear, insigniaBusy: () => shared._insignia.busy,
      panoply: shared._accountEg ? panoplyDeps : null,
    });
    if (win) townTalk.showOverlay(win);
  };
  // The panoply charge is held first and returned on a refusal.
  // A lost reply is looked up through the week's sale.
  let _panoplySink = null;
  const panoplyDeps = {
    rows: () => panoplyRows(_panoplySink),
    load: async () => { try { const a = await shared.brokerOwed.settled(shared._accountEg.keys); if (a?.ok) _panoplySink = a.data?.sink ?? null; } catch { } },
    busy: () => shared._insignia.busy,
    buy: async (id) => {
      if (shared._insignia.busy) return { ok: false, text: 'The Broker is busy.' };
      shared._insignia.busy = true;
      try {
        playerEntity.items = playerEntity.items || [];
        const r = await shared.brokerOwed.panoply(id, (p, rid) => shared._accountEg.sink(p, rid));
        if (!r.ok) return { ok: false, text: r.error === 'stones' ? `You need ${stonesText(EG_SINK_EMBERS)}.` : r.error === 'unheard' ? brokerOwedText() : accountRefusalText(r.error) };
        _panoplySink = { week: r.data?.week ?? _panoplySink?.week ?? null, piece: id };
        audio.playOneShot(SOUND.GoldPieces, 1);
        surfacePlayer();
        return { ok: true, text: `Bought: ${PANOPLY_NAMES[id] ?? id}, for ${stonesText(EG_SINK_EMBERS)}.` };
      } catch { return { ok: false, text: accountRefusalText('offline') }; } finally { shared._insignia.busy = false; }
    },
  };
  return {
    _brokerNow, claimStaffEventSilver, holdGrantedDeed, insigniaAdopt, insigniaIo, insigniaLoad, insigniaSelf,
    openBroker, raidSpoils, resendSpentWords, sdNearArena, sdReceiptsLeft, sdSay, sdSpoilsPool, sdSpoilsReceipt,
    sdVoiceFrame, serpentSpoils, spoilsPool, spoilsRecoverFrame, takeGateSpoil, takeSpoil,
  };
}
