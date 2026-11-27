import { HELLO_WAIT_MS, CLOSE_BUSY, ACCOUNT_TABS_MAX, RELAY_VERSION } from '../relay.js';
import { IDX_TRUST_MS, ATTACH_LAZY_MS } from '../relayScale.js';
import { keyMove, STATUS_NAMES_MAX } from './keys.js';
import { isHidden } from '../staffHidden.js';

export class SocketsPart {
  _adopt(ws, att) { if (!this._idx) return; const was = this._idx.get(ws); if (!was) this._enter(ws); this._idx.set(ws, att); this._reindex(ws, was, att); if (this._idx.size > this._metrics.c.peak) this._metrics.c.peak = this._idx.size; }
  _enter(ws) { this._idxSeq.set(ws, ++this._idxN); }
  _unseatSilent(now) {
    for (const [ws, a] of [...this._all()]) {
      if (a.id || a.replaced || this._dead.has(ws)) continue;
      if (!Number.isFinite(a.at)) { this._setAttach(ws, { ...a, at: now }); continue; }
      if (now - a.at < HELLO_WAIT_MS) continue;
      try { ws.close(CLOSE_BUSY, 'no hello'); } catch {  }
      this._dead.add(ws);
      this._closed(ws);
    }
  }
  _all() {
    const now = Date.now();
    if (this._idx && now - this._idxAt < IDX_TRUST_MS) return this._idx;
    const sockets = this.state.getWebSockets();
    if (!this._idx) { this._idx = new Map(); this._acctIdx = null; this._subIdx = null; this._idIdx = null; this._giIdx = null; this._hostMemo = undefined; }
    let moved = false;
    // A ShardSocket is never in the runtime's list, so the walk must not drop it from the index.
    if (this._idx.size) { const live = new Set(sockets); for (const ws of [...this._idx.keys()]) if (!live.has(ws) && !ws.virtual) { this._idx.delete(ws); moved = true; } }
    // Keep indexed entries: after a lazy pose write the index is newer than the stored attachment.
    for (const ws of sockets) if (!this._idx.has(ws)) { let a; try { a = ws.deserializeAttachment() ?? {}; } catch { a = {}; } this._enter(ws); this._idx.set(ws, a); moved = true; }
    if (moved) { this._acctIdx = null; this._subIdx = null; this._idIdx = null; this._giIdx = null; this._hostMemo = undefined; }
    this._idxAt = now;
    return this._idx;
  }
  _byAcct() {
    this._all();
    if (this._acctIdx) return this._acctIdx;
    const m = new Map();
    for (const [ws, a] of this._all()) if (a.id && a.acct) { let s = m.get(a.acct); if (!s) m.set(a.acct, s = new Set()); s.add(ws); }
    return (this._acctIdx = m);
  }
  _reindex(ws, was, a) {
    keyMove(this._acctIdx, ws, was?.id && was.acct ? was.acct : null, a?.id && a.acct ? a.acct : null);
    keyMove(this._subIdx, ws, was?.id && was.sub ? was.sub : null, a?.id && a.sub ? a.sub : null);
    keyMove(this._idIdx, ws, was?.id || null, a?.id || null);
    keyMove(this._giIdx, ws, was?.id && was.gi ? was.gi : null, a?.id && a.gi ? a.gi : null);
    if ((was?.id || null) !== (a?.id || null) || (was?.since ?? 0) !== (a?.since ?? 0)) this._hostMemo = undefined;
  }
  _bySub() {
    this._all();
    if (this._subIdx) return this._subIdx;
    const m = new Map();
    for (const [ws, a] of this._all()) if (a.id && a.sub) { let s = m.get(a.sub); if (!s) m.set(a.sub, s = new Set()); s.add(ws); }
    return (this._subIdx = m);
  }
  _byId() {
    this._all();
    if (this._idIdx) return this._idIdx;
    const m = new Map();
    for (const [ws, a] of this._all()) if (a.id) { let s = m.get(a.id); if (!s) m.set(a.id, s = new Set()); s.add(ws); }
    return (this._idIdx = m);
  }
  _byGuild() {
    this._all();
    if (this._giIdx) return this._giIdx;
    const m = new Map();
    for (const [ws, a] of this._all()) if (a.id && a.gi) { let s = m.get(a.gi); if (!s) m.set(a.gi, s = new Set()); s.add(ws); }
    return (this._giIdx = m);
  }
  _idFirst(id, except = null) {
    if (!id) return null;
    const s = this._byId().get(id);
    if (!s) return null;
    let best = null, seq = Infinity;
    for (const ws of s) { if (ws === except) continue; const q = this._idxSeq.get(ws) ?? 0; if (isHidden(this._all().get(ws))) continue; if (q < seq) { seq = q; best = ws; } }
    return best ? [best, this._all().get(best)] : null;
  }
  _inOrder(set) {
    const list = [...set];
    if (list.length > 1) { const seq = this._idxSeq; list.sort((x, y) => (seq.get(x) ?? 0) - (seq.get(y) ?? 0)); }
    return list;
  }
  _socketsOf(acct, except = null) {
    const s = this._byAcct().get(acct);
    if (!s) return [];
    let list = this._inOrder(s);
    if (list.length > ACCOUNT_TABS_MAX) { const idx = this._all(); list.sort((x, y) => (idx.get(y)?.since ?? 0) - (idx.get(x)?.since ?? 0)); list = list.slice(0, ACCOUNT_TABS_MAX); }
    return except ? list.filter((ws) => ws !== except) : list;
  }
  _otherTabsOf(sub, ws, id) {
    const out = [];
    const tabs = this._bySub().get(sub);
    if (!tabs) return out;
    const idx = this._all();
    for (const other of this._inOrder(tabs)) { const b = idx.get(other); if (other !== ws && b?.id && b.id !== id && b.sub === sub && !this._dead.has(other) && !this._gone.has(other)) out.push(other); }
    return out;
  }
  _withId(id, ws) {
    const s = id ? this._byId().get(id) : null;
    if (!s) return [];
    const idx = this._all(), out = [];
    for (const other of this._inOrder(s)) if (other !== ws) out.push([other, idx.get(other)]);
    return out;
  }
  _othersOf(ws) {
    const out = [];
    for (const [other, b] of this._all()) if (other !== ws && b.id && !this._dead.has(other) && !this._gone.has(other)) out.push(b);
    return out.filter((b) => !b.hid);
  }
  _statusRead() {
    const names = [];
    let n = 0;
    for (const [ws, b] of this._all()) {
      if (!b.id || b.hid || this._dead.has(ws) || this._gone.has(ws)) continue;
      n++;
      if (names.length < STATUS_NAMES_MAX) names.push(String(b.name ?? '').slice(0, 40));
    }
    return { n: Math.max(n, this._vsocks?.size ? this._busCount() : 0), names, version: RELAY_VERSION };
  }
  _namedCount() { let n = 0; for (const [ws, b] of this._all()) if (b.id && !b.hid && !this._dead.has(ws) && !this._gone.has(ws)) n++; return n; }
  _speaker(acct, except = null) {
    let best = null, since = -Infinity;
    for (const ws of this._socketsOf(acct, except)) { const b = this._attach(ws); if ((b.since ?? 0) >= since) { best = ws; since = b.since ?? 0; } }
    return best;
  }
  _attach(ws) { const idx = this._all(); if (idx.has(ws)) return idx.get(ws); try { return ws.deserializeAttachment() ?? {}; } catch { return {}; } }
  _setAttach(ws, a, lazy = false) {
    if (ws.court) { ws.att = a; return true; }
    const now = Date.now();
    // A lazy write updates the index now and the runtime's copy at most every ATTACH_LAZY_MS;
    // a wake reads only that copy.
    if (!lazy || !(now - (this._attachedAt.get(ws) ?? -Infinity) < ATTACH_LAZY_MS)) {
      try { ws.serializeAttachment(a); } catch { return false; }
      this._attachedAt.set(ws, now);
    }
    const idx = this._all(), was = idx.get(ws);
    if (ws.virtual && was) this._vlaw(ws, was, a);
    if (!was) this._enter(ws);
    this._reindex(ws, was, a);
    idx.set(ws, a);
    return true;
  }
  _forget(ws) { this._owed.delete(ws); const a = this._idx?.get(ws); if (this._idx?.delete(ws)) this._reindex(ws, a, null); }
}
