// Who hosts a room: the host walk, who leads, a seat gone quiet, and the host frame the room says.
import { seatBarred } from '../staffFreeze.js';
import { seatOf, seatStreams, seatHeardAt, seatTraffic, seatSilent, othersInOf, seatElder, seatInAt } from '../../../src/net/seatLive.js';
import { FOES_STALE_MS } from '../relay.js';

export class SeatsPart {
  _hostOf(except = null) {
    this._all();
    if (this._hostMemo === undefined || this._seatStale(this._hostMemo)) this._hostMemo = this._hostWalk(null);
    const host = this._hostMemo;
    if (except == null || host == null) return host;
    if (this._all().get(except)?.id !== host) return host;
    return this._hostWalk(except);
  }
  _hostWalk(except, live = true) {
    const list = [];
    for (const [ws, a] of this._all()) if (ws !== except && a.id && !a.hid && !seatBarred(a)) list.push(a);
    return seatOf(list, Date.now(), { live: live && seatStreams(list[0]?.key) });
  }
  _leads(a, except = null) {
    if (a.hid || seatBarred(a)) return false;
    const list = [a];
    for (const [ws, b] of this._all()) if (ws !== except && b.id && !b.hid && b !== a && !seatBarred(b)) list.push(b);
    return seatOf(list, Date.now(), { live: seatStreams(a.key) }) === a.id;
  }
  _leaveMovesSeat(a, ws) {
    return this._leads(a, ws) || (seatStreams(a.key) && a.id != null && a.id === this._seatSaid);
  }
  _seatStale(id) {
    if (id == null) return false;
    const now = Date.now();
    let any = false;
    for (const ws of this._byId().get(id) ?? []) { const a = this._all().get(ws); if (!a || !seatStreams(a.key)) return false; any = true; if (now - seatHeardAt(a) <= FOES_STALE_MS) return false; }
    return any;
  }
  _seatHeard(ws, a, message, now = Date.now()) {
    if (!a || !seatStreams(a.key)) return a;
    let back = false;
    if (seatTraffic(message)) {
      if (a.id && now - seatHeardAt(a) > FOES_STALE_MS) {
        const list = [];
        for (const [, b] of this._all()) if (b.id && !b.hid) list.push(b);
        back = seatSilent(a, othersInOf(list)(this._all().get(ws) ?? a), now);
      }
      const since = back ? this._seatAfter(a, now) : a.since;
      const at = { ...a, hd: now, ...(a.id ? {} : { hi: now }), ...(since !== a.since ? { since } : {}) };
      if (this._setAttach(ws, at, since === a.since && !!a.id)) a = at;
    }
    if (this._seatSaid === undefined) this._seatSaid = this._hostWalk(null, false);
    const host = this._hostOf();
    let said = false;
    if (host !== this._seatSaid) { if (this._seatSaid != null && this._byId().has(this._seatSaid)) { this._sayHost(); said = true; } else this._seatSaid = host; }
    if (back && host && !said) this._send(ws, JSON.stringify({ t: 'host', id: host }));
    return a;
  }
  _seatAfter(a, now) {
    const seat = this._hostOf();
    let sa = null;
    for (const w of seat && seat !== a.id ? this._byId().get(seat) ?? [] : []) { sa = this._all().get(w) ?? null; if (sa) break; }
    return sa && seatElder(a, sa) ? Math.max(now, (sa.since ?? 0) + 1) : (a.since ?? now);
  }
  _seatKeep(replaced, now) {
    if (!replaced) return now;
    if (!seatStreams(replaced.key)) return replaced.since ?? now;
    let othersIn = null;
    for (const [, b] of this._all()) if (b.id && !b.hid && b !== replaced) { const t = seatInAt(b); if (othersIn == null || t < othersIn) othersIn = t; }
    return seatSilent(replaced, othersIn, now) ? this._seatAfter(replaced, now) : (replaced.since ?? now);
  }
  _sayHost({ skip = null, except = null } = {}) {
    const host = this._hostOf(except);
    this._seatSaid = host;
    if (!host) return;
    const out = JSON.stringify({ t: 'host', id: host });
    for (const [other, b] of [...this._all()]) if (other !== skip && b.id) this._send(other, out);
  }
}
