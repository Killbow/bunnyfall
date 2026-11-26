// Enemy-body loot shared by players: the owner holds the places of every body and judges peer claims on receipt.
import { openCorpseLoot, takeCorpseLoot, arrowsOnly, playRareDrop, corpseContents, corpseEntityName } from '../characters/corpseMarker.js';
import { addItem, addGoldPieces, isGoldPieces } from './inventory.js';
import { silverFindAt } from './silverFinds.js';
import { localizedText } from '../ui/textManager.js';
import { validLootList, LOOT_LIST_MAX, LOOT_NEWER_TAKE_TEXT } from './loot.js';
import { peerHanded, notCarried } from '../net/peerWord.js';
import { roomState, judgeRoomClaim, composeRoomView, listMovesSince, liftPiece, pieceCount, roomClaimId, ROOM_BASE_MAX, ROOM_CLAIMS_MAX, ROOM_TAKEN_TEXT } from './roomLoot.js';
import { createClaimLedger, LEGACY_ASK_KEEP_MS } from './claimLedger.js';
import { tokenGate, mintSharedStamp, CELL_FRAME_RECORDS_MAX } from '../net/wire.js';
import {
  BODY_PEEK_REACH, PEEK_RETRY_MS, BODY_ASKS_PER_S, TAKES_PER_S, TAKE_WINDOW_MS, GRANT_BACK_MS, GRANT_FRAME_MAX, GENERATION_SPACE, BAD, HIDDEN,
  digestWord, digestEntry, digestKey, validDigest, validDigestEntry, mergeDigest, placeGone, shareableRecord, readRecord, bodyStateOf, placesLacking,
  validPeek, validClaims, validVerdicts, validRecords, pageOfRecords, peekFrame, claimsFrame, answerFrame, verdictFrame, makeVerdictLedger,
} from '../net/bodyLoot.js';

const READERS_MAX = 512;
const VIEW_REFRESH_MS = 500;
const FLIGHT_STALE_MS = 3000;
// Seeded from the CSPRNG, so no seeded Math.random draw moves and a reloaded page starts a fresh generation range.
function generationBase() {
  let n;
  try { n = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % GENERATION_SPACE; } catch { n = Math.floor(Math.random() * GENERATION_SPACE); }
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/**
 * @param {object} h
 * @param {any[]} h.foes
 * @param {any} h.playerEntity
 * @param {(line: string) => void} [h.say]
 * @param {any} [h.audio]
 * @param {() => any} h.net
 * @param {() => number} h.now
 * @param {(from: string) => any} h.ownerOf
 * @param {(from: string) => string | null} h.ownerKey
 * @param {(from: string, i: number) => any} h.puppetOf
 * @param {(i: number) => any} h.ownBody
 * @param {(id: string) => any} h.peerCandidate
 * @param {() => number} h.foesSeq
 * @param {number} h.takeRange
 * @param {number} h.leapSlack
 */
export function createBodyLoot(h) {
  const { foes, playerEntity, audio, peerCandidate, ownerOf } = h;
  const _now = () => h.now();
  const net = () => h.net();
  const tell = (line) => { h.say?.(line); };

  const stamp = mintSharedStamp();
  let claimN = 0;
  const ledger = createClaimLedger({ entity: playerEntity, say: tell, newId: () => roomClaimId(net()?.selfId?.() ?? 'self', stamp, ++claimN) });
  const verdicts = makeVerdictLedger();
  let owned = new WeakMap();
  const readers = new Map();
  let open = null;
  let generation = generationBase(), ownN = 0, legacyN = 0;

  const online = () => !!net()?.toWire;
  const bodyPos = (f) => f.corpseMarker?.pos ?? f.ai?.feet ?? null;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const hit = (frame, fate) => net()?.onPeerHit?.(frame, fate);
  const keyOf = (owner, seq) => `${owner}:${seq}`;

  // Places are append-only: a place is never reused, so a piece put back becomes a new place.
  function addPlace(st, piece) {
    const rec = st.base.length < ROOM_BASE_MAX ? shareableRecord(piece) : null;
    if (!rec) return -1;
    st.base.push(piece);
    st.full.push(Number.isInteger(piece.stackCount) ? piece.stackCount : null);
    st.records.push(rec);
    return st.base.length - 1;
  }

  function ownState(f) {
    if (!f?.entity) return null;
    let st = owned.get(f);
    if (st && st.items === f.entity.items) return st;
    const items = (f.entity.items ??= []);
    st = { f, bg: ++generation, base: [], full: [], records: [], own: [], rs: roomState({ g: generation, lv: 1, n: 1, tm: 0 }), seen: new Map(), items, dirty: true, granted: null };
    for (const it of items) {
      if (!it) continue;
      if (addPlace(st, it) < 0) st.own.push(it);
    }
    owned.set(f, st);
    composeOwn(st);
    return st;
  }
  function composeOwn(st) {
    const { list, seen } = composeRoomView(st.base, st.full, st.rs, st.own, null);
    const items = st.f.entity.items;
    items.length = 0; items.push(...list);
    st.seen = seen; st.dirty = false;
  }
  const presentCount = (st) => { let n = 0; for (let p = 0; p < st.base.length; p++) if (!st.rs.taken.has(p)) n++; return Math.min(255, n); };
  const digestOf = (st) => digestWord(st.bg, st.base.length, st.rs.taken, st.rs.counts);

  function settleOwn(st) {
    const items = st.f.entity.items;
    if (items !== st.items) return;
    const { takes, grows, puts } = listMovesSince(st.seen, items, (it) => st.own.includes(it));
    if (st.own.length) { const here = new Set(items); st.own = st.own.filter((it) => here.has(it)); }
    for (const { obj, info, k } of takes) {
      const g = judgeRoomClaim(st.rs, st.base.length, st.full, { id: `own:${st.bg}:${++ownN}`, p: info.p, n: k });
      if (g < k) { liftPiece(playerEntity, obj, k - g); if (!g) tell(ROOM_TAKEN_TEXT); }
    }
    for (const { obj, info, by } of grows) {
      const laid = { ...obj, stackCount: by };
      obj.stackCount = info.n - by; info.n -= by;
      items.push(laid);
      const p = addPlace(st, laid);
      if (p >= 0) st.seen.set(laid, { p, n: by }); else st.own.push(laid);
    }
    for (const obj of puts) {
      const at = items.indexOf(obj);
      const piece = st.base.includes(obj) ? { ...obj } : obj;
      if (piece !== obj) items[at] = piece;
      const p = addPlace(st, piece);
      if (p >= 0) st.seen.set(piece, { p, n: pieceCount(piece) }); else st.own.push(piece);
    }
  }
  function ownTick(st) {
    if (st.f.entity.items !== st.items) return;
    settleOwn(st);
    if (st.dirty && open !== st) composeOwn(st);
  }
  function ownWindow(st, openWindow) {
    if (typeof openWindow !== 'function') return openWindow;
    return (hooks) => openWindow({
      ...hooks,
      opened: () => { open = st; },
      closed: () => { if (open === st) open = null; ownTick(st); },
    });
  }

  function restoreHeld(st, held) {
    for (const piece of held) if (addPlace(st, piece) < 0) st.own.push(piece);
    st.dirty = true;
    if (open !== st) composeOwn(st);
  }

  function ownerPeek(from, data) {
    const f = Number.isInteger(data.i) ? h.ownBody(data.i) : null;
    if (!f || !f.corpse || !f.entity) return false;
    const places = validPeek(data.bp);
    const asker = peerCandidate(from), at = bodyPos(f);
    if (!places || !asker || !at || dist(asker.feet, at) > BODY_PEEK_REACH + 2 * h.leapSlack) return true;
    if (!askBudget(from)) return true;
    const st = ownState(f);
    if (!st) return true;
    ownTick(st);
    const want = places.filter((p) => p < st.base.length && !st.rs.taken.has(p));
    hit(answerFrame(from, data.k ?? net()?.room?.() ?? null, f.seq, digestOf(st), pageOfRecords(want, st.records)));
    return true;
  }
  function askBudget(from) {
    const o = ownerOf(from);
    const budget = tokenGate(o.asks ?? null, _now(), BODY_ASKS_PER_S);
    o.asks = budget.bucket;
    return budget.pass;
  }

  function ownerClaims(from, data) {
    const claims = validClaims(data.bq, from);
    if (!claims || !Number.isInteger(data.i)) return false;
    const f = h.ownBody(data.i);
    const body = f && f.corpse && f.entity ? f : null;
    const now = _now();
    // A judged claim is a re-ask, answered from the verdict ledger whatever the reach or roster.
    // A new claim needs a peer in the pose list, within reach, naming this body's generation.
    const rejudged = claims.some((c) => verdicts.get(c.id, now)?.to === from);
    if (!body && !rejudged) return false;
    const asker = peerCandidate(from);
    if (!asker && !rejudged) return true;
    if (!askBudget(from)) return true;
    const st = body ? ownState(body) : null;
    // Settle the owner's own takes first: a take its window already made came first and wins.
    if (st) ownTick(st);
    const at = body ? bodyPos(body) : null;
    const reach = !!(st && at && asker && dist(asker.feet, at) <= h.takeRange);
    const named = !!st && data.g === st.bg;

    const out = [];
    for (const c of claims) {
      const known = verdicts.get(c.id, now);
      if (known) {
        if (known.to === from && !(known.inFlight > 0 && now - known.flightAt < FLIGHT_STALE_MS)) out.push([c.id, known.g]);
        continue;
      }
      if (!st || !reach || !named) continue;
      const g = judgeRoomClaim(st.rs, st.base.length, st.full, { id: c.id, p: c.p, n: c.n });
      verdicts.set(c.id, { to: from, i: body.seq, bg: st.bg, p: c.p, g }, now);
      out.push([c.id, g]);
    }
    if (!out.length) return true;
    if (st) { st.dirty = true; if (open !== st) composeOwn(st); }
    sayVerdicts(from, data.k ?? net()?.room?.() ?? null, data.i, st, out);
    return true;
  }
  function sayVerdicts(to, k, i, st, out) {
    const now = _now();
    const entries = out.map(([id]) => verdicts.get(id, now)).filter(Boolean);
    for (const e of entries) { e.inFlight++; e.flightAt = now; }
    const done = () => { for (const e of entries) if (e.inFlight > 0) e.inFlight--; };
    hit(verdictFrame(to, k, i, st ? digestOf(st) : null, out), { sent: done, dropped: done });
  }

  function legacyTake(from, data) {
    const f = h.ownBody(data.i | 0);
    if (!f || !f.corpse) return true;
    const asker = peerCandidate(from);
    const body = bodyPos(f);
    if (!asker || !body || dist(asker.feet, body) > h.takeRange) return true;
    const o = ownerOf(from);
    const budget = tokenGate(o.takes ?? null, _now(), TAKES_PER_S);
    o.takes = budget.bucket;
    if (!budget.pass) return true;
    grantCorpse(f, from, data.k ?? net()?.room?.() ?? null);
    return true;
  }
  function grantCorpse(f, to, k) {
    const st = ownState(f);
    if (!st) return;
    ownTick(st);

    const present = [];
    for (let p = 0; p < st.base.length; p++) if (!st.rs.taken.has(p)) present.push({ p, left: st.rs.counts.get(p) ?? (Number.isInteger(st.full[p]) ? st.full[p] : 1) });
    let n = present.length;
    while (n > 0) {
      if (n > LOOT_LIST_MAX) { n = n >> 1; continue; }
      const grant = present.slice(0, n).map(({ p, left }) => (Number.isInteger(st.full[p]) ? { ...st.records[p], stackCount: left } : st.records[p]));
      const frame = { to, k, i: f.seq, grant, n: h.foesSeq() };
      if (JSON.stringify({ t: 'hit', data: frame }).length > GRANT_FRAME_MAX) { n = n >> 1; continue; }
      const legacy = `legacy:${to}:${++legacyN}`;
      // Reserve the places when the frame is accepted, so no second asker gets them; dropped puts them back.
      const held = present.slice(0, n).map(({ p, left }) => {
        judgeRoomClaim(st.rs, st.base.length, st.full, { id: `${legacy}:${p}`, p, n: left });
        return Number.isInteger(st.full[p]) ? { ...st.base[p], stackCount: left } : { ...st.base[p] };
      });
      st.dirty = true;
      if (open !== st) composeOwn(st);
      const granted = { to, held, at: _now() };
      st.granted = granted;
      const back = () => { if (st.granted === granted) st.granted = null; restoreHeld(st, held); };
      if (!net()?.onPeerHit) { back(); return; }
      net().onPeerHit(frame, { dropped: back });
      return;
    }
    net()?.onPeerHit?.({ to, k, i: f.seq, grant: [], n: h.foesSeq() });
  }
  function legacyBack(from, data) {
    const f = foes.find((x) => !x.puppet && x.seq === (data.i | 0));
    const st = f ? owned.get(f) : null;
    const g = st?.granted;
    if (!g || g.to !== from || _now() - g.at > GRANT_BACK_MS) return false;
    st.granted = null;
    restoreHeld(st, g.held);
    return true;
  }

  const readerOf = (f) => readers.get(keyOf(f.puppet, f.seq)) ?? null;
  const containerOf = (rb) => `${rb.owner}:${rb.seq}#${rb.digest.g}`;
  const stateOf = (rb) => (rb.state ??= bodyStateOf(rb.digest, rb.items));
  const touch = (rb) => { rb.state = null; rb.dirty = true; };

  function hear(from, k, entries) {
    for (const e of entries.slice(0, CELL_FRAME_RECORDS_MAX)) {
      const v = validDigestEntry(e);
      if (!v) continue;
      const key = keyOf(from, v.i);
      let rb = readers.get(key);
      if (rb && rb.digest.g !== v.digest.g) { dropReader(rb); rb = undefined; }
      if (!rb) {
        rb = { owner: from, seq: v.i, k: null, digest: v.digest, items: [], full: [], peekAt: null, view: [], seen: new Map(), dirty: true, state: null, composedAt: -Infinity, laid: new Set() };
        readers.set(key, rb);
        while (readers.size > READERS_MAX) { const old = [...readers.values()].find((x) => x !== open); if (!old) break; dropReader(old); }
      } else if (mergeDigest(rb.digest, v.digest)) touch(rb);
      if (typeof k === 'string') rb.k = k;
    }
  }
  function dropReader(rb) {
    if (readers.get(keyOf(rb.owner, rb.seq)) === rb) readers.delete(keyOf(rb.owner, rb.seq));
    if (open === rb) open = null;
  }

  function composeView(rb) {
    const L = rb.digest.l;
    const live = [];
    for (let p = 0; p < L; p++) { const it = rb.items[p]; if (!placeGone(rb.digest, p) && it && it !== BAD && it !== HIDDEN) live.push(it); }
    const shown = new Set(notCarried(live) ?? live);
    const st = { taken: new Set(), counts: new Map(rb.digest.c), stored: [], ids: [], answers: new Map(), claims: new Map() };
    const base = [], full = [];
    for (let p = 0; p < L; p++) {
      const it = rb.items[p];
      const real = it && it !== BAD && it !== HIDDEN;
      base.push(real ? it : { stackCount: 1 });
      full.push(real ? rb.full[p] : null);
      if (placeGone(rb.digest, p) || !real || !shown.has(it)) st.taken.add(p);
    }
    const { list, seen } = composeRoomView(base, full, st, [], ledger.pending(containerOf(rb)));
    rb.view.length = 0; rb.view.push(...list);
    rb.seen = seen; rb.dirty = false; rb.composedAt = _now();
    const f = h.puppetOf(rb.owner, rb.seq);
    if (f && f.entity && f.corpse) f.entity.items = rb.view;
  }

  function settleReader(rb, claim = true) {
    const { takes, grows, puts } = listMovesSince(rb.seen, rb.view, () => false);
    for (const g of grows) { const laid = { ...g.obj, stackCount: g.by }; g.obj.stackCount -= g.by; g.info.n -= g.by; rb.view.push(laid); rb.laid.add(laid); }
    for (const obj of puts) rb.laid.add(obj);
    if (takes.length && !claim) for (const m of takes) liftPiece(playerEntity, m.obj, m.k);
    else if (takes.length) {
      const now = _now();
      const claims = takes.map(({ obj, info, k }) => ledger.take(containerOf(rb), { p: info.p }, obj, k, { by: rb.owner, owner: rb.owner, seq: rb.seq, k: rb.k, g: rb.digest.g }, now));
      rb.dirty = true;
      sendClaims(claims);
    }
    if (rb.laid.size && open !== rb) handBack(rb);
  }
  function handBack(rb) {
    for (const piece of rb.laid) {
      const at = rb.view.indexOf(piece);
      if (at < 0) continue;
      rb.view.splice(at, 1);
      if (ledger.open().some((c) => c.item === piece)) continue;
      if (isGoldPieces(piece)) addGoldPieces(playerEntity, pieceCount(piece));
      else addItem((playerEntity.items ??= []), piece);
    }
    rb.laid.clear();
    rb.dirty = true;
  }
  function ensureView(rb) {
    if (open === rb || stateOf(rb) !== 'born') return;
    settleReader(rb);
    // Settle before composing, never after: a take composed away is lost.
    if (rb.dirty || _now() - rb.composedAt > VIEW_REFRESH_MS) composeView(rb);
  }

  function sendClaims(claims) {
    const by = new Map();
    for (const c of claims) { const key = `${c.meta.owner}|${c.meta.seq}|${c.meta.k}|${c.meta.g}`; (by.get(key) ?? by.set(key, []).get(key)).push(c); }
    for (const list of by.values()) {
      const { owner, seq, k, g } = list[0].meta;
      for (let a = 0; a < list.length; a += ROOM_CLAIMS_MAX) hit(claimsFrame(owner, k ?? h.ownerKey(owner), seq, g, list.slice(a, a + ROOM_CLAIMS_MAX)));
    }
  }

  function readerAnswer(from, data) {
    const rb = readers.get(keyOf(from, data.i | 0));
    if (!rb || rb.peekAt == null) return false;
    const dg = validDigest(data.bw), recs = validRecords(data.br);
    if (!dg || !recs || dg.g !== rb.digest.g) return false;
    mergeDigest(rb.digest, dg);
    for (const [p, rec] of recs) {
      if (p >= rb.digest.l || rb.items[p] !== undefined) continue;
      const piece = readRecord(rec);
      rb.items[p] = piece;
      rb.full[p] = piece !== BAD && piece !== HIDDEN && Number.isInteger(piece.stackCount) ? piece.stackCount : null;
    }
    rb.peekAt = null;
    touch(rb);
    return true;
  }
  function readerVerdict(from, data) {
    const vs = validVerdicts(data.bv);
    if (!vs) return false;
    let did = false;
    for (const v of vs) {
      const c = ledger.resolve(v.id, v.g, { from, withdrawn: v.withdrawn });
      if (!c) continue;
      did = true;
      const rb = readers.get(keyOf(c.meta.owner, c.meta.seq));
      if (rb) touch(rb);
    }
    if (did && data.bw !== undefined) {
      const rb = readers.get(keyOf(from, data.i | 0)), dg = validDigest(data.bw);
      if (rb && dg && dg.g === rb.digest.g && mergeDigest(rb.digest, dg)) touch(rb);
    }
    if (did) for (const rb of readers.values()) if (rb.dirty) ensureView(rb);
    return did;
  }

  function isTarget(f) {
    if (!((f._pup?.o | 0) > 0)) return false;
    const rb = readerOf(f);
    const s = rb ? stateOf(rb) : 'legacy';
    if (s === 'unborn') return false;
    if (s !== 'born') return true;
    ensureView(rb);
    return rb.view.length > 0;
  }
  function named(f, word) {
    const rb = readerOf(f);
    const s = rb ? stateOf(rb) : 'legacy';
    return s === 'legacy' || s === 'unreadable' ? { ...word, unlisted: true } : word;
  }
  function contents(f) {
    const rb = readerOf(f);
    if (!rb || stateOf(rb) !== 'born') return null;
    ensureView(rb);
    if (f.entity.items !== rb.view) f.entity.items = rb.view;
    return corpseContents(f);
  }
  function pileBody(f) {
    if (!f || f.corpseDisabled || !isTarget(f)) return null;
    const rb = readerOf(f);
    if (!rb || stateOf(rb) !== 'born') return null;
    return { name: corpseEntityName(f.mobileType) ?? 'Body', count: rb.view.length };
  }

  function takePuppet(f, say2, openWindow) {
    const rb = readerOf(f);
    const s = rb ? stateOf(rb) : 'legacy';
    if (s === 'unreadable') { say2(LOOT_NEWER_TAKE_TEXT); return 0; }
    if (s === 'unborn') return 0;
    if (s === 'legacy') return askLegacy(f, say2);
    ensureView(rb);
    f.entity.items = rb.view;
    f.corpseDisabled = false;
    const door = typeof openWindow === 'function' ? (hooks) => openWindow({
      ...hooks,
      opened: () => { open = rb; },
      closed: () => {
        if (open === rb) open = null;
        if (readers.get(keyOf(rb.owner, rb.seq)) !== rb) { settleReader(rb, false); handBack(rb); return; }
        settleReader(rb);
        handBack(rb);
        if (stateOf(rb) === 'born') composeView(rb);
      },
    }) : openWindow;
    const r = openCorpseLoot(f, { playerEntity, say: say2, openWindow: door });
    if (readers.get(keyOf(rb.owner, rb.seq)) === rb && open !== rb) ensureView(rb);
    return r;
  }
  function askLegacy(f, say2) {
    if (!f._pup?.o || f.corpseDisabled) { f.corpseDisabled = true; say2(localizedText('theBodyHasNoTreasure', 'The body has no treasure.')); return 0; }
    const key = keyOf(f.puppet, f.seq);
    if (ledger.askedWithin(key, _now(), TAKE_WINDOW_MS)) return 0;
    // Latch the ask only when the frame leaves; a queued frame has not left yet.
    hit({ to: f.puppet, k: h.ownerKey(f.puppet), i: f.seq, take: 1 }, { sent: () => { ledger.ask(key, _now()); } });
    return 0;
  }

  function legacyGrant(from, data) {
    const key = keyOf(from, data.i | 0);
    const f = h.puppetOf(from, data.i | 0);
    const grant = notCarried(peerHanded(validLootList(data.grant)));
    if (!grant) {
      if (ledger.landAsk(key, _now(), LEGACY_ASK_KEEP_MS)) { hit({ to: from, k: data.k ?? net()?.room?.() ?? null, i: data.i | 0, back: 1 }); tell(LOOT_NEWER_TAKE_TEXT); }
      return false;
    }
    // An unasked grant, or a second one for the same ask, is refused whole.
    if (!ledger.landAsk(key, _now(), LEGACY_ASK_KEEP_MS)) return false;
    const arrows = arrowsOnly(grant);
    const n = takeCorpseLoot({ entity: { items: grant } }, playerEntity, h.say ?? (() => {}));
    if (f) {
      if (n > 0) playRareDrop(audio, f.corpseMarker?.pos ?? f.ai?.feet ?? null, grant);
      if (n > 0 && !arrows) silverFindAt('corpse', f);
      if (f._pup) f._pup.o = 0;
      if (n === 0) { f.corpseDisabled = true; f._closedN = Number.isInteger(data.n) ? data.n : (h.ownerRecord(from)?.n ?? -1); }
    }
    return true;
  }

  function update(playerFeet) {
    if (!online()) return;
    const now = _now();
    for (const f of foes) {
      if (f.puppet || !f.corpse) continue;
      const st = owned.get(f);
      if (st) ownTick(st);
    }
    for (const rb of [...readers.values()]) {
      const f = h.puppetOf(rb.owner, rb.seq);
      if (!f || !f.corpse) continue;
      const s = stateOf(rb);
      // A body that turned unborn or unreadable under an open window still claims what the window took from it.
      if (s !== 'born') settleReader(rb);
      if (s === 'unborn') {
        const at = bodyPos(f);
        if (at && playerFeet && dist(playerFeet, at) <= BODY_PEEK_REACH && (rb.peekAt == null || now - rb.peekAt >= PEEK_RETRY_MS)) {
          const places = placesLacking(rb.digest, rb.items);
          if (places.length) { rb.peekAt = now; hit(peekFrame(rb.owner, rb.k ?? h.ownerKey(rb.owner), rb.seq, places)); }
        }
      } else if (s === 'born') {
        settleReader(rb);
        if (open !== rb && f.entity.items !== rb.view) f.entity.items = rb.view;
        if (rb.dirty && open !== rb) composeView(rb);
      }
    }
    if (!ledger.size) return;
    const { lapsed, resay } = ledger.due(now);
    for (const c of lapsed) { const rb = readers.get(keyOf(c.meta.owner, c.meta.seq)); if (rb) touch(rb); }
    if (resay.length) sendClaims(resay.filter((c) => h.ownerRecord(c.meta.owner) != null));
  }

  function applyHit(from, data) {
    if (Array.isArray(data.bp)) return ownerPeek(from, data);
    if (Array.isArray(data.bq)) return ownerClaims(from, data);
    if (Array.isArray(data.bv)) return readerVerdict(from, data);
    if (Array.isArray(data.br)) return readerAnswer(from, data);
    if (data.take === 1) return legacyTake(from, data);
    if (data.back === 1) return legacyBack(from, data);
    if (data.grant !== undefined) return legacyGrant(from, data);
    return undefined;
  }

  function windowFor(f, openWindow) {
    if (!f || f.puppet || !f.corpse || !online()) return openWindow;
    const st = ownState(f);
    if (!st) return openWindow;
    ownTick(st);
    return ownWindow(st, openWindow);
  }
  function afterTake(f) {
    const st = f && !f.puppet && online() ? owned.get(f) : null;
    if (st && open !== st) ownTick(st);
  }

  function placesLeft(f) {
    if (f?.corpseDisabled) return 0;
    const st = online() ? ownState(f) : null;
    if (!st) return Math.min(255, peerHanded(f.entity?.items ?? []).length);
    ownTick(st);
    return presentCount(st);
  }
  const keyFor = (f) => { const st = f.corpse && !f.puppet ? owned.get(f) : null; return st ? digestKey(digestOf(st)) : ''; };
  function frameDigests(out, srcOf) {
    const bw = [];
    for (const r of out) {
      if (r.d !== 1 || !(r.o > 0)) continue;
      const f = srcOf(r), st = f && !f.puppet ? owned.get(f) : null;
      if (st) bw.push(digestEntry(r.i, digestOf(st)));
    }
    return bw;
  }

  function forgetPuppet(f) {
    const key = keyOf(f.puppet, f.seq);
    if (!h.puppetOf(f.puppet, f.seq)) { const rb = readers.get(key); if (rb) dropReader(rb); }
    if (open && (open.f === f || (open.owner === f.puppet && open.seq === f.seq))) open = null;
  }
  function clearAll() {
    const n = net();
    const held = (k) => !!n && k != null && (k === n.room?.() || !!n.inRoom?.(k));
    ledger.keep((c) => !held(c.meta.k), _now());
    readers.clear();
    open = null;
  }
  function prune(alive) {
    for (const rb of [...readers.values()]) if (!alive.has(rb.owner)) dropReader(rb);
  }
  function destroy() {
    ledger.keep(() => true, _now());
    ledger.clear();
    readers.clear();
    verdicts.clear();
    owned = new WeakMap();
    open = null;
  }

  return { applyHit, hear, update, takePuppet, windowFor, afterTake, isTarget, named, contents, pileBody, placesLeft, keyFor, frameDigests, forgetPuppet, clearAll, prune, destroy };
}
