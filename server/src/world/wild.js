// The open zone as the relay referees it: remains, fighter state, blows, picks, and the beat.
// It signs and hands out what is won, holds what is owed, and carries a fighter's bar via the hub.
import { WILD_REMAINS_PREFIX, remainsOf, remainsLive, remainsEmpty, remainsSpent, wildRemainsKey, remainsWords, remainsTakeover, remainsEvict, newRemains, foldFall, collectAsk, remainsNamedFor, takeFrom } from '../../../src/net/wildLaw.js';
import { verifyOrder, remainsDigest } from '../../../src/net/identityToken.js';
import { junkOutsideCover } from '../cellNodes.js';
import { sameGuild, newWildRef, WILD_FALL_PREFIX, wildFallOf, wildZone, wildDownWord, wildCredit, wildSignNow, wildKin, wildBlow, wildVitals, wildPick, wildStep, wildSigned, wildCarry, wildCarryOf } from '../../../src/net/wildRef.js';
import { mintWildCollect, mintWildReceipt } from '../../../src/net/wildReceipt.js';
import { SEA_WRECK_PREFIX, seaWreckOf, seaStep, seaCarry } from '../../../src/net/sea/seaRef.js';
import { isCellRoom, SOCIAL_ROOM, WILD_INTERNAL_VIT } from '../relay.js';
import { duelBoutOf } from '../../../src/net/duelRef.js';
import { lookKey } from '../room/keys.js';
import { SIEGE_HIT, siegeHeld } from '../../../src/net/siegeRef.js';
import { WILD_OWED_PREFIX, WILD_OWED_KEEP_MS } from './wildOwed.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { json } from '../room/json.js';

export class WildPart {
  _wildRemains(now) {
    if (!this._wildLoad) {
      this._wildLoad = (async () => {
        const map = new Map();
        const listed = await this.state.storage.list({ prefix: WILD_REMAINS_PREFIX });
        const dead = [];
        for (const [k, v] of listed) {
          const rec = remainsOf(v);
          if (rec && remainsLive(rec, now) && (!remainsEmpty(rec) || remainsSpent(rec))) map.set(rec.r, rec); else dead.push(k);
        }
        if (dead.length) await this.state.storage.delete(dead);
        return map;
      })();
      this._wildLoad.catch(() => { this._wildLoad = null; });
    }
    return this._wildLoad;
  }
  _wildFan(word) {
    const out = typeof word === 'string' ? word : JSON.stringify(word);
    for (const [other, b] of [...this._all()]) if (b.id) this._send(other, out);
  }
  async _wildDrop(map, r) {
    const spent = remainsSpent(map.get(r));
    if (!spent) this._wdunTellGone(map.get(r)?.os);
    map.delete(r);
    await this.state.storage.delete(wildRemainsKey(r));
    if (!spent) this._wildFan({ t: 'wild', k: 'gone', r });
  }
  async _wildHello(ws, now) {
    const map = await this._wildRemains(now);
    for (const rec of [...map.values()]) {
      if (!remainsLive(rec, now)) { await this._wildDrop(map, rec.r); continue; }
      if (remainsSpent(rec)) continue;
      for (const w of remainsWords(rec, now)) if (!this._send(ws, JSON.stringify(w))) return;
    }
  }
  async _wildWord(ws, a, d, now) {
    const map = await this._wildRemains(now);
    for (const rec of [...map.values()]) if (!remainsLive(rec, now)) await this._wildDrop(map, rec.r);
    if (d.k === 'fall') {
      const o = this._verifyKey ? await verifyOrder(d.o, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'remains' }) : { ok: false };
      if (!o.ok || o.claims.wr !== d.r) { this._junk(ws); return; }
      const c = o.claims;
      if (junkOutsideCover(this, ws, a, c.wm)) return;
      let rec = map.get(d.r);
      if (rec?.ok) return;
      if (rec && rec.oid !== a.id && !remainsTakeover(rec, a.id, now)) return;
      if (!rec) {
        const old = remainsEvict(map, now);
        if (old === '') return;
        if (old) await this._wildDrop(map, old);
        rec = newRemains({ r: d.r, os: c.s, oid: a.id, nm: a.sub === c.s ? (a.name ?? '') : '', p: d.p, now, gi: c.wg ?? null, wh: c.wh, wn: c.wn, wk: c.wk ?? null, wi: c.wi ?? -1, we: c.we === 1 });
        map.set(rec.r, rec);
      }
      if (rec.wh !== c.wh) { this._junk(ws); return; }
      const kept = foldFall(rec, { oid: a.id, items: d.items, last: d.last }, now);
      if (!kept) { this._junk(ws); return; }
      if (!rec.open) {
        rec.ok = rec.items.length === rec.wn && (await remainsDigest(rec.items, { subtle: crypto.subtle })) === rec.wh;
        if (!rec.ok) { map.delete(rec.r); await this.state.storage.delete(wildRemainsKey(rec.r)); this._junk(ws); return; }
      }
      await this.state.storage.put(wildRemainsKey(rec.r), rec);
      if (rec.ok) for (const w of remainsWords(rec, now)) this._wildFan(w);
      return;
    }
    const rec = map.get(d.r);
    const ask = rec ? collectAsk(rec, d.i, a.sub ?? null) : null;
    if (ask) {
      if (ask === 'mint') {
        const cr = await this._wildCollectMint(rec, a, now);
        if (!cr) { this._send(ws, JSON.stringify({ t: 'wild', k: 'no', r: d.r, i: d.i })); return; }
        const n = Math.max(1, Number.isInteger(rec.items[d.i]?.stackCount) ? rec.items[d.i].stackCount : 1);
        rec.wc = cr; rec.items[d.i] = null;
        if (remainsEmpty(rec)) this._wdunTellGone(rec.os);
        await this.state.storage.put(wildRemainsKey(rec.r), rec);
        this._wildFan({ t: 'wild', k: 'rm', r: d.r, i: d.i, n });
      }
      // Every ask gets the same signed collect; server-account/src/wild.js `wildCollect`
      // commits it once.
      this._send(ws, JSON.stringify({ t: 'wild', k: 'cr', r: d.r, i: d.i, cr: rec.wc }));
      if (ask === 'mint' && remainsSpent(rec)) this._wildFan({ t: 'wild', k: 'gone', r: d.r });
      return;
    }
    if (rec && !remainsNamedFor(rec, d.i) && rec.os && a.sub !== rec.os && (sameGuild(rec.gi, a.gi) || (a.sub && await this._wdunKinOf(a.sub, rec.os, now)))) {
      this._send(ws, JSON.stringify({ t: 'wild', k: 'no', r: d.r, i: d.i }));
      return;
    }
    const got = rec ? takeFrom(rec, d.i, d.n, a.sub ?? null) : null;
    if (!got) { this._send(ws, JSON.stringify({ t: 'wild', k: 'no', r: d.r, i: d.i })); return; }
    if (remainsEmpty(rec)) this._wdunTellGone(rec.os);
    await this.state.storage.put(wildRemainsKey(rec.r), rec);
    this._send(ws, JSON.stringify({ t: 'wild', k: 'got', r: d.r, i: d.i, it: got.it }));
    this._wildFan({ t: 'wild', k: 'rm', r: d.r, i: d.i, n: got.n });
    if (remainsSpent(rec)) this._wildFan({ t: 'wild', k: 'gone', r: d.r });
  }
  async _wildCollectMint(rec, a, now) {
    if (!a.sub || typeof a.ci !== 'string' || !a.ci) return null;
    try { return await mintWildCollect({ r: rec.r, k: a.sub, c: a.ci }, await this._receiptKeyOf(), { subtle: globalThis.crypto.subtle, nowS: Math.floor(now / 1000) }); } catch (e) { console.warn('[wild] collect failed', e?.message ?? e); return null; }
  }
  async _wildSt() {
    const st = (this._wildRef ??= newWildRef());
    if (!this._wildFallsRead) {
      this._wildFallsRead = true;
      try {
        for (const [, v] of await this.state.storage.list({ prefix: WILD_FALL_PREFIX })) { const f = wildFallOf(v); if (f && !st.falls.has(f.r)) st.falls.set(f.r, f); }
        for (const [, v] of await this.state.storage.list({ prefix: SEA_WRECK_PREFIX })) { const w = seaWreckOf(v); if (w) (st.wrecks ??= new Map()).set(w.r, w); }
      } catch (e) { this._wildFallsRead = false; console.warn('[wild] falls read failed', e?.message ?? e); }
    }
    return st;
  }
  async _wildZoneWord(a, z, now, died = false) {
    if (!a.sub || (z === 1 && !a.ci)) return;
    const st = await this._wildSt();
    if (z !== 1 && died) await this._wildCredit(st, a, now);
    const was = st.fighters.get(a.sub);
    const carry = z === 1 && (!was || !was.zone) ? await this._wildCarryAsk(a.sub) : null;
    const x = wildZone(st, a.sub, { id: a.id, lv: a.lv, ci: a.ci ?? '', carry }, z === 1, a.pose, now);
    if (x && carry?.sea) x.seaCarry = carry.sea;
    if (z === 1) this._wildDownSay(st, a.sub, now);
    const owed = await this._wildOwedOf(a.sub, now), sk = this._siegeSocketOf(a.sub);
    if (owed && sk) { for (const w of owed) this._send(sk[0], JSON.stringify(w)); this._wildOwed?.delete(a.sub); this._wildOwedKeep(a.sub); }
  }
  _wildDownSay(st, sub, now) {
    const word = wildDownWord(st, sub, now);
    const socket = word ? this._siegeSocketOf(sub) : null;
    if (socket) this._send(socket[0], JSON.stringify({ t: 'wref', ...word }));
  }
  async _wildCredit(st, a, now) {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    const rid = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    const res = wildCredit(st, a.sub, rid, now);
    if (!res) return;
    if (res.evicted) await this._wildSign(res.evicted, now);
    try { await this.state.storage.put(`${WILD_FALL_PREFIX}${rid}`, res.fall); } catch (e) { console.warn('[wild] credited fall kept failed', e?.message ?? e); }
    this._wildFan({ t: 'wref', k: 'fell', id: a.id, by: res.fall.killerId, r: rid });
    if (!isCellRoom(res.fall.m || a.key)) { const f = wildSignNow(st, rid); if (f) await this._wildSign(f, now); }
  }
  async _wildBlow(a, d, now) {
    if (!a.sub) return;
    const st = await this._wildSt();
    const target = this._idFirst(d.to);
    const tb = target?.[1];
    const fa = st.fighters.get(a.sub), ft = tb?.sub ? st.fighters.get(tb.sub) : null;
    if (!fa || !ft || !fa.zone || !ft.zone || fa.down || ft.down) return;
    const duel = this._duelRef ? duelBoutOf(this._duelRef, a.sub) : null;
    const duelKin = !!duel && (duel.a.sub === tb.sub || duel.b.sub === tb.sub);
    const kin = wildKin({ duel: duelKin, guilds: [a.gi, tb.gi] }) || wildKin({ party: await this._wdunKinOf(a.sub, tb.sub, now) });
    let look = null;
    if (d.k === 'strike') {
      look = this._looks.get(a.id) ?? null;
      if (!look) { look = (await this.state.storage.get(lookKey(a.id))) ?? null; if (look) this._looks.set(a.id, look); }
    }
    const r = d.k === 'spell' ? SIEGE_HIT.Spell : d.by === 'arrow' ? SIEGE_HIT.Shaft : SIEGE_HIT.Melee;
    const held = d.k === 'strike' ? siegeHeld(look, d.w ? d.w.t : -1, d.w ? d.w.m : 0) : null;
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    const rid = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    const res = wildBlow(st, a.sub, tb.sub, { d: d.d, r, held, wa: a.wa ?? null, kin, rid, room: a.key }, now);
    if (res.evicted) await this._wildSign(res.evicted, now);
    if (!res.ok || !res.dealt) return;
    const word = JSON.stringify({ t: 'wref', k: 'hp', by: a.id, to: tb.id, d: res.dealt, r, h: wildVitals(st, a.sub, tb.sub) });
    this._send(target[0], word);
    const mine = this._siegeSocketOf(a.sub);
    if (mine) this._send(mine[0], word);
    this._wildCarryPut(tb.sub, this._zoneCarry(st, tb.sub, now));
    if (!res.fell) return;
    try { await this.state.storage.put(`${WILD_FALL_PREFIX}${rid}`, res.fall); } catch (e) { console.warn('[wild] fall kept failed', e?.message ?? e); }
    this._wildFan({ t: 'wref', k: 'fell', id: tb.id, by: a.id, r: rid });
    if (!isCellRoom(a.key)) { const f = wildSignNow(st, rid); if (f) await this._wildSign(f, now); }
  }
  async _wildPickWord(a, d, now) {
    if (!a.sub) return;
    const st = await this._wildSt();
    const fall = wildPick(st, a.sub, d.r, d.w, now, Number.isInteger(d.t) ? [d.t, d.m] : null);
    if (fall) await this._wildSign(fall, now);
  }
  async _wildBeat(now) {
    const st = await this._wildSt();
    for (const w of seaStep(st, now)) await this._seaSign(w, now);
    if (!st.falls.size) return;
    for (const fall of wildStep(st, now)) await this._wildSign(fall, now);
  }
  async _wildSign(fall, now) {
    let rc = null;
    const fallenGone = this._siegeSocketOf(fall.fallen) ? 0 : 1;
    try { rc = await mintWildReceipt({ f: fall.fallen, c: fall.ci, k: fall.killer, r: fall.r, w: fall.w, wt: fall.wt, m: fall.m, kc: fall.kc, g: fallenGone }, await this._receiptKeyOf(), { subtle: globalThis.crypto.subtle, nowS: Math.floor(now / 1000) }); } catch (e) { console.warn('[wild] receipt failed', e?.message ?? e); }
    wildSigned(this._wildRef, fall.r);
    try { await this.state.storage.delete(`${WILD_FALL_PREFIX}${fall.r}`); } catch {  }
    if (!rc) return;
    this._wildHand([fall.fallen, fall.killer], { t: 'wref', k: 'rc', r: fall.r, rc });
  }
  _wildHand(subs, word) {
    for (const sub of subs) {
      const sk = this._siegeSocketOf(sub);
      if (sk) { this._send(sk[0], JSON.stringify(word)); continue; }
      this._wildOwed ??= new Map();
      if (this._wildOwed.size >= 256) this._wildOwed.delete(this._wildOwed.keys().next().value);
      this._wildOwed.set(sub, [...(this._wildOwed.get(sub) ?? []).slice(-3), word]);
      this._wildOwedKeep(sub);
    }
  }
  _wildOwedKeep(sub) {
    const words = this._wildOwed?.get(sub) ?? [], key = `${WILD_OWED_PREFIX}${sub}`;
    const p = words.length ? this.state.storage.put(key, { at: Date.now(), words }) : this.state.storage.delete(key);
    Promise.resolve(p).catch((e) => console.warn('[wild] owed kept', e?.message ?? e));
  }
  async _wildOwedOf(sub, now) {
    const had = this._wildOwed?.get(sub);
    if (had) return had;
    this._wildOwedRead ??= new Set();
    if (this._wildOwedRead.has(sub)) return null;
    if (this._wildOwedRead.size >= 4096) this._wildOwedRead.clear();
    this._wildOwedRead.add(sub);
    let v = null;
    try { v = await this.state.storage.get(`${WILD_OWED_PREFIX}${sub}`); } catch { return null; }
    if (!v) return null;
    if (!Array.isArray(v.words) || !(now - v.at < WILD_OWED_KEEP_MS)) { this._wildOwedKeep(sub); return null; }
    return v.words.slice(-4);
  }
  _wildRid() {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  _zoneCarry(st, sub, now) {
    const c = wildCarry(st, sub, now);
    return c ? { ...c, sea: seaCarry(st, sub) } : null;
  }
  _wildCarryPut(sub, carry) {
    const rooms = this.env?.ROOMS;
    if (!carry || !rooms?.idFromName || !rooms?.get) return;
    const p = rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${WILD_INTERNAL_VIT}`, { method: 'POST', body: JSON.stringify({ sub, put: carry }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
    p.catch((e) => console.warn('[wild] vit put', e?.message ?? e));
    try { this.state.waitUntil?.(p); } catch {  }
  }
  async _wildCarryAsk(sub) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return null;
    try {
      const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${WILD_INTERNAL_VIT}`, { method: 'POST', body: JSON.stringify({ sub }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
      return res?.ok ? wildCarryOf((await res.json())?.carry) : null;
    } catch (e) { console.warn('[wild] vit ask', e?.message ?? e); return null; }
  }
  async _wildVitInternal(request) {
    let body = null;
    try { body = await request.json(); } catch { body = null; }
    const sub = typeof body?.sub === 'string' && body.sub.length > 0 && body.sub.length <= 128 ? body.sub : null;
    if (!sub) return json({ error: 'bad vit' }, 400);
    this._wildVits ??= new Map();
    if (body.put === undefined) return json({ carry: this._wildVits.get(sub) ?? null });
    const c = wildCarryOf(body.put);
    if (!c) return json({ error: 'bad vit' }, 400);
    const had = this._wildVits.get(sub);
    if (!had || had.at <= c.at) {
      this._wildVits.delete(sub);
      if (this._wildVits.size >= 4096) this._wildVits.delete(this._wildVits.keys().next().value);
      this._wildVits.set(sub, c);
    }
    return json({ ok: true });
  }
}
