import { SERPENT_FIGHTS_KEY, SERPENT_SITES_MAX, serpentFightId, cellRoomOfWire, SERPENT_TELL_RETRY_MS, SOCIAL_ROOM, SERPENT_INTERNAL_FELL, SERPENT_FELLS_KEY, SERPENT_RC_PREFIX, validSerpentOut, SERPENT_FELLS_MAX } from '../relay.js';
import { serpentStoreKey, SERPENT_KEEP_MS } from './serpentKeys.js';
import { SERPENT_NATIVE_PER_M, serpentAt, serpentSiteKey, SERPENT_BRAIN_MIN, serpentHolds, serpentAdmits, serpentBossOf, serpentRiseYaw, SERPENT_DIVE_MS, sameSerpentSite } from '../../../src/net/serpentLaw.js';
import { bodyLife, bodyDown, bodySaid, HULL_REFLOAT } from '../../../src/net/bossBody.js';
import { SERPENT_SEAM } from '../../../src/net/bossSeam.js';
import { junkOutsideCover } from '../cellNodes.js';
import { rand01, rand32 } from '../room/dice.js';
import { mintSerpentReceipt, readSerpentReceipt } from '../../../src/net/serpentReceipt.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { json } from '../room/json.js';
import * as serpentBrain from '../../../src/net/serpentBrain.js';

export class SerpentPart {
  async _serpentFights() {
    if (this._serpents === undefined) {
      const ids = await this.state.storage.get(SERPENT_FIGHTS_KEY);
      const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string').slice(0, 4 * SERPENT_SITES_MAX) : [];
      const got = list.length ? await this.state.storage.get(list.map(serpentStoreKey)) : new Map();
      const fights = new Map();
      for (const id of list) { const f = got.get(serpentStoreKey(id)); if (f && typeof f === 'object') fights.set(id, serpentBrain.serpentWoke(f)); }
      this._serpents = fights;
    }
    return this._serpents;
  }
  async _serpentIndex(fights) { await this.state.storage.put(SERPENT_FIGHTS_KEY, [...fights.keys()]); }
  async _serpentForget(fights, id) {
    fights.delete(id);
    this._serpentSavedAt.delete(id);
    await this.state.storage.delete(serpentStoreKey(id));
    await this._serpentIndex(fights);
  }
  _serpentFrameOf(f, p) { return { x: (p.x - f.sx) / SERPENT_NATIVE_PER_M, z: (p.z - f.sz) / SERPENT_NATIVE_PER_M }; }
  _serpentFightBy(fights, sub) {
    let by = null;
    for (const [id, f] of fights) if (f.players[sub] && (!by || f.day > by[1].day)) by = [id, f];
    return by;
  }
  _serpentBodies(f, trailed = false) {
    const out = [];
    for (const [sub, [ws, b]] of this._siegeSockets()) {
      if (!b.pose || !f.players[sub] || f.players[sub].stale) continue;
      const c = this._serpentFrameOf(f, b.pose);
      out.push({ sub, x: c.x, z: c.z, dead: !!b.pose.dd, ...(Number.isFinite(b.pose.ts) ? { ts: b.pose.ts } : {}), ...(trailed ? { tr: this._trailOf(ws, (p) => this._serpentFrameOf(f, p)) } : {}) });
    }
    return out;
  }
  async _serpentCountWreck(fights, id, f, sub, now) {
    const out = [];
    if (serpentBrain.serpentWreck(f, sub, 1, now, out)) f.players[sub].cw = 1;
    await this._serpentSay(fights, id, f, out, now);
  }
  async _serpentHullBack(fights, id, f, sub, x, z, now) {
    const p = f.players[sub];
    if (!p?.bd || Math.hypot(x, z) > serpentBrain.ENGAGE_R || !(now - (p.seenAt ?? p.joinedAt) > serpentBrain.SERPENT_ABSENT_RETIRE_MS)) return;
    bodyLife(p, now, this._bodyLine().hull);
    await this._serpentRefloat(fights, id, f, sub, now);
  }
  async _serpentRefloat(fights, id, f, sub, now) {
    const p = f.players[sub];
    if (!(p?.cw || p?.wf) || bodyDown(p)) return false;
    delete p.cw; delete p.wf;
    const out = [];
    serpentBrain.serpentWreck(f, sub, 0, now, out);
    await this._serpentSay(fights, id, f, out, now);
    return true;
  }
  _serpentHears(id, f, b) {
    if (!b.id) return false;
    if (b.sps && b.spd === f.day) return b.sps === id;
    if (b.sub && f.players[b.sub]) return true;
    if (!b.pose) return false;
    const c = this._serpentFrameOf(f, b.pose);
    return Math.hypot(c.x, c.z) <= serpentBrain.FAN_R;
  }
  _serpentFan(fights, id, f, frames) {
    if (!frames.length) return;
    this._fanFrames(frames.map((fr) => JSON.stringify({ t: 'serpent', ...fr, sx: f.sx, sz: f.sz })), (b) => this._serpentHears(id, f, b));
  }
  async _serpentSay(fights, id, f, frames, now) {
    if (serpentBrain.serpentSaysTrack(frames)) await this._serpentSave(id, f, now, true);
    this._serpentFan(fights, id, f, frames);
  }
  async _serpentSave(id, f, now, force) {
    if (!force && now - (this._serpentSavedAt.get(id) ?? 0) < serpentBrain.SERPENT_CHECKPOINT_MS) return;
    this._serpentSavedAt.set(id, now);
    await this.state.storage.put(serpentStoreKey(id), f);
  }
  async _serpentArm(now) {
    if (this._serpentArmedTo > now) return;
    this._serpentArmedTo = now + serpentBrain.SERPENT_TICK_MS;
    const at = await this.state.storage.getAlarm();
    if (at == null || at > now + serpentBrain.SERPENT_TICK_MS) await this.state.storage.setAlarm(now + serpentBrain.SERPENT_TICK_MS);
  }
  _serpentRoomFor(fights, day) {
    const today = [...fights].filter(([, f]) => f.day === day);
    if (today.length < SERPENT_SITES_MAX) return true;
    // Never reuse a slain fight's slot: a later `in` would raise it again at full health.
    // A fight with a ship near its waters is not idle, even before any player has a part.
    const over = today.find(([, f]) => f.gone && !f.fell);
    if (over) return over[0];
    const idle = today.find(([, f]) => !f.fell && !Object.values(f.players).some(serpentBrain.serpentHasPart)
      && !this._serpentBodies(f).some((b) => Math.hypot(b.x, b.z) <= serpentBrain.FAN_R));
    return idle ? idle[0] : null;
  }
  async _serpentFrame(ws, a, m, now) {
    if (a.ly) { if (m.k === 'in') this._send(ws, JSON.stringify({ t: 'serpent', k: 'no', m: 'the waters are full' })); return; }
    const fights = await this._serpentFights();
    if (m.k === 'in') { await this._serpentIn(ws, a, m, now, fights); return; }
    const by = this._serpentFightBy(fights, a.sub);
    if (!by) return;
    const [id, f] = by;
    if (f.players[a.sub]?.stale) return;
    const line = this._bodyLine();
    if (m.k === 'vt') {
      bodySaid(f.players[a.sub], m.v / 1000, now, line.hull, { enforce: line.enforce, up: HULL_REFLOAT, hull: true });
      const me = f.players[a.sub];
      if (!(me?.cw || me?.wf) || bodyDown(me)) return;
      await this._serpentSay(fights, id, f, serpentBrain.serpentResume(f, now), now);
      await this._serpentRefloat(fights, id, f, a.sub, now);
      if (!f.fell && !f.gone) await this._serpentArm(now);
      return;
    }
    await this._serpentSay(fights, id, f, serpentBrain.serpentResume(f, now), now);
    const sunk = line.enforce && !!f.players[a.sub]?.bd?.dn;
    if (m.k === 'hit') {
      // Only the socket the census judges may strike; the same player's other socket could strike from near
      // while the judged one poses far off.
      const own = this._siegeSocketOf(a.sub)?.[0] === ws;
      const pose = a.pose && !a.pose.dd && !sunk && own ? this._serpentFrameOf(f, a.pose) : null;
      await this._serpentSay(fights, id, f, SERPENT_SEAM.hit(f, a.sub, m.d, m.r, pose, now, null, { z: m.z }).filter((o) => o.k !== 'fell'), now);
      if (f.fell && !f.said) { await this._serpentFall(id, f, now); return; }
    } else if (m.k === 'wr') {
      const me = f.players[a.sub];
      if (m.w || !sunk) { delete me.cw; delete me.wf; const out = []; serpentBrain.serpentWreck(f, a.sub, m.w, now, out); await this._serpentSay(fights, id, f, out, now); }
      else me.wf = 1;
    }
    else await this._serpentSay(fights, id, f, serpentBrain.coilWord(f, a.sub, m.k, m.i, m.x, m.z, now), now);
    if (!f.fell && !f.gone) await this._serpentArm(now);
  }
  async _serpentIn(ws, a, m, now, fights) {
    const no = (why) => this._send(ws, JSON.stringify({ t: 'serpent', k: 'no', m: why }));
    const t = serpentAt(now);
    const id = serpentFightId(m.d, serpentSiteKey(m.sx, m.sz));
    let f = fights.get(id) ?? null;
    if (f?.rc?.[a.sub]) this._send(ws, JSON.stringify({ t: 'serpent', k: 'rcpt', r: f.rc[a.sub] }));
    const was = this._serpentFightBy(fights, a.sub);
    if (!(m.bv >= SERPENT_BRAIN_MIN)) { if (was) was[1].players[a.sub].stale = true; no('reload'); return; }
    if (was?.[1].players[a.sub]?.stale) delete was[1].players[a.sub].stale;
    if (m.d !== t.day || !serpentHolds(t.day, now)) { if (!f?.rc?.[a.sub]) no('the serpent is gone'); return; }
    if (junkOutsideCover(this, ws, a, cellRoomOfWire(m.sx, m.sz))) return;
    if (!a.pose || a.pose.dd) return;
    const site = f ?? { sx: m.sx, sz: m.sz };
    const at = this._serpentFrameOf(site, a.pose), off = Math.hypot(at.x, at.z);
    if (off > serpentBrain.ADMIT_R) { no('too far from its waters'); return; }
    const mine = this._serpentFightBy(fights, a.sub);
    if (mine && mine[0] !== id && mine[1].day === t.day) { no('the waters are full'); return; }
    let born = false;
    if (!f) {
      if (!serpentAdmits(t.day, now)) { no('the serpent is gone'); return; }
      const room = this._serpentRoomFor(fights, t.day);
      if (room === null) { no('the waters are full'); return; }
      if (room !== true) await this._serpentForget(fights, room);
      f = SERPENT_SEAM.new({ day: t.day, now, soundAt: t.soundAt, boss: serpentBossOf(t.day).id, sx: m.sx, sz: m.sz, yaw: serpentRiseYaw(t.day) });
      fights.set(id, f);
      await this._serpentIndex(fights);
      born = true;
    }
    else await this._serpentSay(fights, id, f, serpentBrain.serpentResume(f, now), now);
    this._setAttach(ws, { ...(this._all().get(ws) ?? a), sps: id, spd: t.day });
    const present = new Set();
    for (const [, sock] of this._all()) if (sock.id && sock.sub) present.add(sock.sub);
    const joined = !f.players[a.sub];
    if (!joined) await this._serpentHullBack(fights, id, f, a.sub, at.x, at.z, now);
    const lv = Number.isSafeInteger(a.cl) && a.cl >= 1 ? Math.min(m.lv, a.cl) : m.lv;
    if (!SERPENT_SEAM.join(f, a.sub, a.name ?? '', lv, now, present, { hl: m.hl, admits: serpentAdmits(t.day, now), near: off <= serpentBrain.ENGAGE_R })) {
      this._send(ws, JSON.stringify({ t: 'serpent', ...SERPENT_SEAM.stateOf(f) }));
      no(f.fell ? 'it is already slain' : Object.keys(f.players).length >= serpentBrain.SERPENT_FIGHTERS_MAX ? 'the waters are full' : 'the serpent is gone');
      return;
    }
    this._send(ws, JSON.stringify({ t: 'serpent', ...SERPENT_SEAM.stateOf(f) }));
    this._trailSeed(ws, a, now);
    if (joined || born) await this._serpentSave(id, f, now, true);
    if (!f.fell && !f.gone) await this._serpentArm(now);
  }
  async _serpentTick() {
    const fights = await this._serpentFights();
    if (!fights.size) return null;
    const now = Date.now();
    void this._relayCfgFresh(now);
    let at = Infinity, live = false;
    for (const [id, f] of [...fights]) {
      const end = f.soundAt + SERPENT_DIVE_MS + SERPENT_KEEP_MS;
      if (now >= end) { await this._serpentForget(fights, id); continue; }
      try {
        const stepped = !f.fell && !f.gone;
        if (stepped) {
          const line = this._bodyLine(), bodies = this._serpentBodies(f, true);
          for (const b of bodies) if (!b.dead) await this._serpentHullBack(fights, id, f, b.sub, b.x, b.z, now);
          await this._bodyCount('serpent', f, SERPENT_SEAM.judge(f, bodies, now), now, line.hull, (sub) => this._serpentCountWreck(fights, id, f, sub, now), { sx: f.sx, sz: f.sz });
          this._bodyTell('serpent', f, now, { sx: f.sx, sz: f.sz }, (p) => !!p.cw);
          const said = SERPENT_SEAM.step(f, now, this._bodiesBare(bodies), rand01);
          await this._serpentSave(id, f, now, serpentBrain.serpentSaysTrack(said));
          this._serpentFan(fights, id, f, said);
        }
        if (f.fell && !f.said) await this._serpentFall(id, f, now);
        else if (f.said && !f.told) await this._serpentTellHubOnce(id, f, now);
      } catch (e) { console.warn('[serpent] beat failed', e?.message ?? e); }
      const heard = [...this._all()].some(([, b]) => this._serpentHears(id, f, b));
      if (f.said && !f.told) at = Math.min(at, now + SERPENT_TELL_RETRY_MS);
      else if (heard && !f.fell && !f.gone) { at = Math.min(at, now + serpentBrain.SERPENT_TICK_MS); live = true; }
      else at = Math.min(at, end);
    }
    return fights.size ? { at, live } : null;
  }
  async _serpentFall(id, f, now) {
    const had = this._serpentFalling.get(id);
    if (had) return had;
    const p = this._serpentFallOnce(id, f, now).finally(() => { this._serpentFalling.delete(id); });
    this._serpentFalling.set(id, p);
    return p;
  }
  async _serpentFallOnce(id, f, now) {
    if (f.said) return;
    const key = await this._receiptKeyOf();
    const nowS = Math.floor(now / 1000);
    f.rc = {};
    for (const sub of Object.keys(f.players)) {
      if (!SERPENT_SEAM.earned(f, sub)) continue;
      const p = f.players[sub];
      try { f.rc[sub] = await mintSerpentReceipt({ d: f.day, b: f.boss, s: sub, c: rand32(), x: serpentBrain.serpentEarnedBy(f, sub), h: p.hl, l: p.lv, ...this._bodyMeasureOf(f, sub, SERPENT_SEAM.earned) }, key, { subtle: crypto.subtle, nowS }); }
      catch (e) { console.warn('[serpent] receipt refused', e?.message ?? e); }
    }
    f.said = true;
    f.here = [...new Set([...this._all()].filter(([, b]) => b.id && b.sub && f.rc[b.sub]).map(([, b]) => b.sub))].slice(0, serpentBrain.SERPENT_FIGHTERS_MAX);
    await this._serpentSave(id, f, now, true);
    const { at: fellAt, top, n, dm } = f.fell;
    this._serpentFan(this._serpents, id, f, [{ k: 'fell', at: fellAt, top, n, ...(dm ? { dm } : {}) }]);
    for (const [ws, b] of [...this._all()]) { const r = b.id && b.sub ? f.rc[b.sub] : null; if (r) this._send(ws, JSON.stringify({ t: 'serpent', k: 'rcpt', r })); }
    await this._serpentTellHubOnce(id, f, now);
  }
  async _serpentTellHubOnce(id, f, now) {
    if (f.told || !f.fell) return;
    const rooms = this.env?.ROOMS;
    let ok = true;
    if (rooms?.idFromName && rooms?.get) {
      try {
        const body = { d: f.day, b: f.boss, at: f.fell.at, top: f.fell.top, n: f.fell.n, sx: f.sx, sz: f.sz, rc: Object.entries(f.rc ?? {}), here: f.here ?? [], kin: serpentBrain.serpentKinOf(f) };
        const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${SERPENT_INTERNAL_FELL}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
        ok = !!res?.ok;
      } catch (e) { console.warn('[serpent] hub', e?.message ?? e); ok = false; }
    }
    if (!ok) return;
    f.told = true;
    await this._serpentSave(id, f, now, true);
  }
  async _serpentFellsOf() {
    if (this._serpentFells === undefined) { const v = await this.state.storage.get(SERPENT_FELLS_KEY); this._serpentFells = v && typeof v === 'object' && Array.isArray(v.list) ? v : null; }
    return this._serpentFells;
  }
  async _serpentReceiptTo(ws, sub, now) {
    if (this._noSerpentRcpt.has(sub)) return;
    const k = SERPENT_RC_PREFIX + sub;
    const kept = await this.state.storage.get(k);
    if (!kept || typeof kept !== 'object') { this._noSerpentRcpt.set(sub, 1); return; }
    if (!(Number.isFinite(kept.e) && now < kept.e * 1000) || typeof kept.r !== 'string') { await this.state.storage.delete(k); return; }
    this._send(ws, JSON.stringify({ t: 'serpent', k: 'rcpt', r: kept.r }));
  }
  async _serpentFellInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const fell = validSerpentOut({ k: 'fell', d: body?.d, at: body?.at, top: body?.top, n: body?.n, sx: body?.sx, sz: body?.sz });
    if (!fell || fell.d === undefined || fell.sx === undefined) return json({ ok: false }, 400);
    const now = Date.now();
    const rc = new Map();
    for (const e of Array.isArray(body.rc) ? body.rc.slice(0, serpentBrain.SERPENT_FIGHTERS_MAX) : []) {
      const r = Array.isArray(e) && typeof e[0] === 'string' ? validSerpentOut({ k: 'rcpt', r: e[1] }) : null;
      const c = r ? readSerpentReceipt(r.r) : null;
      if (c && c.s === e[0] && c.d === fell.d && Number.isFinite(c.e) && now < c.e * 1000) rc.set(e[0], { r: r.r, e: c.e });
    }
    await this._serpentKinShare(body, fell, rc, now);
    const keys = [...rc.keys()].map((sub) => SERPENT_RC_PREFIX + sub);
    const had = keys.length ? await this.state.storage.get(keys) : new Map();
    const fresh = [...rc].filter(([sub]) => { const v = had.get(SERPENT_RC_PREFIX + sub); return !(v && typeof v === 'object' && Number.isSafeInteger(v.d) && v.d > fell.d); });
    if (fresh.length) this._noSerpentRcpt.clear();
    for (let i = 0; i < fresh.length; i += 128) await this.state.storage.put(Object.fromEntries(fresh.slice(i, i + 128).map(([sub, v]) => [SERPENT_RC_PREFIX + sub, { d: fell.d, r: v.r, e: v.e }])));
    const kept = await this._serpentFellsOf();
    const newer = !kept || fell.d >= kept.d;
    if (newer) {
      const list = kept && kept.d === fell.d ? kept.list.filter((g) => !sameSerpentSite(g, fell)) : [];
      this._serpentFells = { d: fell.d, list: [...list, fell].slice(-SERPENT_FELLS_MAX) };
      await this.state.storage.put(SERPENT_FELLS_KEY, this._serpentFells);
      if (this._heraldOf()) await this._hubArm(now);
    }
    const said = newer && serpentHolds(fell.d, now) ? JSON.stringify({ t: 'serpent', ...fell }) : null;
    const here = new Set(Array.isArray(body.here) ? body.here.filter((x) => typeof x === 'string').slice(0, serpentBrain.SERPENT_FIGHTERS_MAX) : []);
    const handed = new Set(fresh.map(([sub]) => sub));
    if (said) for (const [ws, b] of [...this._all()]) if (b.id) this._send(ws, said);
    for (const [sub, [ws]] of this._siegeSockets()) if (handed.has(sub) && !here.has(sub)) this._send(ws, JSON.stringify({ t: 'serpent', k: 'rcpt', r: rc.get(sub).r }));
    return json({ ok: true });
  }
  async _serpentKinShare(body, fell, rc, now) {
    const kin = (Array.isArray(body?.kin) ? body.kin : []).slice(0, serpentBrain.SERPENT_FIGHTERS_MAX)
      .filter((e) => Array.isArray(e) && typeof e[0] === 'string' && e[0] && !rc.has(e[0]) && Number.isInteger(e[1]) && Number.isInteger(e[2]));
    if (!kin.length) return;
    const dealers = new Set();
    for (const [sub, v] of rc) if (readSerpentReceipt(v.r)?.x === 'dealt') dealers.add(sub);
    if (!dealers.size) return;
    const recs = await this._accts(kin.map((e) => e[0]));
    const parties = await this._partiesOf([...recs.values()].map((r) => r.party).filter((pid) => typeof pid === 'string'));
    const key = await this._receiptKeyOf(), nowS = Math.floor(now / 1000);
    const boss = typeof body.b === 'string' ? body.b : serpentBossOf(fell.d).id;
    for (const [sub, h, l] of kin) {
      const party = parties.get(recs.get(sub)?.party);
      if (!party?.members?.some((m) => m !== sub && dealers.has(m))) continue;
      try {
        const r = await mintSerpentReceipt({ d: fell.d, b: boss, s: sub, c: rand32(), x: 'stood', h, l }, key, { subtle: crypto.subtle, nowS });
        const c = readSerpentReceipt(r);
        if (c) rc.set(sub, { r, e: c.e });
      } catch (e) { console.warn('[serpent] kin receipt refused', e?.message ?? e); }
    }
  }
}
