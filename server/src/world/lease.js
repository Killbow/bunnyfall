// The hello doors of a room: ground, grant, loot, and lease, each with its own refusal.
// It asks the hub whether a door is on, waits for the lease answer, and meters lease frames.
import { groundRoom, GROUND_LAW, CLOSE_POLICY, GROUND_OLD_REASON, GRANT_OLD_REASON, LOOT_OLD_REASON, CELL_OLD_REASON, isSocialRoom, streamsFoes, GRANT_HELLO_LAW, lootRoom, LOOT_HELLO_LAW } from '../relay.js';
import { relayCfgValue } from '../../../src/net/relayCfg.js';
import { GROUND_OLD_WORDS } from '../room/constants.js';
import { LEASE_OLD_REASON, leaseRoom, leaseKeyOf, LEASE_FRAME_MIN_MS, mintLease, readLease } from '../../../src/net/roomLease.js';
import { cellDoorShut } from '../cellMoves.js';
import { LEASE_OLD_ASK_MS } from './leaseAsk.js';
import { isChannelShard } from '../../../src/net/hubShards.js';
import { frozenAt, freezeMoved } from '../staffFreeze.js';

export class LeasePart {
  async _groundRefusal(key, m, now) {
    if (!groundRoom(key) || m.gl >= GROUND_LAW) return false;
    // A cold room awaits its first settings answer, so no old build gets in on the env var default;
    // later asks run unawaited.
    if (this._relayCfgAt === -Infinity) await this._relayCfgFresh(now);
    else void this._relayCfgFresh(now);
    return relayCfgValue(await this._relayCfgOf(), this.env, 'groundGate') === 'on';
  }
  async _doorRefused(ws, key, m, now) {
    if (await this._groundRefusal(key, m, now)) { this._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, GROUND_OLD_REASON); return true; }
    if (await this._grantDoorRefusal(key, m, now)) { this._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, GRANT_OLD_REASON); return true; }
    if (await this._lootDoorRefusal(key, m, now)) { this._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, LOOT_OLD_REASON); return true; }
    if (await this._leaseDoorRefusal(key, m, now)) { this._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, LEASE_OLD_REASON); return true; }
    if (cellDoorShut(this, ws, m)) { this._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, CELL_OLD_REASON); return true; }
    return false;
  }
  async _leaseDoorRefusal(key, m, now) {
    if (!leaseRoom(key) || m.ls === 1) return false;
    return this._leaseDoorOn(now);
  }
  async _leaseDoorOn(now, ask = true) {
    const cfg = await this._relayCfgOf();
    if (ask) void this._relayCfgFresh(now);
    return relayCfgValue(cfg, this.env, 'leaseDoor') === 'on';
  }
  async _leaseHeard(ws, a) {
    if (ws.virtual) return a;
    const meter = this._meterOf(ws);
    // Wait behind this socket's earlier door (`dq`) so frames are heard in the order sent;
    // the socket may close or be replaced during each wait.
    while (meter.dq) { await meter.dq.catch(() => null); if (!(a = this._pastWait(ws))) return null; }
    if (a.ld != null && !(a.ld * 1000 >= Date.now())) { await meter.lp; a = this._attach(ws); }
    const now = Date.now();
    if (a.ld != null ? a.ld * 1000 >= now : !a.id || !leaseRoom(a.key ?? this._busKey)) return a;
    const door = meter.dq = this._leaseDoor(ws, a.ld != null, now);
    try { return await door; } finally { if (meter.dq === door) meter.dq = null; }
  }
  async _leaseDoor(ws, bound, now) {
    if (bound) await (this._relayCfgAt === -Infinity ? this._relayCfgFresh(now) : this._relayCfgP);
    const on = await this._leaseDoorOn(now, bound || now - this._relayCfgAt >= LEASE_OLD_ASK_MS);
    const a = this._pastWait(ws);
    if (!a) return null;
    if (!on || a.ld * 1000 >= Date.now()) return a;
    // A bound socket without a live lease is ignored, not closed: a reconnect would be ignored too.
    // An unbound socket in a lease room is refused as its hello would be.
    if (a.ld == null) this._refuse(ws, GROUND_OLD_WORDS, CLOSE_POLICY, LEASE_OLD_REASON);
    return null;
  }
  _pastWait(ws) {
    const a = this._dead.has(ws) || this._gone.has(ws) ? null : this._attach(ws);
    return a?.replaced ? null : a;
  }
  async _leaseKeyOf() {
    if (this._leaseKey === undefined) this._leaseKey = await leaseKeyOf(this.env?.GATE_SIGNING_KEY, { subtle: crypto.subtle });
    return this._leaseKey;
  }
  async _leaseFrame(ws, a, m, message) {
    const now = Date.now();
    const meter = this._meterOf(ws);
    if (now - (meter.lq ?? -Infinity) < LEASE_FRAME_MIN_MS) return;
    meter.lq = now;
    let read = () => {};
    // `_leaseHeard` awaits `lp`, so a frame right behind this lease is judged after it is read.
    meter.lp = new Promise((ok) => { read = ok; });
    try { await this._leaseRead(ws, a, m, message, now); } finally { read(); }
  }
  async _leaseRead(ws, a, m, message, now) {
    const key = await this._leaseKeyOf();
    if (!key || typeof a.sub !== 'string' || !a.sub) return;
    const room = a.key ?? this._busKey;
    const nowS = Math.floor(now / 1000);
    if (m.l === undefined) {
      if (!isSocialRoom(room)) return;
      if (a.vid && isChannelShard(room) && !this._upRetry) { this._hubForward(ws, a, message); return; }
      const l = await mintLease({ s: a.sub, mu: a.mu ?? 0, fz: frozenAt(a, nowS) ? a.fz : 0, at: nowS, p: a.vid && isChannelShard(room) ? 1 : 0 }, key, { subtle: crypto.subtle });
      if (l) this._send(ws, JSON.stringify({ t: 'lease', l }));
      return;
    }
    if (!leaseRoom(room)) return;
    const r = await readLease(m.l, key, { subtle: crypto.subtle, nowS });
    const b = this._pastWait(ws);
    if (!r || !b || r.s !== b.sub) return;
    const law = !r.p && r.at > (b.lt ?? b.gio ?? 0);
    const next = { ...b, ld: Math.max(b.ld ?? 0, r.u), ...(law ? { lt: r.at, mu: r.mu, fz: r.fz } : r.fz > (b.fz ?? 0) ? { fz: r.fz } : {}) };
    if (!this._setAttach(ws, next)) return;
    freezeMoved(this, b, next);
    if (b.vid && isChannelShard(room) && ((b.mu ?? 0) !== (next.mu ?? 0) || (b.fz ?? 0) !== (next.fz ?? 0))) this._hubForward(ws, next, message);
  }
  async _grantDoorRefusal(key, m, now) {
    if (!streamsFoes(key) || m.gv >= GRANT_HELLO_LAW) return false;
    if (this._relayCfgAt === -Infinity) await this._relayCfgFresh(now);
    else void this._relayCfgFresh(now);
    return relayCfgValue(await this._relayCfgOf(), this.env, 'grantDoor') === 'on';
  }
  async _lootDoorRefusal(key, m, now) {
    if (!lootRoom(key) || m.ll >= LOOT_HELLO_LAW) return false;
    if (this._relayCfgAt === -Infinity) await this._relayCfgFresh(now);
    else void this._relayCfgFresh(now);
    return relayCfgValue(await this._relayCfgOf(), this.env, 'lootDoor') === 'on';
  }
}
