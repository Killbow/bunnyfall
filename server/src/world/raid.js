// A town's raid in its cell: the ledger, read once a wake and saved, its words, and the hub told.
// It holds the day's slots and towns the relay rolls, sweeps raids, and holds their receipts.
import { raidLedgerKey, wallMsForClassicMinutes, RAID_TELL_RETRY_MS, RAID_LEDGER_PREFIX, worldRoom, sharedClassicMinutes, mapPixelOfWire, SOCIAL_ROOM, RAID_INTERNAL_CLEAN, RAID_DAY_ASK_MS, RAID_INTERNAL_DAY, validRaidOut, RAID_CLEANS_MAX, raidReceiptKeyOf, RAID_RC_KEEP_MS, RAID_RC_KEEP } from '../relay.js';
import { raidLedgerId, raidLedgerEndMinute, RAID_KEEP_MS, RAID_LEDGERS_BY_MAX, RAID_LEDGERS_MAX, raidEvictPick, raidWordSane, raidWordFits, raidDayOfKey, raidOnSlot, newRaidLedger, foldRaidWord, raidCleansed, RAID_SAVE_MS, raidLedgerState, raidEarned, raidTop, raidSig, raidDaySlots, RAID_TOWNS_SHA_RE, raidTownsHash, readRaidTowns, raidDayIds, RAID_DAY_MINUTES, RAID_ACCOUNTS_MAX } from '../../../src/net/raidLaw.js';
import { junkOutsideCover } from '../cellNodes.js';
import { mintRaidReceipt, readRaidReceipt } from '../../../src/net/raidReceipt.js';
import { rand32 } from '../room/dice.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { json } from '../room/json.js';
import { raidRcLive } from '../room/limits.js';

export class RaidPart {
  _raidKeep(id, led) { this._raids.set(id, led); }
  async _raidLedgerOf(id) {
    if (this._raids.has(id)) return this._raids.get(id);
    const v = await this.state.storage.get(raidLedgerKey(id));
    const led = v && typeof v === 'object' && typeof v.key === 'string' && raidLedgerId(v) === id ? v : null;
    this._raidKeep(id, led);
    return led;
  }
  _raidEndsAt(led) { return wallMsForClassicMinutes(raidLedgerEndMinute(led)) + RAID_KEEP_MS; }
  async _raidArm(at) {
    const had = await this.state.storage.getAlarm();
    if (had == null || had > at) await this.state.storage.setAlarm(at);
  }
  async _raidSave(led, now) {
    const id = raidLedgerId(led);
    this._raidSavedAt.set(id, now);
    await this.state.storage.put(raidLedgerKey(id), led);
    await this._raidArm(led.cl && !led.told ? now + RAID_TELL_RETRY_MS : this._raidEndsAt(led));
  }
  async _raidMakeRoom(now, by) {
    const m = await this.state.storage.list({ prefix: RAID_LEDGER_PREFIX });
    const live = [], dead = [];
    for (const [k, v] of m) {
      const led = v && typeof v === 'object' && typeof v.key === 'string' ? (this._raids.get(raidLedgerId(v)) ?? v) : null;
      (led && Number.isSafeInteger(led.st) && now < this._raidEndsAt(led) ? live : dead).push([k, led]);
    }
    for (const [k, led] of dead) { await this.state.storage.delete(k); if (led) this._raidKeep(raidLedgerId(led), null); }
    if (live.filter(([, led]) => led.by === by).length >= RAID_LEDGERS_BY_MAX) return false;
    if (live.length < RAID_LEDGERS_MAX) return true;
    const out = raidEvictPick(live.map(([, led]) => led), now);
    if (!out) return false;
    const id = raidLedgerId(out);
    await this.state.storage.delete(raidLedgerKey(id));
    this._raidKeep(id, null);
    return true;
  }
  async _raidWord(ws, a, m, now) {
    if (junkOutsideCover(this, ws, a, worldRoom(m.px, m.py))) return;
    if (!raidWordSane(m)) { this._junk(ws); return; }
    // A layer is a separate object for the same cell; a ledger there would count and mint again.
    // Return silently: the client has no refusal for a raid frame, so this is not a strike.
    if (a.ly) return;
    if (!raidWordFits(m, sharedClassicMinutes(now))) return;
    const day = raidDayOfKey(m.key);
    if (!raidOnSlot(m, this._raidSlotsOf(day))) return;
    const rolled = await this._raidDayIdsOf(day, now);
    if (rolled && !rolled.has(raidLedgerId(m))) return;
    const id = raidLedgerId(m);
    if (this._raidCleaning.has(id)) return;
    const [px, py] = a.pose ? mapPixelOfWire(a.pose.x, a.pose.z) : [-1, -1];
    const here = px === m.px && py === m.py;
    const acct = typeof a.sub === 'string' && a.sub ? a.sub : `id:${a.id}`;
    let led = await this._raidLedgerOf(id);
    const fresh = !led;
    if (!led) {
      if (!here) return;
      if (!(await this._raidMakeRoom(now, acct))) return;
      led = newRaidLedger(m, now, acct);
      this._raidKeep(id, led);
    }
    const struckBefore = led.a[acct]?.s === 1;
    const { credited, known } = here ? foldRaidWord(led, acct, a.name ?? '', m, now) : { credited: 0, known: false };
    if (raidCleansed(led) && !led.cl) { await this._raidClean(led, now); return; }
    const struck = known && !struckBefore && led.a[acct]?.s === 1;
    if (fresh || credited > 0 || struck || (known && now - (this._raidSavedAt.get(id) ?? 0) >= RAID_SAVE_MS)) await this._raidSave(led, now);
    if (credited > 0) this._raidFan(raidLedgerState(led));
    else this._send(ws, JSON.stringify({ t: 'raid', ...raidLedgerState(led) }));
    const r = led.cl && typeof a.sub === 'string' ? led.rc?.[a.sub] : null;
    if (r) this._send(ws, JSON.stringify({ t: 'raid', k: 'rc', r }));
  }
  _raidFan(o) {
    const s = JSON.stringify({ t: 'raid', ...o });
    for (const [ws, b] of [...this._all()]) if (b.id) this._send(ws, s);
  }
  async _raidClean(led, now) {
    const id = raidLedgerId(led);
    this._raidCleaning.add(id);
    try {
      const earned = raidEarned(led, now);
      const key = await this._receiptKeyOf();
      const nowS = Math.floor(now / 1000);
      led.rc = {};
      for (const [acct] of earned) {
        if (acct.startsWith('id:')) continue;
        try { led.rc[acct] = await mintRaidReceipt({ w: led.key, s: acct, c: rand32(), y: led.ty }, key, { subtle: crypto.subtle, nowS }); }
        catch (e) { console.warn('[raid] receipt refused', e?.message ?? e); }
      }
      led.cl = { at: now, top: raidTop(earned), n: earned.length };
      await this._raidSave(led, now);
    } finally { this._raidCleaning.delete(id); }
    this._raidFan({ k: 'cl', key: led.key, ...led.cl, g: raidSig(led) });
    const newest = new Map();
    for (const [ws, b] of [...this._all()]) {
      if (!b.id || typeof b.sub !== 'string' || !led.rc[b.sub]) continue;
      const had = newest.get(b.sub);
      if (!had || (b.since ?? 0) >= (had.b.since ?? 0)) newest.set(b.sub, { ws, b });
    }
    for (const [sub, { ws }] of newest) this._send(ws, JSON.stringify({ t: 'raid', k: 'rc', r: led.rc[sub] }));
    await this._raidTellHubOnce(led, now);
  }
  async _raidTellHubOnce(led, now) {
    if (led.told || !led.cl) return;
    if (!(await this._raidTellHub({ key: led.key, at: led.cl.at, top: led.cl.top, n: led.cl.n, g: raidSig(led), rc: led.rc ?? {} }))) { await this._raidArm(now + RAID_TELL_RETRY_MS); return; }
    led.told = true;
    await this._raidSave(led, now);
  }
  async _raidTellHub(body) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return true;
    try { const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${RAID_INTERNAL_CLEAN}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ROOM_CALL_MS) })); return !!res?.ok; }
    catch (e) { console.warn('[raid] hub', e?.message ?? e); return false; }
  }
  _raidSlotsOf(day) {
    let s = this._raidSlots.get(day);
    if (!s) { if (this._raidSlots.size >= 4) this._raidSlots.clear(); s = raidDaySlots(day); this._raidSlots.set(day, s); }
    return s;
  }
  async _raidDayIdsOf(day, now) {
    const had = this._raidDays.get(day);
    if (had && (had.ids || now - had.at < RAID_DAY_ASK_MS)) return had.ids;
    let ids = null;
    const rooms = this.env?.ROOMS;
    if (rooms?.idFromName && rooms?.get) {
      try {
        const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${RAID_INTERNAL_DAY}`, { method: 'POST', body: JSON.stringify({ d: day }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
        const body = res?.ok ? await res.json() : null;
        if (Array.isArray(body?.ids)) ids = new Set(body.ids.filter((x) => typeof x === 'string'));
      } catch (e) { console.warn('[raid] day', e?.message ?? e); }
    }
    if (this._raidDays.size >= 4 && !had) this._raidDays.clear();
    this._raidDays.set(day, { ids, at: now });
    return ids;
  }
  _raidTownsPin() {
    const h = String(this.env?.RAID_TOWNS_SHA256 ?? '').trim().toLowerCase();
    return RAID_TOWNS_SHA_RE.test(h) ? h : null;
  }
  async _raidTowns() {
    const pin = this._raidTownsPin();
    if (!pin) return null;
    if (this._raidTownsKept !== undefined) return this._raidTownsKept;
    let kept = null;
    const head = await this.state.storage.get('raidtowns');
    if (head && head.h === pin && Number.isSafeInteger(head.n) && head.n > 0) {
      const keys = Array.from({ length: head.n }, (_, i) => `raidtowns:${i}`);
      const got = await this.state.storage.get(keys);
      const parts = keys.map((k) => got.get(k));
      if (parts.every((p) => typeof p === 'string')) {
        const text = parts.join('');
        if ((await raidTownsHash(text)) === pin) kept = readRaidTowns(text);
      }
    }
    this._raidTownsKept = kept;
    return kept;
  }
  async _raidTownsWanted() { return this._raidTownsPin() && !(await this._raidTowns()) ? this._raidTownsPin() : null; }
  async _raidTownsPiece(ws, m) {
    const pin = this._raidTownsPin();
    if (!pin || m.h !== pin || (await this._raidTowns())) return;
    let up = this._raidTownsUp.get(ws);
    if (!up || up.n !== m.n) {
      if (!up && this._raidTownsUp.size >= 4) this._raidTownsUp.delete(this._raidTownsUp.keys().next().value);
      up = { n: m.n, parts: new Array(m.n).fill(null) };
      this._raidTownsUp.set(ws, up);
    }
    up.parts[m.i] = m.c;
    if (up.parts.some((p) => p == null)) return;
    this._raidTownsUp.delete(ws);
    const text = up.parts.join('');
    if ((await raidTownsHash(text)) !== pin) return;
    const regions = readRaidTowns(text);
    if (!regions) return;
    const puts = { raidtowns: { h: pin, n: up.n } };
    up.parts.forEach((p, i) => { puts[`raidtowns:${i}`] = p; });
    await this.state.storage.put(puts);
    this._raidTownsKept = regions;
    this._raidDayRolls.clear();
  }
  async _raidDayInternal(request) {
    let body = null;
    try { body = await request.json(); } catch { body = null; }
    const day = body?.d;
    if (!Number.isSafeInteger(day) || day < 0 || day > 9999999) return json({ error: 'bad day' }, 400);
    const regions = await this._raidTowns();
    if (!regions) return json({ ids: null });
    let ids = this._raidDayRolls.get(day);
    if (!ids) { if (this._raidDayRolls.size >= 4) this._raidDayRolls.clear(); ids = [...raidDayIds(day, regions)]; this._raidDayRolls.set(day, ids); }
    return json({ ids });
  }
  async _raidSweep(now) {
    const m = await this.state.storage.list({ prefix: RAID_LEDGER_PREFIX });
    if (!m.size) return false;
    let next = Infinity;
    for (const [k, v] of m) {
      const led = v && typeof v === 'object' && typeof v.key === 'string' ? (this._raids.get(raidLedgerId(v)) ?? v) : null;
      if (!led || !Number.isSafeInteger(led.st) || now >= this._raidEndsAt(led)) { await this.state.storage.delete(k); if (led) this._raidKeep(raidLedgerId(led), null); continue; }
      if (led.cl && !led.told) await this._raidTellHubOnce(led, now);
      next = Math.min(next, led.cl && !led.told ? now + RAID_TELL_RETRY_MS : this._raidEndsAt(led));
    }
    if (next < Infinity) await this.state.storage.setAlarm(next);
    return true;
  }
  async _raidCleansOf(now) {
    if (this._raidCleans === undefined) { const v = await this.state.storage.get('raidcl'); this._raidCleans = Array.isArray(v) ? v : []; }
    const today = Math.floor(sharedClassicMinutes(now) / RAID_DAY_MINUTES);
    this._raidCleans = this._raidCleans.filter((e) => Array.isArray(e) && e.length === 3 && (raidDayOfKey(e[0]) ?? -1) >= today - 1);
    return this._raidCleans;
  }
  async _raidCleanInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const cl = validRaidOut({ k: 'cl', key: body?.key, at: body?.at, top: body?.top, n: body?.n, g: body?.g });
    if (!cl) return json({ ok: false }, 400);
    const now = Date.now();
    await this._raidReceiptsKeep(cl, body?.rc, now);
    const list = await this._raidCleansOf(now);
    if (list.some((e) => e[0] === cl.key && e[2] === cl.g)) return json({ ok: true });
    const next = [...list, [cl.key, cl.at, cl.g]];
    while (next.length > RAID_CLEANS_MAX) next.shift();
    // Write storage before `_raidCleans` changes; a throw must leave the cleanse unknown,
    // so the cell's retry still tells everyone.
    await this.state.storage.put('raidcl', next);
    this._raidCleans = next;
    const said = JSON.stringify({ t: 'raid', ...cl });
    for (const [ws, b] of [...this._all()]) if (b.id) this._send(ws, said);
    return json({ ok: true });
  }
  async _raidReceiptsKeep(cl, rc, now) {
    if (!rc || typeof rc !== 'object' || Array.isArray(rc)) return;
    const fresh = [];
    for (const [acct, r] of Object.entries(rc).slice(0, RAID_ACCOUNTS_MAX)) {
      const c = validRaidOut({ k: 'rc', r }) ? readRaidReceipt(r) : null;
      if (c && c.signed && c.s === acct && c.w === cl.key) fresh.push([acct, r]);
    }
    if (!fresh.length) return;
    const had = new Map();
    for (let i = 0; i < fresh.length; i += 128) for (const [k, v] of await this.state.storage.get(fresh.slice(i, i + 128).map(([acct]) => raidReceiptKeyOf(acct)))) had.set(k, v);
    const puts = [], hand = [];
    for (const [acct, r] of fresh) {
      const k = raidReceiptKeyOf(acct);
      const kept = raidRcLive(had.get(k), now);
      if (kept.some((e) => e.r === r)) continue;
      puts.push([k, [...kept, { r, until: now + RAID_RC_KEEP_MS }].slice(-RAID_RC_KEEP)]);
      hand.push([acct, r]);
    }
    if (puts.length) this._noRaidRcpt.clear();
    for (let i = 0; i < puts.length; i += 128) await this.state.storage.put(Object.fromEntries(puts.slice(i, i + 128)));
    const newest = new Map();
    for (const [ws, b] of [...this._all()]) {
      if (!b.id || typeof b.sub !== 'string') continue;
      const n = newest.get(b.sub);
      if (!n || (b.since ?? 0) >= (n.b.since ?? 0)) newest.set(b.sub, { ws, b });
    }
    for (const [acct, r] of hand) { const n = newest.get(acct); if (n) this._send(n.ws, JSON.stringify({ t: 'raid', k: 'rc', r })); }
  }
  async _raidReceiptsTo(ws, sub, now) {
    if (this._noRaidRcpt.has(sub)) return;
    const k = raidReceiptKeyOf(sub);
    const v = await this.state.storage.get(k);
    if (v === undefined) { this._noRaidRcpt.set(sub, 1); return; }
    const kept = raidRcLive(v, now);
    if (!kept.length) { await this.state.storage.delete(k); return; }
    if (!Array.isArray(v) || kept.length !== v.length) await this.state.storage.put(k, kept);
    for (const e of kept) this._send(ws, JSON.stringify({ t: 'raid', k: 'rc', r: e.r }));
  }
}
