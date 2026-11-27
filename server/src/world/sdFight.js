import { SD_FIGHT_KEY, SD_BRAIN_MIN, SD_NO_WORDS, SD_TELL_RETRY_MS, SD_FIGHTERS_MAX, SOCIAL_ROOM, SD_INTERNAL_FELL, validSdFellTell, validSdInTell, SD_HERE_HOLD_MS, sdReceiptKey, SD_HELD_KEY } from '../relay.js';
import { CHECKPOINT_MS, BRAIN_TICK_MS, earnedBy } from '../../../src/net/gateBrain.js';
import { dungeonToRealm } from '../../../src/net/sdBrain.js';
import { arenaOf, SD_POSE_FRESH_MS, SD_LOST_MS, inArena, SD_ARENA_SLACK, applyEchoHit, applyHeartHit } from '../../../src/net/sdRemnant.js';
import { SD_SEAM } from '../../../src/net/bossSeam.js';
import { sdSlotOfRoom, sdHolds, sdFell, sdEnter } from '../../../src/net/sdLaw.js';
import { sdMarksOf } from '../../../src/net/sdMarks.js';
import { bodySaid, bodyOut, bodyCensus } from '../../../src/net/bossBody.js';
import { rand01, rand32 } from '../room/dice.js';
import { mintSdReceipt, readSdReceipt, SD_RECEIPT_TTL_S } from '../../../src/net/sdReceipt.js';
import { json } from '../room/json.js';

export class SdFightPart {
  async _sdFightOf() {
    if (this._sdFight === undefined) { const v = await this.state.storage.get(SD_FIGHT_KEY); if (this._sdFight === undefined) this._sdFight = v && typeof v === 'object' && Number.isSafeInteger(v.s) ? v : null; }
    return this._sdFight;
  }
  async _sdFightSave(f, now, force) {
    if (!force && now - (this._sdFightSavedAt ?? 0) < CHECKPOINT_MS) return;
    this._sdFightSavedAt = now;
    await this.state.storage.put(SD_FIGHT_KEY, f);
  }
  _arenaPoseOf(p) { const [x, , z] = dungeonToRealm(p.x, p.y ?? 0, p.z); const [ax, az] = arenaOf(x, z); return { x: ax, z: az }; }
  _sdFightBodies(f, now = Date.now()) {
    const newest = new Map();
    for (const [ws, b] of this._all()) {
      if (!b.id || !b.sub || !b.pose || !f.players[b.sub]) continue;
      if (now - (b.pAt ?? b.since ?? 0) > SD_POSE_FRESH_MS) continue;
      const had = newest.get(b.sub);
      if (!had || (b.since ?? 0) >= (had[1].since ?? 0)) newest.set(b.sub, [ws, b]);
    }
    return [...newest.values()].map(([ws, b]) => { const c = this._arenaPoseOf(b.pose); return { sub: b.sub, x: c.x, z: c.z, dead: !!b.pose.dd, tr: this._trailOf(ws, (p) => this._arenaPoseOf(p)) }; });
  }
  _sdFightFan(frames) {
    if (!frames.length) return;
    this._fanFrames(frames.map((fr) => JSON.stringify({ t: 'sd', ...fr })), (b) => b.id);
  }
  async _sdFightArm(now) {
    const at = await this.state.storage.getAlarm();
    if (at == null || at > now + BRAIN_TICK_MS) await this.state.storage.setAlarm(now + BRAIN_TICK_MS);
  }
  async _sdHelloFight(ws, sub, s, now) {
    const sf = await this._sdFightOf();
    if (!sf || sf.lost || sf.s !== s) return true;
    if (!sf.fell && now - sf.lastTickAt >= SD_LOST_MS) { sf.lost = { at: now }; await this._sdFightSave(sf, now, true); return true; }
    if (!this._send(ws, JSON.stringify({ t: 'sd', ...SD_SEAM.stateOf(sf) }))) return false;
    if (!sf.fell) { await this._sdFightArm(now); return true; }
    const r = sub ? sf.rc?.[sub] : null;
    return !r || this._send(ws, JSON.stringify({ t: 'sd', k: 'rcpt', r }));
  }
  async _sdFightFrame(ws, a, m, now) {
    const s = sdSlotOfRoom(a.key);
    let f = await this._sdFightOf();
    if (f && f.s !== s) f = this._sdFight = null;
    if (m.k === 'in') {
      const no = (w) => { this._send(ws, JSON.stringify({ t: 'sd', k: 'no', m: w })); };
      if (!(m.bv >= SD_BRAIN_MIN)) { no(SD_NO_WORDS[3]); return; }
      const rec = await this._sdLiveOf(s, now);
      if (rec === undefined) return;
      if (!rec || rec.s !== s || !sdHolds(rec, now)) { no(SD_NO_WORDS[0]); return; }
      if (typeof a.sub !== 'string' || !a.sub || !a.pose || a.pose.dd) return;
      if (!(await this._sdHallOf(s)).ok) return;
      // Re-read the fight and the clock after the last await and decide with no await between;
      // two `in` frames that awaited together would each start a fresh fight.
      now = Date.now();
      f = this._sdFight ?? null;
      if (f && f.s !== s) f = this._sdFight = null;
      const at = this._arenaPoseOf(a.pose);
      if (!inArena(at.x, at.z, SD_ARENA_SLACK)) return;
      if (f?.fell) { this._send(ws, JSON.stringify({ t: 'sd', ...SD_SEAM.stateOf(f) })); if (f.rc?.[a.sub]) this._send(ws, JSON.stringify({ t: 'sd', k: 'rcpt', r: f.rc[a.sub] })); return; }
      const fresh = !f || f.lost || now - f.lastTickAt >= SD_LOST_MS;
      if (fresh) f = this._sdFight = SD_SEAM.new({ s, fi: (f?.fi ?? 0) + 1, now, mk: sdMarksOf(s) });
      const known = !!f.players[a.sub];
      const present = new Set();
      for (const [, b] of this._all()) if (b.sub && b.id) present.add(b.sub);
      const lv = Number.isSafeInteger(a.cl) && a.cl >= 1 ? a.cl : m.lv;
      if (!SD_SEAM.join(f, a.sub, a.name ?? '', lv, now, present)) { no(f.ended ? SD_NO_WORDS[1] : SD_NO_WORDS[2]); return; }
      this._send(ws, JSON.stringify({ t: 'sd', ...SD_SEAM.stateOf(f), me: 1 }));
      this._trailSeed(ws, a, now);
      await this._sdFightSave(f, now, fresh || !known);
      await this._sdFightArm(now);
      return;
    }
    if (m.k === 'vt') { const p = f?.players[a.sub], line = this._bodyLine(); if (p) bodySaid(p, m.v / 1000, now, line.body, { enforce: line.enforce }); return; }
    if (!f || !f.players[a.sub]) { this._junk(ws); return; }
    const live = await this._sdLiveOf(s, now);
    if (this._sdFight !== f) return;
    now = Date.now();
    if (live !== undefined && !(live && live.s === s && sdHolds(live, now))) return;
    // Match the freshness bound in `_sdFightBodies`, so a fighter the census drops strikes nothing.
    const pose = a.pose && !a.pose.dd && now - (a.pAt ?? a.since ?? 0) <= SD_POSE_FRESH_MS && !bodyOut(f.players[a.sub], this._bodyLine().enforce) ? this._arenaPoseOf(a.pose) : null;
    if (m.k === 'ehit') this._sdFightFan(applyEchoHit(f, a.sub, m.e, m.d, m.r, pose, now, m.q));
    else if (m.k === 'xhit') this._sdFightFan(applyHeartHit(f, a.sub, m.c, m.d, m.r, pose, now, m.q));
    else {
      SD_SEAM.hit(f, a.sub, m.d, m.r, pose, now, m.q);
      if (f.fell && !f.said) { await this._sdFightFall(f, now); return; }
    }
    if (!f.fell && !f.lost && !(this._sdBeatArmedTo > now)) { this._sdBeatArmedTo = now + BRAIN_TICK_MS; await this._sdFightArm(now); }
  }
  async _sdFightTick() {
    const f = await this._sdFightOf();
    if (!f || f.lost || (f.said && f.told)) return false;
    const now = Date.now();
    void this._relayCfgFresh(now);
    try {
      const realm = this._sdRealm?.s === f.s ? this._sdRealm : null;
      const raised = (sub) => !!realm && !realm.dead.includes(sub) && !realm.down.some(([x]) => x === sub);
      const line = this._bodyLine(), bodies = this._sdFightBodies(f, now), census = () => bodyCensus(f, bodies, now, line.body, line.enforce, { lives: raised });
      await this._bodyCount('sd', f, SD_SEAM.judge(f, census(), now), now, line.body, (sub) => this._sdMarkFallenAt(f.s, sub));
      this._bodyTell('sd', f, now);
      this._sdFightFan(SD_SEAM.step(f, now, this._bodiesBare(census()), rand01));
      if (f.fell && !f.said) await this._sdFightFall(f, now);
      else if (f.said && !f.told) await this._sdTellFellOnce(f, now);
      await this._sdFightSave(f, now, !!f.lost);
    } catch (e) { console.warn('[sd] beat failed', e?.message ?? e); }
    if (f.said && !f.told) { await this.state.storage.setAlarm(now + SD_TELL_RETRY_MS); return true; }
    const here = [...this._all()].some(([, b]) => b.id);
    if (here && !f.fell && !f.lost) { await this.state.storage.setAlarm(now + BRAIN_TICK_MS); return true; }
    return false;
  }
  async _sdFightFall(f, now) {
    if (this._sdFalling) return this._sdFalling;
    this._sdFalling = this._sdFightFallOnce(f, now).finally(() => { this._sdFalling = null; });
    return this._sdFalling;
  }
  async _sdFightFallOnce(f, now) {
    if (f.said) return;
    const key = await this._receiptKeyOf(), nowS = Math.floor(now / 1000);
    f.rc = {};
    for (const sub of Object.keys(f.players).filter((x) => SD_SEAM.earned(f, x))) {
      try { f.rc[sub] = await mintSdReceipt({ d: f.s, s: sub, c: rand32(), x: earnedBy(f, sub), l: f.players[sub].lv, ...this._bodyMeasureOf(f, sub, SD_SEAM.earned) }, key, { subtle: crypto.subtle, nowS }); }
      catch (e) { console.warn('[sd] receipt refused', e?.message ?? e); }
    }
    f.said = true;
    f.here = [...new Set([...this._all()].filter(([, b]) => b.id && b.sub && f.rc[b.sub]).map(([, b]) => b.sub))].slice(0, SD_FIGHTERS_MAX);
    await this._sdFightSave(f, now, true);
    this._sdFightFan([{ k: 'fell', ...f.fell }]);
    for (const [ws, b] of [...this._all()]) { const r = b.id && b.sub ? f.rc[b.sub] : null; if (r) this._send(ws, JSON.stringify({ t: 'sd', k: 'rcpt', r })); }
    await this._sdTellFellOnce(f, now);
  }
  async _sdTellFellOnce(f, now) {
    if (f.told || !f.fell) return;
    if (this._sdFellTelling) return this._sdFellTelling;
    this._sdFellTelling = this._sdTellFellNow(f, now).finally(() => { this._sdFellTelling = null; });
    return this._sdFellTelling;
  }
  async _sdTellFellNow(f, now) {
    const rooms = this.env?.ROOMS;
    let ok = !rooms?.idFromName || !rooms?.get;
    if (!ok) {
      try {
        const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${SD_INTERNAL_FELL}`, { method: 'POST', body: JSON.stringify({ s: f.s, at: f.fell.at, top: f.fell.top[0] ?? '', n: f.fell.n, rc: Object.entries(f.rc ?? {}), here: f.here ?? [] }), signal: AbortSignal.timeout(SD_TELL_RETRY_MS) }));
        ok = !!res && (res.ok || (res.status >= 400 && res.status < 500));
      } catch (e) { console.warn('[sd] hub', e?.message ?? e); }
    }
    if (!ok) return;
    f.told = true;
    await this._sdFightSave(f, now, true);
  }
  async _sdFellInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const c = validSdFellTell(body);
    if (!c) return json({ ok: false }, 400);
    const rec = await this._sdOf();
    if (rec && rec.s === c.s) {
      const was = rec.ph === 'gone' && rec.fellAt == null && rec.foundAt != null && c.at < rec.until ? { ...rec, ph: 'found' } : rec;
      const fell = sdFell(was, Math.min(c.at, Date.now()), { top: c.top, n: c.n });
      if (fell) { await this._sdSave(fell); this._sdFan(fell); await this._sdArm(Date.now()); }
      if (fell) await this._sdHeraldArm(Date.now());
    }
    await this._sdKeepReceipts(c, Date.now());
    return json({ ok: true });
  }
  async _sdInInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const c = validSdInTell(body);
    if (!c) return json({ ok: false }, 400);
    const rec = await this._sdOf();
    const inn = rec && rec.s === c.s ? sdEnter(rec, Date.now()) : null;
    if (inn) { await this._sdSave(inn); this._sdFan(inn); }
    return json({ ok: true });
  }
  async _sdKeepReceipts(c, now) {
    const here = new Set(c.here);
    const keep = [];
    for (const [sub, r] of c.rc) { const cl = readSdReceipt(r); if (cl && cl.s === sub && cl.d === c.s) keep.push([sub, { s: c.s, r, e: cl.e, ...(here.has(sub) ? { hold: now + SD_HERE_HOLD_MS } : {}) }]); }
    if (!keep.length) return;
    this._noSdRcpt.clear();
    const had = new Map();
    for (let i = 0; i < keep.length; i += 128) for (const [k, v] of await this.state.storage.get(keep.slice(i, i + 128).map(([sub]) => sdReceiptKey(sub)))) had.set(k, v);
    const fresh = keep.filter(([sub]) => {
      const v = had.get(sdReceiptKey(sub));
      return !(v && typeof v === 'object' && Number.isSafeInteger(v.s) && (v.s > c.s || (v.s === c.s && v.spent)));
    });
    for (let i = 0; i < fresh.length; i += 128) await this.state.storage.put(Object.fromEntries(fresh.slice(i, i + 128).map(([sub, v]) => [sdReceiptKey(sub), v])));
    const owed = new Map(fresh.filter(([sub]) => !here.has(sub)));
    for (const [sub, [ws]] of this._siegeSockets()) if (owed.has(sub)) this._send(ws, JSON.stringify({ t: 'sd', k: 'rcpt', r: owed.get(sub).r }));
    const held = fresh.filter(([sub]) => here.has(sub)).map(([sub, v]) => [sub, v.hold]);
    if (held.length) {
      const was = await this.state.storage.get(SD_HELD_KEY);
      const by = new Map(Array.isArray(was) ? was.filter((e) => Array.isArray(e) && typeof e[0] === 'string' && Number.isSafeInteger(e[1])) : []);
      for (const [sub, at] of held) by.set(sub, at);
      await this.state.storage.put(SD_HELD_KEY, [...by].slice(-SD_FIGHTERS_MAX));
      await this._hubArm(Math.min(...held.map(([, at]) => at)));
    }
  }
  async _sdHeldBeat(now) {
    const was = await this.state.storage.get(SD_HELD_KEY);
    const held = Array.isArray(was) ? was.filter((e) => Array.isArray(e) && typeof e[0] === 'string' && Number.isSafeInteger(e[1])) : [];
    if (!held.length) return;
    const rest = held.filter(([, at]) => at > now);
    if (rest.length < held.length) {
      const socks = this._siegeSockets();
      for (const [sub] of held.filter(([, at]) => at <= now)) { const s = socks.get(sub); if (s) { this._noSdRcpt.delete(sub); await this._sdReceiptTo(s[0], sub, now); } }
      if (rest.length) await this.state.storage.put(SD_HELD_KEY, rest); else await this.state.storage.delete(SD_HELD_KEY);
    }
    if (rest.length) await this._hubArm(Math.min(...rest.map(([, at]) => at)));
  }
  async _sdReceiptTo(ws, sub, now) {
    if (this._noSdRcpt.has(sub)) return;
    const k = sdReceiptKey(sub);
    const v = await this.state.storage.get(k);
    if (!v || typeof v !== 'object') { this._noSdRcpt.set(sub, 1); return; }
    if (!(Number.isFinite(v.e) && now < v.e * 1000) || (!v.spent && typeof v.r !== 'string')) { await this.state.storage.delete(k); return; }
    if (v.spent === true || (Number.isFinite(v.hold) && now < v.hold)) return;
    this._send(ws, JSON.stringify({ t: 'sd', k: 'rcpt', r: v.r }));
  }
  async _sdSpent(sub, slot, now) {
    if (!(slot <= ((await this._sdOf())?.s ?? 0))) return;
    const k = sdReceiptKey(sub);
    const v = await this.state.storage.get(k);
    const at = v && typeof v === 'object' && Number.isSafeInteger(v.s) ? v.s : null;
    if (at !== null && (at > slot || (at === slot && v.spent === true))) return;
    await this.state.storage.put(k, { s: slot, spent: true, e: Math.floor(now / 1000) + SD_RECEIPT_TTL_S });
  }
}
