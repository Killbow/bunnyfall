// The super dungeon: the one record the hub holds, its beat, census, and finds, read once a wake.
// It answers finds and hall words, tells cells and realms, admits by the record, and marks falls.
import { validSdRecord, SD_KEY, SD_SLOT_KEY, SD_REGION_COUNT, chatRegionRoom, SD_INTERNAL_CENSUS, CHAT_SOCKETS_MAX, validSdFoundTell, worldRoom, sanitizeName, SD_FOUND_KEY, SD_TELL_RETRY_MS, SOCIAL_ROOM, SD_INTERNAL_FOUND, SD_REALM_KEY, SD_FIGHTERS_MAX, sdDeadKey, SD_INTERNAL_IN, SD_ORRERY_KEY } from '../relay.js';
import { sdDue, sdFirst, sdGone, sdRise, pickSdRegion, sdFindBelieved, sdFind, sdNearSite, sdSlotOfRoom, sdHolds, SD_NO_CLOSED, sdDownWord, SD_NO_FALLEN, sdAdmits, SD_NO_FULL, sdMayRaise, isSdRoom, SD_REZ_MS } from '../../../src/net/sdLaw.js';
import { SD_BEAT_RETRY_MS, SD_CENSUS_BATCH, SD_FIND_KNOWN_MS, SD_LIVE_FRESH_MS, SD_LIVE_KEEP_MS, SD_LIVE_MISS_MS, sdLiveAsk, SD_NO_BUSY, SD_GUEST_SEATS, SD_PZ_WAIT_SAY_MS } from '../worker/sdLive.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { json } from '../room/json.js';
import { junkOutsideCover } from '../cellNodes.js';
import { SD_LOST_MS } from '../../../src/net/sdRemnant.js';
import { bodyLife } from '../../../src/net/bossBody.js';
import { dungeonToRealm, SD_HOURS, SD_STONES, SD_FRAY_MAX, orreryFresh, orreryOf, orreryLit, stoneInReach, SD_STONE_REACH_SLACK, orreryTurnerOf, orreryJudge, orreryLashed, orreryRightsSnapped, orreryRightsFresh } from '../../../src/net/sdBrain.js';

export class SdPart {
  async _sdOf() {
    if (this._sdRec === undefined) { const v = validSdRecord(await this.state.storage.get(SD_KEY)); if (this._sdRec === undefined) this._sdRec = v; }
    return this._sdRec;
  }
  async _sdHwOf() {
    if (this._sdHw === undefined) { const v = await this.state.storage.get(SD_SLOT_KEY); if (this._sdHw === undefined) this._sdHw = Number.isSafeInteger(v) && v > 0 ? v : 0; }
    return this._sdHw;
  }
  async _sdSave(rec) {
    const hw = Math.max(await this._sdHwOf(), rec?.s ?? 0);
    this._sdRec = rec; this._sdHw = hw;
    await this.state.storage.put({ [SD_KEY]: rec, [SD_SLOT_KEY]: hw });
  }
  _sdFan(rec) {
    const said = JSON.stringify({ t: 'sd', k: 'ev', ...rec });
    for (const [ws, b] of [...this._all()]) if (b.id) this._send(ws, said);
  }
  async _sdArm(now) {
    const due = sdDue(await this._sdOf(), now);
    await this._hubArm(due.act ? now : due.at);
  }
  async _sdBeat(now) {
    try { await this._sdHeldBeat(now); } catch (e) { console.warn('[sd] held beat failed', e?.message ?? e); await this._hubArm(now + SD_BEAT_RETRY_MS); }
    try {
      for (let step = 0; step < 4; step++) {
        const rec = await this._sdOf();
        const due = sdDue(rec, now);
        // A fresh record continues from the highest slot raised; slot numbers key realms, receipts,
        // and spent marks, so restarting at 1 collides with them.
        if (due.act === 'first') { const hw = await this._sdHwOf(); await this._sdSave(hw > 0 ? { ...sdFirst(now), s: hw } : sdFirst(now)); continue; }
        if (due.act === 'gone') { const g = sdGone(rec, now); if (!g) break; await this._sdSave(g); this._sdFan(g); continue; }
        if (due.act === 'rise') {
          const counts = await this._sdCensus();
          const cur = await this._sdOf();
          const risen = sdRise(cur, now, pickSdRegion((cur?.s ?? 0) + 1, counts, cur?.s ? cur.r : -1));
          if (!risen) break;
          await this._sdSave(risen); this._sdFan(risen);
          continue;
        }
        if (due.at != null) await this._hubArm(due.at);
        break;
      }
    } catch (e) { console.warn('[sd] beat failed', e?.message ?? e); await this._hubArm(now + SD_BEAT_RETRY_MS); }
  }
  async _sdCensus() {
    const counts = new Array(SD_REGION_COUNT).fill(0);
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return counts;
    for (let i = 0; i < SD_REGION_COUNT; i += SD_CENSUS_BATCH) {
      await Promise.all(counts.slice(i, i + SD_CENSUS_BATCH).map(async (_, j) => {
        const r = i + j;
        try {
          const res = await rooms.get(rooms.idFromName(chatRegionRoom(r))).fetch(new Request(`https://relay.internal${SD_INTERNAL_CENSUS}`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(ROOM_CALL_MS) }));
          const v = res?.ok ? await res.json() : null;
          if (Number.isSafeInteger(v?.n) && v.n >= 0) counts[r] = Math.min(v.n, CHAT_SOCKETS_MAX);
        } catch (e) { console.warn('[sd] census', r, e?.message ?? e); }
      }));
    }
    return counts;
  }
  async _sdCensusInternal() {
    const subs = new Set();
    for (const [, b] of this._all()) if (b.id && b.lk && typeof b.sub === 'string' && b.sub) subs.add(b.sub);
    return json({ n: subs.size });
  }
  async _sdFoundInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const c = validSdFoundTell(body);
    if (!c) return json({ ok: false }, 400);
    const now = Date.now();
    const rec = await this._sdOf();
    if (sdFindBelieved(rec, now, c, c)) {
      const found = sdFind(rec, now, c.fb);
      if (found) { await this._sdSave(found); this._sdFan(found); }
      if (found) await this._sdHeraldArm(now);
    }
    const held = await this._sdOf();
    return json({ ok: true, s: held?.s ?? 0, ...(Number.isSafeInteger(held?.next) ? { next: held.next } : {}) });
  }
  async _sdLiveInternal() {
    const rec = await this._sdOf();
    return json({ rec: rec && rec.s > 0 ? rec : null });
  }
  async _sdFoundWord(ws, a, m, now) {
    if (junkOutsideCover(this, ws, a, worldRoom(m.px, m.py))) return;
    if (!a.pose || !sdNearSite(m, a.pose) || typeof a.sub !== 'string' || !a.sub) return;
    if (this._sdTold?.has(m.s)) return;
    const known = this._sdHubSlot;
    if (known && now - known.at < SD_FIND_KNOWN_MS && m.s !== known.s && !(m.s === known.s + 1 && now >= (known.next ?? Infinity))) return;
    const had = await this._sdFoundOf();
    if (had && had.s >= m.s) return;
    await this._sdFoundSave({ s: m.s, px: m.px, py: m.py, x: a.pose.x, z: a.pose.z, fb: sanitizeName(a.name ?? '') });
    await this._sdTellHub(now);
  }
  async _sdFoundOf() {
    if (this._sdFound === undefined) { const v = validSdFoundTell(await this.state.storage.get(SD_FOUND_KEY)); if (this._sdFound === undefined) this._sdFound = v; }
    return this._sdFound;
  }
  async _sdFoundSave(v) {
    this._sdFound = v;
    if (v) await this.state.storage.put(SD_FOUND_KEY, v);
    else await this.state.storage.delete(SD_FOUND_KEY);
  }
  async _sdTellHub(now) {
    const owed = await this._sdFoundOf();
    if (!owed) return false;
    if (this._sdTelling) { await this._sdCellArm(now + SD_TELL_RETRY_MS); return true; }
    this._sdTelling = true;
    try {
      await this._sdCellArm(now + SD_TELL_RETRY_MS);
      const ans = await this._sdTellHubOf(owed);
      if (!ans) return true;
      if (!this._sdTold) this._sdTold = new Set();
      if (this._sdTold.size >= 8) this._sdTold.delete(this._sdTold.values().next().value);
      if (!(Number.isSafeInteger(ans.s) && owed.s > ans.s)) this._sdTold.add(owed.s);
      if (Number.isSafeInteger(ans.s)) this._sdHubSlot = { s: ans.s, at: Date.now(), ...(Number.isSafeInteger(ans.next) ? { next: ans.next } : {}) };
      if (this._sdFound === owed) await this._sdFoundSave(null);
      return !!this._sdFound;
    } finally { this._sdTelling = false; }
  }
  async _sdCellArm(at) {
    try { const had = await this.state.storage.getAlarm(); if (had == null || had > at) await this.state.storage.setAlarm(at); }
    catch (e) { console.warn('[sd] arm', e?.message ?? e); }
  }
  async _sdTellHubOf(body) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return {};
    try {
      const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${SD_INTERNAL_FOUND}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(SD_TELL_RETRY_MS) }));
      if (!res || !(res.ok || (res.status >= 400 && res.status < 500))) return null;
      try { const v = res.ok ? await res.json() : null; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
    } catch (e) { console.warn('[sd] hub', e?.message ?? e); return null; }
  }
  async _sdLiveOf(s, now) {
    const had = this._sdLive?.s === s ? this._sdLive : null;
    if (had && had.rec !== undefined && now - had.at < SD_LIVE_FRESH_MS) return had.rec;
    const kept = had && had.rec !== undefined && now - had.at < SD_LIVE_KEEP_MS ? had.rec : undefined;
    if (had && had.missAt != null && now - had.missAt < SD_LIVE_MISS_MS) return kept;
    if (this._sdAsking?.s === s) return this._sdAsking.p;
    const p = (async () => {
      const rec = await sdLiveAsk(this.env?.ROOMS, s);
      const at = Date.now();
      if (rec !== undefined) { this._sdLive = { s, at, rec }; return rec; }
      this._sdLive = { s, at: had?.at ?? 0, rec: had?.rec, missAt: at };
      return kept;
    })();
    this._sdAsking = { s, p };
    try { return await p; } finally { if (this._sdAsking?.p === p) this._sdAsking = null; }
  }
  async _sdRealmOf(s) {
    if (this._sdRealm === undefined) {
      const v = await this.state.storage.get(SD_REALM_KEY);
      const strs = (xs) => (Array.isArray(xs) ? xs.filter((x) => typeof x === 'string').slice(0, SD_FIGHTERS_MAX) : []);
      const downs = (xs) => (Array.isArray(xs) ? xs.filter((d) => Array.isArray(d) && typeof d[0] === 'string' && Number.isSafeInteger(d[1])).map((d) => (Number.isFinite(d[2]) && Number.isFinite(d[3]) ? [d[0], d[1], d[2], d[3]] : [d[0], d[1]])).slice(0, SD_FIGHTERS_MAX) : []);
      const raised = (xs) => downs(xs).map(([x, at]) => [x, at]);
      if (this._sdRealm === undefined) this._sdRealm = v && v.s === s && Array.isArray(v.in) ? { s, in: strs(v.in), gu: strs(v.gu), dead: strs(v.dead), down: downs(v.down), raised: raised(v.raised) } : { s, in: [], gu: [], dead: [], down: [], raised: [] };
    }
    return this._sdRealm;
  }
  async _sdAdmit(key, sub, now, guest = false) {
    const s = sdSlotOfRoom(key);
    const rec = await this._sdLiveOf(s, now);
    if (rec === undefined) return SD_NO_BUSY;
    if (!rec || rec.s !== s || !sdHolds(rec, now)) return SD_NO_CLOSED;
    const realm = await this._sdRealmOf(s);
    const lies = sub ? sdDownWord(realm, sub, now) : null;
    if (lies === 'down') return SD_NO_BUSY;
    if (lies === 'fallen' && !realm.dead.includes(sub)) await this._sdBury(realm, sub);
    if (sub && (lies === 'fallen' || (realm.dead.length >= SD_FIGHTERS_MAX && (await this.state.storage.get(sdDeadKey(sub))) != null))) return SD_NO_FALLEN;
    if (sub && realm.in.includes(sub)) { if (lies === 'rise') await this._sdRose(realm, sub, now); this._sdTellIn(s, rec, now); return null; }
    if (!sdAdmits(rec, now)) return SD_NO_CLOSED;
    const f = await this._sdFightOf();
    if (f?.fell) return SD_NO_CLOSED;
    const living = f && !f.lost && !f.fell && now - (f.lastTickAt ?? 0) < SD_LOST_MS ? f : null;
    const present = new Set([...this._all()].map(([, b]) => b.sub).filter(Boolean));
    const guests = new Set(realm.gu);
    const free = (pick) => {
      const i = realm.in.findIndex((x) => pick(x) && !present.has(x) && !living?.players?.[x]);
      if (i < 0) return false;
      const [x] = realm.in.splice(i, 1);
      realm.gu = realm.gu.filter((g) => g !== x); guests.delete(x);
      return true;
    };
    if (sub && guest && realm.in.filter((x) => guests.has(x)).length >= SD_GUEST_SEATS && !free((x) => guests.has(x))) return SD_NO_FULL;
    if (realm.in.length >= SD_FIGHTERS_MAX && !free(() => true)) return SD_NO_FULL;
    if (sub && !realm.in.includes(sub)) { realm.in.push(sub); if (guest) realm.gu.push(sub); await this.state.storage.put(SD_REALM_KEY, realm); }
    if (lies === 'rise') await this._sdRose(realm, sub, now);
    this._sdTellIn(s, rec, now);
    return null;
  }
  async _sdRose(realm, sub, now) {
    realm.down = realm.down.filter(([x]) => x !== sub);
    realm.raised = (realm.raised ?? []).filter(([x]) => x !== sub);
    await this.state.storage.put(SD_REALM_KEY, realm);
    const f = await this._sdFightOf();
    if (f?.players?.[sub]) { bodyLife(f.players[sub], now, this._bodyLine().body); await this._sdFightSave(f, now, true); }
  }
  async _sdRaise(ws, a, m, now) {
    if (typeof a.sub !== 'string' || !a.sub || typeof m.to !== 'string' || !m.to || m.to.length > 128 || !a.pose || a.pose.dd) return;
    const realm = await this._sdRealmOf(sdSlotOfRoom(a.key));
    if (!sdMayRaise(realm, a.sub, m.to, now, dungeonToRealm(a.pose.x, a.pose.y ?? 0, a.pose.z))) return;
    realm.raised = [...(realm.raised ?? []).filter(([x]) => x !== m.to), [m.to, now]].slice(-SD_FIGHTERS_MAX);
    await this.state.storage.put(SD_REALM_KEY, realm);
  }
  _sdTellIn(s, rec, now) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get || rec?.inAt != null || !sdAdmits(rec, now) || this._sdInTold === s || this._sdInTelling === s) return;
    this._sdInTelling = s;
    const p = this._sdTellInNow(s, rooms).finally(() => { if (this._sdInTelling === s) this._sdInTelling = null; });
    try { this.state.waitUntil?.(p); } catch {  }
  }
  async _sdTellInNow(s, rooms) {
    try {
      if ((await this._sdFightOf())?.fell) return;
      const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${SD_INTERNAL_IN}`, { method: 'POST', body: JSON.stringify({ s }), signal: AbortSignal.timeout(SD_TELL_RETRY_MS) }));
      // Only a 400 is final; any other refusal, such as an older hub's 404, stays owed.
      if (res && (res.ok || res.status === 400)) { this._sdInTold = s; this._sdInOwed = null; return; }
    } catch (e) { console.warn('[sd] in', e?.message ?? e); }
    this._sdInOwed = s;
    this._sdInRetryAt = Date.now() + SD_TELL_RETRY_MS;
    await this._sdCellArm(this._sdInRetryAt);
  }
  async _sdInBeat(now) {
    if (this._sdInOwed === undefined) { const key = [...this._all()].map(([, b]) => b.key).find((k) => isSdRoom(k)); this._sdInOwed = key ? sdSlotOfRoom(key) : null; }
    const s = this._sdInOwed;
    if (s == null) return;
    if (now < (this._sdInRetryAt ?? 0)) { await this._sdCellArm(this._sdInRetryAt); return; }
    this._sdInOwed = null;
    if (!(await this._sdRealmOf(s)).in.length) return;
    const rec = await this._sdLiveOf(s, now);
    if (rec === undefined) { this._sdInOwed = s; this._sdInRetryAt = now + SD_TELL_RETRY_MS; await this._sdCellArm(this._sdInRetryAt); return; }
    this._sdTellIn(s, rec, now);
  }
  async _sdMarkFallen(key, sub, p = null) { return this._sdMarkFallenAt(sdSlotOfRoom(key), sub, Date.now(), p && Number.isFinite(p.x) && Number.isFinite(p.z) ? dungeonToRealm(p.x, p.y ?? 0, p.z) : null); }
  async _sdMarkFallenAt(s, sub, now = Date.now(), at = null) {
    const realm = await this._sdRealmOf(s);
    if (realm.dead.includes(sub) || realm.down.some(([x]) => x === sub)) return;
    for (const [x] of realm.down.filter(([, t]) => now - t > SD_REZ_MS)) await this._sdBury(realm, x, false);
    const lying = [...realm.down.filter(([, t]) => now - t <= SD_REZ_MS), at ? [sub, now, Math.round(at[0] * 100) / 100, Math.round(at[2] * 100) / 100] : [sub, now]];
    for (const [x] of lying.slice(0, Math.max(0, lying.length - SD_FIGHTERS_MAX))) await this._sdBury(realm, x, false);
    realm.down = lying.slice(-SD_FIGHTERS_MAX);
    realm.raised = (realm.raised ?? []).filter(([x]) => x !== sub);
    await this.state.storage.put(SD_REALM_KEY, realm);
  }
  async _sdBury(realm, sub, keep = true) {
    realm.down = realm.down.filter(([x]) => x !== sub);
    if (realm.dead.includes(sub)) return;
    if (realm.dead.length >= SD_FIGHTERS_MAX) await this.state.storage.put(sdDeadKey(sub), 1);
    else realm.dead.push(sub);
    if (keep) await this.state.storage.put(SD_REALM_KEY, realm);
  }
  async _sdHallOf(s) {
    if (this._sdHall === undefined || this._sdHall.s !== s) {
      const v = await this.state.storage.get(SD_ORRERY_KEY);
      const hour = (h) => Number.isInteger(h) && h >= 0 && h < SD_HOURS;
      const kept = v && v.s === s && Array.isArray(v.st) && v.st.length === SD_STONES.length && v.st.every(hour) && Number.isInteger(v.f)
        && v.f >= 0 && v.f <= SD_FRAY_MAX && typeof v.ok === 'boolean' && Array.isArray(v.last) && v.last.length === SD_STONES.length && v.last.every(Number.isSafeInteger);
      if (this._sdHall === undefined || this._sdHall.s !== s) this._sdHall = kept ? { s, st: [...v.st], f: v.f, ok: v.ok, last: [...v.last] } : { s, ...orreryFresh(orreryOf(s)), last: SD_STONES.map(() => 0) };
    }
    return this._sdHall;
  }
  _sdHallWord(hall, turn = {}) {
    return JSON.stringify({ t: 'sd', k: 'pz', s: hall.s, st: hall.st, f: hall.f, lit: orreryLit(orreryOf(hall.s), hall.st), ok: hall.ok, ...turn });
  }
  async _sdTurn(ws, a, m, now) {
    if (typeof a.sub !== 'string' || !a.sub || !a.pose || a.pose.dd) return;
    const s = sdSlotOfRoom(a.key), o = orreryOf(s);
    if (!o) return;
    const meter = this._meterOf(ws);
    const [x, , z] = dungeonToRealm(a.pose.x, a.pose.y ?? 0, a.pose.z);
    if (!stoneInReach(m.i, x, z, SD_STONE_REACH_SLACK)) return;
    const rec = await this._sdLiveOf(s, now);
    if (!rec || rec.s !== s || !sdHolds(rec, now)) return;
    const hall = await this._sdHallOf(s);
    now = Date.now();
    if (m.q <= (meter.pzq ?? -1)) return;
    const R = this._sdRightsOf(s), who = orreryTurnerOf(a.sub, !a.lk);
    const res = orreryJudge(o, hall, hall.last, m.i, m.a, now, R, who, a.id);
    if (!res) return;
    if (res.wait) {
      if (!(now - (meter.pzw ?? -Infinity) < SD_PZ_WAIT_SAY_MS)) { meter.pzw = now; this._send(ws, this._sdHallWord(hall, { w: 1 })); }
      return;
    }
    meter.pzq = m.q;
    const lash = res.x ? { x: 1, ls: orreryLashed(R, SD_FIGHTERS_MAX) } : {};
    if (res.x) this._sdRights = { s, R: orreryRightsSnapped(R) };
    hall.st = res.st; hall.f = res.f; hall.ok = res.ok; hall.last[m.i] = now;
    await this.state.storage.put(SD_ORRERY_KEY, hall);
    const word = this._sdHallWord(hall, { i: m.i, a: m.a, id: a.id, q: m.q, ...lash });
    for (const [other, b] of [...this._all()]) if (b.id) this._send(other, word);
  }
  _sdRightsOf(s) {
    if (this._sdRights?.s !== s) this._sdRights = { s, R: orreryRightsFresh() };
    return this._sdRights.R;
  }
}
