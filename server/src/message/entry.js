// A socket's frame entry, the window's metrics point, and the hello's name: the signed token
// checked against the configured identity key, loaded once.
import { staffNetFrame } from '../staffFeeds.js';
import { RELAY_VERSION, REALM_DOOR_WORD } from '../relay.js';
import { cellLevelOf } from '../cellNodes.js';
import { cellTell } from '../cellMoves.js';
import { MAX_TTL_S, verifyToken, importPublicKeyB64 } from '../../../src/net/identityToken.js';
import { SPENT_MAX } from '../room/holds.js';

export class EntryPart {
  async webSocketMessage(ws, message) {
    this._metrics.c.frames++; this._metrics.c.bytesIn += typeof message === 'string' ? message.length : (message?.byteLength ?? 0);
    staffNetFrame(this, ws, message, Date.now());
    try { await this._message(ws, message); } finally { await this._reap(); this._metricsTick(); }
  }
  _metricsTick(force = false) {
    const n = this._idx?.size ?? 0;
    if (n > this._metrics.c.peak) this._metrics.c.peak = n;
    try { this._metrics.flush(this.env?.METRICS, this._kind ?? 'none', this._idx?.size ?? 0, RELAY_VERSION, Date.now(), force, cellLevelOf(this)); } catch {  }
    cellTell(this, Date.now());
  }
  async _named(m, now) {
    if (!m.tok) return { error: 'sign in to play online' };
    await this._loadKey();
    if (!this._verifyKey) return { error: 'sign-ins cannot be checked right now' };
    const nowS = Math.floor(now / 1000);
    const configured = Number(this.env.IDENTITY_MAX_TTL_S);
    const maxTtlS = Number.isSafeInteger(configured) && configured > 0
      ? Math.min(configured, MAX_TTL_S) : MAX_TTL_S;
    const r = await verifyToken(m.tok, this._verifyKey, { subtle: crypto.subtle, nowS, maxTtlS });
    if (!r.ok) return { error: `token ${r.why}` };
    if (r.claims.rc === 0) return { error: REALM_DOOR_WORD };
    const sig = m.tok.slice(m.tok.lastIndexOf('.') + 1);
    for (const [k, until] of this._spent) { if (until > nowS) break; this._spent.delete(k); }
    if (this._spent.has(sig)) return { error: 'token spent' };
    if (this._spent.size >= SPENT_MAX) this._spent.delete(this._spent.keys().next().value);
    this._spent.set(sig, r.claims.e);
    const order = this._orders.get(r.claims.s);
    const mu = order && order.i > r.claims.i ? order.mu : (r.claims.mu ?? 0);
    const lt = order && order.i > r.claims.i ? order.i : r.claims.i;
    const c = r.claims;
    // Load guild removals from storage before judging the token's guild; after a wake the in-memory
    // set is empty.
    if (c.gi) await this._loadGuildOuts(nowS);
    const guild = c.gi && !this._guildOutAfter(c.gi, c.gm, c.i) ? { gi: c.gi, gt: c.gt, gm: c.gm } : {};
    const house = c.hn ? { hn: c.hn, ...(c.hc ? { hc: c.hc } : {}), ...(c.hb ? { hb: c.hb } : {}), ...(c.hg ? { hg: c.hg } : {}) } : {};
    if (c.fo) house.fo = c.fo;
    if (c.hd === 1) this._hidHellos.add(m);
    return { name: c.n, kind: c.k, subject: c.s, title: c.t, ts: c.ts, glyphs: c.g, gx: c.gx, au: c.au, pi: c.pi, rb: c.rb, mu, lt, lv: c.lv, ...guild, gio: c.i, ar: c.ar, cl: c.cl, ...house, ci: c.ci, wa: c.wa, ...(c.vn === 1 ? { vn: 1 } : {}) };
  }
  async _loadKey() {
    if (this._verifyKey === undefined) {
      const raw = this.env.IDENTITY_PUBLIC_KEY;
      this._verifyKey = null;
      if (typeof raw === 'string' && raw) {
        try { this._verifyKey = await importPublicKeyB64(raw, { subtle: crypto.subtle }); }
        catch (e) { console.warn('[room] IDENTITY_PUBLIC_KEY will not import', e?.message ?? e); }
      }
    }
  }
}
