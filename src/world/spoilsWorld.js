// The world's spoils: the gate, raid, serpent, and Abyss spoils pools with their save-slot hooks,
// the Abyss receipts and voice, and the lost-spoils recovery at stand-up. It also holds the sigil
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
  /** FIELD BUGS 2026-10-04d KNIGHT-HOUSE: THE HOUSE AN ORDER HAS JUST GIVEN, HELD (scenes/worldModes.js holdGrantedHouse) -
   *  once the checkpoint carrying its deed has landed, since the service reads the deed off the record. */
  async function holdGrantedDeed({ region, mapId, buildingKey }) {
    if (!onlineHomes || !checkpointLanded(await onlineCheckpointLanded())) return { ok: false, error: 'offline' };   // no record holds it yet: the next boot holds it
    return onlineHomes.holdDeed({ region, mapId, buildingKey, layout: homeClaimLayout(mapId) });
  }

  /** WB5: a spoil into the pack - the gold to the purse, an item to the items (the one door the spew, the gather and
   *  a crash's recovery all take). */
  const takeSpoil = (p) => { if (p.kind === 'gold') addGoldPieces(playerEntity, p.gold); else if (p.item) addItem(playerEntity.items, p.item); };
  /** WB12c: a breach's spoil into the pack - and the first ember brings On the Burning Doors (systems/breachBook.js).
   *  SERPENT-SET: a serpent's hoard pays the gate's embers too, and takes its spoils by this door - a first ember won at
   *  sea brings the book as a breach's does. */
  const takeGateSpoil = (p) => {
    takeSpoil(p);
    const book = p.kind === 'item' ? breachBookFor(p.item) : null;
    if (book) { addItem(playerEntity.items, book); shared.chatNotice(BREACH_BOOK_TEXT); }
  };
  /** WB5: THE SPOILS ON THE COURT'S FLOOR (scenes/spoilsPool.js) - this player's alone, off their receipt's seed.
   *  AUDIT WBX2 M1: made online or not - it is also the keeper of the crash's records, which a save that lands clears
   *  (AUDIT WBX S3), and the crash's door hands a record back offline too: made online alone, a boot offline gave the same
   *  spoils again at every boot, since no save could ever clear their record. */
  /** LOST-SPOILS (net/lostSpoils.js): what a boss's floor still holds as I leave goes to the mailbox - the court's and the
   *  Hour's pools (the Brass Remnant's arena and a breach's Redoubts); its lines in the chat, beside the post's own. */
  const lostMail = lostSpoilsMail({ box: () => shared.postBox, say: (text) => shared.chatNotice(text) });
  const spoilsPool = createSpoilsPool({
    renderer, gl: renderer.gl, getTexture, uploadRecordFrame, audio, mail: lostMail,
    ray: (from, dir, len) => { const c = shared.modes?.dungeonCtx?.collider; const h = c?.raycastHit ? c.raycastHit(from, dir, len) : { dist: c?.raycast?.(from, dir, len) ?? Infinity, normal: null }; return Number.isFinite(h?.dist) ? h : null; },
    now: () => Date.now() + shared._sharedOffsetMs,
    take: takeGateSpoil,
    say: (text) => setMidScreenText(text),
    store: _spoilsStore,
    who: () => characterIdOf(playerEntity),
    iconOf: (item) => itemIconColor32(item, { identity: playerEntity }),   // WBX3: each piece as its own picture - the pack's; AUDIT WBX S6: drawn for its wearer, as the pack draws it
    onSpent: (day) => socialLink()?.sendGateSpent?.(day) === true,   // AUDIT WBX S1: a receipt spent here - the hub forgets its copy, so no other device or tab gives it again; AUDIT SD II (L5 F4): whether it went - a word that did not is owed
    me: _accountGates.me,   // AUDIT SD II (L5 F4): said on its own account's socket alone
    itemName: (item) => lootPileName([item]),   // WB9f: a piece's word on the plaque, the loot piles' own (.cs:534-548)
  });
  /** RAID4b: A TOWN'S THANKS (systems/raidSpoils.js) - the spoils pool's door with no floor, under keys of its own (a
   *  town's receipts never push a boss's out of the spent list), and no word to the hub (it never kept a raid's receipt).
   *  Made online or not, as the pool is: it keeps the crash's records a save clears. */
  const raidSpoils = createSpoilsPool({
    ray: () => null, now: () => Date.now() + shared._sharedOffsetMs, take: takeSpoil, say: (text) => setMidScreenText(text),
    store: _spoilsStore, who: () => characterIdOf(playerEntity), keys: RAID_SPOILS_KEYS, recordsMax: RAID_SPOILS_RECORDS_MAX,   // AUDIT RAID R8a
  });
  // AUDIT WBX S3: a save that lands holds the pieces in the pack - their crash records clear on it, by the event
  onSlotSaved((characterId) => { try { spoilsPool.saved(characterId); } catch (e) { console.warn('[gate] spoils', e?.message ?? e); } });
  // REALM P1.3: a realm checkpoint's spoils. AUDIT REALM2 C1: a town's thanks with them - RAID4b's own pool was cleared by a
  // slot's save alone (onSlotSaved, below), which a realm character never writes, so every join handed the thanks back
  _realmSaveHooks.held = (who) => { try { return [...(spoilsPool?.heldIds?.(who) ?? []), ...(raidSpoils?.heldIds?.(who) ?? []), ...(serpentSpoils?.heldIds?.(who) ?? []), ...(sdSpoilsPool?.heldIds?.(who) ?? []), ...(shared.starfall?.spoilsHeld(who) ?? []), ...(shared.ketch?.spoilsHeld(who) ?? [])]; } catch { return null; } };   // SERPENT1: and the Old Coil's hoard; SD9e: and the Brass Remnant's spoils; STAR7: and a held star's
  // INT3: the judge's hold, said to the player each time a landed checkpoint moves it (systems/realmSaves.js); AUTO-HOLD: and
  // the pieces the ledger locked, named (scenes/realmHoldHost.js)
  wireRealmHolds(realmSession, { say: (t) => townTalk.say(t), entity: playerEntity });
  _realmSaveHooks.landed = (who, ids) => { try { spoilsPool?.saved(who, ids); } catch (e) { console.warn('[gate] spoils', e?.message ?? e); } try { raidSpoils?.saved(who, ids); } catch (e) { console.warn('[raid] spoils', e?.message ?? e); } try { serpentSpoils?.saved(who, ids); } catch (e) { console.warn('[serpent] spoils', e?.message ?? e); } try { sdSpoilsPool?.saved(who, ids); } catch (e) { console.warn('[sd] spoils', e?.message ?? e); } shared.starfall?.spoilsSaved(who, ids); shared.ketch?.spoilsLanded(who, ids); };   // STAR7: and a held star's (its own catch); AUDIT KETCH L2-3: and the Ketchmaster's hold's (its own)
  onSlotSaved((characterId) => { try { raidSpoils.saved(characterId); } catch (e) { console.warn('[raid] spoils', e?.message ?? e); } });   // RAID4b
  /** SERPENT1: THE OLD COIL'S HOARD (systems/serpent/serpentSpoils.js) - the raids' door, under keys of its own: no floor, no word
   *  to the hub, the crash's records a save clears. Made online or not, as the pools are. */
  const serpentSpoils = createSpoilsPool({
    ray: () => null, now: () => Date.now() + shared._sharedOffsetMs, take: takeGateSpoil, say: (text) => setMidScreenText(text),   // SERPENT-SET: its embers, the book with the first
    store: _spoilsStore, who: () => characterIdOf(playerEntity), keys: SERPENT_SPOILS_KEYS, recordsMax: SERPENT_SPOILS_RECORDS_MAX,
  });
  onSlotSaved((characterId) => { try { serpentSpoils.saved(characterId); } catch (e) { console.warn('[serpent] spoils', e?.message ?? e); } });   // SERPENT1
  /** SD9e: THE BRASS REMNANT'S SPOILS (systems/superDungeon/sdSpoils.js) - thrown on the arena's floor from where it fell
   *  (scenes/superDungeon/sdSpoils.js, the court's burst), under keys of their own; a spent receipt said to the hub as its slot, so no
   *  other tab or device gives it again. Made online or not, as the pools are: it keeps the crash's records a save clears. */
  /** AUDIT SD II (L6 F2, F3, F13; SD11d): THE HOUR'S VOICE (scenes/superDungeon/sdVoice.js) - every line the arc says over the
   *  screen, each standing for its length and none cut by a less urgent one: the fight's turns, then the floor's words,
   *  then the readouts. `sdNearArena` - (L6 F15) the fight's lines are said to whoever stands near its arena (the Steps
   *  heard the Dragon Break and the End, which never touch them). AUDIT SD IV (T3): covered while a window is up over
   *  the label - hud.js ticks DFU's label only with no window up (the dungeon slot's), and a window that stops the
   *  game draws no HUD at all; the voice ran on under it, the lines it passed written over the hidden one. */
  const sdVoiceCovered = () => !!shared.modes?.dungeonCtx?.overlayWindow?.() || !!shared.modes?.dungeonCtx?.uiOverlayActive;
  const sdVoice = createSdVoice({ show: (t, secs) => setMidScreenText(t, secs), now: () => performance.now(), covered: sdVoiceCovered });
  const sdSay = (t, rank = SD_VOICE_RANK.turn, key = null) => { sdVoice.say(t, rank, key); return true; };
  const sdNearArena = () => {
    if (shared.modes?.sdRealmSlot?.() == null) return false;
    const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]);
    return sdBarNear(x, z);
  };
  let _sdVoiceIn = false;
  /** One frame of the voice - and what waits for the Hour let go as it is left (a readout of a collapse I am out of; its
   *  turns, the way out's words among them, still said - AUDIT SD III, H5). */
  const sdVoiceFrame = () => {
    const inHour = shared.modes?.sdRealmSlot?.() != null;
    if (_sdVoiceIn && !inHour) sdVoice.leave();
    _sdVoiceIn = inHour;
    sdVoice.frame();
  };
  const sdSpoilsPool = createSpoilsPool({
    renderer, gl: renderer.gl, getTexture, uploadRecordFrame, audio, mail: lostMail,
    ray: (from, dir, len) => { const c = shared.modes?.dungeonCtx?.collider; const h = c?.raycastHit ? c.raycastHit(from, dir, len) : { dist: c?.raycast?.(from, dir, len) ?? Infinity, normal: null }; return Number.isFinite(h?.dist) ? h : null; },   // the Hour's own floors and pillars
    // AUDIT SD II (L6 F14): what the floor still held, gathered as I leave, said in the chat - over the screen it took the
    // place of the way home's line, or the cast-out's, a frame after it was said
    now: () => Date.now() + shared._sharedOffsetMs, take: takeSpoil, say: (text) => (text === SD_SPOILS_TEXT.gathered ? shared.chatNotice(text) : sdSay(text, SD_VOICE_RANK.note)),
    store: _spoilsStore, who: () => characterIdOf(playerEntity),
    iconOf: (item) => itemIconColor32(item, { identity: playerEntity }),
    onSpent: (day) => { const s = sdSpoilsSlot(day); return s == null || socialLink()?.sendSdSpent?.(s) === true; },   // AUDIT SD II (L5 F4): whether it went
    me: _accountGates.me,
    keys: SD_SPOILS_KEYS, recordsMax: SD_SPOILS_RECORDS_MAX,
    itemName: (item) => lootPileName([item]), gathered: SD_SPOILS_TEXT.gathered,
  });
  onSlotSaved((characterId) => { try { sdSpoilsPool.saved(characterId); } catch (e) { console.warn('[sd] spoils', e?.message ?? e); } });   // SD9e

  function sdSpoilsReceipt(r, room) {
    const c = readSdReceipt(r);
    if (!c) return;
    // AUDIT SD II (L1 F4, L5 C2): a receipt for the Hour I stand in waits for its throw WHICHEVER link handed it - the
    // hub's (my realm's socket blinking at the kill) went straight into the pack, and the floor then said "No spoils"
    if (shared.modes?.sdRealmSlot?.() === c.d) { shared._sdReceipts.set(c.d, r); return; }
    grantSdSpoils(c);
  }
  /** Its spoils straight into the pack - once a receipt and account (the pool refuses one already thrown or given). */
  function grantSdSpoils(c) {
    const level = spoilsLevel(playerEntity.level ?? 1, c.l);
    spoilsLock(() => sdSpoilsPool.grant({ day: sdSpoilsDay(c.d), acct: c.s, roll: () => sdSpoilsList(c.c, level), text: SD_SPOILS_TEXT.granted }))
      .catch((e) => console.warn('[sd] spoils', e?.message ?? e));
  }
  /** AUDIT SD: OUT OF THE REALM, a receipt kept for a burst that never came (left before it - the way back, a death, the
   *  Hour's end) is its spoils straight into the pack, not a week's wait for the hub's next hello. */
  function sdReceiptsLeft() {
    for (const r of shared._sdReceipts.values()) { const c = readSdReceipt(r); if (c) grantSdSpoils(c); }
    shared._sdReceipts.clear();
  }

  const spoilsRecoverFrame = () => {
    if (!shared.playerSpawned) return;
    const who = characterIdOf(playerEntity);
    if (who === shared._spoilsAskedFor) return;
    shared._spoilsAskedFor = who;
    try { if (recoverSpoils(_spoilsStore, takeGateSpoil, { who, saves: enumerateSaves().info.values(), onHanded: (rec) => spoilsPool.adopt(rec), inSave: shared._spoilsInSave })) setMidScreenText(SPOILS_TEXT.gathered); } catch (e) { console.warn('[gate] spoils', e?.message ?? e); }   // AUDIT WBX S3: in the pack now - the next save clears it
    try { if (recoverSpoils(_spoilsStore, takeSpoil, { who, saves: enumerateSaves().info.values(), onHanded: (rec) => raidSpoils.adopt(rec), key: RAID_SPOILS_KEYS.store, inSave: shared._spoilsInSave })) setMidScreenText(RAID_SPOILS_TEXT.recovered); } catch (e) { console.warn('[raid] spoils', e?.message ?? e); }   // RAID4b: a town's thanks, the same door
    try { if (recoverSpoils(_spoilsStore, takeGateSpoil, { who, saves: enumerateSaves().info.values(), onHanded: (rec) => serpentSpoils.adopt(rec), key: SERPENT_SPOILS_KEYS.store, inSave: shared._spoilsInSave })) setMidScreenText(SERPENT_SPOILS_TEXT.recovered); } catch (e) { console.warn('[serpent] spoils', e?.message ?? e); }   // SERPENT1: the Old Coil's hoard, the same door; SERPENT-SET: its embers by the gate's
    try { if (recoverSpoils(_spoilsStore, takeSpoil, { who, saves: enumerateSaves().info.values(), onHanded: (rec) => sdSpoilsPool.adopt(rec), key: SD_SPOILS_KEYS.store, inSave: shared._spoilsInSave })) setMidScreenText(SD_SPOILS_TEXT.recovered); } catch (e) { console.warn('[sd] spoils', e?.message ?? e); }   // SD9e: the Brass Remnant's spoils, the same door
    shared.starfall?.recoverSpoils(who, shared._spoilsInSave);   // STAR7: a held star's spoils, the same door (scenes/starfall/starRewards.js)
    shared.ketch?.recoverSpoils(who, shared._spoilsInSave);   // AUDIT KETCH L2-2, L2-3: the Ketchmaster's hold's, and my shares still owed (scenes/ketch/ketchClient.js)
    shared._spoilsInSave = null;   // AUDIT RESCUE-SAVE A1: the boot's load alone - a load in the session is its own pack
  };

  const resendSpentWords = () => {
    const t = performance.now();
    if (t - shared._spentResendAt < SPOILS_SPENT_RESEND_MS) return;
    shared._spentResendAt = t;
    if (socialLink()?.status !== 'open') return;
    try { for (const pool of [spoilsPool, sdSpoilsPool, shared.ketch?.spoils]) pool?.resendSpent?.(); } catch (e) { console.warn('[spoils] owed words', e?.message ?? e); }   // AUDIT KETCH II L3-6: and the Ketchmaster's hold's (its owed word stood for ever)
  };

  /** SET7: THE SIGIL BROKER (scenes/sigilBrokerPool.js) - BROKER-CAGE: caged at the faithful's circle from the omen to
   *  midnight, and free once every one of them fell (scenes/riteHost.js isCleared), online alone as the gate is: her
   *  body, her cage, her post, her box and her name, and the press that opens her window (ui/brokerDoor.js). The stock is
   *  the UTC day's of the shared clock (systems/sigil/sigilBroker.js), minted once a day and read by the window; the sale is
   *  the law's, made on the pack - the unlocked stones out, a fresh mint of the piece in, the offer marked - behind the
   *  pack's own carry gate (itemTransfer.js planTake), and it clinks as every concluded deal does (nativeTrade.js). */
  const _brokerNow = () => Date.now() + shared._sharedOffsetMs;

  let _brokerStock = null;
  const brokerStockNow = () => {
    const day = brokerDay(_brokerNow());
    if (_brokerStock?.day !== day) _brokerStock = { day, offers: brokerStock(day) };
    return _brokerStock.offers;
  };
  const brokerBuy = (offer) => {
    if (!shared.sigilBroker?.stands() || _mode() !== 'exterior') return { ok: false, reason: 'gone' };   // a window left open as midnight took her sells nothing, nor one on her cage - nor one carried off the street (AUDIT SET W2)
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
  const insigniaIo = () => { const st = appStorage(); const ses = storedSession(st); return ses ? { fetch: (u, i) => globalThis.fetch(u, i), base: serviceBase(st), secret: ses.secret, account: ses.id ?? null } : null; };   // AUDIT FB1024: and the account an owed sale is settled under

  const insigniaAdopt = (w) => { if (w && typeof w === 'object') shared._insignia = { ...shared._insignia, loaded: true, held: Array.isArray(w.insignia) ? w.insignia : shared._insignia.held, title: w.title ?? null, aura: w.aura ?? null }; };
  async function insigniaLoad() {
    const io = insigniaIo();
    if (!io) { shared._insignia = { ...shared._insignia, loaded: true, held: [], title: null, aura: null }; return; }
    try { const r = await shared.brokerOwed.settled(() => readAccount(io)); if (r.ok) insigniaAdopt(r.data?.wardrobe); } catch { /* the rows say they cannot tell */ }   // BROKER-RID: what is owed settled first
  }
  /** The rows the window draws: each offer, its word, whether the account owns and wears it. */
  const insigniaRows = () => INSIGNIA.filter((o) => !o.currency).map((o) => ({   // BUNNYFALL: Nyx's titles are hers (scenes/cromwarkHost.js), never the Broker's
    ...o, name: o.kind === 'title' ? TITLE_TEXT[o.key] ?? o.key : AURA_TEXT[o.key] ?? o.key,
    owned: shared._insignia.held.includes(o.id), worn: o.kind === 'title' ? shared._insignia.title === o.key : shared._insignia.aura === o.key,
  }));
  /** My own badge, at once, off the service's answer to a wear - before the next mint says it: the session's own door
   *  (the title my own lines wear, the aura it holds for me) and the stored session's (the fire at my feet - ownAura),
   *  through their own readers, never a word the vocabulary does not hold. */
  const insigniaSelf = (answer, secret) => {
    shared.online?.adoptIdentity?.({ title: shared._insignia.title, glyphs: shared.online.glyphs, level: shared.online.lv, aura: shared._insignia.aura });
    adoptSessionIdentity(appStorage(), { glyphs: answer?.glyphs, glyphsOff: answer?.glyphsOff, aura: shared._insignia.aura, secret });   // GLYPH-WEAR: less the ones taken off
  };
  async function insigniaBuy(offer) {
    if (shared._insignia.busy) return { ok: false, text: 'The Broker is busy.' };   // WB13b
    const io = insigniaIo();
    const why = insigniaRefusal(offer, { held: shared._insignia.held, stones: stoneCount(spendableStonesIn(playerEntity.items ?? [])), online: !!io && !!shared.online });
    if (why === 'owned') return { ok: false, text: 'Your account already owns that.' };
    if (why === 'offline') return { ok: false, text: 'Sign in and go online to buy insignia.' };
    if (why === 'stones') return { ok: false, text: `You need ${stonesText(offer.price)}.` };
    if (why) return { ok: false, text: 'The Broker will not sell that.' };
    shared._insignia.busy = true;
    try {
      playerEntity.items = playerEntity.items || [];
      // AUDIT WB9 (insignia F1, F2): the pack's price held FIRST and given back unless the service holds the sale (a lost
      // answer asked after - AUDIT FB1024: by its request id), and a held sale saved at once - PROF-SAVE's door
      // (systems/sigil/sigilBroker.js insigniaSale, through brokerOwedDoor)
      const r = await shared.brokerOwed.insignia(offer, (id, rid) => buyInsignia(io, id, rid));
      if (!r.ok) return { ok: false, text: r.error === 'stones' ? `You need ${stonesText(offer.price)}.` : r.error === 'unheard' ? brokerOwedText() : r.error === 'short' ? accountRefusalText('short') : accountRefusalText(r.error) };
      insigniaAdopt(r.data);
      audio.playOneShot(SOUND.GoldPieces, 1);
      surfacePlayer();
      const name = insigniaRows().find((x) => x.id === offer.id)?.name ?? offer.key;
      return { ok: true, text: `Bought: ${name}, for ${stonesText(offer.price)}.` };   // WB13b: BROKER_SOLD's own - the button turns to Wear
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
      items: () => spendableStonesIn(playerEntity.items ?? []), locked: () => stoneCount(lockedStonesIn(playerEntity.items ?? [])),   // SS1: a locked stack counts whole
      bought: () => brokerBought(brokerDay(_brokerNow())), buy: brokerBuy,
      wearer: playerEntity, nameOf: (item) => itemLongName(item),
      insignia: insigniaRows, insigniaLoad, buyInsignia: insigniaBuy, wearInsignia: insigniaWear, insigniaBusy: () => shared._insignia.busy,   // WB9g
      panoply: shared._accountEg ? panoplyDeps : null,   // EG-E1: THE BATTLEMAGE'S PANOPLY, once a week (online)
    });
    if (win) townTalk.showOverlay(win);
  };
  // EG-E1 (Elite-Gates.md section 19, THE SINK): THE BATTLEMAGE'S PANOPLY AT THE BROKER - one piece of the buyer's choosing,
  // once an account an arena week, for EG_SINK_EMBERS embers out of the insignia's purse (server-account/src/egEconomy.js
  // egSink): the pack's embers held first and given back on a refusal, a lost answer asked after through the week's sale
  // (`/v1/eg/keys`' `sink`), the piece minted by its id (systems/aetheric.js panoplyPieceById) - never `stonesPaid`, never
  // the day's stock (systems/sigil/sigilBroker.js panoplySale).
  let _panoplySink = null;
  const panoplyDeps = {
    rows: () => panoplyRows(_panoplySink),
    load: async () => { try { const a = await shared.brokerOwed.settled(shared._accountEg.keys); if (a?.ok) _panoplySink = a.data?.sink ?? null; } catch { /* the window says what it held */ } },   // BROKER-RID: what is owed settled first
    busy: () => shared._insignia.busy,
    buy: async (id) => {
      if (shared._insignia.busy) return { ok: false, text: 'The Broker is busy.' };
      shared._insignia.busy = true;
      try {
        playerEntity.items = playerEntity.items || [];
        const r = await shared.brokerOwed.panoply(id, (p, rid) => shared._accountEg.sink(p, rid));   // BROKER-RID (AUDIT FB1024): the press by its request id (systems/sigil/sigilBroker.js panoplySale)
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
