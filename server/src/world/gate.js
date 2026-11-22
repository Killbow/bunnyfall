// The gate fight and the courts of a night: admission, the fight, its book, seats, and falls.
// It fans and saves the fight, runs its tick, tells the hub, and holds the receipts owed.
import { isGateBook, courtsJoined, bookNew, courtOk, courtCounts, GATE_COURT_FIGHTERS, placeSeat, nightDone, bookNextAt, riteOnly, nightWord, courtFell, GATE_MATES_KEEP_MS } from '../../../src/net/gateCourts.js';
import { gatePortentsOf, gateDayOfRoom, gateHolds, gateCourtOfRoom, gateAdmits, gateTimes, gateBossOf, gateModsOf, gateTitheOf, GATE_COLLAPSE_MS, gateRoomKey } from '../../../src/net/gateLaw.js';
import { COURT_CENTRE, CHECKPOINT_MS, BRAIN_TICK_MS, GATE_FIGHTERS_MAX, COURT_WATCH_ASK_MS, hasPart, applyHeal, healRef, applyCrystalHit, applyHostHit, earnedBy, receiptPortents } from '../../../src/net/gateBrain.js';
import { GATE_BRAIN_MIN, GATE_TELL_RETRY_MS, RITE_ASK_TIMEOUT_MS, SOCKETS_MAX, mapPixelOfWire, SOCIAL_ROOM, GATE_INTERNAL_FELL, GATE_INTERNAL_SEAT, GATE_INTERNAL_COURT, GATE_INTERNAL_PARTY, PARTY_MAX, gateReceiptKey, validGateOut, GATE_HERE_HOLD_MS } from '../relay.js';
import { GATE_SEAM } from '../../../src/net/bossSeam.js';
import { bodySaid, bodyHealed, bodyOut, bodyCensus } from '../../../src/net/bossBody.js';
import { rand01, rand32 } from '../room/dice.js';
import { mintReceipt, importReceiptKey, RECEIPT_TTL_S, readReceipt } from '../../../src/net/gateReceipt.js';
import { watchDue, watchPixelOk, mintWatchReceipt } from '../../../src/net/watchReceipt.js';
import { ROOM_CALL_MS, Bounded, HUB_KEEP_MAX } from '../relayScale.js';
import { isStaff } from '../../../src/net/staffCommands.js';
import { json } from '../room/json.js';

export class GatePart {
  async _gateFightOf() {
    if (this._fight === undefined) {
      const got = await this.state.storage.get(['gatefight', 'gatebook']);
      const v = got.get('gatefight');
      this._fight = v && typeof v === 'object' ? v : null;
      if (this._gateBook === undefined) { const b = got.get('gatebook'); this._gateBook = isGateBook(b) ? b : null; }
      if (this._fight && !('pt' in this._fight) && !this._fight.fell && !this._fight.wrath && gatePortentsOf(this._fight.day)) { this._fight = null; await this.state.storage.delete('gatefight'); }
    }
    return this._fight;
  }
  async _gateAdmit(key, sub, now) {
    const day = gateDayOfRoom(key);
    if (!gateHolds(day, now)) return 'the gate is closed';
    const f = await this._gateFightOf();
    if (f?.players[sub]) return null;
    if (gateCourtOfRoom(key) === 0 && (gateAdmits(day, now) || (await this._gateBookOf())?.s[sub])) return null;
    if (f?.fell || f?.wrath) return 'the gate is closing';
    return gateAdmits(day, now) ? null : 'the gate is sealed';
  }
  _courtOf(p) { return { x: p.x - COURT_CENTRE[0], z: p.z - COURT_CENTRE[2] }; }
  _gateBodies(f) {
    const newest = new Map();
    for (const [ws, b] of this._courtSockets()) {
      if (!b.id || !b.sub || !b.pose || !f.players[b.sub]) continue;
      const had = newest.get(b.sub);
      if (!had || (b.since ?? 0) >= (had[1].since ?? 0)) newest.set(b.sub, [ws, b]);
    }
    return [...newest.values()].map(([ws, b]) => { const c = this._courtOf(b.pose); return { sub: b.sub, id: b.id, x: c.x, z: c.z, dead: !!b.pose.dd, tr: this._trailOf(ws, (p) => this._courtOf(p)) }; });
  }
  _gateFan(frames) {
    if (!frames.length) return;
    if (frames.some((fr) => fr.to != null)) {
      for (const fr of frames) if (fr.to != null) { const { to, ...word } = fr; const s = JSON.stringify({ t: 'gate', ...word }); for (const [ws, b] of [...this._courtSockets()]) if (b.sub === to) this._send(ws, s); }
      frames = frames.filter((fr) => fr.to == null);
      if (!frames.length) return;
    }
    const outs = frames.map((fr) => JSON.stringify({ t: 'gate', ...fr }));
    this._fanFrames(outs, (b) => b.id);
    if (this._cper.size) for (const s of outs) this._courtSendAll(s);
  }
  async _gateFanKept(f, frames, now) {
    if (frames.some((fr) => fr.to != null)) await this._gateSave(f, now, true);
    this._gateFan(frames);
  }
  async _gateSave(f, now, force) {
    if (!force && now - this._fightSavedAt < CHECKPOINT_MS) return;
    this._fightSavedAt = now;
    await this.state.storage.put('gatefight', f);
  }
  async _gateArm(now) {
    const at = await this.state.storage.getAlarm();
    if (at == null || at > now + BRAIN_TICK_MS) await this.state.storage.setAlarm(now + BRAIN_TICK_MS);
  }
  async _gateFrame(ws, a, m, now) {
    const day = gateDayOfRoom(a.key);
    let f = await this._gateFightOf();
    if (m.k === 'in') {
      if (!(m.bv >= GATE_BRAIN_MIN)) { this._send(ws, JSON.stringify({ t: 'gate', k: 'no', m: 'the gate is closed' })); return; }
      if (!f?.players[a.sub] && await this._gateSentOn(ws, a, f, now)) return;
      f = this._fight;
      if (!f) { f = this._fight = GATE_SEAM.new({ day, now, wrathAt: gateTimes(day).wrathAt, boss: gateBossOf(day).id, md: gateModsOf(day), pt: gatePortentsOf(day), ti: gateTitheOf(day) }); f.cn = gateCourtOfRoom(a.key); }
      const joined = !f.players[a.sub];
      const full = joined && Object.keys(f.players).length >= GATE_FIGHTERS_MAX;
      const asked = (this._watchAsked ??= new WeakMap());
      if (full && now - (asked.get(ws) ?? -Infinity) < COURT_WATCH_ASK_MS - BRAIN_TICK_MS) { this._send(ws, JSON.stringify({ t: 'gate', k: 'no', m: 'the court is full' })); return; }
      const present = new Set();
      if (full && Object.values(f.players).some((p) => !hasPart(p))) for (const [, b] of this._courtSockets()) if (b.id && b.sub) present.add(b.sub);
      if (!GATE_SEAM.join(f, a.sub, a.name ?? '', m.lv, now, present, { admits: gateAdmits(day, now) })) {
        const no = f.fell || f.wrath ? 'the gate is closing' : Object.keys(f.players).length >= GATE_FIGHTERS_MAX ? 'the court is full' : 'the gate is sealed';
        if (no === 'the court is full') { asked.set(ws, now); this._send(ws, JSON.stringify({ t: 'gate', ...GATE_SEAM.stateOf(f) })); }
        this._send(ws, JSON.stringify({ t: 'gate', k: 'no', m: no }));
        return;
      }
      this._send(ws, JSON.stringify({ t: 'gate', ...GATE_SEAM.stateOf(f), me: 1 }));
      this._trailSeed(ws, a, now);
      const r = f.rc?.[a.sub];
      if (r) this._send(ws, JSON.stringify({ t: 'gate', k: 'rcpt', r }));
      if (joined) await this._gateSave(f, now, true);
      if (!f.fell && !f.wrath) await this._gateArm(now);
      return;
    }
    const line = this._bodyLine();
    // Keep `vt` above the junk check: a body frame from a non-fighter is ignored,
    // since its `in` frame may still be in flight.
    if (m.k === 'vt') { if (f?.players[a.sub]) bodySaid(f.players[a.sub], m.v / 1000, now, line.body, { enforce: line.enforce }); return; }
    if (!f || !f.players[a.sub]) { this._junk(ws); return; }
    if (m.k === 'heal') {
      const pose = a.pose ? this._courtOf(a.pose) : null;
      const me = f.players[a.sub];
      for (const [by, n] of m.h) {
        const healer = this._courtIdFirst(by)?.[1]?.sub ?? null;
        const got = healer ? applyHeal(f, a.sub, healer, n, pose, now) : 0;
        if (got > 0) bodyHealed(me, got / healRef(me.lv), now, line.body, { enforce: line.enforce });
      }
      return;
    }
    const at = a.pose && !a.pose.dd && !bodyOut(f.players[a.sub], line.enforce) ? this._courtOf(a.pose) : null;
    if (m.k === 'xhit') this._gateFan(applyCrystalHit(f, a.sub, m.c, m.d, m.r, at, now, m.q));
    else if (m.k === 'ahit') await this._gateFanKept(f, applyHostHit(f, a.sub, m.i, m.d, m.r, at, now, m.q, rand01), now);
    else {
      GATE_SEAM.hit(f, a.sub, m.d, m.r, at, now, m.q, m.b === 1 ? { b: 1 } : undefined);
      if (f.fell && !f.said) { await this._gateFall(f, now); return; }
    }
    if (!f.fell && !f.wrath && !(this._beatArmedTo > now)) { this._beatArmedTo = now + BRAIN_TICK_MS; await this._gateArm(now); }
  }
  async _gateTick() {
    const f = await this._gateFightOf();
    if (!f) return this._gateBookTick();
    const now = Date.now();
    void this._relayCfgFresh(now);
    const end = gateTimes(f.day).wrathAt + GATE_COLLAPSE_MS;
    if (now >= end) { this._fight = null; await this.state.storage.delete('gatefight'); await this._gateBookDrop(); return true; }
    try {
      const line = this._bodyLine(), bodies = this._gateBodies(f), census = () => bodyCensus(f, bodies, now, line.body, line.enforce);
      await this._bodyCount('gate', f, GATE_SEAM.judge(f, census(), now), now, line.body);
      this._bodyTell('gate', f, now);
      await this._gateFanKept(f, GATE_SEAM.step(f, now, this._bodiesBare(census()), rand01), now);
      this._riteAskAhead(f, now);
      if (f.fell && !f.said) await this._gateFall(f, now);
      else if (f.said && !f.told) await this._gateTellHubOnce(f, now);
      if (f.fell && !f.booked) await this._gateTellBookOnce(f, now);
      await this._gateBookBeat(now);
      await this._gateSave(f, now, false);
    } catch (e) { console.warn('[gate] beat failed', e?.message ?? e); }
    const here = [...this._courtSockets()].some(([, b]) => b.id);
    await this.state.storage.setAlarm(Math.min((f.said && !f.told) || (f.fell && !f.booked) ? now + GATE_TELL_RETRY_MS : here && !f.fell && !f.wrath ? now + BRAIN_TICK_MS : end, await this._gateBookDue(now)));
    return true;
  }
  async _gateFall(f, now) {
    // Run one fall at a time: its awaits let blows and beats in, and each would fell the boss again
    // on new seeds.
    if (this._falling) return this._falling;
    this._falling = this._gateFallOnce(f, now).finally(() => { this._falling = null; });
    return this._falling;
  }
  async _gateFallOnce(f, now) {
    if (f.said) return;
    // Tell the book before any await, so no newcomer is seated after the kill; await it last,
    // so a slow first court never delays this kill.
    const booking = this._gateTellBookOnce(f, now).catch((e) => console.warn('[gate] book', e?.message ?? e));
    const key = await this._receiptKeyOf();
    const nowS = Math.floor(now / 1000);
    const asked = await this._riteHelpersOf(f.day, RITE_ASK_TIMEOUT_MS);
    if (asked) f.helped = [...asked];
    const helped = new Set(f.helped ?? []);
    f.rc = {};
    for (const sub of Object.keys(f.players)) {
      if (!GATE_SEAM.earned(f, sub)) continue;
      try { f.rc[sub] = await mintReceipt({ d: f.day, b: f.boss, s: sub, c: rand32(), x: earnedBy(f, sub), l: f.players[sub].lv, ...(helped.has(sub) ? { r: 1 } : {}), ...this._bodyMeasureOf(f, sub, GATE_SEAM.earned), ...(receiptPortents(f) ? { p: receiptPortents(f) } : {}) }, key, { subtle: crypto.subtle, nowS }); }
      catch (e) { console.warn('[gate] receipt refused', e?.message ?? e); }
    }
    f.said = true;
    f.here = [...new Set([...this._courtSockets()].filter(([, b]) => b.id && b.sub && f.rc[b.sub]).map(([, b]) => b.sub))].slice(0, GATE_FIGHTERS_MAX);
    // Save the receipts and `said` before fanning the fall; if the fall goes out first,
    // an eviction revives the boss and mints every receipt again on new seeds.
    await this._gateSave(f, now, true);
    this._gateFan([{ k: 'fell', at: f.fell.at, top: f.fell.top, n: f.fell.n, ...(f.fell.dm ? { dm: f.fell.dm } : {}) }]);
    for (const [ws, b] of [...this._courtSockets()]) { const r = b.id && b.sub ? f.rc[b.sub] : null; if (r) this._send(ws, JSON.stringify({ t: 'gate', k: 'rcpt', r })); }
    await this._gateTellHubOnce(f, now);
    await booking;
  }
  async _gateTellHubOnce(f, now) {
    if (f.told || !f.fell) return;
    const cn = f.cn ?? 0, cs = cn === 0 ? courtsJoined((await this._gateBookOf()) ?? bookNew(f.day)).size : 0;
    if (!(await this._gateTellHub({ d: f.day, c: cn, ...(cs ? { cs } : {}), at: f.fell.at, top: f.fell.top, n: f.fell.n, rc: Object.entries(f.rc ?? {}), here: f.here ?? [] }))) return;
    f.told = true;
    await this._gateSave(f, now, true);
  }
  async _watchTick(ws, sub, p, moved, now) {
    let w = this._watch.get(sub);
    if (!w) {
      if (this._watch.size >= SOCKETS_MAX) this._watch.delete(this._watch.keys().next().value);
      this._watch.set(sub, (w = { at: -Infinity, moved: -Infinity }));
    } else { this._watch.delete(sub); this._watch.set(sub, w); }
    if (moved) w.moved = now;
    if (!watchDue(w, now)) return;
    const [x, y] = mapPixelOfWire(p.x, p.z);
    if (!watchPixelOk(x, y)) return;
    w.at = now;
    let r;
    try { r = await mintWatchReceipt({ s: sub, x, y, c: rand32() }, await this._receiptKeyOf(), { subtle: crypto.subtle, nowS: Math.floor(now / 1000) }); } catch { return; }
    this._send(ws, JSON.stringify({ t: 'watch', r }));
  }
  async _receiptKeyOf() {
    if (this._receiptKey === undefined) {
      this._receiptKey = await importReceiptKey(this.env.GATE_SIGNING_KEY, { subtle: crypto.subtle });
      if (!this._receiptKey && this.env.GATE_SIGNING_KEY) console.warn('[gate] GATE_SIGNING_KEY will not import - the receipts go out unsigned');
    }
    return this._receiptKey;
  }
  async _gateTellHub(body) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return true;
    try { const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${GATE_INTERNAL_FELL}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ROOM_CALL_MS) })); return !!res?.ok; }
    catch (e) { console.warn('[gate] hub', e?.message ?? e); return false; }
  }
  async _gateSentOn(ws, a, f, now) {
    if (isStaff(a.glyphs)) return false;
    const day = gateDayOfRoom(a.key), here = gateCourtOfRoom(a.key);
    const asked = (this._watchAsked ??= new WeakMap()), went = (this._goSaid ??= new WeakMap());
    if (now - (asked.get(ws) ?? -Infinity) < COURT_WATCH_ASK_MS - BRAIN_TICK_MS) { this._send(ws, JSON.stringify({ t: 'gate', k: 'no', m: 'the court is full' })); return true; }
    const sent = went.get(ws);
    if (sent && now - sent.at < COURT_WATCH_ASK_MS - BRAIN_TICK_MS) { this._send(ws, JSON.stringify({ t: 'gate', k: 'go', d: day, c: sent.c })); return true; }
    const c = await this._gateSeatOf(day, a.sub, here, now, !(f?.fell || f?.wrath) && gateAdmits(day, now));
    if (c === here) return false;
    if (c != null) { went.set(ws, { c, at: now }); this._send(ws, JSON.stringify({ t: 'gate', k: 'go', d: day, c })); return true; }
    const no = gateAdmits(day, now) ? 'the court is full' : f?.fell || f?.wrath ? 'the gate is closing' : 'the gate is sealed';
    if (no === 'the court is full') { asked.set(ws, now); if (f && !f.fell && !f.wrath) this._send(ws, JSON.stringify({ t: 'gate', ...GATE_SEAM.stateOf(f) })); }
    this._send(ws, JSON.stringify({ t: 'gate', k: 'no', m: no }));
    return true;
  }
  async _gateSeatOf(day, sub, asked, now, can = false) {
    if (asked === 0) return this._gateSeatHere(day, sub, asked, now, can);
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return asked;
    try {
      const res = await rooms.get(rooms.idFromName(gateRoomKey(day))).fetch(new Request(`https://relay.internal${GATE_INTERNAL_SEAT}`, { method: 'POST', body: JSON.stringify({ d: day, s: sub, c: asked, j: can ? 1 : 0 }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
      const body = res?.ok ? await res.json() : null;
      return courtOk(body?.c) ? body.c : null;
    } catch (e) { console.warn('[gate] seat', e?.message ?? e); return null; }
  }
  async _gateSeatHere(day, sub, asked, now, can = false) {
    const book = await this._gateBookOf(day, true), admits = gateAdmits(day, now);
    const many = !book.s[sub] && admits && courtCounts(book, now).some((n, c) => (c > 0 ? n > 0 : n >= GATE_COURT_FIGHTERS));
    const mates = many ? await this._gateMatesOf(sub, now) : [];
    const was = `${Object.keys(book.s).length}|${book.s[sub] ?? ''}`;
    const c = placeSeat(book, sub, { asked, now, admits, can, mates });
    if (`${Object.keys(book.s).length}|${book.s[sub] ?? ''}` !== was) await this._gateBookSave(book);
    await this._gateBookArm(now);
    return c;
  }
  async _gateBookOf(day = null, make = false) {
    if (this._gateBook === undefined) { const v = await this.state.storage.get('gatebook'); this._gateBook = isGateBook(v) ? v : null; }
    if (!this._gateBook && make && Number.isSafeInteger(day)) this._gateBook = bookNew(day);
    return this._gateBook;
  }
  async _gateBookSave(book) { await this.state.storage.put('gatebook', book); }
  async _gateBookDrop() { this._gateBook = null; await this.state.storage.delete('gatebook'); }
  async _gateBookDue(now) {
    const book = await this._gateBookOf();
    if (!book) return Infinity;
    const t = gateTimes(book.d);
    if (book.end ? !book.told : nightDone(book, now, t)) return now + GATE_TELL_RETRY_MS;
    return bookNextAt(book, t, now) ?? Infinity;
  }
  async _gateBookArm(now) {
    const due = await this._gateBookDue(now);
    if (!Number.isFinite(due)) return;
    const had = await this.state.storage.getAlarm();
    if (had == null || had > due) await this.state.storage.setAlarm(due);
  }
  async _gateBookTick() {
    const book = await this._gateBookOf();
    if (!book) return false;
    const now = Date.now(), end = gateTimes(book.d).wrathAt + GATE_COLLAPSE_MS;
    if (now >= end) { await this._gateBookDrop(); return true; }
    await this._gateBookBeat(now);
    const due = await this._gateBookDue(now);
    await this.state.storage.setAlarm(Number.isFinite(due) ? due : end);
    return true;
  }
  async _gateBookBeat(now) {
    const book = await this._gateBookOf();
    if (!book) return;
    if (!book.end && nightDone(book, now, gateTimes(book.d))) {
      const helped = await this._riteHelpersOf(book.d, RITE_ASK_TIMEOUT_MS);
      if (!helped) return;
      const key = await this._receiptKeyOf(), nowS = Math.floor(now / 1000), boss = gateBossOf(book.d).id;
      book.rc = [];
      for (const sub of riteOnly(book, helped)) {
        try { book.rc.push([sub, await mintReceipt({ d: book.d, b: boss, s: sub, c: rand32(), x: 'rite' }, key, { subtle: crypto.subtle, nowS })]); }
        catch (e) { console.warn('[rite] receipt refused', e?.message ?? e); }
      }
      book.end = now;
      await this._gateBookSave(book);
    }
    if (book.end && !book.told && await this._gateTellHub({ d: book.d, night: 1, ...nightWord(book, book.end), rc: book.rc ?? [], here: [] })) {
      book.told = 1;
      await this._gateBookSave(book);
    }
  }
  async _gateTellBookOnce(f, now) {
    if (f.booked || !f.fell) return;
    const fall = { at: f.fell.at, top: f.fell.top ?? [], n: f.fell.n ?? 0, rs: Object.keys(f.players).filter((sub) => GATE_SEAM.earned(f, sub)) }, cn = f.cn ?? 0;
    if (cn === 0) courtFell(await this._gateBookOf(f.day, true), 0, fall);
    if (cn === 0) await this._gateBookSave(this._gateBook);
    else {
      const rooms = this.env?.ROOMS;
      if (rooms?.idFromName && rooms?.get) {
        try { const res = await rooms.get(rooms.idFromName(gateRoomKey(f.day))).fetch(new Request(`https://relay.internal${GATE_INTERNAL_COURT}`, { method: 'POST', body: JSON.stringify({ d: f.day, c: cn, ...fall }), signal: AbortSignal.timeout(ROOM_CALL_MS) })); if (!res?.ok) return; }
        catch (e) { console.warn('[gate] book', e?.message ?? e); return; }
      }
    }
    f.booked = true;
    await this._gateSave(f, now, true);
  }
  async _gateSeatInternal(request) {
    let body = null;
    try { body = await request.json(); } catch { body = null; }
    const d = body?.d, sub = body?.s, c = body?.c;
    if (!Number.isSafeInteger(d) || typeof sub !== 'string' || !sub || sub.length > 128 || !courtOk(c)) return json({ error: 'bad seat' }, 400);
    const now = Date.now();
    return json({ c: gateHolds(d, now) ? await this._gateSeatHere(d, sub, c, now, body?.j === 1) : null });
  }
  async _gateCourtInternal(request) {
    let body = null;
    try { body = await request.json(); } catch { body = null; }
    const d = body?.d, c = body?.c;
    const strs = (x, max) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string' && v.length <= 128).slice(0, max) : []);
    if (!Number.isSafeInteger(d) || !courtOk(c) || c === 0 || !Number.isFinite(body?.at) || !Number.isSafeInteger(body?.n) || body.n < 0) return json({ error: 'bad court' }, 400);
    const now = Date.now();
    if (!gateHolds(d, now)) return json({ ok: true });
    const book = await this._gateBookOf(d, true);
    courtFell(book, c, { at: body.at, top: strs(body.top, 3), n: body.n, rs: strs(body.rs, GATE_FIGHTERS_MAX) });
    await this._gateBookSave(book);
    await this._gateBookArm(now);
    return json({ ok: true });
  }
  async _gateMatesOf(sub, now) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return [];
    const kept = (this._gateMates ??= new Bounded(HUB_KEEP_MAX)).get(sub);
    if (kept && now - kept.at < GATE_MATES_KEEP_MS) return kept.m;
    let m = [];
    try {
      const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${GATE_INTERNAL_PARTY}`, { method: 'POST', body: JSON.stringify({ a: sub }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
      const body = res?.ok ? await res.json() : null;
      if (!Array.isArray(body?.m)) return [];
      m = body.m.filter((x) => typeof x === 'string');
    } catch (e) { console.warn('[gate] party', e?.message ?? e); return []; }
    this._gateMates.set(sub, { m, at: now });
    return m;
  }
  async _gatePartyInternal(request) {
    let body = null;
    try { body = await request.json(); } catch { body = null; }
    const a = typeof body?.a === 'string' && body.a && body.a.length <= 128 ? body.a : null;
    if (!a) return json({ error: 'bad party' }, 400);
    const rec = await this._acct(a);
    const party = rec ? (await this._myParty(a, rec, Date.now()))[0] : null;
    return json({ m: Array.isArray(party?.members) ? party.members.filter((x) => typeof x === 'string').slice(0, PARTY_MAX) : [] });
  }
  async _gateReceiptTo(ws, sub, now) {
    if (this._noGateRcpt.has(sub)) return;
    const k = gateReceiptKey(sub);
    const kept = await this.state.storage.get(k);
    if (!kept || typeof kept !== 'object') { this._noGateRcpt.set(sub, 1); return; }
    if (!(Number.isFinite(kept.e) && now < kept.e * 1000)) { await this.state.storage.delete(k); return; }
    if (kept.spent) return;
    if (Number.isFinite(kept.hold) && now < kept.hold) return;
    if (typeof kept.r !== 'string') { await this.state.storage.delete(k); return; }
    this._send(ws, JSON.stringify({ t: 'gate', k: 'rcpt', r: kept.r }));
  }
  async _gateSpent(sub, day, now = Date.now()) {
    const k = gateReceiptKey(sub);
    const kept = await this.state.storage.get(k);
    const d = kept && typeof kept === 'object' && Number.isSafeInteger(kept.d) ? kept.d : null;
    if (d !== null && (d > day || (d === day && kept.spent))) return;
    // Mark the receipt spent instead of deleting it: the spent message can arrive before
    // the kill report, which must then store no copy over it.
    await this.state.storage.put(k, { d: day, spent: true, e: Math.floor(now / 1000) + RECEIPT_TTL_S });
  }
  async _gateFellOf() {
    if (this._gateFell === undefined) { const v = await this.state.storage.get('gatefell'); this._gateFell = v && typeof v === 'object' ? v : null; }
    return this._gateFell;
  }
  async _gateFellInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const court = body?.c !== undefined && !body?.night;
    const fell = court ? validGateOut({ k: 'cf', d: body?.d, c: body?.c, cs: body?.cs, at: body?.at, top: body?.top, n: body?.n })
      : validGateOut({ k: 'fell', d: body?.d, at: body?.at, top: body?.top, n: body?.n, ...(body?.night ? { w: body?.w, cs: body?.cs } : {}) });
    if (!fell || fell.d === undefined) return json({ ok: false }, 400);
    if (!court) { this._gateFell = fell; await this.state.storage.put('gatefell', fell); }
    const said = JSON.stringify({ t: 'gate', ...fell });
    const rc = new Map();
    for (const e of Array.isArray(body.rc) ? body.rc : []) {
      const r = Array.isArray(e) && typeof e[0] === 'string' ? validGateOut({ k: 'rcpt', r: e[1] }) : null;
      if (r) rc.set(e[0], r);
    }
    const here = new Set(Array.isArray(body.here) ? body.here.filter((x) => typeof x === 'string').slice(0, 256) : []);
    const now = Date.now();
    const keep = [];
    // `_noGateRcpt` caches accounts with no receipt; clear it whenever receipts are written.
    this._noGateRcpt.clear();
    for (const [sub, r] of rc) { const c = readReceipt(r.r); if (c && c.s === sub) keep.push([gateReceiptKey(sub), { d: fell.d, r: r.r, e: c.e, ...(here.has(sub) ? { hold: now + GATE_HERE_HOLD_MS } : {}) }, sub, c.x === 'rite']); }
    const had = new Map();
    for (let i = 0; i < keep.length; i += 128) for (const [k, v] of await this.state.storage.get(keep.slice(i, i + 128).map(([k]) => k))) had.set(k, v);
    const done = new Set();
    const fresh = keep.filter(([k, , sub, rite]) => {
      const v = had.get(k);
      const stale = v && typeof v === 'object' && Number.isSafeInteger(v.d) && (v.d > fell.d || (v.d === fell.d && (v.spent || rite)));
      if (stale) done.add(sub);
      return !stale;
    });
    for (let i = 0; i < fresh.length; i += 128) await this.state.storage.put(Object.fromEntries(fresh.slice(i, i + 128).map(([k, v]) => [k, v])));
    const newest = new Map();
    for (const [ws, b] of [...this._all()]) {
      if (!b.id) continue;
      this._send(ws, said);
      if (!b.sub || !rc.has(b.sub) || here.has(b.sub) || done.has(b.sub)) continue;
      const had = newest.get(b.sub);
      if (!had || (b.since ?? 0) >= (had.b.since ?? 0)) newest.set(b.sub, { ws, b });
    }
    for (const [sub, { ws }] of newest) this._send(ws, JSON.stringify({ t: 'gate', ...rc.get(sub) }));
    if (!court) try { await this._heraldOwe(fell, now); } catch (e) { console.warn('[herald] kill not kept', e?.message ?? e); }
    return json({ ok: true });
  }
}
