// The first player to open a building cupboard rolls its stock, which is minted once and carried. After that the
// room syncs takes and puts as claims, never whole lists. The relay host judges every claim first come and answers
// on receipt. Two births of one day resolve by `roomTermsBeat`, where the earlier shared-clock time wins.
import {
  baseSignature, claimOf, claimWord, composeRoomView, isRoomWord, judgeRoomClaim, legacyCounts, legacyDelta, legacySig, liftPiece, givePiece,
  listMovesSince, mergeRoomWord, pieceCount, roomClaimId, roomClaimOrder, roomState, roomWord, roomTermsBeat, sameRoomTerms, validRoomWord,
  ROOM_ANSWERS_KEPT, ROOM_CLAIM_TIMEOUT_MS, ROOM_CLAIMS_MAX, ROOM_PUT_RESAY_MS, ROOM_TAKEN_TEXT,
} from '../items/roomLoot.js';
import { createClaimLedger, CLAIM_KEEP_MS } from '../items/claimLedger.js';
import { validLootList, LOOT_LIST_MAX } from '../items/loot.js';
import { markRoomCarried } from '../items/roomCarriedList.js';
import { neverPeerHanded, peerHanded } from '../net/peerWord.js';
import { clearStolen, STOLEN_MARK } from '../justice/stolenGoods.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
// Caps birth resends so a room whose seat never answers, such as one held by an older build, is not flooded.
const BIRTH_SAYS_MAX = 40;
// A lost tie-break returns taken and stored pieces only within this window after the mint. It is computed at use
// because the `roomLoot.js` import cycle leaves its constants unbound at load.
const birthCrossMs = () => BIRTH_SAYS_MAX * ROOM_PUT_RESAY_MS;
const admit = (it) => !neverPeerHanded(it);
const mintOf = (st) => `${st.terms.g}|${st.terms.lv}|${st.terms.n ?? 1}|${st.terms.h}`;

/**
 * @param {object} net
 * @param {any} bag
 */
export function createInteriorRoomLoot(net, bag) {
  const cups = new Map();
  const puts = new Map();
  let claimN = 0;
  let wasSeat = false;
  const entity = net.entity();
  const ledger = createClaimLedger({ entity, say: (t) => net.say(t), newId: () => roomClaimId(net.selfId() ?? 'self', bag.stamp, ++claimN) });

  const live = () => net.selfId() != null;
  const isSeat = () => { const s = net.seat(); return s == null || s === net.selfId(); };
  const hostWord = (from) => from == null || (net.seat() != null && from === net.seat());
  // Use the relay's shared clock, never `Date.now()` or `performance.now()`, because tie-breaks compare it across
  // clients.
  const wall = () => net.wallNow() ?? 0;
  const targetOf = (ctx, canon) => (ctx?.containers ?? [])[Number(canon.split(':')[1])] ?? null;
  const cupOf = (canon) => {
    let c = cups.get(canon);
    if (!c) { c = { canon, st: null, roll: null, composed: null, win: null, keeping: null, birthAt: null, birthSays: 0, legacy: new Map(), took: [], gave: [], local: false, spoke: false }; cups.set(canon, c); }
    return c;
  };

  function hidden(cup) {
    const places = new Map(), stored = new Map();
    const carried = net.carried?.();
    if (typeof carried?.keyOf !== 'function') return { places, stored };
    const keys = new Set(carried.keys ?? []);
    cup.st.base.items.forEach((it, i) => { const k = carried.keyOf(it); if (k && keys.has(k) && !cup.st.taken.has(i)) places.set(i, cup.st.base.full[i] ?? 1); });
    cup.st.stored.forEach((it, i) => { const k = carried.keyOf(it); if (k && keys.has(k)) stored.set(cup.st.ids[i], pieceCount(it)); });
    return { places, stored };
  }
  function pendingOf(cup) {
    const p = ledger.pending(cup.canon);
    const h = hidden(cup);
    for (const [i, n] of h.places) p.places.set(i, (p.places.get(i) ?? 0) + n);
    for (const [id, n] of h.stored) p.stored.set(id, (p.stored.get(id) ?? 0) + n);
    for (const pu of puts.values()) if (pu.canon === cup.canon && !pu.refused && pu.mint === mintOf(cup.st)) p.puts.push({ it: pu.item, id: pu.put.id });
    return p;
  }
  // Composes into the existing `items` array so a bound window keeps its rows, and never while this player's window
  // is open.
  function compose(ctx, cup) {
    const t = targetOf(ctx, cup.canon);
    if (!t || !cup.st?.base || cup.win) return false;
    for (const [id, p] of [...puts]) if (p.canon === cup.canon && p.refused) { puts.delete(id); givePiece(entity, p.item, pieceCount(p.item)); }
    const { list, seen } = composeRoomView(cup.st.base.items, cup.st.base.full, cup.st, [], pendingOf(cup));
    if (Array.isArray(t.items)) { t.items.length = 0; t.items.push(...list); } else t.items = list;
    markRoomCarried(t.items);
    t.stockedDate = Math.max(Number.isFinite(t.stockedDate) ? t.stockedDate : 0, cup.st.terms.g);
    cup.composed = { list: t.items, seen, base: cup.st.base };
    return true;
  }

  // Each word carries `d` equal to `g` and no `r`, so an older build passes its day check, reads no list, and marks
  // the cupboard unreadable.
  const dayOf = (rec, st) => ({ ...rec, d: st.terms.g });
  function storedOf(cup) {
    const kept = cup.st.stored.map((it, i) => [it, cup.st.ids[i]]).filter(([it]) => admit(it));
    return { s: kept.map(([it]) => clearStolen({ ...it })), si: kept.map(([, id]) => id) };
  }
  // Verdicts go out in words of `ROOM_ANSWERS_KEPT` so a large Take all never pushes an answer out of a word.
  function stateRecords(cup, { base = false, verdicts = [] } = {}) {
    const word = (y) => dayOf(roomWord(cup.canon, cup.st, cup.st.base.h, storedOf(cup), null, y, base ? cup.st.base.records : null), cup.st);
    if (!verdicts.length) return [word([])];
    const out = [];
    for (let i = 0; i < verdicts.length; i += ROOM_ANSWERS_KEPT) out.push(word(verdicts.slice(i, i + ROOM_ANSWERS_KEPT)));
    return out;
  }
  function claimRecords(cup) {
    const mint = mintOf(cup.st);
    const q = [], a = [];
    for (const c of ledger.open(cup.canon)) if (c.meta.mint === mint) q.push({ id: c.id, ...(c.p !== undefined ? { p: c.p } : { sp: c.sp }), n: c.n, tm: c.meta.tm });
    for (const p of puts.values()) if (p.canon === cup.canon && !p.refused && p.mint === mint) a.push({ id: p.put.id, it: p.put.it, tm: p.put.tm });
    const out = [];
    for (let i = 0; i < Math.max(q.length, a.length); i += ROOM_CLAIMS_MAX) {
      out.push(dayOf(claimWord(cup.canon, cup.st, cup.st.base.h, q.slice(i, i + ROOM_CLAIMS_MAX), a.slice(i, i + ROOM_CLAIMS_MAX), null), cup.st));
    }
    return out;
  }
  function wordsOf(cup, { verdicts = [], base = false } = {}) {
    if (!cup.st?.base || cup.local) return [];
    if (isSeat()) return stateRecords(cup, { base, verdicts });
    const out = claimRecords(cup);
    if (cup.birthAt != null) out.unshift(...stateRecords(cup, { base: true }));
    return out;
  }
  function say(cup, opts) {
    const recs = wordsOf(cup, opts);
    if (!recs.length || !bag.locationKey) return false;
    if (!cup.spoke) { cup.spoke = true; bag.seen.add(cup.canon); net.claimed?.(); }
    let ok = true;
    for (const rec of recs) ok = !!net.send({ k: bag.locationKey, l: [rec] }) && ok;
    return ok;
  }

  function resolveMine(id, g) {
    const p = puts.get(id);
    if (p) { if (g) { puts.delete(id); const cup = cups.get(p.canon); if (cup) gaveIn(cup, p.item, p.mint, id); } else p.refused = true; return; }
    ledger.resolve(id, g);
  }
  // `reanswer` resends stored verdicts for claims asked again, so a lost verdict is recovered without judging a
  // claim twice.
  function judge(ctx, cup, order = null, reanswer = []) {
    const st = cup.st;
    const claims = [...st.claims.values()];
    if (order) claims.sort(order);
    const now = wall();
    // A take claim older than half of `CLAIM_KEEP_MS` is refused, because its claimer may have given it up.
    const verdicts = claims.map((cl) => [cl.id, judgeRoomClaim(st, st.base.items.length, st.base.full, !('it' in cl) && Number.isFinite(cl.tm) && now - cl.tm >= CLAIM_KEEP_MS / 2 ? { ...cl, stale: true } : cl, admit)]);
    for (const id of reanswer) if (st.answers.has(id) && !verdicts.some(([v]) => v === id)) verdicts.push([id, /** @type {number} */ (st.answers.get(id))]);
    for (const [id, g] of verdicts) resolveMine(id, g);
    compose(ctx, cup);
    return verdicts;
  }

  const landed = (list) => peerHanded(list).map((it) => clearStolen(it));
  function unreadable(cup) { bag.seen.add(cup.canon); bag.unreadable.add(cup.canon); return 0; }
  // `lost` means the other birth of the day won: claims on the old mint are refused and the seat's takes are lifted
  // back. Otherwise a restock replaced the mint, and takes stay taken.
  function dropOld(cup, lost, was = null) {
    const mint = mintOf(cup.st);
    for (const c of ledger.open(cup.canon)) if (c.meta.mint !== mint) ledger.resolve(c.id, 0, { withdrawn: !lost });
    for (const p of puts.values()) if (p.canon === cup.canon && p.mint !== mint) p.refused = true;
    if (lost) {
      let said = false;
      const now = net.now(), cross = birthCrossMs();
      for (const t of cup.took) if (t.mint !== mint && now - t.at <= cross) { liftPiece(entity, t.obj, t.k); said = true; }
      for (const g of cup.gave) if (g.mint !== mint && now - g.at <= cross && was?.ids?.includes(g.id)) givePiece(entity, g.item, pieceCount(g.item));
      if (said) net.say(ROOM_TAKEN_TEXT);
    }
    cup.took = cup.took.filter((t) => t.mint === mint);
    cup.gave = cup.gave.filter((g) => g.mint === mint);
    cup.birthAt = null;
  }

  function land(ctx, rec, from, today) {
    const canon = rec.k;
    if (!targetOf(ctx, canon)) return 0;
    const cup = cupOf(canon);
    // A generation that is not a whole number or is past tomorrow refuses the whole word, and the day only moves
    // forward.
    if (rec.g !== undefined && !(Number.isSafeInteger(rec.g) && rec.g >= 0 && (today == null || rec.g <= today + 1))) return 0;
    if (isRoomWord(rec)) return landWord(ctx, cup, rec, from);
    if (rec.g !== undefined) return 0;
    return landLegacy(ctx, cup, rec, from, today);
  }
  function landWord(ctx, cup, rec, from) {
    const w = validRoomWord(rec);
    if (!w) return unreadable(cup);
    if (w.b) {
      w.b = landed(w.b);
      if (baseSignature(w.b) !== w.h) return unreadable(cup);
    }
    const fromHost = hostWord(from);
    // State fields count only from the seat or the memory. A birth is accepted from anyone, while claims and puts
    // count only under the sender id.
    if (!fromHost) { w.x = []; w.c = []; w.y = []; w.s = null; w.si = null; }
    w.q = from == null ? [] : w.q.filter((cl) => claimOf(cl.id, from));
    w.a = from == null ? [] : w.a.filter((p) => claimOf(p.id, from)).map((p) => (p.it ? { ...p, it: clearStolen(p.it) } : p));
    if (w.s) { const keep = w.s.map((it) => admit(it)); w.si = w.si.filter((_, i) => keep[i]); w.s = landed(w.s); }
    const mine = isSeat();
    const before = cup.st;
    if (!before && !w.b) return 0;
    const reanswer = mine && before ? [...w.q, ...w.a].map((c) => c.id).filter((id) => before.answers.has(id)) : [];
    const { state, answered } = mergeRoomWord(before, w);
    const adopted = state !== before;
    cup.st = state;
    if (adopted) { cup.local = false; dropOld(cup, before?.terms.g === state.terms.g, before); }
    if (!adopted && before && !(sameRoomTerms(w, state.terms) && w.h === state.terms.h)) {
      if (mine) {
        const verdicts = w.q.length || w.a.length ? judge(ctx, cup) : [];
        if (verdicts.length || w.b) say(cup, { verdicts, base: !!w.b });
      }
      return 1;
    }
    bag.unreadable.delete(cup.canon);
    bag.seen.add(cup.canon);
    if (fromHost && from != null && cup.birthAt != null) cup.birthAt = null;
    for (const [id, g] of answered) resolveMine(id, g);
    let verdicts = [];
    if (mine && (state.claims.size || reanswer.length)) verdicts = judge(ctx, cup, null, reanswer);
    else compose(ctx, cup);
    // The seat sends verdicts here on receipt, not in the frame, because a hidden tab still receives messages but
    // runs no animation frame.
    const birth = !!w.b && !fromHost;
    if (mine && (verdicts.length || birth)) say(cup, { verdicts, base: birth });
    return 1;
  }

  function landLegacy(ctx, cup, rec, from, today) {
    if (!Number.isFinite(rec.d) || rec.d < 0 || (today != null && rec.d > today + 1)) return 0;
    const list = validLootList(rec.r);
    if (!list) return unreadable(cup);
    const items = landed(list);
    const who = from ?? 'memory';
    if (cup.st && cup.st.terms.g > Math.floor(rec.d)) return 1;
    if (!cup.st || cup.st.terms.g < Math.floor(rec.d)) {
      const w = { g: Math.floor(rec.d), lv: 1, n: 1, tm: -1, h: baseSignature(items), b: clone(items), x: [], c: [], s: null, si: null, q: [], a: [], y: [] };
      const was = cup.st;
      cup.st = mergeRoomWord(was, w).state;
      cup.local = false; cup.legacy = new Map();
      if (was) dropOld(cup, false);
      bag.unreadable.delete(cup.canon); bag.seen.add(cup.canon);
      cup.legacy.set(who, legacyCounts(items));
      compose(ctx, cup);
      return 1;
    }
    bag.unreadable.delete(cup.canon); bag.seen.add(cup.canon);
    const prev = cup.legacy.get(who) ?? null;
    const delta = legacyDelta(prev, items);
    cup.legacy.set(who, delta.counts);
    if (from == null || !prev || !isSeat()) return 1;
    const st = cup.st;
    const judged = (cl) => judgeRoomClaim(st, st.base.items.length, st.base.full, cl, admit);
    for (const { sig, n } of delta.takes) {
      let left = n;
      st.base.items.forEach((it, i) => {
        if (left <= 0 || st.taken.has(i) || legacySig(it) !== sig) return;
        const g = judged({ id: `legacy:${from}:${++claimN}`, p: i, n: Math.min(left, st.counts.get(i) ?? st.base.full[i] ?? 1) });
        left -= g;
      });
      st.stored.map((it, i) => [it, st.ids[i]]).forEach(([it, id]) => {
        if (left <= 0 || legacySig(it) !== sig) return;
        left -= judged({ id: `legacy:${from}:${++claimN}`, sp: id, n: Math.min(left, pieceCount(it)) });
      });
    }
    for (const { n, it } of delta.puts) judged({ id: `legacy:${from}:${++claimN}`, it: Number.isInteger(it.stackCount) ? { ...it, stackCount: n } : { ...it }, tm: wall() });
    compose(ctx, cup);
    say(cup);
    return 1;
  }

  function settle(ctx, cup) {
    const t = targetOf(ctx, cup.canon);
    if (!cup.st?.base || !cup.composed || !t || cup.composed.list !== t.items) return false;
    const { takes, grows, puts: laid } = listMovesSince(cup.composed.seen, t.items, () => false);
    for (const tk of takes) takeOne(cup, tk);
    for (const g of grows) putOne(cup, g.obj, g.by, false);
    for (const obj of laid) putOne(cup, obj, pieceCount(obj), true);
    return takes.length > 0 || grows.length > 0 || laid.length > 0;
  }
  // Reapplies the stolen mark the window applied, because a refused take must lift the marked piece and a stolen
  // piece stacks only with stolen pieces.
  const takenAs = (cup, obj) => (cup.keeping?.has(obj) && ![entity.items, entity.bagItems].some((l) => Array.isArray(l) && l.includes(obj)) ? { ...obj, [STOLEN_MARK]: true } : obj);
  function takeOne(cup, { obj: shown, info, k }) {
    const st = cup.st, obj = takenAs(cup, shown);
    if (cup.composed.base !== st.base) { liftPiece(entity, obj, k); net.say(ROOM_TAKEN_TEXT); return; }
    const ref = info.p !== undefined ? { p: info.p } : { sp: info.sp };
    if (isSeat()) {
      const g = judgeRoomClaim(st, st.base.items.length, st.base.full, { id: roomClaimId(net.selfId() ?? 'self', bag.stamp, ++claimN), ...ref, n: k, tm: wall() }, admit);
      if (g < k) { liftPiece(entity, obj, k - g); if (!g) net.say(ROOM_TAKEN_TEXT); }
      if (g > 0) { cup.took.push({ obj, k: g, mint: mintOf(st), at: net.now() }); if (cup.took.length > LOOT_LIST_MAX) cup.took.shift(); }
      return;
    }
    const c = ledger.take(cup.canon, ref, obj, k, { mint: mintOf(st), tm: wall() }, net.now());
    st.claims.set(c.id, { id: c.id, ...ref, n: k, tm: c.meta.tm });
  }
  function gaveIn(cup, item, mint, id) {
    cup.gave.push({ item, mint, id, at: net.now() });
    if (cup.gave.length > LOOT_LIST_MAX) cup.gave.shift();
  }
  function putOne(cup, obj, n, laid) {
    const st = cup.st;
    const piece = n === pieceCount(obj) ? obj : { ...obj, stackCount: n };
    const put = { id: roomClaimId(net.selfId() ?? 'self', bag.stamp, ++claimN), it: clearStolen(clone(piece)), tm: wall() };
    if (laid) cup.composed.seen.set(obj, { sp: put.id, n: pieceCount(obj) });
    if (cup.composed.base !== st.base || !admit(obj)) { puts.set(put.id, { canon: cup.canon, mint: mintOf(st), put, item: piece, saidAt: net.now(), at: net.now(), refused: true }); return; }
    if (isSeat()) {
      if (!judgeRoomClaim(st, st.base.items.length, st.base.full, { ...put, it: put.it }, admit)) puts.set(put.id, { canon: cup.canon, mint: mintOf(st), put, item: piece, saidAt: net.now(), at: net.now(), refused: true });
      else gaveIn(cup, piece, mintOf(st), put.id);
      return;
    }
    puts.set(put.id, { canon: cup.canon, mint: mintOf(st), put, item: piece, saidAt: net.now(), at: net.now(), refused: false });
    st.claims.set(put.id, put);
  }

  function mint(ctx, cup) {
    const roll = cup.roll;
    const t = targetOf(ctx, cup.canon);
    cup.roll = null;
    if (!roll || !t) return false;
    if (cup.st && cup.st.terms.g >= roll.today) return false;
    const own = () => { cup.local = true; t.items = roll.items; t.stockedDate = roll.today; return true; };
    if (roll.items.length > LOOT_LIST_MAX) {
      if (!bag.tooBig.has(cup.canon)) { bag.tooBig.add(cup.canon); console.warn(`[loot] ${cup.canon} holds ${roll.items.length} items, more than the room can carry (${LOOT_LIST_MAX}); it stays yours alone`); }
      return own();
    }
    const records = peerHanded(roll.items).map((it) => clearStolen({ ...it }));
    const one = validLootList(clone(records));
    if (!one || one.length !== records.length) return own();
    const base = landed(one);
    const was = cup.st;
    cup.st = mergeRoomWord(was, { g: roll.today, lv: 1, n: 1, tm: wall(), h: baseSignature(base), b: base, x: [], c: [], s: null, si: null, q: [], a: [], y: [] }).state;
    cup.local = false;
    bag.unreadable.delete(cup.canon); bag.seen.add(cup.canon);
    if (was) dropOld(cup, false);
    cup.birthAt = net.now(); cup.birthSays = 0;
    compose(ctx, cup);
    say(cup, { base: true });
    return true;
  }

  return {
    live,
    roll(ctx, canon, items, today) {
      if (!live() || !targetOf(ctx, canon)) return false;
      const cup = cupOf(canon);
      cup.roll = { items, today };
      // An empty roll is minted at once with no confirmation, so the empty cupboard lasts the day and a press never
      // re-rolls it.
      if (!items.length) mint(ctx, cup);
      return true;
    },
    birth(ctx, canon) { const cup = cups.get(canon); return !!cup?.roll && live() && mint(ctx, cup); },
    open(canon, win, keeping = null) { const cup = cupOf(canon); cup.win = win; cup.keeping = keeping instanceof Set ? keeping : null; bag.openKey = canon; bag.openWin = win; },
    unborn(canon) { return !cups.get(canon)?.st; },
    land: (ctx, rec, { from = null, today = null } = {}) => land(ctx, rec, from, today),
    aside(ctx) {
      if (!live()) return;
      (ctx?.containers ?? []).forEach((t, i) => {
        const cup = cups.get(`container:${i}`);
        if (cup?.st?.base) { compose(ctx, cup); return; }
        if (t && Array.isArray(t.items) && !cup?.local) { t.items = null; t.stockedDate = 0; }
      });
    },
    records(ctx, canon) {
      const cup = cups.get(canon);
      if (!cup?.st?.base || cup.local || !live()) return [];
      return isSeat() ? stateRecords(cup, { base: true }) : wordsOf(cup);
    },
    frame(ctx, now, open) {
      if (!live()) return;
      const nowSeat = isSeat();
      // On a seat change, the previous seat's unanswered claims are judged in `roomClaimOrder` so every new seat
      // uses one order.
      if (nowSeat && !wasSeat) for (const cup of cups.values()) if (cup.st?.claims.size && cup.st.base) say(cup, { verdicts: judge(ctx, cup, roomClaimOrder) });
      wasSeat = nowSeat;
      const due = new Set();
      for (const cup of cups.values()) {
        if (cup.win && (!open(cup.win) || cup.win.done)) {
          if (bag.openWin === cup.win) { bag.openKey = null; bag.openWin = null; }
          cup.win = null;
          if (cup.st?.base) { if (settle(ctx, cup)) due.add(cup); compose(ctx, cup); }
          cup.keeping = null;
        } else if (cup.st?.base && settle(ctx, cup)) due.add(cup);
      }
      const { lapsed, resay, expired } = ledger.due(now);
      // Expired claims leave the state so a later seat never grants a piece its claimer gave up.
      for (const c of expired) cups.get(c.container)?.st?.claims.delete(c.id);
      for (const c of lapsed) { const cup = cups.get(c.container); if (cup?.st?.base) compose(ctx, cup); }
      for (const c of resay) { const cup = cups.get(c.container); if (cup) due.add(cup); }
      if (!nowSeat) {
        for (const p of puts.values()) if (!p.refused && now - p.saidAt >= ROOM_PUT_RESAY_MS) { p.saidAt = now; const cup = cups.get(p.canon); if (cup) due.add(cup); }
        for (const cup of cups.values()) if (cup.birthAt != null && cup.birthSays < BIRTH_SAYS_MAX && now - cup.birthAt >= ROOM_PUT_RESAY_MS) { cup.birthAt = now; cup.birthSays++; due.add(cup); }
      }
      for (const cup of due) say(cup);
    },
    leave(ctx) {
      if (!live()) return;
      for (const cup of cups.values()) if (cup.st?.base && settle(ctx, cup)) say(cup);
      const now = net.now();
      ledger.keep(() => true, now);
      // A refused put, or one unanswered for `ROOM_CLAIM_TIMEOUT_MS`, returns to its putter on leave because no
      // other list holds it.
      for (const [id, p] of [...puts]) if (p.refused || now - p.at >= ROOM_CLAIM_TIMEOUT_MS) { puts.delete(id); givePiece(entity, p.item, pieceCount(p.item)); }
    },
    cups, puts, ledger,
  };
}
