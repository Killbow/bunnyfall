import { shardOf, regionsSharded, CLOSE_HUB, HUB_FRAME_MAX, HUB_UP_HZ_MAX, HUB_UP_BURST, HUB_UP_QUEUE_BYTES, HUB_BATCH_MS, isChannelShard, HUB_KEY_KEY, upOf, HUB_BATCH_MAX, HUB_BATCH_BYTES, HUB_SYNC_MS, HUB_INTERNAL_UP, HUB_INTERNAL_POLL, HUB_POLL_MS, SHARD_LAW_KEYS, HUB_COUNT_MS } from '../../../../src/net/hubShards.js';
import { tokenGate, layerName, CLOSE_POLICY } from '../../relay.js';
import { upBytesOf, HUB_RETRY_MS } from '../limits.js';
import { isGateRoom } from '../../../../src/net/gateLaw.js';
import { ROOM_CALL_MS } from '../../relayScale.js';
import { busMissed } from '../../staffFreeze.js';

export class ShardPart {
  _hubN(local) { return this._hubTotal != null ? Math.max(this._hubTotal, local) : local; }
  _shardAtt(a) { const { key, pose, hm, at, w2, vid, ly, ld, ...att } = a; void key; void pose; void hm; void at; void w2; void vid; void ly; void ld; return att; }
  _shardOf(bus, sub) { return shardOf(bus, sub, regionsSharded(this.env?.REGION_SHARDS)); }
  _hubHop(ws, key) {
    this._send(ws, JSON.stringify({ t: 'hub', key }));
    try { ws.close(CLOSE_HUB, 'hub'); } catch {  }
    this._dead.add(ws);
    this._closed(ws);
  }
  _byVid(vid) {
    const ws = this._vidIdx.get(vid);
    if (ws || this._vidIdxFull) return ws ?? null;
    this._vidIdxFull = true;
    for (const [w, b] of this._all()) if (b.vid && b.id) this._vidIdx.set(b.vid, w);
    return this._vidIdx.get(vid) ?? null;
  }
  _hubForward(ws, a, message) {
    if (message.length > HUB_FRAME_MAX) { this._refuse(ws, 'frame too large'); return; }
    const g = tokenGate(this._upGate.get(ws), Date.now(), HUB_UP_HZ_MAX, HUB_UP_BURST);
    this._upGate.set(ws, g.bucket);
    if (!g.pass) { this._junk(ws); return; }
    if (this._upBytes + message.length > HUB_UP_QUEUE_BYTES) { this._metrics.c.drops++; return; }
    this._hubUpOwe(a.vid, 'f', message);
  }
  _hubUpOwe(vid, kind, payload) {
    const ev = [vid, kind, payload];
    this._up.push(ev);
    this._upBytes += upBytesOf(ev);
    if (!this._upT) this._upT = setTimeout(() => { this._upT = null; this._hubUpFlush(); }, HUB_BATCH_MS);
    this._hubPollEnsure();
  }
  _hubLive() { const out = []; for (const [w, b] of this._all()) if (b.id && b.vid && !this._dead.has(w) && !this._gone.has(w)) out.push(b.vid); return out; }
  _hubRehelloEvents(vid) {
    const ws = this._byVid(vid);
    if (!ws) return [];
    const a = this._attach(ws);
    if (!a.id) return [];
    const out = [[vid, 'h', { att: this._shardAtt(a), m: { acct: a.hm?.acct ?? null, asecret: a.hm?.as ?? null, ps: a.hm?.ps === 1 ? 1 : 0, cl: 0, secret: a.hm?.sc ?? null, re: 1 } }]];
    if (a.ly && isGateRoom(a.key) && a.pose) out.push([vid, 'p', a.pose]);
    return out;
  }
  _hubRehello(vid) { for (const ev of this._hubRehelloEvents(vid)) this._hubUpOwe(ev[0], ev[1], ev[2]); }
  async _hubKeyOf() {
    if (this._hubKey) return this._hubKey;
    let k = null, ly = 0;
    for (const [, b] of this._all()) { k = b.key ?? null; ly = b.ly | 0; break; }
    let key = isChannelShard(k) ? k : isGateRoom(k) && ly > 0 ? layerName(k, ly) : null;
    // A woken shard with no socket reads its hub key from storage, or its last leave never reaches the bus.
    if (!key && this._hubKey === undefined) { try { const v = await this.state.storage.get(HUB_KEY_KEY); key = typeof v === 'string' && upOf(v) != null ? v : null; } catch { key = null; } }
    this._hubKey = key;
    return key;
  }
  _vidLeaving(vid) {
    const has = (l) => Array.isArray(l) && l.some((ev) => ev[0] === vid && (ev[1] === 'r' || ev[1] === 'x'));
    return has(this._up) || has(this._upInFlight) || has(this._upRetry?.e);
  }
  _upTake() {
    let n = 0, bytes = 0;
    while (n < this._up.length && n < HUB_BATCH_MAX) { const w = upBytesOf(this._up[n]); if (n && bytes + w > HUB_BATCH_BYTES) break; bytes += w; n++; }
    this._upBytes = Math.max(0, this._upBytes - bytes);
    return this._up.splice(0, n);
  }
  _hubUpFlush() {
    // One batch is in flight at a time, so the bus receives events in the order they happened.
    if (this._upBusy) return this._upBusy.then(() => (this._up.length || this._upRetry ? this._hubUpFlush() : undefined));
    const rooms = this.env?.ROOMS;
    const now = Date.now();
    const sync = now - this._hubSyncAt >= HUB_SYNC_MS;
    if (!rooms?.get || (!this._up.length && !this._upRetry && !sync)) return Promise.resolve();
    if (now < this._upHoldUntil) { if (!this._upT) this._upT = setTimeout(() => { this._upT = null; this._hubUpFlush(); }, this._upHoldUntil - now); return Promise.resolve(); }
    this._upBusy = (async () => {
      try {
        const hub = await this._hubKeyOf();
        if (upOf(hub) == null) return;
        // A failed batch is sent again unchanged, with its `q`, so the bus skips it if it already ran.
        let body = this._upRetry;
        if (!body) {
          body = { q: ++this._upSeq, e: this._upTake() };
          if (sync) { this._hubSyncAt = now; body.live = this._hubLive(); }
        }
        this._upInFlight = body.e;
        let ans = null;
        try {
          const res = await rooms.get(rooms.idFromName(/** @type {string} */ (upOf(hub)))).fetch(new Request(`https://relay.internal${HUB_INTERNAL_UP}`, { method: 'POST', body: JSON.stringify({ hub, b: this._boot, ...body }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
          ans = res?.ok ? await res.json() : null;
        } catch (e) { console.warn('[shard] the bus did not answer', e?.message ?? e); }
        if (!ans) {
          if (this._upRetry !== body) { this._upRetry = body; await busMissed(this, body.e); }
          this._upHoldUntil = Date.now() + HUB_RETRY_MS;
          this._hubSyncAt = 0;
          if (!this._upT) this._upT = setTimeout(() => { this._upT = null; this._hubUpFlush(); }, HUB_RETRY_MS);
          return;
        }
        this._upRetry = null;
        this._pollWake?.();
        if (Number.isSafeInteger(ans.n) && ans.n >= 0) this._hubTotalSet(ans.n);
        const unknown = new Set(Array.isArray(ans.unknown) ? ans.unknown.filter((v) => typeof v === 'string') : []);
        if (unknown.size) {
          const redo = [];
          for (const vid of unknown) { const h = this._hubRehelloEvents(vid); if (!h.length) continue; redo.push(...h); for (const ev of body.e) if (ev[0] === vid && (ev[1] === 'f' || ev[1] === 'p')) redo.push(ev); }
          if (redo.length) { this._up.unshift(...redo); for (const ev of redo) this._upBytes += upBytesOf(ev); }
        }
      } finally { this._upInFlight = null; this._upBusy = null; }
      if (this._up.length || Date.now() - this._hubSyncAt >= HUB_SYNC_MS) await this._hubUpFlush();
    })();
    return this._upBusy;
  }
  _hubPollEnsure() {
    if (this._pollOn || !this.env?.ROOMS?.get || this.env.HUB_POLL === 'driven') return;
    this._pollOn = true;
    void this._hubPollLoop();
  }
  async _hubPollLoop() {
    let miss = 0;
    try {
      while (this._hubLive().length || this._downGone.size) {
        let got;
        try { got = await this._hubPoll(true); } catch (e) { console.warn('[shard] a poll threw', e?.message ?? e); got = false; }
        if (got == null) return;
        miss = got === false ? miss + 1 : 0;
        if (miss) { if (await this._pollRest(Math.min(HUB_RETRY_MS * 2 ** (miss - 1), HUB_SYNC_MS / 2))) miss = 0; }
        else if (got === 0) await new Promise((r) => setTimeout(r, HUB_BATCH_MS));
      }
    } finally { this._pollOn = false; }
  }
  _pollRest(ms) {
    return new Promise((done) => {
      const t = setTimeout(() => { this._pollWake = null; done(false); }, ms);
      this._pollWake = () => { clearTimeout(t); this._pollWake = null; done(true); };
    });
  }
  async _hubPoll(wait = false) {
    const rooms = this.env?.ROOMS;
    const hub = await this._hubKeyOf();
    if (!rooms?.get || upOf(hub) == null) return null;
    const gone = [...this._downGone];
    let ans = null;
    try {
      const res = await rooms.get(rooms.idFromName(/** @type {string} */ (upOf(hub)))).fetch(new Request(`https://relay.internal${HUB_INTERNAL_POLL}`, { method: 'POST', body: JSON.stringify({ hub, b: this._boot, ack: this._downSeen, gone, ...(this._rsBoot ? { rb: this._rsBoot } : {}), ...(wait ? { w: 1 } : {}) }), signal: AbortSignal.timeout(HUB_POLL_MS + ROOM_CALL_MS) }));
      ans = res?.ok ? await res.json() : null;
    } catch (e) { console.warn('[shard] the bus did not answer a poll', e?.message ?? e); }
    if (!ans || !Array.isArray(ans.d)) return false;
    for (const vid of gone) this._downGone.delete(vid);
    let ran = 0;
    for (const d of ans.d) { const left = await this._hubDownApply(d); if (!left) continue; ran++; for (const vid of left) this._downGone.add(vid); }
    if (ans.rs) {
      if (typeof ans.rb === 'string') this._rsBoot = ans.rb;
      this._hubSyncAt = 0; this._upHoldUntil = 0;
      const up = this._hubUpFlush();
      // The held poll never awaits the send: it would poll nothing while the shard owes the bus,
      // and the bus would drop its oldest deliveries.
      if (!wait) await up;
    }
    return ran + (ans.rs ? 1 : 0);
  }
  async _hubDownApply(b) {
    if (!b || typeof b !== 'object' || !Array.isArray(b.s) || !Array.isArray(b.seg)) return null;
    if (typeof b.b === 'string' && Number.isSafeInteger(b.q)) {
      if (this._downSeen && this._downSeen.b === b.b && b.q <= this._downSeen.q) return null;
      this._downSeen = { b: b.b, q: b.q };
    }
    for (const t of Array.isArray(b.att) ? b.att : []) {
      const ws = Array.isArray(t) && typeof t[0] === 'string' ? this._byVid(t[0]) : null;
      if (!ws || !t[1] || typeof t[1] !== 'object' || this._dead.has(ws) || this._gone.has(ws)) continue;
      const next = { ...this._attach(ws) };
      for (const k of SHARD_LAW_KEYS) if (k in t[1]) { if (t[1][k] == null) delete next[k]; else next[k] = t[1][k]; }
      this._setAttach(ws, next);
    }
    const gone = new Set();
    for (const g of b.seg) {
      if (Number.isInteger(g?.all)) {
        const s = b.s[g.all];
        if (typeof s === 'string') for (const [ws, a] of this._all()) if (a.id && a.vid && a.id !== g.x && !this._dead.has(ws) && !this._gone.has(ws)) this._send(ws, s);
        continue;
      }
      for (const e of Array.isArray(g?.to) ? g.to : []) {
        if (!Array.isArray(e) || typeof e[0] !== 'string' || !Array.isArray(e[1])) continue;
        const ws = this._byVid(e[0]);
        if (!ws || this._dead.has(ws) || this._gone.has(ws)) { if (!this._vidLeaving(e[0])) gone.add(e[0]); continue; }
        for (const k of e[1]) if (typeof b.s[k] === 'string' && !this._send(ws, b.s[k])) break;
      }
    }
    for (const c of Array.isArray(b.close) ? b.close : []) {
      const ws = Array.isArray(c) ? this._byVid(c[0]) : null;
      if (!ws) continue;
      this._vidIdx.delete(c[0]);
      this._setAttach(ws, { ...this._attach(ws), vid: null });
      try { ws.close(Number.isInteger(c[1]) ? c[1] : CLOSE_POLICY, typeof c[2] === 'string' ? c[2] : ''); } catch {  }
      this._dead.add(ws);
      this._closed(ws);
    }
    if (Number.isSafeInteger(b.n) && b.n >= 0) this._hubTotalSet(b.n);
    await this._reap();
    this._metricsTick();
    return [...gone];
  }
  _hubTotalSet(n) {
    const was = this._hubTotal;
    this._hubTotal = n;
    if (n !== was && !this._hubCountT) this._hubCountT = setTimeout(() => { this._hubCountT = null; this._hubCountSay(); }, HUB_COUNT_MS);
  }
  _hubCountSay() {
    const n = this._hubN(this._namedCount());
    if (n === this._hubTotalSaid) return;
    this._hubTotalSaid = n;
    const out = JSON.stringify({ t: 'n', n });
    for (const [ws, b] of this._all()) if (b.id) this._send(ws, out);
  }
}
