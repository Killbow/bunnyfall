import { starRelayGate, isCellRoom, worldRoom, STAR_SAVE_MS, starLedgerKey, STAR_KEEP_MS, STAR_TELL_RETRY_MS, STAR_LEDGER_PREFIX, SOCIAL_ROOM, STAR_INTERNAL_HELD, STAR_HELD_KEY, validStarOut, STAR_HELD_MAX, STAR_COUNT_MAX, starReceiptKeyOf, STAR_RC_KEEP_MS, STAR_RC_KEEP } from '../relay.js';
import { junkOutsideCover } from '../cellNodes.js';
import { starHeard, starLedgerId, starNear, starMayMake, newStarLedger, foldStarWord, P_HELD, starOver, starLedgerState, starLedgerSane, starSettled, starTimes, starLostAt, starPlaceFor, starEarned, starTop, starHeldWord, stepStar, starOk, starNightGoneAt } from '../../../src/net/starfall/starfallLaw.js';
import { mintStarReceipt, readStarReceipt } from '../../../src/net/starfall/starReceipt.js';
import { rand32 } from '../room/dice.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { json } from '../room/json.js';
import { raidRcLive } from '../room/limits.js';

export class StarPart {
  async _starFrame(ws, a, m) {
    const now = Date.now();
    if (!this._spend(ws, now, starRelayGate, 'starBucket', 'starDrops', 'too many star frames')) return;
    if (!isCellRoom(a.key)) { this._junk(ws); return; }
    try { await this._starWord(ws, a, m, now); } catch (e) { console.warn('[star] word failed', e?.message ?? e); }
  }
  async _starWord(ws, a, m, now) {
    if (junkOutsideCover(this, ws, a, worldRoom(m.px, m.py))) return;
    if (a.ly) return;
    if (!starHeard(m.n, m.k, now)) return;
    const id = starLedgerId(m);
    const here = !!a.pose && starNear(m.n, m.k, m.px, m.py, a.pose.x, a.pose.z);
    const acct = typeof a.sub === 'string' && a.sub ? a.sub : `id:${a.id}`;
    let led = await this._starLedgerOf(id);
    const fresh = !led;
    if (!led) {
      if (!here) return;
      if (!starMayMake(m.n, m.k, now)) return;
      if (!(await this._starMakeRoom(now, acct))) return;
      led = newStarLedger(m, now, acct);
      this._stars.set(id, led);
    }
    const moved = foldStarWord(led, acct, a.name ?? '', m, here, now);
    if (led.p === P_HELD && !led.said) { await this._starHold(led, now); return; }
    if (fresh || moved || (!starOver(led) && now - (this._starSavedAt.get(id) ?? 0) >= STAR_SAVE_MS)) await this._starSave(led, now);
    const mine = starLedgerState(led, acct);
    if (moved) this._starFan(starLedgerState(led), ws, mine);
    else this._send(ws, JSON.stringify({ t: 'star', ...mine }));
    const r = led.said && typeof a.sub === 'string' ? led.rc[a.sub] : null;
    if (r) this._send(ws, JSON.stringify({ t: 'star', k: 'rc', r }));
  }
  async _starLedgerOf(id) {
    if (this._stars.has(id)) return this._stars.get(id);
    const v = await this.state.storage.get(starLedgerKey(id));
    const led = starLedgerSane(v) && starLedgerId(v) === id ? v : null;
    this._starKeep(id, led);
    return led;
  }
  _starKeep(id, led) { if (!led || !starSettled(led)) this._stars.set(id, led); }
  _starListed(k, v) {
    if (!starLedgerSane(v) || starLedgerKey(starLedgerId(v)) !== k) return null;
    const id = starLedgerId(v);
    const had = this._stars.get(id);
    if (had) return had;
    this._starKeep(id, v);
    return v;
  }
  _starEndsAt(led) { return starTimes(led.n, led.k).endAt + STAR_KEEP_MS; }
  _starDueOf(led, now) {
    if (led.p === P_HELD && !led.told) return now + STAR_TELL_RETRY_MS;
    return starOver(led) ? this._starEndsAt(led) : starLostAt(led.n, led.k);
  }
  async _starArm(at) {
    try { const had = await this.state.storage.getAlarm(); if (had == null || had > at) await this.state.storage.setAlarm(at); }
    catch (e) { console.warn('[star] arm', e?.message ?? e); }
  }
  async _starSave(led, now) {
    const id = starLedgerId(led);
    this._starSavedAt.set(id, now);
    await this.state.storage.put(starLedgerKey(id), led);
    await this._starArm(this._starDueOf(led, now));
  }
  async _starMakeRoom(now, by) {
    const m = await this.state.storage.list({ prefix: STAR_LEDGER_PREFIX });
    const kept = [];
    for (const [k, v] of m) {
      const led = this._starListed(k, v);
      if (led && now < this._starEndsAt(led)) { kept.push(led); continue; }
      await this.state.storage.delete(k);
      if (led) this._stars.delete(starLedgerId(led));
    }
    const { ok, out } = starPlaceFor(kept, by, now);
    if (out) { const id = starLedgerId(out); await this.state.storage.delete(starLedgerKey(id)); this._stars.set(id, null); }
    return ok;
  }
  _starFan(o, from = null, mine = null) {
    const s = JSON.stringify({ t: 'star', ...o }), own = mine ? JSON.stringify({ t: 'star', ...mine }) : s;
    for (const [ws, b] of [...this._all()]) if (b.id) this._send(ws, ws === from ? own : s);
  }
  _starNewest(rc) {
    const newest = new Map();
    for (const [ws, b] of [...this._all()]) {
      if (!b.id || typeof b.sub !== 'string' || !Object.hasOwn(rc, b.sub)) continue;
      const had = newest.get(b.sub);
      if (!had || (b.since ?? 0) >= (had.b.since ?? 0)) newest.set(b.sub, { ws, b });
    }
    return newest;
  }
  async _starHold(led, now) {
    const id = starLedgerId(led);
    if (this._starHolding.has(id)) return;
    this._starHolding.add(id);
    try {
      const earned = starEarned(led);
      const key = await this._receiptKeyOf();
      const nowS = Math.floor(now / 1000);
      led.rc = {};
      for (const [acct, r] of earned) {
        if (acct.startsWith('id:')) continue;
        try { led.rc[acct] = await mintStarReceipt({ n: led.n, k: led.k, s: acct, c: rand32(), l: r.lv }, key, { subtle: crypto.subtle, nowS }); }
        catch (e) { console.warn('[star] receipt refused', e?.message ?? e); }
      }
      led.top = starTop(earned); led.hn = earned.length; led.said = true;
      await this._starSave(led, now);
    } finally { this._starHolding.delete(id); }
    this._starFan(starLedgerState(led));
    this._starFan(starHeldWord(led));
    for (const [sub, { ws }] of this._starNewest(led.rc)) this._send(ws, JSON.stringify({ t: 'star', k: 'rc', r: led.rc[sub] }));
    await this._starTellHubOnce(led, now);
  }
  async _starTellHubOnce(led, now) {
    if (led.told || !led.said) return;
    if (!(await this._starTellHub({ ...starHeldWord(led), rc: led.rc }))) { await this._starArm(now + STAR_TELL_RETRY_MS); return; }
    led.told = true;
    await this._starSave(led, now);
  }
  async _starTellHub(body) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return true;
    try { const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${STAR_INTERNAL_HELD}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ROOM_CALL_MS) })); return !!res?.ok; }
    catch (e) { console.warn('[star] hub', e?.message ?? e); return false; }
  }
  async _starSweep(now) {
    const m = await this.state.storage.list({ prefix: STAR_LEDGER_PREFIX });
    if (!m.size) return 0;
    let next = Infinity;
    for (const [k, v] of m) {
      const led = this._starListed(k, v);
      if (!led || now >= this._starEndsAt(led)) { await this.state.storage.delete(k); if (led) this._stars.delete(starLedgerId(led)); continue; }
      if (stepStar(led, now)) { await this._starSave(led, now); this._starFan(starLedgerState(led)); }
      if (led.p === P_HELD && !led.said) await this._starHold(led, now);
      else await this._starTellHubOnce(led, now);
      next = Math.min(next, this._starDueOf(led, now));
    }
    if (next === Infinity) return 0;
    await this._starArm(next);
    return next;
  }
  async _starHeldOf(now) {
    if (this._starHeld === undefined) { const v = await this.state.storage.get(STAR_HELD_KEY); if (this._starHeld === undefined) this._starHeld = Array.isArray(v) ? v : []; }
    this._starHeld = this._starHeld.filter((e) => Array.isArray(e) && e.length === 5 && starOk(e[0], e[1]) && now < starNightGoneAt(e[0]));
    return this._starHeld;
  }
  async _starHeldInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const hd = validStarOut({ k: 'hd', n: body?.n, s: body?.s, px: body?.px, py: body?.py, at: body?.at, top: body?.top, c: body?.c });
    if (!hd) return json({ ok: false }, 400);
    const now = Date.now();
    await this._starReceiptsKeep(hd, body?.rc, now);
    if (!(now < starNightGoneAt(hd.n))) return json({ ok: true });
    const list = await this._starHeldOf(now);
    if (list.some((e) => e[0] === hd.n && e[1] === hd.s && e[2] === hd.px && e[3] === hd.py)) return json({ ok: true });
    const next = [...list, [hd.n, hd.s, hd.px, hd.py, hd.at]];
    while (next.length > STAR_HELD_MAX) next.shift();
    await this.state.storage.put(STAR_HELD_KEY, next);
    this._starHeld = next;
    const said = JSON.stringify({ t: 'star', ...hd });
    for (const [ws, b] of [...this._all()]) if (b.id) this._send(ws, said);
    return json({ ok: true });
  }
  async _starReceiptsKeep(hd, rc, now) {
    if (!rc || typeof rc !== 'object' || Array.isArray(rc)) return;
    const fresh = [];
    for (const [acct, r] of Object.entries(rc).slice(0, STAR_COUNT_MAX)) {
      const c = validStarOut({ k: 'rc', r }) ? readStarReceipt(r) : null;
      if (c && c.signed && c.s === acct && c.night === hd.n && c.star === hd.s) fresh.push([acct, r]);
    }
    if (!fresh.length) return;
    const had = new Map();
    for (let i = 0; i < fresh.length; i += 128) for (const [k, v] of await this.state.storage.get(fresh.slice(i, i + 128).map(([acct]) => starReceiptKeyOf(acct)))) had.set(k, v);
    const puts = [], hand = {};
    for (const [acct, r] of fresh) {
      const k = starReceiptKeyOf(acct);
      const kept = raidRcLive(had.get(k), now);
      if (kept.some((e) => e.r === r)) continue;
      puts.push([k, [...kept, { r, until: now + STAR_RC_KEEP_MS }].slice(-STAR_RC_KEEP)]);
      hand[acct] = r;
    }
    if (puts.length) this._noStarRcpt.clear();
    for (let i = 0; i < puts.length; i += 128) await this.state.storage.put(Object.fromEntries(puts.slice(i, i + 128)));
    for (const [sub, { ws }] of this._starNewest(hand)) this._send(ws, JSON.stringify({ t: 'star', k: 'rc', r: hand[sub] }));
  }
  async _starReceiptsTo(ws, sub, now) {
    if (this._noStarRcpt.has(sub)) return;
    const k = starReceiptKeyOf(sub);
    const v = await this.state.storage.get(k);
    if (v === undefined) { this._noStarRcpt.set(sub, 1); return; }
    const kept = raidRcLive(v, now);
    if (!kept.length) { await this.state.storage.delete(k); return; }
    if (!Array.isArray(v) || kept.length !== v.length) await this.state.storage.put(k, kept);
    for (const e of kept) this._send(ws, JSON.stringify({ t: 'star', k: 'rc', r: e.r }));
  }
}
