// The spawn grants a room mints, signs, renews, frees, carries, and tallies for its players. The
// grant law's mode decides each ask, and records no grant stands behind are stripped.
import { GRANT_CFG_TTL_MS, grantModeOf, grantMarksAllow, grantBucketIdle, GRANT_TALLY_MS, grantGate, validGrantAsk, GRANT_OPEN_KINDS, grantMintGate, grantKindRolled, grantMarksFor, GRANT_TTL_MS, signGrant, grantRenewed, grantSignedHere, grantCarried, grantHanded, GRANT_SKEW_MS } from '../../../src/net/grantLaw.js';
import { relayCfgValue } from '../../../src/net/relayCfg.js';
import { foeStatsRefusal } from '../../../src/net/foeBounds.js';
import { isCellRoom, streamsFoes, isWorldRoom, cellRoomOfWire, mapPixelOfWire, sharedClassicMinutes } from '../relay.js';
import { GRANT_STRIPS_SEEN_MAX } from '../room/constants.js';
import { foldGrantTally, GRANT_RELAY_READER, newGrantMeasure, foldGrantAsk, GRANT_MEASURE_MS, grantMeasureBatch, sealGrantMeasure, GRANT_MEASURE_SIG_HEADER, GRANT_MEASURE_POST_MS } from '../../../src/net/grantMeasure.js';
import { staffFoesStripped, staffReactAsk } from '../staffFeeds.js';
import { rand32 } from '../room/dice.js';
import { inCover } from '../cellNodes.js';
import { renownIssuable } from '../../../src/net/identityToken.js';

export class GrantPart {
  async _grantMode(now) {
    if (this._relayCfgAt === -Infinity) await this._relayCfgFresh(now);
    else if (now - this._relayCfgAt >= GRANT_CFG_TTL_MS) void this._relayCfgFresh(now);
    return grantModeOf(relayCfgValue(await this._relayCfgOf(), this.env, 'grantMode'));
  }
  _grantStripped(a, data, kind = 'foes', now = Date.now()) {
    if (!data || !Array.isArray(data.f)) return data;
    const G = this._grants;
    const asker = !!G?.askers?.has(a.id) || a.gv === 1;
    const allies = new Set([data.al, data.cw, data.cp].flatMap((x) => (Array.isArray(x) ? x : [])));
    const camps = new Set((Array.isArray(data.cz) ? data.cz : []).map((c) => (Array.isArray(c) ? c[0] : null)));
    let worst = null, stripped = 0;
    const keep = data.f.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      const s = allies.has(r.i) ? null : foeStatsRefusal(r, { lane: kind === 'own' ? 'any' : 'street', camp: camps.has(r.i) });
      if (s) { if (this._grantStripSeen(a, r)) stripped++; if (!worst || s.k - s.mx > worst.k - worst.mx) worst = s; return false; }
      if (!Array.isArray(r.gr)) return !asker || r.d === 1 || r.t === undefined || allies.has(r.i);
      const v = G?.live.get(r.gr[0]), i = r.gr[1];
      return !!v && v.gr.o === a.id && Number.isInteger(i) && i >= 0 && i < v.gr.n && (v.gr.h < 0 || i === v.gr.h) && grantMarksAllow(v.gr, i, r);
    });
    if (stripped) this._grantRelayTally(a, stripped, worst, now);
    return keep.length === data.f.length ? data : { ...data, f: keep };
  }
  _foesBounded(a, data, kind = 'foes') {
    if (!data || !Array.isArray(data.f)) return data;
    const allies = new Set([data.al, data.cw, data.cp].flatMap((x) => (Array.isArray(x) ? x : [])));
    const camps = new Set((Array.isArray(data.cz) ? data.cz : []).map((c) => (Array.isArray(c) ? c[0] : null)));
    const lane = kind === 'own' || !isCellRoom(a.key) ? 'any' : 'street';
    const keep = data.f.filter((r) => !!r && typeof r === 'object' && (allies.has(r.i) || !foeStatsRefusal(r, { lane, camp: camps.has(r.i) })));
    return keep.length === data.f.length ? data : { ...data, f: keep };
  }
  _grantStripSeen(a, r) {
    const seen = (this._grantStrips ??= new Set());
    const k = `${a.id}|${r.i}|${r.k ?? r.h}`;
    if (seen.has(k)) return false;
    seen.add(k);
    if (seen.size > GRANT_STRIPS_SEEN_MAX) seen.delete(seen.values().next().value);
    return true;
  }
  _grantRelayTally(a, n, e, now) {
    const G = this._grantState(a.key, now);
    this._grantFrom(G, now);
    if (foldGrantTally(G.w, GRANT_RELAY_READER, a.sub || a.id, 'stats', n, e)) void this._grantFlush();
    else this._grantDue(G, now);
    staffFoesStripped(this, a, n, now);
  }
  _grantWelcome() {
    return `,"gm":${JSON.stringify(grantModeOf(relayCfgValue(this._relayCfg, this.env, 'grantMode')))}`;
  }
  _grantState(q, now) {
    // Start the counter at a random 31-bit value, so a re-woken cell never reuses its old numbers.
    return this._grants ??= { q, n: rand32() >>> 1, live: new Map(), liveN: 0, buckets: new Map(), tallied: new Map(), w: newGrantMeasure(now), timer: null };
  }
  _grantPrune(G, now) {
    for (const [g, v] of G.live) if (v.x <= now) { G.live.delete(g); G.liveN -= v.n; }
    for (const [key, b] of G.buckets) if (grantBucketIdle(key.slice(key.lastIndexOf('|') + 1), b, now)) G.buckets.delete(key);
    for (const [id, at] of G.tallied) if (now - at >= GRANT_TALLY_MS) G.tallied.delete(id);
  }
  async _grantFrame(ws, a, m) {
    const now = Date.now();
    if (!this._spend(ws, now, grantGate, 'grantBucket', 'grantDrops', 'too many grant asks')) return;
    const ask = validGrantAsk(m);
    if (!ask || !streamsFoes(a.key) || !a.id) { this._junk(ws); return; }
    const mode = await this._grantMode(now);
    if (mode === 'off') { this._send(ws, JSON.stringify({ t: 'grant', k: 'off', id: ask.id })); return; }
    const G = this._grantState(a.key, now);
    this._grantPrune(G, now);
    if (ask.k === 'mint') return this._grantMintAsk(ws, a, ask, G, mode, now);
    if (ask.k === 'renew') return this._grantRenew(ws, a, ask, G, now);
    if (ask.k === 'free') return this._grantFree(a, ask, G);
    if (ask.k === 'carry') return this._grantCarry(ws, a, ask, G, now);
    if (ask.k === 'heir') return this._grantHeir(ws, a, ask, G, now);
    return this._grantTally(a, ask, G, now);
  }
  _grantHere(ws, a, id) {
    const p = a.pose;
    if (isWorldRoom(a.key) || (p && inCover(a, cellRoomOfWire(p.x, p.z)))) return true;
    this._send(ws, JSON.stringify({ t: 'grant', k: 'no', id, r: 'cell' }));
    return false;
  }
  async _grantMintAsk(ws, a, ask, G, mode, now) {
    if (!this._grantHere(ws, a, ask.id)) return;
    if (isWorldRoom(a.key) && GRANT_OPEN_KINDS.includes(ask.kind)) { this._send(ws, JSON.stringify({ t: 'grant', k: 'no', id: ask.id, r: 'kind' })); return; }
    const who = a.sub || a.id;
    const key = `${who}|${ask.kind}`;
    const gate = grantMintGate(ask.kind, ask.n, G.buckets.get(key), G.liveN, now);
    if (gate.bucket) G.buckets.set(key, gate.bucket);
    if (gate.refusal && mode === 'enforce') {
      this._grantFold(G, who, ask, gate.refusal, now);
      this._send(ws, JSON.stringify({ t: 'grant', k: 'no', id: ask.id, r: gate.refusal, gm: mode }));
      return;
    }
    const gr = await this._grantMint(G, a, ask, now);
    staffReactAsk(this, ws, a, gr, now);
    this._grantFold(G, who, ask, gate.refusal, now);
    this._send(ws, JSON.stringify({ t: 'grant', k: 'ok', id: ask.id, gr, gm: mode }));
  }
  async _grantMint(G, a, ask, now) {
    const px = isWorldRoom(a.key) ? [0, 0] : mapPixelOfWire(a.pose.x, a.pose.z);
    const l = Number.isSafeInteger(a.cl) ? a.cl : 0, r = renownIssuable(a.lv) ? a.lv : 0;
    const s = rand32(), k = grantKindRolled(ask.kind, relayCfgValue(this._relayCfg, this.env, 'grantRoll') === 'on');
    (G.askers ??= new Set()).add(a.id);
    const gr = { g: this._grantNext(G), o: a.id, q: a.key, a: a.sub ?? '', k, p: [px[0], px[1]], m: Math.floor(sharedClassicMinutes(now)), l, r, n: ask.n, s, ...grantMarksFor(k, s, ask.n, r), h: -1, x: now + GRANT_TTL_MS };
    return this._grantSign(G, gr, ask.n);
  }
  _grantNext(G) { G.n = G.n >= 0x7fffffff ? 0 : G.n + 1; return G.n; }
  async _grantSign(G, gr, n) {
    const sg = await signGrant(gr, await this._receiptKeyOf(), { subtle: crypto.subtle });
    const out = sg ? { ...gr, sg } : gr;
    const was = G.live.get(gr.g);
    if (was) G.liveN -= was.n;
    G.live.set(gr.g, { n, x: gr.x, gr, ...(was?.handed ? { handed: was.handed } : {}) });
    G.liveN += n;
    return out;
  }
  async _grantRenew(ws, a, ask, G, now) {
    const grs = [];
    let key;
    for (const gr of ask.grs) {
      const live = G.live.get(gr.g);
      if (live) { if (live.gr.o === a.id) grs.push(await this._grantSign(G, grantRenewed(live.gr, now), live.n)); continue; }
      key ??= await this._receiptKeyOf();
      if (gr.o === a.id && gr.a === (a.sub ?? '') && inCover(a, gr.q) && now <= gr.x && await grantSignedHere(gr, key, { subtle: crypto.subtle })) grs.push(await this._grantSign(G, grantRenewed(gr, now), gr.h >= 0 ? 0 : gr.n));
    }
    this._send(ws, JSON.stringify({ t: 'grant', k: 'renew', id: ask.id, grs }));
  }
  _grantFree(a, ask, G) {
    for (const g of ask.gs) {
      const live = G.live.get(g);
      if (!live || live.gr.o !== a.id) continue;
      G.live.delete(g);
      G.liveN -= live.n;
    }
  }
  async _grantCarry(ws, a, ask, G, now) {
    if (!this._grantHere(ws, a, ask.id)) return;
    const key = await this._receiptKeyOf(), env = { subtle: crypto.subtle };
    const grs = [];
    for (const gr of ask.grs) {
      const ok = isCellRoom(a.key) && isCellRoom(gr.q) && gr.o === a.id && gr.a === (a.sub ?? '') && !inCover(a, gr.q) && now <= gr.x && await grantSignedHere(gr, key, env);
      grs.push(ok ? await this._grantSign(G, grantCarried(gr, a.key, this._grantNext(G), now), gr.h >= 0 ? 0 : gr.n) : null);
    }
    this._send(ws, JSON.stringify({ t: 'grant', k: 'carry', id: ask.id, grs }));
  }
  async _grantHeir(ws, a, ask, G, now) {
    const key = await this._receiptKeyOf(), env = { subtle: crypto.subtle };
    let refused = false;
    for (const { gr, i, to } of ask.hs) {
      const heir = [...this._all()].find(([, b]) => b.id === to)?.[0] ?? null;
      const live = G.live.get(gr.g);
      const ok = !!heir && !!live && live.gr.o === a.id && gr.o === a.id && inCover(a, gr.q) && now <= gr.x && !live.handed?.has(i) && await grantSignedHere(gr, key, env);
      if (!ok) { refused = true; continue; }
      (live.handed ??= new Set()).add(i);
      const out = await this._grantSign(G, grantHanded(gr, i, to, this._grantNext(G), now), 0);
      this._send(heir, JSON.stringify({ t: 'grant', k: 'heir', id: ask.id, gr: out }));
    }
    if (refused) this._send(ws, JSON.stringify({ t: 'grant', k: 'no', id: ask.id, r: 'sender' }));
  }
  _grantTally(a, ask, G, now) {
    const last = G.tallied.get(a.id) ?? -Infinity;
    if (now - last < GRANT_TALLY_MS - GRANT_SKEW_MS) return;
    G.tallied.set(a.id, now);
    const reader = a.sub || a.id;
    const subs = new Map([...this._all()].filter(([, b]) => b.id).map(([, b]) => [b.id, b.sub || b.id]));
    let folded = false;
    for (const row of ask.rows) {
      const sender = subs.get(row.o);
      if (!sender || sender === reader) continue;
      this._grantFrom(G, now);
      folded = true;
      if (foldGrantTally(G.w, reader, sender, row.r, row.n)) { void this._grantFlush(); folded = false; }
    }
    if (folded) this._grantDue(G, now);
  }
  _grantFold(G, who, ask, refusal, now) {
    this._grantFrom(G, now);
    const full = foldGrantAsk(G.w, who, ask.kind, ask.n, refusal, G.liveN);
    if (full) void this._grantFlush();
    else this._grantDue(G, now);
  }
  _grantDue(G, now) {
    if ((G.w.rows.size || G.w.tallies.size) && now - G.w.from >= GRANT_MEASURE_MS) void this._grantFlush();
  }
  _grantFrom(G, now) { if (!G.w.rows.size && !G.w.tallies.size) G.w.from = now; }
  async _grantFlush() {
    const G = this._grants;
    if (!G) return false;
    if (G.timer) { clearTimeout(G.timer); G.timer = null; }
    const now = Date.now();
    const w = G.w;
    G.w = newGrantMeasure(now);
    const url = this.env?.GRANT_FEED_URL;
    if (typeof url !== 'string' || !url.startsWith('https://')) return false;
    try {
      const id = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');
      const batch = grantMeasureBatch(w, id, G.q, now);
      const sealed = batch && await sealGrantMeasure(batch, await this._receiptKeyOf(), { subtle: crypto.subtle });
      if (!sealed) return false;
      const init = { method: 'POST', headers: { 'content-type': 'application/json', [GRANT_MEASURE_SIG_HEADER]: sealed.sig }, body: sealed.body, signal: AbortSignal.timeout(GRANT_MEASURE_POST_MS) };
      const svc = this.env?.ACCOUNTS;
      const res = typeof svc?.fetch === 'function' ? await svc.fetch(new Request(url, init)) : await fetch(url, init);
      if (!res.ok) console.warn('[grant] the service said', res.status);
      return res.ok;
    } catch (e) { console.warn('[grant] post failed', e?.message ?? e); return false; }
  }
}
