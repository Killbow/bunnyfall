// The PvP dungeon halls the hub records, read once a wake, with their words, wipes, and resets.
// It answers whether a party holds an account, for the halls and the instance door, and who left.
import { wdunOf, WDUN_KEY, wdunPrune, wdunGiants, wdunBound, wdunCrows, wdunState, wdunGiantDie, wdunFleetSunk, wdunFleets, wdunEnter, wdunHere, wdunLeave, wdunDie, wdunGone } from '../../../src/net/wildLaw.js';
import { WDUN_HERE_MS, wdunHall, WILD_REMAINS_MS as WDUN_PILE_MS, wdunRoomKey, layerName, WDUN_INTERNAL_RESET, DUNGEON_ROOM_TAGS, LAYERS_MAX, SOCIAL_ROOM, WDUN_INTERNAL_KIN, WDUN_INTERNAL_GONE } from '../relay.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { json } from '../room/json.js';
import { WILD_REF } from '../../../src/net/wildRef.js';
import { INSTANCE_KIN_KEEP_MS, INSTANCE_INTERNAL_KIN, partyHoldsOwner } from '../../../src/net/instanceRoom.js';
import { WDUN_KIN_SILENT_MS } from '../room/holds.js';

export class WdunPart {
  async _wdunRec(now) {
    if (!this._wdun) this._wdun = wdunOf(await this.state.storage.get(WDUN_KEY));
    const before = JSON.stringify(this._wdun.crows), beforeG = JSON.stringify(this._wdun.giants ?? {});
    if (wdunPrune(this._wdun, now)) {
      await this._wdunSave(now, true);
      if (JSON.stringify(this._wdun.crows) !== before) this._wdunFanCrows(now);
      if (JSON.stringify(this._wdun.giants ?? {}) !== beforeG) this._wildFan({ t: 'wdun', k: 'gd', giants: wdunGiants(this._wdun, now) });
    }
    return this._wdun;
  }
  async _wdunSave(now, force = false) {
    if (!force && now - this._wdunSavedAt < WDUN_HERE_MS) return;
    this._wdunSavedAt = now;
    wdunBound(this._wdun);
    await this.state.storage.put(WDUN_KEY, this._wdun);
  }
  _wdunFanCrows(now, who = null) { this._wildFan({ t: 'wdun', k: 'cr', crows: wdunCrows(this._wdun, now), ...(who ? { who } : {}) }); }
  async _wdunWord(ws, acct, m, now, a = null) {
    const st = await this._wdunRec(now);
    if (m.k === 'hi') { this._send(ws, JSON.stringify(wdunState(st, acct, now))); return; }
    if (m.k === 'gk') {
      if (wdunGiantDie(st, m.g, now)) { await this._wdunSave(now, true); this._wildFan({ t: 'wdun', k: 'gd', giants: wdunGiants(st, now) }); }
      return;
    }
    if (m.k === 'fk') {
      if (a?.gu) return;
      if (wdunFleetSunk(st, m.n, now)) { await this._wdunSave(now, true); this._wildFan({ t: 'wdun', k: 'fd', fleets: wdunFleets(st, now) }); }
      return;
    }
    const h = wdunHall(m.h);
    if (!h) return;
    if (m.k === 'in') {
      const r = wdunEnter(st, acct, h, now);
      if (!r.ok) { this._send(ws, JSON.stringify({ t: 'wdun', k: 'no', h, left: r.left })); return; }
      if (r.reset) await this._wdunWipe(h);
      await this._wdunSave(now, true);
      this._send(ws, JSON.stringify({ t: 'wdun', k: 'ok', h, ep: r.ep }));
      return;
    }
    if (m.k === 'here') { if (wdunHere(st, acct, h, now)) await this._wdunSave(now); return; }
    if (m.k === 'out') {
      const left = wdunLeave(st, acct, h, now);
      await this._wdunSave(now, true);
      this._send(ws, JSON.stringify({ t: 'wdun', k: 'lk', h, left }));
      return;
    }
    if (m.k === 'die') {
      wdunDie(st, acct, h, now, now + WDUN_PILE_MS);
      await this._wdunSave(now, true);
      this._send(ws, JSON.stringify({ t: 'wdun', k: 'lk', h, left: st.locks[acct]?.[h] ? st.locks[acct][h] - now : 0 }));
      this._wdunFanCrows(now, acct);
    }
  }
  async _wdunWipe(h) {
    const key = wdunRoomKey(h), rooms = this.env?.ROOMS;
    if (!key || !rooms?.idFromName || !rooms?.get) return false;
    const wipe = async (room, ly) => {
      try {
        const res = await rooms.get(rooms.idFromName(layerName(room, ly))).fetch(new Request(`https://relay.internal${WDUN_INTERNAL_RESET}`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(ROOM_CALL_MS) }));
        return !!res?.ok;
      } catch (e) { console.warn('[wdun] wipe', h, room, ly, e?.message ?? e); return false; }
    };
    const sized = [key, ...Object.values(DUNGEON_ROOM_TAGS).map((tag) => `${key}${tag}`)];
    return (await Promise.all(sized.flatMap((room) => Array.from({ length: LAYERS_MAX }, (_, ly) => wipe(room, ly))))).every(Boolean);
  }
  async _wdunResetInternal(_request) {
    for (const [, b] of this._all()) if (b.id) return json({ ok: false, why: 'occupied' }, 409);
    const m = await this.state.storage.list({ prefix: 'world:' });
    const dead = [...m.keys()];
    this._worldMemo = undefined;
    for (let i = 0; i < dead.length; i += 128) await this.state.storage.delete(dead.slice(i, i + 128));
    return json({ ok: true, wiped: dead.length });
  }
  async _wdunKinInternal(request) {
    let body = null;
    try { body = await request.json(); } catch { body = null; }
    const a = typeof body?.a === 'string' ? body.a : null, b = typeof body?.b === 'string' ? body.b : null;
    if (!a || !b || a.length > 128 || b.length > 128) return json({ error: 'bad kin' }, 400);
    const [ra, rb] = [await this._acct(a), await this._acct(b)];
    const now = Date.now();
    const parties = (r) => [r?.party, r?.partyWas && now - r.partyWas.at < WILD_REF.truceMs ? r.partyWas.id : null].filter(Boolean);
    const pa = parties(ra), pb = parties(rb);
    return json({ kin: pa.some((x) => pb.includes(x)) });
  }
  async _instanceKinOf(subject, owner, now) {
    const key = `${subject}|${owner}`, had = this._instanceKin.get(key);
    if (had && now - had.at < INSTANCE_KIN_KEEP_MS) return had.kin;
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return false;
    let kin = null;
    try {
      const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${INSTANCE_INTERNAL_KIN}`, { method: 'POST', body: JSON.stringify({ a: subject, o: owner }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
      if (res?.ok) kin = !!(await res.json())?.kin;
    } catch (e) { console.warn('[instance] kin', e?.message ?? e); }
    this._instanceKin.delete(key);
    // Cache only a yes, so a member just invited is admitted at once.
    if (kin !== true) return kin;
    if (this._instanceKin.size >= 512) this._instanceKin.delete(this._instanceKin.keys().next().value);
    this._instanceKin.set(key, { kin, at: now });
    return kin;
  }
  async _instanceKinInternal(request) {
    let body = null;
    try { body = await request.json(); } catch { body = null; }
    const a = typeof body?.a === 'string' ? body.a : null, o = typeof body?.o === 'string' ? body.o : null;
    if (!a || !o || a.length > 128 || o.length > 64) return json({ error: 'bad kin' }, 400);
    const rec = await this._acct(a);
    const [party] = rec ? await this._myParty(a, rec, Date.now()) : [null];
    return json({ kin: await partyHoldsOwner(party?.members ?? null, a, o) });
  }
  async _wdunKinOf(taker, owner, now) {
    const key = `${taker}|${owner}`, had = this._wdunKin.get(key);
    if (had && now - had.at < 60_000) return had.kin;
    const rooms = this.env?.ROOMS;
    // A silent hub counts as kin, so no blow lands and nothing is taken, for WDUN_KIN_SILENT_MS.
    // With no hub binding at all, nobody is kin.
    let kin = !!(rooms?.idFromName && rooms?.get), heard = !kin;
    if (kin) {
      try {
        const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${WDUN_INTERNAL_KIN}`, { method: 'POST', body: JSON.stringify({ a: taker, b: owner }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
        if (res?.ok) { kin = !!(await res.json())?.kin; heard = true; }
      } catch (e) { console.warn('[wdun] kin', e?.message ?? e); }
    }
    this._wdunKin.delete(key);
    if (this._wdunKin.size >= 512) this._wdunKin.delete(this._wdunKin.keys().next().value);
    this._wdunKin.set(key, { kin, at: heard ? now : now - 60_000 + WDUN_KIN_SILENT_MS });
    return kin;
  }
  _wdunTellGone(os) {
    if (!os) return;
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return;
    const p = rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${WDUN_INTERNAL_GONE}`, { method: 'POST', body: JSON.stringify({ os }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
    p.catch((e) => console.warn('[wdun] gone', e?.message ?? e));
    try { this.state.waitUntil?.(p); } catch {  }
  }
  async _wdunGoneInternal(request) {
    let body = null;
    try { body = await request.json(); } catch { body = null; }
    if (typeof body?.os !== 'string' || body.os.length > 128) return json({ error: 'bad gone' }, 400);
    const now = Date.now();
    const st = await this._wdunRec(now);
    if (wdunGone(st, body.os, now)) { await this._wdunSave(now, true); this._wdunFanCrows(now); }
    return json({ ok: true });
  }
}
