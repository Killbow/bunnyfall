// The bus side of the hub: shard batches, ShardSockets, the hub count, owed batches, silent shards.
import { HUB_COUNT_MS, upOf, HUB_BATCH_MAX, isCourtCopy, busOf, SHARD_LAW_KEYS, HUB_SYNC_MS, HUB_SILENT_MS, HUB_BATCH_MS, HUB_OUTBOX_MAX, HUB_OUTBOX_BYTES } from '../../../../src/net/hubShards.js';
import { json } from '../json.js';
import { CLOSE_POLICY, SOCIAL_ROOM, CLOSE_REPLACED, SEAT_ELSEWHERE, badged, TRAV_STALE_MS, TRAV_WELCOME_MAX } from '../../relay.js';
import { ShardSocket } from './shardSocket.js';
import { busFreeze } from '../../staffFreeze.js';
import { GROUND_OLD_WORDS } from '../constants.js';
import { sayStaffBook } from '../../staffEvents.js';
import { relayCfgValue } from '../../../../src/net/relayCfg.js';

export class BusPart {
  _busCount() {
    let n = this._vsocks.size;
    for (const [ws, b] of this._reals()) if (b.id && !b.hid && !this._dead.has(ws) && !this._gone.has(ws)) n++;
    return n - this._vhid.size;
  }
  _busCountMoved() {
    if (!this._toldN.size || this._countT) return;
    this._countT = setTimeout(() => { this._countT = null; this._busCountTell(); }, HUB_COUNT_MS);
  }
  _busCountTell() {
    const n = this._busCount();
    for (const [hub, told] of this._toldN) if (told !== n) this._vbatch(hub);
    return this._downFlush();
  }
  async _hubUpInternal(request) {
    let b;
    try { b = await request.json(); } catch { return json({ error: 'bad' }, 400); }
    const hub = b?.hub;
    if (upOf(hub) == null || !Array.isArray(b.e)) return json({ error: 'bad' }, 400);
    if (this._busKey === undefined) this._busKey = upOf(hub);
    else if (this._busKey !== upOf(hub)) return json({ error: 'bad' }, 400);
    this._all();
    const now = Date.now();
    this._shardSeen.set(hub, now);
    await this._busSilentSweep(now);
    if (typeof b.b === 'string' && Number.isSafeInteger(b.q)) {
      const seen = this._upSeen.get(hub);
      if (seen && seen.b === b.b && b.q <= seen.q) return json({ ok: 1, unknown: [] });
      this._upSeen.set(hub, { b: b.b, q: b.q });
    }
    const unknown = new Set();
    for (const ev of b.e.slice(0, HUB_BATCH_MAX)) {
      if (!Array.isArray(ev) || typeof ev[0] !== 'string') continue;
      const [vid, kind, p] = ev;
      if (kind === 'h') { if (isCourtCopy(hub)) await this._courtHello(hub, vid, p); else await this._vhello(hub, vid, p); continue; }
      const vws = this._vsocks.get(vid);
      // Never ask again for the hello of a socket this object closed (`_vshut`); a refused hello
      // would be refused again forever.
      if (!vws || vws.hub !== hub) { if ((kind === 'f' || kind === 'p') && !this._vshut.has(vid)) unknown.add(vid); continue; }
      if (kind === 'p') { if (vws.court) this._courtPose(vws, p); continue; }
      if (kind === 'f') { if (typeof p === 'string') await this.webSocketMessage(vws, p); }
      else if (kind === 'x') await this._vgone(vws, true);
      else if (kind === 'r') await this._vgone(vws, false);
    }
    if (Array.isArray(b.live)) {
      const live = new Set(b.live.filter((x) => typeof x === 'string'));
      for (const [vid, vws] of [...this._vsocks]) if (vws.hub === hub && !live.has(vid)) await this._vgone(vws, true);
      for (const vid of live) {
        if (this._vsocks.has(vid)) continue;
        const shut = this._vshut.get(vid);
        if (shut) { this._vbatch(hub).close.push([vid, shut.code ?? CLOSE_POLICY, shut.reason ?? '']); this._downArm(); }
        else unknown.add(vid);
      }
    }
    await this._reap();
    return json({ ok: 1, unknown: [...unknown], ...(isCourtCopy(hub) ? {} : { n: this._busCount() }) });
  }
  async _vhello(hub, vid, p) {
    if (this._vsocks.has(vid) || !p || !p.att || typeof p.att !== 'object' || typeof p.att.id !== 'string') return;
    const now = Date.now();
    const m = { id: p.att.id, ...(typeof p.m?.acct === 'string' && typeof p.m?.asecret === 'string' ? { acct: p.m.acct, asecret: p.m.asecret } : {}), ...(p.m?.ps === 1 ? { ps: 1 } : {}), ...(p.m?.cl === 1 ? { cl: 1 } : {}) };
    const vws = new ShardSocket(this, hub, vid);
    const bus = /** @type {string} */ (busOf(hub)), hubBus = bus === SOCIAL_ROOM;
    let a = { ...p.att, key: bus };
    const secret = typeof p.m?.secret === 'string' && p.m.secret ? p.m.secret : null;
    // The bus checks the id's secret: a shard knows only its own sockets' secrets, so a hello
    // on another shard could take the id.
    const kept = await this._secretOf(a.id);
    if (kept && kept !== secret) { vws.att = a; this._refuse(vws, 'id taken'); return; }
    if (secret) a = { ...a, sc: secret };
    const ti = Number.isSafeInteger(a.gio) ? a.gio : 0;
    // A shard's hello applied no bans, mutes, or guild removals; the bus holds them, so apply
    // each here over the token.
    if (await this._bannedHello(vws, a.sub, ti, now)) return;
    const order = typeof a.sub === 'string' ? this._orders.get(a.sub) : null;
    if (order && order.i > ti) a = { ...a, mu: order.mu, lt: order.i };
    if (!(a = await busFreeze(this, vws, a, ti, now, GROUND_OLD_WORDS))) return;
    if (a.gi) { await this._loadGuildOuts(Math.floor(now / 1000)); if (this._guildOutAfter(a.gi, a.gm, ti)) a = this._unguild(a); }
    vws.att = a;
    this._vput(vws);
    this._all();
    for (const [other, b] of this._withId(a.id, vws)) {
      this._setAttach(other, { ...b, id: null, replaced: true });
      try { other.close(CLOSE_REPLACED, 'replaced'); } catch {  }
      this._closed(other);
    }
    this._adopt(vws, a);
    if (secret && (kept !== secret || !this._secrets.has(a.id))) this._secrets.set(a.id, secret);
    this._vlaw(vws, p.att, a);
    this._metrics.c.hellos++;
    const held = hubBus && a.sub ? this._otherTabsOf(a.sub, vws, a.id).filter((o) => !o.virtual) : [];
    if (held.length && !m.cl) { this._refuse(vws, SEAT_ELSEWHERE, CLOSE_REPLACED); return; }
    if (m.cl) for (const o of held) this._refuse(o, SEAT_ELSEWHERE, CLOSE_REPLACED);
    this._busCountMoved();
    if (!a.hid) this._fanRoster(vws, JSON.stringify(badged({ t: 'join', id: a.id, name: a.name, sub: a.sub, n: this._busCount() }, a)));
    if (!hubBus) { this._travTell(vws, now); return; }
    const ev = await this._liveEvent();
    if (ev) this._send(vws, JSON.stringify({ t: 'event', kind: ev.kind, at: ev.at, w: 1 }));
    await sayStaffBook(this, vws, now);
    this._send(vws, `{"t":"ldo","on":${relayCfgValue(await this._relayCfgOf(), this.env, 'leaseDoor') === 'on' ? 1 : 0}}`);
    await this._hubHelloWords(vws, m, a.sub, now);
  }
  _travTell(vws, now) {
    let n = 0;
    for (const [w, b] of this._all()) {
      if (w === vws || !b.id || !b.tm || now - b.tm.at > TRAV_STALE_MS || this._dead.has(w) || this._gone.has(w)) continue;
      const { bd, sr } = b.tm, p = { ...b.tm };
      delete p.at; delete p.bd; delete p.sr;
      this._send(vws, JSON.stringify(badged({ t: 'trav', id: b.id, name: b.name, sub: b.sub, p, ...(bd ? { bd } : {}), ...(sr ? { sr } : {}) }, b)));
      if (++n >= TRAV_WELCOME_MAX) break;
    }
  }
  _fanAllBut(skip, id, out) {
    if (this._vper.size) { this._vsendAll(out, id); for (const [o, b] of this._reals()) if (o !== skip && b.id && b.id !== id) this._send(o, out); return; }
    for (const [o, b] of [...this._all()]) if (o !== skip && b.id && b.id !== id) this._send(o, out);
  }
  async _vgone(vws, said) {
    this._vdrop(vws);
    vws.closed = true;
    if (vws.court) return;
    this._busCountMoved();
    if (said) { await this.webSocketClose(vws, 1000, ''); return; }
    const a = this._attach(vws);
    this._setAttach(vws, { ...a, id: null, replaced: true });
    this._gone.add(vws);
    this._forget(vws);
  }
  _vsend(vws, s) {
    const b = this._vbatch(vws.hub);
    const k = this._vframe(b, s);
    if (!b.cur) b.seg.push(b.cur = new Map());
    let l = b.cur.get(vws.vid);
    if (!l) b.cur.set(vws.vid, l = []);
    l.push(k);
    this._downArm();
  }
  _vsendAll(s, x = null) {
    for (const [hub, n] of this._vper) {
      if (!(n > 0)) continue;
      const b = this._vbatch(hub);
      b.seg.push(x ? { all: this._vframe(b, s), x } : { all: this._vframe(b, s) });
      b.cur = null;
    }
    if (this._vper.size) this._downArm();
  }
  _vframe(b, s) { let k = b.i.get(s); if (k === undefined) { k = b.s.length; b.s.push(s); b.i.set(s, k); } return k; }
  _vput(vws) { this._vsocks.set(vws.vid, vws); if (vws.att?.hid) this._vhid.add(vws.vid); const per = vws.court ? this._cper : this._vper; per.set(vws.hub, (per.get(vws.hub) ?? 0) + 1); }
  _vdrop(vws) { if (this._vsocks.get(vws.vid) !== vws) return; this._vsocks.delete(vws.vid); this._vhid.delete(vws.vid); const per = vws.court ? this._cper : this._vper; const n = (per.get(vws.hub) ?? 1) - 1; if (n > 0) per.set(vws.hub, n); else per.delete(vws.hub); if (vws.court) this._trails?.delete(vws); }
  *_reals() { const idx = this._all(); for (const ws of this.state.getWebSockets()) { const b = idx.get(ws); if (b) yield [ws, b]; } }
  _vclose(vws, code, reason) {
    this._vshut.set(vws.vid, { code: code | 0, reason: String(reason ?? '').slice(0, 120) });
    this._vdrop(vws);
    this._busCountMoved();
    this._vbatch(vws.hub).close.push([vws.vid, code | 0, String(reason ?? '').slice(0, 120)]);
    this._downArm();
  }
  _vbatch(hub) { let b = this._down.get(hub); if (!b) this._down.set(hub, b = { s: [], i: new Map(), seg: [], cur: null, close: [], att: [] }); return b; }
  _vlaw(vws, from, to) {
    if (!vws?.virtual || vws.court || vws.closed) return;
    let d = null;
    // A shard rebuilds a rehello from its own attachment, so every SHARD_LAW_KEYS change must
    // reach it; the bus's memory is lost at a wake.
    for (const k of SHARD_LAW_KEYS) { const x = from?.[k], y = to?.[k]; if (x !== y && JSON.stringify(x) !== JSON.stringify(y)) (d ??= {})[k] = y ?? null; }
    if (!d) return;
    this._vbatch(vws.hub).att.push([vws.vid, d]);
    this._downArm();
  }
  async _busSilentSweep(now) {
    if ((!this._vsocks.size && !this._outbox.size) || now - this._silentAt < HUB_SYNC_MS / 2) return;
    this._silentAt = now;
    for (const v of [...this._vsocks.values()]) {
      if (now - (this._shardSeen.get(v.hub) ?? 0) < HUB_SILENT_MS) continue;
      if (v.court) { this._vdrop(v); v.closed = true; } else await this._vgone(v, true);
    }
    for (const hub of [...this._outbox.keys()]) if (now - (this._shardSeen.get(hub) ?? 0) >= HUB_SILENT_MS && !this._polls.has(hub)) this._outbox.delete(hub);
  }
  _downArm() { if (!this._downT) this._downT = setTimeout(() => { this._downT = null; this._downFlush(); }, HUB_BATCH_MS); }
  _downFlush() { for (const hub of [...this._down.keys()]) this._downTo(hub); return Promise.resolve(); }
  _downTo(hub) {
    const b = this._down.get(hub);
    if (b) {
      this._down.delete(hub);
      const court = isCourtCopy(hub), n = court ? null : this._busCount();
      if (!court) this._toldN.set(hub, n);
      const q = (this._downSeq.get(hub) ?? 0) + 1;
      this._downSeq.set(hub, q);
      const body = JSON.stringify({ b: this._boot, q, s: b.s, seg: b.seg.map((g) => (g instanceof Map ? { to: [...g] } : g)), close: b.close, ...(b.att.length ? { att: b.att } : {}), ...(court ? {} : { n }) });
      // The bus never calls a shard: calls each way would nest until the runtime refuses them.
      // A delivery waits here until that shard polls, and stays until the shard acknowledges it.
      let box = this._outbox.get(hub);
      if (!box) this._outbox.set(hub, box = { l: [], bytes: 0 });
      box.l.push({ q, body });
      box.bytes += body.length;
      while (box.l.length > HUB_OUTBOX_MAX || (box.l.length > 1 && box.bytes > HUB_OUTBOX_BYTES)) { box.bytes -= /** @type {{ body: string }} */ (box.l.shift()).body.length; this._metrics.c.drops++; }
    }
    const held = this._polls.get(hub);
    if (held && this._outbox.get(hub)?.l.length) this._pollAnswer(hub, held);
  }
}
