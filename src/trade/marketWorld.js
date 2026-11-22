// Markets, professions, and notice boards: the account service books for professions, the market,
// writs, the firmament, card stakes, and season boards, plus the Notice Board windows. It also
// holds the carry hands, crafted pieces in the save, and the profession marks on the compass.
import {
  accountCards, accountFirmament, accountGambit, accountIliac, accountMarket, accountProf, accountRefusalText,
  accountWrits,
} from '../net/accountClient.js';
import { addGold, deductGold, payUndoable, totalGoldAmount } from '../justice/court.js';
import { addItem } from '../items/inventory.js';
import { APOTHECARY_STOCK, professionName, stockOf, WEAVERS_STOCK } from '../net/professionLaw.js';
import { appStorage } from '../platform/appStorage.js';
import {
  asMinted, BENCH_KEPT_TEXT, COOK_KEPT_TEXT, CRAFT_KEPT_TEXT, craftedText, isCraftedFurniture, JEWEL_KEPT_TEXT,
  LOOM_KEPT_TEXT, MASON_KEPT_TEXT, mintPiece, mintPieces, pieceOfRecipe,
} from '../professions/smithItems.js';
import {
  heldOf as bagHeldOf, roomFor as bagRoomFor, bagTakesOf, giveCarried, mintCarried, takeCarried,
} from '../professions/materialsBag.js';
import { BANK_REGION_COUNT, createBankAccounts, goldRegion } from './banking.js';
import { boardFocus, courtWritFilled } from '../guilds/bunnyServices.js';
import { boardTithePct } from '../net/townSeatLaw.js';
import { brewedText, brewItems } from '../professions/alchemyItems.js';
import { characterIdOf } from '../characters/characterId.js';
import { closeNoticeDoor, createNoticeOverlay } from '../ui/noticeDoor.js';
import { coastalAt } from '../net/fortLaw.js';
import { commissionFilledBy } from '../net/writLaw.js';
import { createCardStakes } from '../net/cardStakes.js';
import { createFirmamentBook, setFirmamentBook } from '../net/firmament/firmamentBook.js';
import { createGambitClaims } from '../net/gambit/gambitClaims.js';
import { createIliacClaims } from '../net/iliacClaims.js';
import { createMarketBook } from '../net/marketBook.js';
import { createProfBook } from '../net/profBook.js';
import { createWritBook } from '../net/writBook.js';
import { dayTurnMs } from '../net/dayTurn.js';
import { hallOfRecordsWindow } from '../ui/hallOfRecords.js';
import { hallPosterName, isChapterWrit } from '../net/npcChapterLaw.js';
import { isLocked } from '../items/itemLock.js';
import { itemLongName } from '../items/itemInfo.js';
import { itemPicture, materialPicture } from '../ui/menuPicture.js';
import { LETTERS_SIGNED_OUT_TEXT } from '../ui/socialPanel.js';
import { listPickerArtLoaded, ListPickerWindow } from '../ui/listPicker.js';
import { materialCountLabel, materialLabel, withdrawIntoPack } from '../professions/profItems.js';
import { mintMarksRid } from '../net/marksBook.js';
import { nodeCompassPoints } from '../ui/nodeMarks.js';
import { NOTE_LETTER_LOST, planNoteAnswer } from '../net/noticeBook.js';
import { noteFirstUse } from '../ui/tutorials.js';
import { plaqueActionSelection } from '../items/quickLoot.js';
import { playerEntity } from '../characters/playerEntity.js';
import { projectToScreen } from '../player/tapRay.js';
import { realmGoldAct } from '../saves/realmSaves.js';
import { REGION_NAMES } from '../formats/mapsFile.js';
import { renownAnswer } from '../net/renownTracker.js';
import { sdNoticeCard } from '../worldEvents/sdOmen.js';
import { seasonCounted, seasonFoeGuest, seasonGuest, seasonKept } from '../ui/gambitTableWords.js';
import { seatAtMapId } from '../guilds/townSeats.js';
import { setFirmamentTree } from '../characters/firmamentLive.js';
import { TERRAIN_SIZE } from '../world/terrainSampler.js';
import { trackerMarks } from '../professions/huntHost.js';
import { tradeRefusal } from './tradePack.js';
import { unequipItem } from '../characters/equip.js';
import { unseenText } from '../net/boardLaw.js';
import { WEAR_WHOLE, wearCondition, wearOf } from '../net/marketLaw.js';
import { worldPlaqueOn } from '../ui/worldPlaque.js';

/** @param {any} shared */
export function createMarketWorld(shared) {
  const {
    _questRegionIndex, boardSplitOf, hallDoor, locationIndex, maps, marksBook, noticeBook, params, playerTravelPixel,
    realmSession, royalEnter, seatArmsOf, seatBook, seatHere, siegeEnter, townSeats, workbenchHere,
  } = shared;
  const carryOpts = (key) => ({ slowRot: key === 'food:meat' && profBook?.track('hunting')?.specs?.[100] === 'butcher', noRot: profBook?.track('cooking')?.specs?.[100] === 'provisioner' });
  const carryHands = {
    held: (key) => bagHeldOf(playerEntity, key, { counter: false }), heldAll: (key) => bagHeldOf(playerEntity, key),
    room: (key) => bagRoomFor(playerEntity, key),
    mint: (key, n) => { const got = mintCarried(playerEntity, key, n, carryOpts(key)); if (got.bag + got.pack > 0) shared.saveSoon.changed(); if (got.bag > 0) noteFirstUse('materials'); return got; },
    take: (key, n, stamp = null, order = null, counter = false) => {
      const t = takeCarried(playerEntity, key, n, stamp, order, { counter });
      if (t.taken > 0) shared.saveSoon.changed();
      return { taken: t.taken, back: () => { t.back(); shared.saveSoon.changed(); } };
    },
    give: (key, n) => { const got = giveCarried(playerEntity, key, n, carryOpts(key)); if (got.bag + got.pack + got.over > 0) shared.saveSoon.changed(); return got; },
    stamped: (id) => Object.hasOwn(bagTakesOf(playerEntity), id),
    unstamp: (id) => { if (playerEntity.bagTakes && Object.hasOwn(playerEntity.bagTakes, id)) { delete playerEntity.bagTakes[id]; shared.saveSoon.changed(); } },
    stamps: () => Object.entries(bagTakesOf(playerEntity)).map(([id, t]) => ({ id, ...t })),
    flush: async () => {
      try { const r = await shared.onlineCheckpointLanded(); return r === true || r?.ok === true; } catch { return false; }
    },
  };
  const profBook = params.has('online')
    ? createProfBook({ door: accountProf({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }), storage: appStorage(),
      character: () => characterIdOf(playerEntity), now: () => Date.now() + shared._sharedOffsetMs, carry: carryHands, turnMs: dayTurnMs() })
    : null;
  const firmBook = params.has('online')
    ? createFirmamentBook({ door: accountFirmament({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }), storage: appStorage(),
      character: () => characterIdOf(playerEntity),
      realm: realmSession ? { act: (o) => realmGoldAct({ ...o, session: realmSession, checkpoint: () => shared.onlineCheckpoint() }) } : null,
      wallet: () => {
        playerEntity.bankAccounts ??= createBankAccounts(BANK_REGION_COUNT);
        const region = _questRegionIndex() ?? 0;
        const bank = playerEntity.bankAccounts[goldRegion(playerEntity.bankAccounts, region)] ?? null;
        return { gold: () => totalGoldAmount(playerEntity) + Math.max(0, bank?.accountGold ?? 0), pay: (n) => payUndoable(playerEntity, n, bank), credit: (n) => addGold(playerEntity, n), region: () => region };
      } })
    : null;
  setFirmamentBook(firmBook);
  firmBook?.onChange((st) => setFirmamentTree(st.tree));
  const realmWallet = realmSession ? (region) => {
    playerEntity.bankAccounts ??= createBankAccounts(BANK_REGION_COUNT);
    const account = playerEntity.bankAccounts[goldRegion(playerEntity.bankAccounts, region)] ?? null;
    return {
      gold: () => totalGoldAmount(playerEntity) + Math.max(0, account?.accountGold ?? 0),
      pay: (n) => payUndoable(playerEntity, n, account),
      credit: (n) => addGold(playerEntity, n),
      bank: (n) => { if (account) account.accountGold = (Number.isFinite(account.accountGold) ? account.accountGold : 0) + n; else addGold(playerEntity, n); },
    };
  } : null;
  const marketBook = params.has('online')
    ? createMarketBook({ door: accountMarket({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }), storage: appStorage(),
      character: () => characterIdOf(playerEntity), now: () => Date.now() + shared._sharedOffsetMs, marks: marksBook,
      stores: { apply: (st) => profBook?.applyStore(st) },
      holds: (pv) => !!writBook?.holdsPiece(pv),
      realm: realmSession ? { act: (o) => realmGoldAct({ ...o, session: realmSession, checkpoint: () => shared.onlineCheckpoint() }), abandon: (why) => realmSession.abandon(why) } : null, goods: realmSession ? { receive: (rec, why) => shared.marketGoods.receive(rec, why) } : null,
      wallet: realmWallet })
    : null;
  // The stake book needs a store with JSON get and set; a bare Storage throws on every write.
  const cardStakes = params.has('online') && realmSession
    ? createCardStakes({ door: accountCards({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }), storage: { get: (k) => shared._spoilsStore.get(k), set: (k, v) => shared._spoilsStore.set(k, v) },
      realm: { act: (o) => realmGoldAct({ ...o, session: realmSession, checkpoint: () => shared.onlineCheckpoint() }) }, wallet: realmWallet,
      character: () => characterIdOf(playerEntity), region: () => _questRegionIndex(), now: () => Date.now() + shared._sharedOffsetMs })
    : null;
  const iliacDoor = accountIliac({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() });
  const iliacClaims = params.has('online')
    ? createIliacClaims({ claim: (r) => iliacDoor.claim(r), store: { get: (k) => shared._spoilsStore.get(k), set: (k, v) => shared._spoilsStore.set(k, v) }, me: () => iliacDoor.me(),
      nowS: () => (shared._sharedClockHeard ? Math.floor((Date.now() + shared._sharedOffsetMs) / 1000) : null), nowMs: () => Date.now() + shared._sharedOffsetMs,
      onCounted: (a) => shared.townTalk?.say?.(a.rated ? `Iliac Hand: the game is on the season's board. Your rating is ${a.rating} (${a.delta >= 0 ? '+' : ''}${a.delta}).` : 'Iliac Hand: this game is not ranked. You have played that opponent enough times today.'),
      onGuest: () => shared.townTalk?.say?.('Iliac Hand: register your account to keep your ranked games on the board.') })
    : null;
  const gambitDoor = accountGambit({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() });
  const gambitClaims = params.has('online')
    ? createGambitClaims({ claim: (r) => gambitDoor.claim(r), store: { get: (k) => shared._spoilsStore.get(k), set: (k, v) => shared._spoilsStore.set(k, v) }, me: () => gambitDoor.me(),
      nowMs: () => Date.now() + shared._sharedOffsetMs, nowS: () => (shared._sharedClockHeard ? Math.floor((Date.now() + shared._sharedOffsetMs) / 1000) : null),
      onCounted: (a) => shared.townTalk?.say?.(a.rated ? seasonCounted(a.rating, a.delta) : seasonKept(a.cap)),
      onGuest: () => shared.townTalk?.say?.(seasonGuest()), onFoeGuest: () => shared.townTalk?.say?.(seasonFoeGuest()) })
    : null;
  const writBook = params.has('online')
    ? createWritBook({ door: accountWrits({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }), storage: appStorage(),
      character: () => characterIdOf(playerEntity), now: () => Date.now() + shared._sharedOffsetMs, marks: marksBook,
      stores: { apply: (st) => profBook?.applyStore(st) },
      market: marketBook, realm: marketBook?.realm ?? null,
      holds: (pv) => !!marketBook?.holdsPiece(pv) })
    : null;
  if (writBook && profBook) {
    const supplyFromStores = writBook.supply;
    writBook.supply = async (req) => {
      const { material = null, ...ask } = req ?? {};
      if (typeof material === 'string') {
        const ready = await profBook.ensureInStores([{ key: material, n: Number(ask.units) || 0 }]);
        if (!ready.ok) return { ok: false, error: ready.error ?? 'materials-short' };
      }
      return supplyFromStores(ask);
    };
  }

  const craftStation = (profession) => (profession === 'carpentry'
    ? { here: () => workbenchHere(), a: 'a workbench', who: 'furnisher', noun: 'workbench', kept: BENCH_KEPT_TEXT, xp: professionName('carpentry') }
    : profession === 'outfitting'
      ? { here: () => shared.modes?.loomHere?.() ?? null, a: 'a loom', who: 'tailor', noun: 'loom', kept: LOOM_KEPT_TEXT, xp: 'Outfitting' }
      : profession === 'masonry'
        ? { here: () => shared.modes?.masonHere?.() ?? null, a: 'a mason\'s bench', who: 'mason', noun: 'mason\'s bench', kept: MASON_KEPT_TEXT, xp: professionName('masonry') }
        : profession === 'cooking'
          ? { here: () => shared.cookFireHere(), a: 'a fire', who: 'cook', noun: 'fire', kept: COOK_KEPT_TEXT, xp: professionName('cooking') }
          : profession === 'jewelcrafting'
            ? { here: () => shared.modes?.jewellerHere?.() ?? null, a: 'a jeweller\'s bench', who: 'jeweller', noun: 'jeweller\'s bench', kept: JEWEL_KEPT_TEXT, xp: professionName('jewelcrafting') }
            : { here: () => shared.modes?.forgeHere?.() ?? null, a: 'an anvil', who: 'smith', noun: 'anvil', kept: CRAFT_KEPT_TEXT, xp: 'Smithing' });
  const toldBalance = (balance) => { if (Number.isSafeInteger(balance)) { marksBook?.set(balance); marketBook?.told(balance); } };

  const profMint = (key, n) => {
    if (profBook?.carrying?.()) {
      // Units with no room go into the pack over its weight; the service counts them as carried.
      const got = carryHands.give(key, n);
      const put = got.bag + got.pack;
      if (put) shared.townTalk.say(`${put} ${materialCountLabel(key, put)} taken from the Stores into your ${got.bag && got.pack ? 'bag and pack' : got.pack ? 'pack' : 'bag'}.`);
      if (got.over) shared.townTalk.say(`${got.over} more into your pack, past what you can carry.`);
      return;
    }
    const got = withdrawIntoPack(playerEntity, key, n, undefined, carryOpts(key));
    if (got) { shared.townTalk.say(`${got} ${materialCountLabel(key, got)} taken from the Stores into your pack.`); shared.saveSoon.changed(); }
  };
  const profMintCraft = (data, kept = null) => {
    if (kept?.fee > 0) { deductGold(playerEntity, Math.min(kept.fee, totalGoldAmount(playerEntity))); shared.saveSoon.changed(); }
    if (typeof data?.potion === 'string') {
      const potions = brewItems(data);
      for (const it of potions) addItem((playerEntity.items ??= []), it, 'back');
      if (potions.length) { shared.townTalk.say(`${brewedText(data)}.`); shared.saveSoon.changed(); }
      return;
    }
    const have = heldProvenances();
    const pieces = mintPieces(data).filter((it) => !it.provenance || !have.has(it.provenance));
    for (const it of pieces) {
      if (isCraftedFurniture(it)) (playerEntity.furnishings ??= []).push(it);
      else addItem((playerEntity.items ??= []), it, 'back');
    }
    if (pieces.length) { shared.townTalk.say(craftedText(pieces)); shared.saveSoon.changed(); }
  };
  const pieceLists = () => [playerEntity.items, playerEntity.furnishings, playerEntity.wagonItems, playerEntity.otherItems].filter(Array.isArray);
  const heldProvenances = () => new Set(pieceLists().flat().map((it) => it?.provenance).filter(Boolean));
  const marketMint = (piece) => {
    if (!piece?.provenance) return;
    if (heldProvenances().has(piece.provenance)) return;
    const it = mintPiece(piece, piece.provenance);
    if (!it) return;
    if (it.maxCondition > 0) it.currentCondition = wearCondition(it.maxCondition, piece.wear);
    const home = isCraftedFurniture(it);
    if (home) (playerEntity.furnishings ??= []).push(it); else addItem((playerEntity.items ??= []), it, 'back');
    shared.townTalk.say(`${itemLongName(it)} is ${home ? 'among your home\'s things' : 'in your pack'}.`);
    shared.saveSoon.changed();
  };

  const marketPieceName = (piece) => {
    if (!piece?.provenance) return 'a crafted piece';
    let n = shared._pieceNames.get(piece.provenance);
    if (!n) { const it = mintPiece(piece, piece.provenance); n = it ? itemLongName(it) : 'a crafted piece'; shared._pieceNames.set(piece.provenance, n); }
    return n;
  };

  const marketPiecePicture = (piece, wake) => {
    if (!piece?.provenance) return null;
    if (!shared._pieceItems.has(piece.provenance)) { let it = null; try { it = mintPiece(piece, piece.provenance); } catch { it = null; } shared._pieceItems.set(piece.provenance, it); }
    return itemPicture(shared._pieceItems.get(piece.provenance), { onReady: wake });
  };

  const marketPieces = () => [
    ...(playerEntity.items ?? []).filter((it) => it?.provenance && asMinted(it) && !tradeRefusal(it) && !isLocked(it) && !shared.pieceKept(it.provenance))
      .map((item) => ({ item, where: 'pack', name: itemLongName(item) })),
    ...(playerEntity.furnishings ?? []).filter((it) => it?.provenance && asMinted(it) && !shared.pieceKept(it.provenance)).map((item) => ({ item, where: 'home', name: itemLongName(item) })),
  ];
  const commissionPieces = (c) => {
    const named = Array.isArray(c.eligible) ? new Map(c.eligible.map((e, i) => [e.provenance, i])) : null;
    const answers = (it) => (!named || named.has(it.provenance))
      && commissionFilledBy(c, { recipe: pieceOfRecipe(it, c.recipe) ? c.recipe : null, quality: it.quality ?? null }) && wearOf(it) === WEAR_WHOLE;
    const out = marketPieces()
      .filter((p) => answers(p.item))
      .sort((a, b) => (named ? named.get(a.item.provenance) - named.get(b.item.provenance) : (a.item.quality ?? 0) - (b.item.quality ?? 0)))
      .map((p) => ({ ...p, quality: p.item.quality ?? null, take: () => marketTake(p.item, p.where), putBack: marketPutBack }));
    return Object.assign(out, { blocked: (playerEntity.items ?? []).filter((it) => it?.provenance && answers(it) && (tradeRefusal(it) || isLocked(it))).length });
  };
  const marketTake = (item, where) => {
    const list = where === 'home' ? playerEntity.furnishings : playerEntity.items;
    const i = (list ?? []).indexOf(item);
    if (i < 0 || (where === 'pack' && (tradeRefusal(item) || isLocked(item)))) return false;
    list.splice(i, 1);
    shared.saveSoon.changed();
    return true;
  };
  // The take can come from a save that was never written, so the piece may still be in the save.
  const marketDrop = (item) => {
    if (!item?.provenance) return;
    for (const list of pieceLists()) {
      const i = list.findIndex((it) => it?.provenance === item.provenance);
      if (i < 0) continue;
      if (list === playerEntity.items) unequipItem(playerEntity, list[i]);
      list.splice(i, 1);
      shared.saveSoon.changed();
    }
  };
  const marketPutBack = (item, where) => {
    if (!item?.provenance) return;
    if (heldProvenances().has(item.provenance)) return;
    if (where === 'home') (playerEntity.furnishings ??= []).push(item); else addItem((playerEntity.items ??= []), item, 'back');
    shared.saveSoon.changed();
  };

  const noticeTownOf = (px, py, bountyLine = false) => {
    const loc = locationIndex.get(`${px},${py}`);
    const mapId = loc?.mapTableData?.mapId;
    if (!Number.isFinite(mapId)) return null;
    return { mapId: mapId >>> 0, px, py, name: String(loc.name ?? ''), bountyLine: !!bountyLine };
  };

  let _profPicker = null;
  const profChoose = (rows, pick) => {
    if (!listPickerArtLoaded() || (_profPicker && shared.gamePaused())) return false;
    const close = () => { if (_profPicker) { shared.modes?.closeWindow?.(_profPicker); _profPicker = null; } };
    const win = new ListPickerWindow({ backdrop: 'none', items: rows, onPick: (i) => { close(); pick(i); }, onCancel: close });
    if (!shared.modes?.mountWindow?.(win)) return false;
    _profPicker = win;
    return true;
  };
  const profHoverOver = (ray) => shared.gatherHost?.hoverHit?.(ray) ?? ray;
  const profClickPress = () => {
    const lit = plaqueActionSelection();
    return !worldPlaqueOn() ? (shared.gatherHost?.press() ?? false) : typeof lit?.key === 'string' && lit.key.startsWith('prof:') && lit.id != null && (shared.gatherHost?.press({ click: true }) ?? false);
  };

  const _lodesSensed = [];

  const nodeMarksAt = (feet) => {
    if (!shared.gatherHost || profBook?.state.open !== true || !feet) return null;
    const m = shared._mode();
    return m === 'exterior' || m === 'dungeon' ? shared.gatherHost.marks(feet) : null;
  };
  const trackerAnimals = () => {
    if (!shared.gatherHost || profBook?.state.open !== true || profBook.track('hunting').specs?.[50] !== 'tracker' || shared._mode() !== 'exterior') return null;
    return trackerMarks(shared.exteriorFoes.foes, shared.enchantFeet());
  };
  const _lodeMarks = [], _lodesUp = [], _lodeTr = [0, 0, 0], _lodePool = [];
  const motherlodeMarks = () => {
    _lodeMarks.length = 0;
    if (!shared.motherlodeBook || profBook?.state.open !== true || shared._mode() !== 'exterior') return _lodeMarks;
    for (const l of shared.motherlodeBook.markedAll(_lodesUp)) {
      const tr = shared.state.pixelTranslation(l.x, l.y, _lodeTr), m = _lodePool[_lodeMarks.length] ??= { profession: 'motherlode', at: [0, 0, 0], d: 0, reach: 1 };
      m.at[0] = tr[0] + TERRAIN_SIZE / 2; m.at[1] = tr[1]; m.at[2] = tr[2] + TERRAIN_SIZE / 2; _lodeMarks.push(m);
    }
    return _lodeMarks;
  };
  const professionMarks = (feet = shared.enchantFeet()) => {
    const near = nodeMarksAt(feet), far = motherlodeMarks();
    return nodeCompassPoints(far.length ? [...far, ...(near ?? [])] : near, trackerAnimals());
  };

  const openNoticeBoard = (town, rumour, opts = null) => {
    if (!noticeBook || !town) return false;
    if (noticeBook.open !== true) { noticeBook.read(town.mapId); return false; }
    const region = (() => { try { return maps.getRegionIndexAt(town.px, town.py); } catch { return null; } })();
    const seatAt = seatHere(town.mapId);
    const work = profBook?.state.open === true && Number.isInteger(region) ? {
      book: profBook, region, regionName: REGION_NAMES[region] ?? 'the region', countName: materialCountLabel,
      climate: (() => { try { return maps.getClimateIndex(town.px, town.py); } catch { return null; } })(),
      onTaken: (r) => profWritTaken(r),
      crafts: shared.craftWrits,
      sayLate: (text) => shared.chatNotice(text),
      setFocus: hallDoor && realmSession ? (faction, focus) => hallDoor.focus(realmSession.id, faction, region, focus) : null,
      back: hallDoor && realmSession ? (faction, side) => hallDoor.back(realmSession.id, faction, region, side) : null,
      patron: hallDoor && realmSession ? (faction, marks) => hallDoor.patron(realmSession.id, faction, region, marks, mintMarksRid()) : null,
      ...(writBook && marksBook?.state?.open !== false ? {
        writs: writBook, regionNameOf: (r) => REGION_NAMES[r] ?? 'another region', pieces: commissionPieces,
        settle: () => writBook.settle(marketPutBack, marketDrop),
        onList: (d) => { if (Number.isSafeInteger(d?.balance)) { marksBook?.set(d.balance); marketBook?.told(d.balance); } },
        forgetMarket: () => marketBook?.forget(),
      } : {}),
    } : null;
    const focus = boardFocus(shared.hallsHere(), opts);
    if (focus.moved.length) rumour = [...focus.moved, ...(rumour ?? [])];
    const market = focus.market && marketBook && profBook && profBook.state.open !== false && marksBook?.state?.open !== false && Number.isInteger(region) ? {
      book: marketBook, stores: () => profBook.state.stores, region, regionName: REGION_NAMES[region] ?? 'the region',
      regionNameOf: (r) => REGION_NAMES[r] ?? 'another region', hubs: shared.marketHubs, name: (k) => materialLabel(k), countName: materialCountLabel,
      picture: (k, wake) => materialPicture(k, { onReady: wake }), itemPicture: (it, wake, box) => itemPicture(it, { onReady: wake, box }), piecePicture: marketPiecePicture,
      board: [town.px, town.py],
      tithe: () => (seatBook?.open === true ? boardTithePct(seatBook.data?.seats ?? [], region, [town.px, town.py]) : null),
      pieces: marketPieces, take: marketTake, putBack: marketPutBack, mint: marketMint, pieceName: marketPieceName, drop: marketDrop, goods: () => shared.marketGoods.goods(), good: (it) => shared.marketGoods.good(it), goodName: (rec) => shared.marketGoods.goodName(rec),
      carried: () => new Map([...profBook.state.carried.keys()].map((k) => [k, profBook.carriedUsable(k)])),
      putIn: (key, n) => profBook.ensureInStores([{ key, n }]),
      weavers: WEAVERS_STOCK,
      apothecaries: APOTHECARY_STOCK,
      stock: async (key, n) => {
        const r = await profBook.stock(key, n);
        toldBalance(r?.data?.balance);
        return r?.ok ? { ok: true, text: `Bought ${r.data.qty} ${materialCountLabel(key, r.data.qty)} at the ${stockOf(key)?.counter === 'apothecaries' ? 'Apothecaries\'' : 'Weavers\''} counter for ${r.data.marks} Imperial Argents.` } : { ok: false, text: accountRefusalText(r?.error) };
      },
    } : null;
    return showNoticeWindow({
      ...(opts?.tab ? { tab: opts.tab } : {}), ...(opts?.sift ? { sift: opts.sift } : {}), craftKinds: focus.crafts,
      town: { name: town.name, mapId: town.mapId }, rumour: rumour ?? [], bountyLine: !!town.bountyLine,
      gate: () => noticeGateCard(), sd: () => noticeSdCard(), answer: (note) => answerNote(note), work, market,
      vendors: market ? shared.vendorBoardHost(region) : null,
      guilds: true,
      seatBattle: (st, f) => siegeEnter(st, f), seatRoyal: (st, r, w) => royalEnter(st, r, w), seatRecords: (st) => openRecordsFromBoard(st), seat: seatAt ? { seat: seatAt, book: seatBook, nameOf: (k) => seatAtMapId(townSeats, k)?.name ?? null, port: coastalAt(town.px, town.py, shared.seaPixel, shared.csaIsPortTown(town.px, town.py)), countName: materialCountLabel } : null,
    });
  };
  const openRecordsFromBoard = async (st) => {
    const board = shared.townTalk.overlay;
    const w = st && seatBook ? await hallOfRecordsRead(st) : null;
    // The board can close during the read; show the book only over the board that asked.
    if (shared.townTalk.overlay !== board) { try { w?.dispose?.(); } catch {} return false; }
    if (!w) return false;
    shared.townTalk.showOverlay(w);
    return true;
  };
  const hallOfRecordsRead = async (seat) => {
    const [r, ch] = await Promise.all([
      seatBook.records(seat.key),
      hallDoor && shared.rollTracker?.held ? hallDoor.history(seat.region).catch(() => null) : null,
    ]);
    return r?.data ? hallOfRecordsWindow(seat, r.data.rows, r.data.zero, seatArmsOf, ch?.ok ? ch.data : null) : null;
  };
  const showNoticeWindow = (deps) => {
    const ov = createNoticeOverlay({
      book: noticeBook, character: () => characterIdOf(playerEntity),
      nowS: () => Math.floor((Date.now() + shared._sharedOffsetMs) / 1000),
      ...deps,
    });
    if (!ov) return false;
    shared.townTalk.showOverlay(ov);
    return true;
  };

  const openGuildBoard = (name) => (noticeBook ? showNoticeWindow({ town: { name: name || 'the guild', mapId: 0 }, guildOnly: { name: name || 'the guild' } }) : false);
  const profWritTaken = (r) => {
    const d = r?.data ?? {};
    if (r?.ok && !d.repeat && !isChapterWrit(d.writ?.kind)) courtWritFilled(playerEntity);
    if (Number.isSafeInteger(d.balance)) marksBook?.set(d.balance);
    if (d.renown) {
      const a = renownAnswer({ ...d.renown, order: d.order ?? null }, d.renown.credited ?? 0, shared.renownSaid);
      if (a.xp !== null) shared.renownXpAdopt(a.xp);
      if (a.level !== null) shared.renownAdopt(a.level);
      if (a.order) shared.online?.sendRenownOrder?.(a.order, a.level);
      if (a.announce !== null) shared.renownRose(a.announce);
    }
    const prof = professionName(d.track?.profession) || 'profession';
    if (isChapterWrit(d.writ?.kind)) shared.rollTracker?.refresh();
    const hall = isChapterWrit(d.writ?.kind) && !d.repeat && shared.rollTracker?.held ? hallPosterName(d.writ.faction) : null;
    const merit = hall && Number(d.merit) > 0 ? `, ${Number(d.merit).toLocaleString('en-US')} Merit to its chapter here` : '';
    return `Writ filled: ${Number(d.pay ?? 0).toLocaleString('en-US')} Imperial Argents struck to your account, ${Number(d.renown?.credited ?? 0).toLocaleString('en-US')} Renown and ${Number(d.pay ?? 0) * 2} ${prof} XP.${hall ? ` The ${hall} will remember it${merit}.` : ''}`;
  };
  const noticeSdCard = () => sdNoticeCard(shared.sdHost?.mapMark() ?? null, shared.sdHost?.hollow()?.site?.cityName ?? '');
  const noticeGateCard = () => {
    const mark = shared.gateOmen?.mapMark?.();
    const near = shared.gateOmen?.current?.()?.site?.near;
    if (!mark || !near) return null;
    const state = String(mark.label ?? '').replace(/^Dagon's Breach(?: - )?/, '');
    return { subject: 'Dagon\'s Breach', body: state ? `Near ${near}. ${state.charAt(0).toUpperCase()}${state.slice(1)}.` : `Near ${near}.` };
  };
  const answerNote = (note) => {
    const peer = note?.button === 'duel' ? [...(shared.online?.peers?.values?.() ?? [])].find((q) => (typeof note.by === 'string' && note.by ? q?.sub === note.by : q?.name === note.from)) : null;
    const plan = planNoteAnswer(note, {
      duelHere: !!peer && shared.duelCan() == null && shared.duelNear(peer.id),
      mail: shared.mail?.state ?? null, letters: !!shared.socialPanel, signedOutText: LETTERS_SIGNED_OUT_TEXT,
    });
    if (plan.kind === 'duel') { closeNoticeDoor(); shared.duelChallenge(peer.id); return { ok: true }; }
    if (plan.kind === 'letter') { shared._letterPending = { draft: plan.draft, at: performance.now(), lost: NOTE_LETTER_LOST }; closeNoticeDoor(); return { ok: true }; }
    return { ok: false, text: plan.text };
  };
  const noticeTownHere = () => {
    const at = playerTravelPixel();
    const p = at ? shared.built.get(`${at.x},${at.y}`) : null;
    if (!p?.boards?.length || !p.location) return null;
    const bountyAt = boardSplitOf(p);
    return bountyAt.size < p.boards.length ? noticeTownOf(p.px, p.py, bountyAt.size > 0) : null;
  };
  const NOTICE_COUNT_RANGE_M = 40;
  const noticeCountPoints = ({ proj, view, w, h, eye, rect, blocked }) => {
    if (!noticeBook || noticeBook.open !== true || (shared.modes?.mode ?? 'exterior') !== 'exterior') return [];
    const out = [];
    for (const p of shared.built.values()) {
      if (!p.boards?.length || !p.location) continue;
      const bountyAt = boardSplitOf(p);
      if (bountyAt.size >= p.boards.length) continue;
      const town = noticeTownOf(p.px, p.py, bountyAt.size > 0);
      const n = town ? noticeBook.unseen(town.mapId) : 0;
      if (!n) continue;
      const t = shared.state.pixelTranslation(p.px, p.py);
      p.boards.forEach((b, i) => {
        if (bountyAt.has(i)) return;
        const top = [(b.box[0] + b.box[3]) / 2 + t[0], b.box[4] + t[1] + 0.25, (b.box[2] + b.box[5]) / 2 + t[2]];
        if (eye && Math.hypot(top[0] - eye[0], top[2] - eye[2]) > NOTICE_COUNT_RANGE_M) return;
        const s = projectToScreen(top, w, h, proj, view, rect);
        if (!s.front || s.x < -50 || s.x > w + 50 || s.y < -50 || s.y > h + 50) return;
        const id = `board:${town.mapId}:${i}`;
        if (blocked && blocked(top, id)) return;
        out.push({ id, kind: 'board', name: unseenText(n), x: s.x, y: s.y, scale: 1 });
      });
    }
    return out;
  };
  return {
    _lodesSensed, cardStakes, carryHands, craftStation, firmBook, gambitClaims, gambitDoor, hallOfRecordsRead,
    iliacClaims, iliacDoor, marketBook, marketDrop, marketMint, marketPutBack, nodeMarksAt, noticeCountPoints,
    noticeTownHere, noticeTownOf, openGuildBoard, openNoticeBoard, profBook, profChoose, profClickPress,
    profHoverOver, profMint, profMintCraft, professionMarks, realmWallet, showNoticeWindow, toldBalance, writBook,
  };
}
