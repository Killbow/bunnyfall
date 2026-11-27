// Shared room loot for the dungeon host: bases, claims, and room words (the rules are in roomLoot.js).
// The host passes its scope through `host`; settled names are read once, live ones as `host.<name>` at each use.
import { addGoldPieces, addItem, isGoldPieces, stacksWith } from './inventory.js';
import { asTheRoom } from '../platform/onlineLane.js';
import { withRollerLevel } from './lootLevelGate.js';
import { baseSignature, bonusSpent, carriedBase, claimOf, claimWord, composeRoomView, isPersonalLoot, isRoomBaseKind, isRoomWord, judgeRoomClaim, legacyCounts, legacyDelta, legacySig, markPersonal, mergeRoomWord, pieceCount, recentAnswers, roomEmptied, ROOM_ANSWERS_KEPT, ROOM_BASE_FIND, ROOM_BASE_LUCK, ROOM_BASE_MAX, ROOM_BASE_QUARTERS, ROOM_CLAIM_TIMEOUT_MS, ROOM_CLAIMS_MAX, ROOM_PUT_RESAY_MS, ROOM_TAKEN_TEXT, LOOT_SKEW_TEXT, ROOM_LAPSED_TEXT, roomBaseGender, roomBaseLevel, roomClaimId, roomClaimOrder, roomContainerName, roomRoller, roomState, roomTermsBeat, roomWord, sameRoomTerms, seededRolls, settleBonusSpent, validRoomWord } from './roomLoot.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { grantEliteLoot } from '../characters/eliteFoes.js';
import { isDeepPileKey } from '../systems/survival/restItems.js';
import { isEquipped, unequipItem } from '../characters/equip.js';
import { CLAIM_KEEP_MS, CLAIMS_KEPT_MAX } from './claimLedger.js';
import { LOOT_LIST_MAX, validLootList, LOOT_NEWER_TEXT } from './loot.js';
import { markRoomCarried } from './roomCarriedList.js';
import { SEARCH_COOLDOWN_MINUTES, SEARCH_LOOT_MAX } from './searchables.js';
import { SEARCH_FOREIGN_PER_OBJECT } from './searchRoom.js';
import { sharedClassicMinutes } from '../net/wire.js';
import { neverPeerHanded, peerHanded, notCarried } from '../net/peerWord.js';
import { playerEntity } from '../characters/playerEntity.js';
import { raiseEnemyDeath } from '../characters/corpseMarker.js';
import { rollCorpseKit } from './foeLootCap.js';
import { rollRoomBonus, spawnEnemyLoot, wildLootAfter } from '../combat/hostCombat.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { stampWonWeapons } from './lootRarity.js';
import { championTraitFor } from '../characters/champions.js';
import { wildPileMore } from '../world/wildZone.js';
import { seaPileMore } from '../systems/naval/sea/seaSpoils.js';

/** @param {any} host */
export function createRoomLoot(host) {
  const {
    _deepCleared, _deepFoeCleared, _sharedFoe, _wildDungeon, _wildRing, eliteLootOpts, fightN, foes, lootKeyOf,
    lootableBody, opts, respawnDue, rollPileItems, roomLootKey, searchHeard, searchables, settleLootFlat, dfLocation
  } = host;
  // The host waits for the room memory before it mints a pile; another client waits longer for the host's word.
  const ROOM_TERMS_WAIT_HOST_MS = 1500;
  const ROOM_TERMS_WAIT_PEER_MS = 6000;
  const _roomBase = new Map();
  const _roomState = new Map();
  const _roomBonus = new Map();
  const _roomComposed = new Map();
  const _roomUnbornAt = new Map();
  const _roomPending = new Map();
  const _roomNextGen = new Map();
  const staleMemory = new Map();
  const _roomSeen = new Map();
  const _roomMine = new Map();
  const _roomWon = new Set();
  const _roomSees = new Set();
  const _roomSearcher = new Map();
  const _roomLegacy = new Map();
  const _roomStale = new Set();
  const _roomSkew = new Set();
  const isCarried = (canon) => typeof canon === 'string' && canon.startsWith('srch:');
  const sameMint = (a, b) => sameRoomTerms(a, b) && (a?.h ?? null) === (b?.h ?? null);
  const wordIsMint = (w, terms) => sameRoomTerms(w, terms) && (terms.h === undefined || w.h === terms.h);
  const roomLootOn = () => host.onlineRoom();
  function roomCanonOfFoe(f) {
    if (!f || f._ownFrom != null || f.entity?.revenant || f.companion != null) return null;
    if (f._encId != null) return host._sharedById.get(f._encId) === f ? `enc:${f._encId}` : null;
    const i = foes.indexOf(f);
    if (i < 0 || i >= host._layoutFoes) return null;
    if (_deepFoeCleared.has(`${f.src?.blockIndex}:${f.src?.loadID}`)) return null;
    return `corpse:${i}`;
  }
  function roomBaseHolder(canon) {
    if (!isRoomBaseKind(canon)) return null;
    const [kind, iStr] = canon.split(':');
    const i = Number(iStr);
    if (kind === 'loot') { const p = host.lootPiles[i]; return p && Array.isArray(p.items) ? { kind, i, pile: p } : null; }
    if (kind === 'srch') { const sb = searchables[i]; return sb && Array.isArray(sb.items) ? { kind, i, search: sb } : null; }
    const f = kind === 'enc' ? host._sharedById.get(i) : foes[i];
    return f && f.entity && roomCanonOfFoe(f) === canon ? { kind, i, foe: f } : null;
  }
  const holderList = (h) => (h.pile ? h.pile.items : h.search ? h.search.items : h.foe.entity.items);
  const isRoomBaseContainer = (canon) => roomLootOn() && !!roomBaseHolder(canon);
  const roomBorn = (h) => !!h && (h.pile || h.search ? true : lootableBody(h.foe));
  function roomUnborn(key) {
    const canon = roomLootKey(key) ?? lootKeyOf(key);
    if (!canon || !isRoomBaseContainer(canon)) return false;
    // A container whose word this build cannot read is not unborn, so its press can say why it will not open.
    return !_roomState.has(canon) && !host._lootUnreadable.has(canon);
  }
  function lootBuiltOf(entity) {
    const list = Array.isArray(entity?.items) ? entity.items : null;
    return list ? { list, counts: new Map(list.map((it) => [it, it?.stackCount ?? 1])) } : null;
  }
  function lifeAddsOf(f) {
    const built = f._lootBuilt;
    if (!built || f.entity?.items !== built.list) return [];
    const out = [];
    for (const it of f.entity.items) {
      if (!it) continue;
      const was = built.counts.get(it);
      if (was === undefined) { out.push({ ...it }); continue; }
      const n = (it.stackCount ?? 1) - was;
      if (n > 0) out.push({ ...it, stackCount: n });
    }
    return peerHanded(out) ?? [];
  }
  function rollRoomBase(canon, terms) {
    if (isCarried(canon)) {
      const st = _roomState.get(canon);
      if (!st?.base || !sameMint(st.terms, terms)) return null;
      const was = _roomBase.get(canon);
      if (was?.carried === st.base) return was;
      const rec = { name: canon, terms: { ...st.terms }, items: st.base.items, full: st.base.full, rejects: [], lootCap: null, h: st.base.h, carried: st.base };
      _roomBase.set(canon, rec);
      return rec;
    }
    const name = roomContainerName(host._locationKey, canon, terms.g);
    const was = _roomBase.get(canon);
    if (was && was.name === name && sameRoomTerms(was.terms, terms)) return was;
    const h = roomBaseHolder(canon);
    if (!h) return null;
    const rolls = seededRolls(name);
    const gender = roomBaseGender(name);
    const rejects = [];
    let items = [], lootCap = null, champion = null;
    // Rolled as the room, with every mod at its default, so every client computes the same base.
    asTheRoom(() => withRollerLevel(terms.lv, () => {
      if (h.pile) items = roomPileBase(h, terms, rolls, gender);
      else ({ items, lootCap, champion } = roomBodyBase(h.foe, terms, rolls, gender, rejects));
    }));
    if (items.length > ROOM_BASE_MAX) items.length = ROOM_BASE_MAX;
    const rec = { name, terms: { ...terms }, items, full: items.map((it) => (Number.isInteger(it?.stackCount) ? it.stackCount : null)), rejects, lootCap, champion, h: baseSignature(items) };
    _roomBase.set(canon, rec);
    _roomBonus.delete(canon);
    return rec;
  }
  function roomPileBase(h, terms, rolls, gender) {
    const t = { rolls, level: terms.lv, gender, luck: ROOM_BASE_LUCK, quarters: ROOM_BASE_QUARTERS, find: ROOM_BASE_FIND };
    const items = rollPileItems(t);
    if (_wildDungeon) wildPileMore(items, () => rollPileItems(t), _wildRing, rolls);
    seaPileMore(items, dfLocation, rolls);
    if (h.pile.stopKey && _deepCleared.has(h.pile.stopKey)) items.length = 0;
    return items;
  }
  function roomBodyBase(f, terms, rolls, gender, rejects) {
    const e = f.entity;
    const saved = { items: e.items, weapon: e.weapon, armorValues: e.armorValues, equip: e.equip, level: e.level, champion: e.champion, lootCap: e.lootCap };
    const roller = roomRoller(terms.lv, gender);
    const o = { rolls, quarters: ROOM_BASE_QUARTERS, luck: ROOM_BASE_LUCK, find: ROOM_BASE_FIND };
    try {
      if (e.isClass) e.level = terms.lv;
      // The champion mark is judged again at the room level, so every client rolls one base.
      // An elite enemy is never a champion.
      e.champion = e.eliteFoe ? undefined : championTraitFor(e, f.src?.champion)?.id;
      // The base record must carry the loot cap its own chain stamps, because the player's bonus reads it.
      e.lootCap = undefined;
      e.items = [];
      e.equip = undefined;
      spawnEnemyLoot(e, f.mobileType, ENEMY_BASICS[f.mobileType], roller, { ...eliteLootOpts(f.src), where: 'dungeon', ...o, rejects });
      if (_wildDungeon) wildLootAfter(e);
      if (f.src?.eliteFoe) grantEliteLoot(e, terms.lv, rolls);
      rollCorpseKit(e, o);
      stampWonWeapons(e.items, terms.n ?? 1, { rolls });
      raiseEnemyDeath(e, { ...o, level: terms.lv, room: true });
      return { items: e.items, lootCap: Number.isInteger(e.lootCap) ? e.lootCap : null, champion: e.champion ?? null };
    } finally {
      Object.assign(e, saved);
    }
  }
  function roomBonusOf(canon, base) {
    const who = playerEntity?.characterId ?? opts.selfId?.() ?? 'me';
    const key = `${base.name}|${who}`;
    const was = _roomBonus.get(canon);
    if (was && was.key === key) return was;
    const h = roomBaseHolder(canon);
    const f = h?.foe ?? null;
    const pieces = rollRoomBonus({
      rolls: seededRolls(key), player: playerEntity, pile: !!h?.pile, deepPile: !!h?.pile && isDeepPileKey(host.lootKey), rejects: base.rejects,
      basics: f ? ENEMY_BASICS[f.mobileType] : null, mobileType: f?.mobileType ?? null, champion: base.champion ?? null,
      level: f ? (f.entity.isClass ? base.terms.lv : f.entity.level) : base.terms.lv, lootCap: base.lootCap, baseItems: base.items, fighters: base.terms.n ?? 1,
    });
    for (const it of pieces) markPersonal(it);
    const rec = { key, pieces, composed: false };
    _roomBonus.set(canon, rec);
    return rec;
  }
  function settleRoomBonus(canon, list) {
    const b = _roomBonus.get(canon);
    if (!b || !b.composed || b.list !== list) return;
    const held = new Set(list);
    const gone = [], kept = [];
    b.pieces.forEach((it, i) => (held.has(it) ? kept : gone).push(i));
    settleBonusSpent(b.key, gone, kept);
  }
  function composeRoomContainer(canon) {
    const st = _roomState.get(canon), h = roomBaseHolder(canon);
    // Never recomposes under the player's open window: an open container is theirs until they close it.
    if (!st || !h || canon === host._lootOpenKey) return false;
    if (h.search && !_roomSees.has(canon)) return false;
    const base = rollRoomBase(canon, st.terms);
    if (!base) return false;
    const list = holderList(h);
    if (!h.search) settleRoomBonus(canon, list);
    const bonus = h.search ? { key: '', pieces: [] } : roomBonusOf(canon, base);
    const spent = bonusSpent(bonus.key);
    const pending = roomPendingOf(canon, st);
    if (h.search) base.items.forEach((it, i) => { if (!st.taken.has(i) && !notCarried([it])?.length) pending.places.set(i, (pending.places.get(i) ?? 0) + (base.full[i] ?? 1)); });
    const { list: out, seen } = composeRoomView(base.items, base.full, st, bonus.pieces.filter((_, i) => !spent.has(i)), pending);
    // Recomposes in place, so every holder of the array (the plaque, Physical Items, and a pile tab) reads it.
    list.length = 0;
    list.push(...out);
    markRoomCarried(list);
    bonus.composed = true;
    bonus.list = list;
    _roomComposed.set(canon, { base, list });
    _roomSeen.set(canon, { list, at: seen });
    for (const [id, m] of [..._roomMine]) if (m.canon === canon && m.put && m.refused) { _roomMine.delete(id); roomGive(m.item, pieceCount(m.item)); }
    if (h.pile) settleLootFlat(h.i);
    return true;
  }
  function roomRecordsOf(canon) {
    if (host._authority) { const rec = roomStateWord(canon, true); return rec ? [rec] : []; }
    const st = _roomState.get(canon), base = st ? rollRoomBase(canon, st.terms) : null;
    if (!st || !base) return [];
    const q = [], a = [];
    for (const m of _roomMine.values()) {
      if (m.canon !== canon || m.refused || !sameMint(m.terms, st.terms)) continue;
      if (m.claim) q.push(m.claim); else if (m.put) a.push(m.put);
    }
    const out = [];
    for (let i = 0; i < Math.max(q.length, a.length); i += ROOM_CLAIMS_MAX) out.push(decorate(canon, claimWord(canon, st, base.h, q.slice(i, i + ROOM_CLAIMS_MAX), a.slice(i, i + ROOM_CLAIMS_MAX), host._lootAt.get(canon) ?? null, st.base?.records ?? null)));
    return out;
  }
  const roomRecordOf = (canon) => roomRecordsOf(canon)[0] ?? null;
  const decorate = (canon, rec) => (isCarried(canon) && _roomSearcher.has(canon) ? { ...rec, ..._roomSearcher.get(canon) } : rec);
  function roomStateWord(canon, verdicts) {
    const st = _roomState.get(canon), h = roomBaseHolder(canon);
    if (!st || !h) return null;
    const base = rollRoomBase(canon, st.terms);
    if (!base) return null;
    const kept = st.stored.map((it, i) => [it, st.ids[i]]).filter(([it]) => !neverPeerHanded(it));
    if (kept.length > LOOT_LIST_MAX) {
      if (!host._lootTooBig.has(canon)) { host._lootTooBig.add(canon); console.warn(`[loot] ${canon} holds ${kept.length} stored items, more than the room can carry (${LOOT_LIST_MAX}); it is not said`); }
      return null;
    }
    host._lootTooBig.delete(canon);
    return decorate(canon, roomWord(canon, st, base.h, { s: kept.map((p) => p[0]), si: kept.map((p) => p[1]) }, host._lootAt.get(canon) ?? null, verdicts === true ? recentAnswers(st) : Array.isArray(verdicts) ? verdicts : [], st.base?.records ?? null));
  }
  function verdictWords(canon, verdicts) {
    const out = [];
    for (let i = 0; i < Math.max(verdicts.length, 1); i += ROOM_ANSWERS_KEPT) {
      const rec = roomStateWord(canon, verdicts.slice(i, i + ROOM_ANSWERS_KEPT));
      if (!rec) return out;
      out.push(rec);
    }
    return out;
  }
  const _strangerFinds = new Map();
  // A find by a searcher outside this party is judged in a state of its own, never shown and never the room memory.
  function judgeStrangerFind(canon, w, rec, from) {
    if (from == null) return 0;
    const held = _strangerFinds.get(canon) ?? [];
    let st = held.find((x) => wordIsMint(w, x.terms) && (x.terms.h === w.h)) ?? null;
    if (!st && !w.b) return 0;
    const q = w.q.filter((cl) => claimOf(cl.id, from)), a = w.a.filter((p) => claimOf(p.id, from));
    const reask = st ? [...q, ...a].map((c) => c.id).filter((id) => st.answers.has(id)) : [];
    st = mergeRoomWord(st, { ...w, x: [], c: [], y: [], s: st ? null : (w.s ?? []), si: st ? null : (w.si ?? []), q, a }).state;
    if (!held.includes(st)) { held.push(st); while (held.length > SEARCH_FOREIGN_PER_OBJECT) held.shift(); _strangerFinds.set(canon, held); }
    if (!st.base) return 0;
    const verdicts = [...st.claims.values()].map((cl) => [cl.id, judgeRoomClaim(st, st.base.items.length, st.base.full, tooOldToGrant(cl) ? { ...cl, stale: true } : cl, roomAdmit)]);
    for (const id of reask) if (!verdicts.some(([v]) => v === id)) verdicts.push([id, /** @type {number} */ (st.answers.get(id))]);
    if (!verdicts.length) return 1;
    const kept = st.stored.map((it, i) => [it, st.ids[i]]).filter(([it]) => !neverPeerHanded(it));
    const searcher = host.searchRoom.fields({ by: rec.by, bn: rec.bn });
    for (let i = 0; i < verdicts.length; i += ROOM_ANSWERS_KEPT) {
      opts.onActions?.({ k: host._locationKey, l: [{ ...roomWord(canon, st, st.base.h, { s: kept.map((p) => p[0]), si: kept.map((p) => p[1]) }, host._wallNow(), verdicts.slice(i, i + ROOM_ANSWERS_KEPT)), ...searcher }] });
    }
    return 1;
  }
  function landRoomWord(canon, rec, from = null) {
    const h = roomBaseHolder(canon);
    if (!h) return 0;
    if (!isRoomWord(rec)) return h.search ? landSearchLegacy(canon, h, rec, from) : landLegacyList(canon, h, rec);
    const w = validRoomWord(rec);
    const _now = host._wallNow();
    const who = h.search ? host.searchRoom.whose(rec, from) : null;
    if (h.search && w?.b) { w.b = peerHanded(w.b); if (baseSignature(w.b) !== w.h) return unreadableWord(canon, h, who); }
    if (!w) return unreadableWord(canon, h, h.search ? who : true);
    if (Number.isFinite(rec.t) && respawnDue(rec.t, _now)) { if (h.pile) _roomNextGen.set(canon, Math.max(_roomNextGen.get(canon) ?? 0, Math.trunc(rec.t))); return 0; }
    if (!roomBorn(h)) { _roomPending.set(canon, { rec, from }); return 0; }
    const st = _roomState.get(canon);
    const same = !!st && wordIsMint(w, st.terms);
    const sees = !h.search || !!who || (same && _roomSees.has(canon));
    if (!sees) { host.searchRoom.ours(canon, rec, from); return host._authority ? judgeStrangerFind(canon, w, rec, from) : 0; }
    if (h.search && !w.b && !st) return 0;
    const birth = !st || (!same && roomTermsBeat(w, st.terms));
    // Only the host word carries takes, stored pieces, and verdicts.
    // A peer word carries only the claims and puts of that peer.
    if (!roomHostSaid(from)) { w.x = []; w.c = []; w.y = []; if (!birth) { w.s = null; w.si = null; } }
    w.q = from == null ? [] : w.q.filter((cl) => claimOf(cl.id, from));
    w.a = from == null ? [] : w.a.filter((p) => claimOf(p.id, from));
    if (h.search && sees && host._authority && !host.searchRoom.whose({}, from)) { w.q = []; w.a = []; }
    const reask = host._authority && same ? [...w.q, ...w.a].map((c) => c.id).filter((id) => st.answers.has(id)) : [];
    if (st && !same && !birth) {
      if (host._authority && (w.q.length || w.a.length)) { mergeRoomWord(st, w); roomJudge(canon, st); }
      return 1;
    }
    if (!h.search) {
      const base = rollRoomBase(canon, w);
      if (!base) return 0;
      // A memory word with a base this build does not roll is the room's own from an earlier visit, so the host
      // starts the container over one generation on.
      if (w.h && w.h !== base.h) {
        if (from == null) staleMemory.set(canon, w.g);
        if (from == null && host._authority && !bodyRebuilding(h)) {
          restartStaleContainer(canon);
          return 0;
        }
        _roomSkew.add(canon);
        host._lootSeen.add(canon);
        host._lootUnreadable.add(canon);
        return 0;
      }
    }
    const { state, changed, answered } = mergeRoomWord(st, w);
    const reborn = state !== st;
    if (h.search && reborn) {
      if (st) dropOldMint(canon, state);
      _roomSearcher.set(canon, host.searchRoom.fields({ by: rec.by ?? who?.acct, bn: rec.bn ?? who?.name }));
    }
    _roomState.set(canon, state);
    host._lootUnreadable.delete(canon);
    _roomUnbornAt.delete(canon);
    host._lootSeen.add(canon);
    { const _t = Number.isFinite(rec.t) ? (_now == null ? rec.t : Math.min(rec.t, _now)) : _now; if (_t != null && (!Number.isFinite(host._lootAt.get(canon)) || _t > host._lootAt.get(canon))) host._lootAt.set(canon, _t); }
    const seer = h.search && sees && !_roomSees.has(canon);
    if (h.search && sees) _roomSees.add(canon);
    if ((seer || reborn) && who) searchHeard(h.i, host._lootAt.get(canon), who);
    for (const [id, g] of answered) roomResolve(id, g, canon);
    const base = rollRoomBase(canon, state.terms);
    if (changed || seer || answered.length || _roomComposed.get(canon)?.base !== base || _roomComposed.get(canon)?.list !== holderList(h)) composeRoomContainer(canon);
    if (host._authority && (state.claims.size || reask.length)) roomJudge(canon, state, null, reask);
    if (h.pile) h.pile.roomWords = (h.pile.roomWords ?? 0) + 1;
    return 1;
  }
  function unreadableWord(canon, h, mine) {
    _roomSkew.delete(canon);
    if (mine && roomBorn(h)) { host._lootSeen.add(canon); host._lootUnreadable.add(canon); }
    return 0;
  }
  const roomUnreadableText = (canon) => (_roomSkew.has(canon) ? LOOT_SKEW_TEXT() : LOOT_NEWER_TEXT);
  function dropOldMint(canon, state) {
    for (const [id, m] of [..._roomMine]) {
      if (m.canon !== canon || sameMint(m.terms, state.terms)) continue;
      _roomMine.delete(id);
      if (m.put && !m.refused) roomGive(m.item, pieceCount(m.item));
    }
    if (host._lootOpenKey === canon) _roomStale.add(canon);
  }
  // A whole list from an older build is a birth when no find of its period is held here.
  // Otherwise it is a diff against the previous list from that peer.
  function landSearchLegacy(canon, h, rec, from) {
    const _now = host._wallNow();
    const who = host.searchRoom.whose(rec, from);
    const items = peerHanded(validLootList(rec?.r));
    if (!items) return unreadableWord(canon, h, who && !respawnDue(rec?.t, _now));
    if (respawnDue(rec.t, _now) || items.length > SEARCH_LOOT_MAX) return 0;
    const st = _roomState.get(canon);
    const stamp = Number.isFinite(rec.t) ? (_now == null ? rec.t : Math.min(rec.t, _now)) : _now;
    const terms = { g: Number.isFinite(stamp) ? Math.max(0, Math.floor(sharedClassicMinutes(stamp) / SEARCH_COOLDOWN_MINUTES)) : 0, lv: 1, n: 1, tm: -1, h: baseSignature(items) };
    const key = `${canon}|${typeof from === 'string' ? from : 'memory'}`;
    const prev = _roomLegacy.get(key);
    _roomLegacy.set(key, legacyCounts(items));
    if (!st || terms.g > st.terms.g) {
      return landRoomWord(canon, { k: canon, g: terms.g, lv: 1, n: 1, tm: -1, h: terms.h, b: items.map((it) => ({ ...it })), ...(Number.isFinite(rec.t) ? { t: rec.t } : {}), ...(rec.by ? { by: rec.by } : {}), ...(rec.bn ? { bn: rec.bn } : {}) }, from);
    }
    if (!prev || from == null || !host._authority || !(who || (rec.by && rec.by === _roomSearcher.get(canon)?.by))) return 1;
    const base = rollRoomBase(canon, st.terms);
    if (!base) return 0;
    const d = legacyDelta(prev, items);
    const { list, seen } = composeRoomView(base.items, base.full, st, [], null);
    const id = () => roomClaimId(String(from).slice(0, 40), `old${host._sharedStamp}`, ++host._roomClaimN);
    const tm = host._wallNow() ?? 0;
    for (const t of d.takes) {
      let left = t.n;
      for (const piece of list) {
        const info = seen.get(piece);
        if (left <= 0) break;
        if (!info || legacySig(piece) !== t.sig) continue;
        left -= judgeRoomClaim(st, base.items.length, base.full, { id: id(), ...(info.p !== undefined ? { p: info.p } : { sp: info.sp }), n: Math.min(left, info.n), tm }, roomAdmit);
      }
    }
    for (const p of d.puts) {
      const stack = Number.isInteger(p.it?.stackCount);
      for (let k = 0; k < (stack ? 1 : p.n); k++) judgeRoomClaim(st, base.items.length, base.full, { id: id(), it: stack ? { ...p.it, stackCount: p.n } : { ...p.it }, tm }, roomAdmit);
    }
    if (d.takes.length || d.puts.length) { composeRoomContainer(canon); roomSayNow(canon, () => verdictWords(canon, [])); }
    return 1;
  }
  // A list from before shared bases migrates to generation 0 with every base piece gone and the list as stored
  // pieces, the same state on every client.
  function landLegacyList(canon, h, rec) {
    const items = peerHanded(validLootList(rec?.r));
    const _now = host._wallNow();
    if (!items) _roomSkew.delete(canon);
    if (!items) { if (roomBorn(h) && !respawnDue(rec?.t, _now)) { host._lootSeen.add(canon); host._lootUnreadable.add(canon); } return 0; }
    if (respawnDue(rec.t, _now)) return 0;
    if (!roomBorn(h)) { _roomPending.set(canon, rec); return 0; }
    const terms = { g: 0, lv: 1, n: 1, tm: -1 };
    const base = rollRoomBase(canon, terms);
    if (!base) return 0;
    const st = roomState(terms);
    base.items.forEach((_, i) => st.taken.add(i));
    st.stored = items;
    st.ids = items.map((_, i) => `s:${i}`);
    const was = _roomState.get(canon);
    if (was && !roomTermsBeat(terms, was.terms) && !sameRoomTerms(terms, was.terms)) return 1;
    _roomState.set(canon, st);
    host._lootUnreadable.delete(canon);
    host._lootSeen.add(canon);
    if (Number.isFinite(rec.t)) host._lootAt.set(canon, _now == null ? rec.t : Math.min(rec.t, _now));
    composeRoomContainer(canon);
    return 1;
  }
  const roomAdmit = (it) => !neverPeerHanded(it);
  function roomHostSaid(from) {
    if (from == null || from === host._foesFrom) return true;
    if (host._authority) return false;
    const seat = opts.roomHost?.() ?? null;
    return seat == null ? host._foesFrom == null : from === seat;
  }
  function roomPendingOf(canon, st) {
    const places = new Map(), stored = new Map(), puts = [];
    for (const m of _roomMine.values()) {
      if (m.canon !== canon || !sameMint(m.terms, st.terms)) continue;
      if (m.claim && !m.lapsed) { const k = m.claim.p ?? m.claim.sp, at = m.claim.p !== undefined ? places : stored; at.set(k, (at.get(k) ?? 0) + m.claim.n); }
      else if (m.put && !m.refused) puts.push({ it: m.item, id: m.put.id });
    }
    return { places, stored, puts };
  }
  function roomSayNow(canon, mint = () => roomRecordsOf(canon)) {
    const _t = host._wallNow(); if (_t != null) host._lootAt.set(canon, _t);
    const made = mint();
    const recs = Array.isArray(made) ? made : made ? [made] : [];
    if (!recs.length) return false;
    const first = !host._lootSeen.has(canon);
    host._lootSeen.add(canon);
    if (first) opts.onLootClaimed?.();
    let ok = true;
    for (const rec of recs) ok = !!opts.onActions?.({ k: host._locationKey, l: [rec] }) && ok;
    return ok;
  }
  function roomLift(item, n) {
    if (isGoldPieces(item)) { const had = playerEntity.goldPieces ?? 0, t = Math.min(had, n); playerEntity.goldPieces = had - t; return t; }
    let left = n;
    const off = (list, at) => {
      const held = list[at], have = pieceCount(held);
      if (have <= left) { if (isEquipped(held)) unequipItem(playerEntity, held); list.splice(at, 1); left -= have; }
      else { held.stackCount = have - left; left = 0; }
    };
    for (const list of [playerEntity.items, playerEntity.bagItems]) {
      if (!Array.isArray(list) || left <= 0) continue;
      const at = list.indexOf(item);
      if (at >= 0) off(list, at);
      for (let i = list.length - 1; i >= 0 && left > 0; i--) if (list[i] !== item && stacksWith(list[i], item)) off(list, i);
    }
    return n - left;
  }
  function roomGive(item, n) {
    if (n <= 0) return;
    if (!notCarried([item])?.length) return;
    if (isGoldPieces(item)) { addGoldPieces(playerEntity, n); return; }
    addItem((playerEntity.items ??= []), Number.isInteger(item?.stackCount) ? { ...item, stackCount: n } : item);
  }
  function roomSettle(canon) {
    const seen = _roomSeen.get(canon), h = roomBaseHolder(canon), st = _roomState.get(canon), base = _roomComposed.get(canon)?.base;
    if (!seen || !h || !st || !base || seen.list !== holderList(h)) return false;
    if (_roomStale.has(canon)) return host._lootOpenKey === canon ? false : settleStale(canon, seen);
    const here = new Set(seen.list);
    let moved = false;
    for (const [obj, info] of [...seen.at]) {
      const cur = here.has(obj) ? pieceCount(obj) : 0;
      if (cur === info.n) continue;
      moved = true;
      if (cur > info.n) { roomPut(canon, st, base, { ...obj, stackCount: cur - info.n }, null); info.n = cur; continue; }
      const k = info.n - cur;
      info.n = cur;
      if (!cur) seen.at.delete(obj);
      roomTake(canon, st, base, obj, info, k);
    }
    for (const obj of seen.list) {
      if (seen.at.has(obj) || isPersonalLoot(obj)) continue;
      moved = true;
      roomPut(canon, st, base, obj, seen);
    }
    return moved;
  }
  function settleStale(canon, seen) {
    _roomStale.delete(canon);
    const here = new Set(seen.list);
    let said = false;
    for (const [obj, info] of [...seen.at]) {
      const cur = here.has(obj) ? pieceCount(obj) : 0;
      if (cur < info.n) { roomLift(obj, info.n - cur); said = true; }
    }
    for (const obj of seen.list) if (!seen.at.has(obj) && !isPersonalLoot(obj)) roomGive(obj, pieceCount(obj));
    if (said) setMidScreenText(ROOM_TAKEN_TEXT);
    _roomSeen.delete(canon); _roomComposed.delete(canon);
    return false;
  }
  function roomTake(canon, st, base, obj, info, k) {
    const mine = info.sp != null ? _roomMine.get(info.sp) : null;
    if (mine?.put && mine.refused) { _roomMine.delete(info.sp); return; }
    const claim = { id: roomClaimId(opts.selfId?.() ?? 'self', host._sharedStamp, ++host._roomClaimN), ...(info.p !== undefined ? { p: info.p } : { sp: info.sp }), n: k, tm: host._wallNow() ?? 0 };
    if (host._authority) {
      const g = judgeRoomClaim(st, base.items.length, base.full, claim, roomAdmit);
      if (g < k) { roomLift(obj, k - g); if (!g) setMidScreenText(ROOM_TAKEN_TEXT); }
      return;
    }
    // Anyone but the host lifts the piece back out of the pack and holds it as a claim until the verdict.
    const give = roomLift(obj, k);
    _roomMine.set(claim.id, { canon, terms: st.terms, claim, item: obj, give, at: host._roomNowMs, saidAt: host._roomNowMs, lapsed: false });
    st.claims.set(claim.id, claim);
  }
  function roomPut(canon, st, base, obj, seen) {
    // Stores a copy of the put, never the window's record, which a split under the window would change.
    const put = { id: roomClaimId(opts.selfId?.() ?? 'self', host._sharedStamp, ++host._roomClaimN), it: { ...obj }, tm: host._wallNow() ?? 0 };
    if (host._authority) {
      const g = judgeRoomClaim(st, base.items.length, base.full, put, roomAdmit);
      if (g) seen?.at.set(obj, { sp: put.id, n: pieceCount(obj) });
      else { _roomMine.set(put.id, { canon, terms: st.terms, put, item: obj, refused: true }); seen?.at.set(obj, { sp: put.id, n: pieceCount(obj) }); }
      return;
    }
    _roomMine.set(put.id, { canon, terms: st.terms, put, item: obj, saidAt: host._roomNowMs, refused: false });
    st.claims.set(put.id, put);
    seen?.at.set(obj, { sp: put.id, n: pieceCount(obj) });
  }
  function roomResolve(id, g, canon) {
    const m = _roomMine.get(id);
    if (!m) return;
    if (m.put) {
      if (g) _roomMine.delete(id);
      else m.refused = true;
      return;
    }
    _roomMine.delete(id);
    const key = `${canon}#${m.terms.g}|${m.claim.p ?? m.claim.sp}`;
    if (g > 0) { roomGive(m.item, Math.min(g, m.give)); _roomWon.add(key); if (_roomWon.size > ROOM_CLAIMS_MAX * 4) _roomWon.delete(_roomWon.values().next().value); }
    // A refusal stays silent when another claim of this player already holds that piece.
    else if (!_roomWon.has(key)) setMidScreenText(ROOM_TAKEN_TEXT);
  }
  function roomJudge(canon, st, order = null, reask = []) {
    const base = rollRoomBase(canon, st.terms);
    if (!base || (!st.claims.size && !reask.length)) return false;
    const claims = [...st.claims.values()];
    if (order) claims.sort(order);
    const verdicts = claims.map((cl) => [cl.id, judgeRoomClaim(st, base.items.length, base.full, tooOldToGrant(cl) ? { ...cl, stale: true } : cl, roomAdmit)]);
    for (const id of reask) if (st.answers.has(id) && !verdicts.some(([v]) => v === id)) verdicts.push([id, /** @type {number} */ (st.answers.get(id))]);
    for (const [id, g] of verdicts) roomResolve(id, g, canon);
    composeRoomContainer(canon);
    return roomSayNow(canon, () => verdictWords(canon, verdicts));
  }
  // A claim older than half of CLAIM_KEEP_MS is refused: its claimer gives it up at CLAIM_KEEP_MS, and a later
  // grant would move the piece out of the room for nobody.
  const tooOldToGrant = (cl) => { const now = host._wallNow(); return !('it' in cl) && now != null && Number.isFinite(cl.tm) && now - cl.tm >= CLAIM_KEEP_MS / 2; };
  function roomTakeSeat() {
    if (!roomLootOn()) return;
    for (const [canon, st] of [..._roomState]) if (st.claims.size) roomJudge(canon, st, roomClaimOrder);
    for (const canon of [...staleMemory.keys()]) {
      if (_roomState.has(canon)) staleMemory.delete(canon);
      else if (!bodyRebuilding(roomBaseHolder(canon))) restartStaleContainer(canon);
    }
  }
  function bodyRebuilding(holder) {
    return !!holder?.foe && host._retyping.has(foes.indexOf(holder.foe));
  }
  function restartStaleContainer(canon) {
    const staleGeneration = staleMemory.get(canon) ?? 0;
    staleMemory.delete(canon);
    host._lootUnreadable.delete(canon);
    _roomUnbornAt.delete(canon);
    // The next mint takes the generation after the stale word, so fresh terms beat the old ones on every client.
    _roomNextGen.set(canon, Math.max(_roomNextGen.get(canon) ?? 0, staleGeneration + 1));
  }
  function bodyGeneration(canon, f) {
    const death = Number.isFinite(f._diedAt) ? f._diedAt : 0;
    return Math.max(death, _roomNextGen.get(canon) ?? 0);
  }
  function roomClaimTick(nowMs) {
    host._roomNowMs = nowMs;
    if (!roomLootOn() || host._roomMintHold) return;
    const due = new Set();
    for (const canon of [..._roomSeen.keys()]) if (roomSettle(canon)) due.add(canon);
    for (const m of _roomMine.values()) {
      if (m.claim && !m.lapsed && nowMs - m.at >= ROOM_CLAIM_TIMEOUT_MS) { m.lapsed = true; composeRoomContainer(m.canon); setMidScreenText(ROOM_LAPSED_TEXT()); }
      if (host._authority || m.refused || nowMs - m.saidAt < ROOM_PUT_RESAY_MS) continue;
      m.saidAt = nowMs; due.add(m.canon);
    }
    for (const canon of due) roomSayNow(canon);
    // A claim given up also leaves the claims heard, or taking the seat would grant it.
    // interiorRoomLoot.js does the same.
    for (const [id, m] of [..._roomMine]) if (m.claim && nowMs - m.at >= CLAIM_KEEP_MS) { _roomMine.delete(id); _roomState.get(m.canon)?.claims.delete(id); }
    const lapsed = [..._roomMine].filter(([, m]) => m.lapsed);
    for (const [id] of lapsed.slice(0, Math.max(0, lapsed.length - CLAIMS_KEPT_MAX))) _roomMine.delete(id);
  }
  function mintRoomTerms(canon, g) {
    const h = roomBaseHolder(canon);
    if (!h || !roomBorn(h) || _roomState.has(canon)) return false;
    const lv = roomBaseLevel(playerEntity?.level ?? 1, opts.partyLevels?.() ?? []);
    const n = h.foe ? Math.max(1, Math.min(8, (_sharedFoe(h.foe) ? fightN(h.foe) : 1) | 0)) : 1;
    const adds = h.foe ? lifeAddsOf(h.foe) : [];
    const w = { g: Math.max(0, Math.trunc(Number(g) || 0)), lv, n, tm: host._wallNow() ?? 0, x: [], c: [], s: adds };
    const base = rollRoomBase(canon, w);
    if (!base) return false;
    const { state } = mergeRoomWord(null, { ...w, h: base.h });
    _roomState.set(canon, state);
    _roomUnbornAt.delete(canon);
    _roomNextGen.delete(canon);
    composeRoomContainer(canon);
    return roomSayNow(canon, () => roomStateWord(canon, false));
  }
  function searchFound(i, find, minute) {
    const canon = `srch:${i}`;
    const h = roomBaseHolder(canon);
    if (!h || !roomLootOn()) return false;
    const records = peerHanded(Array.isArray(find) ? find : []).slice(0, SEARCH_LOOT_MAX).map((it) => ({ ...it }));
    const w = { g: Number.isFinite(minute) ? Math.max(0, Math.floor(minute / SEARCH_COOLDOWN_MINUTES)) : 0, lv: 1, n: 1, tm: host._wallNow() ?? 0, h: baseSignature(records), b: records, x: [], c: [], s: [] };
    const was = _roomState.get(canon) ?? null;
    const { state } = mergeRoomWord(was, w);
    if (state === was) { composeRoomContainer(canon); return true; }
    _roomState.set(canon, state);
    _roomSearcher.set(canon, host.searchRoom.fields(h.search));
    _roomSees.add(canon);
    host._lootUnreadable.delete(canon);
    if (was) dropOldMint(canon, state);
    composeRoomContainer(canon);
    return roomSayNow(canon, () => roomStateWord(canon, false));
  }
  function roomBodyBorn(f) {
    if (!roomLootOn()) return;
    const canon = roomCanonOfFoe(f);
    if (!canon || !isRoomBaseContainer(canon)) return;
    const pend = _roomPending.get(canon);
    if (pend) { _roomPending.delete(canon); landRoomWord(canon, pend.rec, pend.from); }
    if (_roomState.has(canon)) { composeRoomContainer(canon); return; }
    if (host._authority && !host._roomMintHold) { mintRoomTerms(canon, bodyGeneration(canon, f)); return; }
    // An unborn body holds nothing, since this copy's own roll is not the room's.
    f.entity.items.length = 0;
  }
  function letFindGo(canon, h) {
    if (!h?.search) return false;
    const st = _roomState.get(canon), base = st ? rollRoomBase(canon, st.terms) : null;
    if (st && base && !roomEmptied(st, base.items.length)) return true;
    host._lootSeen.delete(canon); host._lootAt.delete(canon); forgetRoomContainer(canon);
    return true;
  }
  function forgetRoomContainer(canon) {
    _roomState.delete(canon); _roomBase.delete(canon); _roomBonus.delete(canon); _roomComposed.delete(canon);
    _roomUnbornAt.delete(canon); _roomPending.delete(canon); _roomSeen.delete(canon);
    _roomSees.delete(canon); _roomSearcher.delete(canon); _roomStale.delete(canon);
    staleMemory.delete(canon);
  }
  function mintUnbornRoom(nowMs) {
    if (!roomLootOn() || host._roomMintHold) return;
    const wait = host._authority ? ROOM_TERMS_WAIT_HOST_MS : ROOM_TERMS_WAIT_PEER_MS;
    const due = (canon) => {
      if (!_roomUnbornAt.has(canon)) { _roomUnbornAt.set(canon, nowMs); return false; }
      return nowMs - _roomUnbornAt.get(canon) >= wait;
    };
    host.lootPiles.forEach((p, i) => {
      const canon = `loot:${i}`;
      if (_roomState.has(canon) || host._lootUnreadable.has(canon) || canon === host._lootOpenKey || !due(canon)) return;
      mintRoomTerms(canon, _roomNextGen.get(canon) ?? 0);
    });
    for (const f of foes) {
      if (!lootableBody(f)) continue;
      const canon = roomCanonOfFoe(f);
      if (!canon || _roomState.has(canon) || host._lootUnreadable.has(canon) || canon === host._lootOpenKey) continue;
      if (host._authority || due(canon)) mintRoomTerms(canon, bodyGeneration(canon, f));
    }
  }
  return { _roomBase, _roomMine, _roomNextGen, _roomState, composeRoomContainer, forgetRoomContainer, holderList, isRoomBaseContainer, landRoomWord, letFindGo, lootBuiltOf, mintUnbornRoom, roomBaseHolder, roomBodyBorn, roomCanonOfFoe, roomClaimTick, roomGive, roomLootOn, roomRecordOf, roomRecordsOf, roomSayNow, roomSettle, roomTakeSeat, roomUnborn, roomUnreadableText, searchFound, settleRoomBonus };
}
