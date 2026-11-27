import { EG_KEY, SOCIAL_ROOM, validEgOpenTell, EG_BRAIN_MIN, sanitizeName, EG_INTERNAL_OPEN, egCallKey } from '../relay.js';
import { EG_DONE_KEY, egResume, egDoneWith, egReceiptSeed, EG_RC_OWED_MAX, EG_INTERNAL_RCPT, EG_RC_TELL_MS, egDoneOf, egTickAt, EG_VOID_MAX_S, egVoidable, egHoldDone, egRelease, egBeatGap, EG_LIVE_MAX, EG_OPEN_HUB_TRIES, EG_INTERNAL_CALLED, EG_INTERNAL_VOID, egRcId, egRcKey, egRcFold, egRcLive, egRcSpent, EG_LIVE_KEY, EG_LIVE_SAID_MS, EG_INTERNAL_STAGE } from '../../../src/net/eliteGates/egDurable.js';
import { egFairWoke, egEnd, egStateOf, egFightStateOf, egPoseIn, egCountHeals, egBreachNew, EG_HEAL_CAST_MS, egAdmitWord, egLive, egEnter, egBodyWord, EG_BODY_ENFORCE, egDown, egGeo, egHome, egHeal, egBlow, egWord, egCount, egStep } from '../../../src/net/eliteGates/egBrain.js';
import { BRAIN_TICK_MS, CHECKPOINT_MS } from '../../../src/net/gateBrain.js';
import { dungeonToRealm } from '../../../src/net/sdBrain.js';
import { SD_POSE_FRESH_MS } from '../../../src/net/sdRemnant.js';
import { egPoseClock, egPoseShared, egTrailPush, EG_TS_LAG_MAX_MS } from '../../../src/net/eliteGates/egFair.js';
import { egTrailHeld, EG_CAST_SEEN_MAX } from '../worker/asks.js';
import { rand32, rand01 } from '../room/dice.js';
import { mintEgReceipt, readEgReceipt, EG_RECEIPT_TTL_S } from '../../../src/net/eliteGates/egReceipt.js';
import { json } from '../room/json.js';
import { egBreachOfRoom, egCircleOfHall, egHallOf, egRoomKey, EG_LAST_WORD_MS, EG_SEALED_MS, EG_ADMIT_MAX_MS } from '../../../src/net/eliteGates/egLaw.js';
import { verifyOrder, verifyEgOpenAnyAge } from '../../../src/net/identityToken.js';
import { EG_HERALD_KEEP_MS, EG_INTERNAL_HERALD, EG_HERALD_TELL_MS } from '../../../src/net/eliteGates/egHerald.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { signEgCall } from '../../../src/net/eliteGates/egCallSig.js';
import { contentOn } from '../../../src/mods/contentOff.js';
import { relayCfgValue } from '../../../src/net/relayCfg.js';

export class EgPart {
  async _egOf() {
    if (this._eg === undefined) {
      const kept = await this.state.storage.get([EG_KEY, EG_DONE_KEY]);
      const v = kept.get(EG_KEY), d = kept.get(EG_DONE_KEY);
      if (this._egDone === undefined) this._egDone = d && typeof d === 'object' && Number.isSafeInteger(d.until) ? d : null;
      if (this._eg === undefined) {
        this._eg = v && typeof v === 'object' && typeof v.b === 'string' ? v : null;
        if (this._eg) await this._egResume(this._eg, Date.now());
        if (this._eg) egFairWoke(this._eg, Date.now());
      }
    }
    return this._eg;
  }
  async _egResume(B, now) {
    const how = egResume(B, now, this._egVoidBefore());
    if (how === 'void') {
      const out = [];
      egEnd(B, 'void', now, out);
      this._egFan(out);
      await this._egMint(B, now);
      await this._egSave(B, now, true);
      return;
    }
    if (how) { this._egFan([egStateOf(B, now), ...(egFightStateOf(B, now) ? [egFightStateOf(B, now)] : [])]); await this._egSave(B, now, true); await this._egArm(now + BRAIN_TICK_MS); }
  }
  _egPresent(B, now) { return new Set(this._egBodies(B, now).map((b) => b.sub)); }
  async _egSave(B, now, force) {
    if (!force && now - (this._egSavedAt ?? 0) < CHECKPOINT_MS) return;
    this._egSavedAt = now;
    // Trails live in memory only; save the newest pose of each member as `lp`
    // so `_egTrails` can rebuild the bodies in a woken room.
    for (const [sub, k] of this._egTrailsBy ?? []) if (B.mem?.[sub] && Array.isArray(k?.last)) B.mem[sub].lp = k.last.slice(0, 5);
    if (B.end && !B.tomb) { B.tomb = 1; await this._egDoneWrite(B.ez, B.end, null, now); }
    await this.state.storage.put(EG_KEY, B);
  }
  _egVoidBefore() { const v = Number(this.env?.EG_VOID_BEFORE); return Number.isSafeInteger(v) && v > 0 ? v : 0; }
  async _egDoneOf() {
    if (this._egDone === undefined) await this._egOf();
    if (this._egDone === undefined) { const d = await this.state.storage.get(EG_DONE_KEY); if (this._egDone === undefined) this._egDone = d && typeof d === 'object' && Number.isSafeInteger(d.until) ? d : null; }
    return this._egDone;
  }
  async _egDoneWrite(ez, why, r, now) {
    this._egDone = egDoneWith(await this._egDoneOf(), ez, why, r, Math.floor(now / 1000));
    await this.state.storage.put(EG_DONE_KEY, this._egDone);
  }
  async _egDoneTick(B) {
    const done = await this._egDoneOf();
    if (!done) return false;
    if (Date.now() >= done.until * 1000) {
      this._egDone = null;
      if (B?.end) this._eg = null;
      await this.state.storage.delete(B?.end ? [EG_DONE_KEY, EG_KEY] : [EG_DONE_KEY]);
      return false;
    }
    await this.state.storage.setAlarm(done.until * 1000);
    return true;
  }
  async _egArm(at) {
    const cur = await this.state.storage.getAlarm();
    if (cur == null || cur > at) await this.state.storage.setAlarm(at);
  }
  _egPose(p) { const [sx, y, z] = dungeonToRealm(p.x, p.y ?? 0, p.z); return { sx, y, z }; }
  _egBodies(B, now) {
    const newest = new Map();
    for (const [, b] of this._all()) {
      if (!b.id || !b.sub || !b.pose || !B.mem[b.sub]) continue;
      if (now - (b.eAt ?? b.since ?? 0) > SD_POSE_FRESH_MS) continue;
      const had = newest.get(b.sub);
      if (!had || (b.since ?? 0) >= (had.since ?? 0)) newest.set(b.sub, b);
    }
    return [...newest.values()].map((b) => { const p = this._egPose(b.pose); return { sub: b.sub, sx: p.sx, y: p.y, z: p.z, dead: !!b.pose.dd, at: b.eAt ?? now }; });
  }
  _egLine() { return this._bodyLine().body; }
  _egPoseIn(ws, a, p, now) {
    const B = this._eg;
    if (!B || B.end || !B.mem?.[a.sub] || !p) return;
    const clocks = (this._egClocks ??= new Map());
    let c = clocks.get(ws);
    if (!c) { clocks.set(ws, c = egPoseClock()); if (clocks.size > 64) clocks.delete(clocks.keys().next().value); }
    const t = egPoseShared(c, p.ts, now);
    if (t == null) return;
    const [sx, y, z] = dungeonToRealm(p.x, p.y ?? 0, p.z);
    const at = egPoseIn(B, a.sub, { sx, y, z, pl: p.pl ?? null, cl: p.cl ?? 0 }, t);
    if (!at) return;
    const trails = (this._egTrailsBy ??= new Map());
    const k = trails.get(a.sub);
    if (k && k.ws !== ws && this._siegeSocketOf(a.sub)?.[0] !== ws) return;
    const tr = k?.tr ?? [];
    while (tr.length && tr[tr.length - 1][5] === 1 && tr[tr.length - 1][0] >= t) tr.pop();
    if (tr.length && t < tr[tr.length - 1][0]) return;
    const e = [t, at.x, at.y, at.z, at.h];
    trails.delete(a.sub); trails.set(a.sub, { ws, tr: egTrailPush(tr, e), last: e });
    if (trails.size > 64) trails.delete(trails.keys().next().value);
  }
  _egTrails(B, now = Date.now()) {
    const socks = this._siegeSockets(), out = [];
    for (const [sub, m] of Object.entries(B.mem ?? {})) {
      let k = this._egTrailsBy?.get(sub);
      if (!k && Array.isArray(m?.lp) && m.lp.length === 5) { k = { ws: null, tr: [], last: m.lp }; (this._egTrailsBy ??= new Map()).set(sub, k); }
      const open = socks.has(sub);
      if (!m?.in || !m.alive || m.home || !k?.last) { if (open) out.push({ sub, tr: k?.tr ?? [] }); continue; }
      out.push({ sub, tr: egTrailHeld(k, open ? now - EG_TS_LAG_MAX_MS : now) });
    }
    return out;
  }
  _egFan(frames) {
    if (!frames.length) return;
    if (this._eg) egCountHeals(this._eg, frames, Date.now(), this._egLine());
    const all = [], mine = new Map();
    for (const fr of frames) {
      if (typeof fr.to === 'string') { const { to, ...rest } = fr; mine.set(to, [...(mine.get(to) ?? []), JSON.stringify({ t: 'eg', ...rest })]); }
      else all.push(JSON.stringify({ t: 'eg', ...fr }));
    }
    if (all.length) this._fanFrames(all, (b) => b.id);
    for (const [sub, words] of mine) for (const [ws, b] of this._all()) if (b.id && b.sub === sub) for (const w of words) this._send(ws, w);
  }
  async _egMint(B, now) {
    if (!B.owe?.length) return [];
    const owed = B.owe;
    // Take the whole owed list before the first await, so no receipt is minted twice.
    B.owe = [];
    const key = await this._receiptKeyOf(), nowS = Math.floor(now / 1000);
    B.rc ??= {};
    const minted = [];
    for (const o of owed) {
      try {
        const seed = o.claims.q === 'v' ? {} : { c: B.rs ? await egReceiptSeed(B.rs, o.sub, o.claims.q === 'w' ? o.claims.w : 0, o.claims.q, crypto.subtle) : rand32() };
        const r = await mintEgReceipt({ ...o.claims, ...seed }, key, { subtle: crypto.subtle, nowS });
        B.rc[o.sub] = [...(B.rc[o.sub] ?? []), r].slice(-12);
        minted.push([o.sub, r]);
      } catch (e) { console.warn('[eg] receipt refused', e?.message ?? e); }
    }
    if (minted.length) B.rq = [...(B.rq ?? []), ...minted].slice(-EG_RC_OWED_MAX);
    await this._egSave(B, Date.now(), true);
    for (const [sub, r] of minted) { const sock = this._siegeSocketOf(sub); if (sock) this._send(sock[0], JSON.stringify({ t: 'eg', k: 'rcpt', r })); }
    this._egRcAt = 0;
    await this._egRcTell(B, Date.now());
    return minted;
  }
  async _egRcTell(B, now) {
    if (!B.rq?.length || now < (this._egRcAt ?? 0)) return;
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) { B.rq = []; return; }
    const rc = B.rq;
    const res = await this._egPost(SOCIAL_ROOM, EG_INTERNAL_RCPT, { b: B.b, rc, here: [...this._siegeSockets().keys()] });
    if (!res?.ok) { this._egRcAt = now + EG_RC_TELL_MS; return; }
    const told = new Set(rc.map((e) => e[1]));
    B.rq = (B.rq ?? []).filter((e) => !told.has(e[1]));
    await this._egSave(B, Date.now(), true);
  }
  async _egOpenInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const t = validEgOpenTell(body);
    if (!t) return json({ ok: false }, 400);
    const had = await this._egOf();
    if (had) return had.ez === t.ez && !had.end ? json({ ok: true, seed: had.seed, op: had.op, egv: had.egv, co: had.co.map((c) => [c.sub, c.name, c.n]), site: had.site }) : json({ ok: false, error: had.ez === t.ez ? 'done' : 'taken' }, 409);
    if (egDoneOf(await this._egDoneOf(), t.ez)) return json({ ok: false, error: 'void' }, 409);
    const B = egBreachNew(t);
    // Never send `rs` to a client; every receipt seed derives from it.
    B.rs = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, '0')).join('');
    this._eg = B;
    await this._egSave(B, Date.now(), true);
    await this._egArm(egTickAt(B, Date.now(), false));
    return json({ ok: true, seed: B.seed, op: B.op, egv: B.egv, co: B.co.map((c) => [c.sub, c.name, c.n]), site: B.site });
  }
  async _egVoidInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const c = body && typeof body === 'object' ? body : {};
    if (typeof c.s !== 'string' || !c.s || typeof c.eb !== 'string' || !/^[0-9a-f]{16}$/.test(c.eb) || typeof c.ez !== 'string' || !/^[a-z0-9]{16,32}$/.test(c.ez) || !Number.isSafeInteger(c.i)) return json({ ok: false, no: 'refused' }, 400);
    const sub = c.s, now = Date.now(), nowS = Math.floor(now / 1000);
    if (nowS - c.i > EG_VOID_MAX_S) return json({ ok: false, no: 'old' });
    const kept = egDoneOf(await this._egDoneOf(), c.ez);
    if (kept && kept[1] === 'void' && kept[2]) return json({ ok: true, r: kept[2] });
    const B = await this._egOf();
    if (B && B.ez === c.ez) {
      if (!egVoidable(B)) return json({ ok: false, no: 'held' });
      const out = [];
      egEnd(B, 'void', now, out);
      this._egFan(out);
      const minted = await this._egMint(B, now);
      await this._egSave(B, Date.now(), true);
      const r = minted.find((e) => e[0] === sub && readEgReceipt(e[1])?.q === 'v')?.[1] ?? null;
      if (!r) return json({ ok: false, no: 'shut' });
      await this._egDoneWrite(c.ez, 'void', r, now);
      return json({ ok: true, r });
    }
    if (kept && kept[1] !== 'void') return json({ ok: false, no: 'held' });
    if (!kept) await this._egDoneWrite(c.ez, 'void', null, now);
    let r = null;
    try { r = await mintEgReceipt({ q: 'v', b: c.eb, s: sub, z: c.ez }, await this._receiptKeyOf(), { subtle: crypto.subtle, nowS }); } catch (e) { console.warn('[eg] void refused', e?.message ?? e); }
    if (!r) return json({ ok: false, no: 'shut' });
    await this._egDoneWrite(c.ez, 'void', r, now);
    await this._egArm(this._egDone.until * 1000);
    return json({ ok: true, r });
  }
  async _egCalledInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const B = await this._egOf();
    if (!B || B.end || typeof body?.ez !== 'string' || body.ez !== B.ez) return json({ ok: false }, 400);
    if (!B.called) { B.called = 1; await this._egSave(B, Date.now(), true); }
    return json({ ok: true });
  }
  _egCastSeen(by, to, now) {
    const seen = (this._egCasts ??= new Map()), k = `${by}\n${to}`;
    seen.delete(k); seen.set(k, now);
    if (seen.size > EG_CAST_SEEN_MAX) seen.delete(seen.keys().next().value);
  }
  _egCastSaw(by, to, now) {
    const t = this._egCasts?.get(`${by}\n${to}`);
    return t != null && now - t <= EG_HEAL_CAST_MS;
  }
  async _egAdmit(key, who, now) {
    const B = await this._egOf();
    if (!B || B.b !== egBreachOfRoom(key)) return 'the breach is closed';
    if (who.hid) return null;
    if (!who.subject || who.kind !== 'linked') return 'the breach answers only to its company';
    return egAdmitWord(B, who.subject, now);
  }
  async _egHello(ws, sub, now) {
    const B = await this._egOf();
    if (!B) return true;
    if (!this._send(ws, JSON.stringify({ t: 'eg', ...egStateOf(B, now) }))) return false;
    const fst = egFightStateOf(B, now);
    if (fst && !this._send(ws, JSON.stringify({ t: 'eg', ...fst }))) return false;
    const rq = this.env?.ROOMS?.idFromName && this.env.ROOMS.get ? (B.rq ?? []).filter((e) => e[0] === sub).map((e) => e[1]) : ((sub && B.rc?.[sub]) || []);
    for (const r of sub ? rq : []) if (!this._send(ws, JSON.stringify({ t: 'eg', k: 'rcpt', r }))) return false;
    const m = sub ? B.mem?.[sub] : null;
    if (m?.offer?.length && !this._send(ws, JSON.stringify({ t: 'eg', k: 'offer', v: m.offer, n: m.picks ?? 0 }))) return false;
    for (const q of B.asks ?? []) if (!this._send(ws, JSON.stringify({ t: 'eg', k: 'ask', q: q.q, o: q.o, until: q.until }))) return false;
    if (egLive(B, now)) await this._egArm(now + BRAIN_TICK_MS);
    return true;
  }
  async _egFrame(ws, a, m, now) {
    let B = await this._egOf();
    if (!B || B.b !== egBreachOfRoom(a.key)) { this._junk(ws); return; }
    const pose = a.pose && !a.pose.dd ? this._egPose(a.pose) : null;
    const no = (w) => { this._send(ws, JSON.stringify({ t: 'eg', k: 'no', m: w })); };
    if (m.k === 'in') {
      if (!(m.bv >= EG_BRAIN_MIN)) { no('the breach is closed'); return; }
      await this._loadKey();
      if (!this._verifyKey) return;
      const r = await verifyOrder(m.z, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'egadmit' });
      if (!r.ok || r.claims.s !== a.sub || r.claims.eb !== B.b || (r.claims.ew ?? 0) !== (B.ew ?? 0)) { no('the order is not yours'); return; }
      now = Date.now();
      B = this._eg;
      const lv = a.cl > 0 && Number.isSafeInteger(a.cl) ? a.cl : m.lv;
      const w = egEnter(B, a.sub, r.claims.ez, lv, now);
      if (w) { no(w); return; }
      await this._egSave(B, now, true);
      this._egFan([egStateOf(B, now)]);
      await this._egArm(now + BRAIN_TICK_MS);
      return;
    }
    if (m.k === 'clk') { this._send(ws, JSON.stringify({ t: 'eg', k: 'clk', c: m.c, now: Date.now() })); if (Number.isInteger(m.h)) { const all = (this._egClocks ??= new Map()); let c = all.get(ws); if (!c) all.set(ws, c = egPoseClock()); c.h = m.h; } return; }
    if (m.k === 'vt') { egBodyWord(B, a.sub, m.v, now, this._egLine(), EG_BODY_ENFORCE); return; }
    if (m.k === 'down') { if (egDown(B, a.sub, m.h, pose, now)) await this._egArm(now + BRAIN_TICK_MS); return; }
    if (m.k === 'spec') {
      const c = B.h > 0 ? egCircleOfHall(B.h) : 1, hc = egCircleOfHall(m.h);
      if (B.end || (hc !== c && hc !== c + 1)) return;
      this._send(ws, JSON.stringify({ t: 'eg', k: 'spec', egv: B.egv, h: m.h, sp: egHallOf(B.seed, m.h, egGeo(B), B.egv) }));
      return;
    }
    if (m.k === 'home') {
      const out = [];
      if (egHome(B, a.sub, now, out)) { this._egFan(out); await this._egMint(B, now); await this._egSave(B, now, true); }
      return;
    }
    if (m.k === 'heal') { egHeal(B, a.sub, m.h.map(([id, n]) => [this._idFirst(id)?.[1]?.sub ?? '', n]), now, this._egLine(), EG_BODY_ENFORCE, (by) => this._egCastSaw(by, a.sub, now)); return; }
    if (m.k === 'hit') this._egFan(egBlow(B, a.sub, m, pose, now));
    else {
      const out = egWord(B, a.sub, m, pose, now, rand01);
      this._egFan(out);
      if (m.k === 'forsake' || m.k === 'pick' || m.k === 'fell' || m.k === 'yield' || m.k === 'rz') { await this._egMint(B, now); await this._egSave(B, now, true); }
    }
    if (!(this._egBeatArmedTo > now)) { this._egBeatArmedTo = now + BRAIN_TICK_MS; await this._egArm(now + BRAIN_TICK_MS); }
  }
  async _egTick() {
    const B = await this._egOf();
    if (!B || (B.end && !B.owe?.length && !B.hq?.length && !B.rq?.length)) return this._egDoneTick(B);
    const now = Date.now();
    if (B.hold) {
      if (!egHoldDone(B, now, this._egPresent(B, now))) { await this.state.storage.setAlarm(now + 1000); return true; }
      egRelease(B, now);
      this._egFan([egStateOf(B, now), ...(egFightStateOf(B, now) ? [egFightStateOf(B, now)] : [])]);
      await this._egSave(B, now, true);
    } else if (egBeatGap(B, now) > 0) this._egFan([egStateOf(B, now), ...(egFightStateOf(B, now) ? [egFightStateOf(B, now)] : [])]);
    try {
      const out = [...egCount(B, now, this._egTrails(B), this._egLine(), EG_BODY_ENFORCE), ...egStep(B, now, this._egBodies(B, now), rand01)];
      this._egFan(out);
      await this._egMint(B, now);
      await this._egRcTell(B, now);
      await this._egHeraldTell(B, now);
      await this._egSave(B, now, out.some((f) => f.k === 'sg' || f.k === 'rd' || f.k === 'end' || f.k === 'fall' || f.k === 'rise' || f.k === 'offer'));
    } catch (e) { console.warn('[eg] beat failed', e?.message ?? e); }
    if (B.end) {
      await this._egSave(B, now, true);
      if (!B.hq?.length && !B.rq?.length) return this._egDoneTick(B);
      await this.state.storage.setAlarm(Math.max(now + 1000, Math.min(B.hq?.length ? (this._egTellAt ?? 0) : Infinity, B.rq?.length ? (this._egRcAt ?? 0) : Infinity)));
      return true;
    }
    const here = [...this._all()].some(([, b]) => b.id);
    await this.state.storage.setAlarm(egTickAt(B, now, here));
    return true;
  }
  async _egHeraldTell(B, now) {
    if (!B.hq?.length || now < (this._egTellAt ?? 0)) return;
    B.hq = B.hq.filter((e) => now < e.at + EG_HERALD_KEEP_MS);
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) B.hq = [];
    if (!B.hq.length) return;
    const ev = B.hq;
    const res = await this._egPost(SOCIAL_ROOM, EG_INTERNAL_HERALD, { b: B.b, ev });
    if (!res?.ok) { this._egTellAt = now + EG_HERALD_TELL_MS; return; }
    const told = new Set(ev.map((e) => e.i));
    B.hq = (B.hq ?? []).filter((e) => !told.has(e.i));
    await this._egSave(B, Date.now(), true);
  }
  async _egPost(key, path, body) {
    const ans = await this._egAsk(key, path, body);
    return ans?.ok ? ans.body : null;
  }
  async _egAsk(key, path, body) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return null;
    try {
      const res = await rooms.get(rooms.idFromName(key)).fetch(new Request(`https://relay.internal${path}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
      if (!res) return null;
      let out = null;
      try { out = await res.json(); } catch { out = null; }
      return { ok: !!res.ok, status: res.status, body: out };
    } catch (e) { console.warn('[hub] eg post', e?.message ?? e); return null; }
  }
  async _egOpen(ws, a, m, now) {
    const no = () => { this._send(ws, JSON.stringify({ t: 'eg', k: 'no', m: 'the breach is closed' })); };
    await this._loadKey();
    if (!this._verifyKey) { no(); return; }
    const r = await verifyOrder(m.z, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'egopen' });
    if (!r.ok || r.claims.s !== a.sub) { no(); return; }
    const c = r.claims;
    let full = Object.keys(await this._egLiveOf(now)).length >= EG_LIVE_MAX;
    if (full) { await this._egLiveSay(); full = Object.keys(await this._egLiveOf(now)).length >= EG_LIVE_MAX; }
    if ((await this._egDraining()) || full) { await this._egShut(ws, a, c, now); return; }
    const rec = await this._acct(a.sub);
    let members = [a.sub];
    if (rec) { const [party] = await this._myParty(a.sub, rec, now); if (party?.members?.length) members = party.members.includes(a.sub) ? party.members.slice(0, 8) : [a.sub]; }
    if (!members.includes(a.sub)) members = [a.sub, ...members].slice(0, 8);
    const recs = await this._accts(members);
    const co = members.map((sub, i) => [sub, sanitizeName(recs.get(sub)?.name ?? (sub === a.sub ? a.name ?? '' : '')), i + 1]);
    const tell = { b: c.eb, ez: c.ez, s: c.s, o: sanitizeName(a.name ?? rec?.name ?? ''), ew: c.ew, rh: c.rh === 1 ? 1 : 0, seed: rand32(), op: now, co, site: m.site, ...(Array.isArray(c.ewg) ? { wg: c.ewg } : {}) };
    if (!validEgOpenTell(tell)) { no(); return; }
    let ans = null;
    for (let k = 0; k < EG_OPEN_HUB_TRIES && !ans; k++) ans = await this._egAsk(egRoomKey(c.eb), EG_INTERNAL_OPEN, tell);
    const res = ans?.ok ? ans.body : null;
    if (!res?.ok) {
      await this._egVoidAsk(ws, a.sub, c, now);
      no(); return;
    }
    const kept = validEgOpenTell({ ...tell, co: res.co, site: res.site });
    const company = kept ? kept.co : co, called = company.map((t) => t[0]);
    const call = { k: 'call', b: c.eb, o: tell.o, os: c.s, seed: res.seed ?? tell.seed, op: res.op ?? tell.op, rh: tell.rh, co: company, site: kept ? kept.site : m.site, ew: tell.ew, wg: tell.wg ?? [] };
    call.sg = await signEgCall(call, await this._receiptKeyOf(), { subtle: crypto.subtle });
    await this._egLiveAdd(c.eb, { egv: Number.isSafeInteger(res.egv) ? res.egv : 0, until: call.op + EG_LAST_WORD_MS }, now);
    const until = call.op + EG_SEALED_MS + EG_ADMIT_MAX_MS, word = JSON.stringify({ t: 'eg', ...call });
    await this.state.storage.put(Object.fromEntries(called.map((sub) => [egCallKey(sub), { call, until }])));
    for (const sub of called) this._sayTo(sub, word);
    for (let k = 0; k < EG_OPEN_HUB_TRIES; k++) if (await this._egPost(egRoomKey(c.eb), EG_INTERNAL_CALLED, { ez: c.ez })) break;
  }
  async _egVoidAsk(ws, sub, c, now) {
    let ans = null;
    for (let k = 0; k < EG_OPEN_HUB_TRIES && !ans; k++) ans = await this._egAsk(egRoomKey(c.eb), EG_INTERNAL_VOID, { s: sub, eb: c.eb, ez: c.ez, i: c.i });
    const r = ans?.body?.ok && typeof ans.body.r === 'string' ? ans.body.r : null;
    const v = r ? readEgReceipt(r) : null;
    if (v && v.q === 'v' && v.s === sub) {
      await this._egRcKeep(new Map([[sub, [{ id: egRcId(v), r, e: v.e }]]]), Math.floor(now / 1000));
      this._send(ws, JSON.stringify({ t: 'eg', k: 'rcpt', r }));
    }
    return ans?.body ?? null;
  }
  async _egVoid(ws, a, m, now) {
    const no = (w) => { this._send(ws, JSON.stringify({ t: 'eg', k: 'no', m: w })); };
    await this._loadKey();
    if (!this._verifyKey) return;
    const v = await verifyEgOpenAnyAge(m.z, this._verifyKey, { subtle: crypto.subtle });
    if (!v.ok || v.claims.s !== a.sub) { no('the order is not yours'); return; }
    if (Math.floor(now / 1000) - v.claims.i > EG_VOID_MAX_S) { no('the void is too old'); return; }
    const kept = this._noEgRc.has(a.sub) ? null : await this.state.storage.get(egRcKey(a.sub)), vid = egRcId({ b: v.claims.eb, q: 'v' });
    const held = Array.isArray(kept) ? kept.find((x) => x?.id === vid && !x.spent && typeof x.r === 'string' && x.e > Math.floor(now / 1000) && readEgReceipt(x.r)?.z === v.claims.ez) : null;
    if (held) { this._send(ws, JSON.stringify({ t: 'eg', k: 'rcpt', r: held.r })); return; }
    const said = await this._egVoidAsk(ws, a.sub, v.claims, now);
    if (said?.no === 'held') no('the breach took the key');
    else if (said?.no === 'old') no('the void is too old');
  }
  async _egRcKeep(by, nowS) {
    const out = new Map();
    if (!by.size) return out;
    this._noEgRc.clear();
    const keys = [...by.keys()].map(egRcKey), had = new Map();
    for (let i = 0; i < keys.length; i += 128) for (const [k, v] of await this.state.storage.get(keys.slice(i, i + 128))) had.set(k, v);
    for (const [sub, add] of by) out.set(sub, egRcFold(had.get(egRcKey(sub)), add, nowS));
    const pairs = [...out].map(([sub, list]) => [egRcKey(sub), list]);
    for (let i = 0; i < pairs.length; i += 128) await this.state.storage.put(Object.fromEntries(pairs.slice(i, i + 128)));
    return out;
  }
  async _egRcInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const b = typeof body?.b === 'string' ? body.b : null;
    if (!b || !Array.isArray(body.rc)) return json({ ok: false }, 400);
    const by = new Map();
    for (const e of body.rc.slice(0, EG_RC_OWED_MAX)) {
      const c = Array.isArray(e) && typeof e[0] === 'string' ? readEgReceipt(e[1]) : null;
      if (!c || c.s !== e[0] || c.b !== b) continue;
      by.set(e[0], [...(by.get(e[0]) ?? []), { id: egRcId(c), r: e[1], e: c.e }]);
    }
    const held = await this._egRcKeep(by, Math.floor(Date.now() / 1000));
    const here = new Set(Array.isArray(body.here) ? body.here.filter((x) => typeof x === 'string').slice(0, 64) : []);
    const socks = this._siegeSockets();
    for (const [sub, add] of by) {
      const s = here.has(sub) ? null : socks.get(sub);
      if (!s) continue;
      const live = new Set(egRcLive(held.get(sub), Math.floor(Date.now() / 1000)));
      for (const x of add) if (live.has(x.r)) this._send(s[0], JSON.stringify({ t: 'eg', k: 'rcpt', r: x.r }));
    }
    return json({ ok: true });
  }
  async _egReceiptTo(ws, sub, now) {
    if (this._noEgRc.has(sub)) return;
    const kept = await this.state.storage.get(egRcKey(sub));
    if (!Array.isArray(kept)) { this._noEgRc.set(sub, 1); return; }
    for (const r of egRcLive(kept, Math.floor(now / 1000))) this._send(ws, JSON.stringify({ t: 'eg', k: 'rcpt', r }));
  }
  async _egClaimed(sub, m, now) {
    const k = egRcKey(sub), nowS = Math.floor(now / 1000), id = egRcId(m);
    const kept = await this.state.storage.get(k);
    const e = (Array.isArray(kept) ? kept.find((x) => x?.id === id)?.e : null) ?? nowS + EG_RECEIPT_TTL_S;
    this._noEgRc.clear();
    await this.state.storage.put(k, egRcSpent(kept, id, nowS, e));
  }
  async _egLiveOf(now) {
    if (this._egLive === undefined) { const v = await this.state.storage.get(EG_LIVE_KEY); if (this._egLive === undefined) this._egLive = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    for (const [b, e] of Object.entries(this._egLive)) if (!(e?.until > now)) delete this._egLive[b];
    return this._egLive;
  }
  async _egLiveAdd(b, e, now) {
    const live = await this._egLiveOf(now);
    live[b] = e;
    this._egLiveSaid = null; this._egLiveGen = (this._egLiveGen ?? 0) + 1;
    await this.state.storage.put(EG_LIVE_KEY, live);
  }
  async _egDraining() { return !contentOn('eliteBreach') || relayCfgValue(await this._relayCfgOf(), this.env, 'egDrain') === 'on'; }
  async _egShut(ws, a, c, now) {
    await this._egVoidAsk(ws, a.sub, c, now);
    this._send(ws, JSON.stringify({ t: 'eg', k: 'no', m: 'the road is shut' }));
  }
  async _egLiveInternal() { return json({ ...(await this._egLiveSay()), drain: await this._egDraining() }); }
  async _egLiveSay() {
    const now = Date.now(), kept = this._egLiveSaid;
    if (kept?.body && now >= kept.at && now - kept.at < EG_LIVE_SAID_MS) return kept.body;
    if (this._egLiveAsking) return this._egLiveAsking;
    const gen = this._egLiveGen ?? 0;
    this._egLiveAsking = this._egLiveRead(now).then((body) => { if ((this._egLiveGen ?? 0) === gen) this._egLiveSaid = { at: now, body }; return body; }).finally(() => { this._egLiveAsking = null; });
    return this._egLiveAsking;
  }
  async _egLiveRead(now) {
    const live = await this._egLiveOf(now), list = Object.entries(live);
    const said = await Promise.all(list.map(([b]) => this._egPost(egRoomKey(b), EG_INTERNAL_STAGE, {})));
    let between = true, until = 0, n = 0, gone = false;
    const laws = new Set();
    list.forEach(([b, e], i) => {
      const st = said[i];
      if (st && st.live === false) { delete live[b]; gone = true; return; }
      n++; until = Math.max(until, e.until); laws.add(Number.isSafeInteger(st?.egv) ? st.egv : e.egv);
      if (!st || st.sg === 'trial') between = false;
    });
    if (gone) await this.state.storage.put(EG_LIVE_KEY, live);
    return { live: n, between, laws: [...laws].sort((x, y) => x - y), until };
  }
  async _egStageInternal() {
    const B = await this._egOf();
    return json(B && !B.end ? { live: true, sg: B.sg, egv: B.egv, wk: B.wk ? 1 : 0, held: B.hold ? 1 : 0 } : { live: false });
  }
  async _egCallTo(ws, sub, now) {
    const v = await this.state.storage.get(egCallKey(sub));
    if (!v) return;
    if (!(v.until > now)) { await this.state.storage.delete(egCallKey(sub)); return; }
    this._send(ws, JSON.stringify({ t: 'eg', ...v.call }));
  }
}
